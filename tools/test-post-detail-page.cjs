/**
 * Test cho trang Chi tiết bài viết (src/pages/post-detail.html + src/js/feed.js).
 *
 * Yêu cầu kiểm thử:
 * - mở post từ Feed
 * - kiểm tra đúng ID
 * - like
 * - comment
 * - reload
 * - bài viết không tồn tại
 *
 * Chạy: node tools/test-post-detail-page.cjs
 */
const { loadPage, fire, unescapeHtml, ROOT } = require('./mini-dom.cjs');
const fs = require('fs');
const path = require('path');

const PAGE = 'src/pages/post-detail.html';
const POSTS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/posts.json'), 'utf8'));
const KEY_POSTS = 'aov_posts';
const KEY_COMMENTS = 'aov_comments';
const KEY_LIKES = 'aov_likes';

let total = 0;
let pass = 0;
const errors = [];

function check(name, condition, detail) {
    total++;
    if (condition) {
        pass++;
        return true;
    }

    errors.push(`FAIL  ${name}${detail !== undefined ? `: ${detail}` : ''}`);
    return false;
}

function section(title) {
    console.log(`\n--- ${title} ---`);
}

function readPostDetail(container) {
    if (!container || !container.innerHTML) return null;
    const html = container.innerHTML;

    const titleMatch = html.match(/<h1[^>]*class="post-detail__title">([\s\S]*?)<\/h1>/i);
    const authorMatch = html.match(/class="post-detail__author">([\s\S]*?)<\/span>/i);
    const contentMatch = html.match(/class="post-detail__content">([\s\S]*?)<\/div>/i);
    const likeMatch = html.match(/data-post-like[^>]*>\s*♥[^>]*\((\d+)\)/i);
    const commentCountMatch = html.match(/💬\s*(\d+)\s*bình luận/i);

    return {
        title: (titleMatch && titleMatch[1] ? unescapeHtml(titleMatch[1].replace(/<[^>]+>/g, '')) : '').trim(),
        author: (authorMatch && authorMatch[1] ? unescapeHtml(authorMatch[1].replace(/<[^>]+>/g, '').replace(/^👤\s*/, '')) : '').trim(),
        content: (contentMatch && contentMatch[1] ? unescapeHtml(contentMatch[1]) : ''),
        likeCount: likeMatch ? Number(likeMatch[1]) : 0,
        commentCount: commentCountMatch ? Number(commentCountMatch[1]) : 0,
        hasGuestNote: /Đăng nhập/i.test(html),
        hasCommentForm: /data-comment-form/i.test(html),
        html,
    };
}

async function openDetail(postId, options = {}) {
    const loaded = loadPage({ page: PAGE, search: `?id=${postId}`, storage: options.storage || new Map(), login: options.login });
    loaded.run();
    await loaded.settled();
    return loaded;
}

function likePost(detailPage, postId) {
    const container = detailPage.el('post-detail');
    if (!container) return false;
    const likeBtn = container.querySelector('[data-post-like]');
    if (!likeBtn) return false;
    fire(likeBtn, 'click', detailPage.doc);
    return true;
}

function addComment(detailPage, postId, text) {
    const container = detailPage.el('post-detail');
    if (!container) return false;
    const form = container.querySelector(`[data-comment-form="${postId}"]`) || container.querySelector('[data-comment-form]');
    if (!form) return false;
    const input = form.querySelector('input');
    if (!input) return false;
    input.value = text;
    fire(form, 'submit', detailPage.doc);
    return true;
}

function countComments(container) {
    if (!container || !container.innerHTML) return 0;
    const matches = container.innerHTML.match(/class="comment"/g);
    return matches ? matches.length : 0;
}

function readCommentsFromStorage(detailPage) {
    const raw = detailPage.readKey(KEY_COMMENTS);
    return Array.isArray(raw) ? raw : [];
}

function readLikes(detailPage, postId) {
    const likes = detailPage.readKey(KEY_LIKES) || {};
    return Array.isArray(likes[String(postId)]) ? likes[String(postId)] : [];
}

