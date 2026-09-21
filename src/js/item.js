/**
 * item.js - Danh sách + Chi tiết Trang bị (pages/items.html, pages/item-detail.html)
 * Phụ trách: Người 3 (TV3)
 *
 * Dùng lại của TV1: loadData(), renderItemCard(), renderNotFound(), renderStatRow().
 * Dùng lại của TV4: matchKeyword()/debounce() (search.js), addHistory() (storage.js).
 */

const ITEM_PAGE_SIZE = 8;

let allItems = [];
let itemFilter = { keyword: '', type: '', sort: '' };
let itemCurrentPage = 1;

/* ================== A. TRANG DANH SÁCH TRANG BỊ ================== */

async function initItemListPage() {
    const listContainer = document.getElementById('item-list');
    if (!listContainer) return;

    allItems = await loadData(DATA_PATH.items);
    itemFilter.keyword = getQueryParam('keyword');

    renderItemFilterBar();
    renderItemList();
}

function getAllItemTypes() {
    const types = [];

    allItems.forEach((item) => {
        if (item.type && !types.includes(item.type)) {
            types.push(item.type);
        }
    });

    return types;
}

function renderItemFilterBar() {
    const bar = document.getElementById('item-filter-bar');
    if (!bar) return;

    const typeOptions = getAllItemTypes()
        .map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
        .join('');

    bar.className = 'filter-bar';
    bar.innerHTML = `
        <input
            class="filter-bar__keyword"
            type="text"
            id="item-keyword"
            placeholder="Tìm trang bị theo tên..."
            value="${escapeHtml(itemFilter.keyword)}"
        >
        <select class="filter-bar__select" id="item-type">
            <option value="">Tất cả loại</option>
            ${typeOptions}
        </select>
        <select class="filter-bar__select" id="item-sort">
            <option value="">Sắp xếp mặc định</option>
            <option value="price-asc">Giá tăng dần</option>
            <option value="price-desc">Giá giảm dần</option>
        </select>
    `;

    document.getElementById('item-keyword').addEventListener('input', debounce((event) => {
        itemFilter.keyword = event.target.value;
        itemCurrentPage = 1;
        renderItemList();
    }, 300));

    document.getElementById('item-type').addEventListener('change', (event) => {
        itemFilter.type = event.target.value;
        itemCurrentPage = 1;
        renderItemList();
    });

    document.getElementById('item-sort').addEventListener('change', (event) => {
        itemFilter.sort = event.target.value;
        itemCurrentPage = 1;
        renderItemList();
    });
}

function filterItems() {
    const result = allItems.filter((item) => {
        const matchName = matchKeyword(item.name, itemFilter.keyword);
        const matchType = !itemFilter.type || item.type === itemFilter.type;

        return matchName && matchType;
    });

    if (itemFilter.sort === 'price-asc') {
        result.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (itemFilter.sort === 'price-desc') {
        result.sort((a, b) => (b.price || 0) - (a.price || 0));
    }

    return result;
}

function renderItemList() {
    const listContainer = document.getElementById('item-list');
    const countEl = document.getElementById('item-count');
    if (!listContainer) return;

    const filtered = filterItems();
    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEM_PAGE_SIZE));

    if (itemCurrentPage > totalPages) itemCurrentPage = totalPages;

    const start = (itemCurrentPage - 1) * ITEM_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + ITEM_PAGE_SIZE);

    if (countEl) {
        countEl.textContent = `${filtered.length} trang bị`;
    }

    listContainer.innerHTML = pageItems.length
        ? pageItems.map(renderItemCard).join('')
        : renderNotFound('Không tìm thấy trang bị phù hợp.');

    renderItemPagination(totalPages);
    refreshFavoriteButtons();
}

