/**
 * auth.js - Đăng ký / Đăng nhập / Session / Guard
 * Phụ trách: Người 1 (TV1) — Task 30 đến 36
 *
 * Danh sách tài khoản:
 *   - nằm trong src/data/users.json (dữ liệu dùng chung), quản lý bởi dataStore.js;
 *     key LocalStorage cũ aov_users chỉ được đọc để gộp đúng một lần rồi bỏ.
 *   - Khi chạy `npm run dev` / `npm run preview`, thay đổi (đăng ký, khoá/mở khoá,
 *     cảnh cáo, nâng cấp mật khẩu cũ) được ghi thẳng vào users.json qua API nội bộ
 *     /api/users. Không có server (host tĩnh / Live Server) thì giữ trong bản nháp
 *     aov_draft_users và có thể ghi bằng cách liên kết thư mục src/data.
 *   - aov_current_user   - username đang đăng nhập (session, localStorage)
 *
 * Cấu trúc tài khoản: { username, passwordHash, salt, displayName, role, joinedAt }
 *   passwordHash   -> PBKDF2-SHA256 (100000 vòng, 256 bit, hex), salt 16 byte hex
 *   role = 'admin'  -> quản trị viên (được vào trang Quản trị, ẩn/xoá bài của người khác)
 *   role = 'user'   -> tài khoản thường (mặc định của mọi tài khoản đăng ký)
 *   isAdmin() chỉ trả true khi role đúng bằng 'admin', nên tài khoản không có
 *   trường role (dữ liệu cũ) vẫn an toàn: không có quyền quản trị.
 *
 * Trường kiểm duyệt (tuỳ chọn, tài khoản cũ thiếu vẫn hợp lệ = không bị khóa,
 * không có cảnh cáo):
 *   banned       -> true CHỈ khi tài khoản đang bị khóa (mở khóa thì XÓA hẳn
 *                   các trường ban*, không để banned:false)
 *   bannedAt     -> chuỗi ISO thời điểm khóa
 *   bannedReason -> lý do khóa, tối đa 200 ký tự
 *   bannedBy     -> username admin thực hiện khóa
 *   warnings     -> mảng [{ at: ISO, reason: string (3..200 ký tự), by: admin }],
 *                   giữ tối đa 20 cảnh cáo mới nhất (cảnh cáo mới ở cuối)
 *   Tài khoản role 'admin' KHÔNG BAO GIỜ bị khóa (isUserBanned() luôn trả false
 *   với admin, canModerateUser() từ chối tài khoản admin và chính mình).
 *   Tài khoản bị khóa không đăng nhập được; nếu đang đăng nhập thì
 *   enforceBanOnSession() xóa phiên và đưa về trang đăng nhập.
 *
 * Mật khẩu KHÔNG BAO GIỜ lưu thô trong users.json / bản nháp / session — chỉ lưu
 * salt + passwordHash, giống tools/hash-users.cjs. Tài khoản cũ còn trường
 * `password` thô được nâng cấp lên hash ngay sau lần đăng nhập đúng đầu tiên.
 *
 * LƯU Ý AN NINH: băm mật khẩu ở đây chạy bằng Web Crypto (crypto.subtle) phía
 * trình duyệt, CHỈ để tránh lưu mật khẩu thô trong dữ liệu demo. Không có
 * backend nên không khuyến khích dùng mật khẩu thật quan trọng. crypto.subtle
 * chỉ hoạt động trên localhost/https; không có nó thì đăng ký/đăng nhập báo lỗi
 * rõ ràng và KHÔNG bao giờ lưu mật khẩu thô.
 *
 * Phụ thuộc: dataStore.js (nạp sau config.js và trước auth.js). js/layout.js gọi
 * updateAccountUI() sau khi nạp xong header để hiển thị đúng trạng thái đăng nhập.
 */

const CURRENT_USER_KEY = 'aov_current_user';

