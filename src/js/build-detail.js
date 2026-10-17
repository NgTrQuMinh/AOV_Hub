/**
 * build-detail.js - Trang Chi tiết hướng dẫn build (pages/build-detail.html)
 * Phụ trách: Người 2 (TV2)
 *
 * NHIỆM VỤ:
 *   HD02 - Trang chi tiết hướng dẫn build: đọc ?id= (hoặc ?heroId=) trên URL, tra
 *          src/data/builds.json rồi hiển thị đầy đủ hướng dẫn của một build.
 *   HD03 - Trang bị thay thế theo tình huống (build.situational).
 *   HD04 - Thứ tự nâng kỹ năng (build.skillOrder), mẹo chơi (build.tips) và
 *          tướng khắc chế (build.counters).
 *
 * Đọc dữ liệu động từ JSON, không hard-code build trong HTML:
 *   - src/data/builds.json  (schema HD01: id, heroId, name, lane, playstyle, items[],
 *     description, phases[], skillOrder, tips[], situational[], counters[], notes[])
 *   - src/data/heroes.json  (qua loadHeroes() để lấy tên/ảnh tướng đang hiển thị)
 *   - src/data/items.json   (tra tên/ảnh trang bị theo id trong build.items / phases / situational)
 *
 * Xử lý lỗi giống trang chi tiết trang bị (item.js):
 *   - thiếu id trên URL            -> báo rõ ví dụ hợp lệ
 *   - id không tồn tại             -> báo đúng mã cần tìm
 *   - JSON hỏng / tải lỗi          -> báo lỗi tải dữ liệu
 *
 * DÙNG LẠI: loadData()/DATA_PATH/BASE_PATH (loadData.js, config.js),
 * loadHeroes() (heroData.js), escapeHtml()/imageUrl()/handleImageError()/
 * renderNotFound() (components.js), getQueryParam() (search.js).
 * (search.js cũng nạp matchKeyword/debounce nhưng trang này không cần.)
 */

/* ---------- Nhãn dùng chung ---------- */

/** Tiêu đề các khối nội dung của trang chi tiết build. */
const BUILD_DETAIL_TITLES = {
    items: 'Trang bị chính',
    phases: 'Lộ trình lên đồ',
    skill: 'Thứ tự nâng kỹ năng',
    situational: 'Trang bị thay thế theo tình huống',
    tips: 'Mẹo chơi',
    counters: 'Tướng khắc chế',
    notes: 'Ghi chú',
};

document.addEventListener('DOMContentLoaded', initBuildDetailPage);

/**
 * Khởi tạo trang chi tiết build: tải 3 bộ dữ liệu rồi render theo ?id= / ?heroId=.
 * Hàm async, tự bắt lỗi để không làm vỡ trang khi JSON hỏng.
 */
async function initBuildDetailPage() {
    const container = document.getElementById('build-detail');
    if (!container) return;

    const [builds, heroes, items] = await Promise.all([
        loadData(DATA_PATH.builds),
        loadHeroes(),
        loadData(DATA_PATH.items),
    ]);

    // 1. JSON hỏng / tải lỗi -> loadData() trả về mảng rỗng.
    if (!Array.isArray(builds) || builds.length === 0) {
        container.innerHTML = renderBuildDetailPlaceholder(
            'Không tải được dữ liệu hướng dẫn build. Vui lòng kiểm tra kết nối rồi tải lại trang.',
            '<button type="button" class="btn btn-outline" data-reload-build-detail>Tải lại trang</button>',
        );
        initReloadBuildDetailButton(container);
        return;
    }

    // 2. Tra build theo ?id= (ưu tiên) hoặc ?heroId= (lấy build đầu tiên của tướng).
    const id = String(getQueryParam('id')).trim();
    const heroId = String(getQueryParam('heroId')).trim();

    if (!id && !heroId) {
        container.innerHTML = renderBuildDetailPlaceholder(
            'Thiếu mã hướng dẫn build trên đường dẫn. Ví dụ hợp lệ: build-detail.html?id=1',
        );
        initReloadBuildDetailButton(container);
        return;
    }

    const build = (id && builds.find((row) => String(row.id) === id))
        || (heroId && builds.find((row) => String(row.heroId) === heroId))
        || null;

    if (!build) {
        const wanted = id || heroId;
        container.innerHTML = renderBuildDetailPlaceholder(
            `Không tìm thấy hướng dẫn build có mã "${wanted}".`,
        );
        initReloadBuildDetailButton(container);
        return;
    }

    renderBuildDetail(container, build, heroes, items);

    // Khối trang bị có thể không có nút ♥ nhưng gọi cho chắc nếu markup đổi sau này.
    if (typeof refreshFavoriteButtons === 'function') refreshFavoriteButtons();
}

