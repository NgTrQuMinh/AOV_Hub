/**
 * components.js - Các hàm render HTML dùng chung (Hero Card, Item Card, Not-found...)
 * Phụ trách: Người 1 (TV1)
 *
 * Dùng lại ở: Home (TV1), Heroes (TV2), Items (TV3), Favorite/Compare (TV4), Feed.
 * Không đổi tên hàm/tham số nếu không thông báo trước cho cả nhóm, vì các file
 * hero.js / item.js / favorite.js / compare.js / feed.js gọi trực tiếp các hàm này.
 */

const DIFFICULTY_LABEL = { 1: 'Dễ', 2: 'Trung bình', 3: 'Khó' };
const DIFFICULTY_BADGE_CLASS = { 1: 'badge--easy', 2: 'badge--medium', 3: 'badge--hard' };

/**
 * Chặn lỗi hiển thị/HTML injection khi in dữ liệu người dùng nhập (bài viết, bình luận).
 * @param {*} value
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Định dạng ngày giờ kiểu Việt Nam từ chuỗi ISO.
 */
function formatDateTime(isoString) {
    const date = new Date(isoString);

    if (isNaN(date.getTime())) return '';

    return date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Xử lý khi ảnh tướng/trang bị chưa có sẵn (thư mục assets/images còn trống).
 * Vẽ một placeholder SVG lấy chữ cái đầu của alt để tránh icon "ảnh vỡ" trên toàn site.
 */
function handleImageError(img) {
    img.onerror = null;

    const letter = (img.alt || '?').trim().charAt(0).toUpperCase();
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="#2b2148"/><stop offset="100%" stop-color="#181228"/>' +
        '</linearGradient></defs>' +
        '<rect width="100%" height="100%" fill="url(#g)"/>' +
        '<text x="50%" y="50%" font-size="140" font-family="Segoe UI, Arial, sans-serif" ' +
        'font-weight="700" fill="#e6b34a" fill-opacity="0.55" text-anchor="middle" ' +
        'dominant-baseline="central">' + letter + '</text>' +
        '</svg>';

    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    img.classList.add('img-placeholder');
}

/**
 * Render 1 thẻ Tướng.
 * @param {object} hero - object theo schema data/heroes.json (id, name, image, role[], difficulty)
 * @returns {string} HTML string
 */
function renderHeroCard(hero) {
    const difficultyText = DIFFICULTY_LABEL[hero.difficulty] || '';
    const difficultyClass = DIFFICULTY_BADGE_CLASS[hero.difficulty] || '';
    const roles = (hero.role || [])
        .map((role) => `<span class="badge">${escapeHtml(role)}</span>`)
        .join('');

    return `
        <article class="card hero-card">
            <a class="hero-card__media" href="/pages/hero-detail.html?id=${hero.id}">
                <img src="/assets/images/${hero.image}" alt="${escapeHtml(hero.name)}" loading="lazy" onerror="handleImageError(this)">
            </a>
            <button
                type="button"
                class="btn-favorite"
                data-type="hero"
                data-id="${hero.id}"
                aria-label="Thêm/bỏ yêu thích"
            ><span aria-hidden="true">♥</span></button>
            <div class="hero-card__body">
                <h3 class="hero-card__name">${escapeHtml(hero.name)}</h3>
                <div class="hero-card__meta">
                    ${roles}
                    ${difficultyText ? `<span class="badge ${difficultyClass}">${difficultyText}</span>` : ''}
                </div>
                <a class="hero-card__link" href="/pages/hero-detail.html?id=${hero.id}">Xem chi tiết</a>
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
        ? `${item.price.toLocaleString('vi-VN')} Vàng`
        : '';

    return `
        <article class="card item-card">
            <a class="item-card__media" href="/pages/item-detail.html?id=${item.id}">
                <img src="/assets/images/${item.image}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="handleImageError(this)">
            </a>
            <button
                type="button"
                class="btn-favorite"
                data-type="item"
                data-id="${item.id}"
                aria-label="Thêm/bỏ yêu thích"
            ><span aria-hidden="true">♥</span></button>
            <div class="item-card__body">
                <h3 class="item-card__name">${escapeHtml(item.name)}</h3>
                <div class="item-card__meta">
                    ${item.type ? `<span class="badge">${escapeHtml(item.type)}</span>` : ''}
                    ${priceText ? `<span class="item-card__price">${priceText}</span>` : ''}
                </div>
                <a class="item-card__link" href="/pages/item-detail.html?id=${item.id}">Xem chi tiết</a>
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
            <p class="not-found__text">${escapeHtml(message)}</p>
        </div>
    `;
}

/**
 * Render 1 dòng chỉ số (dùng ở trang chi tiết tướng/trang bị).
 */
function renderStatRow(label, value) {
    return `
        <li class="stat-row">
            <span class="stat-row__label">${escapeHtml(label)}</span>
            <span class="stat-row__value">${escapeHtml(value)}</span>
        </li>
    `;
}

/* Tên hiển thị tiếng Việt cho các key trong stats của heroes.json / items.json */
const STAT_LABEL = {
    hp: 'Máu',
    attack: 'Công vật lý',
    magic: 'Công phép',
    defense: 'Giáp',
    armor: 'Giáp',
    magicResist: 'Kháng phép',
    speed: 'Tốc chạy',
    attackSpeed: 'Tốc đánh (%)',
    critical: 'Chí mạng (%)',
    lifeSteal: 'Hút máu (%)',
    cooldown: 'Giảm hồi chiêu (%)',
    armorPenetration: 'Xuyên giáp (%)',
    magicPenetration: 'Xuyên phép (%)',
};
