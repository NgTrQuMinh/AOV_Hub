/**
 * components.js - Các hàm render HTML dùng chung (Hero Card, Item Card, Not-found)
 * Phụ trách: Người 1
 *
 * Dùng lại ở: Home (Người 1), Heroes/Item list (Người 2/3), Favorite/Compare (Người 4).
 * Không đổi tên hàm/tham số nếu không thông báo trước cho cả nhóm, vì các file
 * hero.js / item.js / favorite.js / compare.js sẽ gọi trực tiếp các hàm này.
 */

const DIFFICULTY_LABEL = { 1: 'Dễ', 2: 'Trung bình', 3: 'Khó', 4: 'Rất khó', 5: 'Cực khó' };
const DIFFICULTY_BADGE_CLASS = { 1: 'badge--easy', 2: 'badge--medium', 3: 'badge--hard', 4: 'badge--hard', 5: 'badge--hard' };

const IMAGE_ROOT = 'assets/images/';
const IMAGE_FALLBACK = IMAGE_ROOT + 'placeholder.svg';

/**
 * Thoát ký tự HTML. Bắt buộc mọi dữ liệu từ JSON/LocalStorage đưa vào innerHTML.
 * @param {*} value
 * @returns {string}
 */
function escapeHtml(value) {
    if (value === null || value === undefined) return '';

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Định dạng mốc thời gian kiểu Việt Nam: dd/MM/yyyy HH:mm.
 * @param {string|number|Date} value - ISO string, timestamp hoặc Date
 * @returns {string} chuỗi rỗng nếu không parse được
 */
function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const pad = (number) => String(number).padStart(2, '0');

    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} `
        + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Chuẩn hoá đường dẫn ảnh trong JSON về đường dẫn phục vụ thật.
 * JSON đang để lẫn lộn 3 kiểu: "assets/heroes/x.png", "items/x.png", "heroes/x.png",
 * còn ảnh thật luôn nằm trong public/assets/images/... nên chuẩn hoá tại 1 chỗ.
 * @param {string} image
 * @returns {string} URL bắt đầu bằng BASE_PATH (hoặc URL tuyệt đối nếu JSON trỏ ra ngoài)
 */
function imageUrl(image) {
    const raw = String(image || '').trim();

    if (!raw) return BASE_PATH + IMAGE_FALLBACK;
    if (/^(https?:)?\/\//.test(raw)) return raw;

    const relative = raw.startsWith(IMAGE_ROOT)
        ? raw
        : IMAGE_ROOT + raw.replace(/^\/+/, '').replace(/^assets\//, '');

    return BASE_PATH + relative;
}

/**
 * Fallback cho <img onerror="handleImageError(this)"> khi ảnh trong JSON chưa có file thật.
 * Chỉ gắn 1 lần để ảnh placeholder hỏng không tạo vòng lặp vô hạn.
 * @param {HTMLImageElement} img
 */
function handleImageError(img) {
    if (!img || img.dataset.fallbackApplied === 'true') return;

    img.dataset.fallbackApplied = 'true';
    img.src = BASE_PATH + IMAGE_FALLBACK;
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
            <a class="hero-card__media" href="${BASE_PATH}src/pages/hero-detail.html?id=${hero.id}">
                <img src="${imageUrl(hero.image)}" alt="${escapeHtml(hero.name)}" loading="lazy" onerror="handleImageError(this)">
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
                <img src="${imageUrl(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="handleImageError(this)">
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
            <p class="not-found__text">${escapeHtml(message)}</p>
        </div>
    `;
}
