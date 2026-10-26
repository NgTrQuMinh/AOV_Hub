/**
 * admin-reports.js - Mục "Báo cáo vi phạm" trong tab "Báo cáo" của trang quản trị.
 *
 * Trang: src/pages/admin.html?tab=reports. admin-shell.js nạp ĐỘNG file này rồi gọi
 * renderAdminReportsSection() để vẽ phần thân; shell tự vẽ tiêu đề mục.
 *
 * Chức năng:
 *   - Lọc báo cáo theo trạng thái, loại nội dung, lý do và từ khoá.
 *   - Bỏ qua báo cáo (dismissed) hoặc xử lý nội dung: ẩn bài, xoá bình luận,
 *     cảnh cáo / cấm tài khoản bị báo cáo.
 *   - Mọi thao tác nhạy cảm đều xác nhận ngay trong bảng, không dùng confirm()/alert().
 *
 * Phụ thuộc (kiểm tra typeof trước khi gọi): report.js, feed.js, auth.js,
 * adminlog.js, components.js, admin-shell.js.
 */

/** Các bộ lọc trạng thái hợp lệ. */
const adminReportsStatusFilters = ['open', 'resolved', 'dismissed', 'all'];

/** Các bộ lọc loại đối tượng hợp lệ. */
const adminReportsTypeFilters = ['all', 'post', 'comment'];

/** Lý do tối thiểu khi cảnh cáo (khớp MODERATION_WARN_REASON_MIN của auth.js). */
const adminReportsWarnReasonMin = 3;

/** Trạng thái giao diện của mục. */
const adminReportsState = {
    status: 'open',
    type: 'all',
    reason: 'all',
    keyword: '',
    action: null,
    note: '',
    error: '',
    notice: null,
};

/* ---------- Tiện ích nội bộ ---------- */

