/**
 * Test khung quản lý (src/js/admin-shell.js + src/pages/admin.html).
 *
 * Chạy code thật của dự án trong mini-dom: dựng trang thật, nạp script thật,
 * không mock logic. Chỉ "reload" mô phỏng bằng cách mở lại trang với cùng Map.
 *
 * Phạm vi kiểm tra (RIÊNG phần khung, không lặp lại test-admin-page.cjs và
 * test-hero-admin.cjs):
 *   1. Dữ liệu menu: ADMIN_GROUPS, ADMIN_TABS, getAdminMenuGroups().
 *   2. Markup menu dọc: brand, nút thoát, nhóm, liên kết, mục đang chọn.
 *   3. getActiveAdminTab(): ?tab=, giá trị lạ, ưu tiên data-admin-tab trên <body>.
 *   4. Badge: getAdminTabBadgeCount(), buildAdminLinkInner(), refreshAdminBadges().
 *   5. Phân quyền fail-closed: khách / user thường / dữ liệu users hỏng.
 *   6. registerAdminSection(), tab chưa có script, heroes, ẩn/hiện panel.
 *
 * Chạy: node tools/test-admin-shell.cjs
 */
const path = require('path');

const { loadPage } = require('./mini-dom.cjs');

const ADMIN_PAGE = 'src/pages/admin.html';

/** Tài khoản quản trị viên trong data/users.json */
const ADMIN_USERNAME = 'admin';
/** Tài khoản thường (không phải admin) */
const USER_USERNAME = 'aovfan';

/** Danh sách tab đúng thứ tự (hợp đồng của shell). */
const EXPECTED_TAB_IDS = ['posts', 'pending', 'reports', 'users', 'heroes', 'items', 'builds', 'log', 'data', 'settings'];
/** Nhóm menu đúng thứ tự. */
const EXPECTED_GROUPS = ['Nội dung', 'Cộng đồng', 'Dữ liệu game', 'Hệ thống'];

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

/** Mở trang admin.html và chờ render xong (shell chờ usersReady rồi vẽ). */
async function openAdmin(options = {}) {
    const page = loadPage(Object.assign({ page: ADMIN_PAGE }, options));
    page.run();
    await page.settled();
    await page.settled();
    return page;
}

/** Đọc dữ liệu menu trực tiếp từ ADMIN_TABS / ADMIN_GROUPS / getAdminMenuGroups(). */
function readMenuData(page) {
    return JSON.parse(page.runInPage(`JSON.stringify({
        groups: ADMIN_GROUPS,
        tabs: ADMIN_TABS.map(function (tab) {
            return { id: tab.id, label: tab.label, group: tab.group, icon: tab.icon, page: tab.page, external: !!tab.external, badge: tab.badge || '' };
        }),
        menuGroups: getAdminMenuGroups().map(function (group) {
            return { group: group.group, tabs: group.tabs.map(function (tab) { return tab.id; }) };
        }),
    })`));
}

/** Vị trí chuỗi con trong chuỗi lớn (dùng kiểm tra thứ tự nhóm trong innerHTML). */
const indexOfAll = (haystack, needles) => needles.map((needle) => haystack.indexOf(needle));
const isAscending = (values) => values.every((value, index) => value !== -1 && (index === 0 || value > values[index - 1]));

/* ================= Test ================= */

