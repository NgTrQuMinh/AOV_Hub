/**
 * admin-banned.js - Mục "Từ ngữ cấm và vi phạm" trong tab "Cài đặt" (task KD07-f)
 *
 * Trang: src/pages/admin.html?tab=settings. admin-shell.js nạp ĐỘNG file này rồi
 * gọi renderAdminModerationSection() để vẽ phần thân mục; shell tự vẽ tiêu đề.
 *
 * MỤC ĐÍCH
 *   Một chỗ cho admin (1) xem thông báo vi phạm nội dung, (2) quản lý từ cấm
 *   theo mức độ (thêm / đổi mức / gỡ), (3) thử kiểm tra một câu xem rơi mức nào.
 *
 * BA KHỐI
 *   1. Thông báo vi phạm: tóm tắt + bộ lọc + bảng, đánh dấu đã đọc / xóa.
 *   2. Quản lý từ cấm: form thêm/đổi (qua setModSettings), bảng từ tùy chỉnh,
 *      khối thu gọn danh sách mẫu (gỡ / đổi mức / khôi phục), nút đặt lại.
 *   3. Thử kiểm tra: classifyContent() với getBannedEntries(), chỉ hiển thị.
 *
 * LUẬT
 *   - Mọi ghi dữ liệu đều qua hàm của feed.js (setModSettings / markModAlertsRead /
 *     removeModAlert); KHÔNG ghi thẳng LocalStorage.
 *   - Admin ĐƯỢC xem từ vi phạm nguyên văn (khác thông báo cho người dùng).
 *   - Không dùng hộp thoại trình duyệt; xác nhận "đặt lại" bằng bấm hai lần.
 *   - Mọi chữ động đi qua adminBannedEscape trước khi vào innerHTML.
 *
 * PHỤ THUỘC (đều kiểm tra typeof trước khi gọi nên thiếu file cũng không lỗi)
 *   feed.js (getModSettings / setModSettings / getBannedEntries / getModAlerts /
 *   countUnreadModAlerts / markModAlertsRead / removeModAlert),
 *   search.js (getDefaultBannedEntries / mergeBannedEntries / classifyContent),
 *   components.js (escapeHtml / formatDateTime), config.js (BASE_PATH),
 *   admin-shell.js (registerAdminSection / buildAdminModerationNotice).
 */

/** Số từ tùy chỉnh tối đa (khớp MOD_BANNED_WORDS_MAX của feed.js). */
const adminBannedMaxWords = 500;

/** Độ dài tối đa một từ (khớp MOD_BANNED_WORD_MAX của feed.js). */
const adminBannedMaxWord = 80;

/** Số giây chờ xác nhận "đặt lại" trước khi tự huỷ. */
const adminBannedResetDelay = 5000;

/** Mức hợp lệ của từ cấm. */
const adminBannedLevels = [0, 1, 2, 3];

/**
 * Trạng thái giao diện của mục (giữ giữa các lần vẽ lại).
 *   alertFilter 'unread' | 'all'
 *   alertLevel  'all' | 1 | 2 | 3
 *   form        { word, level, fold } đang gõ trong form thêm/đổi
 *   formError   lỗi hiện dưới ô nhập
 *   formNotice  thông báo thành công
 *   defaultsOpen danh sách mẫu đang mở
 *   resetArmed  nút đặt lại đang chờ bấm lần hai
 *   testResult  { tone, title, detail } kết quả thử kiểm tra
 */
const adminBannedState = {
    alertFilter: 'unread',
    alertLevel: 'all',
    form: { word: '', level: '2', fold: 'default' },
    formError: '',
    formNotice: '',
    defaultsOpen: false,
    resetArmed: false,
    testResult: null,
};

/** Bộ đếm huỷ trạng thái "chờ bấm lần hai" của nút đặt lại. */
let adminBannedResetTimer = null;

/* ---------- Tiện ích nội bộ ---------- */

/** Thoát ký tự HTML (ưu tiên escapeHtml của components.js). */
function adminBannedEscape(value) {
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

/** BASE_PATH lấy từ config.js; thiếu file cấu hình thì lùi về gốc "/". */
function adminBannedBasePath() {
    return typeof BASE_PATH === 'string' && BASE_PATH ? BASE_PATH : '/';
}

/** Định dạng mốc thời gian (ưu tiên formatDateTime của components.js). */
function adminBannedFormatTime(value) {
    if (typeof formatDateTime === 'function') {
        try {
            return formatDateTime(value);
        } catch (error) {
            // Rơi xuống bản dự phòng.
        }
    }

    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const pad = (number) => String(number).padStart(2, '0');
        return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear()
            + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    } catch (error) {
        return '';
    }
}

/** Nhãn tiếng Việt của một mức. */
function adminBannedLevelLabel(level) {
    if (level === 1) return 'Cần xem xét';
    if (level === 2) return 'Vi phạm';
    if (level === 3) return 'Nghiêm trọng';
    if (level === 0) return 'Gỡ khỏi danh sách mẫu';
    return '';
}

/** Nhãn cách so khớp dấu. */
function adminBannedFoldLabel(fold) {
    if (fold === 'off') return 'Chặt';
    if (fold === 'review') return 'Chỉ xem xét';
    if (fold === 'full') return 'Đầy đủ';
    return 'Mặc định';
}

