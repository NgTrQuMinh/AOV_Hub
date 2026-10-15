/**
 * Test tab "Chờ duyệt" (src/js/admin-pending.js + feed.js approvePost()/rejectPost()).
 * Task KD03 / KD12.
 *
 * Chạy code thật của dự án trong mini-dom: dựng trang admin.html thật, nạp script thật.
 * Riêng admin-pending.js do admin-shell.js nạp ĐỘNG (thẻ <script> chèn lúc mở tab) nên
 * mini-dom không tự chạy; test chủ động chèn file vào ngữ cảnh trang rồi gọi lại
 * renderAdminTabSections() — đúng cách file được nạp khi mở tab thật.
 *
 * Phạm vi:
 *   1. getPendingPosts() chỉ lấy bài "pending", mới nhất trước.
 *   2. renderPendingSection() vẽ bảng: có bài chờ, KHÔNG có bài đã duyệt / thiếu status.
 *   3. escapeHtml: tiêu đề/nội dung chứa thẻ HTML không tạo markup thật.
 *   4. approvePost()/rejectPost() ở tầng dữ liệu: status, reviewedBy/reviewedAt,
 *      rejectReason (có/không), ghi aov_admin_log.
 *   5. Chặn quyền ở tầng dữ liệu: user thường / khách -> false, không đổi dữ liệu.
 *   6. Bấm nút trên DOM: dòng biến mất, badge "Chờ duyệt" ở menu dọc đổi ngay.
 *
 * Chạy: node tools/test-admin-pending.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire } = require('./mini-dom.cjs');

const ADMIN_PAGE = 'src/pages/admin.html';
const FEED_PAGE = 'src/pages/feed.html';
const ADMIN_PENDING_JS = fs.readFileSync(path.join(ROOT, 'src/js/admin-pending.js'), 'utf8');

/** Tài khoản quản trị viên / tài khoản thường trong data/users.json. */
const ADMIN_USERNAME = 'admin';
const USER_USERNAME = 'aovfan';

/**
 * Hàng đợi mẫu: 2 bài "pending", 1 bài "approved", 1 bài thiếu status (coi là approved).
 * id cố định để so sánh; createdAt tăng dần để kiểm tra sắp mới nhất trước.
 */
const SEED = [
    { id: 7100, author: 'demo', title: 'Bài đã duyệt', content: 'Nội dung đã duyệt', heroId: '', category: 'Khác', createdAt: '2025-01-01T00:00:00.000Z', status: 'approved' },
    { id: 7101, author: 'demo', title: 'Bài chờ duyệt 1', content: 'Nội dung chờ 1', heroId: '', category: 'Khác', createdAt: '2025-02-01T00:00:00.000Z', status: 'pending' },
    { id: 7102, author: 'aovfan', title: 'Bài chờ duyệt 2 <b>x</b>', content: 'Nội dung chờ 2 <script>alert(1)</script>', heroId: '', category: 'Khác', createdAt: '2025-03-01T00:00:00.000Z', status: 'pending' },
    { id: 7103, author: 'demo', title: 'Bài cũ thiếu status', content: 'Nội dung không có status', heroId: '', category: 'Khác', createdAt: '2025-04-01T00:00:00.000Z' },
];

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

/** localStorage dựng sẵn hàng đợi duyệt (đi qua cầu nối aov_posts -> collection posts). */
function seedStorage() {
    return new Map([['aov_posts', JSON.stringify(SEED)]]);
}

/** Mở tab "Chờ duyệt" thật, chèn admin-pending.js rồi vẽ mục. */
async function openAdminPending() {
    const page = loadPage({
        page: ADMIN_PAGE,
        login: ADMIN_USERNAME,
        search: '?tab=pending',
        storage: seedStorage(),
    });

    page.run();
    await page.settled();
    await page.settled();

    // Giống bước admin-shell.js chèn <script src=...admin-pending.js>: mini-dom không chạy
    // được script động nên chèn thẳng mã vào ngữ cảnh trang (đăng ký mục + gắn listener).
    page.runInPage(ADMIN_PENDING_JS);

    // Vẽ lại mục "pending" sau khi đã đăng ký.
    await page.runInPage("renderAdminTabSections(document.getElementById('admin-panel'), 'pending')");
    await page.settled();

    return page;
}

/** Mở feed.html (đủ feed.js + auth.js nhưng không có adminlog.js) để test tầng dữ liệu. */
async function openFeed(options) {
    const page = loadPage(Object.assign({ page: FEED_PAGE }, options));
    page.run();
    await page.settled();
    return page;
}

const storedPost = (page, id) => (page.readKey('aov_posts') || [])
    .find((post) => String(post.id) === String(id)) || null;

