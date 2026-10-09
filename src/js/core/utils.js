/**
 * core/utils.js - Tiện ích dùng chung (thuần JS)
 * Comment ngắn gọn, tái sử dụng.
 */

// Escape HTML chống XSS
export function escapeHtml(str) {
  const s = str == null ? '' : String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Delay giả lập (chỉ dùng khi MODE='api')
export function delay(ms) {
  const m = typeof ms === 'number' && ms > 0 ? ms : 0;
  return new Promise((resolve) => setTimeout(resolve, m));
}

// Deep clone an toàn (ưu tiên structuredClone)
export function deepClone(value) {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (_) {
      // fallback
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

// Normalize id về string
export function normalizeId(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isFinite(num)) return String(num);
  return String(value).trim();
}

// Debounce đơn giản
export function debounce(fn, wait = 300) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

// Throttle đơn giản
export function throttle(fn, limit = 300) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= limit) {
      last = now;
      fn.apply(this, args);
    }
  };
}
