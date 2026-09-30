/**
 * favorite.js - Xử lý nút yêu thích trên card/detail
 * Phụ trách: Người 4
 *
 * Các nút yêu thích đã có sẵn markup dùng chung (xem js/components.js):
 *   <button class="btn-favorite" data-type="hero|item" data-id="...">
 *
 * Card được render động (home.js, hero.js, item.js, build.js...) nên dùng
 * event delegation trên document, không gắn sự kiện riêng cho từng nút.
 *
 * Phụ thuộc: storage.js (getFavorites/addFavorite/removeFavorite/isFavorite),
 * components.js (handleImageError, escapeHtml).
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

document.addEventListener('DOMContentLoaded', refreshFavoriteButtons);
