/**
 * admin-shell.js - Khung trang quản trị nhiều tab (CM03)
 *
 * Trang: src/pages/admin.html (và dùng chung cho các trang quản trị riêng như
 * hero-admin.html nếu các trang đó đặt sẵn <div id="admin-tabs"></div>).
 *
 * MỤC ĐÍCH
 *   Trước đây phần khung trang Quản trị nằm chung trong admin.js nên nhiều người
 *   cùng sửa rất dễ đụng nhau. File này tách riêng phần "khung": vẽ thanh tab và
 *   nạp đúng file JS của từng tab. Mỗi tab là một file riêng (admin-pending.js,
 *   admin-users.js, admin-log.js...); file tab chỉ cần gọi registerAdminSection()
 *   để đăng ký các mục của mình, KHÔNG phải sửa chung admin.js.
 *
 * CƠ CHẾ ĐĂNG KÝ MỤC
 *   - registerAdminSection(tabId, sectionId, title, renderFn) đăng ký một mục vào tab.
 *   - Khi mở tab, shell vẽ mỗi mục thành <section class="admin-section"> gồm
 *     <h2 class="admin-section__title"> và một <div class="admin-section__body">,
 *     rồi gọi renderFn(body) để tab tự vẽ nội dung (có thể async).
 *   - Đăng ký trùng tabId + sectionId thì thay mục cũ nhưng GIỮ NGUYÊN vị trí.
 *   - Mục nào lỗi thì chỉ mục đó hiện thông báo đỏ, các mục khác vẫn chạy.
 *
 * DANH SÁCH TAB (giữ đúng thứ tự này)
 *   posts, pending, reports, users, heroes, items, builds, log, data, settings.
 *   - Tab "Dữ liệu" và "Cài đặt" là phần THÊM so với kế hoạch gốc.
 *   - Tab "Tướng", "Trang bị", "Build" là trang riêng (external), chỉ là liên kết.
 *   - File tab nào chưa viết xong (vd admin-reports.js chưa có) thì script 404 sẽ
 *     được bỏ qua êm; người dùng thấy "Mục này đang được phát triển." thay vì lỗi đỏ.
 *
 * MENU DỌC (bước sau)
 *   Trang quản trị sẽ đổi thành MỘT mục "Quản lý": cột trái là danh sách mục quản lý
 *   chia theo nhóm, cột phải là nội dung. Để chuẩn bị dữ liệu, mỗi phần tử ADMIN_TABS
 *   đã được thêm hai trường: group (tên nhóm trong ADMIN_GROUPS) và icon (chuỗi <svg>
 *   inline vẽ biểu tượng). Hàm getAdminMenuGroups() trả về danh sách nhóm theo thứ tự
 *   ADMIN_GROUPS để bước sau vẽ menu dọc; giao diện hiện tại vẫn dùng thanh tab ngang.
 *
 * DÙNG CHUNG KHUNG Ở TRANG RIÊNG
 *   hero-admin.html có thể đặt <div id="admin-tabs"></div> và
 *   <body data-admin-tab="heroes"> để dùng lại đúng thanh tab này. Shell đọc
 *   data-admin-tab trên <body> trước; không có thì đọc tham số ?tab= trên URL;
 *   vẫn không có thì mặc định 'posts'. Tên tab lạ cũng rơi về 'posts'.
 *
 * AN NINH
 *   "admin" ở đây CHỈ là quy ước phía trình duyệt (role trong users.json), KHÔNG
 *   có backend và không phải bảo mật thật. Vì vậy shell tự kiểm tra isAdmin() và
 *   fail-closed: chưa chắc là admin thì không vẽ gì (admin.js tự hiện thông báo).
 *
 * PHỤ THUỘC (đều kiểm tra typeof trước khi gọi nên trang thiếu file cũng không lỗi):
 *   config.js (BASE_PATH), auth.js (isAdmin / usersReady), components.js (escapeHtml),
 *   feed.js (getPosts / getPostStatus / seedPostsFromJson).
 *   Hàm của các tab sau này (không có thì bỏ qua): getPendingBuildCount(),
 *   getOpenReportCount(), getStorageUsage().
 */