/** Đủ module kiểm duyệt (feed.js + search.js) để vẽ mục không. */
function adminBannedHasModules() {
    return typeof getModSettings === 'function'
        && typeof setModSettings === 'function'
        && typeof getBannedEntries === 'function'
        && typeof getModAlerts === 'function'
        && typeof countUnreadModAlerts === 'function'
        && typeof markModAlertsRead === 'function'
        && typeof removeModAlert === 'function'
        && typeof getDefaultBannedEntries === 'function'
        && typeof mergeBannedEntries === 'function'
        && typeof classifyContent === 'function';
}

/* ---------- Đọc dữ liệu (đều bọc lỗi) ---------- */

/** Kho từ tùy chỉnh thô (mảng gốc từ getModSettings().bannedWords). */
function adminBannedCustomRaw() {
    try {
        const settings = getModSettings();
        return settings && Array.isArray(settings.bannedWords) ? settings.bannedWords.slice() : [];
    } catch (error) {
        return [];
    }
}

/** Chuẩn hoá một mục từ thành { word, level, fold } (fold rỗng = mặc định). */
function adminBannedNormalizeEntry(entry) {
    if (typeof entry === 'string') {
        const word = entry.trim();
        return word ? { word: word, level: 2, fold: '' } : null;
    }

    if (entry && typeof entry === 'object' && typeof entry.word === 'string') {
        const word = entry.word.trim();
        if (!word) return null;
        const level = adminBannedLevels.indexOf(entry.level) === -1 ? 2 : entry.level;
        const fold = (entry.fold === 'full' || entry.fold === 'review' || entry.fold === 'off')
            ? entry.fold
            : '';
        return { word: word, level: level, fold: fold };
    }

    return null;
}

/** Danh sách từ tùy chỉnh đã chuẩn hoá. */
function adminBannedCustomWords() {
    return adminBannedCustomRaw()
        .map(adminBannedNormalizeEntry)
        .filter((entry) => entry !== null);
}

/** Danh sách từ mẫu (search.js); thiếu hàm / lỗi -> mảng rỗng. */
function adminBannedDefaults() {
    try {
        if (typeof getDefaultBannedEntries !== 'function') return [];
        const defaults = getDefaultBannedEntries();
        return Array.isArray(defaults) ? defaults : [];
    } catch (error) {
        return [];
    }
}

/** Kho thông báo vi phạm (chỉ admin). */
function adminBannedAllAlerts() {
    try {
        if (typeof getModAlerts !== 'function') return [];
        const alerts = getModAlerts();
        return Array.isArray(alerts) ? alerts : [];
    } catch (error) {
        return [];
    }
}

/** Số thông báo chưa đọc. */
function adminBannedUnreadCount() {
    try {
        return typeof countUnreadModAlerts === 'function' ? Number(countUnreadModAlerts()) || 0 : 0;
    } catch (error) {
        return 0;
    }
}

/** Bảng đánh dấu từ mẫu đã bị gỡ (có mục tùy chỉnh mức 0 cùng từ). */
function adminBannedRemovedMap() {
    const map = Object.create(null);
    adminBannedCustomWords().forEach((entry) => {
        if (entry.level === 0) map[entry.word.toLowerCase()] = true;
    });
    return map;
}

/* ---------- Dựng HTML dùng chung ---------- */

/** Nhãn mức (badge) theo kiểu có sẵn. */
function adminBannedLevelBadge(level) {
    const map = {
        1: { className: 'admin-badge--pending', text: 'Cần xem xét' },
        2: { className: 'admin-badge--rejected', text: 'Vi phạm' },
        3: { className: 'admin-badge--banned', text: 'Nghiêm trọng' },
        0: { className: 'admin-badge--admin', text: 'Gỡ mẫu' },
    };
    const info = map[level] || { className: 'admin-badge--admin', text: 'Ghi nhận' };
    return '<span class="admin-badge ' + info.className + '">' + adminBannedEscape(info.text) + '</span>';
}

/** Một thẻ số trong .admin-stats. */
function adminBannedStatHtml(value, label) {
    return '<div class="admin-stat">'
        + '<div class="admin-stat__value">' + adminBannedEscape(String(value)) + '</div>'
        + '<div class="admin-stat__label">' + adminBannedEscape(label) + '</div>'
        + '</div>';
}

/** Nút lọc/badge dạng nút: đổi màu theo trạng thái chọn. */
function adminBannedChipButtonHtml(action, dataName, dataValue, label, active) {
    return '<button type="button" class="btn ' + (active ? 'btn-primary' : 'btn-outline') + '"'
        + ' data-admin-banned-action="' + adminBannedEscape(action) + '"'
        + ' ' + dataName + '="' + adminBannedEscape(dataValue) + '"'
        + ' aria-pressed="' + (active ? 'true' : 'false') + '">'
        + adminBannedEscape(label) + '</button>';
}

/* ---------- Khối 1: thông báo vi phạm ---------- */

/** Nhãn loại nội dung. */
function adminBannedKindLabel(kind) {
    return kind === 'comment' ? 'Bình luận' : 'Bài viết';
}

/** Nhãn mức xử phạt đã áp cho người vi phạm. */
function adminBannedPenaltyText(penalty) {
    const info = penalty && typeof penalty === 'object' ? penalty : {};
    if (info.banned === true) return 'Đã khóa tài khoản';
    if (info.warned === true) return 'Đã cảnh cáo';
    return 'Chỉ ghi nhận';
}

