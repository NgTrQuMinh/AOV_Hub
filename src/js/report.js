/**
 * report.js - Báo cáo bài viết / bình luận (dùng chung cho trang chi tiết và trang quản trị).
 *
 * Phụ trách: Người 4.
 *
 * Phạm vi:
 *   - Hằng số lý do báo cáo, trạng thái xử lý, giới hạn ghi chú và chống spam.
 *   - API dữ liệu: getReports(), createReport(), dismissReport(), closeReportsForPost()...
 *   - Tự động đóng báo cáo khi bài viết bị ẩn/xoá hoặc bình luận bị xoá.
 *   - Render nút + form báo cáo cho trang chi tiết bài viết.
 *
 * File chạy dạng script thường (không ES module), nạp sau feed.js vì dùng
 * getPosts/getComments/findPostById/isPostVisibleForViewer và nạp sau auth.js.
 */

/** Các lý do báo cáo hợp lệ. Chỉ dùng một nguồn nhãn duy nhất cho UI và admin. */
const REPORT_REASONS = [
    { value: 'spam', label: 'Spam / quảng cáo' },
    { value: 'offensive', label: 'Nội dung xúc phạm' },
    { value: 'misleading', label: 'Thông tin sai lệch' },
    { value: 'off_topic', label: 'Không đúng chủ đề' },
    { value: 'other', label: 'Khác' },
];

const REPORT_REASON_VALUES = REPORT_REASONS.map((reason) => reason.value);

/** Trạng thái báo cáo. */
const REPORT_STATUS_OPEN = 'open';
const REPORT_STATUS_RESOLVED = 'resolved';
const REPORT_STATUS_DISMISSED = 'dismissed';

/** Giới hạn ghi chú và chống gửi dồn dập. */
const REPORT_NOTE_MAX = 300;
const REPORT_RATE_LIMIT = 5;
const REPORT_RATE_WINDOW_MS = 10 * 60 * 1000;
const REPORT_EXCERPT_MAX = 120;

let reportStoreReady = false;
let reportStoreReadyPromise = null;

/**
 * Nạp collection reports cùng các collection cần đối chiếu.
 * Gọi nhiều lần vẫn dùng chung một Promise.
 * @returns {Promise<void>}
 */
function initReportStore() {
    if (reportStoreReady) return Promise.resolve();

    if (!reportStoreReadyPromise) {
        reportStoreReadyPromise = initDataStore({
            collections: ['reports', 'posts', 'comments', 'users'],
        }).then(() => {
            reportStoreReady = true;
        }).catch((error) => {
            // Cho phép thử lại ở lần gọi sau thay vì kẹt Promise lỗi.
            reportStoreReadyPromise = null;
            throw error;
        });
    }

    return reportStoreReadyPromise;
}

// Nạp sớm để badge/tab quản trị có số liệu ngay sau khi trang ổn định.
if (typeof initDataStore === 'function') {
    initReportStore().then(() => {
        // Trang chi tiết có thể đã render trước khi reports nạp xong; vẽ lại một lần
        // để nút hiện đúng trạng thái "Đã báo cáo" đối với báo cáo đang mở.
        if (typeof document !== 'undefined'
            && document.querySelector('[data-report-control]')
            && typeof rerenderFeedView === 'function') {
            rerenderFeedView();
        }
    }).catch(() => {
        // Trang không có quyền/không có API vẫn dùng được các phần còn lại.
    });
}

/* ---------- Dữ liệu ---------- */

/**
 * Danh sách báo cáo đã chuẩn hoá tối thiểu.
 * @returns {object[]}
 */
function getReports() {
    if (typeof getCollection !== 'function') return [];

    try {
        const value = getCollection('reports');
        return Array.isArray(value)
            ? value.filter((report) => report && typeof report === 'object' && !Array.isArray(report))
            : [];
    } catch (error) {
        return [];
    }
}