/** Nội dung đang vẽ của mục "Bài viết chờ duyệt" (mini-dom lưu innerHTML theo từng node). */
function pendingBodyHtml(page) {
    const body = page.el('admin-panel').querySelector('.admin-section__body');
    return body ? body.innerHTML : '';
}

/**
 * Chuỗi HTML nội dung một liên kết menu dọc (đọc badge ở đây vì mini-dom không có textContent).
 * Lần vẽ đầu, admin-shell.js gán innerHTML cho cả #admin-tabs nên liên kết con không giữ
 * chuỗi riêng -> phải cắt đoạn markup từ #admin-tabs; sau refreshAdminBadges() thì liên kết
 * được gán innerHTML trực tiếp nên đọc thẳng được.
 */
function sidebarLinkHtml(page, tabId) {
    const link = page.el('admin-tabs').querySelector('.admin-sidebar__link[data-admin-tab="' + tabId + '"]');
    if (link && link.innerHTML) return link.innerHTML;

    const all = page.el('admin-tabs').innerHTML;
    const start = all.indexOf('data-admin-tab="' + tabId + '"');
    if (start === -1) return '';

    const rest = all.slice(start);
    const end = rest.indexOf('</a>');
    return end === -1 ? rest : rest.slice(0, end + 4);
}

/* ================= Test ================= */

