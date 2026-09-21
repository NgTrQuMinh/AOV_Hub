/**
 * build.js - Trang Build đề xuất (pages/builds.html)
 * Phụ trách: Người 2 (TV2)
 *
 * Đọc data/builds.json và ghép với data/heroes.json + data/items.json
 * để hiển thị: tướng nào - build tên gì - gồm những trang bị nào.
 *
 * Dùng lại của TV1: loadData() (loadData.js), escapeHtml()/renderNotFound() (components.js).
 * Dùng lại của TV4: matchKeyword()/debounce() (search.js).
 */

let allBuilds = [];
let buildHeroes = [];
let buildItems = [];
let buildKeyword = '';

async function initBuildPage() {
    const listContainer = document.getElementById('build-list');
    if (!listContainer) return;

    allBuilds = await loadData(DATA_PATH.builds);
    buildHeroes = await loadData(DATA_PATH.heroes);
    buildItems = await loadData(DATA_PATH.items);

    buildKeyword = getQueryParam('keyword');

    renderBuildFilterBar();
    renderBuildList();
}

function renderBuildFilterBar() {
    const bar = document.getElementById('build-filter-bar');
    if (!bar) return;

    bar.className = 'filter-bar';
    bar.innerHTML = `
        <input
            class="filter-bar__keyword"
            type="text"
            id="build-keyword"
            placeholder="Tìm build theo tên tướng hoặc tên build..."
            value="${escapeHtml(buildKeyword)}"
        >
    `;

    document.getElementById('build-keyword').addEventListener('input', debounce((event) => {
        buildKeyword = event.target.value;
        renderBuildList();
    }, 300));
}

/** Tìm tướng của 1 build (builds.json lưu heroId) */
function findBuildHero(build) {
    return buildHeroes.find((hero) => hero.id === build.heroId);
}

function filterBuilds() {
    return allBuilds.filter((build) => {
        const hero = findBuildHero(build);
        const text = `${build.name} ${hero ? hero.name : ''}`;

        return matchKeyword(text, buildKeyword);
    });
}

function renderBuildList() {
    const listContainer = document.getElementById('build-list');
    const countEl = document.getElementById('build-count');
    if (!listContainer) return;

    const filtered = filterBuilds();

    if (countEl) {
        countEl.textContent = `${filtered.length} build`;
    }

    listContainer.innerHTML = filtered.length
        ? filtered.map(renderBuildCard).join('')
        : renderNotFound('Không tìm thấy build phù hợp.');

    refreshFavoriteButtons();
}

function renderBuildCard(build) {
    const hero = findBuildHero(build);

    const itemsHtml = (build.items || [])
        .map((itemId) => buildItems.find((item) => item.id === itemId))
        .filter(Boolean)
        .map((item) => `
            <a class="build-item" href="/pages/item-detail.html?id=${item.id}" title="${escapeHtml(item.name)}">
                <img src="/assets/images/${item.image}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="handleImageError(this)">
                <span>${escapeHtml(item.name)}</span>
            </a>
        `).join('');

    return `
        <article class="build-card">
            <div class="build-card__hero">
                ${hero ? `
                    <a href="/pages/hero-detail.html?id=${hero.id}">
                        <img src="/assets/images/${hero.image}" alt="${escapeHtml(hero.name)}" loading="lazy" onerror="handleImageError(this)">
                        <h3>${escapeHtml(hero.name)}</h3>
                    </a>
                    <span class="badge">${escapeHtml((hero.role || []).join(', '))}</span>
                ` : '<h3>Tướng chưa xác định</h3>'}
            </div>

            <div class="build-card__body">
                <h2 class="build-card__name">${escapeHtml(build.name)}</h2>
                <p>${escapeHtml(build.description || '')}</p>
                <div class="build-card__items">
                    ${itemsHtml || renderNotFound('Build này chưa có trang bị.')}
                </div>
            </div>
        </article>
    `;
}

document.addEventListener('DOMContentLoaded', initBuildPage);