/** Liên kết mở bài chi tiết (khi có targetId). */
function adminBannedPostLinkHtml(alert) {
    const info = alert && typeof alert === 'object' ? alert : {};
    if (info.targetId === '' || info.targetId === undefined || info.targetId === null) return '';

    const href = adminBannedBasePath() + 'src/pages/post-detail.html?id='
        + encodeURIComponent(String(info.targetId));

    return '<a class="btn btn-outline" href="' + adminBannedEscape(href) + '">Xem bài</a>';
}

/** Cột mã bài / mã bình luận. */
function adminBannedAlertIdsHtml(alert) {
    const info = alert && typeof alert === 'object' ? alert : {};
    const parts = [];

    if (info.targetId !== '' && info.targetId !== undefined && info.targetId !== null) {
        parts.push('Bài ' + adminBannedEscape(info.targetId));
    }
    if (info.commentId !== '' && info.commentId !== undefined && info.commentId !== null) {
        parts.push('Bình luận ' + adminBannedEscape(info.commentId));
    }

    return parts.length ? parts.join(' · ') : '—';
}

/** Một dòng bảng thông báo vi phạm. */
function adminBannedAlertRowHtml(alert) {
    const info = alert && typeof alert === 'object' ? alert : {};
    const level = Number.isFinite(info.level) ? info.level : 0;
    const unread = info.read === false;
    const words = Array.isArray(info.words) && info.words.length
        ? info.words.map((word) => adminBannedEscape(word)).join(', ')
        : '—';
    const excerpt = info.excerpt ? adminBannedEscape(info.excerpt) : '—';
    const urgentBadge = info.urgent === true
        ? ' <span class="admin-badge admin-badge--banned">Khẩn</span>'
        : '';

    let actions = '<div class="admin-table__actions">';
    if (unread) {
        actions += '<button type="button" class="btn btn-primary" data-admin-banned-action="mark-read"'
            + ' data-admin-banned-id="' + adminBannedEscape(info.id) + '">Đánh dấu đã đọc</button>';
    }
    actions += '<button type="button" class="btn btn-danger" data-admin-banned-action="remove-alert"'
        + ' data-admin-banned-id="' + adminBannedEscape(info.id) + '">Xóa</button>';
    actions += adminBannedPostLinkHtml(info);
    actions += '</div>';

    return '<tr' + (unread ? ' class="admin-row--flagged"' : '') + '>'
        + '<td>' + adminBannedEscape(adminBannedFormatTime(info.at)) + '</td>'
        + '<td>' + adminBannedEscape(info.user) + '</td>'
        + '<td>' + adminBannedEscape(adminBannedKindLabel(info.kind)) + '</td>'
        + '<td>' + adminBannedLevelBadge(level) + urgentBadge + '</td>'
        + '<td>' + words + '</td>'
        + '<td>' + excerpt + '</td>'
        + '<td>' + adminBannedEscape(adminBannedPenaltyText(info.penalty)) + '</td>'
        + '<td>' + adminBannedAlertIdsHtml(info) + '</td>'
        + '<td>' + actions + '</td>'
        + '</tr>';
}

/** Danh sách thông báo đã lọc theo bộ lọc hiện tại. */
function adminBannedFilteredAlerts() {
    let alerts = adminBannedAllAlerts();

    if (adminBannedState.alertFilter === 'unread') {
        alerts = alerts.filter((item) => item && item.read === false);
    }

    if (adminBannedState.alertLevel !== 'all') {
        const wanted = Number(adminBannedState.alertLevel);
        alerts = alerts.filter((item) => item && Number(item.level) === wanted);
    }

    return alerts;
}

/** Toàn bộ khối 1. */
function adminBannedAlertsHtml() {
    const all = adminBannedAllAlerts();
    const unread = adminBannedUnreadCount();
    const urgentUnread = all.filter((item) => item && item.read === false && item.urgent === true).length;

    let html = '<div class="admin-stats">'
        + adminBannedStatHtml(unread, 'Chưa đọc')
        + adminBannedStatHtml(all.length, 'Tổng thông báo')
        + adminBannedStatHtml(urgentUnread, 'Nghiêm trọng chưa đọc')
        + '</div>';

    html += '<div class="admin-toolbar">'
        + adminBannedChipButtonHtml('alert-filter', 'data-admin-banned-read', 'unread', 'Chưa đọc',
            adminBannedState.alertFilter === 'unread')
        + adminBannedChipButtonHtml('alert-filter', 'data-admin-banned-read', 'all', 'Tất cả',
            adminBannedState.alertFilter === 'all')
        + adminBannedChipButtonHtml('level-filter', 'data-admin-banned-level-value', 'all', 'Mọi mức',
            adminBannedState.alertLevel === 'all')
        + adminBannedChipButtonHtml('level-filter', 'data-admin-banned-level-value', '1', 'Cần xem xét',
            String(adminBannedState.alertLevel) === '1')
        + adminBannedChipButtonHtml('level-filter', 'data-admin-banned-level-value', '2', 'Vi phạm',
            String(adminBannedState.alertLevel) === '2')
        + adminBannedChipButtonHtml('level-filter', 'data-admin-banned-level-value', '3', 'Nghiêm trọng',
            String(adminBannedState.alertLevel) === '3')
        + '<button type="button" class="btn btn-outline" data-admin-banned-action="mark-all-read">'
        + 'Đánh dấu tất cả đã đọc</button>'
        + '</div>';

    const list = adminBannedFilteredAlerts();

    if (!list.length) {
        html += '<p class="admin-empty">'
            + (all.length ? 'Không có thông báo nào khớp bộ lọc.' : 'Chưa có thông báo vi phạm nào.')
            + '</p>';
        return html;
    }

    html += '<div class="admin-table-wrap"><table class="admin-table">'
        + '<thead><tr>'
        + '<th>Thời gian</th><th>Người dùng</th><th>Loại</th><th>Mức</th><th>Từ vi phạm</th>'
        + '<th>Trích đoạn</th><th>Xử phạt</th><th>Bài / Bình luận</th><th>Thao tác</th>'
        + '</tr></thead><tbody>'
        + list.map(adminBannedAlertRowHtml).join('')
        + '</tbody></table></div>';

    return html;
}

