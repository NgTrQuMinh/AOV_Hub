/**
 * home.js - Trang chủ: render Tướng nổi bật + Trang bị nổi bật
 * Phụ trách: Người 1
 *
 * Phụ thuộc: loadData.js, components.js (Người 1) — nạp trước home.js trong index.html.
 */
async function renderFeaturedHeroes() {
    const container = document.getElementById('featured-heroes');
    if (!container) return;

    const heroes = await loadHeroes();
    const featured = heroes.slice(0, 8);

    container.innerHTML = featured.length
        ? featured.map(renderHeroCard).join('')
        : renderNotFound('Chưa có dữ liệu tướng nổi bật.');

    if (typeof refreshFavoriteButtons === 'function') refreshFavoriteButtons();
}

async function renderFeaturedItems() {
    const container = document.getElementById('featured-items');
    if (!container) return;

    const items = await loadData(DATA_PATH.items);
    const featured = items.slice(0, 8);

    container.innerHTML = featured.length
        ? featured.map(renderItemCard).join('')
        : renderNotFound('Chưa có dữ liệu trang bị nổi bật.');

    if (typeof refreshFavoriteButtons === 'function') refreshFavoriteButtons();
}

document.addEventListener('DOMContentLoaded', () => {
    renderFeaturedHeroes();
    renderFeaturedItems();
});
