/**
 * favorite.js - Nút yêu thích trên card/detail + trang Yêu thích & Lịch sử
 * Phụ trách: Người 4 (TV4)
 *
 * Phụ thuộc: storage.js, loadData.js, components.js
 *
 * Markup nút yêu thích được render sẵn trong js/components.js:
 *   <button class="btn-favorite" data-type="hero|item" data-id="...">
 * Vì card được render động nên dùng event delegation trên document.
 */

/* ---------- 1. Nút yêu thích dùng chung toàn site ---------- */

function refreshFavoriteButtons() {
    document.querySelectorAll('.btn-favorite').forEach((button) => {
        const type = button.dataset.type;
        const id = button.dataset.id;

        button.classList.toggle('is-active', isFavorite(type, id));
    });
}

document.addEventListener('click', (event) => {
    const button = event.target.closest('.btn-favorite');
    if (!button) return;

    event.preventDefault();

    const type = button.dataset.type;
    const id = button.dataset.id;
    const nowFavorite = toggleFavorite(type, id);

    button.classList.toggle('is-active', nowFavorite);

    // Nếu đang ở trang Yêu thích thì vẽ lại danh sách cho khớp
    if (document.body.dataset.page === 'favorite') {
        renderFavoritePage();
    }
});

/* Card được render bất đồng bộ, nên quét lại trạng thái nút sau khi trang tải xong */
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(refreshFavoriteButtons, 300);
});

/* ---------- 2. Trang Yêu thích / Lịch sử (pages/favorite.html) ---------- */

let currentFavoriteTab = 'hero';

async function renderFavoritePage() {
    const listContainer = document.getElementById('favorite-list');
    if (!listContainer) return;

    const heroes = await loadData(DATA_PATH.heroes);
    const items = await loadData(DATA_PATH.items);

    if (currentFavoriteTab === 'history') {
        renderHistoryList(listContainer, heroes, items);
    } else if (currentFavoriteTab === 'item') {
        const favoriteItems = items.filter((item) => isFavorite('item', item.id));
        listContainer.className = 'grid grid--items';
        listContainer.innerHTML = favoriteItems.length
            ? favoriteItems.map(renderItemCard).join('')
            : renderNotFound('Bạn chưa yêu thích trang bị nào.');
    } else {
        const favoriteHeroes = heroes.filter((hero) => isFavorite('hero', hero.id));
        listContainer.className = 'grid grid--heroes';
        listContainer.innerHTML = favoriteHeroes.length
            ? favoriteHeroes.map(renderHeroCard).join('')
            : renderNotFound('Bạn chưa yêu thích tướng nào.');
    }

    refreshFavoriteButtons();
}

function renderHistoryList(container, heroes, items) {
    const history = getHistory();

    container.className = 'history-list';

    if (!history.length) {
        container.innerHTML = renderNotFound('Chưa có lịch sử tra cứu.');
        return;
    }

    container.innerHTML = history.map((entry) => {
        const source = entry.type === 'hero' ? heroes : items;
        const found = source.find((record) => record.id === entry.id);

        if (!found) return '';

        const detailUrl = entry.type === 'hero'
            ? `/pages/hero-detail.html?id=${found.id}`
            : `/pages/item-detail.html?id=${found.id}`;

        return `
            <a class="history-item" href="${detailUrl}">
                <img src="/assets/images/${found.image}" alt="${escapeHtml(found.name)}" onerror="handleImageError(this)">
                <div>
                    <h3>${escapeHtml(found.name)}</h3>
                    <span class="history-item__meta">
                        ${entry.type === 'hero' ? 'Tướng' : 'Trang bị'} · ${formatDateTime(entry.at)}
                    </span>
                </div>
            </a>
        `;
    }).join('');
}

function initFavoritePage() {
    const tabsContainer = document.getElementById('favorite-tabs');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = `
        <button type="button" class="tab is-active" data-tab="hero">Tướng yêu thích</button>
        <button type="button" class="tab" data-tab="item">Trang bị yêu thích</button>
        <button type="button" class="tab" data-tab="history">Lịch sử tra cứu</button>
        <button type="button" class="btn btn-outline btn-sm tab-action" id="favorite-clear">Xoá dữ liệu tab</button>
    `;

    tabsContainer.addEventListener('click', (event) => {
        const tabButton = event.target.closest('.tab');

        if (tabButton) {
            currentFavoriteTab = tabButton.dataset.tab;
            tabsContainer.querySelectorAll('.tab').forEach((tab) => {
                tab.classList.toggle('is-active', tab === tabButton);
            });
            renderFavoritePage();
            return;
        }

        if (event.target.id === 'favorite-clear') {
            if (!confirm('Xoá toàn bộ dữ liệu của tab đang xem?')) return;

            if (currentFavoriteTab === 'history') {
                clearHistory();
            } else {
                getFavorites(currentFavoriteTab).forEach((id) => removeFavorite(currentFavoriteTab, id));
            }

            renderFavoritePage();
        }
    });

    renderFavoritePage();
}

document.addEventListener('DOMContentLoaded', initFavoritePage);
