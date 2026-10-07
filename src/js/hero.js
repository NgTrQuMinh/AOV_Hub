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

/* ---------- Nhãn chỉ số cơ bản của tướng ---------- */

/**
 * Nhãn tiếng Việt cho các chỉ số trong hero.stats (heroes.json).
 * Thứ tự key cũng chính là thứ tự hiển thị của 4 dòng trong bảng "Chỉ số cơ bản".
 * Muốn đổi tên hiển thị (vd "Tốc độ" → "Tốc độ đánh") chỉ cần sửa ở đúng chỗ này,
 * không phải đụng vào phần render bên dưới.
 */
const HERO_STAT_LABELS = {
    hp: "Máu",
    attack: "Sát thương",
    defense: "Giáp",
    speed: "Tốc độ",
};

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Xác định trang hiện tại
    const isDetailPage = window.location.pathname.includes("hero-detail.html");

    // 2. Tải dữ liệu từ heroes.json
    let heroes = [];
    try {
        heroes = await loadHeroes();
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
        page: Number(getQueryParam("page")) > 0 ? Math.floor(Number(getQueryParam("page"))) : 1,
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

    const HERO_PER_PAGE = 12;

    const getFilteredHeroes = () => {
        const list = heroes.filter((hero) => {
            const matchesRole = state.role === "all" || (hero.role || []).includes(state.role);
            const matchesDifficulty = state.difficulty === "all" || String(hero.difficulty) === String(state.difficulty);
            const matchesSearch = matchKeyword(hero.name, state.keyword);

            return matchesRole && matchesDifficulty && matchesSearch;
        });

        return sortHeroes(list, state.sort);
    };

    const syncHeroFilterUrl = (currentState) => {
        const params = new URLSearchParams(window.location.search);

        if (currentState.sort && currentState.sort !== HERO_SORT_DEFAULT) params.set("sort", currentState.sort);
        else params.delete("sort");

        if (currentState.keyword) params.set("keyword", currentState.keyword);
        else params.delete("keyword");

        if (currentState.page && currentState.page > 1) params.set("page", String(currentState.page));
        else params.delete("page");

        const query = params.toString();

        history.replaceState(null, "", query ? `${BASE_PATH}src/pages/heroes.html?${query}` : `${BASE_PATH}src/pages/heroes.html`);
    };

    const renderPagination = (total, perPage, currentPage) => {
        const totalPages = Math.ceil(total / perPage) || 1;
        let page = currentPage;
        if (page > totalPages) page = totalPages;
        if (page < 1) page = 1;
        state.page = page;

        const paginationEl = document.getElementById("hero-pagination");
        if (!paginationEl) return;

        // Cùng kiểu với trang Danh sách trang bị: các ô số nằm trong .pagination
        // (flex, căn giữa) và ẩn luôn khi chỉ có 1 trang.
        paginationEl.innerHTML = totalPages > 1
            ? `<div class="pagination">${Array.from({ length: totalPages }, (_, index) => {
                const pageNumber = index + 1;

                return `<button
                    type="button"
                    class="pagination__item${pageNumber === page ? " is-active" : ""}"
                    data-page="${pageNumber}"
                    aria-label="Trang ${pageNumber}"
                    aria-current="${pageNumber === page ? "page" : "false"}"
                >${pageNumber}</button>`;
            }).join("")}</div>`
            : "";
    };

    const renderGrid = (list) => {
        gridContainer.innerHTML = list.length
            ? list.map(renderHeroCard).join("")
            : renderNotFound("Không tìm thấy tướng phù hợp!");

        if (typeof refreshFavoriteButtons === "function") refreshFavoriteButtons();
    };

    const render = () => {
        const filtered = getFilteredHeroes();
        const total = filtered.length;
        const perPage = HERO_PER_PAGE;
        let page = state.page;
        const totalPages = Math.ceil(total / perPage) || 1;
        if (page > totalPages) page = totalPages;
        if (page < 1) page = 1;
        state.page = page;

        const start = (page - 1) * perPage;
        const paged = filtered.slice(start, start + perPage);

        renderGrid(paged);
        renderPagination(total, perPage, page);
        syncHeroFilterUrl(state);

        const countEl = document.getElementById("hero-count");
        if (countEl) {
            if (state.keyword || state.role !== "all" || state.difficulty !== "all") {
                // Tổng số tướng đọc từ dữ liệu (đã gồm tướng admin thêm), không hard-code.
                countEl.textContent = `${total}/${heroes.length} tướng`;
            } else {
                countEl.textContent = `${total} tướng`;
            }
        }
    };

    if (searchInput) {
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
            state.page = 1;
            render();
        });
    }

    // Phân trang dùng event delegation (giống trang Danh sách trang bị) vì thanh
    // được vẽ lại mỗi lần render, gắn sự kiện riêng cho từng nút sẽ bị mất.
    const paginationEl = document.getElementById("hero-pagination");
    if (paginationEl) {
        paginationEl.addEventListener("click", (event) => {
            const pageBtn = event.target.closest("[data-page]");
            if (!pageBtn) return;

            state.page = Number(pageBtn.dataset.page);
            render();
        });
    }

    render();
}

