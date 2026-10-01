/**
 * Requirement 9 - chức năng sửa bài viết (form đổ sẵn dữ liệu).
 *
 * Chạy trong mini-dom: dựng trang thật, nạp script thật, không mock logic.
 *
 * Lưu ý về mini-dom:
 * - innerHTML chỉ tồn tại ở node được gán innerHTML (node cha),
 *   nên kiểm tra chữ bằng innerHTML của container (#feed-form / #post-edit-form),
 *   không dùng innerHTML của chính thẻ <form> (luôn rỗng).
 * - matchesOne chỉ hiểu selector đơn giản, nên tránh selector ghép như button[type="submit"].
 */
const fs = require('fs');
const path = require('path');
const { loadPage, fire, ROOT } = require('./mini-dom.cjs');

const KEY_POSTS = 'aov_posts';
const KEY_LIKES = 'aov_likes';
const KEY_COMMENTS = 'aov_comments';

const TITLE_OLD = 'Bài gốc trước khi sửa';
const TITLE_NEW = 'Tiêu đề đã được sửa';
const CONTENT_OLD = 'Nội dung ban đầu của bài viết trong bài test requirement 9.';
const CONTENT_NEW = 'Nội dung mới sau khi tác giả sửa bài viết.';

let pass = 0;
let fail = 0;

function check(label, condition, detail) {
    if (condition) {
        pass += 1;
        console.log(`  PASS  ${label}`);
        return;
    }
    fail += 1;
    console.log(`  FAIL  ${label}${detail !== undefined ? ': ' + detail : ''}`);
}

async function openFeed(storage, login) {
    const page = loadPage({ page: 'src/pages/feed.html', storage, login });
    page.run();
    await page.settled();
    return page;
}

async function openDetail(storage, login, id) {
    const page = loadPage({
        page: 'src/pages/post-detail.html',
        storage,
        login,
        search: `?id=${encodeURIComponent(id)}`,
    });
    page.run();
    await page.settled();
    return page;
}

/**
 * fire() cần đúng node làm event.target và đúng document để chạy event delegation,
 * nên click phải bắn từ chính nút và truyền page.doc làm tham số cuối.
 */
function clickNode(page, node) {
    if (!node) throw new Error('clickNode: node không tồn tại');
    fire(node, 'click', page.doc);
}

function submitForm(page, form) {
    fire(form, 'submit', page.doc);
}

function fieldValue(form, id) {
    return form.querySelector(`#${id}`).value;
}

function cardOf(page, postId) {
    return page.el('feed-list').querySelector(`[data-post-id="${postId}"]`);
}

function postIn(storage, postId) {
    return JSON.parse(storage.get(KEY_POSTS)).find((p) => String(p.id) === String(postId)) || null;
}