function renderItemPagination(totalPages) {
    const pagination = document.getElementById('item-pagination');
    if (!pagination) return;

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';
    for (let page = 1; page <= totalPages; page += 1) {
        html += `
            <button type="button" class="pagination__item ${page === itemCurrentPage ? 'is-active' : ''}" data-page="${page}">
                ${page}
            </button>
        `;
    }

    pagination.className = 'pagination';
    pagination.innerHTML = html;

    pagination.querySelectorAll('.pagination__item').forEach((button) => {
        button.addEventListener('click', () => {
            itemCurrentPage = Number(button.dataset.page);
            renderItemList();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

/* ================== B. TRANG CHI TIẾT TRANG BỊ ================== */

async function initItemDetailPage() {
    const container = document.getElementById('item-detail');
    if (!container) return;

    const itemId = Number(getQueryParam('id'));
    const items = await loadData(DATA_PATH.items);
    const item = items.find((record) => record.id === itemId);

    if (!item) {
        container.innerHTML = renderNotFound('Không tìm thấy trang bị bạn yêu cầu.');
        return;
    }

    document.title = `AOV HUB - ${item.name}`;

    const heroes = await loadData(DATA_PATH.heroes);
    const builds = await loadData(DATA_PATH.builds);

    container.innerHTML = renderItemDetail(item, heroes, builds);

    addHistory('item', item.id);
    refreshFavoriteButtons();
}

function renderItemDetail(item, heroes, builds) {
    const stats = Object.keys(item.stats || {})
        .map((key) => renderStatRow(STAT_LABEL[key] || key, item.stats[key]))
        .join('');

    // Tướng nào đang dùng trang bị này trong build đề xuất
    const relatedHeroes = heroes.filter((hero) => {
        const inHero = (hero.recommendedBuild || []).includes(item.id);
        const inBuild = builds.some(
            (build) => build.heroId === hero.id && (build.items || []).includes(item.id)
        );
        return inHero || inBuild;
    }).slice(0, 8);

    const priceText = typeof item.price === 'number'
        ? `${item.price.toLocaleString('vi-VN')} Vàng`
        : 'Chưa có';

    return `
        <nav class="breadcrumb">
            <a href="/index.html">Trang chủ</a> ›
            <a href="/pages/items.html">Trang bị</a> ›
            <span>${escapeHtml(item.name)}</span>
        </nav>

        <section class="detail-item">
            <div class="detail-item__media">
                <img src="/assets/images/${item.image}" alt="${escapeHtml(item.name)}" onerror="handleImageError(this)">
            </div>
            <div class="detail-item__info">
                <h1>${escapeHtml(item.name)}</h1>
                <div class="detail-hero__badges">
                    ${item.type ? `<span class="badge">${escapeHtml(item.type)}</span>` : ''}
                    <span class="badge badge--price">${priceText}</span>
                </div>
                <p>${escapeHtml(item.description || '')}</p>

                <h2 class="detail-subtitle">Chỉ số</h2>
                <ul class="stat-list">${stats || '<li class="stat-row">Chưa có dữ liệu chỉ số.</li>'}</ul>

                ${item.passive ? `
                    <h2 class="detail-subtitle">Nội tại</h2>
                    <p class="item-passive">${escapeHtml(item.passive)}</p>
                ` : ''}

                <div class="detail-hero__actions">
                    <button type="button" class="btn btn-outline btn-favorite-inline btn-favorite" data-type="item" data-id="${item.id}">
                        ♥ Yêu thích
                    </button>
                    <a class="btn btn-primary" href="/pages/items.html">Xem trang bị khác</a>
                </div>
            </div>
        </section>

        <section class="section">
            <div class="section__header"><h2>Tướng phù hợp</h2></div>
            <div class="grid grid--heroes">
                ${relatedHeroes.length
                    ? relatedHeroes.map(renderHeroCard).join('')
                    : renderNotFound('Chưa có tướng nào dùng trang bị này trong build đề xuất.')}
            </div>
        </section>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    initItemListPage();
    initItemDetailPage();
});