/**
 * Ghi đè toàn bộ collection reports.
 * @param {object[]} reports
 * @returns {boolean}
 */
function setReports(reports) {
    if (typeof setCollection !== 'function') return false;

    const value = Array.isArray(reports)
        ? reports.filter((report) => report && typeof report === 'object' && !Array.isArray(report))
        : [];

    return Boolean(setCollection('reports', value));
}

/**
 * Tìm báo cáo theo id.
 * @param {number|string} reportId
 * @returns {object|null}
 */
function getReportById(reportId) {
    const id = String(reportId === undefined || reportId === null ? '' : reportId);
    if (!id) return null;

    return getReports().find((report) => String(report.id) === id) || null;
}

/**
 * Nhãn tiếng Việt của lý do báo cáo.
 * @param {string} reason
 * @returns {string}
 */
function getReportReasonLabel(reason) {
    const found = REPORT_REASONS.find((item) => item.value === reason);
    return found ? found.label : 'Khác';
}

/**
 * Nhãn tiếng Việt của trạng thái báo cáo.
 * @param {string} status
 * @returns {string}
 */
function getReportStatusLabel(status) {
    if (status === REPORT_STATUS_RESOLVED) return 'Đã xử lý';
    if (status === REPORT_STATUS_DISMISSED) return 'Bỏ qua';
    return 'Đang mở';
}

/**
 * Nhãn loại đối tượng bị báo cáo.
 * @param {string} targetType
 * @returns {string}
 */
function getReportTargetTypeLabel(targetType) {
    return targetType === 'comment' ? 'Bình luận' : 'Bài viết';
}

/**
 * Đếm số báo cáo đang mở. Hàm trả Promise nếu reports chưa nạp xong để
 * admin-shell có thể await mà không hiện badge sai.
 * @returns {number|Promise<number>}
 */
function getOpenReportCount() {
    if (!reportStoreReady) {
        return initReportStore().then(() => getReports()
            .filter((report) => report.status === REPORT_STATUS_OPEN).length);
    }

    return getReports().filter((report) => report.status === REPORT_STATUS_OPEN).length;
}

/**
 * Rút gọn nội dung để hiển thị trong bảng quản trị.
 * @param {*} value
 * @returns {string}
 */
function getReportExcerpt(value) {
    const text = String(value === undefined || value === null ? '' : value)
        .replace(/\s+/g, ' ')
        .trim();

    if (text.length <= REPORT_EXCERPT_MAX) return text;
    return text.slice(0, REPORT_EXCERPT_MAX - 1).trimEnd() + '…';
}

/**
 * Lấy thông tin đối tượng bị báo cáo và kiểm tra quyền xem.
 * @param {string} targetType 'post' | 'comment'
 * @param {number|string} targetId
 * @returns {{ok:boolean,error?:string,target?:object,post?:object,targetAuthor?:string,postId?:string,excerpt?:string}}
 */
function getReportTargetInfo(targetType, targetId) {
    if (targetType !== 'post' && targetType !== 'comment') {
        return { ok: false, error: 'Loại nội dung báo cáo không hợp lệ.' };
    }

    const id = String(targetId === undefined || targetId === null ? '' : targetId);
    if (!id) return { ok: false, error: 'Thiếu nội dung cần báo cáo.' };

    if (typeof findPostById !== 'function' || typeof getComments !== 'function') {
        return { ok: false, error: 'Dữ liệu bài viết chưa sẵn sàng.' };
    }

    if (targetType === 'post') {
        const post = findPostById(id);
        if (!post) return { ok: false, error: 'Bài viết không tồn tại hoặc đã bị xoá.' };
        if (typeof isPostVisibleForViewer === 'function' && !isPostVisibleForViewer(post)) {
            return { ok: false, error: 'Bài viết không còn hiển thị để báo cáo.' };
        }

        return {
            ok: true,
            target: post,
            post,
            targetAuthor: String(post.author || ''),
            postId: String(post.id),
            excerpt: getReportExcerpt(post.title || post.content),
        };
    }

    const comment = getComments().find((item) => String(item.id) === id);
    if (!comment) return { ok: false, error: 'Bình luận không tồn tại hoặc đã bị xoá.' };

    const post = findPostById(comment.postId);
    if (!post) return { ok: false, error: 'Bài viết của bình luận không còn tồn tại.' };
    if (typeof isPostVisibleForViewer === 'function' && !isPostVisibleForViewer(post)) {
        return { ok: false, error: 'Bài viết không còn hiển thị để báo cáo.' };
    }

    return {
        ok: true,
        target: comment,
        post,
        targetAuthor: String(comment.author || ''),
        postId: String(post.id),
        excerpt: getReportExcerpt(comment.content),
    };
}

