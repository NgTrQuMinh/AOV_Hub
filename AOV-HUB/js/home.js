/**
 * home.js - Trang chủ: Tướng nổi bật + Trang bị nổi bật + Bài viết mới nhất
 * Phụ trách: Người 1 (TV1) — Task 11, 12
 *
 * Phụ thuộc: loadData.js, components.js (TV1); feed.js (bài viết) — nạp trước home.js.
 */

/* Task 12 - Tướng nổi bật: KHÔNG hard-code, đọc từ data/heroes.json */
async function renderFeaturedHeroes() {
    const container = document.getElementById('featured-heroes');
    if (!container) return;

    const heroes = await loadData(DATA_PATH.heroes);
    const featured = heroes.slice(0, 8);

    container.innerHTML = featured.length
        ? featured.map(renderHeroCard).join('')
        : renderNotFound('Chưa có dữ liệu tướng nổi bật.');

    refreshFavoriteButtons();
}

async function renderFeaturedItems() {
    const container = document.getElementById('featured-items');
    if (!container) return;

    const items = await loadData(DATA_PATH.items);
    const featured = items.slice(0, 8);

    container.innerHTML = featured.length
        ? featured.map(renderItemCard).join('')
        : renderNotFound('Chưa có dữ liệu trang bị nổi bật.');

    refreshFavoriteButtons();
}

/* Khối xem nhanh vài bài viết mới nhất của Cộng đồng */
async function renderLatestPosts() {
    const container = document.getElementById('latest-posts');
    if (!container) return;

    await seedPostsFromJson();

    const posts = getPosts().slice(0, 3);

    container.innerHTML = posts.length
        ? posts.map((post) => `
            <a class="post-preview" href="/pages/feed.html">
                <h3>${escapeHtml(post.title)}</h3>
                <p>${escapeHtml(post.content.slice(0, 110))}${post.content.length > 110 ? '...' : ''}</p>
                <span class="post-preview__meta">${escapeHtml(post.author)} · ${formatDateTime(post.createdAt)}</span>
            </a>
        `).join('')
        : renderNotFound('Chưa có bài viết nào trong cộng đồng.');
}

document.addEventListener('DOMContentLoaded', () => {
    renderFeaturedHeroes();
    renderFeaturedItems();
    renderLatestPosts();
});
