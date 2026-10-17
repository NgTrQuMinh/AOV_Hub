/**
 * build.js - Trang Build đề xuất (pages/builds.html)
 * Phụ trách: Người 2 (TV2)
 *
 * Đọc data/builds.json và ghép với data/heroes.json + data/items.json
 * để hiển thị: tướng nào - build tên gì - gồm những trang bị nào.
 *
 * NHIỆM VỤ HD08 - nâng cấp trang danh sách build:
 *   - Bộ lọc: tìm theo tên tướng/tên build, lọc theo đường (lane), lọc theo vai trò
 *     tướng, sắp xếp theo tên. Các lựa chọn được ghi lên URL (?keyword=&lane=&role=&sort=)
 *     nên F5 hoặc chia sẻ link vẫn giữ nguyên bộ lọc.
 *   - Thẻ build hiển thị trực quan hơn: huy hiệu đường đi, số trang bị, thứ tự nâng
 *     kỹ năng, lối chơi (playstyle) và liên kết điều hướng.
 *
 * NHIỆM VỤ HD02 - mỗi thẻ build có liên kết sang trang chi tiết hướng dẫn
 * (build-detail.html?id=<id>) để bấm vào là xem đầy đủ hướng dẫn.
 *
 * Dùng lại của TV1: loadData() (loadData.js), escapeHtml()/renderNotFound()/imageUrl()/
 * handleImageError() (components.js), DATA_PATH (config.js).
 * Dùng lại của TV4: matchKeyword()/debounce()/getQueryParam() (search.js),
 * refreshFavoriteButtons() (favorite.js).
 */

/* ---------- Hằng số bộ lọc ---------- */

/** Thứ tự đường đi gợi ý trong ô lọc (lấy thêm giá trị lạ từ dữ liệu nếu có). */
const BUILD_LANE_ORDER = ['Đường Rồng', 'Rừng', 'Đường Giữa', 'Đường Trên'];

/** Thứ tự vai trò gợi ý trong ô lọc (khớp HERO_ROLES của heroData.js). */
const BUILD_ROLE_ORDER = ['Xạ thủ', 'Sát thủ', 'Pháp sư', 'Đấu sĩ', 'Đỡ đòn', 'Trợ thủ'];

/** Cách sắp xếp danh sách build. */
const BUILD_SORT_DEFAULT = 'default';
const BUILD_SORT_NAME_ASC = 'name-asc';
const BUILD_SORT_NAME_DESC = 'name-desc';

const BUILD_SORT_LABELS = {
    [BUILD_SORT_DEFAULT]: 'Mặc định',
    [BUILD_SORT_NAME_ASC]: 'Tên A → Z',
    [BUILD_SORT_NAME_DESC]: 'Tên Z → A',
};

let allBuilds = [];
let buildHeroes = [];
let buildItems = [];

/** Trạng thái bộ lọc hiện tại của trang. */
let buildState = {
    keyword: '',
    lane: 'all',
    role: 'all',
    sort: BUILD_SORT_DEFAULT,
};

async function initBuildPage() {
    const listContainer = document.getElementById('build-list');
    if (!listContainer) return;

    allBuilds = await loadData(DATA_PATH.builds);
    buildHeroes = await loadHeroes();
    buildItems = await loadData(DATA_PATH.items);

    if (!Array.isArray(allBuilds)) allBuilds = [];
    if (!Array.isArray(buildHeroes)) buildHeroes = [];
    if (!Array.isArray(buildItems)) buildItems = [];

    buildState = {
        keyword: getQueryParam('keyword'),
        lane: resolveBuildLane(getQueryParam('lane')),
        role: resolveBuildRole(getQueryParam('role')),
        sort: BUILD_SORT_LABELS[getQueryParam('sort')] ? getQueryParam('sort') : BUILD_SORT_DEFAULT,
    };

    renderBuildFilterBar();
    renderBuildList();
}

/**
 * Chỉ nhận đường đi có thật trong dữ liệu, khớp không dấu/hoa-thường; giá trị lạ -> 'all'.
 * @param {string} requested
 * @returns {string}
 */
function resolveBuildLane(requested) {
    if (requested === 'all' || !requested) return 'all';

    const lanes = getBuildLanes();
    const needle = normalizeKeyword(requested);
    return lanes.find((lane) => normalizeKeyword(lane) === needle) || 'all';
}

/**
 * Chỉ nhận vai trò có thật trong dữ liệu; giá trị lạ -> 'all'.
 * @param {string} requested
 * @returns {string}
 */
function resolveBuildRole(requested) {
    if (requested === 'all' || !requested) return 'all';

    const roles = getBuildRoles();
    const needle = normalizeKeyword(requested);
    return roles.find((role) => normalizeKeyword(role) === needle) || 'all';
}

