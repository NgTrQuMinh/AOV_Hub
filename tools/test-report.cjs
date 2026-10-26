/**
 * Test chức năng Báo cáo bài viết / bình luận.
 *
 * Phạm vi:
 *   1. Collection reports được đăng ký, nạp/ghi qua dataStore.
 *   2. createReport(): quyền đăng nhập, tài khoản bị cấm, lý do, ghi chú,
 *      báo cáo chính mình, trùng báo cáo, giới hạn tần suất.
 *   3. report cho bình luận + chặn nội dung không tồn tại / đã bị ẩn.
 *   4. Tự đóng báo cáo khi bài bị ẩn/xoá hoặc bình luận bị xoá.
 *   5. UI trang chi tiết: nút/form, trạng thái "Đã báo cáo", khách, nội dung của mình.
 *   6. Tab quản trị: lọc, escape HTML, bỏ qua, ẩn bài, xoá bình luận, cảnh cáo, cấm.
 *
 * Chạy: node tools/test-report.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire } = require('./mini-dom.cjs');

const DETAIL_PAGE = 'src/pages/post-detail.html';
const ADMIN_PAGE = 'src/pages/admin.html';
const REPORT_JS = fs.readFileSync(path.join(ROOT, 'src/js/report.js'), 'utf8');
const ADMIN_REPORTS_JS = fs.readFileSync(path.join(ROOT, 'src/js/admin-reports.js'), 'utf8');

const ADMIN_USERNAME = 'admin';
const REPORTER_USERNAME = 'aovfan';
const AUTHOR_USERNAME = 'demo';

/* ================= Dữ liệu mẫu ================= */

const USERS = [
    { username: ADMIN_USERNAME, displayName: 'Quản trị viên', role: 'admin', joinedAt: '2025-01-01T00:00:00.000Z' },
    { username: REPORTER_USERNAME, displayName: 'Người báo cáo', joinedAt: '2025-01-02T00:00:00.000Z' },
    { username: AUTHOR_USERNAME, displayName: 'Tác giả', joinedAt: '2025-01-03T00:00:00.000Z' },
    { username: 'other', displayName: 'Tài khoản khác', joinedAt: '2025-01-04T00:00:00.000Z' },
    { username: 'banned', displayName: 'Bị cấm', banned: true, joinedAt: '2025-01-05T00:00:00.000Z' },
];

const POSTS = [
    { id: 5001, author: AUTHOR_USERNAME, title: 'Bài viết bị báo cáo', content: 'Nội dung bài viết 5001', category: 'Khác', createdAt: '2025-02-01T00:00:00.000Z', status: 'approved' },
    { id: 5002, author: AUTHOR_USERNAME, title: 'Bài viết 5002', content: 'Nội dung bài viết 5002', category: 'Khác', createdAt: '2025-02-02T00:00:00.000Z', status: 'approved' },
    { id: 5003, author: AUTHOR_USERNAME, title: 'Bài viết 5003', content: 'Nội dung bài viết 5003', category: 'Khác', createdAt: '2025-02-03T00:00:00.000Z', status: 'approved' },
    { id: 5004, author: AUTHOR_USERNAME, title: 'Bài viết 5004', content: 'Nội dung bài viết 5004', category: 'Khác', createdAt: '2025-02-04T00:00:00.000Z', status: 'approved' },
    { id: 5005, author: AUTHOR_USERNAME, title: 'Bài viết 5005', content: 'Nội dung bài viết 5005', category: 'Khác', createdAt: '2025-02-05T00:00:00.000Z', status: 'approved' },
    { id: 5006, author: AUTHOR_USERNAME, title: 'Bài viết 5006', content: 'Nội dung bài viết 5006', category: 'Khác', createdAt: '2025-02-06T00:00:00.000Z', status: 'approved' },
    { id: 5007, author: REPORTER_USERNAME, title: 'Bài viết của người báo cáo', content: 'Nội dung của chính mình', category: 'Khác', createdAt: '2025-02-07T00:00:00.000Z', status: 'approved' },
    { id: 5008, author: AUTHOR_USERNAME, title: 'Bài viết đã bị ẩn', content: 'Nội dung đã ẩn', category: 'Khác', createdAt: '2025-02-08T00:00:00.000Z', status: 'approved', hidden: true },
];