/* ---------- Khối 2: quản lý từ cấm ---------- */

/** Bảng từ tùy chỉnh (hoặc khối rỗng). */
function adminBannedCustomTableHtml(custom) {
    if (!custom.length) return '<p class="admin-empty">Chưa có từ tùy chỉnh nào.</p>';

    const rows = custom.map((entry) => '<tr>'
        + '<td>' + adminBannedEscape(entry.word) + '</td>'
        + '<td>' + adminBannedLevelBadge(entry.level) + '</td>'
        + '<td>' + adminBannedEscape(adminBannedFoldLabel(entry.fold)) + '</td>'
        + '<td><div class="admin-table__actions">'
        + '<button type="button" class="btn btn-danger" data-admin-banned-action="delete-word"'
        + ' data-admin-banned-word="' + adminBannedEscape(entry.word) + '">Xóa</button>'
        + '</div></td>'
        + '</tr>').join('');

    return '<div class="admin-table-wrap"><table class="admin-table">'
        + '<thead><tr><th>Từ</th><th>Mức</th><th>Cách so khớp</th><th>Thao tác</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
}

/** Một dòng trong danh sách mẫu. */
function adminBannedDefaultRowHtml(entry, removed) {
    const word = entry && typeof entry.word === 'string' ? entry.word : '';
    const level = entry && Number.isFinite(entry.level) ? entry.level : 0;
    const isRemoved = removed[word.toLowerCase()] === true;

    const status = isRemoved
        ? '<span class="admin-badge admin-badge--admin">Đã gỡ</span>'
        : '<span class="admin-badge admin-badge--approved">Đang bật</span>';

    let actions;
    if (isRemoved) {
        actions = '<div class="admin-table__actions">'
            + '<button type="button" class="btn btn-outline" data-admin-banned-action="restore-default"'
            + ' data-admin-banned-word="' + adminBannedEscape(word) + '">Khôi phục</button>'
            + '</div>';
    } else {
        actions = '<div class="admin-table__actions">'
            + '<button type="button" class="btn btn-danger" data-admin-banned-action="remove-default"'
            + ' data-admin-banned-word="' + adminBannedEscape(word) + '">Gỡ</button>'
            + '<button type="button" class="btn btn-outline" data-admin-banned-action="edit-default"'
            + ' data-admin-banned-word="' + adminBannedEscape(word) + '"'
            + ' data-admin-banned-level-value="' + adminBannedEscape(level) + '">Đổi mức</button>'
            + '</div>';
    }

    return '<tr><td>' + adminBannedEscape(word) + '</td>'
        + '<td>' + adminBannedLevelBadge(level) + '</td>'
        + '<td>' + status + '</td>'
        + '<td>' + actions + '</td></tr>';
}

/** Danh sách mẫu nhóm theo mức (khối thu gọn). */
function adminBannedDefaultsListHtml() {
    const defaults = adminBannedDefaults();
    if (!defaults.length) return '<p class="admin-empty">Chưa có danh sách mẫu.</p>';

    const removed = adminBannedRemovedMap();
    let html = '';

    [3, 2, 1].forEach((level) => {
        const items = defaults.filter((entry) => entry && entry.level === level);
        if (!items.length) return;

        html += '<p class="admin-field__label">Mức ' + level + ' - '
            + adminBannedEscape(adminBannedLevelLabel(level)) + ' (' + items.length + ' từ)</p>'
            + '<div class="admin-table-wrap"><table class="admin-table">'
            + '<thead><tr><th>Từ</th><th>Mức</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>'
            + '<tbody>' + items.map((entry) => adminBannedDefaultRowHtml(entry, removed)).join('')
            + '</tbody></table></div>';
    });

    return html;
}

/** Toàn bộ phần động của khối 2. */
function adminBannedWordsHtml() {
    const custom = adminBannedCustomWords();
    let html = '';

    html += '<div class="admin-toolbar">'
        + '<button type="button" class="btn btn-outline" data-admin-banned-action="toggle-defaults">'
        + 'Danh sách mẫu (' + adminBannedDefaults().length + ' từ)</button>'
        + '<button type="button" class="btn btn-danger" data-admin-banned-action="reset-custom">'
        + adminBannedEscape(adminBannedState.resetArmed ? 'Bấm lại để xác nhận' : 'Đặt lại về danh sách mẫu')
        + '</button></div>';

    html += adminBannedCustomTableHtml(custom);

    if (adminBannedState.defaultsOpen) html += adminBannedDefaultsListHtml();

    return html;
}