/**
 * Lỗi đăng nhập của lần gọi loginUser() GẦN NHẤT (trang Login dùng để hiện thông
 * báo riêng cho tài khoản bị khóa so với sai tài khoản/mật khẩu):
 *   ''        -> đăng nhập thành công, hoặc chưa gọi loginUser lần nào
 *   'invalid' -> sai username hoặc mật khẩu
 *   'banned'  -> đúng mật khẩu nhưng tài khoản đang bị khóa
 * Biến nội bộ cấp file, chỉ đọc qua getLastLoginError(); được cập nhật ở MỌI
 * đường thoát của loginUser().
 */
let lastLoginError = '';

/* Cấu hình băm mật khẩu (khớp tools/hash-users.cjs để cùng đọc users.json). */
const PASSWORD_HASH_ITERATIONS = 100000;
const PASSWORD_HASH_BYTES = 32;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 64;
const VALID_USERNAME = /^[\p{L}\p{N}_.-]{3,30}$/u;

/* Các trang bắt buộc đăng nhập (Task 36). Muốn thêm trang thì bổ sung vào đây. */
const PROTECTED_PAGES = [
    BASE_PATH + 'src/pages/profile.html',
    BASE_PATH + 'src/pages/admin.html',
    BASE_PATH + 'src/pages/hero-admin.html',
];

/** Trang quản trị bài viết: chỉ tài khoản có role === 'admin' mới vào được. */
const ADMIN_PAGE = BASE_PATH + 'src/pages/admin.html';

/**
 * Mục "Tướng" trong trang Quản lý. Trang hero-admin.html cũ nay chỉ chuyển hướng,
 * nên hằng số này trỏ thẳng vào tab heroes của ADMIN_PAGE.
 */
const HERO_ADMIN_PAGE = ADMIN_PAGE + '?tab=heroes';

/* ---------- Đọc/ghi danh sách user ---------- */

/**
 * Danh sách tài khoản, chịu được dữ liệu hỏng:
 *  - users.json không phải mảng (vd null/object) -> trả [] thay vì làm sập trang;
 *  - phần tử lạ (không phải object, hoặc thiếu username chuỗi) -> bỏ qua.
 */
function getUsers() {
    const users = getCollection('users');
    if (!Array.isArray(users)) return [];
    return users.filter((user) => user && typeof user === 'object' && typeof user.username === 'string');
}

function setUsers(users) {
    return setCollection('users', users);
}

/** Tìm tài khoản theo username (không phân biệt hoa thường), không bao giờ ném lỗi. */
function findUser(username) {
    try {
        return getUsers().find(
            (user) => user.username.toLowerCase() === String(username).trim().toLowerCase()
        );
    } catch (error) {
        return undefined;
    }
}

/**
 * usersReady: lời hứa (Promise) cho biết danh sách user đã sẵn sàng.
 * dataStore nạp trực tiếp từ data/users.json, gộp dữ liệu cũ trong aov_users đúng
 * một lần và ưu tiên bản nháp đang ghi (aov_draft_users). Trang Login/Register phải
 * `await usersReady` trước khi kiểm tra tài khoản.
 */
const usersReady = initDataStore({ collections: ['users'] });

/* ---------- Task 33 - Session ---------- */

function getCurrentUser() {
    try {
        return localStorage.getItem(CURRENT_USER_KEY);
    } catch (error) {
        return null;
    }
}

function setCurrentUser(username) {
    try {
        localStorage.setItem(CURRENT_USER_KEY, username);
    } catch (error) {
        // Storage bị chặn (chế độ riêng tư...) thì không lưu phiên được.
    }
}

function isLoggedIn() {
    return Boolean(getCurrentUser());
}

/**
 * Tài khoản đang đăng nhập có quyền quản trị (admin) không.
 *
 * Quy ước: tài khoản trong aov_users có thêm trường role === 'admin' thì được
 * coi là admin. Tài khoản không có trường role (đa số tài khoản đăng ký bình thường)
 * thì không phải admin.
 *
 * Lưu ý: role nằm trong aov_users nên hàm này phụ thuộc danh sách tài khoản đã nạp.
 * Lần đầu mở web, aov_users được nạp từ data/users.json bởi usersReady; trước khi
 * nạp xong thì findUser() trả undefined và hàm trả false (fail-closed) — không
 * bao giờ cho quyền khi chưa xác minh được tài khoản.
 *
 * @returns {boolean}
 */
