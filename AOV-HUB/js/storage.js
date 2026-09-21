/**
 * storage.js - Đọc/ghi LocalStorage dùng chung
 * Phụ trách: Người 4 (TV4)
 *
 * Key sử dụng:
 *   aov_favorites  { hero: [id, ...], item: [id, ...] }
 *   aov_history    [ { type, id, at }, ... ]  tối đa 10 mục gần nhất
 *   aov_compare    [ heroId, heroId ]         tối đa 2 tướng
 *
 * Không đổi tên key — các file favorite.js / compare.js / feed.js phụ thuộc vào đây.
 */

const FAVORITES_KEY = 'aov_favorites';
const HISTORY_KEY = 'aov_history';
const COMPARE_KEY = 'aov_compare';

const HISTORY_LIMIT = 10;
const COMPARE_LIMIT = 2;

/* ---------- Hàm nền tảng ---------- */

function getStore(key, defaultValue) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : defaultValue;
    } catch (error) {
        console.error('Lỗi đọc LocalStorage:', key, error);
        return defaultValue;
    }
}

function setStore(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error('Lỗi ghi LocalStorage:', key, error);
    }
}

/* ---------- Yêu thích ---------- */

/**
 * @returns {{hero: number[], item: number[]}}
 */
function getAllFavorites() {
    const data = getStore(FAVORITES_KEY, { hero: [], item: [] });

    return {
        hero: Array.isArray(data.hero) ? data.hero : [],
        item: Array.isArray(data.item) ? data.item : [],
    };
}

/**
 * @param {'hero'|'item'} type
 * @returns {number[]}
 */
function getFavorites(type) {
    return getAllFavorites()[type] || [];
}

function isFavorite(type, id) {
    return getFavorites(type).includes(Number(id));
}

function addFavorite(type, id) {
    const favorites = getAllFavorites();
    const numberId = Number(id);

    if (!favorites[type].includes(numberId)) {
        favorites[type].push(numberId);
        setStore(FAVORITES_KEY, favorites);
    }
}

function removeFavorite(type, id) {
    const favorites = getAllFavorites();
    const numberId = Number(id);

    favorites[type] = favorites[type].filter((favoriteId) => favoriteId !== numberId);
    setStore(FAVORITES_KEY, favorites);
}

/**
 * Bật/tắt yêu thích.
 * @returns {boolean} true nếu sau thao tác mục này ĐANG được yêu thích.
 */
function toggleFavorite(type, id) {
    if (isFavorite(type, id)) {
        removeFavorite(type, id);
        return false;
    }

    addFavorite(type, id);
    return true;
}

function clearFavorites() {
    setStore(FAVORITES_KEY, { hero: [], item: [] });
}

/* ---------- Lịch sử tra cứu ---------- */

/**
 * Ghi lại 1 lượt xem chi tiết. Mục trùng sẽ được đẩy lên đầu, giữ tối đa 10 mục.
 * @param {'hero'|'item'} type
 * @param {number} id
 */
function addHistory(type, id) {
    const numberId = Number(id);
    const history = getHistory().filter(
        (entry) => !(entry.type === type && entry.id === numberId)
    );

    history.unshift({ type, id: numberId, at: new Date().toISOString() });
    setStore(HISTORY_KEY, history.slice(0, HISTORY_LIMIT));
}

function getHistory() {
    const history = getStore(HISTORY_KEY, []);
    return Array.isArray(history) ? history : [];
}

function clearHistory() {
    setStore(HISTORY_KEY, []);
}

/* ---------- So sánh tướng ---------- */

function getCompare() {
    const list = getStore(COMPARE_KEY, []);
    return Array.isArray(list) ? list.slice(0, COMPARE_LIMIT) : [];
}

/**
 * Thêm 1 tướng vào danh sách so sánh (tối đa 2).
 * @returns {boolean} false nếu đã đủ 2 tướng.
 */
function addCompare(heroId) {
    const list = getCompare();
    const numberId = Number(heroId);

    if (list.includes(numberId)) return true;
    if (list.length >= COMPARE_LIMIT) return false;

    list.push(numberId);
    setStore(COMPARE_KEY, list);
    return true;
}

function setCompare(list) {
    setStore(COMPARE_KEY, list.slice(0, COMPARE_LIMIT).map(Number));
}

function removeCompare(heroId) {
    setStore(COMPARE_KEY, getCompare().filter((id) => id !== Number(heroId)));
}

function clearCompare() {
    setStore(COMPARE_KEY, []);
}
