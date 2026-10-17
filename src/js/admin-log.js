/**
 * admin-log.js - Mục "Nhật ký thao tác" trong tab "Nhật ký" (KD11)
 *
 * Trang: src/pages/admin.html?tab=log. admin-shell.js nạp ĐỘNG file này khi mở tab
 * "Nhật ký", rồi shell tự vẽ khung .admin-section + tiêu đề và gọi
 * renderAdminLogSection() để vẽ phần thân.
 *
 * MỤC ĐÍCH
 *   Cho admin xem lại lịch sử kiểm duyệt: ai đã ẩn/xoá/duyệt bài, khoá/cảnh cáo
 *   tài khoản, nhập/xuất sao lưu... Dữ liệu KHÔNG nằm trong file JSON mà do
 *   adminlog.js ghi vào LocalStorage (aov_admin_log, tối đa 200 bản mới nhất).
 *
 * CHỈ XEM (cộng thêm thao tác "Xoá nhật ký"):
 *   - Bảng mới nhất trước, lọc theo từ khoá và theo loại đối tượng, vài số liệu đếm.
 *   - Nút "Xoá nhật ký" (có xác nhận) gọi clearAdminLog() của adminlog.js — cũng chỉ
 *     admin mới xoá được (clearAdminLog tự kiểm tra quyền ở tầng dữ liệu).
 *
 * Phụ thuộc (đều kiểm tra typeof trước khi gọi nên thiếu file cũng không lỗi):
 *   - adminlog.js: getAdminLog(), clearAdminLog().
 *   - admin-shell.js: registerAdminSection().
 *   - components.js: escapeHtml() / formatDateTime() (có bản dự phòng nội bộ).
 */

