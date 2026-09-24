/**
 * components.js - Các hàm render HTML dùng chung (Hero Card, Item Card, Not-found)
 * Phụ trách: Người 1
 *
 * Dùng lại ở: Home (Người 1), Heroes/Item list (Người 2/3), Favorite/Compare (Người 4).
 * Không đổi tên hàm/tham số nếu không thông báo trước cho cả nhóm, vì các file
 * hero.js / item.js / favorite.js / compare.js sẽ gọi trực tiếp các hàm này.
 */

const DIFFICULTY_LABEL = { 1: 'Dễ', 2: 'Trung bình', 3: 'Khó' };
const DIFFICULTY_BADGE_CLASS = { 1: 'badge--easy', 2: 'badge--medium', 3: 'badge--hard' };

/**
 * Render 1 thẻ Tướng.
 * @param {object} hero - object theo schema data/heroes.json (id, name, image, role[], difficulty)
 * @returns {string} HTML string
 */
function renderHeroCard(hero) {
    const difficultyText = DIFFICULTY_LABEL[hero.difficulty] || '';
    const difficultyClass = DIFFICULTY_BADGE_CLASS[hero.difficulty] || '';
    const roles = (hero.role || [])
        .map((role) => `<span class="badge">${role}</span>`)
        .join('');

    return `
        <article class="card hero-card">
            <a class="hero-card__media" href="${BASE_PATH}src/pages/hero-detail.html?id=${hero.id}">
                <img src="${BASE_PATH}assets/images/${hero.image}" alt="${hero.name}" loading="lazy">
            </a>
            <button
                type="button"
                class="btn-favorite"
                data-type="hero"
                data-id="${hero.id}"
                aria-label="Thêm/bỏ yêu thích"
            ><span aria-hidden="true">♥</span></button>
            <div class="hero-card__body">
                <h3 class="hero-card__name">${hero.name}</h3>
                <div class="hero-card__meta">
                    ${roles}
                    ${difficultyText ? `<span class="badge ${difficultyClass}">${difficultyText}</span>` : ''}
                </div>
                <a class="hero-card__link" href="${BASE_PATH}src/pages/hero-detail.html?id=${hero.id}">Xem chi tiết</a>
            </div>
        </article>
    `;
}

/**
 * Render 1 thẻ Trang bị.
 * @param {object} item - object theo schema data/items.json (id, name, image, type, price)
 * @returns {string} HTML string
 */
function renderItemCard(item) {
    const priceText = typeof item.price === 'number'
        ? `${item.price.toLocaleString('vi-VN')} Bạc`
        : '';

    return `
        <article class="card item-card">
            <a class="item-card__media" href="${BASE_PATH}src/pages/item-detail.html?id=${item.id}">
                <img src="${BASE_PATH}assets/images/${item.image}" alt="${item.name}" loading="lazy">
            </a>
            <button
                type="button"
                class="btn-favorite"
                data-type="item"
                data-id="${item.id}"
                aria-label="Thêm/bỏ yêu thích"
            ><span aria-hidden="true">♥</span></button>
            <div class="item-card__body">
                <h3 class="item-card__name">${item.name}</h3>
                <div class="item-card__meta">
                    ${item.type ? `<span class="badge">${item.type}</span>` : ''}
                    ${priceText ? `<span class="item-card__price">${priceText}</span>` : ''}
                </div>
                <a class="item-card__link" href="${BASE_PATH}src/pages/item-detail.html?id=${item.id}">Xem chi tiết</a>
            </div>
        </article>
    `;
}

/**
 * Render khối "không có kết quả".
 * @param {string} message
 * @returns {string} HTML string
 */
function renderNotFound(message) {
    return `
        <div class="not-found">
            <span class="not-found__icon" aria-hidden="true">🔍</span>
            <p class="not-found__text">${message}</p>
        </div>
    `;
}
