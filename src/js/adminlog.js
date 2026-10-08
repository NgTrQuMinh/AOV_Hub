/**
 * adminlog.js - Nhật ký thao tác admin
 * Trang: src/pages/admin.html (file này chỉ nạp ở trang Quản trị)
 *
 * Key: aov_admin_log = [{ id, time, admin, action, targetType, targetId, detail }]
 *   - id         number, duy nhất (lấy mốc thời gian khi sinh, trùng thì +1)
 *   - time       chuỗi ISO thời điểm ghi
 *   - admin      username của admin thực hiện
 *   - action     hành động: 'hide-post' / 'unhide-post' / 'delete-post'
 *   - targetType loại đối tượng bị tác động: 'post' (sau mở rộng được
 *                'comment', 'user'... nếu các việc sau cần nhật ký)
 *   - targetId   id đối tượng, luôn ép về chuỗi cho thống nhất
 *   - detail     mô tả phụ (vd tiêu đề bài viết) — CHỈ là dữ liệu, khi đem
 *                ra HTML vẫn phải escapeHtml() như mọi chuỗi khác
 *
 * Nguyên tắc:
 *   - Ghi qua logAdminAction(): chỉ admin mới ghi được (canAdminWrite()),
 *     sai quyền thì return false và KHÔNG ghi gì — giống setPostHidden()
 *     trong feed.js kiểm tra quyền ở tầng dữ liệu.
 *   - Giữ tối đa ADMIN_LOG_MAX (200) bản mới nhất; getAdminLog() luôn trả
 *     mảng đã chuẩn hoá (bỏ phần tử hỏng), mới nhất trước.
 *   - feed.js trước khi gọi logAdminAction() luôn bọc
 *     if (typeof logAdminAction === 'function') nên trang không nạp file này
 *     (Feed, Profile, Home...) không bao giờ lỗi ReferenceError.
 *
 * Phụ thuộc: storage.js (getStore/setStore), auth.js (getCurrentUser,
 * isLoggedIn, isAdmin) — cả hai đều được nạp trước ở trang admin.html.
 */

/** Khóa LocalStorage chứa mảng nhật ký thao tác admin. */
const ADMIN_LOG_KEY = 'aov_admin_log';

/** Số bản ghi tối đa giữ lại: mảng đủ mức này thì bản cũ nhất bị loại. */
const ADMIN_LOG_MAX = 200;

/* ---------- Quyền ghi dữ liệu quản trị ---------- */

/**
 * Người dùng hiện tại có quyền ghi dữ liệu quản trị không
 * (vừa đăng nhập, vừa là admin).
 * Tách thành hàm riêng để mọi chỗ cần quyền admin (logAdminAction(), các
 * việc ở AD10...) chỉ kiểm tra đúng một chỗ, thay vì lặp isLoggedIn() && isAdmin().
 *
 * @returns {boolean}
 */
function canAdminWrite() {
    return isLoggedIn() && isAdmin();
}

/* ---------- Chuẩn hoá bản ghi ---------- */

/**
 * Chuẩn hoá một phần tử đọc từ aov_admin_log.
 * Phần tử hỏng (không phải object, thiếu id, thời gian không parse được)
 * -> trả về null để getAdminLog() loại đi; các trường còn lại được ép về
 * kiểu ổn định, tránh để JSON lạ trên console làm vỡ trang nhật ký về sau.
 *
 * @param {*} entry
 * @returns {object|null}
 */
function normalizeAdminLogEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    if (entry.id === undefined || entry.id === null || entry.id === '') return null;

    const time = Date.parse(entry.time);
    if (Number.isNaN(time)) return null;

    return {
        id: entry.id,
        time: new Date(time).toISOString(),
        admin: typeof entry.admin === 'string' ? entry.admin : '',
        action: typeof entry.action === 'string' ? entry.action : '',
        targetType: typeof entry.targetType === 'string' ? entry.targetType : '',
        targetId: entry.targetId === undefined || entry.targetId === null
            ? ''
            : String(entry.targetId),
        detail: typeof entry.detail === 'string' ? entry.detail : '',
    };
}

