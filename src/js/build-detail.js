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
 *   HD05 - Bảng ngọc / phép bổ trợ (buildDetailResolveRunes từ src/data/runes.json).
 *   HD07 - Nút bình chọn "Hữu ích" (build-vote.js + aov_build_votes).
 *   HD09 - Sao chép / chia sẻ liên kết hướng dẫn build.
 *   Build khác - Gợi ý các build cùng heroId ở cuối trang (gồm build cộng đồng
 *          đang hiển thị được), bỏ chính build đang xem theo id thật của build.
 *
 * Đọc dữ liệu động từ JSON, không hard-code build trong HTML:
 *   - src/data/builds.json  (schema HD01: id, heroId, name, lane, playstyle, items[],
 *     description, phases[], skillOrder, tips[], situational[], counters[], notes[])
 *   - src/data/runes.json   (HD05: bảng ngọc + phép bổ trợ gợi ý theo vai trò/đường)
 *   - src/data/heroes.json  (qua loadHeroes() để lấy tên/ảnh tướng đang hiển thị)
 *   - src/data/items.json   (tra tên/ảnh trang bị theo id trong build.items / phases / situational)
 *
 * HD06: ngoài builds.json, trang còn tra thêm hướng dẫn build do người dùng gửi
 * (aov_build_submissions qua storage.js) nên build cộng đồng cũng mở được ở đây.
 *
 * Xử lý lỗi giống trang chi tiết trang bị (item.js):
 *   - thiếu id trên URL            -> báo rõ ví dụ hợp lệ
 *   - id không tồn tại             -> báo đúng mã cần tìm
 *   - JSON hỏng / tải lỗi          -> báo lỗi tải dữ liệu
 *
 * DÙNG LẠI: loadData()/DATA_PATH/BASE_PATH (loadData.js, config.js),
 * loadHeroes() (heroData.js), escapeHtml()/imageUrl()/handleImageError()/
 * renderNotFound() (components.js), getQueryParam() (search.js),
 * getBuildSubmissions() (storage.js), renderBuildVoteButton()/refreshBuildVoteButtons()
 * (build-vote.js).
 * (search.js cũng nạp matchKeyword/debounce nhưng trang này không cần.)
 */

/* ---------- Nhãn dùng chung ---------- */

/** Tiêu đề các khối nội dung của trang chi tiết build. */
const BUILD_DETAIL_TITLES = {
    items: 'Trang bị chính',
    phases: 'Lộ trình lên đồ',
    runes: 'Bảng ngọc / Phép bổ trợ',
    skill: 'Thứ tự nâng kỹ năng',
    situational: 'Trang bị thay thế theo tình huống',
    tips: 'Mẹo chơi',
    counters: 'Tướng khắc chế',
    notes: 'Ghi chú',
    related: 'Build khác của tướng này',
};

/** Build + tên tướng đang hiển thị, dùng cho nút sao chép/chia sẻ (HD09). */
let activeBuildDetail = null;

document.addEventListener('DOMContentLoaded', initBuildDetailPage);

/**
 * Khởi tạo trang chi tiết build: tải 3 bộ dữ liệu rồi render theo ?id= / ?heroId=.
 * Hàm async, tự bắt lỗi để không làm vỡ trang khi JSON hỏng.
 */
