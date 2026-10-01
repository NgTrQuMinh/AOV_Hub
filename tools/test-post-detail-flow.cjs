/**
 * Kiểm tra liên trang: bài đăng ở Feed phải xem được ở trang chi tiết và ngược lại.
 * Chạy: node tools/test-post-detail-flow.cjs
 */
const { loadPage, fire } = require('./mini-dom.cjs');

const FEED_PAGE = 'src/pages/feed.html';
const DETAIL_PAGE = 'src/pages/post-detail.html';

let total = 0;
let pass = 0;
const failures = [];

function check(name, condition, detail) {
    total++;
    if (condition) {
        pass++;
        console.log(`  PASS  ${name}`);
        return;
    }
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `: ${detail}` : ''}`);
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

/** Link mở trang chi tiết được render trong card của Feed. */
function detailLinkOf(feedPage, postId) {
    const list = feedPage.el('feed-list');
    const card = list.querySelector(`[data-post-id="${postId}"]`);
    if (!card) return null;

    const link = card.querySelectorAll('a').find((node) => (node.getAttribute('href') || '').includes('post-detail.html'));
    return link ? link.getAttribute('href') : null;
}

function submitPostForm(feedPage, title, content) {
    const box = feedPage.el('feed-form');
    const titleEl = box.querySelector('#post-title');
    const contentEl = box.querySelector('#post-content');

    if (!titleEl || !contentEl) return false;

    titleEl.value = title;
    contentEl.value = content;
    fire(box.querySelector('#post-form'), 'submit', feedPage.doc);
    return true;
}

(async () => {
    console.log('Test luồng Feed -> trang chi tiết bài viết');

    console.log('\n1. Mở bài từ Feed bằng đúng id trên link');
    const store = new Map();
    const feed = await openFeed(store, 'player1');

    const link9001 = detailLinkOf(feed, '9001');
    check('card bài từ posts.json có link sang trang chi tiết',
        link9001 === '/src/pages/post-detail.html?id=9001', link9001);

    const detailFromLink = await openDetail(new Map(store), '9001', 'player1');
    check('bấm link ra đúng bài đang xem trong Feed',
        detailFromLink.el('post-detail').innerHTML.includes('Cách lên đồ'),
        detailFromLink.el('post-detail').innerHTML.slice(0, 80));

    console.log('\n2. Đăng bài mới ở Feed -> trang chi tiết đọc được ngay');
    check('gửi form đăng bài', submitPostForm(feed, 'Bài mới từ Flow', 'Nội dung bài mới đăng từ Feed để test luồng liên trang.'));
    await feed.settled();

    const posts = JSON.parse(feed.storage.get('aov_posts'));
    const created = posts[0];
    check('bài mới lên đầu danh sách', created.title === 'Bài mới từ Flow', created.title);

    const newLink = detailLinkOf(feed, String(created.id));
    check('bài mới cũng có link sang trang chi tiết',
        newLink === `/src/pages/post-detail.html?id=${created.id}`, newLink);

    const detailNew = await openDetail(new Map(feed.storage), created.id, 'player1');
    const newHtml = detailNew.el('post-detail').innerHTML;
    check('trang chi tiết đọc được bài vừa đăng (chỉ có trong LocalStorage)',
        newHtml.includes('Bài mới từ Flow') && newHtml.includes('Nội dung bài mới đăng'), 'not found');

    console.log('\n3. Thích ở trang chi tiết -> Feed thấy luôn');
    const detailPostId = '9001';
    const likeBtn = detailFromLink.el('post-detail').querySelector('[data-post-like]');
    fire(likeBtn, 'click', detailFromLink.doc);
    await detailFromLink.settled();

    const likes = JSON.parse(detailFromLink.storage.get('aov_likes') || '{}');
    check('aov_likes được ghi từ trang chi tiết',
        Array.isArray(likes[detailPostId]) && likes[detailPostId].includes('player1'),
        JSON.stringify(likes));

    const feedAgain = await openFeed(new Map(detailFromLink.storage), 'player1');
    const cardHtml = feedAgain.el('feed-list').innerHTML;
    const cardOnFeed = feedAgain.el('feed-list').querySelector(`[data-post-id="${detailPostId}"]`);
    const likeBtnOnFeed = cardOnFeed && cardOnFeed.querySelector('[data-post-like]');
    check('Feed hiển thị đúng số lượt thích đã lưu ở trang chi tiết',
        likeBtnOnFeed && /♥ Thích \(1\)/.test(cardHtml), 'chưa thấy "♥ Thích (1)" trong card Feed');
    check('Feed đánh dấu nút thích đang active',
        likeBtnOnFeed && likeBtnOnFeed.classList.contains('is-active'), 'is-active');
    check('card Feed chứa cùng số bình luận', /💬 0 bình luận/.test(cardHtml), 'comment count');

    console.log('\n4. Bình luận ở trang chi tiết -> Feed và reload đều thấy');
    const form = detailFromLink.el('post-detail').querySelector('[data-comment-form]');
    form.querySelector('input').value = 'Bình luận từ trang chi tiết';
    fire(form, 'submit', detailFromLink.doc);
    await detailFromLink.settled();

    const comments = JSON.parse(detailFromLink.storage.get('aov_comments') || '[]');
    check('aov_comments được ghi từ trang chi tiết với postId đúng',
        comments.length === 1 && String(comments[0].postId) === detailPostId, JSON.stringify(comments));

    const feedAfterComment = await openFeed(new Map(detailFromLink.storage), 'player1');
    check('Feed hiển thị bình luận vừa gửi ở trang chi tiết',
        feedAfterComment.el('feed-list').innerHTML.includes('Bình luận từ trang chi tiết'), 'missing');

    const reloadDetail = await openDetail(new Map(detailFromLink.storage), detailPostId, 'player1');
    check('reload trang chi tiết vẫn thấy bình luận',
        reloadDetail.el('post-detail').innerHTML.includes('Bình luận từ trang chi tiết'), 'missing');
    check('reload trang chi tiết vẫn thấy lượt thích',
        reloadDetail.el('post-detail').innerHTML.includes('♥ Thích (1)'), 'missing like');

    console.log('\n5. Xoá bài ở Feed -> trang chi tiết báo không tìm thấy');
    const feedBeforeDelete = await openFeed(new Map(feed.storage), 'player1');
    const cardOfOwnPost = feedBeforeDelete.el('feed-list').querySelector(`[data-post-id="${created.id}"]`);
    const deleteBtn = cardOfOwnPost && cardOfOwnPost.querySelector('[data-post-delete]');
    check('bài do người dùng đăng có nút xoá ở Feed', Boolean(deleteBtn), 'delete button');
    fire(deleteBtn, 'click', feedBeforeDelete.doc);
    await feedBeforeDelete.settled();

    const afterDelete = await openDetail(new Map(feedBeforeDelete.storage), created.id, 'player1');
    check('sau khi xoá, trang chi tiết báo không tìm thấy bài viết',
        afterDelete.el('post-detail').innerHTML.includes('Không tìm thấy bài viết'), 'still there');

    console.log(`\n${pass} test PASS, ${total - pass} test FAIL`);
    if (failures.length) {
        console.log('\n' + failures.map((name) => 'FAIL  ' + name).join('\n'));
        process.exitCode = 1;
    } else {
        process.exitCode = 0;
    }
})();