function isAdmin() {
    const username = getCurrentUser();
    if (!username) return false;

    const user = findUser(username);

    return Boolean(user) && user.role === 'admin';
}

/* ---------- Task 34 - Đăng xuất ---------- */

/**
 * Chỉ xoá phiên đăng nhập. KHÔNG xoá aov_users, aov_favorites, aov_posts...
 */
function logout() {
    try {
        localStorage.removeItem(CURRENT_USER_KEY);
    } catch (error) {
        // Bỏ qua: không xoá được session cũng không sao, vẫn đưa về trang chủ.
    }

    // Nếu đang đứng ở trang cần đăng nhập thì quay về trang chủ.
    window.location.href = BASE_PATH + 'index.html';
}

/* ---------- Task 36 - Guard chặn trang cần đăng nhập ---------- */

/**
 * Chặn open redirect (F1): chỉ chấp nhận `redirect` là đường dẫn nội bộ.
 *
 * Hợp lệ khi: chuỗi string, bắt đầu bằng "/", KHÔNG bắt đầu bằng "//" hoặc "/\",
 * và không chứa ký tự điều khiển (\u0000-\u001f). Mọi trường hợp khác trả về
 * trang chủ, không cho đưa người dùng sang host/URL bên ngoài.
 *
 * @param {*} redirect giá trị tham số ?redirect= (đã decode bởi URLSearchParams)
 * @returns {string} đường dẫn an toàn để gán vào window.location.href
 */
function getSafeRedirect(redirect) {
    if (typeof redirect === 'string'
        && redirect.startsWith('/')
        && !redirect.startsWith('//')
        && !redirect.startsWith('/\\')
        && !/[\u0000-\u001f]/.test(redirect)) {
        return redirect;
    }

    return BASE_PATH + 'index.html';
}

/**
 * Gọi ở đầu script của trang cần bảo vệ (vd pages/profile.html):
 *   requireAuth();
 * Nếu chưa đăng nhập sẽ điều hướng sang Login, kèm ?redirect= để quay lại sau khi login.
 */
function requireAuth() {
    if (isLoggedIn()) return true;

    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `${BASE_PATH}src/pages/login.html?redirect=${redirect}`;
    return false;
}

/**
 * Dùng cho trang Login/Register: đã đăng nhập rồi thì không cần vào nữa.
 */
function redirectIfLoggedIn() {
    if (isLoggedIn()) {
        window.location.href = BASE_PATH + 'index.html';
    }
}

/**
 * Guard trang Quản trị (src/pages/admin.html, src/pages/hero-admin.html):
 * chỉ admin mới được vào.
 *
 * Gọi ở đầu <body> của admin.html, trước khi vẽ nội dung:
 *   requireAdmin();
 *
 * Hàm là hàm bất đồng bộ (async) vì isAdmin() cần đọc role trong aov_users,
 * mà lần đầu mở web aov_users phải chờ usersReady nạp từ data/users.json xong.
 * Chờ nạp xong mới quyết định thì không bao giờ chặn nhầm admin thật.
 *
 * Hành vi khi không đủ quyền:
 *   - chưa đăng nhập  -> về trang Login kèm ?redirect= để quay lại sau khi đăng nhập
 *   - đã đăng nhập nhưng không phải admin -> thông báo rồi về trang chủ
 *
 * @returns {Promise<boolean>} true nếu người gọi là admin và được ở lại trang.
 */
async function requireAdmin() {
    await usersReady;

    if (isAdmin()) return true;

    // Chưa đăng nhập thì đi qua requireAuth() để dùng chung cách điều hướng của Guard.
    if (!isLoggedIn()) return requireAuth();

    // Đã đăng nhập nhưng không phải admin: báo lý do rồi đưa về trang chủ.
    alert('Bạn không có quyền truy cập trang quản trị.');
    window.location.href = BASE_PATH + 'index.html';

    return false;
}

/**
 * Tự động bảo vệ mọi trang có tên trong PROTECTED_PAGES.
 * Trang profile.html vẫn gọi requireAuth() sớm ở đầu <body> để chặn ngay,
 * đoạn này là lớp bảo vệ dự phòng cho các trang được thêm vào sau này.
 */
