/**
 * hero.js - Danh sách + Chi tiết Tướng (pages/heroes.html, pages/hero-detail.html)
 * Phụ trách: Người 2
 *
 * Dùng lại của Người 1: loadData(), renderHeroCard(), renderNotFound(), imageUrl(),
 * escapeHtml(), handleImageError() (components.js), DATA_PATH (config.js).
 * Dùng lại của Người 4: matchKeyword(), getQueryParam() (search.js).
 */

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Xác định trang hiện tại
    const isDetailPage = window.location.pathname.includes("hero-detail.html");

    // 2. Tải dữ liệu từ heroes.json
    let heroes = [];
    try {
        heroes = await loadData(DATA_PATH.heroes);
    } catch (error) {
        console.error("Lỗi khi tải dữ liệu tướng:", error);
        return;
    }

    // 3. Điều hướng xử lý
    if (isDetailPage) {
        initHeroDetailPage(heroes);
    } else {
        initHeroListPage(heroes);
    }
});

const HERO_PAGE_SIZE = 12;

/**
 * Trang Danh sách tướng (heroes.html)
 */
function initHeroListPage(heroes) {
    const filterBarEl = document.getElementById("hero-filter-bar");
    const gridContainer = document.getElementById("hero-list");
    const paginationEl = document.getElementById("hero-pagination");

    if (!gridContainer) return;

    // Từ khoá có thể đến từ ô tìm kiếm trên header: heroes.html?keyword=valhein
    const state = { role: "all", difficulty: "all", keyword: getQueryParam("keyword"), page: 1 };


    if (filterBarEl) {
        const roles = [...new Set(heroes.flatMap((h) => h.role || []))];
        const difficulties = [...new Set(heroes.map((h) => h.difficulty))].sort((a, b) => a - b);

        filterBarEl.innerHTML = `
            <div class="filter-bar">
                <input
                    type="search"
                    class="filter-bar__keyword"
                    id="hero-search"
                    placeholder="Tìm tướng theo tên..."
                    aria-label="Tìm tướng"
                >
                <select class="filter-bar__select" id="hero-role-filter" aria-label="Lọc theo vai trò">
                    <option value="all">Tất cả vai trò</option>
                    ${roles.map((r) => `<option value="${r}">${r}</option>`).join("")}
                </select>
                <select class="filter-bar__select" id="hero-difficulty-filter" aria-label="Lọc theo độ khó">
                    <option value="all">Tất cả độ khó</option>
                    ${difficulties.map((d) => `<option value="${d}">${DIFFICULTY_LABEL[d] || `Độ khó ${d}`}</option>`).join("")}
                </select>
            </div>
        `;
    }

    const searchInput = document.getElementById("hero-search");
    const roleFilter = document.getElementById("hero-role-filter");
    const difficultyFilter = document.getElementById("hero-difficulty-filter");

    if (searchInput) searchInput.value = state.keyword;

    const getFilteredHeroes = () => {
        return heroes.filter((hero) => {
            const matchesRole = state.role === "all" || (hero.role || []).includes(state.role);
            const matchesDifficulty = state.difficulty === "all" || String(hero.difficulty) === String(state.difficulty);
            const matchesSearch = matchKeyword(hero.name, state.keyword);

            return matchesRole && matchesDifficulty && matchesSearch;
        });
    };

    const renderGrid = (list) => {
        gridContainer.innerHTML = list.length
            ? list.map(renderHeroCard).join("")
            : renderNotFound("Không tìm thấy tướng phù hợp!");

        if (typeof refreshFavoriteButtons === "function") refreshFavoriteButtons();
    };

    const renderPagination = (total) => {
        if (!paginationEl) return;
        const totalPages = Math.max(1, Math.ceil(total / HERO_PAGE_SIZE));
        state.page = Math.min(state.page, totalPages);

        paginationEl.innerHTML = totalPages > 1
            ? Array.from({ length: totalPages }, (_, i) => {
                const page = i + 1;
                return `<button type="button" class="pagination__item${page === state.page ? " is-active" : ""}" data-page="${page}" aria-label="Trang ${page}">${page}</button>`;
            }).join("")
            : "";
    };

    const render = () => {
        const list = getFilteredHeroes();
        renderPagination(list.length);
        renderGrid(list.slice((state.page - 1) * HERO_PAGE_SIZE, state.page * HERO_PAGE_SIZE));
    };

    if (searchInput) {
        searchInput.addEventListener("input", () => { state.keyword = searchInput.value; state.page = 1; render(); });
    }
    if (roleFilter) {
        roleFilter.addEventListener("change", () => { state.role = roleFilter.value; state.page = 1; render(); });
    }
    if (difficultyFilter) {
        difficultyFilter.addEventListener("change", () => { state.difficulty = difficultyFilter.value; state.page = 1; render(); });
    }
    if (paginationEl) {
        paginationEl.addEventListener("click", (event) => {
            const btn = event.target.closest("[data-page]");
            if (!btn) return;
            state.page = Number(btn.dataset.page);
            render();
            gridContainer.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    render();
}

/**
 * Trang Chi tiết tướng (hero-detail.html)
 */
async function initHeroDetailPage(heroes) {
    const heroId = getQueryParam("id");

    const hero = heroes.find((h) => String(h.id) === String(heroId));
    // hero-detail.html đặt id là "hero-detail", giữ cả "hero-detail-container" cho chắc.
    const detailContainer = document.getElementById("hero-detail")
        || document.getElementById("hero-detail-container");

    if (!detailContainer) return;

    if (!hero) {
        detailContainer.innerHTML = renderNotFound("Tướng không tồn tại!");
        return;
    }

    if (typeof addHistory === "function") addHistory(hero.id);

    // recommendedBuild trong heroes.json là mảng id trang bị, cần tra items.json
    const items = await loadData(DATA_PATH.items);
    const buildItems = (hero.recommendedBuild || [])
        .map((itemId) => items.find((item) => item.id === itemId))
        .filter(Boolean);

    const roles = (hero.role || []).map((role) => `<span class="badge">${escapeHtml(role)}</span>`).join("");
    const difficultyText = DIFFICULTY_LABEL[hero.difficulty] || `Độ khó ${hero.difficulty}`;

    detailContainer.innerHTML = `
        <div class="hero-detail-header">
            <img src="${imageUrl(hero.image)}" alt="${escapeHtml(hero.name)}" class="hero-large-img" onerror="handleImageError(this)">
            <div class="hero-info">
                <h1>${escapeHtml(hero.name)}</h1>
                <p class="hero-title">${escapeHtml(hero.title || "")}</p>
                <p class="hero-info__meta">${roles} <span class="badge ${DIFFICULTY_BADGE_CLASS[hero.difficulty] || ""}">${escapeHtml(difficultyText)}</span></p>
            </div>
        </div>

        <div class="hero-stats">
            <h2>Chỉ số cơ bản</h2>
            <ul>
                <li>Máu: ${hero.stats?.hp ?? "N/A"}</li>
                <li>Sát thương: ${hero.stats?.attack ?? "N/A"}</li>
                <li>Giáp: ${hero.stats?.defense ?? "N/A"}</li>
                <li>Tốc độ đánh: ${hero.stats?.speed ?? "N/A"}</li>
            </ul>
        </div>

        <div class="hero-skills">
            <h2>Bộ kỹ năng</h2>
            <div class="skills-list">
                ${(hero.skills || []).map((skill) => `
                    <div class="skill-item">
                        ${skill.icon ? `<img src="${imageUrl(skill.icon)}" alt="${escapeHtml(skill.name)}" onerror="handleImageError(this)">` : ""}
                        <div>
                            <h4>${escapeHtml(skill.name)} <em>${escapeHtml(skill.type || skill.key || "")}</em></h4>
                            <p>${escapeHtml(skill.description || "")}</p>
                        </div>
                    </div>
                `).join("")}
            </div>
        </div>

        <div class="hero-build">
            <h2>Trang bị đề xuất</h2>
            <div class="build-items">
                ${buildItems.length
                    ? buildItems.map((item) => `
                        <a class="build-item" href="${BASE_PATH}src/pages/item-detail.html?id=${item.id}">
                            <img src="${imageUrl(item.image)}" alt="${escapeHtml(item.name)}" onerror="handleImageError(this)">
                            <span>${escapeHtml(item.name)}</span>
                        </a>
                    `).join("")
                    : renderNotFound("Tướng này chưa có trang bị đề xuất.")}
            </div>
        </div>
    `;

    if (typeof refreshFavoriteButtons === "function") refreshFavoriteButtons();
}
