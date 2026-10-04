/**
 * hero.js - Danh sách + Chi tiết Tướng (pages/heroes.html, pages/hero-detail.html)
 * Phụ trách: Người 2
 *
 * Dùng lại của Người 1: loadData(), renderHeroCard(), renderNotFound(), imageUrl(),
 * escapeHtml(), handleImageError() (components.js), DATA_PATH (config.js).
 * Dùng lại của Người 4: matchKeyword(), getQueryParam() (search.js).
 *
 * Lọc và sắp xếp (chỉ có ở trang Danh sách tướng, thanh lọc nằm ở #hero-filter-bar):
 *   - lọc theo vai trò, độ khó và tìm theo tên (getFilteredHeroes)
 *   - sắp xếp theo tên A → Z hoặc Z → A, thêm lựa chọn "Mặc định" giữ nguyên
 *     thứ tự trong heroes.json (sortHeroes)
 *   - cách sắp xếp được ghi lên URL (?sort=name-asc) nên F5 không mất bộ lọc;
 *     đọc lại bằng getQueryParam()
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

/* ---------- Cách sắp xếp danh sách tướng ---------- */
const HERO_SORT_DEFAULT = "default";
const HERO_SORT_NAME_ASC = "name-asc";
const HERO_SORT_NAME_DESC = "name-desc";

const HERO_SORT_LABELS = {
    [HERO_SORT_DEFAULT]: "Mặc định",
    [HERO_SORT_NAME_ASC]: "Tên A → Z",
    [HERO_SORT_NAME_DESC]: "Tên Z → A",
};

/**
 * Số tướng hiển thị trên 1 trang = 4 cột × 3 dòng.
 * Giống hằng số ITEM_PAGE_SIZE của trang danh sách trang bị để 2 trang
 * có cùng nhịp phân trang. Muốn mỗi trang nhiều/ít hơn thì chỉ sửa ở đây.
 */
const HERO_PAGE_SIZE = 12;

/**
 * Sắp xếp danh sách tướng theo cách đã chọn.
 * "Mặc định" thì giữ nguyên thứ tự trong heroes.json.
 * A → Z và Z → A so tên bằng localeCompare("vi") nên không phân biệt hoa/thường
 * và đặt chữ có dấu đúng theo thứ tự tiếng Việt (vd "Á" đứng trước "B").
 * Hai tướng trùng tên thì giữ nguyên thứ tự cũ (Array.prototype.sort ổn định).
 *
 * @param {Array} list danh sách tướng cần sắp xếp (không sửa mảng gốc).
 * @param {string} sort một trong HERO_SORT_LABELS, giá trị lạ thì coi như "mặc định".
 * @returns {Array} mảng mới đã sắp xếp.
 */
function sortHeroes(list, sort) {
    const sorted = Array.isArray(list) ? list.slice() : [];

    if (sort === HERO_SORT_NAME_ASC || sort === HERO_SORT_NAME_DESC) {
        const direction = sort === HERO_SORT_NAME_ASC ? 1 : -1;

        sorted.sort((a, b) => direction * String(a?.name || "").localeCompare(String(b?.name || ""), "vi", { sensitivity: "base" }));
    }

    return sorted;
}

/**
 * Ghi cách sắp xếp lên URL (không tải lại trang) để F5 không mất bộ lọc.
 * Bỏ tham số rỗng cho URL gọn, và giữ lại tham số khác của trang (vd ?keyword=).
 * Vai trò / độ khó vốn không nằm trên URL nên không đụng tới.
 * @param {object} state trạng thái lọc hiện tại.
 */
function syncHeroFilterUrl(state) {
    const params = new URLSearchParams(window.location.search);

    if (state.sort && state.sort !== HERO_SORT_DEFAULT) params.set("sort", state.sort);
    else params.delete("sort");

    const query = params.toString();

    history.replaceState(null, "", query ? `${BASE_PATH}src/pages/heroes.html?${query}` : `${BASE_PATH}src/pages/heroes.html`);
}

/**
 * Trang Danh sách tướng (heroes.html) - render toàn bộ tướng trong heroes.json
 */