function guardProtectedPages() {
    if (PROTECTED_PAGES.includes(window.location.pathname)) {
        requireAuth();
    }
}

document.addEventListener('DOMContentLoaded', guardProtectedPages);

/* ---------- Task KD09-a - Khóa tài khoản + cảnh cáo người dùng ---------- */

/**
 * Số cảnh cáo tối đa giữ lại cho mỗi tài khoản (cũ nhất bị loại khi vượt).
 * Trần độ dài lý do (khóa/cảnh cáo) sau khi làm sạch.
 */
const MODERATION_MAX_WARNINGS = 20;
const MODERATION_REASON_MAX = 200;
const MODERATION_WARN_REASON_MIN = 3;

/**
 * Làm sạch chuỗi lý do kiểm duyệt: chỉ nhận chuỗi, bỏ ký tự điều khiển, gộp
 * khoảng trắng thừa về một dấu cách, cắt khoảng trắng hai đầu rồi cắt độ dài.
 * Không bao giờ ném lỗi; đầu vào không hợp lệ -> chuỗi rỗng.
 *
 * @param {*} reason lý do thô (có thể undefined/null/số...)
 * @param {number} maxLength độ dài tối đa sau khi làm sạch
 * @returns {string}
 */
function cleanModerationReason(reason, maxLength) {
    try {
        if (typeof reason !== 'string') return '';

        const cleaned = reason
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return cleaned.slice(0, maxLength);
    } catch (error) {
        return '';
    }
}

/**
 * Tài khoản này có đang bị khóa không.
 *
 * Fail-open có chủ ý: khóa tài khoản là công cụ kiểm duyệt phía trình duyệt,
 * không phải hàng rào bảo mật. Tài khoản không tồn tại, lỗi đọc dữ liệu hoặc
 * role 'admin' (admin KHÔNG BAO GIỜ bị khóa) đều trả false.
 *
 * @param {string} username
 * @returns {boolean}
 */
function isUserBanned(username) {
    try {
        const user = findUser(username);
        if (!user) return false;

        return user.banned === true && user.role !== 'admin';
    } catch (error) {
        return false;
    }
}

/**
 * Danh sách cảnh cáo của một tài khoản (BẢN SAO), giữ đúng thứ tự đã lưu
 * (mới nhất ở cuối). Chỉ nhận phần tử có trường reason là chuỗi; tài khoản
 * không tồn tại / chưa có cảnh cáo / lỗi -> mảng rỗng.
 *
 * @param {string} username
 * @returns {Array<{ at: string, reason: string, by: string }>}
 */
function getUserWarnings(username) {
    try {
        const user = findUser(username);
        if (!user || !Array.isArray(user.warnings)) return [];

        return user.warnings
            .filter((warning) => warning && typeof warning === 'object' && typeof warning.reason === 'string')
            .map((warning) => ({
                at: typeof warning.at === 'string' ? warning.at : '',
                reason: warning.reason,
                by: typeof warning.by === 'string' ? warning.by : '',
            }));
    } catch (error) {
        return [];
    }
}

/**
 * Thông tin kiểm duyệt của một tài khoản để hiển thị cho admin.
 * TUYỆT ĐỐI không trả passwordHash / salt / password. Không tồn tại -> null.
 *
 * @param {string} username
 * @returns {{ banned: boolean, bannedAt: string, bannedReason: string, bannedBy: string, warnings: Array }|null}
 */
function getUserModeration(username) {
    try {
        const user = findUser(username);
        if (!user) return null;

        return {
            banned: user.banned === true && user.role !== 'admin',
            bannedAt: typeof user.bannedAt === 'string' ? user.bannedAt : '',
            bannedReason: typeof user.bannedReason === 'string' ? user.bannedReason : '',
            bannedBy: typeof user.bannedBy === 'string' ? user.bannedBy : '',
            warnings: getUserWarnings(username),
        };
    } catch (error) {
        return null;
    }
}

/**
 * Người đang đăng nhập có được phép kiểm duyệt tài khoản mục tiêu không.
 * Chỉ khi: là admin, mục tiêu tồn tại, mục tiêu KHÔNG phải admin, và mục tiêu
 * KHÁC chính mình. Không bao giờ cho khóa/cảnh cáo admin hay tự khóa mình.
 *
 * @param {string} username tài khoản mục tiêu
 * @returns {boolean}
 */
