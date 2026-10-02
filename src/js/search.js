/**
 * search.js - Hỗ trợ tìm kiếm phía client
 * Phụ trách: Người 4
 *
 * Các hàm ở đây được dùng lại bởi hero.js, build.js, item.js, compare.js, favorite.js:
 *   getQueryParam() - đọc tham số URL (vd heroes.html?keyword=valhein)
 *   matchKeyword()  - so khớp không phân biệt hoa/thường và không phân biệt dấu tiếng Việt
 *   debounce()      - trì hoãn xử lý khi gõ liên tục
 *
 * Nạp sau components.js (dùng chung escapeHtml/imageUrl) và trước file gọi tới nó.
 */

/**
 * Bỏ dấu tiếng Việt + đưa về chữ thường, bỏ khoảng trắng thừa ở hai đầu.
 * @param {*} text
 * @returns {string}
 */
function normalizeKeyword(text) {
    return String(text === null || text === undefined ? '' : text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();
}

/**
 * Kiểm tra 1 đoạn text có chứa keyword không.
 * @param {string} text - nội dung cần tìm (vd: tên tướng, tên build)
 * @param {string} keyword - từ khoá người dùng gõ, rỗng = khớp tất cả
 * @returns {boolean}
 */
function matchKeyword(text, keyword) {
    const needle = normalizeKeyword(keyword);
    if (!needle) return true;

    return normalizeKeyword(text).includes(needle);
}

/**
 * Trì hoãn gọi hàm cho tới khi người dùng ngừng gõ trong `wait` mili giây.
 * @param {Function} fn
 * @param {number} [wait=300]
 * @returns {Function}
 */
function debounce(fn, wait = 300) {
    let timerId = null;

    return function debounced(...args) {
        clearTimeout(timerId);
        timerId = setTimeout(() => fn.apply(this, args), wait);
    };
}

/**
 * Đọc tham số trên URL, vd ?id=12&keyword=valhein
 * @param {string} name
 * @param {string} [fallback=''] giá trị trả về khi không có tham số
 * @returns {string}
 */
function getQueryParam(name, fallback = '') {
    const value = new URLSearchParams(window.location.search).get(name);
    return value === null ? fallback : value;
}