/**
 * Các nhóm của menu quản lý dạng cột (bước sau), giữ đúng thứ tự này.
 * Mỗi phần tử ADMIN_TABS mang trường group chỉ đúng MỘT giá trị trong đây.
 */
const ADMIN_GROUPS = ['Nội dung', 'Cộng đồng', 'Dữ liệu game', 'Hệ thống'];

/**
 * Các tab của khung quản trị, giữ đúng thứ tự hiển thị trên thanh tab.
 *   id       mã tab (dùng trong URL ?tab= và data-admin-tab)
 *   label    chữ hiện trên tab
 *   page     file trang, nối sau BASE_PATH + 'src/pages/'
 *   scripts  các file JS của tab, nối sau BASE_PATH + 'src/js/'
 *   badge    'pending' | 'reports' — tab có gắn badge đếm số
 *   external tab trỏ sang trang riêng, shell chỉ vẽ liên kết, không nạp nội dung
 *   group    tên nhóm (một giá trị trong ADMIN_GROUPS) để vẽ menu dọc "Quản lý"
 *   icon     chuỗi <svg> inline vẽ biểu tượng của mục cho menu dọc
 */
const ADMIN_TABS = [
    {
        id: 'posts',
        label: 'Bài viết',
        page: 'admin.html?tab=posts',
        group: 'Nội dung',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"></rect><line x1="8" y1="9" x2="16" y2="9"></line><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="13" y2="17"></line></svg>',
    },
    {
        id: 'pending',
        label: 'Chờ duyệt',
        page: 'admin.html?tab=pending',
        badge: 'pending',
        scripts: ['admin-pending.js', 'admin-build-review.js'],
        group: 'Nội dung',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="7" x2="12" y2="12"></line><line x1="16" y1="14" x2="12" y2="12"></line></svg>',
    },
    {
        id: 'reports',
        label: 'Báo cáo',
        page: 'admin.html?tab=reports',
        badge: 'reports',
        scripts: ['admin-reports.js'],
        group: 'Nội dung',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="3" x2="5" y2="21"></line><path d="M5 4h12l-3 4 3 4H5"></path></svg>',
    },
    {
        id: 'users',
        label: 'Người dùng',
        page: 'admin.html?tab=users',
        scripts: ['admin-users.js'],
        group: 'Cộng đồng',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4 4-6 8-6s8 2 8 6"></path></svg>',
    },
    {
        id: 'heroes',
        label: 'Tướng',
        page: 'hero-admin.html',
        external: true,
        group: 'Dữ liệu game',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"></path></svg>',
    },
    {
        id: 'items',
        label: 'Trang bị',
        page: 'admin-items.html',
        external: true,
        group: 'Dữ liệu game',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"></path><line x1="3" y1="7" x2="12" y2="11"></line><line x1="12" y1="11" x2="21" y2="7"></line><line x1="12" y1="11" x2="12" y2="21"></line></svg>',
    },
    {
        id: 'builds',
        label: 'Build',
        page: 'admin-builds.html',
        external: true,
        group: 'Dữ liệu game',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>',
    },
    {
        id: 'log',
        label: 'Nhật ký',
        page: 'admin.html?tab=log',
        scripts: ['admin-log.js'],
        group: 'Hệ thống',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="1.6"></circle><line x1="9" y1="6" x2="20" y2="6"></line><circle cx="5" cy="12" r="1.6"></circle><line x1="9" y1="12" x2="20" y2="12"></line><circle cx="5" cy="18" r="1.6"></circle><line x1="9" y1="18" x2="20" y2="18"></line></svg>',
    },
    {
        id: 'data',
        label: 'Dữ liệu',
        page: 'admin.html?tab=data',
        scripts: ['admin-backup.js', 'admin-storage.js', 'admin-datacheck.js'],
        group: 'Hệ thống',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"></path><line x1="4" y1="12" x2="20" y2="12"></line></svg>',
    },
    {
        id: 'settings',
        label: 'Cài đặt',
        page: 'admin.html?tab=settings',
        scripts: ['admin-banned.js'],
        group: 'Hệ thống',
        icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="17" x2="20" y2="17"></line><circle cx="9" cy="7" r="2.2"></circle><circle cx="15" cy="17" r="2.2"></circle></svg>',
    },
];