function canModerateUser(username) {
    try {
        if (!isAdmin()) return false;

        const target = findUser(username);
        if (!target) return false;
        if (target.role === 'admin') return false;

        const current = getCurrentUser();
        if (!current) return false;

        return target.username.toLowerCase() !== String(current).trim().toLowerCase();
    } catch (error) {
        return false;
    }
}

/**
 * Ghi lại danh sách user (đã đổi một tài khoản) rồi ghi nhật ký admin.
 * @returns {boolean} true nếu `setUsers` lưu thành công.
 */
function persistUsersAndLog(users, action, targetId, detail) {
    if (!setUsers(users)) return false;

    // adminlog.js chỉ nạp ở trang Quản trị -> phải kiểm tra tồn tại trước khi gọi.
    if (typeof logAdminAction === 'function') {
        try {
            logAdminAction(action, 'user', targetId, detail);
        } catch (error) {
            // Nhật ký lỗi không được làm hỏng thao tác kiểm duyệt.
        }
    }

    return true;
}

/**
 * Khóa một tài khoản (chỉ admin, không khóa được admin/chính mình).
 * Lý do tuỳ chọn: làm sạch, bỏ ký tự điều khiển, cắt còn 200 ký tự.
 *
 * @param {string} username
 * @param {string} [reason]
 * @returns {boolean} true nếu đã lưu.
 */
function banUser(username, reason) {
    try {
        if (!canModerateUser(username)) return false;

        const cleanReason = cleanModerationReason(reason, MODERATION_REASON_MAX);
        const users = getUsers();
        const index = users.findIndex((user) => user.username.toLowerCase() === String(username).trim().toLowerCase());
        if (index === -1) return false;
        if (users[index].role === 'admin') return false;

        users[index].banned = true;
        users[index].bannedAt = new Date().toISOString();
        users[index].bannedReason = cleanReason;
        users[index].bannedBy = String(getCurrentUser() || '');

        return persistUsersAndLog(users, 'user.ban', users[index].username, cleanReason);
    } catch (error) {
        return false;
    }
}

/**
 * Mở khóa một tài khoản (chỉ admin, mục tiêu phải tồn tại).
 * XÓA hẳn các trường ban*, không để lại banned:false.
 *
 * @param {string} username
 * @returns {boolean} true nếu đã lưu.
 */
function unbanUser(username) {
    try {
        if (!isAdmin()) return false;

        const users = getUsers();
        const index = users.findIndex((user) => user.username.toLowerCase() === String(username).trim().toLowerCase());
        if (index === -1) return false;

        delete users[index].banned;
        delete users[index].bannedAt;
        delete users[index].bannedReason;
        delete users[index].bannedBy;

        return persistUsersAndLog(users, 'user.unban', users[index].username, '');
    } catch (error) {
        return false;
    }
}

/**
 * Ghi một cảnh cáo cho tài khoản (chỉ admin, không cảnh cáo admin/chính mình).
 * Lý do BẮT BUỘC: sau khi làm sạch phải có từ 3 đến 200 ký tự, sai -> false và
 * không ghi gì. Giữ tối đa 20 cảnh cáo mới nhất.
 *
 * @param {string} username
 * @param {string} reason
 * @returns {boolean} true nếu đã lưu.
 */
function warnUser(username, reason) {
    try {
        if (!canModerateUser(username)) return false;

        const cleanReason = cleanModerationReason(reason, MODERATION_REASON_MAX);
        if (cleanReason.length < MODERATION_WARN_REASON_MIN) return false;

        const users = getUsers();
        const index = users.findIndex((user) => user.username.toLowerCase() === String(username).trim().toLowerCase());
        if (index === -1) return false;

        const warnings = Array.isArray(users[index].warnings) ? users[index].warnings.slice() : [];
        warnings.push({
            at: new Date().toISOString(),
            reason: cleanReason,
            by: String(getCurrentUser() || ''),
        });

        users[index].warnings = warnings.slice(-MODERATION_MAX_WARNINGS);

        return persistUsersAndLog(users, 'user.warn', users[index].username, cleanReason);
    } catch (error) {
        return false;
    }
}