/* ---------- Khối báo lỗi / rỗng ---------- */

/**
 * Khối thông báo dùng chung cho các trường hợp lỗi của trang chi tiết build.
 * @param {string} message
 * @param {string} [extraHtml] nút hành động bổ sung (vd nút tải lại trang)
 * @returns {string} HTML string
 */
function renderBuildDetailPlaceholder(message, extraHtml = '') {
    return `
        <div class="build-detail-empty">
            ${renderNotFound(message)}
            <p class="build-detail-empty__actions">
                <a class="btn btn-outline" href="${BASE_PATH}src/pages/builds.html">← Về danh sách build</a>
                ${extraHtml}
            </p>
        </div>
    `;
}

/**
 * Gắn sự kiện cho nút "Tải lại trang" (event delegation vì nội dung được render lại).
 * @param {HTMLElement} container
 */
function initReloadBuildDetailButton(container) {
    if (!container || typeof container.addEventListener !== 'function') return;

    container.addEventListener('click', (event) => {
        const reloadBtn = event.target.closest('[data-reload-build-detail]');
        if (!reloadBtn) return;

        window.location.reload();
    });
}

/* ---------- Trợ giúp tra cứu ---------- */

/** Tìm tướng theo heroId (so khớp đã chuẩn hoá chuỗi). */
function buildDetailFindHero(heroes, heroId) {
    const list = Array.isArray(heroes) ? heroes : [];
    return list.find((hero) => String(hero.id) === String(heroId)) || null;
}

/** Tìm trang bị theo id (so khớp đã chuẩn hoá chuỗi). */
function buildDetailFindItem(items, itemId) {
    const list = Array.isArray(items) ? items : [];
    return list.find((item) => String(item.id) === String(itemId)) || null;
}

/**
 * Đổi mảng id trang bị thành mảng item có thật (bỏ id lạ / trùng lặp, giữ thứ tự).
 * @param {object[]} items - toàn bộ items.json
 * @param {Array<number|string>} ids
 * @returns {object[]}
 */
function buildDetailResolveItems(items, ids) {
    const used = new Set();

    return (Array.isArray(ids) ? ids : [])
        .map((id) => buildDetailFindItem(items, id))
        .filter((item) => {
            if (!item || used.has(String(item.id))) return false;
            used.add(String(item.id));
            return true;
        });
}

/**
 * Danh sách tướng khắc chế hợp lệ (có tướng thật trong heroes.json, không trùng).
 * @param {object} build
 * @param {object[]} heroes
 * @returns {Array<{hero: object, reason: string}>}
 */
function buildDetailResolveCounters(build, heroes) {
    const used = new Set();

    return (Array.isArray(build && build.counters) ? build.counters : [])
        .map((entry) => {
            const hero = buildDetailFindHero(heroes, entry && entry.heroId);
            if (!hero || used.has(String(hero.id))) return null;

            used.add(String(hero.id));
            return { hero, reason: String((entry && entry.reason) || '').trim() };
        })
        .filter(Boolean);
}

/**
 * Danh sách trang bị thay thế theo tình huống hợp lệ (cả 2 đầu thay/thay-bằng
 * đều phải có thật trong items.json).
 * @param {object} build
 * @param {object[]} items
 * @returns {Array<{when: string, from: object, to: object, reason: string}>}
 */
function buildDetailResolveSituational(build, items) {
    return (Array.isArray(build && build.situational) ? build.situational : [])
        .map((entry) => {
            const from = buildDetailFindItem(items, entry && entry.replace);
            const to = buildDetailFindItem(items, entry && entry.with);
            if (!from || !to) return null;

            return {
                when: String((entry && entry.when) || '').trim(),
                from,
                to,
                reason: String((entry && entry.reason) || '').trim(),
            };
        })
        .filter(Boolean);
}

/* ---------- Các mảnh HTML ---------- */

/**
 * Ô trang bị bấm được sang trang chi tiết trang bị.
 * @param {object} item
 * @param {string} className - 'build-item' (có số thứ tự) hoặc 'build-mini-item'
 * @returns {string}
 */
function renderBuildDetailItem(item, className) {
    return `
        <a class="${className}" href="${BASE_PATH}src/pages/item-detail.html?id=${escapeHtml(item.id)}" title="${escapeHtml(item.name)}">
            <img src="${imageUrl(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="handleImageError(this)">
            <span>${escapeHtml(item.name)}</span>
        </a>
    `;
}

