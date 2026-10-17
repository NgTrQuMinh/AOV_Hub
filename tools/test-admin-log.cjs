/**
 * Test mục "Nhật ký thao tác" (src/js/admin-log.js + adminlog.js clearAdminLog()).
 * Task KD11.
 *
 * Chạy code thật của dự án trong mini-dom: dựng trang admin.html thật, nạp script thật.
 * Riêng admin-log.js do admin-shell.js nạp ĐỘNG (thẻ <script> chèn lúc mở tab) nên
 * mini-dom không tự chạy; test chủ động chèn file vào ngữ cảnh trang rồi gọi lại
 * renderAdminTabSections() — đúng cách file được nạp khi mở tab thật.
 *
 * Phạm vi:
 *   1. renderAdminLogSection() vẽ bảng nhật ký mới nhất trước, nhãn hành động/đối tượng
 *      tiếng Việt, badge theo mức hành động.
 *   2. escapeHtml: chi tiết chứa thẻ HTML không tạo markup thật.
 *   3. Số liệu: tổng / đang hiển thị / hôm nay.
 *   4. Lọc theo từ khoá và theo loại đối tượng (đổi ô nhập / select -> bảng vẽ lại).
 *   5. Nút "Xoá nhật ký" (có xác nhận) -> clearAdminLog(); nhật ký trống -> cảnh báo.
 *   6. Chặn quyền: ngoài admin chỉ thấy thông báo; clearAdminLog() trả false.
 *
 * Chạy: node tools/test-admin-log.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire } = require('./mini-dom.cjs');

const ADMIN_PAGE = 'src/pages/admin.html';
const ADMIN_LOG_JS = fs.readFileSync(path.join(ROOT, 'src/js/admin-log.js'), 'utf8');

/** Tài khoản quản trị viên trong data/users.json. */
const ADMIN_USERNAME = 'admin';

/**
 * Nhật ký mẫu: 1 bản ghi HÔM NAY (để đếm "hôm nay") + 5 bản ghi cũ đủ loại hành động,
 * targetType (post/user/backup) và badge (approved/banned/rejected/admin).
 */