(async () => {
    console.log('Test trang chi tiết bài viết (post-detail.html)');

    // 1. Mở post từ Feed - kiểm tra đúng ID
    section('1. Mở post từ Feed, kiểm tra đúng ID');
    const target = POSTS_JSON[0];
    const store = new Map();
    let page = await openDetail(target.id, { storage: store, login: 'player1' });
    let detail = readPostDetail(page.el('post-detail'));
    check('render bài viết đúng theo ID', detail && detail.title === target.title && detail.author === target.author,
        detail ? `${detail.title}|${detail.author}` : 'null');
    check('render đúng nội dung bài viết', detail && detail.content === target.content,
        detail ? detail.content.slice(0, 40) : 'null');
    check('trang có breadcrumb trở về Feed', fs.readFileSync(path.join(ROOT, PAGE), 'utf8').includes('feed.html'),
        'breadcrumb');

    // 2. Like
    section('2. Like bài viết (dùng chung logic LocalStorage)');
    const likeBefore = readLikes(page, target.id);
    check('like thành công', likePost(page, target.id));
    await page.settled();
    detail = readPostDetail(page.el('post-detail'));
    const likeAfter = readLikes(page, target.id);
    check('lượt thích được ghi vào aov_likes',
        likeAfter.length === likeBefore.length + 1 && likeAfter.includes('player1'),
        JSON.stringify(likeAfter));
    check('nút thích hiển thị đúng số lượt và trạng thái đã thích',
        detail.likeCount === likeAfter.length && /aria-pressed="true"/.test(detail.html),
        `count=${detail.likeCount}`);

    // bỏ thích -> số lượt giảm, dữ liệu đồng bộ hai nơi
    check('bỏ thích thành công', likePost(page, target.id));
    await page.settled();
    detail = readPostDetail(page.el('post-detail'));
    const likeUndone = readLikes(page, target.id);
    check('bỏ thích xoá user khỏi aov_likes', !likeUndone.includes('player1'), JSON.stringify(likeUndone));
    check('bỏ thích cập nhật số lượt trên trang', detail.likeCount === likeUndone.length, `count=${detail.likeCount}`);

    // thích lại để trang chi tiết hiển thị trạng thái đang thích
    likePost(page, target.id);
    await page.settled();

    // khách chưa đăng nhập: xem được bài nhưng không có nút thích / ô bình luận
    section('2b. Khách chưa đăng nhập');
    const guestPage = await openDetail(target.id, { storage: new Map(store), login: null });
    const guestDetail = readPostDetail(guestPage.el('post-detail'));
    check('khách vẫn xem được bài viết', guestDetail.title === target.title, guestDetail.title);
    check('không có ô gửi bình luận khi chưa đăng nhập', !guestDetail.hasCommentForm, 'form');
    check('có nhắc đăng nhập để bình luận', guestDetail.hasGuestNote, 'guest note');
    check('bấm thích khi chưa đăng nhập thì báo lỗi, không lưu',
        (likePost(guestPage, target.id), guestPage.alerts.length === 1 && readLikes(guestPage, target.id).length === 0),
        JSON.stringify(guestPage.alerts));

    // 3. Comment
    section('3. Bình luận (dùng chung logic LocalStorage)');
    const commentText = 'Bình luận test trang chi tiết';
    check('gửi bình luận thành công', addComment(page, target.id, commentText));
    await page.settled();
    detail = readPostDetail(page.el('post-detail'));
    const commentsStorage = readCommentsFromStorage(page);
    check('bình luận lưu vào aov_comments với postId đúng',
        commentsStorage.some((c) => String(c.postId) === String(target.id) && c.content === commentText),
        JSON.stringify(commentsStorage));
    check('bình luận hiển thị trên trang', detail.commentCount === 1 && detail.html.includes('Bình luận test trang chi tiết'),
        `count=${detail.commentCount}`);
    check('bình luận ghi đúng tên người gửi',
        /<strong>player1<\/strong>/.test(detail.html), 'author');

    // bình luận rỗng phải bị chặn
    const before = readCommentsFromStorage(page).length;
    addComment(page, target.id, '   ');
    await page.settled();
    check('bình luận rỗng không được lưu', readCommentsFromStorage(page).length === before, 'blank');

    // 4. Reload
    section('4. Reload trang -> dữ liệu không mất');
    const likesBeforeReload = readLikes(page, target.id);
    const pageReload = await openDetail(target.id, { storage: new Map(page.storage), login: 'player1' });
    const detailReload = readPostDetail(pageReload.el('post-detail'));
    check('reload giữ được bài viết', detailReload.title === target.title, detailReload.title);
    check('reload giữ được bình luận', detailReload.commentCount === 1
        && detailReload.html.includes(commentText), `count=${detailReload.commentCount}`);
    check('reload giữ trạng thái đã thích',
        detailReload.likeCount === likesBeforeReload.length
        && JSON.stringify(readLikes(pageReload, target.id)) === JSON.stringify(likesBeforeReload)
        && /aria-pressed="true"/.test(detailReload.html),
        `like=${detailReload.likeCount}`);

    // 5. Bài viết do chính người dùng đăng ở Feed (chỉ có trong LocalStorage)
    section('5. Bài viết tạo từ LocalStorage');
    const newPost = { id: 1730000000001, author: 'player1', title: 'Bài của người dùng trong Feed', content: 'Nội dung bài này chỉ tồn tại trong LocalStorage, không có trong posts.json.', heroId: null, createdAt: '2025-04-01T08:00:00.000Z' };
    const storeWithNewPost = new Map(page.storage);
    storeWithNewPost.set(KEY_POSTS, JSON.stringify([...JSON.parse(storeWithNewPost.get(KEY_POSTS) || '[]'), newPost]));
    const ownPost = await openDetail(newPost.id, { storage: storeWithNewPost, login: 'player1' });
    const ownDetail = readPostDetail(ownPost.el('post-detail'));
    check('đọc được bài viết chỉ tồn tại trong LocalStorage',
        ownDetail.title === newPost.title && ownDetail.author === newPost.author && ownDetail.content === newPost.content,
        `${ownDetail.title}|${ownDetail.author}`);
    check('bài của chính mình hiện nút xoá', /data-post-delete="1730000000001"/.test(ownDetail.html), 'delete button');

    // bài trong posts.json nhưng đã bị xoá khỏi LocalStorage -> phải báo không tìm thấy
    const deletedStore = new Map(page.storage);
    const seeded = JSON.parse(deletedStore.get(KEY_POSTS) || '[]').filter((p) => String(p.id) !== String(target.id));
    deletedStore.set(KEY_POSTS, JSON.stringify(seeded));
    deletedStore.set('aov_posts_seeded', JSON.stringify([...(JSON.parse(deletedStore.get('aov_posts_seeded') || '[]') || []), String(target.id)]));
    const deleted = await openDetail(target.id, { storage: deletedStore, login: null });
    const deletedDetail = readPostDetail(deleted.el('post-detail'));
    check('bài đã xoá khỏi LocalStorage thì báo không tìm thấy',
        /Không tìm thấy bài viết/i.test(deletedDetail.html), 'deleted');

    // 6. Bài viết không tồn tại
    section('6. Bài viết không tồn tại');
    const notFound = await openDetail(999999);
    const notFoundDetail = readPostDetail(notFound.el('post-detail'));
    check('id không có trong dữ liệu -> thông báo phù hợp',
        /Không tìm thấy bài viết/i.test(notFoundDetail.html), 'not-found');
    check('thông báo có nút quay lại Feed',
        /href="\/src\/pages\/feed\.html"/.test(notFoundDetail.html), 'back link');

    const noId = await openDetail('');
    const noIdDetail = readPostDetail(noId.el('post-detail'));
    check('thiếu id trên URL -> thông báo yêu cầu đúng định dạng',
        /Thiếu mã bài viết/i.test(noIdDetail.html), 'missing id');

    console.log(`\n${pass} test PASS, ${total - pass} test FAIL`);
    if (errors.length) {
        console.log('\n' + errors.join('\n'));
        process.exitCode = 1;
    } else {
        process.exitCode = 0;
    }
})();
