/**
 * auth.js - Đăng ký / Đăng nhập / Session / Guard
 * Phụ trách: Người 1 (TV1) — Task 30 đến 36
 *
 * LocalStorage:
 *   aov_users          - mảng tài khoản đã đăng ký (mô phỏng dữ liệu, KHÔNG mã hoá,
 *                        chỉ phục vụ demo đồ án, không dùng cho môi trường thật)
 *   aov_current_user   - username đang đăng nhập (nếu có)
 *
 * Lần đầu mở web, danh sách user sẽ được nạp sẵn từ data/users.json (tài khoản demo).
 *
 * Phụ thuộc: không phụ thuộc file khác (dùng fetch trực tiếp để có thể nạp sớm
 * ở đầu trang profile.html cho Guard). js/layout.js gọi updateAccountUI() sau khi
 * nạp xong header để hiển thị đúng trạng thái đăng nhập trên mọi trang.
 */

const USERS_KEY = 'aov_users';
const CURRENT_USER_KEY = 'aov_current_user';

/* Các trang bắt buộc đăng nhập (Task 36). Muốn thêm trang thì bổ sung vào đây. */
const PROTECTED_PAGES = [BASE_PATH + 'src/pages/profile.html'];

/* ---------- Đọc/ghi danh sách user ---------- */

function getUsers() {
    try {
        return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    } catch (error) {
        console.error(error);
        return [];
    }
}

function setUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function findUser(username) {
    return getUsers().find(
        (user) => user.username.toLowerCase() === String(username).trim().toLowerCase()
    );
}

/**
 * Nạp tài khoản mẫu từ data/users.json vào LocalStorage ở lần chạy đầu tiên.
 * Nếu người dùng đã đăng ký tài khoản riêng thì KHÔNG ghi đè.
 */
async function seedUsersFromJson() {
    if (getUsers().length) return;

    try {
        const response = await fetch(BASE_PATH + 'src/data/users.json');
        if (!response.ok) return;

        const users = await response.json();
        setUsers(users);
    } catch (error) {
        console.error('Không nạp được data/users.json', error);
    }
}

/**
 * usersReady: lời hứa (Promise) cho biết danh sách user đã sẵn sàng.
 * Trang Login/Register phải `await usersReady` trước khi kiểm tra tài khoản,
 * nếu không lần đầu mở web có thể chưa kịp nạp tài khoản demo từ JSON.
 */
const usersReady = seedUsersFromJson();

/* ---------- Task 33 - Session ---------- */

function getCurrentUser() {
    return localStorage.getItem(CURRENT_USER_KEY);
}

function setCurrentUser(username) {
    localStorage.setItem(CURRENT_USER_KEY, username);
}

function isLoggedIn() {
    return Boolean(getCurrentUser());
}

/* ---------- Task 34 - Đăng xuất ---------- */

/**
 * Chỉ xoá phiên đăng nhập. KHÔNG xoá aov_users, aov_favorites, aov_posts...
 */
function logout() {
    localStorage.removeItem(CURRENT_USER_KEY);

    // Nếu đang đứng ở trang cần đăng nhập thì quay về trang chủ.
    window.location.href = BASE_PATH + 'index.html';
}

/* ---------- Task 36 - Guard chặn trang cần đăng nhập ---------- */

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

/* ---------- Task 31 - Validate đăng ký ---------- */

function validateRegisterForm(username, password, confirmPassword) {
    const errors = [];
    const trimmedUsername = String(username).trim();

    if (!trimmedUsername) {
        errors.push('Username không được để trống.');
    } else if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
        errors.push('Username phải có từ 3 đến 30 ký tự.');
    } else if (findUser(trimmedUsername)) {
        errors.push('Username đã tồn tại.');
    }

    if (!password) {
        errors.push('Mật khẩu không được để trống.');
    } else if (password.length < 6 || password.length > 10) {
        errors.push('Mật khẩu phải có từ 6 đến 10 ký tự.');
    }

    if (confirmPassword !== password) {
        errors.push('Mật khẩu xác nhận không khớp.');
    }

    return errors;
}

/* ---------- Task 30 - Đăng ký ---------- */

function registerUser(username, password) {
    const users = getUsers();

    users.push({
        username: String(username).trim(),
        password,
        displayName: String(username).trim(),
        joinedAt: new Date().toISOString(),
    });

    setUsers(users);
}

/* ---------- Task 32 - Đăng nhập ---------- */

/**
 * @returns {boolean} true nếu đăng nhập thành công.
 */
function loginUser(username, password) {
    const user = findUser(username);

    if (!user || user.password !== password) {
        return false;
    }

    setCurrentUser(user.username);
    return true;
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

function updateAccountUI() {
    const area = document.getElementById('account-area');
    if (!area) return;

    const username = getCurrentUser();

    if (username) {
        area.innerHTML = `
            <div class="account-area__session">
                <a class="account-area__username" href="${BASE_PATH}src/pages/profile.html">
                    <span class="account-area__avatar" aria-hidden="true">👤</span>
                    ${escapeHtml(username)}
                </a>
                <button type="button" class="btn btn-outline btn-sm" id="logout-btn">Đăng xuất</button>
            </div>
        `;

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }
    } else {
        area.innerHTML = `
            <div class="account-area__guest">
                <a class="btn btn-outline btn-sm" href="${BASE_PATH}src/pages/login.html">Đăng nhập</a>
                <a class="btn btn-primary btn-sm" href="${BASE_PATH}src/pages/register.html">Đăng ký</a>
            </div>
        `;
    }
}