/** Phản hồi của form (lỗi dưới ô, hoặc thông báo thành công). */
function adminBannedFormFeedbackHtml() {
    if (adminBannedState.formError) {
        return '<p class="admin-field__error">' + adminBannedEscape(adminBannedState.formError) + '</p>';
    }
    if (adminBannedState.formNotice) {
        return '<div class="admin-notice admin-notice--success">'
            + adminBannedEscape(adminBannedState.formNotice) + '</div>';
    }
    return '';
}

/** Một <option> của select. */
function adminBannedOptionHtml(value, label, selected) {
    return '<option value="' + adminBannedEscape(value) + '"'
        + (selected ? ' selected' : '') + '>'
        + adminBannedEscape(label) + '</option>';
}

/** Form thêm/đổi từ (phần tĩnh, không vẽ lại khi gõ). */
function adminBannedFormHtml() {
    return '<div class="admin-form">'
        + '<div class="admin-field">'
        + '<label class="admin-field__label" for="admin-banned-word">Từ hoặc cụm từ (tối đa '
        + adminBannedMaxWord + ' ký tự)</label>'
        + '<input type="text" id="admin-banned-word" data-admin-banned-input maxlength="'
        + adminBannedMaxWord + '" value="' + adminBannedEscape(adminBannedState.form.word) + '">'
        + '<div data-admin-banned-form-feedback>' + adminBannedFormFeedbackHtml() + '</div>'
        + '</div>'
        + '<div class="admin-field">'
        + '<label class="admin-field__label" for="admin-banned-level">Mức độ</label>'
        + '<select id="admin-banned-level" data-admin-banned-level>'
        + adminBannedOptionHtml('1', '1 - Cần xem xét', adminBannedState.form.level === '1')
        + adminBannedOptionHtml('2', '2 - Vi phạm', adminBannedState.form.level === '2')
        + adminBannedOptionHtml('3', '3 - Nghiêm trọng', adminBannedState.form.level === '3')
        + adminBannedOptionHtml('0', '0 - Gỡ khỏi danh sách mẫu', adminBannedState.form.level === '0')
        + '</select></div>'
        + '<div class="admin-field">'
        + '<label class="admin-field__label" for="admin-banned-fold">Cách so khớp dấu</label>'
        + '<select id="admin-banned-fold" data-admin-banned-fold>'
        + adminBannedOptionHtml('default', 'Mặc định', adminBannedState.form.fold === 'default')
        + adminBannedOptionHtml('off', 'Chặt', adminBannedState.form.fold === 'off')
        + adminBannedOptionHtml('review', 'Chỉ xem xét', adminBannedState.form.fold === 'review')
        + adminBannedOptionHtml('full', 'Đầy đủ', adminBannedState.form.fold === 'full')
        + '</select></div>'
        + '<div class="admin-table__actions">'
        + '<button type="button" class="btn btn-primary" data-admin-banned-action="save-word">Lưu</button>'
        + '</div>'
        + '</div>';
}

/* ---------- Khối 3: thử kiểm tra ---------- */

/** Kết quả thử kiểm tra (nếu có). */
function adminBannedTestResultHtml() {
    const result = adminBannedState.testResult;
    if (!result || typeof result !== 'object') return '';

    return '<div class="admin-notice admin-notice--' + adminBannedEscape(result.tone) + '">'
        + '<strong>' + adminBannedEscape(result.title) + '</strong> '
        + adminBannedEscape(result.detail)
        + '</div>';
}

/* ---------- Khung section + vẽ lại ---------- */

/** Lấy vùng động theo tên (alerts / words / test-result / form-feedback). */
function adminBannedViewEl(body, name) {
    try {
        if (!body || typeof body.querySelector !== 'function') return null;
        return body.querySelector('[data-admin-banned-' + name + ']');
    } catch (error) {
        return null;
    }
}

/** Vẽ lại khối 1. */
function adminBannedRenderAlerts(body) {
    const view = adminBannedViewEl(body, 'alerts');
    if (view) view.innerHTML = adminBannedAlertsHtml();
}

/** Vẽ lại khối 2 (bảng thay đổi). */
function adminBannedRenderWords(body) {
    const view = adminBannedViewEl(body, 'words');
    if (view) view.innerHTML = adminBannedWordsHtml();
}

/** Vẽ lại phản hồi form. */
function adminBannedRenderFeedback(body) {
    const view = adminBannedViewEl(body, 'form-feedback');
    if (view) view.innerHTML = adminBannedFormFeedbackHtml();
}

/** Vẽ lại kết quả thử kiểm tra. */
function adminBannedRenderTestResult(body) {
    const view = adminBannedViewEl(body, 'test-result');
    if (view) view.innerHTML = adminBannedTestResultHtml();
}