(async () => {
    /* ---------- 1. getPendingPosts() ---------- */
    section('1. getPendingPosts()');

    const page = await openAdminPending();
    const pendingIds = page.runInPage('getPendingPosts().map(function (p) { return p.id; }).join(",")');

    check('chỉ lấy bài "pending", mới nhất trước (7102, 7101)',
        pendingIds === '7102,7101',
        pendingIds);
    check('bài "approved" và bài thiếu status KHÔNG nằm trong hàng đợi',
        !pendingIds.includes('7100') && !pendingIds.includes('7103'),
        pendingIds);

    /* ---------- 2. renderPendingSection() ---------- */
    section('2. renderPendingSection()');

    const panelHtml = pendingBodyHtml(page);

    check('#admin-panel có mục pending-posts và bảng bài chờ duyệt',
        page.el('admin-panel').innerHTML.includes('data-admin-section="pending-posts"')
        && panelHtml.includes('Bài chờ duyệt 1')
        && panelHtml.includes('Bài chờ duyệt 2'),
        panelHtml.replace(/\s+/g, ' ').slice(0, 160));
    check('KHÔNG vẽ bài đã duyệt / bài thiếu status',
        !panelHtml.includes('Bài đã duyệt') && !panelHtml.includes('Bài cũ thiếu status'));
    check('mỗi dòng có nút Duyệt/Từ chối và ô lý do',
        (panelHtml.match(/data-pending-approve=/g) || []).length === 2
        && (panelHtml.match(/data-pending-reject=/g) || []).length === 2
        && (panelHtml.match(/data-pending-reason=/g) || []).length === 2);

    /* ---------- 3. escapeHtml ---------- */
    section('3. escapeHtml');

    check('tiêu đề/nội dung chứa thẻ HTML bị escape (không tạo markup thật)',
        panelHtml.includes('&lt;b&gt;') && panelHtml.includes('&lt;script&gt;')
        && !panelHtml.includes('<script>alert(1)</script>'),
        panelHtml.includes('&lt;script&gt;'));

    /* ---------- 4a. approvePost() ---------- */
    section('4a. approvePost()');

    check('approvePost() trả true với admin', page.runInPage('approvePost(7101)') === true);

    const approved = storedPost(page, 7101);
    check('bài 7101 -> status "approved", reviewedBy admin, có reviewedAt',
        approved && approved.status === 'approved'
        && approved.reviewedBy === ADMIN_USERNAME
        && typeof approved.reviewedAt === 'string' && approved.reviewedAt.length > 0,
        JSON.stringify(approved));
    check('approvePost() không để lại rejectReason',
        approved && !('rejectReason' in approved), JSON.stringify(approved && approved.rejectReason));

    const logAfterApprove = page.readKey('aov_admin_log') || [];
    check('aov_admin_log ghi "approve-post" cho bài 7101',
        logAfterApprove.some((entry) => entry.action === 'approve-post'
            && String(entry.targetId) === '7101'
            && entry.admin === ADMIN_USERNAME),
        JSON.stringify(logAfterApprove.map((e) => e.action + ':' + e.targetId)));

    /* ---------- 4b. rejectPost() có lý do ---------- */
    section('4b. rejectPost() (có lý do)');

    check('rejectPost() trả true với admin', page.runInPage('rejectPost(7102, "Nội dung thô tục")') === true);

    const rejected = storedPost(page, 7102);
    check('bài 7102 -> status "rejected", lưu rejectReason, reviewedBy/At',
        rejected && rejected.status === 'rejected'
        && rejected.rejectReason === 'Nội dung thô tục'
        && rejected.reviewedBy === ADMIN_USERNAME
        && typeof rejected.reviewedAt === 'string',
        JSON.stringify(rejected));

    const logAfterReject = page.readKey('aov_admin_log') || [];
    check('aov_admin_log ghi "reject-post" cho bài 7102',
        logAfterReject.some((entry) => entry.action === 'reject-post'
            && String(entry.targetId) === '7102'),
        JSON.stringify(logAfterReject.map((e) => e.action + ':' + e.targetId)));

    /* ---------- 4c. rejectPost() không lý do ---------- */
    section('4c. rejectPost() (không lý do)');

    const page2 = await openAdminPending();
    check('rejectPost(id, "") vẫn từ chối nhưng KHÔNG ghi rejectReason',
        page2.runInPage('rejectPost(7100, "")') === true
        && (storedPost(page2, 7100) || {}).status === 'rejected'
        && !('rejectReason' in (storedPost(page2, 7100) || {})),
        JSON.stringify(storedPost(page2, 7100)));

    /* ---------- 5. Chặn quyền ở tầng dữ liệu ---------- */
    section('5. Chặn quyền');

    const userFeed = await openFeed({ login: USER_USERNAME, storage: seedStorage() });
    check('user thường: approvePost()/rejectPost() trả false',
        userFeed.runInPage('approvePost(7101)') === false
        && userFeed.runInPage('rejectPost(7101, "x")') === false);
    check('user thường không đổi được trạng thái bài trong aov_posts',
        (storedPost(userFeed, 7101) || {}).status === 'pending',
        JSON.stringify(storedPost(userFeed, 7101)));

    const guestFeed = await openFeed({ storage: seedStorage() });
    check('khách: approvePost()/rejectPost() trả false',
        guestFeed.runInPage('approvePost(7101)') === false
        && guestFeed.runInPage('rejectPost(7101, "x")') === false);

    /* ---------- 6. Bấm nút trên DOM + badge ---------- */
    section('6. DOM + badge');

    const ui = await openAdminPending();
    check('badge "Chờ duyệt" ban đầu = 2',
        sidebarLinkHtml(ui, 'pending').includes('admin-sidebar__badge')
        && sidebarLinkHtml(ui, 'pending').includes('>2<'),
        sidebarLinkHtml(ui, 'pending'));

    const approveBtn = ui.el('admin-panel').querySelector('[data-pending-approve]');
    check('tìm thấy nút Duyệt trong #admin-panel', Boolean(approveBtn));

    // Nút Duyệt đầu tiên là bài mới nhất (7102).
    fire(approveBtn, 'click', ui.doc);
    await ui.settled();

    check('sau khi bấm Duyệt: bài 7102 biến khỏi danh sách chờ, còn bài 7101',
        !pendingBodyHtml(ui).includes('Bài chờ duyệt 2')
        && pendingBodyHtml(ui).includes('Bài chờ duyệt 1'),
        pendingBodyHtml(ui).replace(/\s+/g, ' ').slice(0, 120));
    check('badge "Chờ duyệt" cập nhật còn 1',
        sidebarLinkHtml(ui, 'pending').includes('>1<'),
        sidebarLinkHtml(ui, 'pending'));
    check('bài 7102 đã "approved" sau khi bấm nút',
        (storedPost(ui, 7102) || {}).status === 'approved');

    // Từ chối bài còn lại với lý do rỗng -> hàng đợi trống, badge biến mất.
    const rejectInput = ui.el('admin-panel').querySelector('[data-pending-reason]');
    const rejectBtn = ui.el('admin-panel').querySelector('[data-pending-reject]');
    if (rejectInput) rejectInput.value = '';
    fire(rejectBtn, 'click', ui.doc);
    await ui.settled();

    check('sau khi Từ chối hết: hiện thông báo rỗng, badge biến mất',
        pendingBodyHtml(ui).includes('Không có bài viết nào đang chờ duyệt')
        && !sidebarLinkHtml(ui, 'pending').includes('admin-sidebar__badge'),
        pendingBodyHtml(ui).replace(/\s+/g, ' ').slice(0, 120));

    /* ---------- 7. Không lỗi JavaScript ---------- */
    section('7. Không lỗi JavaScript');

    const allPages = [page, page2, userFeed, guestFeed, ui];
    const jsErrors = allPages.flatMap((p) => p.errors.filter((error) => !error.startsWith('console.error')));
    check('không lần mở trang nào ném lỗi JavaScript', jsErrors.length === 0, jsErrors.join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})();
