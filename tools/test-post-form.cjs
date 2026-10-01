/**
 * Test cho requirement 7 (form tạo bài viết) và 8 (lưu bài viết bằng LocalStorage).
 *
 * Trang: src/pages/feed.html + src/js/feed.js
 *
 * Kiểm tra:
 * - validate: title, content, author
 * - submit: preventDefault, tạo id duy nhất, lưu thời gian, khởi tạo like/comment, lưu LocalStorage
 * - KHÔNG ghi vào data/posts.json (file phải giữ nguyên)
 * - Feed load hiện cả bài trong posts.json lẫn bài người dùng tạo, không duplicate
 * - tạo xong mở detail, like/comment bài mới
 *
 * Chạy: node tools/test-post-form.cjs
 */
const fs = require('fs');
const path = require('path');
const { loadPage, fire, ROOT } = require('./mini-dom.cjs');

const FEED_PAGE = 'src/pages/feed.html';
const DETAIL_PAGE = 'src/pages/post-detail.html';
const POSTS_FILE = path.join(ROOT, 'src/data/posts.json');
const KEY_POSTS = 'aov_posts';
const KEY_LIKES = 'aov_likes';
const KEY_COMMENTS = 'aov_comments';

let total = 0;
let pass = 0;
const failures = [];

function check(name, condition, detail) {
    total++;
    if (condition) {
        pass++;
        console.log(`  PASS  ${name}`);
        return true;
    }
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `: ${detail}` : ''}`);
    return false;
}

function section(title) {
    console.log(`\n--- ${title} ---`);
}

async function openFeed(storage, login) {
    const page = loadPage({ page: FEED_PAGE, storage, login });
    page.run();
    await page.settled();
    return page;
}

async function openDetail(storage, id, login) {
    const page = loadPage({ page: DETAIL_PAGE, search: `?id=${id}`, storage, login });
    page.run();
    await page.settled();
    return page;
}

function postsOf(feedPage) {
    const raw = feedPage.readKey(KEY_POSTS);
    return Array.isArray(raw) ? raw : [];
}

function formOf(feedPage) {
    return feedPage.el('feed-form').querySelector('#post-form');
}

/** Điền form và bấm nút Đăng bài (trả về true nếu submit không bị chặn). */
function submitPost(feedPage, title, content, heroValue = '') {
    const form = formOf(feedPage);
    if (!form) return false;

    form.querySelector('#post-title').value = title;
    form.querySelector('#post-content').value = content;
    form.querySelector('#post-hero').value = heroValue;

    fire(form, 'submit', feedPage.doc);
    return true;
}

function errorListOf(feedPage) {
    const box = formOf(feedPage).querySelector('#post-errors');
    const html = box.innerHTML;
    return [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
}

function cardIdsInHtml(html) {
    return [...html.matchAll(/data-post-id="([^"]+)"/g)].map((m) => m[1]);
}

(async () => {
    console.log('Test form đăng bài viết (requirement 7 + 8)');

    const jsonBefore = fs.readFileSync(POSTS_FILE, 'utf8');
    const jsonPosts = JSON.parse(jsonBefore);

    /* ---------------- Validation ---------------- */
    section('1. Validation');

    const guest = await openFeed(new Map(), null);
    check('khách chưa đăng nhập không thấy form đăng bài', !formOf(guest), 'vẫn thấy form');
    check('khách được nhắc đăng nhập', guest.el('feed-form').innerHTML.includes('Bạn cần đăng nhập'), 'thiếu nhắc');

    const store = new Map();
    const feed = await openFeed(store, 'player1');
    check('đã đăng nhập thì thấy form có title + content',
        Boolean(formOf(feed)) && Boolean(formOf(feed).querySelector('#post-title'))
        && Boolean(formOf(feed).querySelector('#post-content')),
        'thiếu ô nhập');

    const beforeCount = postsOf(feed).length;

    submitPost(feed, '', 'Nội dung đủ dài để không lỗi nội dung');
    check('title rỗng -> báo lỗi', errorListOf(feed).some((e) => e.includes('Tiêu đề')), JSON.stringify(errorListOf(feed)));

    submitPost(feed, 'Tiêu đề hợp lệ', '   ');
    check('content rỗng -> báo lỗi', errorListOf(feed).some((e) => e.includes('Nội dung')), JSON.stringify(errorListOf(feed)));

    submitPost(feed, 'AB', 'Nội dung đủ dài để không lỗi nội dung');
    check('title quá ngắn -> báo lỗi', errorListOf(feed).some((e) => e.includes('ít nhất')), JSON.stringify(errorListOf(feed)));

    check('dữ liệu sai thì không tạo bài nào', postsOf(feed).length === beforeCount,
        `${postsOf(feed).length} != ${beforeCount}`);

    // author không hợp lệ: tài khoản bị xoá khỏi aov_users nhưng session còn
    // (sửa trong lúc trang đang mở, vì mini-dom tự đăng ký tài khoản lúc nạp trang)
    const orphanStore = new Map(feed.storage);
    const orphan = await openFeed(orphanStore, 'player1');
    orphan.runInPage(`
        var kept = JSON.parse(localStorage.getItem('aov_users'))
            .filter(function (user) { return user.username !== 'player1'; });
        localStorage.setItem('aov_users', JSON.stringify(kept));
        true;
    `);
    const orphanPostsBefore = orphan.storage.get(KEY_POSTS);
    submitPost(orphan, 'Tiêu đề hợp lệ', 'Nội dung đủ dài để không lỗi nội dung');
    check('author không còn trong aov_users -> báo lỗi',
        errorListOf(orphan).some((e) => e.includes('Tài khoản')), JSON.stringify(errorListOf(orphan)));
    check('author không hợp lệ thì không tạo bài', orphan.storage.get(KEY_POSTS) === orphanPostsBefore, 'đã ghi bài');

    /* ---------------- Tạo bài hợp lệ ---------------- */
    section('2. Tạo bài viết hợp lệ');

    const idsBefore = postsOf(feed).map((p) => String(p.id));
    submitPost(feed, 'Bài viết kiểm thử requirement 7', 'Nội dung bài viết do người dùng tự đăng trong bài kiểm thử.');
    const posts = postsOf(feed);
    const created = posts[0];

    check('bài mới lưu vào aov_posts', Boolean(created), 'không có bài mới');
    check('bài mới lên đầu danh sách', created && created.title === 'Bài viết kiểm thử requirement 7',
        created ? created.title : 'null');
    check('lỗi được xoá sau khi đăng thành công', errorListOf(feed).length === 0, JSON.stringify(errorListOf(feed)));
    check('báo đã đăng bài thành công',
        formOf(feed).querySelector('#post-errors').innerHTML.includes('Đã đăng bài'),
        formOf(feed).querySelector('#post-errors').innerHTML);
    check('có link mở trang chi tiết bài vừa đăng',
        formOf(feed).querySelector('#post-errors').innerHTML.includes('post-detail.html?id='),
        'thiếu link');

    check('author lấy từ session', created && created.author === 'player1', created ? created.author : 'null');
    check('title được trim', created && created.title === created.title.trim(), created ? created.title : 'null');
    check('lưu thời gian tạo ở dạng ISO',
        created && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(created.createdAt), created ? created.createdAt : 'null');
    check('id là duy nhất, không trùng bài cũ',
        created && !idsBefore.includes(String(created.id)) && created.id !== null,
        created ? String(created.id) : 'null');

    check('khởi tạo lượt thích rỗng cho bài mới',
        Array.isArray(JSON.parse(feed.storage.get(KEY_LIKES))[String(created.id)])
        && JSON.parse(feed.storage.get(KEY_LIKES))[String(created.id)].length === 0,
        JSON.stringify(JSON.parse(feed.storage.get(KEY_LIKES))[String(created.id)]));
    check('bài mới chưa có bình luận nào',
        JSON.parse(feed.storage.get(KEY_COMMENTS) || '[]')
            .filter((c) => String(c.postId) === String(created.id)).length === 0,
        'có bình luận rác');

    /* ---------------- Không đụng posts.json ---------------- */
    section('3. posts.json là dữ liệu tĩnh, không bị ghi thêm');

    check('file posts.json không thay đổi trên đĩa',
        fs.readFileSync(POSTS_FILE, 'utf8') === jsonBefore, 'file đã bị đổi');
    check('posts.json vẫn đúng số bài gốc',
        JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')).length === jsonPosts.length,
        JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')).length);
    check('id trong posts.json không có bài của user',
        !jsonPosts.some((p) => String(p.id) === String(created.id)), 'bài của user lọt vào JSON');
    check('bài của user chỉ nằm trong LocalStorage',
        !fs.readFileSync(POSTS_FILE, 'utf8').includes('requirement 7'), 'JSON chứa tiêu đề bài mới');

    /* ---------------- Feed load: đủ cả hai nguồn, không duplicate ---------------- */
    section('4. Feed load hiện cả bài JSON và bài LocalStorage');

    const reloaded = await openFeed(new Map(feed.storage), 'player1');
    const cardIds = cardIdsInHtml(reloaded.el('feed-list').innerHTML);

    check('Feed hiện bài trong posts.json',
        jsonPosts.every((p) => cardIds.includes(String(p.id))), cardIds.join(','));
    check('Feed hiện bài người dùng tạo trong LocalStorage',
        cardIds.includes(String(created.id)), cardIds.join(','));
    check('không trùng id trên Feed', new Set(cardIds).size === cardIds.length, cardIds.join(','));
    check('tổng số bài = JSON + 1 bài mới', cardIds.length === jsonPosts.length + 1, cardIds.length);
    check('reload nhiều lần vẫn không nhân bản bài',
        cardIdsInHtml((await openFeed(new Map(reloaded.storage), 'player1')).el('feed-list').innerHTML)
            .length === jsonPosts.length + 1,
        'bị nhân bản');

    /* ---------------- Mở detail + like/comment bài mới ---------------- */
    section('5. Mở detail và thích / bình luận bài vừa tạo');

    const detail = await openDetail(new Map(feed.storage), created.id, 'player1');
    const detailHtml = detail.el('post-detail').innerHTML;
    check('mở detail bài mới hiện đúng tiêu đề', detailHtml.includes('Bài viết kiểm thử requirement 7'), 'sai tiêu đề');
    check('detail hiện tác giả', /post-detail__author">👤\s*player1/.test(detailHtml), 'thiếu tác giả');
    check('detail hiện nội dung', detailHtml.includes('Nội dung bài viết do người dùng tự đăng'), 'thiếu nội dung');
    check('detail hiện thời gian tạo', /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(detailHtml), 'thiếu thời gian');

    const likeBtn = detail.el('post-detail').querySelector('[data-post-like]');
    fire(likeBtn, 'click', detail.doc);
    await detail.settled();
    const likesAfter = JSON.parse(detail.storage.get(KEY_LIKES))[String(created.id)];
    check('like bài mới lưu vào aov_likes', likesAfter.includes('player1'), JSON.stringify(likesAfter));
    check('detail hiện số lượt thích sau khi thích',
        detail.el('post-detail').innerHTML.includes('♥ Thích (1)'), 'sai số lượt');

    const form = detail.el('post-detail').querySelector('[data-comment-form]');
    form.querySelector('input').value = 'Bình luận cho bài vừa tạo';
    fire(form, 'submit', detail.doc);
    await detail.settled();

    const comments = JSON.parse(detail.storage.get(KEY_COMMENTS));
    const own = comments.filter((c) => String(c.postId) === String(created.id));
    check('bình luận bài mới lưu vào aov_comments',
        own.length === 1 && own[0].content === 'Bình luận cho bài vừa tạo', JSON.stringify(comments));
    check('detail hiện bình luận vừa gửi',
        detail.el('post-detail').innerHTML.includes('Bình luận cho bài vừa tạo'), 'chưa hiện');

    const afterReload = await openDetail(new Map(detail.storage), created.id, 'player1');
    check('reload vẫn thấy lượt thích', afterReload.el('post-detail').innerHTML.includes('♥ Thích (1)'), 'mất like');
    check('reload vẫn thấy bình luận',
        afterReload.el('post-detail').innerHTML.includes('Bình luận cho bài vừa tạo'), 'mất bình luận');

    const feedBack = await openFeed(new Map(detail.storage), 'player1');
    check('Feed cũng hiện lượt thích của bài mới',
        /♥ Thích \(1\)/.test(feedBack.el('feed-list').innerHTML), 'Feed chưa đồng bộ');
    check('Feed cũng hiện bình luận của bài mới',
        feedBack.el('feed-list').innerHTML.includes('Bình luận cho bài vừa tạo'), 'Feed chưa đồng bộ');

    /* ---------------- ID duy nhất khi đăng liên tiếp ---------------- */
    section('6. Đăng nhiều bài liên tiếp -> id không trùng');

    submitPost(reloaded, 'Bài thứ hai trong ngày', 'Nội dung bài thứ hai để kiểm tra id duy nhất.');
    submitPost(reloaded, 'Bài thứ ba trong ngày', 'Nội dung bài thứ ba để kiểm tra id duy nhất.');
    const all = postsOf(reloaded);
    const allIds = all.map((p) => String(p.id));
    check('không có id trùng sau khi đăng 3 bài', new Set(allIds).size === allIds.length, allIds.join(','));
    check('thời gian tạo không bị trùng hoàn toàn',
        new Set(all.map((p) => p.createdAt)).size === all.length, 'createdAt bị trùng');
    check('3 bài mới nằm ở 3 vị trí đầu',
        ['Bài thứ ba trong ngày', 'Bài thứ hai trong ngày', 'Bài viết kiểm thử requirement 7']
            .every((title, index) => all[index] && all[index].title === title),
        all.slice(0, 3).map((p) => p.title).join(' | '));

    console.log(`\n${pass} test PASS, ${total - pass} test FAIL`);
    if (failures.length) {
        console.log('\n' + failures.map((name) => 'FAIL  ' + name).join('\n'));
        process.exitCode = 1;
    } else {
        process.exitCode = 0;
    }
})();