/** Thoát ký tự HTML (ưu tiên escapeHtml của components.js). */
function adminReportsEscape(value) {
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

/** Định dạng thời gian (ưu tiên formatDateTime của components.js). */
function adminReportsFormatTime(value) {
    if (typeof value !== 'string' || value.trim() === '') return '';

    if (typeof formatDateTime === 'function') {
        try {
            return formatDateTime(value);
        } catch (error) {
            // Rơi xuống bản dự phòng bên dưới.
        }
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** Nhãn thao tác đang chờ xác nhận. */
function adminReportsActionLabel(type) {
    if (type === 'dismiss') return 'Bỏ qua báo cáo';
    if (type === 'hide') return 'Ẩn bài viết';
    if (type === 'delete-comment') return 'Xoá bình luận';
    if (type === 'warn') return 'Cảnh cáo tài khoản';
    if (type === 'ban') return 'Cấm tài khoản';
    return 'Xử lý báo cáo';
}

/** Báo cáo đang mở có còn đối tượng để thao tác không. */
function adminReportsTargetExists(report) {
    if (!report) return false;

    try {
        if (report.targetType === 'post') {
            return typeof getPosts === 'function'
                && getPosts().some((post) => String(post.id) === String(report.targetId));
        }

        if (report.targetType === 'comment') {
            return typeof getComments === 'function'
                && getComments().some((comment) => String(comment.id) === String(report.targetId));
        }
    } catch (error) {
        return false;
    }

    return false;
}

/** Bài viết của báo cáo đã bị ẩn chưa. */
function adminReportsPostHidden(report) {
    if (!report || report.targetType !== 'post' || typeof getPosts !== 'function') return false;

    try {
        const post = getPosts().find((item) => String(item.id) === String(report.targetId));
        return Boolean(post && post.hidden === true);
    } catch (error) {
        return false;
    }
}

/** Lấy báo cáo theo id trong dữ liệu hiện tại. */
function adminReportsFind(reportId) {
    if (typeof getReportById === 'function') return getReportById(reportId);

    return typeof getReports === 'function'
        ? getReports().find((report) => String(report.id) === String(reportId)) || null
        : null;
}

/** Danh sách báo cáo sau khi lọc + sắp xếp mới nhất trước. */
function adminReportsFiltered() {
    const all = typeof getReports === 'function' ? getReports() : [];
    const keyword = adminReportsState.keyword.trim().toLowerCase();

    return all.filter((report) => {
        if (adminReportsState.status !== 'all' && report.status !== adminReportsState.status) return false;
        if (adminReportsState.type !== 'all' && report.targetType !== adminReportsState.type) return false;
        if (adminReportsState.reason !== 'all' && report.reason !== adminReportsState.reason) return false;

        if (!keyword) return true;

        const haystack = [
            report.reporter,
            report.targetAuthor,
            report.note,
            report.excerpt,
            report.id,
            report.targetId,
            report.postId,
        ].map((value) => String(value === undefined || value === null ? '' : value)).join(' ').toLowerCase();

        return haystack.includes(keyword);
    }).sort((a, b) => {
        const at = Date.parse(a.createdAt);
        const bt = Date.parse(b.createdAt);
        return (Number.isNaN(bt) ? 0 : bt) - (Number.isNaN(at) ? 0 : at);
    });
}

/* ---------- HTML ---------- */

/** Nút lọc trạng thái. */
function adminReportsStatusButtonHtml(value, label) {
    const active = adminReportsState.status === value;

    return '<button type="button" class="btn ' + (active ? 'btn-primary' : 'btn-outline') + '"'
        + ' data-admin-reports-status="' + adminReportsEscape(value) + '"'
        + ' aria-pressed="' + (active ? 'true' : 'false') + '">'
        + adminReportsEscape(label) + '</button>';
}

/** Nhãn trạng thái báo cáo. */
function adminReportsStatusBadgeHtml(status) {
    if (status === 'resolved') {
        return '<span class="admin-badge admin-badge--approved">Đã xử lý</span>';
    }
    if (status === 'dismissed') {
        return '<span class="admin-badge admin-badge--rejected">Bỏ qua</span>';
    }
    return '<span class="admin-badge admin-badge--pending">Đang mở</span>';
}

/** Liên kết tới bài viết / bình luận bị báo cáo. */
function adminReportsTargetHtml(report) {
    const postId = String(report.postId || (report.targetType === 'post' ? report.targetId : ''));
    const base = typeof BASE_PATH === 'string' ? BASE_PATH : '/';
    const href = base + 'src/pages/post-detail.html?id=' + encodeURIComponent(postId);
    const typeLabel = report.targetType === 'comment' ? 'Bình luận' : 'Bài viết';
    const excerpt = adminReportsEscape(report.excerpt || '(không có nội dung rút gọn)');
    const targetId = adminReportsEscape(report.targetType === 'comment' ? report.targetId : postId);

    return '<a href="' + adminReportsEscape(href) + '">' + adminReportsEscape(typeLabel) + ' #' + targetId + '</a>'
        + '<div class="admin-section__desc admin-reports__excerpt">' + excerpt + '</div>';
}

/** Hộp xác nhận thao tác đang chờ. */
function adminReportsConfirmHtml(report, actionType) {
    const noteRequired = actionType === 'warn';
    const hint = noteRequired
        ? ' (bắt buộc, ít nhất ' + adminReportsWarnReasonMin + ' ký tự)'
        : ' (không bắt buộc)';
    const error = adminReportsState.error
        ? '<p class="admin-field__error" data-admin-reports-error>' + adminReportsEscape(adminReportsState.error) + '</p>'
        : '';

    return '<div class="admin-notice admin-notice--warn admin-reports__confirm" data-admin-reports-confirm-panel>'
        + '<p>' + adminReportsEscape(adminReportsActionLabel(actionType))
        + ' cho báo cáo #' + adminReportsEscape(report.id) + '?</p>'
        + '<div class="admin-field">'
        + '<label class="admin-field__label" for="admin-reports-note">Ghi chú xử lý' + hint + '</label>'
        + '<textarea id="admin-reports-note" data-admin-reports-note rows="2" maxlength="' + REPORT_NOTE_MAX + '">'
        + adminReportsEscape(adminReportsState.note) + '</textarea>'
        + '</div>'
        + error
        + '<div class="admin-table__actions">'
        + '<button type="button" class="btn btn-primary" data-admin-reports-confirm>Xác nhận</button>'
        + '<button type="button" class="btn btn-outline" data-admin-reports-cancel>Huỷ</button>'
        + '</div>'
        + '</div>';
}

/** Các nút thao tác của một báo cáo đang mở. */
function adminReportsActionsHtml(report) {
    if (report.status !== 'open') {
        return '<span class="admin-section__desc">—</span>';
    }

    const id = adminReportsEscape(report.id);
    const exists = adminReportsTargetExists(report);
    const canModerate = typeof canModerateUser === 'function'
        && canModerateUser(report.targetAuthor);

    let buttons = '<button type="button" class="btn btn-outline" data-admin-reports-action="dismiss"'
        + ' data-admin-reports-id="' + id + '">Bỏ qua</button>';

    if (exists && report.targetType === 'post' && !adminReportsPostHidden(report)) {
        buttons += '<button type="button" class="btn btn-danger" data-admin-reports-action="hide"'
            + ' data-admin-reports-id="' + id + '">Ẩn bài</button>';
    }

    if (exists && report.targetType === 'comment') {
        buttons += '<button type="button" class="btn btn-danger" data-admin-reports-action="delete-comment"'
            + ' data-admin-reports-id="' + id + '">Xoá bình luận</button>';
    }

    if (canModerate) {
        buttons += '<button type="button" class="btn btn-outline" data-admin-reports-action="warn"'
            + ' data-admin-reports-id="' + id + '">Cảnh cáo</button>'
            + '<button type="button" class="btn btn-danger" data-admin-reports-action="ban"'
            + ' data-admin-reports-id="' + id + '">Cấm</button>';
    }

    const action = adminReportsState.action;
    const panel = action && String(action.reportId) === String(report.id)
        ? adminReportsConfirmHtml(report, action.type)
        : '';

    return '<div class="admin-table__actions">' + buttons + '</div>' + panel;
}

/** Một dòng trong bảng báo cáo. */
function adminReportsRowHtml(report) {
    const createdAt = adminReportsFormatTime(report.createdAt);
    const reason = typeof getReportReasonLabel === 'function'
        ? getReportReasonLabel(report.reason)
        : report.reason;

    return '<tr' + (report.status === 'open' ? ' class="admin-row--flagged"' : '') + '>'
        + '<td>' + (createdAt ? adminReportsEscape(createdAt) : '—')
        + '<div class="admin-section__desc">#' + adminReportsEscape(report.id) + '</div></td>'
        + '<td>' + adminReportsTargetHtml(report) + '</td>'
        + '<td>' + adminReportsEscape(report.targetAuthor) + '</td>'
        + '<td>' + adminReportsEscape(report.reporter) + '</td>'
        + '<td>' + adminReportsEscape(reason)
        + (report.note ? '<div class="admin-section__desc admin-reports__note">' + adminReportsEscape(report.note) + '</div>' : '')
        + '</td>'
        + '<td>' + adminReportsStatusBadgeHtml(report.status)
        + (report.resolution ? '<div class="admin-section__desc">' + adminReportsEscape(report.resolution) + '</div>' : '')
        + '</td>'
        + '<td>' + adminReportsActionsHtml(report) + '</td>'
        + '</tr>';
}

/** Toàn bộ phần thân mục. */
function adminReportsSectionHtml() {
    const reasonOptions = ['all'].concat(typeof REPORT_REASONS !== 'undefined'
        ? REPORT_REASONS.map((reason) => reason.value)
        : []).map((value) => {
        const label = value === 'all'
            ? 'Tất cả lý do'
            : (typeof getReportReasonLabel === 'function' ? getReportReasonLabel(value) : value);
        return '<option value="' + adminReportsEscape(value) + '"'
            + (adminReportsState.reason === value ? ' selected' : '') + '>'
            + adminReportsEscape(label) + '</option>';
    }).join('');

    return '<p class="admin-section__desc">'
        + 'Theo dõi báo cáo của người dùng và xử lý nội dung vi phạm. '
        + 'Mọi thao tác được xác nhận ngay trong trang; báo cáo đang mở sẽ tự đóng khi nội dung bị ẩn/xoá.'
        + '</p>'
        + '<div class="admin-toolbar admin-reports__toolbar">'
        + '<input type="search" class="filter-bar__keyword" data-admin-reports-keyword'
        + ' placeholder="Tìm người báo cáo, tác giả, nội dung..."'
        + ' value="' + adminReportsEscape(adminReportsState.keyword) + '">'
        + adminReportsStatusButtonHtml('open', 'Đang mở')
        + adminReportsStatusButtonHtml('resolved', 'Đã xử lý')
        + adminReportsStatusButtonHtml('dismissed', 'Bỏ qua')
        + adminReportsStatusButtonHtml('all', 'Tất cả')
        + '<select class="filter-bar__select" data-admin-reports-type aria-label="Loại nội dung">'
        + '<option value="all"' + (adminReportsState.type === 'all' ? ' selected' : '') + '>Mọi loại</option>'
        + '<option value="post"' + (adminReportsState.type === 'post' ? ' selected' : '') + '>Bài viết</option>'
        + '<option value="comment"' + (adminReportsState.type === 'comment' ? ' selected' : '') + '>Bình luận</option>'
        + '</select>'
        + '<select class="filter-bar__select" data-admin-reports-reason aria-label="Lý do báo cáo">'
        + reasonOptions
        + '</select>'
        + '</div>'
        + '<div data-admin-reports-view></div>';
}

/** Bảng báo cáo (hoặc khối rỗng). */
function adminReportsTableHtml(reports) {
    if (!reports.length) {
        const text = typeof getReports === 'function' && getReports().length
            ? 'Không có báo cáo nào khớp bộ lọc.'
            : 'Chưa có báo cáo nào.';
        return '<p class="admin-empty">' + adminReportsEscape(text) + '</p>';
    }

    return '<div class="admin-table-wrap"><table class="admin-table admin-reports__table">'
        + '<thead><tr>'
        + '<th>Thời gian</th><th>Đối tượng</th><th>Tác giả</th><th>Người báo cáo</th>'
        + '<th>Lý do / ghi chú</th><th>Trạng thái</th><th>Xử lý</th>'
        + '</tr></thead>'
        + '<tbody>' + reports.map(adminReportsRowHtml).join('') + '</tbody>'
        + '</table></div>';
}

/** Thông báo kết quả thao tác (nếu có). */
function adminReportsNoticeHtml() {
    const notice = adminReportsState.notice;
    if (!notice || typeof notice.text !== 'string' || notice.text === '') return '';

    const kind = notice.kind === 'danger' ? 'danger' : 'success';
    return '<div class="admin-notice admin-notice--' + kind + '" data-admin-reports-notice>'
        + adminReportsEscape(notice.text) + '</div>';
}

/* ---------- Vẽ lại ---------- */

/** Phần nội dung thay đổi của mục. */
function adminReportsViewEl(body) {
    try {
        return body && typeof body.querySelector === 'function'
            ? body.querySelector('[data-admin-reports-view]')
            : null;
    } catch (error) {
        return null;
    }
}

/** Đồng bộ trạng thái active của nút lọc trạng thái. */
function adminReportsSyncFilters(body) {
    try {
        if (!body || typeof body.querySelectorAll !== 'function') return;

        body.querySelectorAll('[data-admin-reports-status]').forEach((button) => {
            const active = button.getAttribute('data-admin-reports-status') === adminReportsState.status;
            button.classList.toggle('btn-primary', active);
            button.classList.toggle('btn-outline', !active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    } catch (error) {
        // Bỏ qua.
    }
}

/** Vẽ lại vùng nội dung sau khi lọc / thao tác. */
function adminReportsRedraw(body) {
    const view = adminReportsViewEl(body);
    if (!view) return;

    adminReportsSyncFilters(body);
    view.innerHTML = adminReportsNoticeHtml()
        + adminReportsTableHtml(adminReportsFiltered());
}

/* ---------- Thao tác ---------- */

/** Cập nhật badge tab Báo cáo. */
function adminReportsRefreshBadge() {
    if (typeof refreshAdminBadges === 'function') return refreshAdminBadges();
    return Promise.resolve();
}

/** Mở hộp xác nhận cho một hành động. */
function adminReportsOpenAction(body, reportId, actionType) {
    adminReportsState.action = { reportId, type: actionType };
    adminReportsState.note = '';
    adminReportsState.error = '';
    adminReportsState.notice = null;
    adminReportsRedraw(body);
}

/** Đóng hộp xác nhận. */
function adminReportsCancelAction(body) {
    adminReportsState.action = null;
    adminReportsState.note = '';
    adminReportsState.error = '';
    adminReportsRedraw(body);
}

/** Lưu lỗi và vẽ lại hộp xác nhận. */
function adminReportsSetError(body, message) {
    adminReportsState.error = String(message || '');
    adminReportsRedraw(body);
}

/** Thực hiện hành động sau khi xác nhận. */
function adminReportsConfirmAction(body) {
    const action = adminReportsState.action;
    if (!action) return;

    if (typeof canAdminWrite === 'function' && !canAdminWrite()) {
        adminReportsSetError(body, 'Bạn không có quyền thực hiện thao tác quản trị.');
        return;
    }

    const report = adminReportsFind(action.reportId);
    if (!report || report.status !== 'open') {
        adminReportsSetError(body, 'Báo cáo không còn ở trạng thái đang mở.');
        return;
    }

    const note = adminReportsState.note.trim();

    if (action.type === 'warn' && note.length < adminReportsWarnReasonMin) {
        adminReportsSetError(body, 'Lý do cảnh cáo phải có ít nhất ' + adminReportsWarnReasonMin + ' ký tự.');
        return;
    }

    let ok = false;
    let noticeText = '';

    try {
        if (action.type === 'dismiss') {
            ok = typeof dismissReport === 'function' && dismissReport(report.id, note) === true;
            noticeText = 'Đã bỏ qua báo cáo #' + report.id + '.';
        } else if (action.type === 'hide') {
            ok = typeof setPostHidden === 'function' && setPostHidden(report.targetId, true) === true;
            if (ok && typeof closeReportsForPost === 'function') {
                closeReportsForPost(report.targetId, 'Bài viết đã bị ẩn');
            }
            noticeText = 'Đã ẩn bài viết bị báo cáo.';
        } else if (action.type === 'delete-comment') {
            ok = typeof deleteComment === 'function' && deleteComment(report.targetId) === true;
            if (ok && typeof closeReportForComment === 'function') {
                closeReportForComment(report.targetId, 'Bình luận đã bị xoá');
            }
            noticeText = 'Đã xoá bình luận bị báo cáo.';
        } else if (action.type === 'warn' || action.type === 'ban') {
            if (typeof canModerateUser !== 'function' || !canModerateUser(report.targetAuthor)) {
                adminReportsSetError(body, 'Không thể xử lý tài khoản này.');
                return;
            }

            const accountOk = action.type === 'warn'
                ? (typeof warnUser === 'function' && warnUser(report.targetAuthor, note) === true)
                : (typeof banUser === 'function' && banUser(report.targetAuthor, note) === true);

            if (accountOk && typeof resolveReport === 'function') {
                const resolution = (action.type === 'warn' ? 'Đã cảnh cáo ' : 'Đã cấm ') + report.targetAuthor;
                resolveReport(report.id, note ? resolution + ': ' + note : resolution);
            }

            ok = accountOk;
            noticeText = action.type === 'warn'
                ? 'Đã cảnh cáo tài khoản "' + report.targetAuthor + '".'
                : 'Đã cấm tài khoản "' + report.targetAuthor + '".';
        }
    } catch (error) {
        ok = false;
    }

    if (!ok) {
        adminReportsSetError(body, 'Không thực hiện được thao tác. Vui lòng thử lại.');
        return;
    }

    adminReportsState.action = null;
    adminReportsState.note = '';
    adminReportsState.error = '';
    adminReportsState.notice = { kind: 'success', text: noticeText };
    adminReportsRedraw(body);
    adminReportsRefreshBadge();
}

/* ---------- Sự kiện ---------- */

function adminReportsOnClick(body, event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== 'function') return;

    if (target.closest('[data-admin-reports-confirm]')) {
        adminReportsConfirmAction(body);
        return;
    }

    if (target.closest('[data-admin-reports-cancel]')) {
        adminReportsCancelAction(body);
        return;
    }

    const statusButton = target.closest('[data-admin-reports-status]');
    if (statusButton) {
        const value = statusButton.getAttribute('data-admin-reports-status');
        adminReportsState.status = adminReportsStatusFilters.includes(value) ? value : 'open';
        adminReportsState.action = null;
        adminReportsState.error = '';
        adminReportsRedraw(body);
        return;
    }

    const actionButton = target.closest('[data-admin-reports-action]');
    if (actionButton) {
        adminReportsOpenAction(
            body,
            actionButton.getAttribute('data-admin-reports-id'),
            actionButton.getAttribute('data-admin-reports-action'),
        );
    }
}

function adminReportsOnInput(body, event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== 'function') return;

    if (target.closest('[data-admin-reports-keyword]')) {
        adminReportsState.keyword = typeof target.value === 'string' ? target.value : '';
        adminReportsRedraw(body);
        return;
    }

    if (target.closest('[data-admin-reports-note]')) {
        adminReportsState.note = typeof target.value === 'string' ? target.value : '';
    }
}

function adminReportsOnChange(body, event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== 'function') return;

    if (target.closest('[data-admin-reports-type]')) {
        const value = target.value;
        adminReportsState.type = adminReportsTypeFilters.includes(value) ? value : 'all';
        adminReportsState.action = null;
        adminReportsRedraw(body);
        return;
    }

    if (target.closest('[data-admin-reports-reason]')) {
        const value = target.value;
        const valid = value === 'all' || (typeof REPORT_REASON_VALUES !== 'undefined'
            && REPORT_REASON_VALUES.includes(value));
        adminReportsState.reason = valid ? value : 'all';
        adminReportsState.action = null;
        adminReportsRedraw(body);
    }
}

/** Gắn event delegation một lần cho mỗi lần shell tạo body. */
function adminReportsBind(body) {
    try {
        if (!body || typeof body.addEventListener !== 'function') return;

        body.addEventListener('click', (event) => { adminReportsOnClick(body, event); });
        body.addEventListener('input', (event) => { adminReportsOnInput(body, event); });
        body.addEventListener('change', (event) => { adminReportsOnChange(body, event); });
    } catch (error) {
        // Không gắn được thì mục vẫn hiển thị nhưng không thao tác.
    }
}

/* ---------- Điểm vào ---------- */

/**
 * Vẽ mục "Báo cáo vi phạm" vào phần thân .admin-section__body.
 * @param {Element} body container do admin-shell.js cung cấp.
 * @returns {Promise<void>}
 */
async function renderAdminReportsSection(body) {
    try {
        if (!body) return;

        if (typeof isAdmin !== 'function' || !isAdmin()) {
            body.innerHTML = '<p class="admin-empty">Chỉ quản trị viên mới xem được báo cáo.</p>';
            return;
        }

        if (typeof initReportStore === 'function') {
            await initReportStore();
        }

        adminReportsState.action = null;
        adminReportsState.note = '';
        adminReportsState.error = '';
        adminReportsState.notice = null;

        body.innerHTML = adminReportsSectionHtml();
        adminReportsBind(body);
        adminReportsRedraw(body);
    } catch (error) {
        try {
            body.innerHTML = '<div class="admin-notice admin-notice--danger">'
                + 'Không hiển thị được mục báo cáo vi phạm.'
                + '</div>';
        } catch (innerError) {
            // Bỏ qua.
        }
    }
}

// Đăng ký mục vào tab "Báo cáo" (chỉ có tác dụng khi admin-shell.js đã nạp).
if (typeof registerAdminSection === 'function') {
    registerAdminSection('reports', 'reports-manager', 'Báo cáo vi phạm', renderAdminReportsSection);
}
