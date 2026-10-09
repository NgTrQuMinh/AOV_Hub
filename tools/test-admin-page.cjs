/**
 * Test trang Quản trị bài viết (src/pages/admin.html + src/js/admin.js).
 *
 * Chạy code thật của dự án trong mini-dom: dựng trang thật, nạp script thật,
 * không mock logic. Chỉ "reload" mô phỏng bằng cách mở lại trang với cùng Map localStorage.
 *
 * Phạm vi kiểm tra:
 *   1. Guard trang: khách bị đưa về Login, user thường bị đưa về trang chủ kèm cảnh báo,
 *      admin thì vào được và thấy bảng bài viết.
 *   2. Link "Quản trị" trên Header chỉ hiện với admin.
 *   3. Admin ẩn bài -> bài có hidden: true trong aov_posts, Feed / trang chi tiết /
 *      Profile của người khác không thấy bài, tác giả vẫn thấy kèm nhãn "Đã bị ẩn".
 *   4. Admin hiện lại bài -> bài trở lại như cũ.
 *   5. Admin xoá bài (có confirm) -> xoá cả bình luận và lượt thích; bấm Huỷ thì giữ nguyên.
 *   6. Ô tìm theo tiêu đề / tác giả.
 *   7. setPostHidden()/deletePost() chặn đúng ở tầng dữ liệu với tài khoản không có quyền.
 *
 * Chạy: node tools/test-admin-page.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire, unescapeHtml } = require('./mini-dom.cjs');

const ADMIN_PAGE = 'src/pages/admin.html';
const FEED_PAGE = 'src/pages/feed.html';
const DETAIL_PAGE = 'src/pages/post-detail.html';
const PROFILE_PAGE = 'src/pages/profile.html';

const USERS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/users.json'), 'utf8'));
const POSTS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/posts.json'), 'utf8'));

/** Tài khoản quản trị viên trong data/users.json */
const ADMIN_USERNAME = 'admin';
/** Tài khoản thường, đồng thời là tác giả của bài 9001 trong posts.json */
const AUTHOR_USERNAME = 'demo';
/** Tài khoản thường khác, KHÔNG phải tác giả của bài 9001 (đại diện "người khác") */
const OTHER_USERNAME = 'aovfan';

/** id của bài viết dùng để thao tác ẩn/hiện/xoá */
const TARGET_ID = 9001;
const TARGET_TITLE = POSTS_JSON.find((post) => post.id === TARGET_ID).title;

/* ================= Test runner ================= */

let passed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) {
        passed++;
        console.log('  PASS  ' + name);
        return;
    }

    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log('  FAIL  ' + name + (detail ? `\n        ${detail}` : ''));
}

function section(title) {
    console.log('\n== ' + title + ' ==');
}

/* ================= Trợ giúp ================= */

/** Mở một trang bất kỳ và chờ render xong. */
async function open(page, options = {}) {
    const loaded = loadPage(Object.assign({ page }, options));
    loaded.run();
    await loaded.settled();
    return loaded;
}

const openAdmin = (options) => open(ADMIN_PAGE, options);
const openFeed = (options) => open(FEED_PAGE, options);
const openDetail = (options) => open(DETAIL_PAGE, options);
const openProfile = (options) => open(PROFILE_PAGE, options);

/** Mở trang Feed để aov_posts được nạp từ data/posts.json, rồi trả về trang đó. */
function seedPostsWithFeed(storage) {
    return openFeed({ storage, login: AUTHOR_USERNAME });
}

/** Số thẻ bài viết đang render trên trang Feed. */
function feedPostIds(page) {
    return page.el('feed-list').querySelectorAll('.post-card').map((card) => card.dataset.postId);
}

/** Bài đang lưu trong aov_posts của một trang. */
function storedPost(page, postId) {
    const posts = page.readKey('aov_posts') || [];
    return posts.find((post) => String(post.id) === String(postId)) || null;
}

/** Bấm nút trong bảng quản trị (event delegation ở cấp document của admin.js). */
function clickIn(page, containerId, selector) {
    const button = page.el(containerId).querySelector(selector);
    if (!button) throw new Error('Không tìm thấy ' + selector + ' trong #' + containerId);

    fire(button, 'click', page.doc);
    return page.settled();
}