/**
 * Danh sách tài khoản để admin-users.js vẽ (KHÔNG chứa passwordHash/salt/password).
 * Chỉ admin mới nhận được dữ liệu; người khác -> []. Sắp xếp theo joinedAt giảm
 * dần (mới nhất trước); tài khoản thiếu/sai joinedAt bị đẩy xuống cuối.
 *
 * @returns {Array<object>}
 */
function getUsersForAdmin() {
    try {
        if (!isAdmin()) return [];

        return getUsers()
            .map((user) => ({
                username: user.username,
                displayName: typeof user.displayName === 'string' ? user.displayName : '',
                role: user.role === 'admin' ? 'admin' : 'user',
                joinedAt: typeof user.joinedAt === 'string' ? user.joinedAt : '',
                banned: user.banned === true && user.role !== 'admin',
                bannedAt: typeof user.bannedAt === 'string' ? user.bannedAt : '',
                bannedReason: typeof user.bannedReason === 'string' ? user.bannedReason : '',
                bannedBy: typeof user.bannedBy === 'string' ? user.bannedBy : '',
                warnings: getUserWarnings(user.username),
            }))
            .sort((a, b) => {
                const timeA = Date.parse(a.joinedAt);
                const timeB = Date.parse(b.joinedAt);
                return (Number.isNaN(timeB) ? -Infinity : timeB) - (Number.isNaN(timeA) ? -Infinity : timeA);
            });
    } catch (error) {
        return [];
    }
}

/**
 * Lỗi của lần gọi loginUser() gần nhất: '' | 'invalid' | 'banned'.
 * @returns {string}
 */
function getLastLoginError() {
    try {
        return lastLoginError;
    } catch (error) {
        return '';
    }
}

/**
 * Nếu tài khoản đang đăng nhập đã bị khóa thì kết thúc phiên ngay.
 *
 * KHÔNG gọi logout() (logout() chuyển trang ngay). Ở đây chỉ xóa phiên trong
 * localStorage (bọc try/catch), vẽ lại khu vực tài khoản, rồi nếu đang đứng ở
 * trang cần đăng nhập thì dùng requireAuth() để đưa về trang đăng nhập.
 *
 * @returns {boolean} true nếu đã xóa được phiên (kể cả khi đã đưa về Login).
 */
function enforceBanOnSession() {
    try {
        const username = getCurrentUser();
        if (!username || !isUserBanned(username)) return false;

        let removed = false;
        try {
            localStorage.removeItem(CURRENT_USER_KEY);
            removed = true;
        } catch (error) {
            removed = false;
        }

        if (typeof updateAccountUI === 'function') {
            try {
                updateAccountUI();
            } catch (error) {
                // Vẽ lại header lỗi không quan trọng bằng việc đưa người bị khóa ra.
            }
        }

        if (PROTECTED_PAGES.includes(window.location.pathname) && typeof requireAuth === 'function') {
            requireAuth();
        }

        return removed;
    } catch (error) {
        return false;
    }
}

// Chạy một lần sau khi danh sách user nạp xong; .catch rỗng để không sinh lỗi chưa bắt.
usersReady.then(() => { enforceBanOnSession(); }).catch(() => {});

/* ---------- Task 31 - Validate đăng ký ---------- */

function validateRegisterForm(username, password, confirmPassword) {
    const errors = [];
    const trimmedUsername = String(username).trim();

    if (!trimmedUsername) {
        errors.push('Username không được để trống.');
    } else if (!VALID_USERNAME.test(trimmedUsername)) {
        errors.push('Username phải có từ 3 đến 30 ký tự (chữ, số, dấu chấm, gạch dưới hoặc gạch ngang).');
    } else if (findUser(trimmedUsername)) {
        errors.push('Username đã tồn tại.');
    }

    if (!password) {
        errors.push('Mật khẩu không được để trống.');
    } else if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
        errors.push(`Mật khẩu phải có từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự.`);
    }

    if (confirmPassword !== password) {
        errors.push('Mật khẩu xác nhận không khớp.');
    }

    return errors;
}