/**
 * Lưới trang bị (dùng cho "Trang bị chính" và từng giai đoạn lên đồ).
 * @param {object[]} items
 * @param {string} emptyMessage
 * @returns {string}
 */
function renderBuildDetailItemGrid(items, emptyMessage) {
    if (!items.length) return renderNotFound(emptyMessage);

    return items.map((item) => renderBuildDetailItem(item, 'build-item')).join('');
}

/**
 * Khối lộ trình lên đồ theo từng giai đoạn (build.phases).
 * @param {object} build
 * @param {object[]} items
 * @returns {string}
 */
function renderBuildDetailPhases(build, items) {
    const phases = Array.isArray(build && build.phases) ? build.phases : [];
    if (!phases.length) return renderNotFound('Build này chưa có lộ trình lên đồ.');

    return `
        <ol class="build-phase-list">
            ${phases.map((phase) => {
                const phaseItems = buildDetailResolveItems(items, phase && phase.items);

                return `
                    <li class="build-phase">
                        <h3 class="build-phase__title">${escapeHtml((phase && phase.name) || '')}</h3>
                        <div class="build-phase__items">
                            ${renderBuildDetailItemGrid(phaseItems, 'Giai đoạn này chưa có trang bị.')}
                        </div>
                        ${phase && phase.note ? `<p class="build-phase__note">${escapeHtml(phase.note)}</p>` : ''}
                    </li>
                `;
            }).join('')}
        </ol>
    `;
}

/**
 * HD03 - Khối "Trang bị thay thế theo tình huống".
 * @param {object} build
 * @param {object[]} items
 * @returns {string}
 */
function renderBuildDetailSituational(build, items) {
    const entries = buildDetailResolveSituational(build, items);
    if (!entries.length) return renderNotFound('Build này chưa có gợi ý trang bị thay thế.');

    return `
        <ul class="situational-list">
            ${entries.map((entry) => `
                <li class="situational">
                    <p class="situational__when">${escapeHtml(entry.when || 'Tình huống khác')}</p>
                    <div class="situational__swap">
                        ${renderBuildDetailItem(entry.from, 'build-mini-item')}
                        <span class="situational__arrow" aria-hidden="true">→</span>
                        ${renderBuildDetailItem(entry.to, 'build-mini-item')}
                    </div>
                    ${entry.reason ? `<p class="situational__reason">${escapeHtml(entry.reason)}</p>` : ''}
                </li>
            `).join('')}
        </ul>
    `;
}

/**
 * HD04 - Khối "Tướng khắc chế".
 * @param {object} build
 * @param {object[]} heroes
 * @returns {string}
 */
function renderBuildDetailCounters(build, heroes) {
    const counters = buildDetailResolveCounters(build, heroes);
    if (!counters.length) return renderNotFound('Build này chưa có dữ liệu tướng khắc chế.');

    return `
        <ul class="counter-list">
            ${counters.map(({ hero, reason }) => `
                <li class="counter">
                    <a class="counter__hero" href="${BASE_PATH}src/pages/hero-detail.html?id=${escapeHtml(hero.id)}">
                        <img src="${imageUrl(hero.image)}" alt="${escapeHtml(hero.name)}" loading="lazy" onerror="handleImageError(this)">
                        <span class="counter__name">${escapeHtml(hero.name)}</span>
                    </a>
                    ${reason ? `<p class="counter__reason">${escapeHtml(reason)}</p>` : ''}
                </li>
            `).join('')}
        </ul>
    `;
}

/**
 * Danh sách gạch đầu dòng (dùng cho mẹo chơi và ghi chú).
 * @param {Array<*>} entries
 * @param {string} listClass
 * @param {string} emptyMessage
 * @returns {string}
 */
function renderBuildDetailBulletList(entries, listClass, emptyMessage) {
    const list = (Array.isArray(entries) ? entries : []).map((text) => String(text || '').trim()).filter(Boolean);
    if (!list.length) return renderNotFound(emptyMessage);

    return `
        <ul class="${listClass}">
            ${list.map((text) => `<li>${escapeHtml(text)}</li>`).join('')}
        </ul>
    `;
}

/* ---------- Render trang ---------- */

/**
 * Render toàn bộ trang chi tiết của một build.
 * @param {HTMLElement} container - #build-detail
 * @param {object} build - object trong builds.json
 * @param {object[]} heroes - heroes.json
 * @param {object[]} items - items.json
 */
