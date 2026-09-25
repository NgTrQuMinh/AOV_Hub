/**
 * hero.js - Danh sách + Chi tiết Tướng (pages/heroes.html, pages/hero-detail.html)
 * Phụ trách: Người 2
 */

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Xác định trang hiện tại
    const isDetailPage = window.location.pathname.includes("hero-detail.html");

    // 2. Tải dữ liệu từ heroes.json
    let heroes = [];
    try {
        heroes = await loadData(BASE_PATH + "src/data/heroes.json");
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

    const state = { role: "all", difficulty: "all", keyword: "", page: 1 };

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

    const getFilteredHeroes = () => {
        const keyword = state.keyword.trim().toLowerCase();
        return heroes.filter((hero) => {
            const matchesRole = state.role === "all" || (hero.role || []).includes(state.role);
            const matchesDifficulty = state.difficulty === "all" || String(hero.difficulty) === String(state.difficulty);
            const matchesSearch = !keyword || hero.name.toLowerCase().includes(keyword);

            return matchesRole && matchesDifficulty && matchesSearch;
        });
    };

    const renderGrid = (list) => {
        gridContainer.innerHTML = list.length
            ? list.map(renderHeroCard).join("")
            : renderNotFound("Không tìm thấy tướng phù hợp!");
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
function initHeroDetailPage(heroes) {
    const urlParams = new URLSearchParams(window.location.search);
    const heroId = urlParams.get("id");

    const hero = heroes.find((h) => String(h.id) === String(heroId));
    const detailContainer = document.getElementById("hero-detail-container");

    if (!detailContainer) return;

    if (!hero) {
        detailContainer.innerHTML = typeof renderNotFound === "function"
            ? renderNotFound("Tướng không tồn tại!")
            : "<h2>Tướng không tồn tại!</h2>";
        return;
    }

    detailContainer.innerHTML = `
        <div class="hero-detail-header">
            <img src="${hero.image || hero.avatar}" alt="${hero.name}" class="hero-large-img">
            <div class="hero-info">
                <h1>${hero.name}</h1>
                <p class="hero-title">${hero.title || ""}</p>
                <p><strong>Vai trò:</strong> ${hero.role}</p>
                <p><strong>Độ khó:</strong> ${hero.difficulty}</p>
            </div>
        </div>

        <div class="hero-stats">
            <h2>Chỉ số cơ bản</h2>
            <ul>
                <li>Máu: ${hero.stats?.hp || "N/A"}</li>
                <li>Sát thương: ${hero.stats?.attack || "N/A"}</li>
                <li>Giáp: ${hero.stats?.defense || "N/A"}</li>
                <li>Tốc độ đánh: ${hero.stats?.speed || "N/A"}</li>
            </ul>
        </div>

        <div class="hero-skills">
            <h2>Bộ kỹ năng</h2>
            <div class="skills-list">
                ${(hero.skills || []).map((skill) => `
                    <div class="skill-item">
                        <img src="${skill.icon}" alt="${skill.name}">
                        <div>
                            <h4>${skill.name} (${skill.key || ""})</h4>
                            <p>${skill.description}</p>
                        </div>
                    </div>
                `).join("")}
            </div>
        </div>

        <div class="hero-build">
            <h2>Trang bị đề xuất</h2>
            <div class="build-items">
                ${(hero.recommendedBuild || []).map((item) => `
                    <div class="build-item">
                        <img src="${item.icon}" alt="${item.name}">
                        <span>${item.name}</span>
                    </div>
                `).join("")}
            </div>
        </div>
    `;
}