/**
 * Bảng "Chỉ số cơ bản" của 1 tướng.
 *
 * heroes.json chỉ có 4 chỉ số: hp / attack / defense / speed, nên bảng cố định
 * đúng 4 dòng theo thứ tự key của HERO_STAT_LABELS (không liệt kê thêm key lạ
 * để bảng luôn dễ đọc). Chỉ số không có trong JSON hiện "N/A" thay vì để trống,
 * để người đọc biết chắc là dữ liệu thiếu chứ không phải giá trị bằng 0.
 *
 * @param {object} hero - object theo schema heroes.json (dùng hero.stats).
 * @returns {string} HTML string (chỉ chứa <table>, tiêu đề <h2> do bên gọi render).
 */
function renderHeroStatsTable(hero) {
    // stats có thể thiếu hoặc không phải object -> coi như rỗng, vẫn ra đủ 4 dòng N/A.
    const stats = hero?.stats && typeof hero.stats === "object" && !Array.isArray(hero.stats)
        ? hero.stats
        : {};

    const rows = Object.keys(HERO_STAT_LABELS)
        .map((key) => {
            const rawValue = stats[key];
            // undefined / null / "" đều nghĩa là JSON không có chỉ số này.
            const isMissing = rawValue === undefined || rawValue === null || rawValue === "";
            // escapeHtml áp dụng cho cả 2 nhánh: dữ liệu JSON và chuỗi "N/A".
            const valueText = isMissing ? "N/A" : String(rawValue);

            return `
                <tr class="hero-stats-table__row">
                    <th scope="row" class="hero-stats-table__label">${escapeHtml(HERO_STAT_LABELS[key])}</th>
                    <td class="hero-stats-table__value">${escapeHtml(valueText)}</td>
                </tr>
            `;
        })
        .join("");

    return `
        <table class="hero-stats-table">
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

/**
 * Bảng "Bộ kỹ năng" của 1 tướng: 4 cột Kỹ năng / Loại / Mô tả / Hồi chiêu.
 *
 * Cột Hồi chiêu đọc từ skill.cooldown: có số thì thêm đơn vị "s" (vd 9 → "9s"),
 * thiếu thì hiện "—" để phân biệt với kỹ năng hồi 0 giây.
 * Giữ class "skill-item" trên mỗi <tr> cho khớp với CSS của P4.
 *
 * @param {object} hero - object theo schema heroes.json (dùng hero.skills).
 * @returns {string} HTML string.
 */
function renderHeroSkillsTable(hero) {
    const skills = Array.isArray(hero?.skills) ? hero.skills : [];

    // Tướng chưa có kỹ năng trong JSON: hiện 1 dòng báo trống, không dựng bảng rỗng.
    if (!skills.length) {
        return '<p class="hero-skills__empty">Tướng này chưa có dữ liệu kỹ năng.</p>';
    }

    const rows = skills
        .map((skill) => {
            const rawCooldown = skill?.cooldown;
            const hasCooldown = rawCooldown !== undefined && rawCooldown !== null && rawCooldown !== "";
            // Có cooldown (kể cả 0) thì ghi kèm đơn vị "s", còn không thì dùng "—".
            const cooldownText = hasCooldown ? `${rawCooldown}s` : "—";
            // skill.type là loại kỹ năng ("Chiêu 1"...); fallback sang skill.key cho dữ liệu cũ.
            const typeText = skill?.type || skill?.key || "";

            return `
                <tr class="skill-item">
                    <th scope="row" class="skill-item__name">${escapeHtml(skill?.name || "")}</th>
                    <td class="skill-item__type">${escapeHtml(typeText)}</td>
                    <td class="skill-item__desc">${escapeHtml(skill?.description || "")}</td>
                    <td class="skill-item__cooldown">${escapeHtml(cooldownText)}</td>
                </tr>
            `;
        })
        .join("");

    return `
        <table class="hero-skills-table">
            <thead>
                <tr>
                    <th scope="col">Kỹ năng</th>
                    <th scope="col">Loại</th>
                    <th scope="col">Mô tả</th>
                    <th scope="col">Hồi chiêu</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

/**
 * Trang Chi tiết tướng (hero-detail.html)
 *
 * @param {Array} heroes - toàn bộ dữ liệu heroes.json đã nạp ở DOMContentLoaded.
 */
async function initHeroDetailPage(heroes) {
    // 1. Id tướng lấy từ query string: hero-detail.html?id=1
    //    Chuẩn hoá về chuỗi + trim vì id trong JSON là số còn trên URL là chuỗi.
    const heroId = String(getQueryParam("id") ?? "").trim();

    // 2. hero-detail.html đặt id là "hero-detail", giữ cả "hero-detail-container" cho chắc.
    const detailContainer = document.getElementById("hero-detail")
        || document.getElementById("hero-detail-container");

    if (!detailContainer) return;

    // 3. loadData() trả về mảng rỗng khi fetch lỗi / JSON hỏng.
    //    Trường hợp này báo "Không tải được dữ liệu", KHÔNG báo "Tướng không tồn tại!"
    //    để không khiến người dùng tưởng link sai.
    if (!Array.isArray(heroes) || heroes.length === 0) {
        detailContainer.innerHTML = renderNotFound("Không tải được dữ liệu");
        return;
    }

    // 4. Dữ liệu đã tải thành công: chỉ khi không có id nào khớp (kể cả thiếu id trên URL)
    //    mới báo "Tướng không tồn tại!".
    const hero = heroes.find((row) => String(row.id) === heroId);

    if (!hero) {
        detailContainer.innerHTML = renderNotFound("Tướng không tồn tại!");
        return;
    }

    // 5. Ghi lại tướng vừa xem vào lịch sử (favorite.js đọc để vẽ tab "Lịch sử").
    if (typeof addHistory === "function") addHistory(hero.id);

    // 6. recommendedBuild trong heroes.json là mảng id trang bị, cần tra items.json.
    //    items.json lỗi thì loadData trả [] => buildItems rỗng => hiện "chưa có trang bị đề xuất".
    const items = await loadData(DATA_PATH.items);
    const buildItems = (hero.recommendedBuild || [])
        .map((itemId) => items.find((item) => item.id === itemId))
        .filter(Boolean);

    // 7. Đổi tiêu đề tab trình duyệt theo tên tướng (document.title là text nên không cần escapeHtml).
    document.title = "AOV HUB - " + hero.name;

    // 8. Vai trò: mỗi vai trò trong hero.role thành 1 badge.
    const roles = (hero.role || [])
        .map((role) => `<span class="badge">${escapeHtml(role)}</span>`)
        .join("");

    // Độ khó thiếu trong JSON thì không vẽ badge, tránh hiện chữ "Độ khó undefined".
    const hasDifficulty = hero.difficulty !== undefined && hero.difficulty !== null && hero.difficulty !== "";
        const difficultyText = (typeof DIFFICULTY_LABEL !== "undefined" && DIFFICULTY_LABEL[hero.difficulty]) || `Độ khó ${hero.difficulty}`;
        const difficultyBadge = hasDifficulty
            ? `<span class="badge ${(typeof DIFFICULTY_BADGE_CLASS !== "undefined" && DIFFICULTY_BADGE_CLASS[hero.difficulty]) || ""}">${escapeHtml(difficultyText)}</span>`
            : "";

    detailContainer.innerHTML = `
        <!-- Link quay lại trang danh sách, luôn hiện kể cả khi tướng không có build -->
        <p class="hero-detail__back">
            <a class="hero-detail__back-link" href="${BASE_PATH}src/pages/heroes.html">← Danh sách tướng</a>
        </p>

        <div class="hero-detail-header">
            <img
                src="${escapeHtml(imageUrl(hero.image))}"
                alt="${escapeHtml(hero.name)}"
                class="hero-large-img"
                onerror="handleImageError(this)"
            >
            <div class="hero-info">
                <h1>${escapeHtml(hero.name)}</h1>
                <div class="hero-info__meta">
                    ${roles}
                    ${difficultyBadge}
                    <!--
                        Nút yêu thích dùng đúng markup dùng chung của favorite.js
                        (.btn-favorite + data-type/data-id). Không gắn sự kiện click ở đây vì
                        favorite.js đã dùng event delegation trên document.
                    -->
                    <button
                        type="button"
                        class="btn-favorite"
                        data-type="hero"
                        data-id="${escapeHtml(hero.id)}"
                        aria-label="Thêm/bỏ yêu thích"
                    ><span aria-hidden="true">♥</span></button>
                </div>
            </div>
        </div>

        <div class="hero-stats">
            <h2>Chỉ số cơ bản</h2>
            ${renderHeroStatsTable(hero)}
        </div>

        <div class="hero-skills">
            <h2>Bộ kỹ năng</h2>
            ${renderHeroSkillsTable(hero)}
        </div>

        <div class="hero-build">
            <h2>Trang bị đề xuất</h2>
            <div class="build-items">
                ${buildItems.length
                    ? buildItems.map((item) => `
                        <a class="build-item" href="${BASE_PATH}src/pages/item-detail.html?id=${escapeHtml(item.id)}">
                            <img src="${escapeHtml(imageUrl(item.image))}" alt="${escapeHtml(item.name)}" onerror="handleImageError(this)">
                            <span>${escapeHtml(item.name)}</span>
                        </a>
                    `).join("")
                    : renderNotFound("Tướng này chưa có trang bị đề xuất.")}
            </div>
        </div>
    `;

    // 9. Nút yêu thích vừa được vẽ ra cần đồng bộ trạng thái ♥ (đã yêu thích hay chưa).
    if (typeof refreshFavoriteButtons === "function") refreshFavoriteButtons();
}