/* ---------- Băm mật khẩu (PBKDF2-SHA256, khớp tools/hash-users.cjs) ---------- */

function bytesToHex(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0');
    return out;
}

function hexToBytes(hex) {
    const out = new Uint8Array(Math.ceil(String(hex).length / 2));
    for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    return out;
}

/**
 * Băm mật khẩu bằng PBKDF2-SHA256.
 * @param {string} password mật khẩu thô
 * @param {string} [saltHex] salt có sẵn (để xác minh); không truyền thì sinh ngẫu nhiên 16 byte
 * @returns {Promise<{ salt: string, passwordHash: string }>}
 * @throws nếu trình duyệt không có crypto.subtle (cần HTTPS/localhost)
 */
async function hashPassword(password, saltHex) {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        throw new Error('Trình duyệt không hỗ trợ Web Crypto (cần HTTPS/localhost).');
    }

    const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: PASSWORD_HASH_ITERATIONS, hash: 'SHA-256' },
        keyMaterial, PASSWORD_HASH_BYTES * 8,
    );

    return { salt: bytesToHex(salt), passwordHash: bytesToHex(new Uint8Array(bits)) };
}

/** So sánh hai chuỗi hex với thời gian hằng số (không lộ vị trí khác biệt). */
function timingSafeEqualHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;

    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** Mật khẩu thô có khớp với { salt, passwordHash } đã lưu không. */
async function verifyPassword(password, saltHex, expectedHash) {
    const hash = await hashPassword(password, saltHex);
    return timingSafeEqualHex(hash.passwordHash, expectedHash);
}

/* ---------- Task 30 - Đăng ký ---------- */

/**
 * Tạo tài khoản mới (luôn role 'user').
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function registerUser(username, password) {
    const trimmedUsername = String(username).trim();

    if (!trimmedUsername || !VALID_USERNAME.test(trimmedUsername)) {
        return { ok: false, error: 'Username không hợp lệ: 3-30 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.' };
    }

    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
        return { ok: false, error: `Mật khẩu phải có từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự.` };
    }

    // Kiểm tra trùng ngay trước khi ghi: hai tab cùng mở có thể cùng đăng ký một
    // username, nên kiểm tra ở validate lúc submit không đủ — phải kiểm tra lại đây.
    if (findUser(trimmedUsername)) {
        return { ok: false, error: 'Username đã tồn tại.' };
    }

    let hash;
    try {
        hash = await hashPassword(password);
    } catch (error) {
        return { ok: false, error: 'Trình duyệt không hỗ trợ mã hoá mật khẩu (cần HTTPS/localhost). Không lưu mật khẩu thô.' };
    }

    const users = getUsers();
    users.push({
        username: trimmedUsername,
        passwordHash: hash.passwordHash,
        salt: hash.salt,
        displayName: trimmedUsername,
        // Mọi tài khoản tự đăng ký đều là tài khoản thường.
        // Không cho tự chọn role khi đăng ký, nếu không ai cũng tự làm admin được.
        role: 'user',
        joinedAt: new Date().toISOString(),
    });

    const ok = setUsers(users);
    if (!ok) {
        return { ok: false, error: 'Không lưu được tài khoản. Hãy thử lại.' };
    }

    return { ok: true };
}

/* ---------- Task 32 - Đăng nhập ---------- */

/**
 * @returns {Promise<boolean>} true nếu đăng nhập thành công.
 *
 * Nếu mật khẩu đúng nhưng tài khoản đang bị khóa thì KHÔNG đăng nhập và trả false;
 * getLastLoginError() sẽ là 'banned'. Việc kiểm tra khóa đặt SAU khi xác minh mật
 * khẩu để người không biết mật khẩu không dò được tài khoản nào đang bị khóa.
 */