const COMMENTS = [
    { id: 6001, postId: 5001, author: AUTHOR_USERNAME, content: 'Bình luận bị báo cáo', createdAt: '2025-03-01T00:00:00.000Z' },
];

const clone = (value) => JSON.parse(JSON.stringify(value));

function makeSeed(reports) {
    return {
        users: clone(USERS),
        posts: clone(POSTS),
        comments: clone(COMMENTS),
        likes: {},
        reports: clone(reports || []),
    };
}

function makeReport(overrides) {
    return Object.assign({
        id: 8000,
        targetType: 'post',
        targetId: '5001',
        postId: '5001',
        targetAuthor: AUTHOR_USERNAME,
        reporter: REPORTER_USERNAME,
        reason: 'spam',
        note: '',
        excerpt: 'Nội dung bị báo cáo',
        createdAt: '2025-04-01T00:00:00.000Z',
        status: 'open',
        handledBy: '',
        handledAt: '',
        resolution: '',
    }, overrides || {});
}

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

/* ================= Mở trang ================= */

async function openDetail(options) {
    const seed = options.seed || makeSeed([]);
    const page = loadPage({
        page: DETAIL_PAGE,
        search: options.search || '?id=5001',
        login: options.login,
        seed,
    });

    page.run();
    await page.settled();
    await page.settled();
    await page.runInPage('initReportStore()');

    page.reportSeed = seed;
    return page;
}

async function openAdmin(reports) {
    const seed = makeSeed(reports);
    const page = loadPage({
        page: ADMIN_PAGE,
        search: '?tab=reports',
        login: ADMIN_USERNAME,
        seed,
    });

    page.run();
    await page.settled();
    await page.settled();

    page.runInPage(ADMIN_REPORTS_JS);
    await page.runInPage("renderAdminTabSections(document.getElementById('admin-panel'), 'reports')");
    await page.settled();

    page.reportSeed = seed;
    return page;
}

const reportsOf = (page) => page.runInPage('JSON.stringify(getReports())') === ''
    ? []
    : JSON.parse(page.runInPage('JSON.stringify(getReports())'));

const storedPost = (page, id) => (page.readKey('aov_posts') || [])
    .find((post) => String(post.id) === String(id)) || null;

const storedComment = (page, id) => (page.readKey('aov_comments') || [])
    .find((comment) => String(comment.id) === String(id)) || null;

const adminViewHtml = (page) => {
    const body = page.el('admin-panel').querySelector('[data-admin-reports-view]');
    return body ? body.innerHTML : '';
};

function clickAdminAction(page, reportId, action) {
    const buttons = page.el('admin-panel').querySelectorAll('[data-admin-reports-action]');
    const button = buttons.find((item) => item.getAttribute('data-admin-reports-action') === action
        && String(item.getAttribute('data-admin-reports-id')) === String(reportId)) || null;
    if (!button) return false;

    fire(button, 'click', page.doc);
    return true;
}

function fillAdminNote(page, value) {
    const note = page.el('admin-panel').querySelector('[data-admin-reports-note]');
    if (!note) return false;

    note.value = value;
    fire(note, 'input', page.doc);
    return true;
}

function confirmAdminAction(page) {
    const confirm = page.el('admin-panel').querySelector('[data-admin-reports-confirm]');
    if (!confirm) return false;

    fire(confirm, 'click', page.doc);
    return true;
}

/* ================= Test ================= */

