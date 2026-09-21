/**
 * hero.js - Danh sách + Chi tiết Tướng (pages/heroes.html, pages/hero-detail.html)
 * Phụ trách: Người 2 (TV2)
 *
 * Dùng lại của TV1: loadData() (loadData.js), renderHeroCard()/renderItemCard()/
 * renderNotFound()/renderStatRow()/escapeHtml() (components.js).
 * Dùng lại của TV4: matchKeyword()/debounce() (search.js), addHistory()/addCompare() (storage.js).
 */

const HERO_PAGE_SIZE = 8;

let allHeroes = [];
let heroFilter = { keyword: '', role: '', difficulty: '' };
let heroCurrentPage = 1;

/* ================== A. TRANG DANH SÁCH TƯỚNG ================== */

async function initHeroListPage() {
    const listContainer = document.getElementById('hero-list');
    if (!listContainer) return;

    allHeroes = await loadData(DATA_PATH.heroes);

    // Header có ô tìm kiếm trỏ về trang này kèm ?keyword=
    heroFilter.keyword = getQueryParam('keyword');

    renderHeroFilterBar();
    renderHeroList();
}

function getAllRoles() {
    const roles = [];

    allHeroes.forEach((hero) => {
        (hero.role || []).forEach((role) => {
            if (!roles.includes(role)) roles.push(role);
        });
    });

    return roles;
}

function renderHeroFilterBar() {
    const bar = document.getElementById('hero-filter-bar');
    if (!bar) return;

    const roleOptions = getAllRoles()
        .map((role) => `<option value="${escapeHtml(role)}">${escapeHtml(role)}</option>`)
        .join('');

    bar.className = 'filter-bar';
    bar.innerHTML = `
        <input
            class="filter-bar__keyword"
            type="text"
            id="hero-keyword"
            placeholder="Tìm tướng theo tên..."
            value="${escapeHtml(heroFilter.keyword)}"
        >
        <select class="filter-bar__select" id="hero-role">
            <option value="">Tất cả vai trò</option>
            ${roleOptions}
        </select>
        <select class="filter-bar__select" id="hero-difficulty">
            <option value="">Mọi độ khó</option>
            <option value="1">Dễ</option>
            <option value="2">Trung bình</option>
            <option value="3">Khó</option>
        </select>
    `;

    document.getElementById('hero-keyword').addEventListener('input', debounce((event) => {
        heroFilter.keyword = event.target.value;
        heroCurrentPage = 1;
        renderHeroList();
    }, 300));

    document.getElementById('hero-role').addEventListener('change', (event) => {
        heroFilter.role = event.target.value;
        heroCurrentPage = 1;
        renderHeroList();
    });

    document.getElementById('hero-difficulty').addEventListener('change', (event) => {
        heroFilter.difficulty = event.target.value;
        heroCurrentPage = 1;
        renderHeroList();
    });
}

function filterHeroes() {
    return allHeroes.filter((hero) => {
        const matchName = matchKeyword(hero.name, heroFilter.keyword);
        const matchRole = !heroFilter.role || (hero.role || []).includes(heroFilter.role);
        const matchDifficulty =
            !heroFilter.difficulty || String(hero.difficulty) === heroFilter.difficulty;

        return matchName && matchRole && matchDifficulty;
    });
}

function renderHeroList() {
    const listContainer = document.getElementById('hero-list');
    const countEl = document.getElementById('hero-count');
    if (!listContainer) return;

    const filtered = filterHeroes();
    const totalPages = Math.max(1, Math.ceil(filtered.length / HERO_PAGE_SIZE));

    if (heroCurrentPage > totalPages) heroCurrentPage = totalPages;

    const start = (heroCurrentPage - 1) * HERO_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + HERO_PAGE_SIZE);

    if (countEl) {
        countEl.textContent = `${filtered.length} tướng`;
    }

    listContainer.innerHTML = pageItems.length
        ? pageItems.map(renderHeroCard).join('')
        : renderNotFound('Không tìm thấy tướng phù hợp.');

    renderHeroPagination(totalPages);
    refreshFavoriteButtons();
}

