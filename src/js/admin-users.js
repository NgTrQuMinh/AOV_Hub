/**
 * admin-users.js - Mục "Quản lý người dùng" trong tab "Người dùng" (task KD09-c)
 *
 * Trang: src/pages/admin.html?tab=users. admin-shell.js nạp ĐỘNG file này rồi gọi
 * renderAdminUsersSection() để vẽ phần thân mục; shell tự vẽ tiêu đề.
 *
 * MỤC ĐÍCH
 *   Admin xem danh sách tài khoản và khóa / mở khóa / cảnh cáo thành viên.
 *   Mọi thao tác nguy hiểm đều phải xác nhận NGAY TRONG giao diện kèm lý do,
 *   KHÔNG dùng hộp thoại trình duyệt. TUYỆT ĐỐI không hiển thị
 *   passwordHash / salt / password của tài khoản.
 *
 * LUẬT HIỂN THỊ
 *   - Chỉ admin (isAdmin) mới xem được danh sách.
 *   - Tài khoản admin và chính mình KHÔNG có nút thao tác (canModerateUser()).
 *   - Ban: lý do không bắt buộc. Cảnh cáo: lý do bắt buộc, ít nhất 3 ký tự.
 *   - Mọi chuỗi lấy từ dữ liệu đều qua adminUsersEscape() trước khi vào innerHTML.
 *
 * PHỤ THUỘC (đều kiểm tra typeof trước khi gọi nên thiếu file cũng không lỗi):
 *   auth.js (isAdmin / getUsersForAdmin / canModerateUser / banUser / unbanUser /
 *   warnUser / isUserBanned), components.js (escapeHtml / formatDateTime),
 *   admin-shell.js (registerAdminSection).
 */

/** Lý do cảnh cáo tối thiểu (khớp MODERATION_WARN_REASON_MIN của auth.js). */
const adminUsersReasonMin = 3;

/** Độ dài lý do tối đa cho phép (khớp MODERATION_REASON_MAX của auth.js). */
const adminUsersReasonMax = 200;

/** Các bộ lọc trạng thái hợp lệ. */
const adminUsersFilters = ['all', 'active', 'banned', 'warned'];

/**
 * Trạng thái giao diện của mục (giữ giữa các lần vẽ lại).
 *   keyword  từ khóa tìm theo tài khoản / tên hiển thị
 *   filter   'all' | 'active' | 'banned' | 'warned'
 *   action   { username, type: 'ban'|'unban'|'warn' } đang chờ xác nhận
 *   reason   lý do đang gõ trong hộp xác nhận
 *   error    lỗi xác nhận gần nhất
 *   notice   { kind: 'success'|'danger', text } thông báo sau thao tác
 */
const adminUsersState = {
    keyword: '',
    filter: 'all',
    action: null,
    reason: '',
    error: '',
    notice: null,
};

/* ---------- Tiện ích nội bộ ---------- */

