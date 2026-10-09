/**
 * services/authService.js - Auth logic thuần (Service layer)
 * Chỉ dùng dataService (memory-first). Không đọc/ghi LocalStorage draft users.
 * Session: giữ currentUser trong module scope (memory). Tùy chọn lưu username vào sessionStorage (tab-scoped).
 * Giữ PBKDF2-SHA256 như hiện tại.
 */
import { dataService } from './dataService.js';
import { ROLE, STORAGE_KEYS, PASSWORD_HASH_ITERATIONS, PASSWORD_HASH_BYTES, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, VALID_USERNAME } from '../core/constants.js';
import { ok, fail } from '../core/result.js';

let currentUser = null;

function getSessionKey() {
  try {
    return STORAGE_KEYS.SESSION_USER;
  } catch (_) {
    return 'aov_session';
  }
}

export function getCurrentUserMemory() {
  return currentUser;
}

export function setCurrentUserMemory(username) {
  currentUser = username || null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (currentUser) sessionStorage.setItem(getSessionKey(), currentUser);
      else sessionStorage.removeItem(getSessionKey());
    }
  } catch (_) {
    // ignore
  }
}

export function restoreSessionFromStorage() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const s = sessionStorage.getItem(getSessionKey());
      if (s) currentUser = s;
    }
  } catch (_) {
    // ignore
  }
  return currentUser;
}

function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i].toString(16).padStart(2, '0');
    hex += v;
  }
  return hex;
}

function hexToBytes(hex) {
  const h = String(hex || '').trim();
  if (h.length % 2 === 1) return new Uint8Array();
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function getCrypto() {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  try {
    const { webcrypto } = await import('node:crypto');
    return webcrypto;
  } catch (_) {
    return undefined;
  }
}

export async function hashPassword(password, saltHex) {
  const crypto = await getCrypto();
  if (!crypto || !crypto.subtle) {
    throw new Error('Web Crypto không khả dụng');
  }
  const pwd = new TextEncoder().encode(String(password || ''));
  let saltBytes;
  if (saltHex) {
    saltBytes = hexToBytes(saltHex);
  } else {
    saltBytes = crypto.getRandomValues(new Uint8Array(16));
  }
  const key = await crypto.subtle.importKey('raw', pwd, { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    PASSWORD_HASH_BYTES * 8
  );
  const hashBytes = new Uint8Array(bits);
  return {
    passwordHash: bytesToHex(hashBytes),
    salt: saltHex || bytesToHex(saltBytes),
  };
}

export async function verifyPassword(password, saltHex, expectedHash) {
  try {
    const h = await hashPassword(password, saltHex);
    return h.passwordHash === String(expectedHash || '');
  } catch (_) {
    return false;
  }
}

export async function registerUser(username, password) {
  const uname = String(username || '').trim();
  if (!VALID_USERNAME.test(uname)) {
    return fail('Tên đăng nhập không hợp lệ (3–30 ký tự, chữ/số/._-)');
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return fail(`Mật khẩu phải dài ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} ký tự`);
  }

  const usersRes = await dataService.getAll('users');
  if (!usersRes.success) return fail(usersRes.message);
  const users = Array.isArray(usersRes.data) ? usersRes.data : [];
  const exists = users.some((u) => u && typeof u.username === 'string' && u.username.toLowerCase() === uname.toLowerCase());
  if (exists) return fail('Tài khoản đã tồn tại');

  let hash;
  try {
    hash = await hashPassword(password);
  } catch (err) {
    return fail(err?.message || 'Không băm được mật khẩu');
  }

  const newUser = {
    username: uname,
    passwordHash: hash.passwordHash,
    salt: hash.salt,
    displayName: uname,
    role: ROLE.USER,
    joinedAt: new Date().toISOString(),
  };

  const createRes = await dataService.create('users', newUser);
  if (!createRes.success) return fail(createRes.message);
  return ok({ username: uname }, 'Đăng ký thành công');
}

export async function loginUser(username, password) {
  const uname = String(username || '').trim();
  const usersRes = await dataService.getAll('users');
  if (!usersRes.success) return fail(usersRes.message);
  const users = Array.isArray(usersRes.data) ? usersRes.data : [];
  const user = users.find((u) => u && typeof u.username === 'string' && u.username.toLowerCase() === uname.toLowerCase());
  if (!user) return fail('Sai tên đăng nhập hoặc mật khẩu');

  // upgrade legacy password if present
  if (typeof user.password === 'string') {
    if (user.password !== password) return fail('Sai tên đăng nhập hoặc mật khẩu');
    try {
      const hash = await hashPassword(password);
      const idx = users.findIndex((u) => u && typeof u.username === 'string' && u.username.toLowerCase() === uname.toLowerCase());
      if (idx !== -1) {
        users[idx].passwordHash = hash.passwordHash;
        users[idx].salt = hash.salt;
        delete users[idx].password;
        await dataService.replaceAll('users', users);
      }
    } catch (_) {
      // ignore
    }
    setCurrentUserMemory(user.username);
    return ok({ username: user.username });
  }

  if (!user.passwordHash || !user.salt) return fail('Tài khoản không hợp lệ');

  const okPwd = await verifyPassword(password, user.salt, user.passwordHash);
  if (!okPwd) return fail('Sai tên đăng nhập hoặc mật khẩu');
  setCurrentUserMemory(user.username);
  return ok({ username: user.username });
}

export function logoutUser() {
  setCurrentUserMemory(null);
}

export async function isAdmin() {
  const uname = getCurrentUserMemory();
  if (!uname) return false;
  const usersRes = await dataService.getAll('users');
  if (!usersRes.success) return false;
  const users = Array.isArray(usersRes.data) ? usersRes.data : [];
  const user = users.find((u) => u && typeof u.username === 'string' && u.username.toLowerCase() === uname.toLowerCase());
  return user && user.role === ROLE.ADMIN;
}

export function isLoggedIn() {
  return !!getCurrentUserMemory();
}

// Khởi tạo session từ storage
restoreSessionFromStorage();