/**
 * Một người dùng có đang có báo cáo mở cho đối tượng này không.
 * @param {string} targetType
 * @param {number|string} targetId
 * @param {string} reporter
 * @returns {object|null}
 */
function findOpenReport(targetType, targetId, reporter) {
    const type = String(targetType);
    const id = String(targetId);
    const name = String(reporter || '').trim().toLowerCase();

    return getReports().find((report) => report.status === REPORT_STATUS_OPEN
        && report.targetType === type
        && String(report.targetId) === id
        && String(report.reporter || '').trim().toLowerCase() === name) || null;
}

/**
 * Gửi báo cáo mới.
 * @param {string} targetType 'post' | 'comment'
 * @param {number|string} targetId
 * @param {string} reason
 * @param {string} [note]
 * @returns {Promise<{ok:boolean,error?:string,report?:object}>}
 */
async function createReport(targetType, targetId, reason, note) {
    try {
        await initReportStore();
    } catch (error) {
        return { ok: false, error: 'Không tải được dữ liệu báo cáo.' };
    }

    const username = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!username) return { ok: false, error: 'Bạn cần đăng nhập để báo cáo.' };

    if (typeof isUserBanned === 'function' && isUserBanned(username)) {
        return { ok: false, error: 'Tài khoản đang bị cấm nên không thể báo cáo.' };
    }

    const cleanReason = String(reason || '').trim();
    if (!REPORT_REASON_VALUES.includes(cleanReason)) {
        return { ok: false, error: 'Vui lòng chọn lý do báo cáo.' };
    }

    const cleanNote = String(note === undefined || note === null ? '' : note).trim();
    if (cleanNote.length > REPORT_NOTE_MAX) {
        return { ok: false, error: `Ghi chú tối đa ${REPORT_NOTE_MAX} ký tự.` };
    }
    if (cleanReason === 'other' && !cleanNote) {
        return { ok: false, error: 'Vui lòng ghi rõ lý do khi chọn "Khác".' };
    }

    const info = getReportTargetInfo(targetType, targetId);
    if (!info.ok) return { ok: false, error: info.error };

    if (String(info.targetAuthor).trim().toLowerCase() === String(username).trim().toLowerCase()) {
        return { ok: false, error: 'Bạn không thể báo cáo nội dung của chính mình.' };
    }

    const reports = getReports();
    if (findOpenReport(targetType, targetId, username)) {
        return { ok: false, error: 'Bạn đã báo cáo nội dung này rồi.' };
    }

    const now = Date.now();
    const recentCount = reports.filter((report) => {
        if (String(report.reporter || '').trim().toLowerCase() !== String(username).trim().toLowerCase()) {
            return false;
        }
        const created = Date.parse(report.createdAt);
        return !Number.isNaN(created) && now - created <= REPORT_RATE_WINDOW_MS;
    }).length;

    if (recentCount >= REPORT_RATE_LIMIT) {
        return { ok: false, error: 'Bạn đã gửi quá nhiều báo cáo. Vui lòng thử lại sau.' };
    }

    const ids = reports.map((report) => report.id);
    const id = typeof nextFeedId === 'function' ? nextFeedId(ids) : now;

    const report = {
        id,
        targetType,
        targetId: String(info.target.id),
        postId: String(info.postId),
        targetAuthor: info.targetAuthor,
        reporter: String(username),
        reason: cleanReason,
        note: cleanNote,
        excerpt: info.excerpt,
        createdAt: new Date(now).toISOString(),
        status: REPORT_STATUS_OPEN,
        handledBy: '',
        handledAt: '',
        resolution: '',
    };

    reports.push(report);
    if (!setReports(reports)) {
        return { ok: false, error: 'Không lưu được báo cáo. Vui lòng thử lại.' };
    }

    return { ok: true, report };
}