/**
 * Trả về các nhóm mục quản lý để vẽ menu dọc "Quản lý" (bước sau).
 * Mỗi nhóm là { group: tên nhóm, tabs: [các phần tử ADMIN_TABS của nhóm, giữ
 * thứ tự trong ADMIN_TABS] }, sắp theo đúng thứ tự ADMIN_GROUPS. Nhóm nào
 * không có mục nào thì bỏ qua. Tab có group không nằm trong ADMIN_GROUPS
 * (hoặc thiếu group) được gom vào nhóm 'Khác' đặt cuối.
 * Hàm thuần dữ liệu: không đụng DOM, không ném lỗi.
 * @returns {Array<{ group: string, tabs: Array<object> }>}
 */
function getAdminMenuGroups() {
    const buckets = ADMIN_GROUPS.map((group) => ({ group: group, tabs: [] }));
    const other = { group: 'Khác', tabs: [] };

    for (const tab of ADMIN_TABS) {
        const bucket = buckets.find((item) => item.group === tab.group);
        if (bucket) {
            bucket.tabs.push(tab);
        } else {
            other.tabs.push(tab);
        }
    }

    const result = buckets.filter((item) => item.tabs.length > 0);
    if (other.tabs.length > 0) result.push(other);
    return result;
}

/** Mục đã đăng ký theo tab: ADMIN_SECTIONS[tabId] = [{ sectionId, title, renderFn }]. */
const ADMIN_SECTIONS = {};

/** File script tab đã từng nạp: src -> 'loaded' | 'error' | 'skipped' (nạp đúng một lần). */
const ADMIN_LOADED_SCRIPTS = {};

/** Thời gian tối đa chờ một script tab nạp xong trước khi bỏ qua (ms). */
const ADMIN_SCRIPT_TIMEOUT = 1500;

/* ---------- Tiện ích nội bộ ---------- */

/** BASE_PATH lấy từ config.js; thiếu file cấu hình thì lùi về gốc "/". */
function adminShellBasePath() {
    return typeof BASE_PATH === 'string' && BASE_PATH ? BASE_PATH : '/';
}

/**
 * Thoát ký tự HTML trước khi ghép vào innerHTML.
 * Ưu tiên escapeHtml() của components.js; nếu trang không nạp components.js thì
 * dùng bản dự phòng để shell không bao giờ lỗi ReferenceError.
 * @param {*} value
 * @returns {string}
 */