async function initBuildDetailPage() {
    const container = document.getElementById('build-detail');
    if (!container) return;

    const [builds, runes, heroes, items] = await Promise.all([
        loadData(DATA_PATH.builds),
        loadData(DATA_PATH.runes),
        loadHeroes(),
        loadData(DATA_PATH.items),
    ]);

    // HD06: gộp cả hướng dẫn build do người dùng gửi (LocalStorage) để mở được cùng trang.
    const submissions = typeof getBuildSubmissions === 'function' ? getBuildSubmissions() : [];
    const allBuilds = [
        ...(Array.isArray(builds) ? builds : []),
        ...submissions,
    ];

    // 1. JSON hỏng / tải lỗi và không có build cộng đồng -> loadData() trả về mảng rỗng.
    if (!allBuilds.length) {
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

    const build = (id && allBuilds.find((row) => String(row.id) === id))
        || (heroId && allBuilds.find((row) => String(row.heroId) === heroId))
        || null;

    if (!build) {
        const wanted = id || heroId;
        container.innerHTML = renderBuildDetailPlaceholder(
            `Không tìm thấy hướng dẫn build có mã "${wanted}".`,
        );
        initReloadBuildDetailButton(container);
        return;
    }

    renderBuildDetail(container, build, allBuilds, heroes, items, runes);

    initBuildDetailShare(container);

    // Cập nhật nút bình chọn "Hữu ích" (HD07) sau khi render xong markup.
    if (typeof refreshBuildVoteButtons === 'function') refreshBuildVoteButtons(container);

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

/**
 * Các build khác của cùng tướng: trùng heroId với build đang xem và khác id
 * thật của build đang xem. Không dựa vào tên build, không nhầm heroId với id.
 * @param {object[]} builds - toàn bộ builds.json + build cộng đồng đang hiển thị
 * @param {object} currentBuild
 * @returns {object[]}
 */
function buildDetailResolveRelatedBuilds(builds, currentBuild) {
    if (!Array.isArray(builds) || !currentBuild) return [];

    const heroId = currentBuild.heroId;
    if (heroId === null || heroId === undefined || String(heroId).trim() === '') return [];

    const currentId = String(currentBuild.id);
    const seen = new Set();

    return builds.filter((row) => {
        if (!row || typeof row !== 'object') return false;
        if (String(row.heroId) !== String(heroId)) return false;
        if (String(row.id) === currentId) return false;

        const key = String(row.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * HD05 - Ghép bảng ngọc + phép bổ trợ gợi ý cho một build.
 *
 * Nguồn dữ liệu chuẩn của dự án: vai trò tướng (heroes.json) quyết định bảng ngọc,
 * còn đường đi của build (builds.json) có thể ghi đè phép bổ trợ (vd đường Rừng
 * cần "Trừng phạt"). Không tìm thấy vai trò thì dùng bảng mặc định (runes.fallback).
 *
 * @param {object} runesData - nội dung src/data/runes.json
 * @param {object} build - object trong builds.json (hoặc build cộng đồng)
 * @param {object|null} hero - tướng của build trong heroes.json
 * @returns {{ role: string, lane: string, runes: Array<{color:string,name:string,effect:string}>, spells: string[], matched: boolean }}
 */
function buildDetailResolveRunes(runesData, build, hero) {
    const source = runesData && typeof runesData === 'object' && !Array.isArray(runesData) ? runesData : {};
    const roles = source.roles && typeof source.roles === 'object' ? source.roles : {};
    const lanes = source.lanes && typeof source.lanes === 'object' ? source.lanes : {};
    const fallback = source.fallback && typeof source.fallback === 'object' ? source.fallback : {};

    const heroRoles = (hero && Array.isArray(hero.role) ? hero.role : [])
        .map((role) => String(role || '').trim())
        .filter(Boolean);

    const roleName = heroRoles.find((role) => roles[role] && typeof roles[role] === 'object') || '';
    const base = (roleName && roles[roleName]) || fallback;

    const lane = String((build && build.lane) || '').trim();
    const laneEntry = lane && lanes[lane] && typeof lanes[lane] === 'object' ? lanes[lane] : null;

    const runes = (Array.isArray(base && base.runes) ? base.runes : [])
        .map((rune) => ({
            color: String((rune && rune.color) || '').trim(),
            name: String((rune && rune.name) || '').trim(),
            effect: String((rune && rune.effect) || '').trim(),
        }))
        .filter((rune) => rune.name);

    const spellSource = laneEntry && Array.isArray(laneEntry.spells) && laneEntry.spells.length
        ? laneEntry.spells
        : (base && base.spells);

    const spells = (Array.isArray(spellSource) ? spellSource : [])
        .map((spell) => String(spell || '').trim())
        .filter(Boolean);

    return {
        role: roleName || (heroRoles[0] || ''),
        lane,
        runes,
        spells,
        matched: Boolean(roleName || laneEntry),
    };
}

/** Lớp CSS cho ô màu ngọc (Đỏ/Xanh dương/Xanh lá/khác). */
function buildDetailRuneColorClass(color) {
    switch (normalizeKeyword(color)) {
        case 'do': return 'red';
        case 'xanh duong': return 'blue';
        case 'xanh la': return 'green';
        default: return 'default';
    }
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

/**
 * HD05 - Khối "Bảng ngọc / Phép bổ trợ".
 * @param {object} runesData - nội dung src/data/runes.json
 * @param {object} build
 * @param {object|null} hero
 * @returns {string}
 */
function renderBuildDetailRunes(runesData, build, hero) {
    const info = buildDetailResolveRunes(runesData, build, hero);
    if (!info.runes.length && !info.spells.length) {
        return renderNotFound('Build này chưa có bảng ngọc / phép bổ trợ gợi ý.');
    }

    const scope = [
        info.role ? `vai trò ${escapeHtml(info.role)}` : '',
        info.lane ? `đường ${escapeHtml(info.lane)}` : '',
    ].filter(Boolean).join(' · ');

    return `
        <div class="rune-block">
            ${scope ? `<p class="rune-block__scope">Gợi ý cho ${scope}</p>` : ''}
            ${info.runes.length ? `
                <table class="rune-table">
                    <caption>Bảng ngọc đề xuất</caption>
                    <thead>
                        <tr>
                            <th scope="col">Loại ngọc</th>
                            <th scope="col">Đề xuất</th>
                            <th scope="col">Tác dụng</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${info.runes.map((rune) => `
                            <tr>
                                <th scope="row" class="rune-table__color rune-table__color--${buildDetailRuneColorClass(rune.color)}">${escapeHtml(rune.color || 'Ngọc')}</th>
                                <td class="rune-table__name">${escapeHtml(rune.name)}</td>
                                <td class="rune-table__effect">${escapeHtml(rune.effect)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : ''}
            ${info.spells.length ? `
                <div class="spell-block">
                    <h3 class="spell-block__title">Phép bổ trợ</h3>
                    <ul class="spell-list">
                        ${info.spells.map((spell) => `<li class="spell">${escapeHtml(spell)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            ${runesData && runesData.note ? `<p class="rune-block__note">${escapeHtml(runesData.note)}</p>` : ''}
        </div>
    `;
}

/* ---------- HD09: Sao chép / chia sẻ liên kết hướng dẫn build ---------- */

/**
 * Liên kết tới trang chi tiết của một build (dùng để sao chép / chia sẻ).
 * @param {object} build
 * @returns {string}
 */
function buildDetailShareUrl(build) {
    const id = build && build.id !== undefined && build.id !== null ? build.id : '';
    return `${BASE_PATH}src/pages/build-detail.html?id=${encodeURIComponent(id)}`;
}

/**
 * Nội dung chia sẻ kèm liên kết.
 * @param {object} build
 * @param {string} [heroName]
 * @returns {string}
 */
function buildDetailShareText(build, heroName) {
    const name = String((build && build.name) || 'Hướng dẫn build').trim();
    const hero = String(heroName || '').trim();
    return `Hướng dẫn build "${name}"${hero ? ` cho ${hero}` : ''} - AOV HUB`;
}

/**
 * Sao chép một đoạn text, ưu tiên Clipboard API rồi tới textarea + execCommand.
 * Không ném lỗi khi trình duyệt chặn (chế độ riêng tư) — trả về false để UI báo thủ công.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyTextToClipboard(text) {
    const value = String(text === undefined || text === null ? '' : text);
    if (!value) return false;

    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard
            && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch (error) {
        // Bị chặn -> thử cách dự phòng bên dưới.
    }

    try {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function'
            || typeof document.execCommand !== 'function') {
            return false;
        }

        const helper = document.createElement('textarea');
        helper.value = value;
        helper.setAttribute('readonly', '');
        document.body.appendChild(helper);
        if (typeof helper.select === 'function') helper.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(helper);
        return Boolean(copied);
    } catch (error) {
        return false;
    }
}

/**
 * Sao chép liên kết hướng dẫn build hiện tại.
 * @param {object} [build] bỏ trống thì lấy build đang hiển thị.
 * @returns {Promise<boolean>}
 */
async function copyBuildDetailLink(build) {
    const info = build || (activeBuildDetail && activeBuildDetail.build);
    if (!info) return false;

    return copyTextToClipboard(buildDetailShareUrl(info));
}

/**
 * Chia sẻ hướng dẫn build: dùng Web Share API nếu có, không thì sao chép liên kết.
 * @param {object} [build]
 * @param {string} [heroName]
 * @returns {Promise<'shared'|'copied'|'failed'>}
 */
async function shareBuildDetail(build, heroName) {
    const info = build || (activeBuildDetail && activeBuildDetail.build);
    if (!info) return 'failed';

    const hero = heroName !== undefined
        ? heroName
        : ((activeBuildDetail && activeBuildDetail.heroName) || '');
    const url = buildDetailShareUrl(info);
    const text = buildDetailShareText(info, hero);

    try {
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            await navigator.share({ title: 'AOV HUB', text, url });
            return 'shared';
        }
    } catch (error) {
        // Người dùng huỷ hoặc trình duyệt từ chối -> rơi xuống sao chép liên kết.
    }

    return (await copyTextToClipboard(url)) ? 'copied' : 'failed';
}

/** Ghi thông báo kết quả sao chép / chia sẻ vào vùng trạng thái của khối hành động. */
function renderBuildDetailShareStatus(container, message, ok) {
    const status = container && typeof container.querySelector === 'function'
        ? container.querySelector('[data-build-share-status]')
        : null;
    if (!status) return;

    status.textContent = message;
    if (typeof status.classList === 'object' && status.classList) {
        status.classList.toggle('is-error', ok === false);
    }
}

/**
 * Gắn sự kiện cho nút "Sao chép liên kết" / "Chia sẻ" (event delegation vì nút nằm
 * trong markup được render lại).
 * @param {HTMLElement} container
 */
function initBuildDetailShare(container) {
    if (!container || typeof container.addEventListener !== 'function') return;

    container.addEventListener('click', async (event) => {
        const target = event.target;
        if (!target || typeof target.closest !== 'function') return;

        const copyBtn = target.closest('[data-copy-build-link]');
        const shareBtn = target.closest('[data-share-build]');
        if (!copyBtn && !shareBtn) return;

        event.preventDefault();

        const build = activeBuildDetail && activeBuildDetail.build;
        const heroName = (activeBuildDetail && activeBuildDetail.heroName) || '';

        if (copyBtn) {
            const ok = await copyBuildDetailLink(build);
            renderBuildDetailShareStatus(
                container,
                ok
                    ? 'Đã sao chép liên kết hướng dẫn build.'
                    : 'Không sao chép được. Hãy sao chép liên kết trên thanh địa chỉ.',
                ok,
            );
            return;
        }

        const result = await shareBuildDetail(build, heroName);
        const messages = {
            shared: 'Đã mở hộp thoại chia sẻ.',
            copied: 'Đã sao chép liên kết để chia sẻ.',
            failed: 'Trình duyệt này không hỗ trợ chia sẻ. Hãy sao chép liên kết thủ công.',
        };

        renderBuildDetailShareStatus(container, messages[result] || messages.failed, result !== 'failed');
    });
}

/**
 * Thẻ gợi ý một build khác của cùng tướng. Toàn bộ thẻ là link sang đúng
 * build-detail.html?id=<id thật của build>.
 * @param {object} relatedBuild
 * @param {object[]} items
 * @returns {string}
 */
function renderBuildDetailRelatedCard(relatedBuild, items) {
    const relatedItems = buildDetailResolveItems(items, relatedBuild.items);
    const itemCount = relatedItems.length;
    const itemIcons = relatedItems.slice(0, 6).map((item) => `
        <img src="${imageUrl(item.image)}" alt="${escapeHtml(item.name)}"
            title="${escapeHtml(item.name)}" loading="lazy" onerror="handleImageError(this)">
    `).join('');

    return `
        <li class="related-build">
            <a class="related-build__link" href="${BASE_PATH}src/pages/build-detail.html?id=${escapeHtml(relatedBuild.id)}">
                <span class="related-build__name">${escapeHtml(relatedBuild.name || 'Build chưa đặt tên')}</span>
                <span class="related-build__meta">
                    ${relatedBuild.lane ? `<span class="badge">${escapeHtml(relatedBuild.lane)}</span>` : ''}
                    <span class="related-build__count">${itemCount} trang bị</span>
                    ${relatedBuild.skillOrder ? `<span class="related-build__skill">${escapeHtml(relatedBuild.skillOrder)}</span>` : ''}
                </span>
                ${relatedBuild.playstyle ? `<span class="related-build__playstyle">${escapeHtml(relatedBuild.playstyle)}</span>` : ''}
                ${itemIcons ? `<span class="related-build__items" aria-hidden="true">${itemIcons}</span>` : ''}
                <span class="related-build__cta">Xem hướng dẫn <span aria-hidden="true">→</span></span>
            </a>
        </li>
    `;
}

/**
 * Khối "Build khác của tướng này". Trả về chuỗi rỗng khi không có build nào
 * khác để tránh hiển thị một danh sách trống gây khó hiểu.
 * @param {object[]} builds
 * @param {object} currentBuild
 * @param {object|null} hero
 * @param {object[]} items
 * @returns {string}
 */
function renderBuildDetailRelatedBuilds(builds, currentBuild, hero, items) {
    const related = buildDetailResolveRelatedBuilds(builds, currentBuild);
    if (!related.length) return '';

    const heroName = hero ? hero.name : 'tướng này';

    return `
        <section class="build-detail__section build-detail__related-section">
            <h2>${escapeHtml(BUILD_DETAIL_TITLES.related)}</h2>
            <p class="related-build__intro">Cùng tướng <strong>${escapeHtml(heroName)}</strong> nhưng khác hướng lên đồ.</p>
            <ul class="related-build-list">
                ${related.map((row) => renderBuildDetailRelatedCard(row, items)).join('')}
            </ul>
        </section>
    `;
}

/* ---------- Render trang ---------- */

/**
 * Render toàn bộ trang chi tiết của một build.
 * @param {HTMLElement} container - #build-detail
 * @param {object} build - object trong builds.json (hoặc build cộng đồng HD06)
 * @param {object[]} builds - toàn bộ builds.json + build cộng đồng (để tìm build cùng tướng)
 * @param {object[]} heroes - heroes.json
 * @param {object[]} items - items.json
 * @param {object} [runesData] - runes.json (HD05)
 */
function renderBuildDetail(container, build, builds, heroes, items, runesData) {
    const hero = buildDetailFindHero(heroes, build.heroId);
    const heroName = hero ? hero.name : 'Tướng chưa xác định';
    const mainItems = buildDetailResolveItems(items, build.items);

    // Nhớ build đang xem để nút sao chép / chia sẻ dùng lại (HD09).
    activeBuildDetail = { build, heroName };

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

            <div class="build-detail__actions">
                ${typeof renderBuildVoteButton === 'function' ? renderBuildVoteButton(build.id) : ''}
                <button type="button" class="btn btn-outline btn-share-build" data-copy-build-link>Sao chép liên kết</button>
                <button type="button" class="btn btn-outline btn-share-build" data-share-build>Chia sẻ</button>
                <span class="build-detail__share-status" data-build-share-status role="status" aria-live="polite"></span>
            </div>

            <section class="build-detail__section build-detail__items-section">
                <h2>${escapeHtml(BUILD_DETAIL_TITLES.items)}</h2>
                <div class="build-detail__items">
                    ${renderBuildDetailItemGrid(mainItems, 'Build này chưa có trang bị.')}
                </div>
            </section>

            <section class="build-detail__section build-detail__runes-section">
                <h2>${escapeHtml(BUILD_DETAIL_TITLES.runes)}</h2>
                ${renderBuildDetailRunes(runesData, build, hero)}
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

            ${renderBuildDetailRelatedBuilds(builds, build, hero, items)}

            <footer class="build-detail__footer">
                <a class="btn btn-outline" href="${BASE_PATH}src/pages/builds.html">← Về danh sách build</a>
                ${hero ? `<a class="btn btn-primary" href="${BASE_PATH}src/pages/hero-detail.html?id=${escapeHtml(hero.id)}">Xem tướng ${escapeHtml(hero.name)}</a>` : ''}
            </footer>
        </article>
    `;
}