/**
 * Cập nhật trạng thái một báo cáo (nội bộ, không kiểm tra quyền).
 * @param {number|string} reportId
 * @param {string} status
 * @param {string} resolution
 * @param {string} [handledBy]
 * @returns {boolean}
 */
function updateReportStatus(reportId, status, resolution, handledBy) {
    const reports = getReports();
    const index = reports.findIndex((report) => String(report.id) === String(reportId));
    if (index === -1) return false;

    reports[index] = Object.assign({}, reports[index], {
        status,
        resolution: String(resolution || ''),
        handledBy: String(handledBy || ''),
        handledAt: new Date().toISOString(),
    });

    return setReports(reports);
}

/**
 * Admin bỏ qua báo cáo.
 * @param {number|string} reportId
 * @param {string} [note]
 * @returns {boolean}
 */
function dismissReport(reportId, note) {
    if (typeof isAdmin !== 'function' || !isAdmin()) return false;
    if (typeof canAdminWrite === 'function' && !canAdminWrite()) return false;

    return updateReportStatus(
        reportId,
        REPORT_STATUS_DISMISSED,
        String(note || '').trim() || 'Bỏ qua báo cáo',
        typeof getCurrentUser === 'function' ? getCurrentUser() : '',
    );
}

/**
 * Admin đánh dấu báo cáo đã xử lý (dùng sau cảnh cáo / cấm tài khoản).
 * @param {number|string} reportId
 * @param {string} resolution
 * @returns {boolean}
 */
function resolveReport(reportId, resolution) {
    if (typeof isAdmin !== 'function' || !isAdmin()) return false;
    if (typeof canAdminWrite === 'function' && !canAdminWrite()) return false;

    return updateReportStatus(
        reportId,
        REPORT_STATUS_RESOLVED,
        String(resolution || '').trim() || 'Đã xử lý báo cáo',
        typeof getCurrentUser === 'function' ? getCurrentUser() : '',
    );
}

/**
 * Tự động đóng các báo cáo đang mở của một bài viết / bình luận.
 * Dùng khi nội dung bị ẩn, bị xoá hoặc biến mất khỏi dữ liệu.
 * @param {string} targetType
 * @param {number|string} targetId
 * @param {string} resolution
 * @returns {boolean} true nếu có thay đổi.
 */
function closeReportsForTarget(targetType, targetId, resolution) {
    const reports = getReports();
    const type = String(targetType);
    const id = String(targetId);
    const handledAt = new Date().toISOString();
    const handledBy = typeof getCurrentUser === 'function' ? String(getCurrentUser() || '') : '';
    let changed = false;

    reports.forEach((report, index) => {
        if (report.status !== REPORT_STATUS_OPEN) return;
        if (report.targetType !== type || String(report.targetId) !== id) return;

        reports[index] = Object.assign({}, report, {
            status: REPORT_STATUS_RESOLVED,
            resolution: String(resolution || 'Nội dung đã bị xử lý'),
            handledBy,
            handledAt,
        });
        changed = true;
    });

    return changed ? setReports(reports) : false;
}

/**
 * Đóng mọi báo cáo liên quan tới một bài viết (bài viết và bình luận của bài).
 * @param {number|string} postId
 * @param {string} [resolution]
 * @returns {boolean}
 */