/** Danh sách đường đi có thật trong builds.json, xếp theo BUILD_LANE_ORDER rồi alphabet. */
function getBuildLanes() {
    const found = [...new Set(allBuilds.map((build) => build.lane).filter(Boolean))];
    const ordered = BUILD_LANE_ORDER.filter((lane) => found.includes(lane));
    const extra = found.filter((lane) => !BUILD_LANE_ORDER.includes(lane)).sort();

    return [...ordered, ...extra];
}

/** Danh sách vai trò có thật trong heroes.json, xếp theo BUILD_ROLE_ORDER rồi alphabet. */
function getBuildRoles() {
    const found = [...new Set(buildHeroes.flatMap((hero) => hero.role || []))];
    const ordered = BUILD_ROLE_ORDER.filter((role) => found.includes(role));
    const extra = found.filter((role) => !BUILD_ROLE_ORDER.includes(role)).sort();

    return [...ordered, ...extra];
}

function renderBuildFilterBar() {
    const bar = document.getElementById('build-filter-bar');
    if (!bar) return;

    const lanes = getBuildLanes();
    const roles = getBuildRoles();

    bar.className = 'filter-bar';
    bar.innerHTML = `
        <input
            class="filter-bar__keyword"
            type="text"
            id="build-keyword"
            placeholder="Tìm build theo tên tướng hoặc tên build..."
            value="${escapeHtml(buildState.keyword)}"
        >
        <select class="filter-bar__select" id="build-lane-filter" aria-label="Lọc theo đường đi">
            <option value="all">Tất cả đường</option>
            ${lanes.map((lane) => `<option value="${escapeHtml(lane)}">${escapeHtml(lane)}</option>`).join('')}
        </select>
        <select class="filter-bar__select" id="build-role-filter" aria-label="Lọc theo vai trò tướng">
            <option value="all">Tất cả vai trò</option>
            ${roles.map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`).join('')}
        </select>
        <select class="filter-bar__select" id="build-sort-filter" aria-label="Sắp xếp build">
            ${Object.keys(BUILD_SORT_LABELS)
                .map((sort) => `<option value="${sort}">${escapeHtml(BUILD_SORT_LABELS[sort])}</option>`)
                .join('')}
        </select>
    `;

    const laneFilter = document.getElementById('build-lane-filter');
    const roleFilter = document.getElementById('build-role-filter');
    const sortFilter = document.getElementById('build-sort-filter');

    if (laneFilter) laneFilter.value = buildState.lane;
    if (roleFilter) roleFilter.value = buildState.role;
    if (sortFilter) sortFilter.value = buildState.sort;

    document.getElementById('build-keyword').addEventListener('input', debounce((event) => {
        buildState.keyword = event.target.value;
        renderBuildList();
    }, 300));

    if (laneFilter) {
        laneFilter.addEventListener('change', () => {
            buildState.lane = laneFilter.value || 'all';
            renderBuildList();
        });
    }
    if (roleFilter) {
        roleFilter.addEventListener('change', () => {
            buildState.role = roleFilter.value || 'all';
            renderBuildList();
        });
    }
    if (sortFilter) {
        sortFilter.addEventListener('change', () => {
            const picked = sortFilter.value;
            buildState.sort = BUILD_SORT_LABELS[picked] ? picked : BUILD_SORT_DEFAULT;
            sortFilter.value = buildState.sort;
            renderBuildList();
        });
    }
}

/** Tìm tướng của 1 build (builds.json lưu heroId) */
function findBuildHero(build) {
    return buildHeroes.find((hero) => hero.id === build.heroId);
}

/** Sắp xếp danh sách build theo lựa chọn (không sửa mảng gốc). */
function sortBuilds(list) {
    const sorted = Array.isArray(list) ? list.slice() : [];

    if (buildState.sort === BUILD_SORT_NAME_ASC || buildState.sort === BUILD_SORT_NAME_DESC) {
        const direction = buildState.sort === BUILD_SORT_NAME_ASC ? 1 : -1;

        sorted.sort((a, b) => direction * String(a && a.name || '')
            .localeCompare(String(b && b.name || ''), 'vi', { sensitivity: 'base' }));
    }

    return sorted;
}

function filterBuilds() {
    const filtered = allBuilds.filter((build) => {
        const hero = findBuildHero(build);
        const text = `${build.name} ${hero ? hero.name : ''}`;

        if (!matchKeyword(text, buildState.keyword)) return false;
        if (buildState.lane !== 'all' && build.lane !== buildState.lane) return false;
        if (buildState.role !== 'all' && !(hero && (hero.role || []).includes(buildState.role))) return false;

        return true;
    });

    return sortBuilds(filtered);
}

/** Ghi bộ lọc hiện tại lên URL để F5 / chia sẻ link vẫn giữ. */
function syncBuildFilterUrl() {
    const params = new URLSearchParams(window.location.search);

    if (buildState.keyword) params.set('keyword', buildState.keyword);
    else params.delete('keyword');

    if (buildState.lane && buildState.lane !== 'all') params.set('lane', buildState.lane);
    else params.delete('lane');

    if (buildState.role && buildState.role !== 'all') params.set('role', buildState.role);
    else params.delete('role');

    if (buildState.sort && buildState.sort !== BUILD_SORT_DEFAULT) params.set('sort', buildState.sort);
    else params.delete('sort');

    const query = params.toString();
    history.replaceState(null, '', query
        ? `${BASE_PATH}src/pages/builds.html?${query}`
        : `${BASE_PATH}src/pages/builds.html`);
}

function renderBuildList() {
    const listContainer = document.getElementById('build-list');
    const countEl = document.getElementById('build-count');
    if (!listContainer) return;

    const filtered = filterBuilds();

    if (countEl) {
        countEl.textContent = `${filtered.length} build`;
    }

    listContainer.innerHTML = filtered.length
        ? filtered.map(renderBuildCard).join('')
        : renderNotFound(describeBuildEmptyState());

    syncBuildFilterUrl();
    refreshFavoriteButtons();
}

/** Câu thông báo khi không có build nào khớp bộ lọc hiện tại. */
function describeBuildEmptyState() {
    const conditions = [];

    if (String(buildState.keyword || '').trim()) conditions.push(`từ khoá "${String(buildState.keyword).trim()}"`);
    if (buildState.lane !== 'all') conditions.push(`đường "${buildState.lane}"`);
    if (buildState.role !== 'all') conditions.push(`vai trò "${buildState.role}"`);

    return conditions.length
        ? `Không tìm thấy build phù hợp với ${conditions.join(' và ')}.`
        : 'Không tìm thấy build phù hợp.';
}

/**
 * Ô trang bị trong thẻ build, bấm sang trang chi tiết trang bị.
 * @param {object} item
 * @returns {string}
 */
function renderBuildCardItem(item) {
    return `
        <a class="build-item" href="${BASE_PATH}src/pages/item-detail.html?id=${item.id}" title="${escapeHtml(item.name)}">
            <img src="${imageUrl(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="handleImageError(this)">
            <span>${escapeHtml(item.name)}</span>
        </a>
    `;
}

function renderBuildCard(build) {
    const hero = findBuildHero(build);
    const heroName = hero ? hero.name : 'Tướng chưa xác định';
    const heroHref = hero ? `${BASE_PATH}src/pages/hero-detail.html?id=${hero.id}` : '';
    const detailHref = `${BASE_PATH}src/pages/build-detail.html?id=${build.id}`;

    const cardItems = (build.items || [])
        .map((itemId) => buildItems.find((item) => item.id === itemId))
        .filter(Boolean);

    const itemsHtml = cardItems
        .map(renderBuildCardItem)
        .join('');

    const facts = [
        build.lane ? `<span class="badge build-card__lane">${escapeHtml(build.lane)}</span>` : '',
        `<span class="build-card__fact">${cardItems.length} trang bị</span>`,
        build.skillOrder ? `<span class="build-card__fact build-card__skill">${escapeHtml(build.skillOrder)}</span>` : '',
    ].filter(Boolean).join('');

    return `
        <article class="build-card">
            <div class="build-card__hero">
                ${hero ? `
                    <a href="${heroHref}">
                        <img src="${imageUrl(hero.image)}" alt="${escapeHtml(hero.name)}" loading="lazy" onerror="handleImageError(this)">
                        <h3>${escapeHtml(hero.name)}</h3>
                    </a>
                    <span class="badge">${escapeHtml((hero.role || []).join(', '))}</span>
                ` : '<h3>Tướng chưa xác định</h3>'}
            </div>

            <div class="build-card__body">
                <h2 class="build-card__name">${escapeHtml(build.name)}</h2>
                <div class="build-card__facts">${facts}</div>
                ${build.playstyle ? `<p class="build-card__playstyle">${escapeHtml(build.playstyle)}</p>` : ''}
                <p>${escapeHtml(build.description || '')}</p>
                <div class="build-card__items">
                    ${itemsHtml || renderNotFound('Build này chưa có trang bị.')}
                </div>
                <div class="build-card__actions">
                    <a class="build-card__link" href="${detailHref}">
                        Xem hướng dẫn chi tiết <span aria-hidden="true">→</span>
                    </a>
                    ${hero ? `<a class="build-card__link build-card__link--muted" href="${heroHref}">Hồ sơ tướng ${escapeHtml(heroName)}</a>` : ''}
                </div>
            </div>
        </article>
    `;
}

document.addEventListener('DOMContentLoaded', initBuildPage);