function adminShellEscape(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    if (value === null || value === undefined) return '';

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Chuẩn hoá một con số đếm: âm / không phải số / NaN đều về 0.
 * @param {*} value
 * @returns {number}
 */
function adminShellCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/* ---------- Tab đang chọn ---------- */

/**
 * Tab đang chọn: ưu tiên data-admin-tab trên <body>, rồi ?tab= trên URL, mặc định 'posts'.
 * Tên không nằm trong ADMIN_TABS (kể cả rỗng) đều trả 'posts'.
 * @returns {string} id tab
 */
function getActiveAdminTab() {
    const ids = ADMIN_TABS.map((tab) => tab.id);
    let candidate = '';

    try {
        const body = typeof document !== 'undefined' ? document.body : null;
        if (body && body.dataset && body.dataset.adminTab) {
            candidate = String(body.dataset.adminTab).trim();
        }
    } catch (error) {
        candidate = '';
    }

    if (!candidate) {
        try {
            const search = (typeof window !== 'undefined' && window.location && window.location.search)
                ? window.location.search
                : '';
            candidate = String(new URLSearchParams(search).get('tab') || '').trim();
        } catch (error) {
            candidate = '';
        }
    }

    if (!candidate) return 'posts';
    return ids.includes(candidate) ? candidate : 'posts';
}

/* ---------- Đăng ký mục của tab ---------- */

/**
 * File tab gọi hàm này lúc nạp để đăng ký một mục vào tab của mình.
 * renderFn(container) tự vẽ HTML vào container (có thể async).
 * Đăng ký trùng tabId + sectionId thì thay mục cũ nhưng giữ nguyên vị trí.
 *
 * @param {string} tabId     id tab (xem ADMIN_TABS)
 * @param {string} sectionId id mục, duy nhất trong tab
 * @param {string} title     tiêu đề mục
 * @param {Function} renderFn hàm vẽ nội dung, nhận container
 * @returns {boolean} true nếu đăng ký được, false nếu tham số sai kiểu
 */
function registerAdminSection(tabId, sectionId, title, renderFn) {
    if (typeof tabId !== 'string' || !tabId.trim()) return false;
    if (typeof sectionId !== 'string' || !sectionId.trim()) return false;
    if (typeof title !== 'string') return false;
    if (typeof renderFn !== 'function') return false;

    const key = tabId.trim();
    const id = sectionId.trim();

    if (!Array.isArray(ADMIN_SECTIONS[key])) ADMIN_SECTIONS[key] = [];

    const list = ADMIN_SECTIONS[key];
    const entry = { sectionId: id, title: title, renderFn: renderFn };
    const index = list.findIndex((item) => item.sectionId === id);

    if (index === -1) list.push(entry);
    else list[index] = entry;

    return true;
}

/* ---------- Đếm badge ---------- */

/**
 * Tính số lượng badge cho hai tab đang có badge: pending và reports.
 * Mọi lỗi đều bị nuốt và coi là 0, hàm không bao giờ ném lỗi.
 * @returns {Promise<{ pending: number, reports: number }>}
 */
async function getAdminBadgeCounts() {
    const counts = { pending: 0, reports: 0 };

    // pending: số bài đang chờ duyệt (chỉ khi feed.js đã nạp).
    try {
        if (typeof getPosts === 'function' && typeof getPostStatus === 'function') {
            // seedPostsFromJson() đảm bảo bài mẫu trong posts.json đã nạp vào bộ nhớ.
            if (typeof seedPostsFromJson === 'function') {
                await seedPostsFromJson();
            }

            const posts = getPosts();
            if (Array.isArray(posts)) {
                counts.pending += posts.filter((post) => getPostStatus(post) === 'pending').length;
            }
        }
    } catch (error) {
        // Không đọc được bài viết: coi như 0, không làm sập thanh tab.
    }

    // pending: cộng thêm số build đang chờ duyệt (nếu tab Build cung cấp hàm này).
    try {
        if (typeof getPendingBuildCount === 'function') {
            counts.pending += adminShellCount(await getPendingBuildCount());
        }
    } catch (error) {
        // Bỏ qua.
    }

    // reports: số báo cáo đang mở (nếu tab Báo cáo cung cấp hàm này).
    try {
        if (typeof getOpenReportCount === 'function') {
            counts.reports += adminShellCount(await getOpenReportCount());
        }
    } catch (error) {
        // Bỏ qua.
    }

    return counts;
}

/**
 * Tính lại số badge rồi chỉ cập nhật các .admin-tabs__badge trên thanh tab đang hiển
 * thị (thêm / đổi số / xóa), KHÔNG vẽ lại cả thanh tab. Các file tab gọi sau khi
 * duyệt hoặc từ chối bài để số trên tab đổi ngay.
 * @returns {Promise<{ pending: number, reports: number }>} số vừa tính
 */
async function refreshAdminBadges() {
    let counts = { pending: 0, reports: 0 };
    try {
        counts = await getAdminBadgeCounts();
    } catch (error) {
        counts = { pending: 0, reports: 0 };
    }

    try {
        if (typeof document === 'undefined') return counts;

        ADMIN_TABS.forEach((tab) => {
            if (!tab.badge) return;

            const link = document.querySelector('.admin-tabs__link[data-admin-tab="' + tab.id + '"]');
            if (!link) return;

            const count = tab.badge === 'pending' ? counts.pending : counts.reports;
            const badge = count > 0
                ? '<span class="admin-tabs__badge">' + adminShellEscape(count) + '</span>'
                : '';

            // Chỉ ghi lại nội dung của đúng liên kết đó, không đụng các tab khác.
            link.innerHTML = adminShellEscape(tab.label) + badge;
        });
    } catch (error) {
        // Không cập nhật được badge cũng không sao; thanh tab cũ vẫn dùng được.
    }

    return counts;
}

/* ---------- Vẽ thanh tab ---------- */

/**
 * Dựng HTML cho <nav class="admin-tabs">.
 * @param {string} activeTabId tab đang chọn
 * @param {{ pending: number, reports: number }} counts
 * @returns {string}
 */
function buildAdminTabsNav(activeTabId, counts) {
    const links = ADMIN_TABS.map((tab) => {
        const isActive = tab.id === activeTabId;
        const href = adminShellBasePath() + 'src/pages/' + tab.page;
        const className = isActive ? 'admin-tabs__link is-active' : 'admin-tabs__link';
        const current = isActive ? ' aria-current="page"' : '';

        const count = tab.badge === 'pending' ? counts.pending
            : tab.badge === 'reports' ? counts.reports
                : 0;
        const badge = (tab.badge && count > 0)
            ? '<span class="admin-tabs__badge">' + adminShellEscape(count) + '</span>'
            : '';

        return '<a class="' + className + '" href="' + adminShellEscape(href) + '"'
            + ' data-admin-tab="' + adminShellEscape(tab.id) + '"' + current + '>'
            + adminShellEscape(tab.label) + badge + '</a>';
    }).join('');

    return '<nav class="admin-tabs" aria-label="Quản trị">' + links + '</nav>';
}

/**
 * Đọc % đã dùng từ kết quả getStorageUsage() (task CM05). Chấp nhận vài tên trường
 * thường gặp để không phụ thuộc cứng vào một tên.
 * @param {object} usage
 * @returns {number|null}
 */
function readAdminStoragePercent(usage) {
    const candidates = [usage.percent, usage.usedPercent, usage.usagePercent, usage.usage];

    for (const value of candidates) {
        const number = Number(value);
        if (Number.isFinite(number)) return Math.round(number);
    }

    return null;
}

/**
 * Tạo thông báo cảnh báo LocalStorage sắp đầy (nếu getStorageUsage đã có và mức
 * khác 'ok'). Chưa có hàm này (task CM05 chưa viết) thì trả chuỗi rỗng.
 * @returns {Promise<string>} HTML của .admin-notice, hoặc ''
 */
async function buildAdminStorageNotice() {
    try {
        if (typeof getStorageUsage !== 'function') return '';

        let usage = getStorageUsage();
        if (usage && typeof usage.then === 'function') usage = await usage;

        if (!usage || typeof usage !== 'object') return '';

        const level = String(usage.level || 'ok');
        if (!level || level === 'ok') return '';

        const modifier = level === 'danger' ? 'admin-notice--danger' : 'admin-notice--warn';
        const percent = readAdminStoragePercent(usage);
        const percentText = percent === null ? '' : ' ' + percent + '%';
        const link = adminShellBasePath() + 'src/pages/admin.html?tab=data';

        return '<div class="admin-notice ' + modifier + '">'
            + 'LocalStorage đã dùng' + percentText + '. '
            + '<a href="' + adminShellEscape(link) + '">Xem chi tiết</a>'
            + '</div>';
    } catch (error) {
        return '';
    }
}

/* ---------- Nạp script và vẽ mục của tab ---------- */

/**
 * Nạp một file script tab bằng thẻ <script> chèn động.
 * - Mỗi file chỉ nạp một lần (ghi nhớ trong ADMIN_LOADED_SCRIPTS).
 * - File 404 hoặc lỗi cú pháp thì bỏ qua êm (console.warn một dòng), không báo lỗi đỏ.
 * - Môi trường DOM giả thiếu createElement/appendChild cũng không được treo.
 * @param {string} name tên file trong src/js/
 * @returns {Promise<void>}
 */
function loadAdminScript(name) {
    return new Promise((resolve) => {
        const src = adminShellBasePath() + 'src/js/' + name;

        if (ADMIN_LOADED_SCRIPTS[src]) {
            resolve();
            return;
        }

        const finish = (state) => {
            ADMIN_LOADED_SCRIPTS[src] = state;
            if (state !== 'loaded') {
                console.warn('Khung quản trị: không nạp được script tab "' + name + '", bỏ qua.');
            }
            resolve();
        };

        // Mini-DOM trong test có thể thiếu createElement.
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
            finish('skipped');
            return;
        }

        const parent = document.head || document.body || document.documentElement;
        if (!parent || typeof parent.appendChild !== 'function') {
            finish('skipped');
            return;
        }

        let script;
        try {
            script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.onload = () => finish('loaded');
            script.onerror = () => finish('error');
        } catch (error) {
            finish('error');
            return;
        }

        // Lưới an toàn: vài môi trường DOM giả không bắn onload/onerror, chờ mãi sẽ
        // treo phần vẽ mục nên hết thời gian chờ thì coi như bỏ qua.
        try {
            setTimeout(() => finish('skipped'), ADMIN_SCRIPT_TIMEOUT);
        } catch (error) {
            // Không có setTimeout thì vẫn dựa vào onload/onerror.
        }

        try {
            parent.appendChild(script);
        } catch (error) {
            finish('error');
        }
    });
}