/** Toàn bộ HTML tĩnh của mục (form và các ô nhập không vẽ lại khi gõ). */
function adminBannedSectionHtml() {
    return ''
        + '<p class="admin-section__desc">'
        + 'Xem thông báo vi phạm nội dung, quản lý từ cấm theo mức độ và thử kiểm tra một câu. '
        + 'Danh sách từ mẫu đã có sẵn; admin có thể thêm từ riêng, đổi mức hoặc gỡ một từ mẫu.'
        + '</p>'

        + '<h3 class="admin-section__title">Thông báo vi phạm</h3>'
        + '<div data-admin-banned-alerts></div>'

        + '<h3 class="admin-section__title">Quản lý từ cấm</h3>'
        + '<p class="admin-section__desc">'
        + 'Từ trùng với mục tùy chỉnh đã có sẽ được ghi đè. Mức "Gỡ khỏi danh sách mẫu" dùng để ẩn '
        + 'một từ mẫu khỏi danh sách hiệu lực.'
        + '</p>'
        + adminBannedFormHtml()
        + '<div data-admin-banned-words></div>'

        + '<h3 class="admin-section__title">Thử kiểm tra</h3>'
        + '<div class="admin-form">'
        + '<div class="admin-field">'
        + '<label class="admin-field__label" for="admin-banned-test">Thử một câu</label>'
        + '<textarea id="admin-banned-test" data-admin-banned-test-text rows="3"></textarea>'
        + '</div>'
        + '<div class="admin-table__actions">'
        + '<button type="button" class="btn btn-outline" data-admin-banned-action="run-test">Kiểm tra</button>'
        + '</div>'
        + '</div>'
        + '<div data-admin-banned-test-result>' + adminBannedTestResultHtml() + '</div>';
}

/** Đồng bộ banner vi phạm ở #admin-notices sau mỗi thao tác. */
function adminBannedSyncBanner() {
    try {
        if (typeof document === 'undefined') return;

        const notices = document.getElementById('admin-notices');
        if (!notices || typeof notices.querySelector !== 'function') return;

        const banner = notices.querySelector('[data-mod-alert-banner]');
        if (!banner) return;

        const unread = adminBannedUnreadCount();

        if (unread <= 0) {
            if (typeof banner.remove === 'function') {
                banner.remove();
            } else if (banner.parent && typeof banner.parent.removeChild === 'function') {
                banner.parent.removeChild(banner);
            } else if (banner.parent && Array.isArray(banner.parent.children)) {
                const index = banner.parent.children.indexOf(banner);
                if (index !== -1) banner.parent.children.splice(index, 1);
            }
            return;
        }

        const link = adminBannedBasePath() + 'src/pages/admin.html?tab=settings';
        banner.innerHTML = '<strong>Có ' + unread + ' vi phạm nội dung mới.</strong>'
            + ' <a href="' + adminBannedEscape(link) + '">Xem chi tiết</a>';
    } catch (error) {
        // Không đồng bộ được banner cũng không sao.
    }
}

/* ---------- Thao tác ghi dữ liệu ---------- */

/** Ghi danh sách từ tùy chỉnh qua setModSettings. @returns {boolean} */
function adminBannedSetWords(list) {
    try {
        if (typeof setModSettings !== 'function') return false;
        return setModSettings({ bannedWords: Array.isArray(list) ? list : [] }) === true;
    } catch (error) {
        return false;
    }
}

/** Lưu từ từ form (thêm mới hoặc ghi đè mục cùng từ). */
function adminBannedSaveWord(body) {
    let word = '';
    let level = 2;
    let fold = 'default';

    try {
        const input = body.querySelector('[data-admin-banned-input]');
        if (input && typeof input.value === 'string') word = input.value.trim();
        const levelSelect = body.querySelector('[data-admin-banned-level]');
        if (levelSelect) level = Number(levelSelect.value);
        const foldSelect = body.querySelector('[data-admin-banned-fold]');
        if (foldSelect && typeof foldSelect.value === 'string') fold = foldSelect.value;
    } catch (error) {
        // Giữ giá trị mặc định.
    }

    if (adminBannedLevels.indexOf(level) === -1) level = 2;

    adminBannedState.formError = '';
    adminBannedState.formNotice = '';

    if (!word) {
        adminBannedState.formError = 'Vui lòng nhập từ hoặc cụm từ.';
        adminBannedRenderFeedback(body);
        return;
    }
    if (word.length > adminBannedMaxWord) {
        adminBannedState.formError = 'Từ không được vượt quá ' + adminBannedMaxWord + ' ký tự.';
        adminBannedRenderFeedback(body);
        return;
    }

    const key = word.toLowerCase();
    const next = adminBannedCustomRaw().filter((entry) => {
        const normalized = adminBannedNormalizeEntry(entry);
        return !normalized || normalized.word.toLowerCase() !== key;
    });

    const entry = { word: word, level: level };
    if (fold === 'off' || fold === 'review' || fold === 'full') entry.fold = fold;
    next.push(entry);

    if (next.length > adminBannedMaxWords) {
        adminBannedState.formError = 'Danh sách từ tùy chỉnh tối đa ' + adminBannedMaxWords + ' mục.';
        adminBannedRenderFeedback(body);
        return;
    }

    if (!adminBannedSetWords(next)) {
        adminBannedState.formError = 'Không lưu được. Kiểm tra quyền quản trị rồi thử lại.';
        adminBannedRenderFeedback(body);
        return;
    }

    adminBannedState.form.word = '';
    adminBannedState.formError = '';
    adminBannedState.formNotice = 'Đã lưu từ "' + word + '".';

    try {
        const input = body.querySelector('[data-admin-banned-input]');
        if (input) input.value = '';
    } catch (error) {
        // Bỏ qua.
    }

    adminBannedRenderFeedback(body);
    adminBannedRenderWords(body);
}