/**
 * Sinh id mới cho một bản ghi nhật ký: lấy mốc thời gian hiện tại,
 * nếu id này đã được dùng (nhiều bản ghi trong cùng 1 mili giây) thì +1
 * cho tới khi trống. Tách khỏi feed.js (nextFeedId) để adminlog.js
 * không phụ thuộc vào trang Feed.
 *
 * @param {Set<number>} taken các id đã có trong mảng hiện tại.
 * @returns {number}
 */
function nextAdminLogId(taken) {
    let id = Date.now();
    while (taken.has(id)) id += 1;
    return id;
}

/**
 * So sánh 2 bản ghi để sắp mới nhất trước: theo time giảm dần,
 * cùng thời điểm thì id lớn hơn (sinh sau) đứng trước.
 *
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function compareAdminLogDesc(a, b) {
    return (Date.parse(b.time) - Date.parse(a.time))
        || ((Number(b.id) || 0) - (Number(a.id) || 0));
}

/* ---------- Đọc / ghi nhật ký ---------- */

/**
 * Đọc toàn bộ nhật ký: trả về mảng đã chuẩn hoá (bỏ phần tử hỏng),
 * sắp mới nhất trước. Trang chưa từng ghi, JSON hỏng hoặc key không phải
 * mảng -> trả về mảng rỗng, không lỗi.
 *
 * @returns {object[]}
 */
function getAdminLog() {
    const stored = getStore(ADMIN_LOG_KEY, []);
    if (!Array.isArray(stored)) return [];

    return stored
        .map(normalizeAdminLogEntry)
        .filter(Boolean)
        .sort(compareAdminLogDesc);
}

/**
 * Ghi một bản ghi nhật ký thao tác admin vào aov_admin_log.
 *
 * Chỉ ghi khi người dùng hiện tại là admin (canAdminWrite()); user thường
 * hoặc khách gọi thẳng từ console cũng trả về false và KHÔNG ghi gì.
 * Thiếu action/targetType thì bản ghi vô nghĩa -> cũng từ chối, không làm
 * bẩn nhật ký.
 *
 * Ghi theo vòng: đọc mảng cũ (đã chuẩn hoá, mới nhất trước) -> thêm bản mới
 * -> sắp lại theo thời gian giảm dần -> cắt xuống ADMIN_LOG_MAX (bản cũ nhất
 * bị đẩy xuống đuôi và bị loại) -> ghi đè aov_admin_log.
 *
 * @param {string} action    hành động, vd 'hide-post' / 'unhide-post' / 'delete-post'
 * @param {string} targetType loại đối tượng bị tác động, vd 'post'
 * @param {number|string} targetId id đối tượng (bài viết...)
 * @param {string} [detail]  mô tả phụ, vd tiêu đề bài viết
 * @returns {boolean} true nếu bản ghi đã được lưu.
 */
function logAdminAction(action, targetType, targetId, detail) {
    // Chặn ở tầng dữ liệu: không có quyền admin thì dừng ngay, không đụng localStorage.
    if (!canAdminWrite()) return false;

    const cleanAction = String(action || '').trim();
    const cleanTargetType = String(targetType || '').trim();
    if (!cleanAction || !cleanTargetType) return false;

    const log = getAdminLog();
    const taken = new Set(log.map((entry) => entry.id));

    const entry = {
        id: nextAdminLogId(taken),
        // Thời điểm ghi: luôn "bây giờ", không lấy từ tham số để nhật ký trung thực.
        time: new Date().toISOString(),
        // canAdminWrite() đã chắc chắn đang đăng nhập nên getCurrentUser() có giá trị.
        admin: String(getCurrentUser() || ''),
        action: cleanAction,
        targetType: cleanTargetType,
        targetId: targetId === undefined || targetId === null ? '' : String(targetId),
        detail: String(detail || ''),
    };

    log.push(entry);
    log.sort(compareAdminLogDesc);

    return setStore(ADMIN_LOG_KEY, log.slice(0, ADMIN_LOG_MAX));
}
