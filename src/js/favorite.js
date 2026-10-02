/**
 * favorite.js - Nút yêu thích (dùng chung mọi trang) + trang Yêu thích / Lịch sử
 * Phụ trách: Người 4
 *
 * File này làm 2 việc, cùng dùng chung một tầng dữ liệu LocalStorage:
 *
 * 1. Nút yêu thích dùng chung (nạp ở mọi trang có card tướng / trang bị):
 *    Các nút yêu thích đã có sẵn markup dùng chung (xem js/components.js):
 *      <button class="btn-favorite" data-type="hero|item" data-id="...">
 *    Card được render động (home.js, hero.js, item.js, build.js...) nên dùng
 *    event delegation trên document, không gắn sự kiện riêng cho từng nút.
 *
 * 2. Trang favorite.html: 2 tab "Yêu thích" / "Lịch sử"
 *    - Đọc aov_favorites + aov_history qua storage.js, đối chiếu id với
 *      data/heroes.json và data/items.json rồi vẽ bằng renderHeroCard()/
 *      renderItemCard() của components.js.
 *    - Id lưu trong LocalStorage mà không còn trong JSON thì bỏ qua, không báo lỗi
 *      (dữ liệu JSON có thể đã bị sửa/xoá trong khi LocalStorage vẫn còn id cũ).
 *    - Trạng thái rỗng dùng renderNotFound(); nếu không nạp được JSON
 *      (loadData() trả về mảng rỗng) thì báo "Không tải được dữ liệu".
 *    - Tab đang chọn ghi lên URL (?tab=favorite|history) nên F5 không mất trạng
 *      thái, giá trị lạ trên URL rơi về tab "Yêu thích".
 *    - Bấm ♥ ngay trên trang này sẽ bỏ yêu thích: favorite.js gọi lại
 *      renderFavoriteList() nên card biến mất và danh sách được vẽ lại.
 *
 * Phụ thuộc: storage.js (getFavorites/addFavorite/removeFavorite/getHistory/
 * clearHistory/HISTORY_LIMIT), components.js (renderHeroCard/renderItemCard/
 * renderNotFound/escapeHtml), loadData.js + config.js (loadData, DATA_PATH),
 * search.js (getQueryParam để đọc ?tab=).
 */

/**
 * Đồng bộ trạng thái đã yêu thích của mọi nút .btn-favorite đang có trong DOM.
 * Gọi sau khi render lại danh sách, hoặc sau khi bấm nút yêu thích.
 */