/** Xóa một từ tùy chỉnh. */
function adminBannedDeleteWord(body, word) {
    if (typeof word !== 'string' || !word) return;

    const key = word.toLowerCase();
    const next = adminBannedCustomRaw().filter((entry) => {
        const normalized = adminBannedNormalizeEntry(entry);
        return !normalized || normalized.word.toLowerCase() !== key;
    });

    adminBannedState.formNotice = '';
    adminBannedSetWords(next);
    adminBannedRenderFeedback(body);
    adminBannedRenderWords(body);
}

/** Gỡ một từ mẫu: thêm mục tùy chỉnh mức 0. */
function adminBannedRemoveDefault(body, word) {
    if (typeof word !== 'string' || !word) return;

    const key = word.toLowerCase();
    const next = adminBannedCustomRaw().filter((entry) => {
        const normalized = adminBannedNormalizeEntry(entry);
        return !normalized || normalized.word.toLowerCase() !== key;
    });

    next.push({ word: word, level: 0 });
    adminBannedSetWords(next);
    adminBannedRenderWords(body);
}

/** Khôi phục một từ mẫu: bỏ các mục mức 0 cùng từ. */
function adminBannedRestoreDefault(body, word) {
    if (typeof word !== 'string' || !word) return;

    const key = word.toLowerCase();
    const next = adminBannedCustomRaw().filter((entry) => {
        const normalized = adminBannedNormalizeEntry(entry);
        if (!normalized) return false;
        return !(normalized.level === 0 && normalized.word.toLowerCase() === key);
    });

    adminBannedSetWords(next);
    adminBannedRenderWords(body);
}

/** Điền sẵn form để đổi mức một từ mẫu. */
function adminBannedEditDefault(body, word, level) {
    adminBannedState.form.word = typeof word === 'string' ? word : '';
    adminBannedState.form.level = adminBannedLevels.indexOf(Number(level)) === -1 ? '2' : String(level);
    adminBannedState.form.fold = 'default';
    adminBannedState.formError = '';
    adminBannedState.formNotice = '';

    try {
        const input = body.querySelector('[data-admin-banned-input]');
        if (input) {
            input.value = adminBannedState.form.word;
            if (typeof input.focus === 'function') input.focus();
        }
        const levelSelect = body.querySelector('[data-admin-banned-level]');
        if (levelSelect) levelSelect.value = adminBannedState.form.level;
        const foldSelect = body.querySelector('[data-admin-banned-fold]');
        if (foldSelect) foldSelect.value = 'default';
    } catch (error) {
        // Bỏ qua.
    }

    adminBannedRenderFeedback(body);
}

/** Đặt lại danh sách từ tùy chỉnh (xác nhận bằng bấm hai lần). */
function adminBannedResetCustom(body) {
    if (!adminBannedState.resetArmed) {
        adminBannedState.resetArmed = true;
        adminBannedRenderWords(body);

        try {
            if (adminBannedResetTimer) clearTimeout(adminBannedResetTimer);
            adminBannedResetTimer = setTimeout(() => {
                adminBannedState.resetArmed = false;
                adminBannedResetTimer = null;
                adminBannedRenderWords(body);
            }, adminBannedResetDelay);
        } catch (error) {
            // Không có setTimeout thì vẫn giữ trạng thái chờ.
        }
        return;
    }

    if (adminBannedResetTimer) {
        try {
            clearTimeout(adminBannedResetTimer);
        } catch (error) {
            // Bỏ qua.
        }
        adminBannedResetTimer = null;
    }

    adminBannedState.resetArmed = false;
    adminBannedState.formNotice = '';
    adminBannedSetWords([]);
    adminBannedRenderFeedback(body);
    adminBannedRenderWords(body);
}

/** Thử kiểm tra một câu bằng classifyContent (không lưu, không phạt). */
function adminBannedRunTest(body) {
    let text = '';

    try {
        const box = body.querySelector('[data-admin-banned-test-text]');
        if (box && typeof box.value === 'string') text = box.value;
    } catch (error) {
        // Bỏ qua.
    }

    if (!text.trim()) {
        adminBannedState.testResult = null;
        adminBannedRenderTestResult(body);
        return;
    }

    let result = null;
    try {
        result = classifyContent(text, getBannedEntries());
    } catch (error) {
        result = null;
    }

    if (!result || typeof result !== 'object') result = { level: 0, words: [] };

    const level = Number.isFinite(result.level) ? result.level : 0;
    const words = Array.isArray(result.words) ? result.words : [];
    const detail = words.length ? 'Từ khớp: ' + words.join(', ') : 'Không có từ nào khớp.';

    let tone = 'success';
    let title = 'Hợp lệ';
    if (level === 1) { tone = 'info'; title = 'Cần xem xét'; }
    else if (level === 2) { tone = 'warn'; title = 'Vi phạm (bị chặn)'; }
    else if (level >= 3) { tone = 'danger'; title = 'Nghiêm trọng (bị chặn)'; }

    adminBannedState.testResult = { tone: tone, title: title, detail: detail };
    adminBannedRenderTestResult(body);
}

/* ---------- Xử lý sự kiện (ủy quyền) ---------- */

/** Đọc một thuộc tính data của nút. */
function adminBannedAttr(el, name) {
    try {
        return el && typeof el.getAttribute === 'function' ? el.getAttribute(name) : null;
    } catch (error) {
        return null;
    }
}

