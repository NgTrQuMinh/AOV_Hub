/**
 * auth.js - Đăng ký / Đăng nhập / Session / Guard
 * Phụ trách: Người 1
 *
 * LocalStorage:
 *   aov_users          - mảng tài khoản đã đăng ký (mô phỏng dữ liệu, KHÔNG mã hoá,
 *                         chỉ phục vụ demo đồ án, không dùng cho môi trường thật)
 *   aov_current_user   - username đang đăng nhập (nếu có)
 *
 * Phụ thuộc: không phụ thuộc file khác. js/layout.js gọi updateAccountUI() sau khi
 * nạp xong header để hiển thị đúng trạng thái đăng nhập trên mọi trang.
 */

const USERS_KEY = 'aov_users';
const CURRENT_USER_KEY = 'aov_current_user';

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
        (user) => user.username.toLowerCase() === username.trim().toLowerCase()
    );
}

/* ---------- Session ---------- */

function getCurrentUser() {
    return localStorage.getItem(CURRENT_USER_KEY);
}

function setCurrentUser(username) {
    localStorage.setItem(CURRENT_USER_KEY, username);
}

function logout() {
    localStorage.removeItem(CURRENT_USER_KEY);
    window.location.href = '/index.html';
}

/**
 * Task 36 - Guard chặn trang cần đăng nhập.
 * Gọi ở đầu script của trang cần bảo vệ (vd pages/profile.html):
 *   requireAuth();
 * Nếu chưa đăng nhập sẽ điều hướng sang trang Login ngay lập tức.
 */
function requireAuth() {
    if (!getCurrentUser()) {
        window.location.href = '/pages/login.html';
    }
}

/* ---------- Task 31 - Validate đăng ký ---------- */

function validateRegisterForm(username, password, confirmPassword) {
    const errors = [];
    const trimmedUsername = username.trim();

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
        username: username.trim(),
        password,
        createdAt: new Date().toISOString(),
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

/* ---------- Task 33 - Hiển thị Header theo trạng thái đăng nhập ---------- */

function renderErrors(container, errors) {
    if (!container) return;

    container.innerHTML = errors.length
        ? `<ul class="form-errors">${errors.map((error) => `<li>${error}</li>`).join('')}</ul>`
        : '';
}

function updateAccountUI() {
    const area = document.getElementById('account-area');
    if (!area) return;

    const username = getCurrentUser();

    if (username) {
        area.innerHTML = `
            <div class="account-area__session">
                <a class="account-area__username" href="/pages/profile.html">
                    <span class="account-area__avatar" aria-hidden="true">👤</span>
                    ${username}
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
                <a class="btn btn-outline btn-sm" href="/pages/login.html">Đăng nhập</a>
                <a class="btn btn-primary btn-sm" href="/pages/register.html">Đăng ký</a>
            </div>
        `;
    }
}
