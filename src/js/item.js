/**
 * item.js - Danh sách + Chi tiết Trang bị (pages/items.html, pages/item-detail.html)
 * Phụ trách: Người 3
 *
 * Dùng lại của Người 1: loadData() (loadData.js), renderItemCard()/renderNotFound()/
 * escapeHtml()/imageUrl()/handleImageError() (components.js), DATA_PATH (config.js).
 * Dùng lại của Người 4: matchKeyword()/debounce()/getQueryParam() (search.js),
 * refreshFavoriteButtons() (favorite.js).
 *
 * Trang Danh sách (items.html):
 *   - Đọc src/data/items.json (không hard-code item trong HTML)
 *   - Tìm theo tên (không phân biệt hoa/thường + không dấu tiếng Việt)
 *   - Lọc theo loại (lấy type từ chính dữ liệu), search và filter chạy đồng thời
 *   - Card hiển thị ảnh / tên / loại / giá / vài chỉ số chính, bấm vào sang item-detail.html?id=
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Xác định trang hiện tại
    const isDetailPage = window.location.pathname.includes('item-detail.html');

    // 2. Tải dữ liệu từ items.json
    let items = [];
    try {
        items = await loadData(DATA_PATH.items);
    } catch (error) {
        console.error('Lỗi khi tải dữ liệu trang bị:', error);
        return;
    }

    // 3. Điều hướng xử lý
    if (isDetailPage) {
        initItemDetailPage(items);
    } else {
        initItemListPage(items);
    }
});

/* ---------- Hằng số & nhãn ---------- */

const ITEM_PAGE_SIZE = 12;

/**
 * Thứ tự hiển thị của bộ lọc. Đây chỉ là thứ tự ĐỆ XUẤT — danh sách loại thật
 * luôn được lấy từ dữ liệu items.json (xem getItemTypes()), nên nếu items.json
 * thêm/bớt loại thì bộ lọc tự đổi theo, không bị cứng.
 */
const ITEM_TYPE_ORDER = ['Công', 'Phép', 'Giáp', 'Kháng Phép', 'Giày', 'Đặc Biệt'];

/** Nhãn tiếng Việt cho key trong item.stats (xem data/items.json). */
const ITEM_STAT_LABEL = {
    attack: 'Sát thương',
    attackSpeed: 'Tốc độ đánh',
    critChance: 'Tỉ lệ chí mạng',
    penetration: 'Xuyên giáp',
    lifesteal: 'Hồi máu',
    magicPower: 'Sức mạnh phép',
    cooldownReduction: 'Giảm hồi chiêu',
    mana: 'Năng lượng',
    manaRegen: 'Hồi năng lượng',
    armor: 'Giáp',
    magicResist: 'Kháng phép',
    hp: 'Máu',
    hpRegen: 'Tốc độ hồi máu',
    moveSpeed: 'Tốc độ chạy',
};

/** Thứ tự ưu tiên khi chọn "vài chỉ số chính" hiển thị trên card. */
const ITEM_STAT_PRIORITY = [
    'attack', 'magicPower', 'armor', 'magicResist', 'hp', 'moveSpeed',
    'attackSpeed', 'critChance', 'penetration', 'lifesteal',
    'hpRegen', 'cooldownReduction', 'mana', 'manaRegen',
];

/** Số chỉ số tối đa in trên 1 card (trang chi tiết in toàn bộ). */
const ITEM_CARD_STAT_LIMIT = 3;

/** Marker trong markup do renderItemCard() sinh ra, dùng để chèn khối chỉ số. */
const ITEM_CARD_LINK_MARKER = '<a class="item-card__link"';

/* ---------- Trang Danh sách trang bị (items.html) ---------- */