function renderBuildDetail(container, build, heroes, items) {
    const hero = buildDetailFindHero(heroes, build.heroId);
    const heroName = hero ? hero.name : 'Tướng chưa xác định';
    const mainItems = buildDetailResolveItems(items, build.items);

    // Đổi tiêu đề tab trình duyệt theo tên build (document.title là text, không cần escape).
    document.title = `AOV HUB - ${build.name || 'Hướng dẫn build'}`;

    const heroMedia = hero
        ? `
            <a class="build-detail__hero-link" href="${BASE_PATH}src/pages/hero-detail.html?id=${escapeHtml(hero.id)}">
                <img src="${imageUrl(hero.image)}" alt="${escapeHtml(hero.name)}" onerror="handleImageError(this)">
                <h2>${escapeHtml(hero.name)}</h2>
            </a>
            <span class="badge">${escapeHtml((hero.role || []).join(', '))}</span>
        `
        : `<h2 class="build-detail__hero-name">${escapeHtml(heroName)}</h2>`;

    const metaBadges = [
        build.lane ? `<span class="badge build-detail__lane">${escapeHtml(build.lane)}</span>` : '',
        `<span class="badge build-detail__count">${mainItems.length} trang bị</span>`,
    ].filter(Boolean).join('');

    container.innerHTML = `
        <nav class="build-detail__breadcrumb" aria-label="Đường dẫn">
            <a href="${BASE_PATH}src/pages/builds.html">Build đề xuất</a>
            <span aria-hidden="true">/</span>
            <a href="${BASE_PATH}src/pages/builds.html?keyword=${encodeURIComponent(heroName)}">${escapeHtml(heroName)}</a>
            <span aria-hidden="true">/</span>
            <span class="build-detail__breadcrumb-current">${escapeHtml(build.name || '')}</span>
        </nav>

        <article class="build-detail">
            <header class="build-detail__header">
                <div class="build-detail__hero">${heroMedia}</div>
                <div class="build-detail__headline">
                    <h1 class="build-detail__name">${escapeHtml(build.name || '')}</h1>
                    <div class="build-detail__meta">${metaBadges}</div>
                    ${build.playstyle ? `<p class="build-detail__playstyle">${escapeHtml(build.playstyle)}</p>` : ''}
                    ${build.description ? `<p class="build-detail__desc">${escapeHtml(build.description)}</p>` : ''}
                </div>
            </header>

            <section class="build-detail__section build-detail__items-section">
                <h2>${escapeHtml(BUILD_DETAIL_TITLES.items)}</h2>
                <div class="build-detail__items">
                    ${renderBuildDetailItemGrid(mainItems, 'Build này chưa có trang bị.')}
                </div>
            </section>

            <section class="build-detail__section build-detail__phases-section">
                <h2>${escapeHtml(BUILD_DETAIL_TITLES.phases)}</h2>
                ${renderBuildDetailPhases(build, items)}
            </section>

            <section class="build-detail__section build-detail__skill-section">
                <h2>${escapeHtml(BUILD_DETAIL_TITLES.skill)}</h2>
                ${String(build.skillOrder || '').trim()
                    ? `<p class="build-detail__skill-order">${escapeHtml(build.skillOrder)}</p>`
                    : renderNotFound('Build này chưa có thứ tự nâng kỹ năng.')}
            </section>

            <section class="build-detail__section build-detail__situational-section">
                <h2>${escapeHtml(BUILD_DETAIL_TITLES.situational)}</h2>
                ${renderBuildDetailSituational(build, items)}
            </section>

            <section class="build-detail__section build-detail__tips-section">
                <h2>${escapeHtml(BUILD_DETAIL_TITLES.tips)}</h2>
                ${renderBuildDetailBulletList(build.tips, 'build-tips', 'Build này chưa có mẹo chơi.')}
            </section>

            <section class="build-detail__section build-detail__counters-section">
                <h2>${escapeHtml(BUILD_DETAIL_TITLES.counters)}</h2>
                ${renderBuildDetailCounters(build, heroes)}
            </section>

            ${Array.isArray(build.notes) && build.notes.some((note) => String(note || '').trim()) ? `
                <section class="build-detail__section build-detail__notes-section">
                    <h2>${escapeHtml(BUILD_DETAIL_TITLES.notes)}</h2>
                    ${renderBuildDetailBulletList(build.notes, 'build-notes', 'Build này chưa có ghi chú.')}
                </section>
            ` : ''}

            <footer class="build-detail__footer">
                <a class="btn btn-outline" href="${BASE_PATH}src/pages/builds.html">← Về danh sách build</a>
                ${hero ? `<a class="btn btn-primary" href="${BASE_PATH}src/pages/hero-detail.html?id=${escapeHtml(hero.id)}">Xem tướng ${escapeHtml(hero.name)}</a>` : ''}
            </footer>
        </article>
    `;
}
