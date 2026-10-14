/**
 * search-page.js - Trang Tìm kiếm toàn cục (src/pages/search.html)
 *
 * Ô tìm kiếm trên Header (partials/header.html) giờ trỏ về trang này thay vì
 * chỉ chuyển sang danh sách Tướng. Trang gom kết quả từ 4 nguồn dữ liệu công khai:
 *   - Tướng    (heroes.json, qua loadHeroes của heroData.js)
 *   - Trang bị (items.json)
 *   - Build    (builds.json)
 *   - Bài viết (posts.json, chỉ hiện bài đã duyệt và không bị ẩn)
 *
 * Từ khoá đọc từ ?keyword= (đúng định dạng ô Header gửi lên), so khớp không phân
 * biệt hoa/thường và không phân biệt dấu nhờ matchKeyword() của search.js nên gõ
 * "tel anna" vẫn ra Tel'Annas. Gõ lại trong ô trên trang sẽ cập nhật lại ?keyword=
 * (F5 không mất) và render lại ngay (debounce 250ms).
 *
 * Dùng lại: escapeHtml()/renderHeroCard()/renderItemCard()/renderNotFound() (components.js),
 * loadData() (loadData.js), loadHeroes() (heroData.js), DATA_PATH (config.js),
 * matchKeyword()/debounce()/getQueryParam()/normalizeKeyword() (search.js),
 * refreshFavoriteButtons() (favorite.js).
 */

let searchHeroes = [];
let searchItems = [];
let searchBuilds = [];
let searchPosts = [];
let searchKeyword = '';

document.addEventListener('DOMContentLoaded', initSearchPage);

async function initSearchPage() {
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;

    searchKeyword = getQueryParam('keyword');

    const [heroes, items, builds, posts] = await Promise.all([
        loadHeroes(),
        loadData(DATA_PATH.items),
        loadData(DATA_PATH.builds),
        loadData(DATA_PATH.posts),
    ]);

    searchHeroes = Array.isArray(heroes) ? heroes : [];
    searchItems = Array.isArray(items) ? items : [];
    searchBuilds = Array.isArray(builds) ? builds : [];
    searchPosts = Array.isArray(posts) ? posts : [];

    renderSearchBar();
    renderSearchResults();
}

/* ---------- Ô tìm kiếm trên trang ---------- */

function renderSearchBar() {
    const bar = document.getElementById('search-bar');
    if (!bar) return;

    bar.className = 'filter-bar';
    bar.innerHTML = `
        <input
            class="filter-bar__keyword"
            type="search"
            id="search-keyword"
            placeholder="Tìm tướng, trang bị, build, bài viết..."
            aria-label="Tìm kiếm toàn cục"
            value="${escapeHtml(searchKeyword)}"
        >
    `;

    const input = document.getElementById('search-keyword');

    input.addEventListener('input', debounce(() => {
        searchKeyword = input.value;
        syncSearchUrl();
        renderSearchResults();
    }, 250));
}

/** Ghi từ khoá lên URL để F5 giữ nguyên kết quả tìm. */
function syncSearchUrl() {
    const params = new URLSearchParams(window.location.search);

    if (normalizeKeyword(searchKeyword)) params.set('keyword', searchKeyword);
    else params.delete('keyword');

    const query = params.toString();

    history.replaceState(null, '', query
        ? `${BASE_PATH}src/pages/search.html?${query}`
        : `${BASE_PATH}src/pages/search.html`);
}

/* ---------- Lọc từng nhóm dữ liệu ---------- */

function filterHeroes() {
    return searchHeroes.filter((hero) =>
        matchKeyword(`${hero.name} ${(hero.role || []).join(' ')}`, searchKeyword));
}

function filterItems() {
    return searchItems.filter((item) =>
        matchKeyword(`${item.name} ${item.type || ''}`, searchKeyword));
}

function findBuildHero(build) {
    return searchHeroes.find((hero) => hero.id === build.heroId);
}

function filterBuilds() {
    return searchBuilds.filter((build) => {
        const hero = findBuildHero(build);
        return matchKeyword(`${build.name} ${hero ? hero.name : ''}`, searchKeyword);
    });
}

function filterPosts() {
    return searchPosts.filter((post) => {
        // Bỏ bài bị ẩn và bài chưa duyệt (pending) để không lộ nội dung dở dang.
        if (!post || post.hidden) return false;
        if (post.status && post.status !== 'approved') return false;

        return matchKeyword(`${post.title || ''} ${post.author || ''} ${post.content || ''}`, searchKeyword);
    });
}

/* ---------- Render kết quả ---------- */

function renderBuildResult(build) {
    const hero = findBuildHero(build);
    const heroName = hero ? hero.name : 'Tướng chưa xác định';
    // Build không có trang chi tiết riêng: trỏ về trang Build đã lọc sẵn theo tướng.
    const href = hero
        ? `${BASE_PATH}src/pages/builds.html?keyword=${encodeURIComponent(hero.name)}`
        : `${BASE_PATH}src/pages/builds.html`;

    return `
        <a class="search-result" href="${href}">
            <span class="search-result__title">${escapeHtml(build.name)}</span>
            <span class="search-result__meta">${escapeHtml(heroName)} · ${(build.items || []).length} trang bị</span>
        </a>
    `;
}

function renderPostResult(post) {
    const meta = [post.author, post.category].filter(Boolean).join(' · ');

    return `
        <a class="search-result" href="${BASE_PATH}src/pages/post-detail.html?id=${post.id}">
            <span class="search-result__title">${escapeHtml(post.title || '')}</span>
            <span class="search-result__meta">${escapeHtml(meta)}</span>
        </a>
    `;
}

function renderSearchResults() {
    const resultsEl = document.getElementById('search-results');
    const countEl = document.getElementById('search-count');
    if (!resultsEl) return;

    // Chưa gõ gì thì không dựng cả kho dữ liệu, chỉ nhắc người dùng nhập từ khoá.
    if (!normalizeKeyword(searchKeyword)) {
        resultsEl.innerHTML = '<p class="search-hint">Nhập từ khoá để tìm tướng, trang bị, build và bài viết.</p>';
        if (countEl) countEl.textContent = '';
        return;
    }

    const groups = [
        { key: 'heroes', title: 'Tướng', rows: filterHeroes(), grid: true, render: renderHeroCard },
        { key: 'items', title: 'Trang bị', rows: filterItems(), grid: true, render: renderItemCard },
        { key: 'builds', title: 'Build đề xuất', rows: filterBuilds(), grid: false, render: renderBuildResult },
        { key: 'posts', title: 'Bài viết cộng đồng', rows: filterPosts(), grid: false, render: renderPostResult },
    ].filter((group) => group.rows.length);

    const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

    if (countEl) {
        countEl.textContent = `${total} kết quả`;
    }

    if (!total) {
        resultsEl.innerHTML = renderNotFound(`Không tìm thấy kết quả cho "${searchKeyword}".`);
        return;
    }

    resultsEl.innerHTML = groups.map((group) => `
        <section class="search-group" aria-labelledby="search-group-${group.key}">
            <h2 class="search-group__title" id="search-group-${group.key}">
                ${escapeHtml(group.title)}
                <span class="search-group__count">${group.rows.length}</span>
            </h2>
            <div class="search-group__list${group.grid ? ' grid' : ''}">
                ${group.rows.map(group.render).join('')}
            </div>
        </section>
    `).join('');

    if (typeof refreshFavoriteButtons === 'function') refreshFavoriteButtons();
}