function closeReportsForPost(postId, resolution) {
    const reports = getReports();
    const id = String(postId);
    const handledAt = new Date().toISOString();
    const handledBy = typeof getCurrentUser === 'function' ? String(getCurrentUser() || '') : '';
    let changed = false;

    reports.forEach((report, index) => {
        if (report.status !== REPORT_STATUS_OPEN) return;

        const isPost = report.targetType === 'post' && String(report.targetId) === id;
        const isComment = report.targetType === 'comment' && String(report.postId) === id;
        if (!isPost && !isComment) return;

        reports[index] = Object.assign({}, report, {
            status: REPORT_STATUS_RESOLVED,
            resolution: String(resolution || 'Bài viết đã bị xử lý'),
            handledBy,
            handledAt,
        });
        changed = true;
    });

    return changed ? setReports(reports) : false;
}

/**
 * Đóng báo cáo đang mở của một bình luận.
 * @param {number|string} commentId
 * @param {string} [resolution]
 * @returns {boolean}
 */
function closeReportForComment(commentId, resolution) {
    return closeReportsForTarget(
        'comment',
        commentId,
        String(resolution || '').trim() || 'Bình luận đã bị xoá',
    );
}

/* ---------- Giao diện trang chi tiết ---------- */

/**
 * URL đăng nhập kèm redirect về trang hiện tại.
 * @returns {string}
 */
function getReportLoginHref() {
    const base = typeof BASE_PATH === 'string' ? BASE_PATH : '/';
    const current = typeof window !== 'undefined' && window.location
        ? String(window.location.pathname || '') + String(window.location.search || '')
        : '';

    return base + 'src/pages/login.html?redirect='
        + encodeURIComponent(current || (base + 'src/pages/feed.html'));
}

/**
 * Render nút báo cáo cho bài viết / bình luận.
 * Trả chuỗi rỗng cho nội dung của chính người đang xem hoặc dữ liệu không hợp lệ.
 * @param {string} targetType 'post' | 'comment'
 * @param {number|string} targetId
 * @returns {string} HTML
 */
function renderReportControl(targetType, targetId) {
    const info = getReportTargetInfo(targetType, targetId);
    if (!info.ok) return '';

    const username = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!username) {
        return `<a class="report-control__login" href="${escapeHtml(getReportLoginHref())}">Đăng nhập để báo cáo</a>`;
    }

    if (String(info.targetAuthor || '').trim().toLowerCase()
        === String(username).trim().toLowerCase()) {
        return '';
    }

    if (findOpenReport(targetType, targetId, username)) {
        return '<span class="report-control report-control--done">Đã báo cáo</span>';
    }

    return `
        <span class="report-control" data-report-control data-report-type="${escapeHtml(targetType)}" data-report-id="${escapeHtml(targetId)}">
            <button type="button" class="report-control__trigger" data-report-open aria-expanded="false">Báo cáo</button>
            <span class="report-form-slot" data-report-slot></span>
        </span>
    `;
}

/**
 * HTML form báo cáo được chèn vào từng nút khi mở.
 * @param {string} targetType
 * @param {number|string} targetId
 * @returns {string}
 */
function renderReportForm(targetType, targetId) {
    const options = REPORT_REASONS.map((reason) => (
        `<option value="${escapeHtml(reason.value)}">${escapeHtml(reason.label)}</option>`
    )).join('');

    return `
        <form class="report-form" data-report-form data-report-type="${escapeHtml(targetType)}" data-report-id="${escapeHtml(targetId)}" novalidate>
            <label class="report-form__label">
                Lý do
                <select class="report-form__select" data-report-reason required>
                    <option value="">Chọn lý do</option>
                    ${options}
                </select>
            </label>
            <label class="report-form__label">
                Ghi chú (không bắt buộc, tối đa ${REPORT_NOTE_MAX} ký tự)
                <textarea class="report-form__note" data-report-note maxlength="${REPORT_NOTE_MAX}" rows="3" placeholder="Mô tả ngắn giúp quản trị viên xử lý nhanh hơn..."></textarea>
            </label>
            <p class="report-form__error" data-report-error role="alert"></p>
            <div class="report-form__actions">
                <button type="submit" class="btn btn-primary btn-sm" data-report-submit>Gửi báo cáo</button>
                <button type="button" class="btn btn-outline btn-sm" data-report-cancel>Huỷ</button>
            </div>
        </form>
    `;
}