(async () => {
    /* ---------- 1. Dữ liệu menu ---------- */
    section('1. Dữ liệu menu (ADMIN_GROUPS / ADMIN_TABS / getAdminMenuGroups)');

    const admin = await openAdmin({ login: ADMIN_USERNAME });
    const menuData = readMenuData(admin);

    check('ADMIN_GROUPS đúng 4 nhóm theo thứ tự',
        JSON.stringify(menuData.groups) === JSON.stringify(EXPECTED_GROUPS),
        JSON.stringify(menuData.groups));
    check('ADMIN_TABS có đúng 10 tab, id đúng thứ tự',
        menuData.tabs.length === 10
        && JSON.stringify(menuData.tabs.map((tab) => tab.id)) === JSON.stringify(EXPECTED_TAB_IDS),
        menuData.tabs.map((tab) => tab.id).join(', '));
    check('mỗi tab có label không rỗng và group thuộc ADMIN_GROUPS',
        menuData.tabs.every((tab) => typeof tab.label === 'string' && tab.label.trim().length > 0
            && EXPECTED_GROUPS.includes(tab.group)),
        JSON.stringify(menuData.tabs.map((tab) => tab.id + ':' + tab.group)));
    check('mỗi tab có icon là chuỗi <svg> không rỗng',
        menuData.tabs.every((tab) => typeof tab.icon === 'string' && tab.icon.indexOf('<svg') === 0),
        JSON.stringify(menuData.tabs.map((tab) => String(tab.icon).slice(0, 12))));
    check('id các tab không trùng nhau',
        new Set(menuData.tabs.map((tab) => tab.id)).size === menuData.tabs.length);

    check('getAdminMenuGroups() trả 4 nhóm đúng thứ tự, số mục 3/1/3/3',
        JSON.stringify(menuData.menuGroups.map((group) => group.group)) === JSON.stringify(EXPECTED_GROUPS)
        && JSON.stringify(menuData.menuGroups.map((group) => group.tabs.length)) === JSON.stringify([3, 1, 3, 3]),
        JSON.stringify(menuData.menuGroups.map((group) => group.group + ':' + group.tabs.length)));
    check('gộp các nhóm lại đủ 10 tab, đúng thứ tự',
        JSON.stringify(menuData.menuGroups.flatMap((group) => group.tabs)) === JSON.stringify(EXPECTED_TAB_IDS),
        menuData.menuGroups.flatMap((group) => group.tabs).join(', '));
    check('không tab nào external hay trỏ ra hero-admin.html; heroes dùng admin.html?tab=heroes',
        menuData.tabs.every((tab) => !tab.external && String(tab.page).indexOf('hero-admin.html') === -1)
        && menuData.tabs.find((tab) => tab.id === 'heroes').page === 'admin.html?tab=heroes',
        menuData.tabs.map((tab) => tab.page).join(', '));

    /* ---------- 2. Markup menu dọc ---------- */
    section('2. Markup menu dọc');

    const menu = admin.el('admin-tabs');
    const menuHtml = menu.innerHTML;
    const menuLinks = menu.querySelectorAll('.admin-sidebar__link[data-admin-tab]');

    check('#admin-tabs chứa .admin-sidebar với <nav class="admin-sidebar__nav">',
        menu.querySelectorAll('.admin-sidebar').length === 1
        && menu.querySelectorAll('.admin-sidebar__nav').length === 1,
        menu.querySelectorAll('.admin-sidebar').length + ' sidebar');
    check('menu có tiêu đề "Quản lý" và tên tài khoản đang đăng nhập',
        menuHtml.includes('admin-sidebar__title">Quản lý<')
        && menuHtml.includes('admin-sidebar__sub">' + ADMIN_USERNAME + '<'),
        menuHtml.replace(/\s+/g, ' ').slice(0, 160));

    const exitLink = menu.querySelector('.admin-sidebar__exit');
    check('nút thoát là liên kết ĐẦU TIÊN trong nav, href về trang chủ',
        Boolean(exitLink)
        && menu.querySelectorAll('.admin-sidebar__link')[0] === exitLink
        && /\/index\.html$/.test(exitLink.getAttribute('href') || ''),
        exitLink ? exitLink.getAttribute('href') : 'không có nút thoát');
    check('nút thoát KHÔNG có data-admin-tab và KHÔNG is-active',
        Boolean(exitLink)
        && exitLink.getAttribute('data-admin-tab') === null
        && exitLink.getAttribute('class').indexOf('is-active') === -1,
        exitLink ? exitLink.getAttribute('class') : '');

    check('có đủ 4 tiêu đề nhóm đúng chữ và đúng thứ tự',
        isAscending(indexOfAll(menuHtml, EXPECTED_GROUPS.map((group) => '>' + group + '<p')))
        || isAscending(indexOfAll(menuHtml, EXPECTED_GROUPS)),
        EXPECTED_GROUPS.map((group) => group + '@' + menuHtml.indexOf('>' + group + '<')).join(' '));
    check('có đúng 10 liên kết [data-admin-tab]',
        menuLinks.length === 10,
        menuLinks.length + ' liên kết');
    check('mỗi liên kết có icon (.admin-sidebar__icon) và nhãn (.admin-sidebar__label)',
        menuLinks.every((link) => link.querySelector('.admin-sidebar__icon') && link.querySelector('.admin-sidebar__label'))
        && menuData.tabs.every((tab) => menuHtml.includes('admin-sidebar__label">' + tab.label + '</span>'))
        && (menuHtml.match(/<svg/g) || []).length === 11,
        (menuHtml.match(/<svg/g) || []).length + ' svg');
    check('mặc định chỉ MỘT mục is-active và đó là "posts" (có aria-current="page")',
        menu.querySelectorAll('.admin-sidebar__link.is-active').length === 1
        && menu.querySelector('.admin-sidebar__link.is-active').dataset.adminTab === 'posts'
        && menu.querySelector('.admin-sidebar__link.is-active').getAttribute('aria-current') === 'page',
        menu.querySelectorAll('.admin-sidebar__link.is-active').map((link) => link.dataset.adminTab).join(', '));
    check('không còn markup cũ <nav class="admin-tabs">',
        admin.runInPage("document.querySelectorAll('nav.admin-tabs').length") === 0);

    /* ---------- 3. Chọn mục đang mở ---------- */
    section('3. getActiveAdminTab()');

    check('không có ?tab= -> mặc định "posts"',
        admin.runInPage('getActiveAdminTab()') === 'posts');

    const userTab = await openAdmin({ login: ADMIN_USERNAME, search: '?tab=users' });
    check('?tab=users -> tab "users" và link users is-active (posts thì không)',
        userTab.runInPage('getActiveAdminTab()') === 'users'
        && userTab.el('admin-tabs').querySelector('.admin-sidebar__link[data-admin-tab="users"]').getAttribute('class').includes('is-active')
        && !userTab.el('admin-tabs').querySelector('.admin-sidebar__link[data-admin-tab="posts"]').getAttribute('class').includes('is-active'),
        userTab.el('admin-tabs').querySelectorAll('.admin-sidebar__link.is-active').map((link) => link.dataset.adminTab).join(', '));

    const unknownTab = await openAdmin({ login: ADMIN_USERNAME, search: '?tab=khong-co' });
    check('?tab=không-có -> rơi về "posts"',
        unknownTab.runInPage('getActiveAdminTab()') === 'posts'
        && unknownTab.el('admin-tabs').querySelector('.admin-sidebar__link.is-active').dataset.adminTab === 'posts',
        unknownTab.runInPage('getActiveAdminTab()'));

    const overrideTab = await openAdmin({ login: ADMIN_USERNAME, search: '?tab=users' });
    check('data-admin-tab trên <body> ưu tiên hơn ?tab= trên URL',
        overrideTab.runInPage("document.body.dataset.adminTab='reports'; getActiveAdminTab()") === 'reports',
        overrideTab.runInPage('getActiveAdminTab()'));

    /* ---------- 4. Badge ---------- */
    section('4. Badge');

    check('getAdminTabBadgeCount() lấy đúng nguồn: pending/reports, tab không badge = 0',
        admin.runInPage("getAdminTabBadgeCount(ADMIN_TABS.find(function (t) { return t.id === 'pending'; }), { pending: 5, reports: 3 })") === 5
        && admin.runInPage("getAdminTabBadgeCount(ADMIN_TABS.find(function (t) { return t.id === 'reports'; }), { pending: 5, reports: 3 })") === 3
        && admin.runInPage("getAdminTabBadgeCount(ADMIN_TABS.find(function (t) { return t.id === 'posts'; }), { pending: 5, reports: 3 })") === 0);
    check('số âm / không phải số đều chuẩn hoá về 0',
        admin.runInPage("getAdminTabBadgeCount(ADMIN_TABS.find(function (t) { return t.id === 'pending'; }), { pending: -3 })") === 0
        && admin.runInPage("getAdminTabBadgeCount(ADMIN_TABS.find(function (t) { return t.id === 'pending'; }), {})") === 0);
    check('badge lớn hơn 99 hiển thị "99+"',
        admin.runInPage("buildAdminLinkInner(ADMIN_TABS[1], 150).includes('>99+</span>')") === true
        && admin.runInPage("buildAdminLinkInner(ADMIN_TABS[1], 5).includes('>5</span>')") === true);
    check('badge = 0 thì không vẽ phần tử .admin-sidebar__badge',
        admin.runInPage("buildAdminLinkInner(ADMIN_TABS[1], 0).includes('admin-sidebar__badge')") === false);

    // Ép số badge để chắc chắn refreshAdminBadges() có việc làm.
    const refreshed = await admin.runInPage(`
        (function () {
            getAdminBadgeCounts = function () { return Promise.resolve({ pending: 7, reports: 2 }); };
            return refreshAdminBadges().then(function () {
                var pending = document.querySelector('.admin-sidebar__link[data-admin-tab="pending"]');
                var reports = document.querySelector('.admin-sidebar__link[data-admin-tab="reports"]');
                var posts = document.querySelector('.admin-sidebar__link[data-admin-tab="posts"]');
                var exit = document.querySelector('.admin-sidebar__exit');
                return {
                    pendingHasBadge: !!(pending && pending.querySelector('.admin-sidebar__badge')),
                    reportsHasBadge: !!(reports && reports.querySelector('.admin-sidebar__badge')),
                    pendingFull: pending ? pending.innerHTML : null,
                    reportsFull: reports ? reports.innerHTML : null,
                    pendingDataBadge: pending && pending.querySelector('.admin-sidebar__badge') ? pending.querySelector('.admin-sidebar__badge').getAttribute('data-admin-badge') : null,
                    reportsDataBadge: reports && reports.querySelector('.admin-sidebar__badge') ? reports.querySelector('.admin-sidebar__badge').getAttribute('data-admin-badge') : null,
                    postsBadge: posts && !!posts.querySelector('.admin-sidebar__badge'),
                    exitBadge: exit && !!exit.querySelector('.admin-sidebar__badge'),
                    exitLabel: exit && !!exit.querySelector('.admin-sidebar__label'),
                };
            });
        })()
    `);
    check('refreshAdminBadges() cập nhật số lên ĐÚNG link pending/reports',
        Boolean(refreshed) && refreshed.pendingHasBadge && refreshed.reportsHasBadge
        && refreshed.pendingFull && refreshed.pendingFull.includes('>7<')
        && refreshed.reportsFull && refreshed.reportsFull.includes('>2<')
        && refreshed.pendingDataBadge === 'pending' && refreshed.reportsDataBadge === 'reports',
        JSON.stringify(refreshed));
    check('refreshAdminBadges() không đụng nút thoát và mục không có badge',
        Boolean(refreshed) && refreshed.exitBadge === false && refreshed.exitLabel === true && refreshed.postsBadge === false,
        refreshed ? JSON.stringify(refreshed) : 'refreshed undefined');

    /* ---------- 5. Phân quyền fail-closed ---------- */
    section('5. Phân quyền fail-closed');

    const guest = await openAdmin({ storage: new Map() });
    check('khách bị đưa về trang Login, không vẽ menu',
        guest.location.href.includes('/src/pages/login.html')
        && guest.el('admin-tabs').innerHTML === ''
        && guest.el('admin-tabs').querySelectorAll('.admin-sidebar').length === 0,
        guest.location.href);

    const stranger = await openAdmin({ login: USER_USERNAME });
    check('user thường bị cảnh báo + chuyển về trang chủ, không vẽ menu',
        stranger.alerts.some((message) => /không có quyền/i.test(message))
        && stranger.location.href === '/index.html'
        && stranger.el('admin-tabs').innerHTML === '',
        JSON.stringify(stranger.alerts) + ' | ' + stranger.location.href);
    check('user thường không thấy nút thoát và không nạp script tab nào',
        stranger.el('admin-tabs').querySelectorAll('.admin-sidebar__exit').length === 0
        && stranger.runInPage('JSON.stringify(ADMIN_LOADED_SCRIPTS)') === '{}',
        stranger.runInPage('JSON.stringify(ADMIN_LOADED_SCRIPTS)'));

    const brokenUsers = await openAdmin({ storage: new Map(), data: { 'users.json': null } });
    const brokenErrors = brokenUsers.errors.filter((error) => !error.startsWith('console.error'));
    check('dữ liệu users hỏng -> isAdmin() false, không vẽ menu, không ném lỗi',
        brokenUsers.runInPage('isAdmin()') === false
        && brokenUsers.el('admin-tabs').innerHTML === ''
        && brokenErrors.length === 0,
        brokenUsers.runInPage('isAdmin()') + ' | ' + brokenErrors.join(' | '));

    /* ---------- 6. registerAdminSection và nội dung tab ---------- */
    section('6. registerAdminSection và nội dung tab');

    check('registerAdminSection() là hàm và từ chối tham số sai',
        admin.runInPage('typeof registerAdminSection') === 'function'
        && admin.runInPage("registerAdminSection('', 'x', 'X', function () {})") === false
        && admin.runInPage("registerAdminSection('log', 'x', 'X', 'khong-phai-ham')") === false);

    const regPage = await openAdmin({ login: ADMIN_USERNAME, search: '?tab=users' });
    const registered = await regPage.runInPage(`
        (function () {
            var calls = 0;
            var arg = null;
            var ok = registerAdminSection('users', 'users-test', 'Mục thử', function (container) { calls += 1; arg = container; });
            return renderAdminTabSections(document.getElementById('admin-panel'), 'users').then(function () {
                return {
                    ok: ok,
                    calls: calls,
                    html: document.getElementById('admin-panel').innerHTML,
                };
            });
        })()
    `);
    check('mục đã đăng ký được vẽ vào #admin-panel, renderFn gọi đúng một lần',
        Boolean(registered) && registered.ok === true && registered.calls === 1
        && registered.html && registered.html.includes('data-admin-section="users-test"')
        && registered.html.includes('Mục thử'),
        JSON.stringify(registered));

    // Tab "Chờ duyệt"/"Nhật ký" cần script động chưa có trong repo -> hiện "đang phát triển".
    const pendingPage = await openAdmin({ login: ADMIN_USERNAME, search: '?tab=pending' });
    check('tab chưa có script/renderer -> #admin-panel hiện khối "đang phát triển", không lỗi',
        pendingPage.el('admin-panel').innerHTML.includes('admin-empty')
        && pendingPage.el('admin-panel').innerHTML.includes('đang được phát triển')
        && pendingPage.errors.filter((error) => !error.startsWith('console.error')).length === 0,
        pendingPage.el('admin-panel').innerHTML);

    const logPage = await openAdmin({ login: ADMIN_USERNAME, search: '?tab=log' });
    check('script tab không nạp được thì bỏ qua êm (không đánh dấu "loaded"), menu vẫn vẽ',
        !Object.values(JSON.parse(logPage.runInPage('JSON.stringify(ADMIN_LOADED_SCRIPTS)'))).includes('loaded')
        && logPage.el('admin-tabs').querySelectorAll('.admin-sidebar__link[data-admin-tab]').length === 10
        && logPage.errors.filter((error) => !error.startsWith('console.error')).length === 0,
        logPage.runInPage('JSON.stringify(ADMIN_LOADED_SCRIPTS)'));
    check('loadAdminScript() với tên file không tồn tại -> bỏ qua êm, không ném lỗi',
        await logPage.runInPage("loadAdminScript('admin-khong-ton-tai.js').then(function () { return true; })") === true
        && logPage.errors.filter((error) => !error.startsWith('console.error')).length === 0,
        logPage.errors.join(' | '));

    const heroesPage = await openAdmin({ login: ADMIN_USERNAME, search: '?tab=heroes' });
    check('hero-admin.js tự đăng ký mục "Tướng": ?tab=heroes thấy #hero-admin-form trong #admin-panel',
        Boolean(heroesPage.el('admin-panel').querySelector('#hero-admin-form'))
        && heroesPage.el('admin-panel').getAttribute('hidden') === null,
        heroesPage.el('admin-panel').getAttribute('hidden'));

    const postsPage = await openAdmin({ login: ADMIN_USERNAME });
    check('mở tab khác posts -> ẩn #admin-posts-panel, hiện #admin-panel',
        heroesPage.el('admin-posts-panel').getAttribute('hidden') !== null
        && heroesPage.el('admin-panel').getAttribute('hidden') === null);
    check('mở tab posts -> hiện #admin-posts-panel, ẩn #admin-panel',
        postsPage.el('admin-posts-panel').getAttribute('hidden') === null
        && postsPage.el('admin-panel').getAttribute('hidden') !== null);

    /* ---------- 7. Không lỗi JavaScript ---------- */
    section('7. Không lỗi JavaScript');

    const allPages = [guest, stranger, brokenUsers, admin, userTab, unknownTab, overrideTab,
        regPage, pendingPage, logPage, heroesPage, postsPage];
    const jsErrors = allPages.flatMap((page) => page.errors.filter((error) => !error.startsWith('console.error')));
    check('không lần mở trang nào ném lỗi JavaScript', jsErrors.length === 0, jsErrors.join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})();