/**
 * Nạp TUẦN TỰ, đúng thứ tự, các script của một tab.
 * @param {{ scripts?: string[] }} tab
 * @returns {Promise<void>}
 */
async function loadAdminTabScripts(tab) {
    const scripts = Array.isArray(tab.scripts) ? tab.scripts : [];

    for (const name of scripts) {
        await loadAdminScript(name);
    }
}

/**
 * Vẽ các mục đã đăng ký cho tab vào panel. Tab chưa đăng ký mục nào thì hiện
 * thông báo "đang được phát triển". Mục nào lỗi thì chỉ mục đó hiện thông báo đỏ.
 * @param {Element} container panel chứa các mục (thường là #admin-panel)
 * @param {string} tabId
 * @returns {Promise<void>}
 */
async function renderAdminTabSections(container, tabId) {
    if (!container) return;

    const sections = Array.isArray(ADMIN_SECTIONS[tabId]) ? ADMIN_SECTIONS[tabId] : [];

    if (!sections.length) {
        container.innerHTML = '<p class="admin-empty">Mục này đang được phát triển.</p>';
        return;
    }

    container.innerHTML = sections.map((section) => (
        '<section class="admin-section" data-admin-section="' + adminShellEscape(section.sectionId) + '">'
        + '<h2 class="admin-section__title">' + adminShellEscape(section.title) + '</h2>'
        + '<div class="admin-section__body"></div>'
        + '</section>'
    )).join('');

    const bodies = typeof container.querySelectorAll === 'function'
        ? container.querySelectorAll('.admin-section__body')
        : [];

    for (let index = 0; index < sections.length; index += 1) {
        const body = bodies[index];
        if (!body) continue;

        try {
            await sections[index].renderFn(body);
        } catch (error) {
            // Chỉ mục này hỏng; các mục còn lại vẫn được vẽ tiếp.
            body.innerHTML = '<div class="admin-notice admin-notice--danger">'
                + 'Không hiển thị được mục này.'
                + '</div>';
            console.warn('Khung quản trị: mục "' + sections[index].sectionId
                + '" của tab "' + tabId + '" gặp lỗi.');
        }
    }
}