function initHeroListPage(heroes) {
    const filterBarEl = document.getElementById("hero-filter-bar");
    const gridContainer = document.getElementById("hero-list");
    const paginationEl = document.getElementById("hero-pagination");
    const countEl = document.getElementById("hero-count");

    if (!gridContainer) return;

    // Từ khoá có thể đến từ ô tìm kiếm trên header: heroes.html?keyword=valhein
    // Cách sắp xếp cũng đọc từ URL: heroes.html?sort=name-asc
    const state = {
        role: "all",
        difficulty: "all",
        keyword: getQueryParam("keyword"),
        // Chỉ nhận cách sắp xếp có thật trong HERO_SORT_LABELS, giá trị lạ trên
        // URL thì rơi về "mặc định" (giữ nguyên thứ tự trong heroes.json).
        sort: HERO_SORT_LABELS[getQueryParam("sort")] ? getQueryParam("sort") : HERO_SORT_DEFAULT,
        // Trang đang xem, luôn bắt đầc từ 1 (giống trang danh sách trang bị).
        page: 1,
    };

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
                <select class="filter-bar__select" id="hero-sort-filter" aria-label="Sắp xếp tướng">
                    ${Object.keys(HERO_SORT_LABELS)
                        .map((sort) => `<option value="${sort}">${escapeHtml(HERO_SORT_LABELS[sort])}</option>`)
                        .join("")}
                </select>
            </div>
        `;
    }

    const searchInput = document.getElementById("hero-search");
    const roleFilter = document.getElementById("hero-role-filter");
    const difficultyFilter = document.getElementById("hero-difficulty-filter");
    const sortFilter = document.getElementById("hero-sort-filter");

    if (searchInput) searchInput.value = state.keyword;
    if (sortFilter) sortFilter.value = state.sort;

    const getFilteredHeroes = () => {
        const list = heroes.filter((hero) => {
            const matchesRole = state.role === "all" || (hero.role || []).includes(state.role);
            const matchesDifficulty = state.difficulty === "all" || String(hero.difficulty) === String(state.difficulty);
            const matchesSearch = matchKeyword(hero.name, state.keyword);

            return matchesRole && matchesDifficulty && matchesSearch;
        });

        return sortHeroes(list, state.sort);
    };

    const render = () => {
        const filtered = getFilteredHeroes();

        // Tổng số trang: luôn ít nhất 1 để trang rỗng vẫn không lỗi phép chia.
        const totalPages = Math.max(1, Math.ceil(filtered.length / HERO_PAGE_SIZE));
        // Lọc xong danh sách có thể ngắn lại (vd đang ở trang 3 rồi lọc còn 1 trang),
        // kẹp lại để không render ra trang trống.
        state.page = Math.min(Math.max(1, state.page), totalPages);

        // Đếm kết quả: không lọc thì "30 tướng", có lọc thì "3/30 tướng".
        if (countEl) {
            countEl.textContent = filtered.length === heroes.length
                ? `${filtered.length} tướng`
                : `${filtered.length}/${heroes.length} tướng`;
        }

        // Cắt đúng 1 trang hiện tại ra khỏi danh sách đã lọc + sắp xếp.
        const pageItems = filtered.slice((state.page - 1) * HERO_PAGE_SIZE, state.page * HERO_PAGE_SIZE);

        gridContainer.innerHTML = pageItems.length
            ? pageItems.map(renderHeroCard).join("")
            : renderNotFound("Không tìm thấy tướng phù hợp!");

        renderHeroPagination(paginationEl, totalPages, state.page);

        if (typeof refreshFavoriteButtons === "function") refreshFavoriteButtons();
    };

    if (searchInput) {
        // Đổi từ khoá là kết quả đổi theo -> luôn quay về trang 1.
        searchInput.addEventListener("input", () => {
            state.keyword = searchInput.value;
            state.page = 1;
            render();
        });
    }
    if (roleFilter) {
        roleFilter.addEventListener("change", () => {
            state.role = roleFilter.value;
            state.page = 1;
            render();
        });
    }
    if (difficultyFilter) {
        difficultyFilter.addEventListener("change", () => {
            state.difficulty = difficultyFilter.value;
            state.page = 1;
            render();
        });
    }
    if (sortFilter) {
        sortFilter.addEventListener("change", () => {
            // Trình duyệt trả về chuỗi rỗng nếu giá trị không khớp option nào,
            // khi đó quay về "mặc định" cho an toàn.
            const picked = sortFilter.value;
            state.sort = HERO_SORT_LABELS[picked] ? picked : HERO_SORT_DEFAULT;
            sortFilter.value = state.sort;
            // Sắp xếp lại cũng là danh sách mới, giữ nguyên quy ước quay về trang 1.
            state.page = 1;
            syncHeroFilterUrl(state);
            render();
        });
    }
    if (paginationEl) {
        // Thân phân trang được vẽ lại mỗi lần render nên dùng event delegation.
        paginationEl.addEventListener("click", (event) => {
            const pageBtn = event.target.closest("[data-page]");
            if (!pageBtn) return;

            const pickedPage = Number(pageBtn.dataset.page);
            if (!Number.isFinite(pickedPage) || pickedPage === state.page) return;

            state.page = pickedPage;
            render();
            // Cuộn lên đầu lưới để không phải cuộn ngược tìm vị trí mới.
            gridContainer.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    render();
}

/**
 * Vẽ thanh phân trang dưới lưới tướng.
 * Dùng lại class .pagination / .pagination__item đã có sẵn ở common.css.
 * Chỉ 1 trang thì không vẽ gì cho gọn (giống trang danh sách trang bị).
 *
 * @param {Element|null} paginationEl - #hero-pagination
 * @param {number} totalPages tổng số trang
 * @param {number} currentPage trang đang xem
 */
function renderHeroPagination(paginationEl, totalPages, currentPage) {
    if (!paginationEl) return;

    paginationEl.innerHTML = totalPages > 1
        ? `<div class="pagination">${Array.from({ length: totalPages }, (_, index) => {
            const page = index + 1;
            const isActive = page === currentPage;

            return `<button
                type="button"
                class="pagination__item${isActive ? " is-active" : ""}"
                data-page="${page}"
                aria-label="Trang ${page}"
                aria-current="${isActive ? "page" : "false"}"
            >${page}</button>`;
        }).join("")}</div>`
        : "";
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