function initItemListPage(items) {
    const filterBarEl = document.getElementById('item-filter-bar');
    const gridContainer = document.getElementById('item-list');
    const paginationEl = document.getElementById('item-pagination');
    const countEl = document.getElementById('item-count');

    if (!gridContainer) return;

    const types = getItemTypes(items);

    // Từ khoá/loại có thể đến từ URL: items.html?keyword=kiem&type=Công
    const state = {
        keyword: getQueryParam('keyword'),
        type: resolveInitialItemType(types, getQueryParam('type')),
        page: 1,
    };

    renderItemFilterBar(filterBarEl, types, items, state);

    const searchInput = document.getElementById('item-search');
    if (searchInput) searchInput.value = state.keyword;

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            state.keyword = searchInput.value;
            state.page = 1;
            render();
        }, 200));
    }

    if (filterBarEl) {
        filterBarEl.addEventListener('click', (event) => {
            const chip = event.target.closest('.item-chip');
            if (!chip) return;

            state.type = chip.dataset.type || 'all';
            state.page = 1;
            render();
        });
    }

    if (gridContainer) {
        // Nút "Xóa tìm kiếm & bộ lọc" nằm trong khối rỗng nên dùng event delegation.
        gridContainer.addEventListener('click', (event) => {
            const resetBtn = event.target.closest('[data-reset-item-filter]');
            if (!resetBtn) return;

            state.keyword = '';
            state.type = 'all';
            state.page = 1;

            if (searchInput) searchInput.value = '';
            render();
        });
    }

    if (paginationEl) {
        paginationEl.addEventListener('click', (event) => {
            const pageBtn = event.target.closest('[data-page]');
            if (!pageBtn) return;

            state.page = Number(pageBtn.dataset.page);
            render();
            gridContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    /** Lọc theo loại VÀ từ khoá cùng lúc (AND). */
    const getFilteredItems = () => items.filter((item) => {
        const matchesType = state.type === 'all' || item.type === state.type;
        const matchesKeyword = matchKeyword(`${item.name} ${item.alias || ''}`, state.keyword);

        return matchesType && matchesKeyword;
    });

    function render() {
        const filtered = getFilteredItems();

        const totalPages = Math.max(1, Math.ceil(filtered.length / ITEM_PAGE_SIZE));
        state.page = Math.min(Math.max(1, state.page), totalPages);

        if (countEl) {
            countEl.textContent = filtered.length === items.length
                ? `${filtered.length} trang bị`
                : `${filtered.length}/${items.length} trang bị`;
        }

        markActiveItemChip(filterBarEl, state.type);

        gridContainer.innerHTML = filtered.length
            ? filtered
                .slice((state.page - 1) * ITEM_PAGE_SIZE, state.page * ITEM_PAGE_SIZE)
                .map(renderItemCardWithStats)
                .join('')
            : renderItemEmptyState(state);

        renderItemPagination(paginationEl, totalPages, state.page);

        if (typeof refreshFavoriteButtons === 'function') refreshFavoriteButtons();
    }

    render();
}

/**
 * Lấy danh sách loại trang bị có thật trong dữ liệu.
 * Ưu tiên thứ tự trong ITEM_TYPE_ORDER, loại lạ (nếu có) xếp sau theo alphabet.
 * @param {object[]} items
 * @returns {string[]}
 */
function getItemTypes(items) {
    const found = [...new Set(items.map((item) => item.type).filter(Boolean))];
    const ordered = ITEM_TYPE_ORDER.filter((type) => found.includes(type));
    const extra = found.filter((type) => !ITEM_TYPE_ORDER.includes(type)).sort();

    return [...ordered, ...extra];
}

/**
 * Đọc tham số ?type= trên URL, khớp không dấu/hoa-thường với loại có thật.
 * @param {string[]} types
 * @param {string} requested
 * @returns {string} 'all' hoặc tên loại hợp lệ
 */
function resolveInitialItemType(types, requested) {
    const normalized = normalizeKeyword(requested);
    if (!normalized) return 'all';

    return types.find((type) => normalizeKeyword(type) === normalized) || 'all';
}

/**
 * Vẽ thanh tìm kiếm + các nút lọc loại.
 * @param {HTMLElement} barEl - #item-filter-bar
 * @param {string[]} types - loại lấy từ dữ liệu
 * @param {object[]} items
 * @param {{keyword: string, type: string}} state
 */
function renderItemFilterBar(barEl, types, items, state) {
    if (!barEl) return;

    barEl.className = 'item-filter';
    barEl.innerHTML = `
        <div class="item-filter__row">
            <input
                type="search"
                id="item-search"
                class="filter-bar__keyword"
                placeholder="Tìm trang bị theo tên (không dấu cũng được)..."
                aria-label="Tìm trang bị theo tên"
                autocomplete="off"
                value="${escapeHtml(state.keyword)}"
            >
        </div>
        <div class="item-filter__types" role="group" aria-label="Lọc theo loại trang bị">
            <button type="button" class="item-chip" data-type="all" aria-pressed="false">
                Tất cả <span class="item-chip__count">${items.length}</span>
            </button>
            ${types.map((type) => `
                <button type="button" class="item-chip" data-type="${escapeHtml(type)}" aria-pressed="false">
                    ${escapeHtml(type)} <span class="item-chip__count">${countItemsByType(items, type)}</span>
                </button>
            `).join('')}
        </div>
    `;
}

/**
 * @param {object[]} items
 * @param {string} type
 * @returns {number} số trang bị thuộc loại
 */
function countItemsByType(items, type) {
    return items.filter((item) => item.type === type).length;
}

/**
 * Đồng bộ trạng thái active của các nút lọc (theo state.type).
 * @param {HTMLElement} barEl
 * @param {string} type
 */
function markActiveItemChip(barEl, type) {
    if (!barEl) return;

    barEl.querySelectorAll('.item-chip').forEach((chip) => {
        const isActive = (chip.dataset.type || 'all') === type;

        chip.classList.toggle('is-active', isActive);
        chip.setAttribute('aria-pressed', String(isActive));
    });
}

/**
 * Khối hiển thị khi không có kết quả, nêu rõ điều kiện đang lọc + nút xóa lọc.
 * @param {{keyword: string, type: string}} state
 * @returns {string} HTML string
 */
function renderItemEmptyState(state) {
    const keyword = String(state.keyword || '').trim();
    const conditions = [];

    if (keyword) conditions.push(`từ khoá "${keyword}"`);
    if (state.type !== 'all') conditions.push(`loại "${state.type}"`);

    const message = conditions.length
        ? `Không tìm thấy trang bị nào khớp với ${conditions.join(' và ')}.`
        : 'Chưa có trang bị nào trong dữ liệu.';

    return `
        <div class="item-empty">
            ${renderNotFound(message)}
            <button type="button" class="btn btn-outline" data-reset-item-filter>
                Xóa tìm kiếm &amp; bộ lọc
            </button>
        </div>
    `;
}

/**
 * Vẽ thanh phân trang, ẩn luôn khi chỉ có 1 trang.
 * @param {HTMLElement} paginationEl - #item-pagination
 * @param {number} totalPages
 * @param {number} currentPage
 */
function renderItemPagination(paginationEl, totalPages, currentPage) {
    if (!paginationEl) return;

    paginationEl.innerHTML = totalPages > 1
        ? `<div class="pagination">${Array.from({ length: totalPages }, (_, index) => {
            const page = index + 1;

            return `<button
                type="button"
                class="pagination__item${page === currentPage ? ' is-active' : ''}"
                data-page="${page}"
                aria-label="Trang ${page}"
                aria-current="${page === currentPage ? 'page' : 'false'}"
            >${page}</button>`;
        }).join('')}</div>`
        : '';
}

/* ---------- Card + chỉ số ---------- */

/**
 * Card trang bị dùng chung từ components.js, ghép thêm khối chỉ số chính.
 * Không viết lại markup card (quy ước chung của dự án).
 * @param {object} item
 * @returns {string} HTML string
 */
function renderItemCardWithStats(item) {
    const card = renderItemCard(item);
    const statsHtml = renderItemStatList(item, ITEM_CARD_STAT_LIMIT);
    const insertAt = card.indexOf(ITEM_CARD_LINK_MARKER);

    if (!statsHtml || insertAt === -1) return card;

    return card.slice(0, insertAt) + statsHtml + card.slice(insertAt);
}

/**
 * Danh sách chỉ số của 1 trang bị, đã sắp theo độ quan trọng.
 * @param {object} item
 * @returns {Array<{key: string, label: string, value: *}>}
 */
function getItemStatEntries(item) {
    const stats = item.stats && typeof item.stats === 'object' && !Array.isArray(item.stats) ? item.stats : {};

    const known = ITEM_STAT_PRIORITY.filter((key) => stats[key] !== undefined && stats[key] !== null);
    // Chỉ số mới thêm vào items.json (chưa có trong bảng nhãn) vẫn phải hiện được.
    const extra = Object.keys(stats).filter((key) => !ITEM_STAT_PRIORITY.includes(key));

    return [...known, ...extra].map((key) => ({
        key,
        label: ITEM_STAT_LABEL[key] || humanizeStatKey(key),
        value: stats[key],
    }));
}

/**
 * Đổi key camelCase thành nhãn đọc được khi chưa có nhãn tiếng Việt.
 * @param {string} key
 * @returns {string}
 */
function humanizeStatKey(key) {
    const text = String(key).replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();

    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * @param {*} value
 * @returns {string} số đã định dạng gọn (bỏ phần thập không cần thiết)
 */
function formatStatValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);

    return String(Math.round(number * 10) / 10);
}

/**
 * Render <ul> chỉ số.
 * @param {object} item
 * @param {number} [limit] số chỉ số tối đa, bỏ trống = in tất cả
 * @returns {string} HTML string (rỗng nếu item không có chỉ số)
 */
function renderItemStatList(item, limit) {
    const entries = typeof limit === 'number' ? getItemStatEntries(item).slice(0, limit) : getItemStatEntries(item);
    if (!entries.length) return '';

    return `
        <ul class="item-card__stats">
            ${entries.map((entry) => `
                <li class="item-card__stat">
                    <span class="item-card__stat-label">${escapeHtml(entry.label)}</span>
                    <span class="item-card__stat-value">+${escapeHtml(formatStatValue(entry.value))}</span>
                </li>
            `).join('')}
        </ul>
    `;
}

/* ---------- Trang Chi tiết trang bị (item-detail.html) ---------- */

function initItemDetailPage(items) {
    const detailContainer = document.getElementById('item-detail');

    if (!detailContainer) return;

    const itemId = getQueryParam('id');
    const item = items.find((row) => String(row.id) === String(itemId));

    if (!item) {
        detailContainer.innerHTML = `
            ${renderNotFound('Không tìm thấy trang bị này.')}
            <p class="item-detail__back-wrap">
                <a class="btn btn-outline" href="${BASE_PATH}src/pages/items.html">← Về danh sách trang bị</a>
            </p>
        `;
        return;
    }

    const priceText = typeof item.price === 'number'
        ? `${item.price.toLocaleString('vi-VN')} Bạc`
        : 'Không rõ';
    const stats = getItemStatEntries(item);

    detailContainer.innerHTML = `
        <nav class="item-detail__breadcrumb">
            <a href="${BASE_PATH}src/pages/items.html">← Danh sách trang bị</a>
        </nav>

        <article class="item-detail">
            <div class="item-detail__media">
                <img src="${imageUrl(item.image)}" alt="${escapeHtml(item.name)}" onerror="handleImageError(this)">
            </div>

            <div class="item-detail__body">
                <h1 class="item-detail__name">${escapeHtml(item.name)}</h1>

                <div class="item-detail__meta">
                    ${item.type ? `<span class="badge">${escapeHtml(item.type)}</span>` : ''}
                    <span class="item-detail__price">${escapeHtml(priceText)}</span>
                    <button
                        type="button"
                        class="btn-favorite"
                        data-type="item"
                        data-id="${item.id}"
                        aria-label="Thêm/bỏ yêu thích"
                    ><span aria-hidden="true">♥</span></button>
                </div>

                <p class="item-detail__desc">${escapeHtml(item.description || 'Chưa có mô tả cho trang bị này.')}</p>

                ${item.passive ? `
                    <div class="item-detail__passive">
                        <h2>Nội tại</h2>
                        <p>${escapeHtml(item.passive)}</p>
                    </div>
                ` : ''}

                <div class="item-detail__stats">
                    <h2>Chỉ số</h2>
                    ${stats.length ? `
                        <ul>
                            ${stats.map((entry) => `
                                <li class="item-detail__stat">
                                    <span class="item-detail__stat-label">${escapeHtml(entry.label)}</span>
                                    <span class="item-detail__stat-value">+${escapeHtml(formatStatValue(entry.value))}</span>
                                </li>
                            `).join('')}
                        </ul>
                    ` : renderNotFound('Trang bị này không có chỉ số nào.')}
                </div>
            </div>
        </article>
    `;

    if (typeof refreshFavoriteButtons === 'function') refreshFavoriteButtons();
}
