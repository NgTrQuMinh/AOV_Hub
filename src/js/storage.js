/**
 * storage.js - Đọc/ghi LocalStorage
 * Phụ trách: Người 4
 *
 * Key: aov_favorites / aov_history / aov_compare
 *
 * Mọi hàm ở đây đều bọc try-catch và luôn trả về giá trị mặc định hợp lệ,
 * nên JSON hỏng / LocalStorage bị chặn (chế độ riêng tư) sẽ không làm sập trang.
 *
 * Không phụ thuộc file nào khác.
 */

const FAVORITES_KEY = 'aov_favorites';
const HISTORY_KEY = 'aov_history';
const COMPARE_KEY = 'aov_compare';

const HISTORY_LIMIT = 10;
const COMPARE_LIMIT = 2;

/* ---------- Hàm nền: JSON an toàn ---------- */

/**
 * Chuẩn hoá id về number (id trong heroes.json/items.json đều là số).
 * Nếu không phải số thì trả về chuỗi đã trim, tránh tạo key NaN trong LocalStorage.
 */
function toStorageId(value) {
    if (value === null || value === undefined || value === '') return null;

    const number = Number(value);
    return Number.isFinite(number) ? number : String(value).trim();
}

/**
 * Đọc một key bất kỳ, tự JSON.parse.
 * @param {string} key
 * @param {*} [fallback] giá trị trả về khi chưa có dữ liệu hoặc JSON hỏng.
 */
function getStore(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;

        const value = JSON.parse(raw);
        return value === null || value === undefined ? fallback : value;
    } catch (error) {
        console.error('Không đọc được key "' + key + '" trong LocalStorage', error);
        return fallback;
    }
}

/**
 * Ghi một key bất kỳ, tự JSON.stringify.
 * @returns {boolean} true nếu ghi thành công.
 */
function setStore(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        // Thường gặp khi LocalStorage đầy hoặc bị chặn ở chế độ riêng tư.
        console.error('Không ghi được key "' + key + '" vào LocalStorage', error);
        return false;
    }
}

/**
 * Xoá một key bất kỳ.
 * @returns {boolean} true nếu xoá thành công.
 */
function removeStore(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error('Không xoá được key "' + key + '" khỏi LocalStorage', error);
        return false;
    }
}

/* ---------- Yêu thích: aov_favorites = { hero: [id], item: [id] } ---------- */

/**
 * Lấy cả object yêu thích, tự bù cho các nhánh còn thiếu.
 */
function getAllFavorites() {
    const stored = getStore(FAVORITES_KEY, {});

    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        return { hero: [], item: [] };
    }

    return {
        hero: Array.isArray(stored.hero) ? stored.hero : [],
        item: Array.isArray(stored.item) ? stored.item : [],
    };
}

/**
 * @param {string} type 'hero' hoặc 'item'
 * @returns {number[]} danh sách id đang yêu thích (luôn là mảng).
 */
function getFavorites(type) {
    const favorites = getAllFavorites();
    return favorites[normalizeFavoriteType(type)] || [];
}

/**
 * @returns {boolean} true nếu vừa thêm thành công, false nếu đã có sẵn.
 */
function addFavorite(type, id) {
    const kind = normalizeFavoriteType(type);
    const heroId = toStorageId(id);
    if (heroId === null) return false;

    const favorites = getAllFavorites();
    if (favorites[kind].includes(heroId)) return false;

    favorites[kind].push(heroId);
    return setStore(FAVORITES_KEY, favorites);
}

/**
 * @returns {boolean} true nếu vừa xoá (hoặc vốn đã không có).
 */
function removeFavorite(type, id) {
    const kind = normalizeFavoriteType(type);
    const heroId = toStorageId(id);
    if (heroId === null) return false;

    const favorites = getAllFavorites();
    favorites[kind] = favorites[kind].filter((item) => item !== heroId);

    return setStore(FAVORITES_KEY, favorites);
}

/**
 * @returns {boolean}
 */
function isFavorite(type, id) {
    const heroId = toStorageId(id);
    if (heroId === null) return false;

    return getFavorites(type).includes(heroId);
}

function normalizeFavoriteType(type) {
    return String(type || '').trim().toLowerCase() === 'item' ? 'item' : 'hero';
}

/* ---------- Lịch sử tra cứu: aov_history = [id] (tối đa 10, mới nhất trước) ---------- */

/**
 * Ghi một lượt tra cứu. Id đã có sẽ được đưa lên đầu thay vì thêm trùng,
 * sau đó cắt còn tối đa HISTORY_LIMIT mục.
 */
function addHistory(id) {
    const heroId = toStorageId(id);
    if (heroId === null) return false;

    const history = getHistory().filter((item) => item !== heroId);
    history.unshift(heroId);

    return setStore(HISTORY_KEY, history.slice(0, HISTORY_LIMIT));
}

function getHistory() {
    const history = getStore(HISTORY_KEY, []);
    return Array.isArray(history) ? history : [];
}

function clearHistory() {
    return removeStore(HISTORY_KEY);
}

/* ---------- So sánh: aov_compare = [id, id] (tối đa 2) ---------- */

/**
 * Thêm tướng vào danh sách so sánh.
 * Nếu đã đủ 2 tướng thì KHÔNG thêm, trả về false để compare.js báo người dùng.
 */
function addCompare(id) {
    const heroId = toStorageId(id);
    if (heroId === null) return false;

    const compare = getCompare();
    if (compare.includes(heroId)) return false;
    if (compare.length >= COMPARE_LIMIT) return false;

    return setStore(COMPARE_KEY, compare.concat(heroId));
}

function getCompare() {
    const compare = getStore(COMPARE_KEY, []);
    return Array.isArray(compare) ? compare : [];
}

function clearCompare() {
    return removeStore(COMPARE_KEY);
}