/** Thoát ký tự HTML cho chuỗi hiển thị (ưu tiên escapeHtml của components.js). */
function adminLogEscape(value) {
    if (typeof escapeHtml === 'function') {
        try {
            return escapeHtml(value);
        } catch (error) {
            // Rơi xuống bản dự phòng bên dưới.
        }
    }

    if (value === null || value === undefined) return '';

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Định dạng mốc thời gian kiểu Việt Nam (ưu tiên formatDateTime của components.js). */
function adminLogFormatTime(value) {
    if (typeof formatDateTime === 'function') {
        try {
            return formatDateTime(value);
        } catch (error) {
            // Rơi xuống bản dự phòng bên dưới.
        }
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const pad = (number) => String(number).padStart(2, '0');

    return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear()
        + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

/** Nhãn tiếng Việt cho từng mã hành động đã biết; mã lạ thì hiện nguyên mã. */
const ADMIN_LOG_ACTION_LABELS = {
    'hide-post': 'Ẩn bài viết',
    'unhide-post': 'Hiện bài viết',
    'delete-post': 'Xoá bài viết',
    'approve-post': 'Duyệt bài viết',
    'reject-post': 'Từ chối bài viết',
    'user.ban': 'Khoá tài khoản',
    'user.unban': 'Mở khoá tài khoản',
    'user.warn': 'Cảnh cáo tài khoản',
    'backup.import': 'Nhập sao lưu',
    'backup.export': 'Xuất sao lưu',
};

/** Nhãn tiếng Việt cho loại đối tượng bị tác động. */
const ADMIN_LOG_TARGET_LABELS = {
    post: 'Bài viết',
    user: 'Người dùng',
    backup: 'Sao lưu',
};

/** Các lựa chọn lọc theo loại đối tượng (giá trị 'all' = không lọc). */
const ADMIN_LOG_TARGET_FILTERS = [
    { value: 'all', label: 'Tất cả đối tượng' },
    { value: 'post', label: 'Bài viết' },
    { value: 'user', label: 'Người dùng' },
    { value: 'backup', label: 'Sao lưu' },
];

/** Trạng thái bộ lọc, giữ nguyên qua các lần vẽ lại trong cùng phiên. */
const adminLogState = {
    keyword: '',
    targetType: 'all',
};

/** Nhãn của một hành động: mã chưa biết thì hiện nguyên mã, rỗng thì "(không rõ)". */
function adminLogActionLabel(action) {
    const key = String(action || '');
    if (ADMIN_LOG_ACTION_LABELS[key]) return ADMIN_LOG_ACTION_LABELS[key];
    return key || '(không rõ)';
}

/** Nhãn loại đối tượng; mã lạ thì hiện nguyên mã. */
function adminLogTargetLabel(type) {
    const key = String(type || '');
    return ADMIN_LOG_TARGET_LABELS[key] || key;
}

/**
 * Class badge theo mức của hành động, dùng đúng các biến thể có trong admin.css:
 *   - phá huỷ (delete/ban)        -> đỏ như "banned"
 *   - tích cực (duyệt/mở khoá)    -> xanh như "approved"
 *   - gỡ bỏ/cảnh cáo              -> đỏ nhạt như "rejected"
 *   - còn lại (hệ thống, sao lưu) -> vàng như "admin"
 */
function adminLogActionModifier(action) {
    const key = String(action || '');

    if (ADMIN_LOG_ACTION_LABELS[key]) {
        if (key === 'approve-post' || key === 'unhide-post' || key === 'user.unban') {
            return 'admin-badge--approved';
        }
        if (key === 'delete-post' || key === 'user.ban') return 'admin-badge--banned';
        if (key === 'reject-post' || key === 'hide-post' || key === 'user.warn') {
            return 'admin-badge--rejected';
        }
        return 'admin-badge--admin';
    }

    return 'admin-badge--admin';
}

/** Bản ghi có thuộc hôm nay (theo giờ máy) không. */
function adminLogIsToday(entry) {
    try {
        const time = Date.parse(entry && entry.time);
        if (Number.isNaN(time)) return false;

        const a = new Date(time);
        const b = new Date();

        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    } catch (error) {
        return false;
    }
}

/** Đọc toàn bộ nhật ký (đã chuẩn hoá, mới nhất trước); thiếu adminlog.js -> mảng rỗng. */
function adminLogReadAll() {
    if (typeof getAdminLog !== 'function') return [];

    try {
        const entries = getAdminLog();
        return Array.isArray(entries) ? entries : [];
    } catch (error) {
        return [];
    }
}

/** Lọc theo trạng thái hiện tại (từ khoá + loại đối tượng). */
function adminLogFiltered(entries) {
    const keyword = String(adminLogState.keyword || '').trim().toLowerCase();
    const targetType = adminLogState.targetType;

    return entries.filter((entry) => {
        if (targetType !== 'all' && entry.targetType !== targetType) return false;
        if (!keyword) return true;

        return [entry.admin, entry.action, entry.targetType, entry.targetId, entry.detail]
            .some((value) => String(value || '').toLowerCase().indexOf(keyword) !== -1);
    });
}

/** Một dòng bảng cho một bản ghi nhật ký. */
function adminLogRowHtml(entry) {
    const action = String(entry && entry.action || '');
    const badge = '<span class="admin-badge ' + adminLogActionModifier(action) + '">'
        + adminLogEscape(adminLogActionLabel(action)) + '</span>';

    return '<tr data-admin-log-row="' + adminLogEscape(entry && entry.id) + '">'
        + '<td>' + adminLogEscape(adminLogFormatTime(entry && entry.time)) + '</td>'
        + '<td>' + adminLogEscape(entry && entry.admin) + '</td>'
        + '<td>' + badge + '</td>'
        + '<td>' + adminLogEscape(adminLogTargetLabel(entry && entry.targetType)) + '</td>'
        + '<td>' + adminLogEscape(entry && entry.targetId) + '</td>'
        + '<td class="admin-log__detail">' + adminLogEscape(entry && entry.detail) + '</td>'
        + '</tr>';
}

/** Bảng nhật ký, hoặc thông báo trống phù hợp (không có bản ghi / không khớp lọc). */
function adminLogTableHtml(entries, totalCount) {
    if (!totalCount) {
        return '<p class="admin-empty">Chưa có thao tác quản trị nào được ghi.</p>';
    }

    if (!entries.length) {
        return '<p class="admin-empty">Không có bản ghi nào khớp bộ lọc.</p>';
    }

    const rows = entries.map(adminLogRowHtml).join('');

    return '<div class="admin-table-wrap">'
        + '<table class="admin-table">'
        + '<thead><tr>'
        + '<th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th>'
        + '<th>Đối tượng</th><th>ID</th><th>Chi tiết</th>'
        + '</tr></thead>'
        + '<tbody>' + rows + '</tbody>'
        + '</table></div>';
}

/** Khối 3 ô số liệu: tổng, đang hiển thị, hôm nay. */
function adminLogStatsHtml(total, shown, today) {
    return '<div class="admin-stats">'
        + '<div class="admin-stat"><div class="admin-stat__value">' + adminLogEscape(String(total)) + '</div>'
        + '<div class="admin-stat__label">Tổng bản ghi</div></div>'
        + '<div class="admin-stat"><div class="admin-stat__value">' + adminLogEscape(String(shown)) + '</div>'
        + '<div class="admin-stat__label">Đang hiển thị</div></div>'
        + '<div class="admin-stat"><div class="admin-stat__value">' + adminLogEscape(String(today)) + '</div>'
        + '<div class="admin-stat__label">Hôm nay</div></div>'
        + '</div>';
}

/** Thân nội dung (số liệu + bảng) — phần được vẽ lại khi đổi bộ lọc. */
function adminLogViewHtml() {
    const all = adminLogReadAll();
    const filtered = adminLogFiltered(all);
    const today = all.filter(adminLogIsToday).length;

    return adminLogStatsHtml(all.length, filtered.length, today)
        + adminLogTableHtml(filtered, all.length);
}

/** Thanh công cụ: từ khoá, lọc loại đối tượng, nút tải lại và xoá nhật ký. */
function adminLogToolbarHtml() {
    const options = ADMIN_LOG_TARGET_FILTERS.map((item) => {
        const selected = adminLogState.targetType === item.value ? ' selected' : '';
        return '<option value="' + adminLogEscape(item.value) + '"' + selected + '>'
            + adminLogEscape(item.label) + '</option>';
    }).join('');

    return '<div class="admin-toolbar" id="admin-log-toolbar">'
        + '<input type="search" class="filter-bar__keyword" data-admin-log-keyword'
        + ' value="' + adminLogEscape(adminLogState.keyword) + '"'
        + ' placeholder="Tìm theo người thực hiện, hành động, chi tiết..."'
        + ' aria-label="Tìm trong nhật ký">'
        + '<select class="filter-bar__select" data-admin-log-target aria-label="Lọc theo loại đối tượng">'
        + options + '</select>'
        + '<button type="button" class="btn btn-primary btn-sm" data-admin-log-refresh>Tải lại</button>'
        + '<button type="button" class="btn btn-danger btn-sm" data-admin-log-clear>Xoá nhật ký</button>'
        + '</div>';
}

/** Vẽ lại riêng phần thân (giữ nguyên thanh công cụ và ô tìm kiếm). */
function adminLogRedraw(body) {
    if (!body || typeof body.querySelector !== 'function') return;

    const view = body.querySelector('[data-admin-log-view]');
    if (!view) return;

    view.innerHTML = adminLogViewHtml();
}

/** Gắn sự kiện cho mục nhật ký (thanh công cụ vừa được vẽ lại nên không sợ trùng sự kiện). */
function adminLogBind(body) {
    if (!body || typeof body.addEventListener !== 'function') return;

    body.addEventListener('input', (event) => {
        const input = event.target && event.target.closest
            ? event.target.closest('[data-admin-log-keyword]')
            : null;
        if (!input) return;

        adminLogState.keyword = String(input.value || '');
        adminLogRedraw(body);
    });

    body.addEventListener('change', (event) => {
        const select = event.target && event.target.closest
            ? event.target.closest('[data-admin-log-target]')
            : null;
        if (!select) return;

        const value = String(select.value || 'all');
        adminLogState.targetType = ADMIN_LOG_TARGET_FILTERS.some((item) => item.value === value)
            ? value
            : 'all';
        adminLogRedraw(body);
    });

    body.addEventListener('click', (event) => {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;

        if (target.closest('[data-admin-log-refresh]')) {
            adminLogRedraw(body);
            return;
        }

        const clearBtn = target.closest('[data-admin-log-clear]');
        if (!clearBtn) return;

        if (!adminLogReadAll().length) {
            adminLogAlert('Nhật ký đang trống.');
            return;
        }

        if (!adminLogConfirm('Xoá toàn bộ nhật ký thao tác? Thao tác này không khôi phục được.')) return;

        const ok = typeof clearAdminLog === 'function' ? clearAdminLog() === true : false;
        if (!ok) {
            adminLogAlert('Không xoá được nhật ký (cần quyền admin).');
            return;
        }

        adminLogRedraw(body);
    });
}

/** Gọi window.alert nếu có (bọc lại cho gọn và an toàn trong môi trường test). */
function adminLogAlert(message) {
    try {
        if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message);
    } catch (error) {
        // Bỏ qua: thông báo chỉ là tiện ích.
    }
}

/** Gọi window.confirm nếu có; mặc định false khi không có để tránh xoá nhầm. */
function adminLogConfirm(message) {
    try {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
            return window.confirm(message) === true;
        }
    } catch (error) {
        return false;
    }

    return false;
}

/**
 * Vẽ mục "Nhật ký thao tác" vào phần thân .admin-section__body.
 * @param {Element} body container do admin-shell.js cung cấp.
 * @returns {Promise<void>}
 */
async function renderAdminLogSection(body) {
    try {
        if (!body) return;

        if (typeof isAdmin === 'function' && !isAdmin()) {
            body.innerHTML = '<p class="admin-empty">Chỉ quản trị viên mới xem được nhật ký.</p>';
            return;
        }

        body.innerHTML = adminLogToolbarHtml() + '<div data-admin-log-view></div>';

        adminLogBind(body);
        adminLogRedraw(body);
    } catch (error) {
        // Không để mục trắng nếu có lỗi bất ngờ.
        try {
            body.innerHTML = '<div class="admin-notice admin-notice--danger">'
                + 'Không hiển thị được nhật ký thao tác.'
                + '</div>';
        } catch (innerError) {
            // Bỏ qua.
        }
    }
}

// Đăng ký mục vào tab "Nhật ký" (chỉ có tác dụng khi admin-shell.js đã nạp).
if (typeof registerAdminSection === 'function') {
    registerAdminSection('log', 'admin-log', 'Nhật ký thao tác', renderAdminLogSection);
}
