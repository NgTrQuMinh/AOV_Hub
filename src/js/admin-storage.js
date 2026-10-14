/**
 * admin-storage.js - Mục "Dung lượng LocalStorage" trong tab "Dữ liệu" (CM05-b)
 *
 * Trang: src/pages/admin.html?tab=data. admin-shell.js nạp ĐỘNG file này khi mở tab
 * "Dữ liệu", rồi shell tự vẽ khung .admin-section + tiêu đề và gọi
 * renderAdminStorageSection() để vẽ phần thân.
 *
 * CHỈ XEM: hiện thanh đo, vài số liệu và bảng các key nặng nhất. KHÔNG có nút dọn/xoá dữ liệu.
 *
 * Phụ thuộc (đều kiểm tra typeof trước khi gọi nên thiếu file cũng không lỗi):
 *   - storage.js: getStorageUsage() + formatStorageSize() (số đo là ƯỚC LƯỢNG).
 *   - admin-shell.js: registerAdminSection().
 *   - components.js: escapeHtml() (có bản dự phòng nội bộ).
 */

/** Thoát ký tự HTML cho chuỗi hiển thị (ưu tiên escapeHtml của components.js). */
function adminStorageEscape(value) {
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

/** Kẹp % về 0..100; giá trị không hợp lệ -> 0. */
function adminStorageClampPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(100, Math.max(0, number));
}

/** Tỉ lệ % của bytes trên tổng, 1 chữ số thập phân, dấu phẩy kiểu Việt ("12,3"). */
function adminStorageFormatRatio(bytes, total) {
    const value = Number(bytes);
    const sum = Number(total);
    if (!Number.isFinite(value) || !Number.isFinite(sum) || sum <= 0) return '0,0';

    return (Math.round((value / sum) * 1000) / 10).toFixed(1).replace('.', ',');
}

/** Chuỗi % hiển thị (1 chữ số thập phân nếu cần, dấu phẩy). */
function adminStorageFormatPercent(value) {
    return String(adminStorageClampPercent(value)).replace('.', ',');
}

/** Gọi formatStorageSize() nếu có; thiếu thì trả chuỗi byte thô an toàn. */
function adminStorageFormatBytes(bytes) {
    if (typeof formatStorageSize === 'function') {
        try {
            return formatStorageSize(bytes);
        } catch (error) {
            // Rơi xuống bản dự phòng bên dưới.
        }
    }

    const number = Number(bytes);
    return Number.isFinite(number) ? String(Math.round(number)) + ' B' : '0 B';
}

/** Dựng HTML bảng 10 key nặng nhất (đã thoát tên key). */
function adminStorageBuildTable(items, usedBytes) {
    const rows = items.slice(0, 10).map((item) => {
        const key = adminStorageEscape(item && item.key);
        const bytes = item && item.bytes;
        const badge = item && item.isApp
            ? '<span class="admin-badge admin-badge--admin">AOV HUB</span>'
            : '<span class="admin-badge admin-badge--pending">Khác</span>';

        return '<tr>'
            + '<td>' + key + '</td>'
            + '<td>' + adminStorageEscape(adminStorageFormatBytes(bytes)) + '</td>'
            + '<td>' + adminStorageFormatRatio(bytes, usedBytes) + '%</td>'
            + '<td>' + badge + '</td>'
            + '</tr>';
    }).join('');

    return '<div class="admin-table-wrap">'
        + '<table class="admin-table">'
        + '<thead><tr><th>Khóa</th><th>Dung lượng</th><th>Tỉ lệ</th><th>Loại</th></tr></thead>'
        + '<tbody>' + rows + '</tbody>'
        + '</table></div>';
}

/** Khối thông báo theo mức level. */
function adminStorageBuildNotice(level) {
    if (level === 'danger') {
        return '<div class="admin-notice admin-notice--danger">'
            + 'LocalStorage gần đầy, nên sao lưu và dọn dữ liệu cũ.</div>';
    }

    if (level === 'warn') {
        return '<div class="admin-notice admin-notice--warn">LocalStorage đã dùng khá nhiều.</div>';
    }

    return '<div class="admin-notice admin-notice--success">Dung lượng còn thoải mái.</div>';
}

/** Gắn nút "Đo lại"; nút là phần tử mới sau mỗi lần vẽ nên không sợ trùng sự kiện. */
function adminStorageBindRefresh(body) {
    try {
        if (typeof body.querySelector !== 'function') return;

        const button = body.querySelector('[data-admin-storage-refresh]');
        if (!button || typeof button.addEventListener !== 'function') return;

        button.addEventListener('click', function () {
            renderAdminStorageSection(body);
        });
    } catch (error) {
        // Không gắn được cũng không sao: nút chỉ là tiện ích.
    }
}