async function loginUser(username, password) {
    lastLoginError = '';

    const user = findUser(username);
    if (!user) {
        lastLoginError = 'invalid';
        return false;
    }

    // Tài khoản đã băm (chuẩn hiện tại): xác minh bằng PBKDF2, so sánh thời gian hằng số.
    if (typeof user.passwordHash === 'string' && typeof user.salt === 'string') {
        let ok = false;
        try {
            ok = await verifyPassword(password, user.salt, user.passwordHash);
        } catch (error) {
            lastLoginError = 'invalid';
            return false;
        }

        if (!ok) {
            lastLoginError = 'invalid';
            return false;
        }

        // Mật khẩu đúng mới kiểm tra khóa.
        if (isUserBanned(user.username)) {
            lastLoginError = 'banned';
            return false;
        }

        setCurrentUser(user.username);
        return true;
    }

    // Tài khoản cũ còn mật khẩu thô (trước đợt băm): nâng cấp lên hash sau khi
    // xác minh đúng, để lần sau không còn mật khẩu thô trong dữ liệu.
    if (typeof user.password === 'string') {
        if (user.password !== password) {
            lastLoginError = 'invalid';
            return false;
        }

        try {
            const hash = await hashPassword(password);
            const users = getUsers();
            const index = users.findIndex((u) => u.username.toLowerCase() === user.username.toLowerCase());
            if (index !== -1) {
                users[index].passwordHash = hash.passwordHash;
                users[index].salt = hash.salt;
                delete users[index].password;
                setUsers(users);
            }
        } catch (error) {
            // Không nâng cấp được thì vẫn cho đăng nhập trong phiên này.
        }

        // Mật khẩu đúng mới kiểm tra khóa.
        if (isUserBanned(user.username)) {
            lastLoginError = 'banned';
            return false;
        }

        setCurrentUser(user.username);
        return true;
    }

    // Tài khoản không có bất kỳ thông tin mật khẩu nào -> fail-closed.
    lastLoginError = 'invalid';
    return false;
}

/* ---------- Hiển thị lỗi / thông báo trên form ---------- */

function renderErrors(container, errors) {
    if (!container) return;

    container.innerHTML = errors.length
        ? `<ul class="form-errors">${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>`
        : '';
}

function renderSuccess(container, message) {
    if (!container) return;

    container.innerHTML = `<p class="form-success">${escapeHtml(message)}</p>`;
}

/* ---------- Task 8 + 33 - Khu vực Account trên Header ---------- */

/**
 * Vẽ khu vực tài khoản trên Header: chưa đăng nhập thì hiện Đăng nhập/Đăng ký;
 * đã đăng nhập thì chỉ hiện tên tài khoản (link profile.html) và nút "Quản trị"
 * (chỉ admin). Nút "Quản lý tướng" và nút "Đăng xuất" đã bỏ khỏi header — đăng
 * xuất nằm ở trang hồ sơ (profile.html, nút #profile-logout).
 *
 * @param {boolean} [isRetry=false] cờ nội bộ: đã thử lại sau khi usersReady xong thì
 *        không chờ nữa, để tránh lặp vô hạn khi data/users.json tải lỗi.
 */
function updateAccountUI(isRetry = false) {
    const area = document.getElementById('account-area');
    if (!area) return;

    const username = getCurrentUser();

    if (username) {
        // isAdmin() cần role trong aov_users. Lần đầu mở web aov_users chưa có dữ liệu
        // thì isAdmin() trả false (fail-closed) và link Quản trị sẽ mất dù đang là admin,
        // nên chờ usersReady nạp xong rồi vẽ lại một lần.
        if (!isRetry && !getUsers().length) {
            usersReady.then(() => updateAccountUI(true));
            return;
        }

        area.innerHTML = `
            <div class="account-area__session">
                <a class="account-area__username" href="${BASE_PATH}src/pages/profile.html">
                    <span class="account-area__avatar" aria-hidden="true">👤</span>
                    ${escapeHtml(username)}
                </a>
                ${isAdmin() ? `<a class="btn btn-outline btn-sm" href="${ADMIN_PAGE}">Quản trị</a>` : ''}
            </div>
        `;

        // Đăng xuất không còn ở header: nằm ở trang hồ sơ (profile.html, #profile-logout).
    } else {
        area.innerHTML = `
            <div class="account-area__guest">
                <a class="btn btn-outline btn-sm" href="${BASE_PATH}src/pages/login.html">Đăng nhập</a>
                <a class="btn btn-primary btn-sm" href="${BASE_PATH}src/pages/register.html">Đăng ký</a>
            </div>
        `;
    }
}