function refreshFavoriteButtons() {
    document.querySelectorAll('.btn-favorite').forEach((button) => {
        const isActive = isFavorite(button.dataset.type, button.dataset.id);
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

document.addEventListener('click', (event) => {
    const button = event.target.closest('.btn-favorite');
    if (!button) return;

    // Bấm nhầm vào thẻ bao ngoài (ảnh, link) thì bỏ qua.
    const { type, id } = button.dataset;
    if (!type || !id) return;

    if (isFavorite(type, id)) {
        removeFavorite(type, id);
    } else {
        addFavorite(type, id);
    }

    refreshFavoriteButtons();

    // Trang Yêu thích cần vẽ lại danh sách sau khi bỏ yêu thích 1 mục.
    if (typeof renderFavoriteList === 'function') renderFavoriteList();
});

/* ==========================================================
 * Trang Yêu thích / Lịch sử (pages/favorite.html)
 * ========================================================== */

/** Nhãn của 2 tab, thứ tự key cũng là thứ tự hiển thị. */
const FAVORITE_TABS = {
    favorite: 'Yêu thích',
    history: 'Lịch sử',
};

/** Tab dùng khi URL không có ?tab= hoặc giá trị trên URL không hợp lệ. */
const FAVORITE_TAB_DEFAULT = 'favorite';

/** Key của tab Lịch sử trong FAVORITE_TABS. */
const FAVORITE_TAB_HISTORY = 'history';

/** Nhãn hiển thị khi không nạp được heroes.json / items.json. */
const FAVORITE_ERROR_MESSAGE = 'Không tải được dữ liệu';

/* Dữ liệu JSON đã nạp + Map tra cứu theo id, khai báo ở ngoài hàm để các hàm
   vẽ giao diện dùng lại được mà không phải nạp lại heroes.json/items.json. */
let favoriteHeroes = [];
let favoriteItems = [];
let favoriteHeroIndex = new Map();
let favoriteItemIndex = new Map();

/* true khi đã nạp xong dữ liệu JSON. Trước lúc đó renderFavoriteList() bỏ qua,
   tránh vẽ nhầm ra "Không tải được dữ liệu" lúc trang vừa mở. */
let favoriteDataReady = false;

/* Tab đang chọn. null = chưa đọc, lần đầu renderFavoriteList() sẽ đọc từ URL. */
let currentFavoriteTab = null;

/**
 * Chuẩn hoá tên tab: chỉ nhận "favorite" / "history", còn lại rơi về tab mặc định.
 * @param {*} value
 * @returns {string} 'favorite' hoặc 'history'
 */
function normalizeFavoriteTab(value) {
    const key = String(value === null || value === undefined ? '' : value).trim().toLowerCase();

    return Object.prototype.hasOwnProperty.call(FAVORITE_TABS, key) ? key : FAVORITE_TAB_DEFAULT;
}

/**
 * Tab đang chọn, đọc từ URL ở lần đầu rồi giữ trong bộ nhớ.
 * URL có dạng: favorite.html?tab=history
 * @returns {string} 'favorite' hoặc 'history'
 */
function getCurrentFavoriteTab() {
    if (currentFavoriteTab) return currentFavoriteTab;

    const rawTab = String(getQueryParam('tab', '') || '').trim();
    currentFavoriteTab = normalizeFavoriteTab(rawTab);

    // ?tab=gia-tri-la trên URL: sửa lại cho khớp tab thật sự đang hiển thị,
    // không thì F5 hay copy link sẽ mang giá trị lạ đi tiếp.
    if (rawTab && rawTab.toLowerCase() !== currentFavoriteTab) syncFavoriteTabUrl(currentFavoriteTab);

    return currentFavoriteTab;
}

/**
 * Ghi tab đang chọn lên URL mà không tải lại trang (replaceState).
 * Luôn ghi rõ giá trị tab đang chọn, giữ nguyên các tham số khác của trang.
 * @param {string} tab
 */
function syncFavoriteTabUrl(tab) {
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab);

    window.history.replaceState(null, '', `${BASE_PATH}src/pages/favorite.html?${params.toString()}`);
}

/**
 * Gom dữ liệu JSON thành Map<id, object> để tra cứu O(1) khi đối chiếu id
 * lưu trong LocalStorage với dữ liệu thật.
 * @param {Array} list dữ liệu heroes.json hoặc items.json (có thể rỗng).
 * @returns {Map<string, object>}
 */
function buildEntityIndex(list) {
    const index = new Map();

    if (!Array.isArray(list)) return index;

    list.forEach((record) => {
        // Bỏ qua bản ghi hỏng (không phải object hoặc thiếu id) để không vỡ Map.
        if (!record || typeof record !== 'object') return;
        if (record.id === null || record.id === undefined) return;

        // Khoá để String(id): id trong JSON là số còn trong LocalStorage có thể
        // là số hoặc chuỗi, so khớp bằng chuỗi thì "12" và 12 là một.
        index.set(String(record.id), record);
    });

    return index;
}

/**
 * Đối chiếu danh sách id trong LocalStorage với dữ liệu JSON.
 * Id không còn tồn tại (JSON đã bị sửa/xoá) thì bỏ qua, không báo lỗi.
 * @param {Array} ids danh sách id lấy từ storage.js.
 * @param {Map} index Map<id, object> do buildEntityIndex() tạo.
 * @returns {Array} các object tìm thấy, giữ nguyên thứ tự của `ids`.
 */
function resolveFavoriteEntities(ids, index) {
    if (!Array.isArray(ids) || !index) return [];

    return ids
        .map((id) => index.get(String(id)))
        .filter((record) => Boolean(record));
}

/**
 * Bỏ id trùng trong lịch sử, giữ lần xuất hiện đầu tiên (tức lần mới nhất).
 * getHistory() đã chặn trùng khi ghi, nhưng LocalStorage có thể bị sửa tay.
 * @param {Array} ids
 * @returns {Array}
 */
function dedupeFavoriteIds(ids) {
    if (!Array.isArray(ids)) return [];

    const seen = new Set();
    const result = [];

    ids.forEach((id) => {
        const key = String(id);

        if (seen.has(key)) return;

        seen.add(key);
        result.push(id);
    });

    return result;
}

/**
 * Vẽ 2 tab vào #favorite-tabs, tab đang chọn có class is-active.
 * @returns {Element|null} vùng chứa tab, null nếu trang không có.
 */
function renderFavoriteTabs() {
    const tabsBox = document.getElementById('favorite-tabs');

    if (!tabsBox) return null;

    const current = getCurrentFavoriteTab();

    tabsBox.innerHTML = `
        <div class="tabs__list" role="tablist" aria-label="Yêu thích và lịch sử tra cứu">
            ${Object.keys(FAVORITE_TABS).map((tab) => {
                const isActive = tab === current;

                return `
                    <button
                        type="button"
                        role="tab"
                        class="tabs__btn ${isActive ? 'is-active' : ''}"
                        data-tab="${tab}"
                        id="favorite-tab-${tab}"
                        aria-selected="${isActive ? 'true' : 'false'}"
                        aria-controls="favorite-list"
                    >${FAVORITE_TABS[tab]}</button>
                `;
            }).join('')}
        </div>
    `;

    return tabsBox;
}

/**
 * Vẽ 1 nhóm con của tab "Yêu thích": tiêu đề + lưới card.
 * @param {string} title tên nhóm ('Tướng' / 'Trang bị')
 * @param {string} type 'hero' hoặc 'item' - loại dữ liệu cần đối chiếu
 * @returns {string} HTML string
 */
function renderFavoriteGroup(title, type) {
    // Chọn đúng bộ dữ liệu / bộ Map / hàm vẽ card theo loại.
    const isItem = type === 'item';
    const dataSource = isItem ? favoriteItems : favoriteHeroes;
    const index = isItem ? favoriteItemIndex : favoriteHeroIndex;
    const renderCard = isItem ? renderItemCard : renderHeroCard;

    // loadData() trả về mảng rỗng khi fetch lỗi: báo lỗi tải dữ liệu thay vì
    // báo "chưa yêu thích gì" (tránh thêm bạn nhầm là dữ liệu bị mất).
    if (!dataSource.length) {
        return `
            <section class="favorite-section">
                <h2 class="favorite-section__title">${title}</h2>
                <div class="grid favorite-grid">${renderNotFound(FAVORITE_ERROR_MESSAGE)}</div>
            </section>
        `;
    }

    // getFavorites(type) trả về id đang yêu thích, id không còn trong JSON thì bị lọc.
    const records = resolveFavoriteEntities(getFavorites(type), index);

    const emptyMessage = isItem
        ? 'Bạn chưa yêu thích trang bị nào. Bấm ♥ trên thẻ trang bị để lưu lại.'
        : 'Bạn chưa yêu thích tướng nào. Bấm ♥ trên thẻ tướng để lưu lại.';

    return `
        <section class="favorite-section">
            <h2 class="favorite-section__title">
                ${title}
                <span class="favorite-section__count">${records.length}</span>
            </h2>
            <div class="grid favorite-grid">
                ${records.length ? records.map(renderCard).join('') : renderNotFound(emptyMessage)}
            </div>
        </section>
    `;
}

/**
 * Nội dung tab "Yêu thích": 2 nhóm con Tướng và Trang bị.
 * @returns {string} HTML string
 */
function renderFavoritesSection() {
    return renderFavoriteGroup('Tướng', 'hero') + renderFavoriteGroup('Trang bị', 'item');
}

/**
 * Nội dung tab "Lịch sử": tướng đã xem (mới nhất trước, tối đa HISTORY_LIMIT mục)
 * kèm nút "Xóa lịch sử".
 * @returns {string} HTML string
 */
function renderHistorySection() {
    // Lịch sử chỉ chứa id tướng nên chỉ cần heroes.json; mảng rỗng = nạp lỗi.
    if (!favoriteHeroes.length) return renderNotFound(FAVORITE_ERROR_MESSAGE);

    // getHistory() đã cắt sẵn còn tối đa HISTORY_LIMIT mục, slice thêm cho chắc
    // phòng khi LocalStorage bị sửa tay có nhiều hơn.
    const historyIds = dedupeFavoriteIds(getHistory()).slice(0, HISTORY_LIMIT);

    if (!historyIds.length) {
        return renderNotFound('Bạn chưa xem tướng nào. Mở trang chi tiết tướng để tướng đó được ghi vào lịch sử.');
    }

    const heroes = resolveFavoriteEntities(historyIds, favoriteHeroIndex);

    // Có id trong lịch sử nhưng không id nào còn tồn tại trong heroes.json.
    if (!heroes.length) {
        return renderNotFound('Các tướng trong lịch sử không còn tồn tại trong dữ liệu hiện tại.');
    }

    return `
        <section class="favorite-section">
            <div class="favorite-toolbar">
                <h2 class="favorite-section__title">
                    Tướng đã xem
                    <span class="favorite-section__count">${heroes.length}/${HISTORY_LIMIT}</span>
                </h2>
                <button type="button" class="btn btn-outline favorite-toolbar__clear" data-action="clear-history">
                    Xóa lịch sử
                </button>
            </div>
            <div class="grid favorite-grid">
                ${heroes.map(renderHeroCard).join('')}
            </div>
        </section>
    `;
}

/**
 * Hàm vẽ chính của trang: đọc tab đang chọn rồi vẽ vào #favorite-list.
 *
 * Được gọi khi mở trang, khi đổi tab và khi bấm ♥ (xem handler .btn-favorite
 * ở trên) nên luôn vẽ lại từ đầu, không giữ trạng thái DOM cũ.
 * @returns {Element|null} vùng chứa danh sách, null nếu trang không có.
 */
function renderFavoriteList() {
    const listBox = document.getElementById('favorite-list');

    if (!listBox) return null;

    // Chưa nạp xong heroes.json/items.json thì để trống, đợi initFavoritePage() vẽ lại.
    if (!favoriteDataReady) return listBox;

    listBox.innerHTML = getCurrentFavoriteTab() === FAVORITE_TAB_HISTORY
        ? renderHistorySection()
        : renderFavoritesSection();

    // Card vừa vẽ lại chưa qua refreshFavoriteButtons() nên trạng thái ♥
    // cần được đồng bộ lại (trang này mọi card đều đang được yêu thích).
    refreshFavoriteButtons();

    return listBox;
}

/**
 * Bấm 1 tab: đổi tab đang chọn, ghi lên URL rồi vẽ lại tab + danh sách.
 * Dùng event delegation trên #favorite-tabs vì thân tab được vẽ lại mỗi lần đổi tab.
 * @param {Event} event
 */
function handleFavoriteTabsClick(event) {
    const button = event.target.closest('.tabs__btn[data-tab]');

    if (!button) return;

    const tab = normalizeFavoriteTab(button.dataset.tab);

    // Bấm lại tab đang chọn thì không vẽ lại cho tốn.
    if (tab === getCurrentFavoriteTab()) return;

    currentFavoriteTab = tab;
    syncFavoriteTabUrl(tab);
    renderFavoriteTabs();
    renderFavoriteList();
}

/**
 * Bấm nút bên trong danh sách (hiện chỉ có nút "Xóa lịch sử").
 * Dùng event delegation trên #favorite-list vì danh sách được vẽ lại mỗi lần đổi tab.
 * @param {Event} event
 */
function handleFavoriteListClick(event) {
    const button = event.target.closest('[data-action="clear-history"]');

    if (!button) return;

    // Xóa cả danh sách nên hỏi lại trước khi xóa.
    if (!window.confirm('Xóa toàn bộ lịch sử tra cứu tướng?')) return;

    clearHistory();
    renderFavoriteList();
}

/**
 * Khởi tạo trang favorite.html: gắn sự kiện, nạp dữ liệu JSON rồi vẽ.
 * Chạy sau DOMContentLoaded nên #favorite-tabs / #favorite-list đã tồn tại.
 */
async function initFavoritePage() {
    const tabsBox = document.getElementById('favorite-tabs');
    const listBox = document.getElementById('favorite-list');

    // Trang khác nạp favorite.js (home.js, hero.js, item.js...) không có 2 khối này.
    if (!tabsBox || !listBox) return;

    // Gắn sự kiện 1 lần duy nhất, sau này vẽ lại innerHTML không phải gắn lại.
    tabsBox.addEventListener('click', handleFavoriteTabsClick);
    listBox.addEventListener('click', handleFavoriteListClick);

    // Nạp song song 2 file JSON, không nạp những thứ trang này không dùng.
    const [heroes, items] = await Promise.all([
        loadData(DATA_PATH.heroes),
        loadData(DATA_PATH.items),
    ]);

    favoriteHeroes = Array.isArray(heroes) ? heroes : [];
    favoriteItems = Array.isArray(items) ? items : [];
    favoriteHeroIndex = buildEntityIndex(favoriteHeroes);
    favoriteItemIndex = buildEntityIndex(favoriteItems);
    favoriteDataReady = true;

    // Vẽ tab trước, danh sách bên dưới dùng tab vừa vẽ.
    renderFavoriteTabs();
    renderFavoriteList();
}

document.addEventListener('DOMContentLoaded', refreshFavoriteButtons);
document.addEventListener('DOMContentLoaded', initFavoritePage);