/* ---------- Ẩn / hiện panel ---------- */

/**
 * Ẩn hoặc hiện một panel bằng cả thuộc tính hidden lẫn style.display để chắc chắn
 * dù CSS nào đang áp dụng.
 * @param {string} id
 * @param {boolean} visible
 */
function setAdminPanelVisible(id, visible) {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (!el) return;

    try {
        if (visible) {
            if (typeof el.removeAttribute === 'function') el.removeAttribute('hidden');
            else if (el.attrs) delete el.attrs.hidden;
            if (el.style) el.style.display = '';
        } else {
            if (typeof el.setAttribute === 'function') el.setAttribute('hidden', '');
            if (el.style) el.style.display = 'none';
        }
    } catch (error) {
        // Bỏ qua: không ẩn/hiện được cũng không nên làm sập shell.
    }
}

/* ---------- Hiển thị nội dung theo tab ---------- */

/**
 * Hiển thị nội dung tương ứng với tab đang chọn.
 * - Tab posts: shell không vẽ nội dung, chỉ ẩn/hiện panel sẵn có của admin.js.
 * - Tab external: chỉ vẽ thanh tab, không đụng panel nào.
 * - Tab động: ẩn panel Bài viết, hiện panel chung, nạp script rồi vẽ các mục đã đăng ký.
 * @param {object} tab một phần tử của ADMIN_TABS
 * @returns {Promise<void>}
 */