/** Thoát ký tự HTML (ưu tiên escapeHtml của components.js). */
function adminUsersEscape(value) {
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

/** Định dạng mốc thời gian (ưu tiên formatDateTime của components.js). */
function adminUsersFormatTime(value) {
    if (typeof value !== 'string' || value.trim() === '') return '';

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

/** Danh sách tài khoản cho admin; thiếu hàm / lỗi -> mảng rỗng. */
function adminUsersAll() {
    try {
        if (typeof getUsersForAdmin !== 'function') return [];
        const users = getUsersForAdmin();
        return Array.isArray(users) ? users : [];
    } catch (error) {
        return [];
    }
}

/** Người dùng có được phép kiểm duyệt không (thiếu hàm -> không cho). */
function adminUsersCanModerate(username) {
    if (typeof canModerateUser !== 'function') return false;

    try {
        return canModerateUser(username) === true;
    } catch (error) {
        return false;
    }
}

/** Tài khoản khớp bộ lọc và từ khóa hiện tại không. */
function adminUsersMatches(user, keyword, filter) {
    if (!user || typeof user !== 'object') return false;

    const banned = user.banned === true;
    const warned = Array.isArray(user.warnings) && user.warnings.length > 0;

    if (filter === 'banned' && !banned) return false;
    if (filter === 'active' && banned) return false;
    if (filter === 'warned' && !warned) return false;

    if (!keyword) return true;

    const haystack = [user.username, user.displayName]
        .map((value) => (typeof value === 'string' ? value : ''))
        .join(' ')
        .toLowerCase();

    return haystack.indexOf(keyword) !== -1;
}

/** Danh sách tài khoản đã lọc theo trạng thái + từ khóa. */
function adminUsersFiltered() {
    const keyword = String(adminUsersState.keyword || '').trim().toLowerCase();
    const filter = adminUsersFilters.indexOf(adminUsersState.filter) === -1 ? 'all' : adminUsersState.filter;

    return adminUsersAll().filter((user) => adminUsersMatches(user, keyword, filter));
}

/* ---------- Dựng HTML ---------- */

/** Nhãn tiếng Việt của một thao tác. */
function adminUsersActionLabel(type) {
    if (type === 'ban') return 'Khóa tài khoản';
    if (type === 'unban') return 'Mở khóa tài khoản';
    if (type === 'warn') return 'Cảnh cáo tài khoản';
    return 'Thao tác';
}

/** Ô vai trò: admin là nhãn vàng, còn lại chữ thường. */
function adminUsersRoleHtml(user) {
    if (user.role === 'admin') {
        return '<span class="admin-badge admin-badge--admin">Quản trị viên</span>';
    }

    return 'Thành viên';
}

/** Ô trạng thái: nhãn bị khóa / bình thường kèm lý do khóa nếu có. */
function adminUsersStatusHtml(user) {
    if (user.role === 'admin') return '—';

    if (user.banned === true) {
        const reason = typeof user.bannedReason === 'string' && user.bannedReason.trim() !== ''
            ? user.bannedReason
            : '(không có lý do)';

        return '<span class="admin-badge admin-badge--banned">Đang bị khóa</span>'
            + '<div class="admin-section__desc">Lý do: ' + adminUsersEscape(reason) + '</div>';
    }

    return '<span class="admin-badge admin-badge--approved">Bình thường</span>';
}

/** Ô thao tác: chỉ hiện nút khi được phép kiểm duyệt tài khoản đó. */
function adminUsersActionsHtml(user) {
    if (!adminUsersCanModerate(user.username)) {
        return '<span class="admin-section__desc">—</span>';
    }

    const usernameAttr = adminUsersEscape(user.username);

    if (user.banned === true) {
        return '<div class="admin-table__actions">'
            + '<button type="button" class="btn btn-primary" data-admin-users-action="unban"'
            + ' data-admin-users-user="' + usernameAttr + '">Mở khóa</button>'
            + '</div>';
    }

    return '<div class="admin-table__actions">'
        + '<button type="button" class="btn btn-danger" data-admin-users-action="ban"'
        + ' data-admin-users-user="' + usernameAttr + '">Khóa</button>'
        + '<button type="button" class="btn btn-outline" data-admin-users-action="warn"'
        + ' data-admin-users-user="' + usernameAttr + '">Cảnh cáo</button>'
        + '</div>';
}

/** Một dòng bảng tài khoản. */
function adminUsersRowHtml(user) {
    const joined = adminUsersFormatTime(user.joinedAt);
    const warnings = Array.isArray(user.warnings) ? user.warnings : [];
    const displayName = typeof user.displayName === 'string' && user.displayName.trim() !== ''
        ? adminUsersEscape(user.displayName)
        : '—';

    return '<tr' + (user.banned === true ? ' class="admin-row--flagged"' : '') + '>'
        + '<td>' + adminUsersEscape(user.username) + '</td>'
        + '<td>' + displayName + '</td>'
        + '<td>' + adminUsersRoleHtml(user) + '</td>'
        + '<td>' + (joined ? adminUsersEscape(joined) : '—') + '</td>'
        + '<td>' + adminUsersStatusHtml(user) + '</td>'
        + '<td>' + warnings.length + '</td>'
        + '<td>' + adminUsersActionsHtml(user) + '</td>'
        + '</tr>';
}

/** Bảng tài khoản (hoặc khối rỗng khi không có dòng nào). */
function adminUsersTableHtml(users) {
    if (!users.length) {
        const text = adminUsersAll().length
            ? 'Không có tài khoản nào khớp bộ lọc.'
            : 'Chưa có tài khoản nào.';

        return '<p class="admin-empty">' + text + '</p>';
    }

    return '<div class="admin-table-wrap"><table class="admin-table">'
        + '<thead><tr>'
        + '<th>Tài khoản</th><th>Tên hiển thị</th><th>Vai trò</th><th>Tham gia</th>'
        + '<th>Trạng thái</th><th>Cảnh cáo</th><th>Thao tác</th>'
        + '</tr></thead>'
        + '<tbody>' + users.map(adminUsersRowHtml).join('') + '</tbody>'
        + '</table></div>';
}

/** Thông báo kết quả thao tác (nếu có). */
function adminUsersNoticeHtml() {
    const notice = adminUsersState.notice;
    if (!notice || typeof notice.text !== 'string' || notice.text === '') return '';

    const kind = notice.kind === 'danger' ? 'danger' : 'success';
    return '<div class="admin-notice admin-notice--' + kind + '" data-admin-users-notice>'
        + adminUsersEscape(notice.text) + '</div>';
}

/** Hộp xác nhận thao tác đang chờ (kèm ô lý do và chỗ báo lỗi). */
function adminUsersActionHtml() {
    const action = adminUsersState.action;
    if (!action || typeof action !== 'object') return '';

    const type = action.type;
    const needReason = type === 'ban' || type === 'warn';
    const username = adminUsersEscape(action.username);

    let reasonField = '';

    if (needReason) {
        const hint = type === 'warn' ? ' (bắt buộc, ít nhất ' + adminUsersReasonMin + ' ký tự)' : ' (không bắt buộc)';
        reasonField = '<div class="admin-field">'
            + '<label class="admin-field__label" for="admin-users-reason">Lý do' + hint + '</label>'
            + '<input type="text" id="admin-users-reason" data-admin-users-reason'
            + ' maxlength="' + adminUsersReasonMax + '"'
            + ' value="' + adminUsersEscape(adminUsersState.reason) + '">'
            + '</div>';
    }

    const error = adminUsersState.error
        ? '<p class="admin-field__error" data-admin-users-error>' + adminUsersEscape(adminUsersState.error) + '</p>'
        : '';

    return '<div class="admin-notice admin-notice--warn" data-admin-users-confirm-panel>'
        + '<p>' + adminUsersEscape(adminUsersActionLabel(type)) + ' cho tài khoản "' + username + '"?</p>'
        + reasonField
        + error
        + '<div class="admin-table__actions">'
        + '<button type="button" class="btn btn-primary" data-admin-users-confirm>Xác nhận</button>'
        + '<button type="button" class="btn btn-outline" data-admin-users-cancel>Huỷ</button>'
        + '</div>'
        + '</div>';
}

/** Nút lọc trạng thái. */
function adminUsersFilterButtonHtml(filter, label) {
    const active = adminUsersState.filter === filter;

    return '<button type="button" class="btn ' + (active ? 'btn-primary' : 'btn-outline') + '"'
        + ' data-admin-users-filter="' + filter + '"'
        + ' aria-pressed="' + (active ? 'true' : 'false') + '">'
        + adminUsersEscape(label) + '</button>';
}

/** Khung HTML của mục (không gồm tiêu đề do shell vẽ). */
function adminUsersSectionHtml() {
    return ''
        + '<p class="admin-section__desc">'
        + 'Xem danh sách tài khoản và khóa / mở khóa / cảnh cáo thành viên. '
        + 'Mọi thao tác đều xác nhận ngay trong trang kèm lý do.'
        + '</p>'
        + '<div class="admin-toolbar">'
        + '<input type="search" class="filter-bar__keyword" data-admin-users-keyword'
        + ' placeholder="Tìm theo tài khoản hoặc tên hiển thị"'
        + ' value="' + adminUsersEscape(adminUsersState.keyword) + '">'
        + adminUsersFilterButtonHtml('all', 'Tất cả')
        + adminUsersFilterButtonHtml('active', 'Đang hoạt động')
        + adminUsersFilterButtonHtml('banned', 'Đang bị khóa')
        + adminUsersFilterButtonHtml('warned', 'Có cảnh cáo')
        + '</div>'
        + '<div data-admin-users-view></div>';
}

/* ---------- Vẽ lại phần thay đổi ---------- */

/** Vùng nội dung động (thông báo + hộp xác nhận + bảng). */
function adminUsersViewEl(body) {
    try {
        return body && typeof body.querySelector === 'function' ? body.querySelector('[data-admin-users-view]') : null;
    } catch (error) {
        return null;
    }
}

/** Cập nhật class is-active/aria-pressed của các nút lọc. */
function adminUsersSyncFilters(body) {
    try {
        if (!body || typeof body.querySelectorAll !== 'function') return;

        body.querySelectorAll('[data-admin-users-filter]').forEach((button) => {
            const active = button.getAttribute('data-admin-users-filter') === adminUsersState.filter;
            button.classList.toggle('btn-primary', active);
            button.classList.toggle('btn-outline', !active);
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    } catch (error) {
        // Không đồng bộ được nhãn cũng không sao.
    }
}

/** Vẽ lại thông báo + hộp xác nhận + bảng theo trạng thái hiện tại. */
function adminUsersRedraw(body) {
    try {
        const view = adminUsersViewEl(body);
        if (!view) return;

        view.innerHTML = adminUsersNoticeHtml() + adminUsersActionHtml() + adminUsersTableHtml(adminUsersFiltered());
        adminUsersSyncFilters(body);
    } catch (error) {
        // Bỏ qua: lần vẽ sau sẽ thử lại.
    }
}

/**
 * Báo lỗi trong hộp xác nhận. Nếu chưa có chỗ báo lỗi thì vẽ lại (để tạo chỗ đó),
 * tránh làm mất lý do admin đang gõ.
 */
function adminUsersSetError(body, message) {
    adminUsersState.error = typeof message === 'string' ? message : '';

    let target = null;
    try {
        target = body && typeof body.querySelector === 'function' ? body.querySelector('[data-admin-users-error]') : null;
    } catch (error) {
        target = null;
    }

    if (target) {
        target.innerHTML = adminUsersEscape(adminUsersState.error);
        return;
    }

    adminUsersRedraw(body);
}

/* ---------- Xử lý sự kiện ---------- */

/** Mở hộp xác nhận cho một thao tác. */
function adminUsersOpenAction(body, type, username) {
    if (['ban', 'unban', 'warn'].indexOf(type) === -1) return;
    if (typeof username !== 'string' || username === '') return;

    // Chặn ngay ở tầng giao diện: không cho mở xác nhận với tài khoản không được phép.
    if (!adminUsersCanModerate(username)) return;

    adminUsersState.action = { username: username, type: type };
    adminUsersState.reason = '';
    adminUsersState.error = '';
    adminUsersState.notice = null;
    adminUsersRedraw(body);
}

/** Đóng hộp xác nhận mà không làm gì. */
function adminUsersCancel(body) {
    adminUsersState.action = null;
    adminUsersState.reason = '';
    adminUsersState.error = '';
    adminUsersRedraw(body);
}

/** Thực hiện thao tác đã xác nhận. */
function adminUsersConfirm(body) {
    const action = adminUsersState.action;
    if (!action || typeof action !== 'object') return false;

    const username = String(action.username || '').trim();
    if (username === '') return false;

    const reason = typeof adminUsersState.reason === 'string' ? adminUsersState.reason.trim() : '';

    if (action.type === 'warn' && reason.length < adminUsersReasonMin) {
        adminUsersSetError(body, 'Lý do cảnh cáo phải có ít nhất ' + adminUsersReasonMin + ' ký tự.');
        return false;
    }

    if ((action.type === 'ban' || action.type === 'warn') && reason.length > adminUsersReasonMax) {
        adminUsersSetError(body, 'Lý do không được vượt quá ' + adminUsersReasonMax + ' ký tự.');
        return false;
    }

    let ok = false;

    try {
        if (action.type === 'ban' && typeof banUser === 'function') {
            ok = banUser(username, reason) === true;
        } else if (action.type === 'unban' && typeof unbanUser === 'function') {
            ok = unbanUser(username) === true;
        } else if (action.type === 'warn' && typeof warnUser === 'function') {
            ok = warnUser(username, reason) === true;
        }
    } catch (error) {
        ok = false;
    }

    if (!ok) {
        adminUsersSetError(body, 'Không thực hiện được thao tác. Vui lòng thử lại.');
        return false;
    }

    adminUsersState.notice = {
        kind: 'success',
        text: adminUsersActionLabel(action.type) + ' thành công cho tài khoản "' + username + '".',
    };
    adminUsersState.action = null;
    adminUsersState.reason = '';
    adminUsersState.error = '';
    adminUsersRedraw(body);

    return true;
}

/** Click ủy quyền trên toàn mục. */
function adminUsersOnClick(body, event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== 'function') return;

    if (target.closest('[data-admin-users-confirm]')) {
        adminUsersConfirm(body);
        return;
    }

    if (target.closest('[data-admin-users-cancel]')) {
        adminUsersCancel(body);
        return;
    }

    const filterButton = target.closest('[data-admin-users-filter]');
    if (filterButton) {
        const filter = filterButton.getAttribute('data-admin-users-filter');
        adminUsersState.filter = adminUsersFilters.indexOf(filter) === -1 ? 'all' : filter;
        adminUsersRedraw(body);
        return;
    }

    const actionButton = target.closest('[data-admin-users-action]');
    if (actionButton) {
        adminUsersOpenAction(body, actionButton.getAttribute('data-admin-users-action'), actionButton.getAttribute('data-admin-users-user'));
    }
}

/** Gõ từ khóa / lý do. */
function adminUsersOnInput(body, event) {
    const target = event && event.target;
    if (!target || typeof target.closest !== 'function') return;

    if (target.closest('[data-admin-users-keyword]')) {
        adminUsersState.keyword = typeof target.value === 'string' ? target.value : '';
        adminUsersRedraw(body);
        return;
    }

    if (target.closest('[data-admin-users-reason]')) {
        adminUsersState.reason = typeof target.value === 'string' ? target.value : '';
    }
}

/** Gắn ủy quyền sự kiện lên phần thân mục (một lần cho mỗi lần shell vẽ body). */
function adminUsersBind(body) {
    try {
        if (!body || typeof body.addEventListener !== 'function') return;

        body.addEventListener('click', (event) => { adminUsersOnClick(body, event); });
        body.addEventListener('input', (event) => { adminUsersOnInput(body, event); });
    } catch (error) {
        // Không gắn được cũng không sao.
    }
}

/* ---------- Điểm vào ---------- */

/**
 * Vẽ mục "Quản lý người dùng" vào phần thân .admin-section__body.
 * @param {Element} body container do admin-shell.js cung cấp.
 * @returns {Promise<void>}
 */
async function renderAdminUsersSection(body) {
    try {
        if (!body) return;

        if (typeof isAdmin !== 'function' || !isAdmin()) {
            body.innerHTML = '<p class="admin-empty">Chỉ quản trị viên mới xem được danh sách người dùng.</p>';
            return;
        }

        adminUsersState.action = null;
        adminUsersState.reason = '';
        adminUsersState.error = '';
        adminUsersState.notice = null;

        body.innerHTML = adminUsersSectionHtml();
        adminUsersBind(body);
        adminUsersRedraw(body);
    } catch (error) {
        try {
            body.innerHTML = '<div class="admin-notice admin-notice--danger">'
                + 'Không hiển thị được mục quản lý người dùng.'
                + '</div>';
        } catch (innerError) {
            // Bỏ qua.
        }
    }
}

// Đăng ký mục vào tab "Người dùng" (chỉ có tác dụng khi admin-shell.js đã nạp).
if (typeof registerAdminSection === 'function') {
    registerAdminSection('users', 'user-manager', 'Quản lý người dùng', renderAdminUsersSection);
}