const ENTRIES = [
    { id: 6, time: new Date().toISOString(), admin: 'admin', action: 'hide-post', targetType: 'post', targetId: 7103, detail: 'Ẩn bài viết <script>alert(1)</script>' },
    { id: 5, time: '2025-05-05T08:00:00.000Z', admin: 'admin', action: 'approve-post', targetType: 'post', targetId: 7101, detail: 'Bài hay' },
    { id: 4, time: '2025-05-04T08:00:00.000Z', admin: 'admin', action: 'delete-post', targetType: 'post', targetId: 7102, detail: 'Spam' },
    { id: 3, time: '2025-05-03T08:00:00.000Z', admin: 'mod2', action: 'user.warn', targetType: 'user', targetId: 'aovfan', detail: 'Cảnh cáo nhẹ' },
    { id: 2, time: '2025-05-02T08:00:00.000Z', admin: 'admin', action: 'user.ban', targetType: 'user', targetId: 'spammer', detail: 'Vi phạm nặng' },
    { id: 1, time: '2025-05-01T08:00:00.000Z', admin: 'admin', action: 'backup.export', targetType: 'backup', targetId: '', detail: 'Xuất sao lưu' },
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

/** localStorage dựng sẵn nhật ký (key aov_admin_log). */
function seedStorage(entries) {
    return new Map([['aov_admin_log', JSON.stringify(entries)]]);
}

/** Mở tab "Nhật ký" thật, chèn admin-log.js rồi vẽ mục. */
async function openAdminLog(options = {}) {
    const page = loadPage(Object.assign({
        page: ADMIN_PAGE,
        login: ADMIN_USERNAME,
        search: '?tab=log',
        storage: seedStorage(ENTRIES),
    }, options));

    page.run();
    await page.settled();
    await page.settled();

    // Giống bước admin-shell.js chèn <script src=...admin-log.js>: mini-dom không chạy
    // được script động nên chèn thẳng mã vào ngữ cảnh trang (đăng ký mục + gắn listener).
    page.runInPage(ADMIN_LOG_JS);

    // Vẽ lại mục "log" sau khi đã đăng ký.
    await page.runInPage("renderAdminTabSections(document.getElementById('admin-panel'), 'log')");
    await page.settled();

    return page;
}

/**
 * Nội dung đang vẽ của mục nhật ký. Bảng + số liệu nằm trong node con
 * [data-admin-log-view] (mini-dom lưu innerHTML theo từng node, không ghép lại
 * từ cây con), nên đọc thẳng node đó.
 */
function logBodyHtml(page) {
    const view = page.el('admin-panel').querySelector('[data-admin-log-view]');
    return view ? view.innerHTML : '';
}

/** Các dòng bảng nhật ký, theo đúng thứ tự hiển thị; dùng để kiểm tra sắp xếp. */
function logRows(page) {
    return page.el('admin-panel').querySelectorAll('[data-admin-log-row]');
}

/* ================= Test ================= */

(async () => {
    /* ---------- 1. Đăng ký + vẽ bảng ---------- */
    section('1. renderAdminLogSection()');

    const page = await openAdminLog();
    const html = logBodyHtml(page);

    check('#admin-panel có mục "admin-log" và tiêu đề "Nhật ký thao tác"',
        page.el('admin-panel').innerHTML.includes('data-admin-section="admin-log"')
        && page.el('admin-panel').innerHTML.includes('Nhật ký thao tác'),
        page.el('admin-panel').innerHTML.replace(/\s+/g, ' ').slice(0, 160));

    const rows = logRows(page);
    check('bảng có đúng 6 dòng nhật ký', rows.length === 6, rows.length + ' dòng');
    check('dòng mới nhất (id 6, hôm nay) đứng đầu',
        rows.length === 6 && rows[0].dataset.adminLogRow === '6',
        rows.map((row) => row.dataset.adminLogRow).join(','));

    /* ---------- 2. Nhãn hành động / đối tượng / badge ---------- */
    section('2. Nhãn và badge');

    check('dịch mã hành động sang nhãn tiếng Việt',
        html.includes('Duyệt bài viết')
        && html.includes('Xoá bài viết')
        && html.includes('Khoá tài khoản')
        && html.includes('Cảnh cáo tài khoản')
        && html.includes('Xuất sao lưu')
        && html.includes('Ẩn bài viết'));

    check('dịch loại đối tượng sang nhãn tiếng Việt',
        html.includes('Bài viết') && html.includes('Người dùng') && html.includes('Sao lưu'));

    check('badge theo mức: approved / banned / rejected / admin',
        html.includes('admin-badge--approved')
        && html.includes('admin-badge--banned')
        && html.includes('admin-badge--rejected')
        && html.includes('admin-badge--admin'));

    /* ---------- 3. escapeHtml ---------- */
    section('3. escapeHtml');

    check('chi tiết chứa thẻ HTML bị escape (không tạo markup thật)',
        html.includes('&lt;script&gt;') && !html.includes('<script>alert(1)</script>'),
        html.includes('&lt;script&gt;'));

    /* ---------- 4. Số liệu ---------- */
    section('4. Số liệu');

    check('tổng = 6 và hôm nay = 1',
        html.includes('admin-stat__value">6<') && html.includes('admin-stat__value">1<'));

    /* ---------- 5. Lọc theo từ khoá ---------- */
    section('5. Lọc theo từ khoá');

    const keywordInput = page.el('admin-panel').querySelector('[data-admin-log-keyword]');
    check('có ô tìm kiếm nhật ký', Boolean(keywordInput));

    if (keywordInput) keywordInput.value = 'aovfan';
    fire(keywordInput, 'input', page.doc);
    await page.settled();

    check('từ khoá "aovfan" -> chỉ còn 1 dòng (đối tượng aovfan)',
        logRows(page).length === 1
        && logRows(page)[0].dataset.adminLogRow === '3'
        && logBodyHtml(page).includes('admin-stat__value">1<'),
        logRows(page).map((row) => row.dataset.adminLogRow).join(','));
    check('ô tìm kiếm được giữ nguyên (không vẽ lại thanh công cụ)',
        page.el('admin-panel').querySelector('[data-admin-log-keyword]') === keywordInput);

    /* ---------- 6. Lọc theo loại đối tượng ---------- */
    section('6. Lọc theo loại đối tượng');

    // Xoá từ khoá trước để chỉ còn phép lọc theo loại.
    if (keywordInput) keywordInput.value = '';
    fire(keywordInput, 'input', page.doc);
    await page.settled();

    const targetSelect = page.el('admin-panel').querySelector('[data-admin-log-target]');
    check('có select lọc theo loại đối tượng', Boolean(targetSelect));

    if (targetSelect) targetSelect.value = 'user';
    fire(targetSelect, 'change', page.doc);
    await page.settled();

    check('lọc "user" -> 2 dòng (id 3 và 2)',
        logRows(page).length === 2
        && logRows(page).map((row) => row.dataset.adminLogRow).join(',') === '3,2',
        logRows(page).map((row) => row.dataset.adminLogRow).join(','));

    if (targetSelect) targetSelect.value = 'backup';
    fire(targetSelect, 'change', page.doc);
    await page.settled();

    check('lọc "backup" -> 1 dòng (id 1)',
        logRows(page).length === 1 && logRows(page)[0].dataset.adminLogRow === '1',
        logRows(page).map((row) => row.dataset.adminLogRow).join(','));

    // Từ khoá không khớp -> thông báo "không khớp bộ lọc" nhưng vẫn còn dữ liệu.
    if (targetSelect) targetSelect.value = 'all';
    fire(targetSelect, 'change', page.doc);
    if (keywordInput) keywordInput.value = 'khong-co-gi-khop';
    fire(keywordInput, 'input', page.doc);
    await page.settled();

    check('từ khoá không khớp -> bảng rỗng + thông báo "không khớp bộ lọc"',
        logRows(page).length === 0
        && logBodyHtml(page).includes('Không có bản ghi nào khớp bộ lọc'),
        logBodyHtml(page).replace(/\s+/g, ' ').slice(0, 120));

    /* ---------- 7. Xoá nhật ký ---------- */
    section('7. Xoá nhật ký');

    const clearBtn = page.el('admin-panel').querySelector('[data-admin-log-clear]');
    check('có nút "Xoá nhật ký"', Boolean(clearBtn));

    // Đặt lại tìm kiếm để bảng hiện đủ dữ liệu trước khi xoá.
    if (keywordInput) keywordInput.value = '';
    fire(keywordInput, 'input', page.doc);
    await page.settled();

    fire(clearBtn, 'click', page.doc);
    await page.settled();

    check('sau khi xoá: aov_admin_log rỗng',
        Array.isArray(page.readKey('aov_admin_log')) && page.readKey('aov_admin_log').length === 0,
        JSON.stringify(page.readKey('aov_admin_log')));
    check('sau khi xoá: bảng rỗng + thông báo "Chưa có thao tác"',
        logRows(page).length === 0
        && logBodyHtml(page).includes('Chưa có thao tác quản trị nào được ghi'),
        logBodyHtml(page).replace(/\s+/g, ' ').slice(0, 120));

    /* ---------- 8. Nhật ký trống + chặn quyền ---------- */
    section('8. Nhật ký trống & chặn quyền');

    const emptyPage = await openAdminLog({ storage: new Map() });
    check('chưa có bản ghi -> hiện thông báo "Chưa có thao tác"',
        logRows(emptyPage).length === 0
        && logBodyHtml(emptyPage).includes('Chưa có thao tác quản trị nào được ghi'));

    const emptyClearBtn = emptyPage.el('admin-panel').querySelector('[data-admin-log-clear]');
    fire(emptyClearBtn, 'click', emptyPage.doc);
    await emptyPage.settled();
    check('bấm "Xoá nhật ký" khi trống -> cảnh báo "Nhật ký đang trống."',
        emptyPage.alerts.some((message) => message.includes('Nhật ký đang trống')),
        JSON.stringify(emptyPage.alerts));

    // clearAdminLog() tự chặn khi không phải admin (dù gọi thẳng từ console).
    check('clearAdminLog() trả false khi không phải admin và không đổi dữ liệu',
        emptyPage.runInPage('isAdmin = function () { return false; }; clearAdminLog()') === false);
    check('renderAdminLogSection() ngoài admin -> chỉ thông báo quyền',
        emptyPage.runInPage(`
            (function () {
                isAdmin = function () { return false; };
                var body = document.getElementById('admin-panel').querySelector('.admin-section__body');
                return renderAdminLogSection(body).then(function () { return body.innerHTML; });
            })()
        `).then((value) => String(value).includes('Chỉ quản trị viên')));

    /* ---------- 9. Không lỗi JavaScript ---------- */
    section('9. Không lỗi JavaScript');

    const allPages = [page, emptyPage];
    const jsErrors = allPages.flatMap((p) => p.errors.filter((error) => !error.startsWith('console.error')));
    check('không lần mở trang nào ném lỗi JavaScript', jsErrors.length === 0, jsErrors.join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})();