async function showAdminTabContent(tab) {
    if (!tab || tab.external) return;

    if (tab.id === 'posts') {
        setAdminPanelVisible('admin-posts-panel', true);
        setAdminPanelVisible('admin-panel', false);
        return;
    }

    setAdminPanelVisible('admin-posts-panel', false);
    setAdminPanelVisible('admin-panel', true);

    await loadAdminTabScripts(tab);

    const panel = typeof document !== 'undefined' ? document.getElementById('admin-panel') : null;
    await renderAdminTabSections(panel, tab.id);
}

/* ---------- Điểm vào ---------- */

/**
 * Vẽ toàn bộ khung quản trị: thanh tab + nội dung tab đang chọn.
 * Thoát im lặng nếu trang không có #admin-tabs; fail-closed nếu chưa chắc là admin.
 * @returns {Promise<void>}
 */
async function renderAdminShell() {
    if (typeof document === 'undefined') return;

    const container = document.getElementById('admin-tabs');
    if (!container) return;

    // Chờ danh sách user nạp xong rồi mới xét quyền.
    try {
        if (typeof usersReady !== 'undefined' && usersReady && typeof usersReady.then === 'function') {
            await usersReady;
        }
    } catch (error) {
        // Không nạp được user: isAdmin() sẽ tự fail-closed.
    }

    if (typeof isAdmin !== 'function' || !isAdmin()) {
        // Không đủ quyền: admin.js tự hiện thông báo; shell không vẽ gì.
        return;
    }

    let counts = { pending: 0, reports: 0 };
    try {
        counts = await getAdminBadgeCounts();
    } catch (error) {
        counts = { pending: 0, reports: 0 };
    }

    const activeTabId = getActiveAdminTab();
    const activeTab = ADMIN_TABS.find((tab) => tab.id === activeTabId) || ADMIN_TABS[0];

    const storageNotice = await buildAdminStorageNotice();
    container.innerHTML = storageNotice + buildAdminTabsNav(activeTabId, counts);

    try {
        await showAdminTabContent(activeTab);
    } catch (error) {
        console.warn('Khung quản trị: không hiển thị được nội dung tab "' + activeTabId + '".');
    }
}

/* ---------- Tự chạy ---------- */

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await renderAdminShell();
        } catch (error) {
            console.error('Không khởi tạo được khung quản trị', error);
        }
    });
}