/** Click ủy quyền trên toàn mục. */
function adminBannedOnClick(body, event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== 'function') return;

    const el = target.closest('[data-admin-banned-action]');
    if (!el) return;

    const action = adminBannedAttr(el, 'data-admin-banned-action');

    try {
        /* Khối 1 */
        if (action === 'alert-filter') {
            adminBannedState.alertFilter = adminBannedAttr(el, 'data-admin-banned-read') === 'all' ? 'all' : 'unread';
            adminBannedRenderAlerts(body);
            return;
        }
        if (action === 'level-filter') {
            const value = adminBannedAttr(el, 'data-admin-banned-level-value');
            adminBannedState.alertLevel = (value === '1' || value === '2' || value === '3') ? value : 'all';
            adminBannedRenderAlerts(body);
            return;
        }
        if (action === 'mark-read') {
            const id = adminBannedAttr(el, 'data-admin-banned-id');
            if (typeof markModAlertsRead === 'function') markModAlertsRead([id]);
            adminBannedRenderAlerts(body);
            adminBannedSyncBanner();
            return;
        }
        if (action === 'remove-alert') {
            const id = adminBannedAttr(el, 'data-admin-banned-id');
            if (typeof removeModAlert === 'function') removeModAlert(id);
            adminBannedRenderAlerts(body);
            adminBannedSyncBanner();
            return;
        }
        if (action === 'mark-all-read') {
            if (typeof markModAlertsRead === 'function') markModAlertsRead();
            adminBannedRenderAlerts(body);
            adminBannedSyncBanner();
            return;
        }

        /* Khối 2 */
        if (action === 'save-word') {
            adminBannedSaveWord(body);
            return;
        }
        if (action === 'delete-word') {
            adminBannedDeleteWord(body, adminBannedAttr(el, 'data-admin-banned-word'));
            return;
        }
        if (action === 'toggle-defaults') {
            adminBannedState.defaultsOpen = !adminBannedState.defaultsOpen;
            adminBannedRenderWords(body);
            return;
        }
        if (action === 'remove-default') {
            adminBannedRemoveDefault(body, adminBannedAttr(el, 'data-admin-banned-word'));
            return;
        }
        if (action === 'restore-default') {
            adminBannedRestoreDefault(body, adminBannedAttr(el, 'data-admin-banned-word'));
            return;
        }
        if (action === 'edit-default') {
            adminBannedEditDefault(body, adminBannedAttr(el, 'data-admin-banned-word'),
                adminBannedAttr(el, 'data-admin-banned-level-value'));
            return;
        }
        if (action === 'reset-custom') {
            adminBannedResetCustom(body);
            return;
        }

        /* Khối 3 */
        if (action === 'run-test') {
            adminBannedRunTest(body);
            return;
        }
    } catch (error) {
        // Không để một thao tác lỗi làm sập mục.
    }
}

/** Gắn ủy quyền sự kiện lên phần thân mục (một lần cho mỗi lần shell vẽ body). */
function adminBannedBind(body) {
    try {
        if (!body || typeof body.addEventListener !== 'function') return;
        body.addEventListener('click', (event) => { adminBannedOnClick(body, event); });
    } catch (error) {
        // Không gắn được cũng không sao.
    }
}

/* ---------- Điểm vào ---------- */

/**
 * Vẽ mục "Từ ngữ cấm và vi phạm" vào phần thân .admin-section__body.
 * @param {Element} body container do admin-shell.js cung cấp.
 * @returns {Promise<void>}
 */
async function renderAdminModerationSection(body) {
    try {
        if (!body) return;

        if (typeof isAdmin !== 'function' || !isAdmin()) {
            body.innerHTML = '<p class="admin-empty">Chỉ quản trị viên mới xem được mục này.</p>';
            return;
        }

        if (!adminBannedHasModules()) {
            body.innerHTML = '<div class="admin-notice admin-notice--warn">'
                + 'Chưa nạp đủ module kiểm duyệt.</div>';
            return;
        }

        // Trạng thái về mặc định mỗi lần mở tab.
        adminBannedState.alertFilter = 'unread';
        adminBannedState.alertLevel = 'all';
        adminBannedState.form = { word: '', level: '2', fold: 'default' };
        adminBannedState.formError = '';
        adminBannedState.formNotice = '';
        adminBannedState.defaultsOpen = false;
        adminBannedState.resetArmed = false;
        adminBannedState.testResult = null;

        if (adminBannedResetTimer) {
            try {
                clearTimeout(adminBannedResetTimer);
            } catch (error) {
                // Bỏ qua.
            }
            adminBannedResetTimer = null;
        }

        body.innerHTML = adminBannedSectionHtml();
        adminBannedBind(body);
        adminBannedRenderAlerts(body);
        adminBannedRenderWords(body);
    } catch (error) {
        try {
            body.innerHTML = '<div class="admin-notice admin-notice--danger">'
                + 'Không hiển thị được mục từ ngữ cấm và vi phạm.</div>';
        } catch (innerError) {
            // Bỏ qua.
        }
    }
}

// Đăng ký mục vào tab "Cài đặt" (chỉ có tác dụng khi admin-shell.js đã nạp).
if (typeof registerAdminSection === 'function') {
    registerAdminSection('settings', 'moderation-manager', 'Từ ngữ cấm và vi phạm', renderAdminModerationSection);
}
