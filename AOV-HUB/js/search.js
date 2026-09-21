/**
 * search.js - Hỗ trợ tìm kiếm phía client
 * Phụ trách: Người 4 (TV4)
 *
 * Cung cấp 3 hàm dùng chung cho heroes.js / item.js / feed.js:
 *   removeVietnameseTones(text) - bỏ dấu tiếng Việt để tìm "telannas" ra "Tel'Annas"
 *   matchKeyword(text, keyword) - so khớp không phân biệt hoa thường và dấu
 *   debounce(fn, delay)         - chống gọi hàm liên tục khi gõ phím
 */

function removeVietnameseTones(text) {
    return String(text == null ? '' : text)
        .normalize('NFD')                 // tách chữ và dấu
        .replace(/[\u0300-\u036f]/g, '')  // bỏ dấu
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();
}

/**
 * @returns {boolean} true nếu text chứa keyword (bỏ qua dấu và hoa thường).
 */
function matchKeyword(text, keyword) {
    const cleanKeyword = removeVietnameseTones(keyword).trim();

    if (!cleanKeyword) return true;

    return removeVietnameseTones(text).includes(cleanKeyword);
}

/**
 * Trì hoãn việc gọi hàm cho tới khi người dùng ngừng gõ.
 */
function debounce(fn, delay = 300) {
    let timerId = null;

    return function (...args) {
        clearTimeout(timerId);
        timerId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Lấy giá trị 1 tham số trên URL, vd: /pages/heroes.html?keyword=krixi
 */
function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name) || '';
}