/**
 * Vẽ mục "Dung lượng LocalStorage" vào phần thân .admin-section__body.
 * @param {Element} body container do admin-shell.js cung cấp.
 * @returns {Promise<void>}
 */
async function renderAdminStorageSection(body) {
    try {
        if (!body) return;

        if (typeof getStorageUsage !== 'function') {
            body.innerHTML = '<p class="admin-empty">Chưa đo được dung lượng (thiếu storage.js).</p>';
            return;
        }

        // getStorageUsage() có thể trả object hoặc Promise, cả hai đều chấp nhận.
        let usage = getStorageUsage();
        if (usage && typeof usage.then === 'function') usage = await usage;

        if (!usage || typeof usage !== 'object') {
            body.innerHTML = '<p class="admin-empty">Chưa đo được dung lượng (thiếu storage.js).</p>';
            return;
        }

        if (usage.available === false) {
            body.innerHTML = '<div class="admin-notice admin-notice--warn">'
                + 'Trình duyệt đang chặn LocalStorage nên không đo được.'
                + '</div>';
            return;
        }

        const level = usage.level === 'danger' || usage.level === 'warn' ? usage.level : 'ok';
        const percent = adminStorageClampPercent(usage.percent);
        const percentText = adminStorageFormatPercent(usage.percent);
        const usedText = adminStorageFormatBytes(usage.usedBytes);
        const limitText = adminStorageFormatBytes(usage.limitBytes);
        const appText = adminStorageFormatBytes(usage.appBytes);

        // (a) Khối thông báo theo mức.
        const notice = adminStorageBuildNotice(level);

        // (b) Thanh đo + dòng chữ %.
        const progressMod = level === 'danger'
            ? ' admin-progress--danger'
            : (level === 'warn' ? ' admin-progress--warn' : '');
        const progress = '<div class="admin-progress' + progressMod + '"'
            + ' role="progressbar" aria-valuemin="0" aria-valuemax="100"'
            + ' aria-valuenow="' + percent + '" aria-label="LocalStorage đã dùng">'
            + '<div class="admin-progress__bar" style="width:' + percent + '%"></div>'
            + '</div>'
            + '<p class="admin-section__desc">'
            + percentText + '% (' + usedText + ' / ' + limitText + ')'
            + '</p>';

        // (c) 3 ô số liệu.
        const stats = '<div class="admin-stats">'
            + '<div class="admin-stat"><div class="admin-stat__value">' + usedText + '</div>'
            + '<div class="admin-stat__label">Đã dùng</div></div>'
            + '<div class="admin-stat"><div class="admin-stat__value">' + limitText + '</div>'
            + '<div class="admin-stat__label">Hạn mức ước lượng</div></div>'
            + '<div class="admin-stat"><div class="admin-stat__value">' + appText + '</div>'
            + '<div class="admin-stat__label">Dữ liệu AOV HUB</div></div>'
            + '</div>';

        // (d) Tiêu đề phụ + bảng 10 key nặng nhất (hoặc thông báo trống).
        const items = Array.isArray(usage.items) ? usage.items : [];
        const table = '<p class="admin-section__desc">Các mục chiếm nhiều chỗ nhất</p>'
            + (items.length
                ? adminStorageBuildTable(items, usage.usedBytes)
                : '<p class="admin-empty">LocalStorage đang trống.</p>');

        // (e) Nhắc số liệu chỉ là ước lượng.
        const footer = '<p class="admin-section__desc">'
            + 'Số liệu là ƯỚC LƯỢNG (có thể lệch so với trình duyệt), nên sao lưu trước khi dọn dữ liệu.'
            + '</p>';

        // (f) Nút "Đo lại" (không reload trang).
        const action = '<div class="admin-toolbar">'
            + '<button type="button" class="btn btn-sm btn-outline" data-admin-storage-refresh>Đo lại</button>'
            + '</div>';

        body.innerHTML = notice + progress + stats + table + footer + action;

        adminStorageBindRefresh(body);
    } catch (error) {
        // Không để mục trắng nếu có lỗi bất ngờ.
        try {
            body.innerHTML = '<div class="admin-notice admin-notice--danger">'
                + 'Không hiển thị được dung lượng LocalStorage.'
                + '</div>';
        } catch (innerError) {
            // Bỏ qua.
        }
    }
}

// Đăng ký mục vào tab "Dữ liệu" (chỉ có tác dụng khi admin-shell.js đã nạp).
if (typeof registerAdminSection === 'function') {
    registerAdminSection('data', 'storage', 'Dung lượng LocalStorage', renderAdminStorageSection);
}
