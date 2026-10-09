/**
 * controllers/authController.js - Controller DOM cho auth (login/register/profile)
 * Inject service; không chứa business logic phức tạp.
 */
import { authService } from '../services/authService.js';
import { escapeHtml } from '../core/utils.js';

const AUTH = authService;

export function initLoginPage() {
  const form = document.getElementById('login-form');
  const username = document.getElementById('login-username');
  const password = document.getElementById('login-password');
  const error = document.getElementById('login-error');
  const success = document.getElementById('login-success');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (error) error.textContent = '';
    if (success) success.textContent = '';

    const uname = username ? username.value : '';
    const pwd = password ? password.value : '';
    const res = await AUTH.loginUser(uname, pwd);
    if (!res.success) {
      if (error) error.textContent = res.message;
      return;
    }
    // redirect
    const params = new URLSearchParams(location.search);
    const redirect = params.get('redirect') || '../../index.html';
    location.href = redirect;
  });
}

export function initRegisterPage() {
  const form = document.getElementById('register-form');
  const username = document.getElementById('register-username');
  const password = document.getElementById('register-password');
  const confirm = document.getElementById('register-confirm');
  const error = document.getElementById('register-error');
  const success = document.getElementById('register-success');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (error) error.textContent = '';
    if (success) success.textContent = '';

    const uname = username ? username.value : '';
    const pwd = password ? password.value : '';
    const cfm = confirm ? confirm.value : '';

    if (pwd !== cfm) {
      if (error) error.textContent = 'Mật khẩu nhập lại không khớp';
      return;
    }
    const res = await AUTH.registerUser(uname, pwd);
    if (!res.success) {
      if (error) error.textContent = res.message;
      return;
    }
    if (success) success.textContent = 'Đăng ký thành công! Đang chuyển sang trang đăng nhập...';
    setTimeout(() => {
      location.href = 'login.html';
    }, 800);
  });
}

export function initProfilePage() {
  const nameEl = document.getElementById('profile-username');
  const joinedEl = document.getElementById('profile-joined');
  const logoutBtn = document.getElementById('profile-logout');
  const statsEl = document.getElementById('profile-stats');

  const uname = AUTH.getCurrentUserMemory();
  if (nameEl) nameEl.textContent = uname || '-';
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      AUTH.logoutUser();
      location.href = '../../index.html';
    });
  }
  // optional: render minimal stats if elements exist
}

export const authController = {
  initLoginPage,
  initRegisterPage,
  initProfilePage,
};