/**
 * Đóng form báo cáo trong một control.
 * @param {Element} control
 */
function closeReportForm(control) {
    if (!control) return;

    const slot = control.querySelector('[data-report-slot]');
    const trigger = control.querySelector('[data-report-open]');
    if (slot) slot.innerHTML = '';
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    control.classList.remove('is-open');
}

/**
 * Mở form báo cáo trong một control.
 * @param {Element} control
 */
function openReportForm(control) {
    if (!control) return;

    if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
        if (typeof window !== 'undefined' && window.location) {
            window.location.href = getReportLoginHref();
        }
        return;
    }

    const slot = control.querySelector('[data-report-slot]');
    const trigger = control.querySelector('[data-report-open]');
    if (!slot) return;

    slot.innerHTML = renderReportForm(
        control.getAttribute('data-report-type'),
        control.getAttribute('data-report-id'),
    );

    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    control.classList.add('is-open');

    const select = slot.querySelector('[data-report-reason]');
    if (select && typeof select.focus === 'function') select.focus();
}

/**
 * Hiển thị lỗi dưới form.
 * @param {Element} form
 * @param {string} message
 */
function showReportFormError(form, message) {
    const error = form ? form.querySelector('[data-report-error]') : null;
    if (error) error.textContent = message;
}

/**
 * Thay control bằng trạng thái đã báo cáo.
 * @param {Element} control
 */
function markReportControlDone(control) {
    if (!control) return;

    control.classList.remove('is-open');
    control.classList.add('report-control--done');
    control.innerHTML = '<span class="report-control__done">Đã báo cáo</span>';
}

/* Event delegation: form được render lại nhiều lần nên không gắn listener riêng. */
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (event) => {
        const openButton = event.target.closest('[data-report-open]');
        if (openButton) {
            const control = openButton.closest('[data-report-control]');
            if (control) openReportForm(control);
            return;
        }

        const cancelButton = event.target.closest('[data-report-cancel]');
        if (cancelButton) {
            const control = cancelButton.closest('[data-report-control]');
            if (control) closeReportForm(control);
        }
    });

    document.addEventListener('submit', (event) => {
        const form = event.target.closest('[data-report-form]');
        if (!form) return;

        event.preventDefault();

        const control = form.closest('[data-report-control]');
        const reasonSelect = form.querySelector('[data-report-reason]');
        const noteInput = form.querySelector('[data-report-note]');
        const submitButton = form.querySelector('[data-report-submit]');
        const reason = reasonSelect ? reasonSelect.value : '';
        const note = noteInput ? noteInput.value : '';

        showReportFormError(form, '');

        if (!reason) {
            showReportFormError(form, 'Vui lòng chọn lý do báo cáo.');
            return;
        }

        if (submitButton) submitButton.disabled = true;

        createReport(
            control ? control.getAttribute('data-report-type') : '',
            control ? control.getAttribute('data-report-id') : '',
            reason,
            note,
        ).then((result) => {
            if (!result.ok) {
                showReportFormError(form, result.error || 'Không gửi được báo cáo.');
                if (submitButton) submitButton.disabled = false;
                return;
            }

            markReportControlDone(control);
        }).catch(() => {
            showReportFormError(form, 'Không gửi được báo cáo. Vui lòng thử lại.');
            if (submitButton) submitButton.disabled = false;
        });
    });
}