(async () => {
    /* ---------- 1. Collection + dữ liệu ---------- */
    section('1. Collection reports');

    const page = await openDetail({ login: REPORTER_USERNAME });

    check('DATASTORE_SCHEMA có collection reports',
        page.runInPage("Object.prototype.hasOwnProperty.call(DATASTORE_SCHEMA, 'reports')") === true);
    check('getReports() trả mảng rỗng ban đầu', reportsOf(page).length === 0);
    check('getOpenReportCount() = 0', page.runInPage('getOpenReportCount()') === 0);

    /* ---------- 2. createReport() ---------- */
    section('2. createReport()');

    const created = await page.runInPage("createReport('post', 5001, 'spam', 'Nội dung spam')");

    check('báo cáo bài viết thành công', created && created.ok === true, JSON.stringify(created));
    check('lưu đúng trường dữ liệu',
        created && created.report.targetType === 'post'
        && String(created.report.targetId) === '5001'
        && created.report.targetAuthor === AUTHOR_USERNAME
        && created.report.reporter === REPORTER_USERNAME
        && created.report.status === 'open'
        && created.report.note === 'Nội dung spam'
        && created.report.excerpt.length > 0,
        JSON.stringify(created && created.report));
    check('getOpenReportCount() = 1 sau khi tạo', page.runInPage('getOpenReportCount()') === 1);

    const duplicate = await page.runInPage("createReport('post', 5001, 'offensive', '')");
    check('chặn báo cáo trùng khi báo cáo cũ đang mở', duplicate && duplicate.ok === false
        && duplicate.error.includes('đã báo cáo'), JSON.stringify(duplicate));

    const ownPost = await page.runInPage("createReport('post', 5007, 'spam', '')");
    check('chặn báo cáo nội dung của chính mình', ownPost && ownPost.ok === false
        && ownPost.error.includes('chính mình'), JSON.stringify(ownPost));

    const badReason = await page.runInPage("createReport('post', 5002, 'invalid', '')");
    check('chặn lý do không hợp lệ', badReason && badReason.ok === false, JSON.stringify(badReason));

    const otherMissing = await page.runInPage("createReport('post', 5002, 'other', '')");
    check('lý do "other" bắt buộc có ghi chú', otherMissing && otherMissing.ok === false
        && otherMissing.error.includes('Khác'), JSON.stringify(otherMissing));

    const tooLong = await page.runInPage("createReport('post', 5002, 'spam', 'x'.repeat(301))");
    check('chặn ghi chú quá 300 ký tự', tooLong && tooLong.ok === false
        && tooLong.error.includes('300'), JSON.stringify(tooLong));

    const commentReport = await page.runInPage("createReport('comment', 6001, 'offensive', 'Xúc phạm')");
    check('báo cáo bình luận lưu đúng postId/targetAuthor', commentReport && commentReport.ok === true
        && String(commentReport.report.postId) === '5001'
        && commentReport.report.targetAuthor === AUTHOR_USERNAME,
        JSON.stringify(commentReport));

    const hiddenPost = await page.runInPage("createReport('post', 5008, 'spam', '')");
    check('chặn báo cáo bài đã bị ẩn', hiddenPost && hiddenPost.ok === false, JSON.stringify(hiddenPost));

    const missingTarget = await page.runInPage("createReport('post', 999999, 'spam', '')");
    check('chặn báo cáo bài không tồn tại', missingTarget && missingTarget.ok === false, JSON.stringify(missingTarget));

    check('trang chi tiết không phát sinh console.error', page.errors.length === 0, page.errors.join(' | '));

    const guestPage = await openDetail({ login: null });
    const guestReport = await guestPage.runInPage("createReport('post', 5001, 'spam', '')");
    check('khách chưa đăng nhập không tạo được báo cáo', guestReport && guestReport.ok === false
        && guestReport.error.includes('đăng nhập'), JSON.stringify(guestReport));

    // enforceBanOnSession() xoá phiên ngay khi mở trang, nên mô phỏng tài khoản bị cấm
    // sau khi trang đã tải để kiểm tra lớp chặn dữ liệu của createReport().
    const bannedPage = await openDetail({ login: REPORTER_USERNAME });
    bannedPage.runInPage("setCurrentUser('banned')");
    const bannedReport = await bannedPage.runInPage("createReport('post', 5001, 'spam', '')");
    check('tài khoản bị cấm không tạo được báo cáo', bannedReport && bannedReport.ok === false
        && bannedReport.error.includes('bị cấm'), JSON.stringify(bannedReport));

    /* ---------- 3. Giới hạn tần suất ---------- */
    section('3. Giới hạn tần suất');

    const ratePage = await openDetail({ login: REPORTER_USERNAME });
    let lastRateResult = null;

    for (let index = 0; index < 6; index++) {
        lastRateResult = await ratePage.runInPage(
            "createReport('post', " + (5001 + index) + ", 'spam', '')",
        );
    }

    check('chặn báo cáo thứ 6 trong 10 phút', lastRateResult && lastRateResult.ok === false
        && lastRateResult.error.includes('quá nhiều'), JSON.stringify(lastRateResult));
    check('5 báo cáo đầu vẫn được lưu', reportsOf(ratePage).length === 5, String(reportsOf(ratePage).length));

    /* ---------- 4. Tự đóng báo cáo ---------- */
    section('4. Tự đóng báo cáo');

    const hidePage = await openDetail({ login: ADMIN_USERNAME });
    await hidePage.runInPage("createReport('post', 5001, 'spam', '')");
    check('admin ẩn bài thành công', hidePage.runInPage('setPostHidden(5001, true)') === true);
    const hiddenReports = reportsOf(hidePage);
    check('báo cáo bài bị ẩn tự chuyển resolved',
        hiddenReports[0] && hiddenReports[0].status === 'resolved'
        && hiddenReports[0].resolution.includes('ẩn'), JSON.stringify(hiddenReports[0]));

    const deleteCommentPage = await openDetail({ login: ADMIN_USERNAME });
    await deleteCommentPage.runInPage("createReport('comment', 6001, 'spam', '')");
    check('admin xoá bình luận thành công', deleteCommentPage.runInPage('deleteComment(6001)') === true);
    const commentReports = reportsOf(deleteCommentPage);
    check('báo cáo bình luận bị xoá tự chuyển resolved',
        commentReports[0] && commentReports[0].status === 'resolved'
        && commentReports[0].resolution.includes('xoá'), JSON.stringify(commentReports[0]));

    const deletePostPage = await openDetail({ login: ADMIN_USERNAME });
    await deletePostPage.runInPage("createReport('post', 5001, 'spam', '')");
    check('admin xoá bài thành công', deletePostPage.runInPage('deletePost(5001)') === true);
    const deletedReports = reportsOf(deletePostPage);
    check('báo cáo bài bị xoá tự chuyển resolved',
        deletedReports[0] && deletedReports[0].status === 'resolved'
        && deletedReports[0].resolution.includes('xoá'), JSON.stringify(deletedReports[0]));

    const normalPage = await openDetail({ login: REPORTER_USERNAME });
    await normalPage.runInPage("createReport('post', 5001, 'spam', '')");
    check('người thường không bỏ qua được báo cáo', normalPage.runInPage("dismissReport(1, 'x')") === false);

    /* ---------- 5. UI trang chi tiết ---------- */
    section('5. UI trang chi tiết');

    const uiPage = await openDetail({ login: REPORTER_USERNAME });
    const controls = uiPage.doc.querySelectorAll('[data-report-control]');
    check('hiện nút báo cáo cho bài viết và bình luận', controls.length === 2, String(controls.length));

    const postControl = uiPage.doc.querySelector('[data-report-control][data-report-type="post"]');
    const trigger = postControl ? postControl.querySelector('[data-report-open]') : null;
    check('bài viết có nút "Báo cáo"', Boolean(trigger));

    fire(trigger, 'click', uiPage.doc);
    const form = uiPage.doc.querySelector('[data-report-form]');
    check('bấm nút mở form báo cáo', Boolean(form));

    const reasonSelect = form ? form.querySelector('[data-report-reason]') : null;
    reasonSelect.value = 'other';
    fire(form, 'submit', uiPage.doc);
    await uiPage.settled();
    check('form báo lỗi khi "Khác" thiếu ghi chú',
        uiPage.doc.querySelector('[data-report-error]').textContent.includes('Khác'));

    reasonSelect.value = 'spam';
    const noteInput = form.querySelector('[data-report-note]');
    noteInput.value = 'Spam quảng cáo';
    fire(form, 'submit', uiPage.doc);
    await uiPage.settled();

    check('gửi form tạo báo cáo trong dữ liệu', reportsOf(uiPage).length === 1, String(reportsOf(uiPage).length));
    check('control đổi thành "Đã báo cáo"',
        postControl.innerHTML.includes('Đã báo cáo') && !postControl.innerHTML.includes('data-report-open'));

    const guestUiPage = await openDetail({ login: null });
    check('khách thấy liên kết đăng nhập thay vì nút báo cáo',
        guestUiPage.doc.querySelectorAll('[data-report-open]').length === 0
        && guestUiPage.doc.querySelectorAll('.report-control__login').length > 0);

    const ownPage = await openDetail({ login: REPORTER_USERNAME, search: '?id=5007' });
    check('nội dung của chính mình không có nút báo cáo',
        ownPage.doc.querySelectorAll('[data-report-control]').length === 0);

    /* ---------- 6. Tab quản trị ---------- */
    section('6. Tab quản trị');

    const reports = [
        makeReport({ id: 8001, targetType: 'post', targetId: '5001', postId: '5001', reason: 'spam', note: '<script>alert(1)</script>' }),
        makeReport({ id: 8002, targetType: 'comment', targetId: '6001', postId: '5001', excerpt: 'Bình luận bị báo cáo', reason: 'offensive' }),
        makeReport({ id: 8003, status: 'resolved', resolution: 'Đã xử lý trước đó', handledBy: ADMIN_USERNAME }),
        makeReport({ id: 8004, targetType: 'post', targetId: '5002', postId: '5002', reason: 'misleading' }),
        makeReport({ id: 8005, targetType: 'post', targetId: '5003', postId: '5003', targetAuthor: AUTHOR_USERNAME, reason: 'offensive' }),
        makeReport({ id: 8006, targetType: 'post', targetId: '5004', postId: '5004', targetAuthor: 'other', reason: 'off_topic' }),
    ];
    const adminPage = await openAdmin(reports);
    const view = adminViewHtml(adminPage);

    check('tab reports đăng ký mục reports-manager',
        adminPage.el('admin-panel').innerHTML.includes('data-admin-section="reports-manager"'));
    check('mặc định chỉ hiện báo cáo đang mở', view.includes('#8001') && view.includes('#8002')
        && !view.includes('#8003'), view.replace(/\s+/g, ' ').slice(0, 180));
    check('escape HTML trong ghi chú',
        view.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && !view.includes('<script>alert(1)</script>'));
    check('có nút xử lý cho báo cáo đang mở',
        (view.match(/data-admin-reports-action=/g) || []).length >= 6);

    const resolvedButton = adminPage.el('admin-panel').querySelector('[data-admin-reports-status="resolved"]');
    fire(resolvedButton, 'click', adminPage.doc);
    check('lọc "Đã xử lý" hiện báo cáo resolved',
        adminViewHtml(adminPage).includes('#8003') && !adminViewHtml(adminPage).includes('#8001'));

    const openButton = adminPage.el('admin-panel').querySelector('[data-admin-reports-status="open"]');
    fire(openButton, 'click', adminPage.doc);

    check('mở xác nhận bỏ qua báo cáo 8001', clickAdminAction(adminPage, '8001', 'dismiss') === true
        && Boolean(adminPage.el('admin-panel').querySelector('[data-admin-reports-confirm]')));
    fillAdminNote(adminPage, 'Không vi phạm');
    confirmAdminAction(adminPage);
    await adminPage.settled();

    const dismissed = reportsOf(adminPage).find((report) => String(report.id) === '8001');
    check('báo cáo 8001 -> dismissed + lưu người xử lý/ghi chú',
        dismissed && dismissed.status === 'dismissed'
        && dismissed.handledBy === ADMIN_USERNAME
        && dismissed.resolution === 'Không vi phạm',
        JSON.stringify(dismissed));

    check('mở xác nhận ẩn bài cho báo cáo 8004', clickAdminAction(adminPage, '8004', 'hide') === true);
    confirmAdminAction(adminPage);
    await adminPage.settled();
    check('ẩn bài 5002 qua báo cáo', Boolean(storedPost(adminPage, 5002) && storedPost(adminPage, 5002).hidden === true));
    check('báo cáo 8004 tự chuyển resolved',
        reportsOf(adminPage).find((report) => String(report.id) === '8004').status === 'resolved');

    check('mở xác nhận xoá bình luận 8002', clickAdminAction(adminPage, '8002', 'delete-comment') === true);
    confirmAdminAction(adminPage);
    await adminPage.settled();
    check('xoá bình luận 6001 qua báo cáo', storedComment(adminPage, 6001) === null);
    check('báo cáo 8002 tự chuyển resolved',
        reportsOf(adminPage).find((report) => String(report.id) === '8002').status === 'resolved');

    check('mở xác nhận cảnh cáo 8005', clickAdminAction(adminPage, '8005', 'warn') === true);
    confirmAdminAction(adminPage);
    await adminPage.settled();
    check('cảnh cáo bắt buộc lý do tối thiểu 3 ký tự',
        adminViewHtml(adminPage).includes('ít nhất 3 ký tự'));

    fillAdminNote(adminPage, 'Vi phạm nhiều lần');
    confirmAdminAction(adminPage);
    await adminPage.settled();
    const warnedUser = (adminPage.readKey('aov_users') || []).find((user) => user.username === AUTHOR_USERNAME);
    check('cảnh cáo tài khoản demo thành công', warnedUser && Array.isArray(warnedUser.warnings)
        && warnedUser.warnings.length === 1, JSON.stringify(warnedUser && warnedUser.warnings));
    check('báo cáo 8005 -> resolved',
        reportsOf(adminPage).find((report) => String(report.id) === '8005').status === 'resolved');

    check('mở xác nhận cấm 8006', clickAdminAction(adminPage, '8006', 'ban') === true);
    confirmAdminAction(adminPage);
    await adminPage.settled();
    const bannedUser = (adminPage.readKey('aov_users') || []).find((user) => user.username === 'other');
    check('cấm tài khoản other qua báo cáo', bannedUser && bannedUser.banned === true);
    check('báo cáo 8006 -> resolved',
        reportsOf(adminPage).find((report) => String(report.id) === '8006').status === 'resolved');
    check('không dùng alert/confirm trong luồng xử lý', adminPage.alerts.length === 0, adminPage.alerts.join(' | '));
    check('trang quản trị không phát sinh console.error', adminPage.errors.length === 0, adminPage.errors.join(' | '));

    /* ---------- Tổng kết ---------- */
    console.log('\n' + '='.repeat(52));
    console.log(`Kết quả: ${passed} PASS, ${failures.length} FAIL`);

    if (failures.length) {
        console.log('\nCác test thất bại:');
        failures.forEach((name) => console.log(' - ' + name));
        process.exitCode = 1;
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