function renderHeroPagination(totalPages) {
    const pagination = document.getElementById('hero-pagination');
    if (!pagination) return;

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';
    for (let page = 1; page <= totalPages; page += 1) {
        html += `
            <button type="button" class="pagination__item ${page === heroCurrentPage ? 'is-active' : ''}" data-page="${page}">
                ${page}
            </button>
        `;
    }

    pagination.className = 'pagination';
    pagination.innerHTML = html;

    pagination.querySelectorAll('.pagination__item').forEach((button) => {
        button.addEventListener('click', () => {
            heroCurrentPage = Number(button.dataset.page);
            renderHeroList();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

/* ================== B. TRANG CHI TIẾT TƯỚNG ================== */

async function initHeroDetailPage() {
    const container = document.getElementById('hero-detail');
    if (!container) return;

    const heroId = Number(getQueryParam('id'));
    const heroes = await loadData(DATA_PATH.heroes);
    const hero = heroes.find((record) => record.id === heroId);

    if (!hero) {
        container.innerHTML = renderNotFound('Không tìm thấy tướng bạn yêu cầu.');
        return;
    }

    document.title = `AOV HUB - ${hero.name}`;

    const items = await loadData(DATA_PATH.items);
    const builds = await loadData(DATA_PATH.builds);

    container.innerHTML = renderHeroDetail(hero, items, builds);

    // Ghi lịch sử tra cứu (storage.js - TV4)
    addHistory('hero', hero.id);
    refreshFavoriteButtons();

    const compareBtn = document.getElementById('hero-add-compare');
    if (compareBtn) {
        compareBtn.addEventListener('click', () => {
            const added = addCompare(hero.id);
            alert(added
                ? `Đã thêm ${hero.name} vào danh sách so sánh.`
                : 'Danh sách so sánh đã đủ 2 tướng. Hãy vào trang So sánh để thay đổi.');
        });
    }
}

function renderHeroDetail(hero, items, builds) {
    const roles = (hero.role || [])
        .map((role) => `<span class="badge">${escapeHtml(role)}</span>`)
        .join('');

    const stats = Object.keys(hero.stats || {})
        .map((key) => renderStatRow(STAT_LABEL[key] || key, hero.stats[key]))
        .join('');

    const skills = (hero.skills || [])
        .filter((skill) => skill.name)
        .map((skill) => `
            <article class="skill-card">
                <div class="skill-card__head">
                    <h3>${escapeHtml(skill.name)}</h3>
                    <span class="badge">${escapeHtml(skill.type || '')}</span>
                </div>
                <p>${escapeHtml(skill.description || '')}</p>
                ${skill.cooldown ? `<span class="skill-card__cd">Hồi chiêu: ${skill.cooldown}s</span>` : ''}
            </article>
        `).join('');

    const build = builds.find((record) => record.heroId === hero.id);
    const buildItemIds = build ? build.items : (hero.recommendedBuild || []);
    const buildItems = buildItemIds
        .map((itemId) => items.find((item) => item.id === itemId))
        .filter(Boolean);

    return `
        <nav class="breadcrumb">
            <a href="/index.html">Trang chủ</a> ›
            <a href="/pages/heroes.html">Tướng</a> ›
            <span>${escapeHtml(hero.name)}</span>
        </nav>

        <section class="detail-hero">
            <div class="detail-hero__media">
                <img src="/assets/images/${hero.image}" alt="${escapeHtml(hero.name)}" onerror="handleImageError(this)">
            </div>
            <div class="detail-hero__info">
                <h1>${escapeHtml(hero.name)}</h1>
                <div class="detail-hero__badges">
                    ${roles}
                    <span class="badge ${DIFFICULTY_BADGE_CLASS[hero.difficulty] || ''}">
                        Độ khó: ${DIFFICULTY_LABEL[hero.difficulty] || '-'}
                    </span>
                </div>
                <p>${escapeHtml(hero.description || '')}</p>

                <h2 class="detail-subtitle">Chỉ số cơ bản</h2>
                <ul class="stat-list">${stats}</ul>

                <div class="detail-hero__actions">
                    <button type="button" class="btn btn-primary" id="hero-add-compare">Thêm vào So sánh</button>
                    <button type="button" class="btn btn-outline btn-favorite-inline btn-favorite" data-type="hero" data-id="${hero.id}">
                        ♥ Yêu thích
                    </button>
                </div>
            </div>
        </section>

        <section class="section">
            <div class="section__header"><h2>Bộ kỹ năng</h2></div>
            <div class="skill-grid">
                ${skills || renderNotFound('Chưa có dữ liệu kỹ năng.')}
            </div>
        </section>

        <section class="section">
            <div class="section__header">
                <h2>Build đề xuất</h2>
                ${build ? `<span class="section__link">${escapeHtml(build.name)}</span>` : ''}
            </div>
            ${build && build.description ? `<p>${escapeHtml(build.description)}</p>` : ''}
            <div class="grid grid--items">
                ${buildItems.length
                    ? buildItems.map(renderItemCard).join('')
                    : renderNotFound('Chưa có build đề xuất cho tướng này.')}
            </div>
        </section>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    initHeroListPage();
    initHeroDetailPage();
});