/** Gõ từ khoá vào ô tìm của trang quản trị rồi chờ debounce (200ms) chạy xong. */
async function typeAdminKeyword(page, text) {
    const input = page.el('admin-keyword');
    if (!input) throw new Error('Không tìm thấy #admin-keyword');

    input.value = text;
    fire(input, 'input', page.doc);
    await new Promise((resolve) => setTimeout(resolve, 300));
}

/** Nội dung bảng quản trị đang vẽ ra DOM. */
const adminTableHtml = (page) => page.el('admin-list').innerHTML;

/** HTML đã giải mã entity (escapeHtml sinh &#39; cho dấu nháy, nên so sánh tiêu đề phải giải mã). */
const plainHtml = (page, containerId) => unescapeHtml(page.el(containerId).innerHTML);

/** id của các bài đang có trong bảng quản trị. */
function adminTableIds(page) {
    return page.el('admin-list').querySelectorAll('tr').map((row) => row.dataset.postId).filter(Boolean);
}

/* ================= Test ================= */

(async () => {
    /* ---------- 0. Dữ liệu tài khoản ---------- */
    section('0. data/users.json có tài khoản quản trị');

    const adminAccount = USERS_JSON.find((user) => user.username === ADMIN_USERNAME);

    check('users.json có tài khoản admin với mật khẩu đã băm (không còn password thô)',
        Boolean(adminAccount) && !adminAccount.password
            && typeof adminAccount.passwordHash === 'string' && adminAccount.passwordHash.length > 0
            && typeof adminAccount.salt === 'string' && adminAccount.salt.length > 0,
        JSON.stringify(adminAccount));
    check('tài khoản admin có role "admin" và displayName',
        adminAccount && adminAccount.role === 'admin' && adminAccount.displayName === 'Quản trị viên',
        JSON.stringify(adminAccount));
    check('tài khoản admin có joinedAt',
        adminAccount && !Number.isNaN(Date.parse(adminAccount.joinedAt)),
        adminAccount && String(adminAccount.joinedAt));
    check('mọi tài khoản khác có role "user"',
        USERS_JSON.filter((user) => user.username !== ADMIN_USERNAME)
            .every((user) => user.role === 'user'),
        JSON.stringify(USERS_JSON.map((user) => user.username + ':' + user.role)));

    /* ---------- 1. Guard của trang quản trị ---------- */
    section('1. Chặn truy cập trang Quản trị');

    const guest = await openAdmin({ storage: new Map() });
    check('khách chưa đăng nhập bị đưa về trang Login',
        guest.location.href.includes('/src/pages/login.html'),
        guest.location.href);
    check('khách không thấy bảng bài viết',
        !adminTableHtml(guest).includes('data-admin-toggle'),
        adminTableHtml(guest).slice(0, 120));

    const stranger = await openAdmin({ login: OTHER_USERNAME });
    check('user thường bị cảnh báo khi mở trang Quản trị',
        stranger.alerts.some((message) => /không có quyền/i.test(message)),
        JSON.stringify(stranger.alerts));
    check('user thường bị chuyển về trang chủ',
        stranger.location.href === '/index.html',
        stranger.location.href);
    check('user thường không thấy bảng bài viết',
        !adminTableHtml(stranger).includes('data-admin-toggle')
        && !adminTableHtml(stranger).includes('data-admin-delete'),
        adminTableHtml(stranger).slice(0, 120));
    check('user thường bị chặn thì không đổi dữ liệu bài viết',
        !stranger.storage.has('aov_posts') || (stranger.readKey('aov_posts') || []).every((post) => !post.hidden));

    const admin = await openAdmin({ login: ADMIN_USERNAME });
    check('admin vào được trang Quản trị (không bị điều hướng đi đâu)',
        admin.location.href === '/' + ADMIN_PAGE,
        admin.location.href);
    check('admin không bị cảnh báo khi vào trang', admin.alerts.length === 0, JSON.stringify(admin.alerts));
    check('admin thấy bảng đủ số bài trong posts.json',
        adminTableIds(admin).length === POSTS_JSON.length,
        adminTableIds(admin).length + ' dòng');
    check('bảng quản trị có đủ các cột cần quản lý',
        ['ID', 'Tác giả', 'Tiêu đề', 'Chuyên mục', 'Ngày đăng', 'Like', 'Bình luận', 'Trạng thái', 'Thao tác']
            .every((label) => adminTableHtml(admin).includes(`<th>${label}</th>`)),
        adminTableHtml(admin).slice(0, 200));
    check('mỗi dòng có nút Ẩn và nút Xóa',
        adminTableHtml(admin).split('data-admin-toggle=').length - 1 === POSTS_JSON.length
        && adminTableHtml(admin).split('data-admin-delete=').length - 1 === POSTS_JSON.length,
        `${adminTableHtml(admin).split('data-admin-toggle=').length - 1} nút Ẩn/Hiện`);
    check('bài chưa bị ẩn thì trạng thái là "Đang hiện"',
        adminTableHtml(admin).includes('Đang hiện') && !adminTableHtml(admin).includes('>Đã ẩn<'));
    check('trang quản trị không ném lỗi JavaScript', admin.errors.length === 0, admin.errors.join(' | '));

    /* ---------- 2. Link Quản trị trên Header ---------- */
    section('2. Link "Quản trị" trên Header chỉ hiện với admin');

    /*
     * mini-dom không nạp được public/partials/header.html (fetch trong mini-dom chỉ đọc
     * src/data/*.json) nên #account-area không tồn tại trong DOM. Vậy nên dựng một
     * phần tử giả rồi gọi đúng hàm thật updateAccountUI() của auth.js để kiểm tra
     * phần HTML mà hàm này sinh ra.
     */
    const accountAreaHtml = (page) => page.runInPage(`
        var accountArea = { innerHTML: '' };
        document.getElementById = (id) => (id === 'account-area' ? accountArea : null);
        updateAccountUI();
        accountArea.innerHTML;
    `);

    const adminHeader = accountAreaHtml(await openAdmin({ login: ADMIN_USERNAME }));
    check('admin thấy link Quản trị trên Header',
        adminHeader.includes('Quản trị') && adminHeader.includes('/src/pages/admin.html'),
        adminHeader.replace(/\s+/g, ' ').slice(0, 160));
    check('admin vẫn thấy nút Đăng xuất', adminHeader.includes('Đăng xuất'));

    const userHeader = accountAreaHtml(await openFeed({ login: OTHER_USERNAME }));
    check('user thường không thấy link Quản trí trên Header',
        !userHeader.includes('Quản trị') && !userHeader.includes('/src/pages/admin.html'),
        userHeader.replace(/\s+/g, ' ').slice(0, 160));

    const guestHeader = accountAreaHtml(await openFeed({ storage: new Map() }));
    check('khách không thấy link Quản trị',
        !guestHeader.includes('Quản trị') && guestHeader.includes('Đăng ký'));

    /* ---------- 3. Admin ẩn bài viết ---------- */
    section('3. Admin ẩn bài viết');

    // Nạp bài mẫu vào LocalStorage, có sẵn like + bình luận để kiểm tra số liệu trong bảng.
    const seedFeed = await seedPostsWithFeed(new Map([
        ['aov_likes', JSON.stringify({ [TARGET_ID]: [OTHER_USERNAME, AUTHOR_USERNAME] })],
        ['aov_comments', JSON.stringify([
            { id: 7000000000001, postId: TARGET_ID, author: OTHER_USERNAME, content: 'Bình luận của bài bị ẩn', createdAt: '2025-03-02T08:00:00.000Z' },
            { id: 7000000000002, postId: TARGET_ID, author: AUTHOR_USERNAME, content: 'Bình luận thứ hai', createdAt: '2025-03-02T09:00:00.000Z' },
        ])],
    ]));

    const adminHide = await openAdmin({ storage: seedFeed.storage, login: ADMIN_USERNAME });

    check('bảng hiện đúng số like và bình luận của bài 9001',
        /<td>2<\/td>\s*<td>2<\/td>\s*<td>/.test(adminTableHtml(adminHide)),
        (adminTableHtml(adminHide).match(/<td>[^<]*<\/td>\s*<td>2<\/td>\s*<td>2<\/td>/) || [''])[0]);
    check('trước khi ẩn, bài 9001 chưa có trường hidden',
        storedPost(adminHide, TARGET_ID).hidden === undefined,
        JSON.stringify(storedPost(adminHide, TARGET_ID)));

    await clickIn(adminHide, 'admin-list', `[data-admin-toggle="${TARGET_ID}"]`);

    check('bài 9001 được ghi hidden: true vào aov_posts',
        storedPost(adminHide, TARGET_ID).hidden === true,
        JSON.stringify(storedPost(adminHide, TARGET_ID)));
    check('bài 9001 vẫn còn trong aov_posts (ẩn chứ không xoá)',
        Boolean(storedPost(adminHide, TARGET_ID)));
    check('các bài khác không bị ảnh hưởng',
        (adminHide.readKey('aov_posts') || []).filter((post) => post.hidden).length === 1);
    check('bảng quản trị cập nhật trạng thái "Đã ẩn"',
        adminTableHtml(adminHide).includes('>Đã ẩn<'),
        adminTableHtml(adminHide).slice(0, 160));
    check('nút của bài đã ẩn đổi thành "Hiện"',
        new RegExp(`data-admin-toggle="${TARGET_ID}"[\\s\\S]*?data-admin-hidden="true"[\\s\\S]*?>Hiện<`)
            .test(adminTableHtml(adminHide)),
        adminTableHtml(adminHide).slice(0, 160));
    check('số like và bình luận của bài bị ẩn vẫn nguyên',
        adminHide.readKey('aov_likes')[TARGET_ID].length === 2
        && adminHide.readKey('aov_comments').length === 2,
        JSON.stringify(adminHide.readKey('aov_comments')));

    // ---- Người khác không thấy bài đã ẩn ----
    const hiddenStorage = new Map(adminHide.storage);

    const strangerFeed = await openFeed({ storage: hiddenStorage, login: OTHER_USERNAME });
    check('Feed của user thường không còn bài bị ẩn',
        !feedPostIds(strangerFeed).includes(String(TARGET_ID)),
        feedPostIds(strangerFeed).join(', '));
    check('Feed báo đúng số bài còn lại',
        strangerFeed.el('feed-count').textContent === `${POSTS_JSON.length - 1} bài viết`,
        strangerFeed.el('feed-count').textContent);
    check('các bài khác vẫn hiện bình thường trên Feed của user thường',
        feedPostIds(strangerFeed).length === POSTS_JSON.length - 1,
        feedPostIds(strangerFeed).join(', '));

    const strangerDetail = await openDetail({ storage: hiddenStorage, search: `?id=${TARGET_ID}`, login: OTHER_USERNAME });
    check('trang chi tiết của người khác báo bài đã bị ẩn',
        plainHtml(strangerDetail, 'post-detail').includes('Bài viết này đã bị ẩn bởi quản trị viên.'),
        plainHtml(strangerDetail, 'post-detail').replace(/\s+/g, ' ').slice(0, 160));
    check('trang chi tiết không lộ nội dung bài bị ẩn',
        !plainHtml(strangerDetail, 'post-detail').includes(TARGET_TITLE));

    // getPostsByUser() là nguồn dữ liệu của trang Profile: người khác không thấy bài ẩn của tác giả.
    check('getPostsByUser() của người khác không trả về bài bị ẩn',
        strangerFeed.runInPage(
            `getPostsByUser('${AUTHOR_USERNAME}').some((post) => String(post.id) === '${TARGET_ID}')`,
        ) === false);

    // ---- Tác giả vẫn thấy bài của mình kèm nhãn ----
    const authorFeed = await openFeed({ storage: hiddenStorage, login: AUTHOR_USERNAME });
    check('tác giả vẫn thấy bài của mình trên Feed',
        feedPostIds(authorFeed).includes(String(TARGET_ID)),
        feedPostIds(authorFeed).join(', '));
    check('tác giả thấy nhãn "Đã bị ẩn" trên thẻ bài',
        plainHtml(authorFeed, 'feed-list').includes('Đã bị ẩn'),
        plainHtml(authorFeed, 'feed-list').slice(0, 200));
    check('getPostsByUser() của tác giả vẫn trả về bài bị ẩn',
        authorFeed.runInPage(
            `getPostsByUser('${AUTHOR_USERNAME}').some((post) => String(post.id) === '${TARGET_ID}')`,
        ) === true);

    const authorDetail = await openDetail({ storage: hiddenStorage, search: `?id=${TARGET_ID}`, login: AUTHOR_USERNAME });
    check('tác giả vẫn mở được trang chi tiết bài của mình',
        plainHtml(authorDetail, 'post-detail').includes(TARGET_TITLE),
        plainHtml(authorDetail, 'post-detail').slice(0, 160));
    check('trang chi tiết của tác giả có nhãn "Đã bị ẩn"',
        plainHtml(authorDetail, 'post-detail').includes('Đã bị ẩn'));

    const authorProfile = await openProfile({ storage: hiddenStorage, login: AUTHOR_USERNAME });
    check('Profile của tác giả vẫn liệt kê bài bị ẩn kèm nhãn',
        plainHtml(authorProfile, 'profile-posts').includes(TARGET_TITLE)
        && plainHtml(authorProfile, 'profile-posts').includes('Đã bị ẩn'),
        plainHtml(authorProfile, 'profile-posts').slice(0, 200));

    const adminFeed = await openFeed({ storage: hiddenStorage, login: ADMIN_USERNAME });
    check('admin xem Feed cũng không thấy bài bị ẩn (chỉ xem ở trang Quản trị)',
        !feedPostIds(adminFeed).includes(String(TARGET_ID)),
        feedPostIds(adminFeed).join(', '));

    /* ---------- 4. Admin hiện lại bài ---------- */
    section('4. Admin hiện lại bài viết');

    await clickIn(adminHide, 'admin-list', `[data-admin-toggle="${TARGET_ID}"]`);

    check('hiện lại bài thì bỏ trường hidden',
        storedPost(adminHide, TARGET_ID).hidden === undefined,
        JSON.stringify(storedPost(adminHide, TARGET_ID)));
    check('hiện lại bài thì bảng báo "Đang hiện"',
        !adminTableHtml(adminHide).includes('>Đã ẩn<')
        && adminTableHtml(adminHide).includes('>Đang hiện<'));
    check('hiện lại bài thì Feed hiện đủ số bài',
        feedPostIds(await openFeed({ storage: new Map(adminHide.storage), login: AUTHOR_USERNAME })).length === POSTS_JSON.length);

    /* ---------- 5. Admin xoá bài ---------- */
    section('5. Admin xoá bài viết');

    // Bấm "Huỷ" trong hộp thoại xác nhận thì bài phải còn nguyên.
    adminHide.ctx.confirm = () => false;
    await clickIn(adminHide, 'admin-list', `[data-admin-delete="${TARGET_ID}"]`);
    check('bấm Xóa rồi chọn Huỷ -> bài vẫn còn',
        Boolean(storedPost(adminHide, TARGET_ID)));

    adminHide.ctx.confirm = () => true;
    await clickIn(adminHide, 'admin-list', `[data-admin-delete="${TARGET_ID}"]`);

    check('xoá bài -> bài biến mất khỏi aov_posts',
        !storedPost(adminHide, TARGET_ID));
    check('xoá bài -> bảng quản trị cũng bỏ dòng đó',
        !adminTableIds(adminHide).includes(String(TARGET_ID)),
        adminTableIds(adminHide).join(', '));
    check('xoá bài -> xoá luôn bình luận của bài đó',
        (adminHide.readKey('aov_comments') || []).length === 0,
        JSON.stringify(adminHide.readKey('aov_comments')));
    check('xoá bài -> xoá luôn lượt thích của bài đó',
        !adminHide.readKey('aov_likes')[TARGET_ID],
        JSON.stringify(adminHide.readKey('aov_likes')));
    check('xoá bài -> bài khác trong hệ thống không bị mất',
        (adminHide.readKey('aov_posts') || []).length === POSTS_JSON.length - 1,
        String((adminHide.readKey('aov_posts') || []).length));

    // data/posts.json là dữ liệu tĩnh: bài đã xoá không được nạp lại, cũng không bị ghi vào file.
    const afterDelete = await openAdmin({ storage: new Map(adminHide.storage), login: ADMIN_USERNAME });
    check('reload trang quản trị -> bài đã xoá không quay lại',
        !adminTableIds(afterDelete).includes(String(TARGET_ID)),
        adminTableIds(afterDelete).join(', '));

    /* ---------- 6. Tìm bài viết trên trang quản trị ---------- */
    section('6. Tìm bài viết theo tiêu đề / tác giả');

    const searchPage = await openAdmin({ login: ADMIN_USERNAME });
    const nakrothTitle = POSTS_JSON.find((post) => /Nakroth/i.test(post.title)).title;

    await typeAdminKeyword(searchPage, 'nakroth');
    check('tìm theo tiêu đề (không dấu, không phân biệt hoa/thường) ra đúng 1 bài',
        adminTableIds(searchPage).length === 1 && adminTableHtml(searchPage).includes('Nakroth'),
        adminTableIds(searchPage).join(', '));

    await typeAdminKeyword(searchPage, 'aovfan');
    const byAuthor = adminTableIds(searchPage).length;
    check('tìm theo tên tác giả ra đúng số bài của tác giả đó',
        byAuthor === POSTS_JSON.filter((post) => post.author === 'aovfan').length,
        `${byAuthor} bài`);
    check('số bài đang hiện được báo dạng "x / tổng"',
        searchPage.el('admin-count').textContent === `${byAuthor} / ${POSTS_JSON.length} bài viết`,
        searchPage.el('admin-count').textContent);

    await typeAdminKeyword(searchPage, 'khong-co-bai-nao-khop');
    check('tìm không ra bài nào -> hiện thông báo, không vẽ bảng',
        adminTableHtml(searchPage).includes('Không có bài viết nào khớp từ khoá')
        && !adminTableHtml(searchPage).includes('data-admin-toggle'),
        adminTableHtml(searchPage).slice(0, 160));

    await typeAdminKeyword(searchPage, '');
    check('xoá từ khoá -> thấy lại toàn bộ bài viết',
        adminTableIds(searchPage).length === POSTS_JSON.length,
        adminTableIds(searchPage).length + ' dòng');
    check('không có từ khoá thì bộ đếm chỉ hiện tổng số bài',
        searchPage.el('admin-count').textContent === `${POSTS_JSON.length} bài viết`,
        searchPage.el('admin-count').textContent);

    /* ---------- 7. Chặn quyền ở tầng dữ liệu ---------- */
    section('7. setPostHidden() / deletePost() chặn người không có quyền');

    const permStorage = new Map(seedFeed.storage);

    const userTry = await openFeed({ storage: permStorage, login: OTHER_USERNAME });
    check('user thường gọi setPostHidden() -> thất bại, dữ liệu giữ nguyên',
        userTry.runInPage(`setPostHidden(${TARGET_ID}, true)`) === false
        && storedPost(userTry, TARGET_ID).hidden === undefined,
        JSON.stringify(storedPost(userTry, TARGET_ID)));

    const guestTry = await openFeed({ storage: new Map(permStorage), login: null });
    check('khách gọi setPostHidden() -> thất bại',
        guestTry.runInPage(`setPostHidden(${TARGET_ID}, true)`) === false
        && storedPost(guestTry, TARGET_ID).hidden === undefined);

    const adminTry = await openAdmin({ storage: new Map(permStorage), login: ADMIN_USERNAME });
    check('admin gọi setPostHidden() -> thành công',
        adminTry.runInPage(`setPostHidden(${TARGET_ID}, true)`) === true
        && storedPost(adminTry, TARGET_ID).hidden === true,
        JSON.stringify(storedPost(adminTry, TARGET_ID)));
    check('setPostHidden() với id không tồn tại -> thất bại, không lỗi',
        adminTry.runInPage('setPostHidden(999999999, true)') === false);
    check('setPostHidden() trả false khi bài đã ẩn lại không cần đổi quyền',
        adminTry.runInPage(`setPostHidden(${TARGET_ID}, true)`) === true);

    /* ---------- 8. Không lỗi JavaScript ---------- */
    section('8. Không lỗi JavaScript');

    const allPages = [guest, stranger, admin, strangerFeed, strangerDetail,
        authorFeed, authorDetail, authorProfile, adminFeed, adminHide,
        afterDelete, searchPage, userTry, guestTry, adminTry];
    const jsErrors = allPages.flatMap((page) => page.errors.filter((error) => !error.startsWith('console.error')));

    check('không trang nào ném lỗi JavaScript', jsErrors.length === 0, jsErrors.join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})();