(async () => {
    const jsonPosts = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/posts.json'), 'utf8'));
    const feed = await openFeed(new Map(), 'player1');

    // ============ A. Tạo post ============
    console.log('--- A. Tạo post ---');
    const createForm = feed.el('feed-form').querySelector('#post-form');
    createForm.querySelector('#post-title').value = TITLE_OLD;
    createForm.querySelector('#post-content').value = CONTENT_OLD;
    createForm.querySelector('#post-hero').value = 'yasuo';
    submitForm(feed, createForm);
    await feed.settled();

    const created = JSON.parse(feed.storage.get(KEY_POSTS))[0];
    check('A. tạo được post mới', !!created);
    check('A. post mới có id', created && created.id !== undefined && created.id !== null, String(created && created.id));
    check('A. post mới nằm đầu danh sách', created.title === TITLE_OLD, created.title);

    const postId = created.id;
    const createdAt = created.createdAt;

    // Thêm like + bình luận ngay trên trang Feed để chắc sửa bài không làm mất tương tác đã có.
    // Mỗi loadPage có storage riêng nên phải làm trên chính trang feed đang dùng.
    clickNode(feed, cardOf(feed, postId).querySelector('[data-post-like]'));
    await feed.settled();
    const commentForm = cardOf(feed, postId).querySelector('[data-comment-form]');
    commentForm.querySelector('input').value = 'Bình luận trước khi sửa bài';
    submitForm(feed, commentForm);
    await feed.settled();

    const likesBefore = (JSON.parse(feed.storage.get(KEY_LIKES) || '{}')[postId] || []).length;
    const commentsBefore = JSON.parse(feed.storage.get(KEY_COMMENTS) || '[]')
        .filter((c) => String(c.postId) === String(postId)).length;
    check('A. like và bình luận đã được ghi trước khi sửa', likesBefore > 0 && commentsBefore > 0,
        `like ${likesBefore}, bình luận ${commentsBefore}`);

    // ============ 1 & 8. Nút Sửa theo quyền ============
    console.log('\n--- 1 + 8. Nút Sửa chỉ hiện với tác giả ---');
    check('1. tác giả thấy nút Sửa trên bài của mình',
        !!cardOf(feed, postId).querySelector('[data-post-edit]'));

    const otherPost = jsonPosts.find((p) => p.author !== 'player1');
    check('8. bài của người khác không có nút Sửa',
        !cardOf(feed, otherPost.id).querySelector('[data-post-edit]'));

    // ============ 3. Mở form edit, điền sẵn dữ liệu ============
    console.log('\n--- 3 + 9. Click Sửa mở form điền sẵn dữ liệu ---');
    clickNode(feed, cardOf(feed, postId).querySelector('[data-post-edit]'));
    await feed.settled();

    const editBox = feed.el('feed-form');
    const editForm = editBox.querySelector('#post-form');
    check('3. form ghi đúng id bài đang sửa', String(editForm.getAttribute('data-edit-id')) === String(postId),
        String(editForm.getAttribute('data-edit-id')));
    check('3. tiêu đề cũ được điền sẵn', fieldValue(editForm, 'post-title') === TITLE_OLD,
        fieldValue(editForm, 'post-title'));
    check('3. nội dung cũ được điền sẵn', fieldValue(editForm, 'post-content') === CONTENT_OLD);
    check('3. tướng đã gắn được điền sẵn', fieldValue(editForm, 'post-hero') === 'yasuo');
    check('9. tiêu đề form đổi thành Sửa bài viết', /Sửa bài viết/.test(editBox.innerHTML));
    check('9. nút gửi đổi thành Lưu thay đổi', /Lưu thay đổi/.test(editBox.innerHTML));
    check('9. dùng lại đúng form cũ, không tạo form mới',
        editBox.querySelectorAll('#post-form').length === 1,
        String(editBox.querySelectorAll('#post-form').length));

    // ============ B. Sửa post ============
    console.log('\n--- B. Sửa post ---');
    editForm.querySelector('#post-title').value = TITLE_NEW;
    editForm.querySelector('#post-content').value = CONTENT_NEW;
    editForm.querySelector('#post-hero').value = '';
    submitForm(feed, editForm);
    await feed.settled();

    const stored = postIn(feed.storage, postId);
    check('B. tiêu đề mới đã lưu', stored.title === TITLE_NEW, stored.title);
    check('B. nội dung mới đã lưu', stored.content === CONTENT_NEW, stored.content);
    check('B. đã bỏ gắn tướng', !stored.heroId, String(stored.heroId));
    check('B. ghi updatedAt', !!stored.updatedAt, String(stored.updatedAt));
    // innerHTML ở mini-dom thuộc về node được gán, nên đọc trên #post-errors (node con),
// đọc trên #feed-form sẽ không thấy nội dung ghi sau đó vào node con.
check('B. hiện thông báo đã lưu',
    /Đã lưu bài/.test(feed.el('feed-form').querySelector('#post-errors').innerHTML),
    feed.el('feed-form').querySelector('#post-errors').innerHTML);

    // ============ C + D. Refresh, dữ liệu còn nguyên ============
    console.log('\n--- C + D. Refresh, dữ liệu mới vẫn tồn tại ---');
    const reloaded = await openFeed(new Map(feed.storage), 'player1');
    const afterReload = postIn(reloaded.storage, postId);
    check('D. sau refresh vẫn thấy tiêu đề mới', afterReload.title === TITLE_NEW, afterReload.title);
    check('D. sau refresh vẫn thấy nội dung mới', afterReload.content === CONTENT_NEW);
    check('D. sau refresh vẫn thấy updatedAt', !!afterReload.updatedAt);

    // ============ E. ID không thay đổi ============
    console.log('\n--- E. ID không thay đổi ---');
    const allPosts = JSON.parse(reloaded.storage.get(KEY_POSTS));
    check('E. id bài giữ nguyên', String(afterReload.id) === String(postId),
        `${afterReload.id} != ${postId}`);
    check('E. không tạo thêm bài mới', allPosts.length === jsonPosts.length + 1,
        `có ${allPosts.length} bài, mong đợi ${jsonPosts.length + 1}`);
    check('E. không có id trùng',
        new Set(allPosts.map((p) => String(p.id))).size === allPosts.length);

    // ============ F. createdAt không bị reset ============
    console.log('\n--- F. createdAt không bị reset ---');
    check('F. createdAt giữ nguyên', afterReload.createdAt === createdAt,
        `${afterReload.createdAt} != ${createdAt}`);
    check('F. updatedAt khác createdAt', afterReload.updatedAt !== afterReload.createdAt);

    // ============ D. Dữ liệu khác của bài không bị mất ============
    console.log('\n--- D. Like và bình luận không bị mất ---');
    const likesAfter = (JSON.parse(reloaded.storage.get(KEY_LIKES) || '{}')[postId] || []).length;
    const commentsAfter = JSON.parse(reloaded.storage.get(KEY_COMMENTS) || '[]')
        .filter((c) => String(c.postId) === String(postId)).length;
    check('D. lượt thích của bài vẫn còn', likesAfter === likesBefore, `${likesAfter} != ${likesBefore}`);
    check('D. bình luận của bài vẫn còn', commentsAfter === commentsBefore, `${commentsAfter} != ${commentsBefore}`);

    // ============ 5. Feed hiển thị nội dung mới ============
    console.log('\n--- 5. Feed hiển thị nội dung mới ---');
    // Đọc trên #feed-list (node được gán innerHTML) chứ không phải trên thẻ card con.
const listHtml = reloaded.el('feed-list').innerHTML;
    check('5. Feed hiện tiêu đề mới', /Tiêu đề đã được sửa/.test(listHtml));
    check('5. Feed hiện nội dung mới', /Nội dung mới sau khi tác giả sửa/.test(listHtml));
    check('5. Feed đánh dấu bài đã sửa', /đã sửa/.test(listHtml));

    // ============ H. Post detail cũng cập nhật ============
    console.log('\n--- H. Post detail cũng cập nhật ---');
    const detail = await openDetail(new Map(reloaded.storage), 'player1', postId);
    const detailHtml = detail.el('post-detail').innerHTML;
    check('H. detail hiện tiêu đề mới', /Tiêu đề đã được sửa/.test(detailHtml));
    check('H. detail hiện nội dung mới', /Nội dung mới sau khi tác giả sửa/.test(detailHtml));
    check('H. detail đánh dấu đã sửa', /đã sửa/.test(detailHtml));
    check('H. detail vẫn giữ like', new RegExp(`♥ Thích \\(${likesAfter}\\)`).test(detailHtml), detailHtml.slice(0, 120));
    check('H. detail vẫn giữ bình luận', new RegExp(`Bình luận \\(${commentsAfter}\\)`).test(detailHtml));

    // ============ 3. Sửa ngay trên trang chi tiết ============
    console.log('\n--- 3. Sửa ngay trên trang chi tiết ---');
    clickNode(detail, detail.el('post-detail').querySelector('[data-post-edit]'));
    await detail.settled();

    const detailBox = detail.el('post-edit-form');
    const detailForm = detailBox.querySelector('#post-form');
    check('3. detail mở được form sửa', !!detailForm);
    check('3. form ở detail điền sẵn tiêu đề', fieldValue(detailForm, 'post-title') === TITLE_NEW,
        fieldValue(detailForm, 'post-title'));
    check('3. form ở detail điền sẵn nội dung', fieldValue(detailForm, 'post-content') === CONTENT_NEW);
    check('3. form ở detail ghi đúng id bài',
        String(detailForm.getAttribute('data-edit-id')) === String(postId));

    const CONTENT_FROM_DETAIL = 'Nội dung sửa trực tiếp từ trang chi tiết.';
    detailForm.querySelector('#post-content').value = CONTENT_FROM_DETAIL;
    submitForm(detail, detailForm);
    await detail.settled();
    check('3. sửa từ detail đã ghi vào LocalStorage',
        postIn(detail.storage, postId).content === CONTENT_FROM_DETAIL);
    check('3. detail hiển thị nội dung vừa sửa',
        /Nội dung sửa trực tiếp từ trang chi tiết/.test(detail.el('post-detail').innerHTML));
    check('3. sửa từ detail không tạo bài mới',
        JSON.parse(detail.storage.get(KEY_POSTS)).length === jsonPosts.length + 1);
    check('3. sửa từ detail giữ nguyên createdAt',
        postIn(detail.storage, postId).createdAt === createdAt);

    // ============ G. Người không phải tác giả không thể sửa ============
    console.log('\n--- G + 7. Người không phải tác giả không thể sửa ---');
    const stranger = await openFeed(new Map(reloaded.storage), 'demo');
    check('7. người khác không thấy nút Sửa trên Feed',
        !cardOf(stranger, postId).querySelector('[data-post-edit]'));

    const strangerDetail = await openDetail(new Map(reloaded.storage), 'demo', postId);
    check('7. người khác không thấy nút Sửa trên detail',
        !strangerDetail.el('post-detail').querySelector('[data-post-edit]'));

    const storageBefore = JSON.stringify(JSON.parse(stranger.storage.get(KEY_POSTS)));
    const blocked = stranger.runInPage('updatePost(' + postId + ', "Tieu de cuop", "Nguoi khac co sua bai nay khong");');
    await stranger.settled();
    check('7. updatePost() từ chối người không phải tác giả', blocked === null,
        `trả về ${JSON.stringify(blocked)}`);
    check('7. bài không bị thay đổi sau khi người khác thử sửa',
        JSON.stringify(JSON.parse(stranger.storage.get(KEY_POSTS))) === storageBefore);

    // Người khác không mở được form sửa
    const strangerOpened = stranger.runInPage('String(openPostEditForm(' + postId + ', document.getElementById("feed-form")));');
    await stranger.settled();
    check('7. openPostEditForm() từ chối người không phải tác giả', strangerOpened === 'false',
        strangerOpened);
    check('7. form của người khác vẫn ở chế độ đăng bài mới',
        stranger.el('feed-form').querySelector('#post-form').getAttribute('data-edit-id') === null,
        String(stranger.el('feed-form').querySelector('#post-form').getAttribute('data-edit-id')));

    // ============ 8. Xác định tác giả qua phiên đăng nhập ============
    console.log('\n--- 8. Cơ chế quyền dùng session hiện tại ---');
    // Phải xoá aov_current_user khỏi storage, nếu không phiên của player1 vẫn còn và
// "khách" thực tế vẫn đang đăng nhập.
    const guestStorage = new Map(reloaded.storage);
    guestStorage.delete('aov_current_user');
    const guest = await openFeed(guestStorage, null);
    check('8. khách không đăng nhập không thấy nút Sửa',
        !cardOf(guest, postId).querySelector('[data-post-edit]'));
    const guestBlocked = guest.runInPage('updatePost(' + postId + ', "Khach sua", "Khach khong duoc sua bai nay");');
    await guest.settled();
    check('8. khách không đăng nhập không sửa được bài', guestBlocked === null);

    // ============ 4. ID không tồn tại ============
    console.log('\n--- 4. Sửa bài không có trong hệ thống ---');
    const missing = feed.runInPage('updatePost(999999, "Khong ton tai", "Noi dung khong duoc luu.");');
    await feed.settled();
    check('4. updatePost() trả về null cho id không có', missing === null, String(missing));

    // ============ 4. Validate dữ liệu khi sửa ============
    console.log('\n--- 4. Validate dữ liệu khi sửa ---');
    clickNode(feed, cardOf(feed, postId).querySelector('[data-post-edit]'));
    await feed.settled();
    const badForm = feed.el('feed-form').querySelector('#post-form');
    badForm.querySelector('#post-title').value = 'abc';
    badForm.querySelector('#post-content').value = CONTENT_NEW;
    submitForm(feed, badForm);
    await feed.settled();
    check('4. sửa với tiêu đề quá ngắn thì bị chặn',
        /Tiêu đề/.test(badForm.querySelector('#post-errors').innerHTML),
        badForm.querySelector('#post-errors').innerHTML);
    check('4. bài không đổi khi validate lỗi',
        postIn(feed.storage, postId).content === CONTENT_NEW,
        postIn(feed.storage, postId).content);

    // ============ 10. Huỷ sửa ============
    console.log('\n--- 10. Nút Huỷ đưa form về chế độ đăng bài ---');
    const cancelForm = feed.el('feed-form').querySelector('#post-form');
    check('10. form edit có nút Huỷ', !!cancelForm.querySelector('[data-post-edit-cancel]'));
    clickNode(feed, cancelForm.querySelector('[data-post-edit-cancel]'));
    const backToCreate = feed.el('feed-form').querySelector('#post-form');
    check('10. huỷ xong về chế độ đăng bài mới',
        backToCreate.getAttribute('data-edit-id') === null,
        String(backToCreate.getAttribute('data-edit-id')));
    check('10. form đăng bài mới bị trống', fieldValue(backToCreate, 'post-title') === '');
    check('10. ô nội dung bị trống', fieldValue(backToCreate, 'post-content') === '');

    // ============ posts.json không bị ghi thêm ============
    console.log('\n--- posts.json là dữ liệu tĩnh ---');
    const diskPosts = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/posts.json'), 'utf8'));
    check('posts.json số bài không đổi', diskPosts.length === jsonPosts.length);
    check('posts.json không có bài của user',
        !diskPosts.some((p) => String(p.id) === String(postId)));
    const userPosts = allPosts.filter((p) => !jsonPosts.some((j) => String(j.id) === String(p.id)));
    check('mọi bài của user chỉ nằm trong LocalStorage',
        userPosts.length === 1 && String(userPosts[0].id) === String(postId),
        `có ${userPosts.length} bài của user`);

    console.log(`\n${pass + fail} test total, ${pass} PASS, ${fail} FAIL`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
    console.error(error);
    process.exit(1);
});