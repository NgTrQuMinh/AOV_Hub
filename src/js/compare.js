/**
 * compare.js - Trang So sánh Tướng (pages/compare.html)
 * Phụ trách: Người 4
 *
 * Trang gồm 2 khối rỗng do file này vẽ:
 *   #compare-select : 2 ô <select> chọn tướng (Tướng 1 / Tướng 2)
 *   #compare-table  : bảng so sánh các chỉ số, chỉ số cao hơn được tô nổi
 *
 * Ngoài bảng còn 2 khối (HTML sẽ thêm sau, JS tự tạo nếu chưa có):
 *   #score-summary  : bảng điểm tổng hợp (Sống sót / Sát thương / Cơ động)
 *   #compare-summary: nhận xét tự động sinh từ dữ liệu 2 tướng
 *
 * Lựa chọn của người dùng được lưu vào aov_compare ([id, id], tối đa 2) qua
 * storage.js (getCompare/setCompare/COMPARE_LIMIT) nên F5 hay mở lại trang
 * vẫn giữ nguyên cặp tướng đang so sánh.
 *
 * Phụ thuộc: loadData.js + config.js (loadData, DATA_PATH), components.js
 * (escapeHtml, imageUrl, handleImageError, renderNotFound, DIFFICULTY_LABEL),
 * storage.js (getCompare, setCompare, COMPARE_LIMIT). Không cần search.js.
 */

/* Các chỉ số lấy từ hero.stats trong heroes.json. Thứ tự mảng là thứ tự dòng
   hiển thị trong bảng. Độ khó (hero.difficulty) là dòng riêng bên dưới vì nó
   không nằm trong stats và không phải "cao hơn = tốt hơn" nên không tô nổi. */
const COMPARE_STAT_ROWS = [
    { key: 'hp', label: 'Máu' },
    { key: 'attack', label: 'Sát thương' },
    { key: 'defense', label: 'Giáp' },
    { key: 'speed', label: 'Tốc độ' },
];

/* Nhãn + class CSS của từng vai trò tướng (dùng cho huy hiệu role). */
const ROLE_META = {
    'Đấu sĩ': { label: 'Đấu sĩ', className: 'role-dausi' },
    'Sát thủ': { label: 'Sát thủ', className: 'role-sathu' },
    'Xạ thủ': { label: 'Xạ thủ', className: 'role-xathu' },
    'Pháp sư': { label: 'Pháp sư', className: 'role-phapsu' },
    'Trợ thủ': { label: 'Trợ thủ', className: 'role-trothu' },
    'Đỡ đòn': { label: 'Đỡ đòn', className: 'role-dodon' },
};

/* 3 nhóm điểm tổng hợp tính từ stats (không tính skill/build).
   - key : tên nhóm trong code
   - label: tên hiển thị
   - word : từ dùng trong câu nhận xét ("thiên về ...", "... hơn") */
const COMPARE_SCORE_GROUPS = [
    { key: 'survival', label: 'Sống sót', word: 'chịu đòn', better: 'bền hơn' },
    { key: 'damage', label: 'Sát thương', word: 'sát thương', better: 'sát thương hơn' },
    { key: 'mobility', label: 'Cơ động', word: 'cơ động', better: 'cơ động hơn' },
];

/* Chênh lệch z-score dưới ngưỡng này được coi là "ngang nhau".
   Dùng z-score thay vì điểm hiển thị vì điểm đã chuẩn hoá theo max nên
   các chỉ số chênh lệch ít (vd. tốc độ) luôn sát 100 và bị coi là hơn kém. */
const COMPARE_STRENGTH_TIE = 0.25;

/* z-score cao nhất dưới ngưỡng này nghĩa là tướng không nổi trội nhóm nào. */
const COMPARE_STRENGTH_MIN = 0.3;

const COMPARE_EMPTY_MESSAGE = 'Chọn đủ 2 tướng để bắt đầu so sánh.';
const COMPARE_ERROR_MESSAGE = 'Không tải được dữ liệu';
const COMPARE_DUPLICATE_MESSAGE = 'Hai ô không được chọn cùng một tướng.';

/* Dữ liệu JSON đã nạp + Map tra cứu theo id, khai báo ngoài hàm để các hàm vẽ
   dùng lại mà không phải nạp lại heroes.json. */
let compareHeroes = [];
let compareHeroIndex = new Map();

/* true khi đã nạp xong heroes.json; trước đó renderCompareTable() bỏ qua để
   không vẽ nhầm ra "Không tải được dữ liệu" lúc trang vừa mở. */
let compareDataReady = false;

/* Khối do JS tự tạo (id score-summary / compare-summary) để dùng được ngay
   khi HTML chưa thêm; nếu sau này HTML có sẵn thì JS ưu tiên phần tử đó. */
const compareAutoBlocks = new Map();

/**
 * Gom heroes.json thành Map<id, object> để tra cứu O(1) khi đối chiếu id lưu
 * trong LocalStorage / trên <select> với dữ liệu thật.
 * @param {Array} list dữ liệu heroes.json (có thể rỗng).
 * @returns {Map<string, object>}
 */
function buildCompareIndex(list) {
    const index = new Map();

    if (!Array.isArray(list)) return index;

    list.forEach((hero) => {
        if (!hero || typeof hero !== 'object') return;
        if (hero.id === null || hero.id === undefined) return;

        // Khoá là String(id): id trong JSON là số còn giá trị <select> là chuỗi.
        index.set(String(hero.id), hero);
    });

    return index;
}

/** @returns {HTMLSelectElement[]} 2 ô chọn tướng đang có trong DOM. */
function getCompareSelects() {
    return Array.prototype.slice.call(document.querySelectorAll('.compare-picker__select'));
}

/**
 * Đọc 2 ô <select> thành danh sách id đã chọn (bỏ qua ô còn để trống).
 * @returns {string[]} tối đa 2 phần tử.
 */
function readCompareSelectIds() {
    return getCompareSelects()
        .map((select) => select.value)
        .filter((value) => value !== '');
}

/**
 * Khoá option trùng với tướng đã chọn ở ô đối diện, tránh chọn 1 tướng 2 lần.
 * @param {HTMLSelectElement} select
 * @param {string} value giá trị đang chọn ở ô còn lại.
 */
function disableCompareOption(select, value) {
    // select.options có thể undefined nếu DOM mini / select không có option
    // (một số thư viện cũ), duyệt qua mảng rỗng cho an toàn.
    Array.prototype.forEach.call(select.options || [], (option) => {
        option.disabled = option.value !== '' && option.value === value;
    });
}

/** Đồng bộ trạng thái khoá/mở option của 2 ô <select> theo lựa chọn hiện tại. */
function syncCompareSelectOptions() {
    const selects = getCompareSelects();

    if (selects.length < 2) return;

    disableCompareOption(selects[0], selects[1].value);
    disableCompareOption(selects[1], selects[0].value);
}

/**
 * Vẽ danh sách <option> tướng (sắp xếp theo tên A → Z kiểu tiếng Việt).
 * @returns {string} HTML string.
 */
function renderCompareOptions() {
    return compareHeroes
        .slice()
        .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'vi', { sensitivity: 'base' }))
        .map((hero) => `<option value="${escapeHtml(hero.id)}">${escapeHtml(hero.name)}</option>`)
        .join('');
}

/**
 * Vẽ 2 ô <select> chọn tướng vào #compare-select.
 * @param {Array} selectedIds id tướng cần chọn sẵn (từ getCompare()).
 * @returns {Element|null} vùng chứa, null nếu trang không có.
 */
function renderCompareSelect(selectedIds) {
    const box = document.getElementById('compare-select');
    if (!box) return null;

    const selected = Array.isArray(selectedIds) ? selectedIds : [];
    const options = renderCompareOptions();

    box.innerHTML = `
        <div class="compare-picker">
            <div class="compare-picker__slot">
                <label class="compare-picker__label" for="compare-hero-1">Tướng 1</label>
                <select class="compare-picker__select" id="compare-hero-1">
                    <option value="">— Chọn tướng —</option>
                    ${options}
                </select>
            </div>
            <span class="compare-picker__vs" aria-hidden="true">VS</span>
            <div class="compare-picker__slot">
                <label class="compare-picker__label" for="compare-hero-2">Tướng 2</label>
                <select class="compare-picker__select" id="compare-hero-2">
                    <option value="">— Chọn tướng —</option>
                    ${options}
                </select>
            </div>
        </div>
    `;

    // Gán lại 2 tướng đã lưu; func-only ở đây vì option có thể chưa đủ nếu
    // LocalStorage giữ id không còn trong heroes.json (khi đó value không khớp
    // option nào, trình duyệt tự rơi về ô trống — chấp nhận được).
    getCompareSelects().forEach((select, index) => {
        if (selected[index] === undefined) return;
        select.value = String(selected[index]);
    });

    return box;
}

/**
 * Chuẩn hoá 1 chỉ số về number, trả null nếu thiếu/không hợp lệ
 * (undefined / null / "" đều coi là "không có dữ liệu", khác với giá trị 0).
 * @param {*} raw
 * @returns {number|null}
 */
function toCompareNumber(raw) {
    if (raw === null || raw === undefined || raw === '') return null;

    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

/**
 * Danh sách role của 1 tướng (heroes.json để role là mảng).
 * @param {object} hero
 * @returns {string[]}
 */
function getHeroRoles(hero) {
    if (!hero) return [];

    const roles = Array.isArray(hero.role) ? hero.role : (hero.role ? [hero.role] : []);

    return roles.filter((role) => typeof role === 'string' && role !== '');
}

/**
 * Role chính của tướng (phần tử đầu) - dùng để tra TB role và so sánh.
 * @param {object} hero
 * @returns {string}
 */
function getPrimaryRole(hero) {
    return getHeroRoles(hero)[0] || '';
}

/**
 * Meta của 1 role (label + className), trả về object rỗng nếu role lạ.
 * @param {string} role
 * @returns {{label: string, className: string}}
 */
function getRoleMeta(role) {
    return ROLE_META[role] || { label: role || '', className: '' };
}

/**
 * Role chung của 2 tướng (dùng để viết nhận xét "cùng vai trò").
 * @param {object} heroA
 * @param {object} heroB
 * @returns {string} role chung, chuỗi rỗng nếu khác role.
 */
function getSharedRole(heroA, heroB) {
    const rolesA = getHeroRoles(heroA);

    return getHeroRoles(heroB).find((role) => rolesA.indexOf(role) !== -1) || '';
}

/**
 * Giá trị lớn nhất của từng chỉ số trên toàn bộ danh sách tướng (dùng chuẩn hoá
 * thanh tiến trình và điểm tổng hợp).
 * @param {Array} heroes danh sách tướng.
 * @returns {{hp: number, attack: number, defense: number, speed: number}}
 */
function getStatMax(heroes) {
    const max = { hp: 0, attack: 0, defense: 0, speed: 0 };
    const list = Array.isArray(heroes) ? heroes : [];

    list.forEach((hero) => {
        if (!hero || !hero.stats) return;

        COMPARE_STAT_ROWS.forEach((row) => {
            const value = toCompareNumber(hero.stats[row.key]);
            if (value !== null && value > max[row.key]) max[row.key] = value;
        });
    });

    return max;
}

/**
 * Trung bình từng chỉ số của các tướng cùng role (làm tròn số nguyên).
 * Tướng có nhiều role được tính vào mọi role của nó.
 * @param {Array} heroes danh sách tướng.
 * @param {string} role role cần tính TB.
 * @returns {{hp: number, attack: number, defense: number, speed: number}}
 */
function getRoleAverage(heroes, role) {
    const list = Array.isArray(heroes) ? heroes : [];
    const sum = { hp: 0, attack: 0, defense: 0, speed: 0 };
    const count = { hp: 0, attack: 0, defense: 0, speed: 0 };

    list.forEach((hero) => {
        if (!hero || !hero.stats) return;
        if (getHeroRoles(hero).indexOf(role) === -1) return;

        COMPARE_STAT_ROWS.forEach((row) => {
            const value = toCompareNumber(hero.stats[row.key]);
            if (value === null) return;

            sum[row.key] += value;
            count[row.key] += 1;
        });
    });

    const average = { hp: 0, attack: 0, defense: 0, speed: 0 };

    COMPARE_STAT_ROWS.forEach((row) => {
        average[row.key] = count[row.key] ? Math.round(sum[row.key] / count[row.key]) : 0;
    });

    return average;
}

/**
 * Giá trị lớn nhất của từng chỉ số trong các chỉ số, dùng để tô nổi ô thắng.
 * Trả null khi thiếu dữ liệu so sánh (ít hơn 2 giá trị) hoặc tất cả bằng nhau
 * (không ai thực sự "cao hơn").
 * @param {Array<number|null>} values
 * @returns {number|null}
 */
function getCompareBestValue(values) {
    const numbers = values.filter((value) => value !== null);

    if (numbers.length < 2) return null;

    const max = Math.max(...numbers);
    if (numbers.every((value) => value === max)) return null;

    return max;
}

/**
 * Chuẩn bị dữ liệu 1 dòng chỉ số cho từng tướng: value gốc, % so với max,
 * % chênh lệch so với TB role và cờ thắng.
 * @param {Array} heroes 2 tướng.
 * @param {object} row dòng chỉ số { key, label }.
 * @param {object} statMax kết quả getStatMax().
 * @param {Array} roleAvgs mảng TB role tương ứng từng tướng.
 * @returns {Array<object>} dữ liệu 1 ô cho mỗi tướng.
 */
function buildCompareRowData(heroes, row, statMax, roleAvgs) {
    const values = heroes.map((hero) => toCompareNumber(hero?.stats?.[row.key]));
    const max = statMax[row.key] || 0;

    return heroes.map((hero, index) => {
        const value = values[index];
        const other = values[index === 0 ? 1 : 0];
        const average = roleAvgs[index] ? roleAvgs[index][row.key] : 0;

        return {
            value: value,
            // % so với giá trị cao nhất trong toàn bộ tướng (độ dài thanh)
            percent: value !== null && max > 0 ? (value / max) * 100 : 0,
            // % chênh lệch so với TB role của tướng đó
            diffVsRole: value !== null && average > 0
                ? Math.round(((value - average) / average) * 100)
                : null,
            // thắng khi cao hơn tướng còn lại, hòa thì cả hai không thắng
            isWinner: value !== null && other !== null && value > other,
        };
    });
}

/**
 * Vẽ 1 dòng chỉ số: giá trị + thanh tiến trình + % so với TB role trong cùng ô.
 * Số là text node đầu tiên của <td> (không bọc span) để test đọc được giá trị.
 * @param {string} label tên chỉ số.
 * @param {Function} format hàm định dạng giá trị (không nhận null).
 * @param {Array} cells dữ liệu ô từ buildCompareRowData().
 * @returns {string} HTML string.
 */
function renderCompareStatRow(label, format, cells) {
    const valueCells = cells
        .map((cell) => {
            const text = cell.value === null ? '—' : format(cell.value);
            const width = Math.max(0, Math.min(100, cell.percent));
            const diff = cell.diffVsRole;
            const sign = diff === null ? '' : diff > 0 ? ' positive' : diff < 0 ? ' negative' : '';
            const diffText = diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff}%`;

            return `
                <td class="compare-table__value${cell.isWinner ? ' is-best' : ''}">
                    ${escapeHtml(text)}
                    ${cell.isWinner ? '<span class="compare-table__best" aria-hidden="true">▲</span>' : ''}
                    <div class="stat-bar" aria-hidden="true">
                        <div class="stat-bar-fill" style="width: ${width.toFixed(1)}%"></div>
                    </div>
                    <span class="stat-diff${sign}" title="so với TB role">${escapeHtml(diffText)}</span>
                </td>
            `;
        })
        .join('');

    return `
        <tr class="compare-table__row">
            <th scope="row" class="compare-table__label">${escapeHtml(label)}</th>
            ${valueCells}
        </tr>
    `;
}

/**
 * Vẽ 1 dòng chỉ số đơn giản (dùng cho dòng Độ khó: không tô nổi, không có thanh).
 * @param {string} label tên chỉ số.
 * @param {Array<number|null>} values giá trị của từng tướng theo đúng thứ tự cột.
 * @param {Function} format hàm định dạng giá trị (không nhận null).
 * @param {boolean} [highlight=true] có tô nổi giá trị cao nhất hay không.
 * @returns {string} HTML string.
 */
function renderCompareRow(label, values, format, highlight = true) {
    const bestValue = highlight ? getCompareBestValue(values) : null;

    const cells = values
        .map((value) => {
            const isBest = bestValue !== null && value === bestValue;
            const text = value === null ? '—' : format(value);

            return `
                <td class="compare-table__value${isBest ? ' is-best' : ''}">
                    ${escapeHtml(text)}
                    ${isBest ? '<span class="compare-table__best" aria-hidden="true">▲</span>' : ''}
                </td>
            `;
        })
        .join('');

    return `
        <tr class="compare-table__row">
            <th scope="row" class="compare-table__label">${escapeHtml(label)}</th>
            ${cells}
        </tr>
    `;
}

/**
 * Vẽ các huy hiệu role của 1 tướng (mỗi role 1 huy hiệu).
 * @param {object} hero
 * @returns {string} HTML string.
 */
function renderRoleBadges(hero) {
    return getHeroRoles(hero)
        .map((role) => {
            const meta = getRoleMeta(role);

            return `<span class="hero-role-badge ${escapeHtml(meta.className)}">${escapeHtml(meta.label)}</span>`;
        })
        .join(' ');
}

/**
 * Vẽ hàng tiêu đề: ảnh + tên + huy hiệu role của từng tướng.
 * @param {Array} heroes đúng 2 tướng.
 * @returns {string} HTML string.
 */
function renderCompareHead(heroes) {
    const heroCells = heroes
        .map((hero) => `
            <th scope="col" class="compare-table__hero">
                <a class="compare-table__hero-link" href="${BASE_PATH}src/pages/hero-detail.html?id=${escapeHtml(hero.id)}">
                    <img
                        class="compare-table__img"
                        src="${escapeHtml(imageUrl(hero.image))}"
                        alt="${escapeHtml(hero.name)}"
                        loading="lazy"
                        onerror="handleImageError(this)"
                    >
                    <span class="compare-table__name">${escapeHtml(hero.name)}</span>
                </a>
                ${renderRoleBadges(hero)}
            </th>
        `)
        .join('');

    return `
        <tr>
            <th scope="col" class="compare-table__corner">Chỉ số</th>
            ${heroCells}
        </tr>
    `;
}

/**
 * Điểm thô (chưa chuẩn hoá) của 1 tướng theo 3 nhóm:
 * Sống sót = hp*0.6 + defense*0.4, Sát thương = attack, Cơ động = speed.
 * @param {object} hero
 * @returns {{survival: number, damage: number, mobility: number}}
 */
function getRawScores(hero) {
    const stats = hero?.stats || {};

    return {
        survival: (toCompareNumber(stats.hp) || 0) * 0.6
            + (toCompareNumber(stats.defense) || 0) * 0.4,
        damage: toCompareNumber(stats.attack) || 0,
        mobility: toCompareNumber(stats.speed) || 0,
    };
}

/**
 * Điểm tổng hợp của 1 tướng (thang 0-100), chỉ tính từ stats:
 * Sống sót = hp*0.6 + defense*0.4, Sát thương = attack, Cơ động = speed
 * (mỗi cái chuẩn hoá theo giá trị max tương ứng).
 * @param {object} hero
 * @param {object} statMax kết quả getStatMax().
 * @param {number} survivalMax giá trị max của hp*0.6 + defense*0.4.
 * @returns {{survival: number, damage: number, mobility: number}}
 */
function getHeroScores(hero, statMax, survivalMax) {
    const raw = getRawScores(hero);
    const scale = (value, max) => (max > 0 ? Math.round((value / max) * 100) : 0);

    return {
        survival: scale(raw.survival, survivalMax),
        damage: scale(raw.damage, statMax.attack),
        mobility: scale(raw.mobility, statMax.speed),
    };
}

/**
 * Max của công thức sống sót (hp*0.6 + defense*0.4) trên toàn bộ tướng.
 * @param {Array} heroes
 * @returns {number}
 */
function getSurvivalMax(heroes) {
    const list = Array.isArray(heroes) ? heroes : [];
    let max = 0;

    list.forEach((hero) => {
        if (!hero || !hero.stats) return;

        const hp = toCompareNumber(hero.stats.hp) || 0;
        const defense = toCompareNumber(hero.stats.defense) || 0;
        const value = hp * 0.6 + defense * 0.4;

        if (value > max) max = value;
    });

    return max;
}

/**
 * Trung bình (mean) + độ lệch chuẩn (std) điểm thô của từng nhóm trên toàn
 * bộ danh sách tướng. std = 0 được thay bằng 1 để tránh chia cho 0.
 * @param {Array} heroes
 * @returns {{[key: string]: {mean: number, std: number}}}
 */
function getGroupStats(heroes) {
    const list = (Array.isArray(heroes) ? heroes : []).filter((hero) => hero && hero.stats);
    const stats = {};

    COMPARE_SCORE_GROUPS.forEach((group) => {
        const values = list.map((hero) => getRawScores(hero)[group.key]);

        if (!values.length) {
            stats[group.key] = { mean: 0, std: 1 };
            return;
        }

        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
        const std = Math.sqrt(variance);

        stats[group.key] = { mean, std: std > 0 ? std : 1 };
    });

    return stats;
}

/**
 * Z-score (độ nổi trội so với mặt bằng chung) của 1 tướng theo từng nhóm.
 * @param {object} hero
 * @param {object} groupStats kết quả getGroupStats().
 * @returns {{survival: number, damage: number, mobility: number}}
 */
function getStrength(hero, groupStats) {
    const raw = getRawScores(hero);
    const strength = {};

    COMPARE_SCORE_GROUPS.forEach((group) => {
        const { mean, std } = groupStats[group.key] || { mean: 0, std: 1 };
        strength[group.key] = (raw[group.key] - mean) / std;
    });

    return strength;
}

/**
 * Nhóm có z-score cao nhất của 1 tướng.
 * @param {object} strength kết quả getStrength().
 * @returns {{group: object, value: number}} nhóm + z-score cao nhất.
 */
function getTopStrengthGroup(strength) {
    return COMPARE_SCORE_GROUPS.reduce((top, group) => (
        strength[group.key] > top.value
            ? { group, value: strength[group.key] }
            : top
    ), { group: COMPARE_SCORE_GROUPS[0], value: strength[COMPARE_SCORE_GROUPS[0].key] });
}

/**
 * Sinh các câu nhận xét tự động (mỗi câu là 1 phần tử mảng).
 * @param {object} heroA
 * @param {object} heroB
 * @returns {string[]}
 */
function buildSummaryParts(heroA, heroB) {
    if (!heroA || !heroB) return [];

    const nameA = heroA.name || 'Tướng 1';
    const nameB = heroB.name || 'Tướng 2';
    const parts = [];

    // 1) Đếm số chỉ số thắng của mỗi bên
    let winsA = 0;
    let winsB = 0;

    COMPARE_STAT_ROWS.forEach((row) => {
        const valueA = toCompareNumber(heroA?.stats?.[row.key]);
        const valueB = toCompareNumber(heroB?.stats?.[row.key]);

        if (valueA === null || valueB === null) return;
        if (valueA > valueB) winsA += 1;
        else if (valueB > valueA) winsB += 1;
    });

    const total = COMPARE_STAT_ROWS.length;

    if (winsA > winsB) parts.push(`${nameA} thắng ${winsA}/${total} chỉ số.`);
    else if (winsB > winsA) parts.push(`${nameB} thắng ${winsB}/${total} chỉ số.`);
    else parts.push(`Hòa ${winsA}/${total} chỉ số.`);

    // 2) So từng nhóm bằng z-score: chỉ chênh lệch đủ lớn so với mặt bằng
    //    chung mới tính là hơn kém, tránh việc chỉ số ít chênh lệch (tốc độ)
    //    luôn bị coi là "nhỉnh hơn".
    const groupStats = getGroupStats(compareHeroes);
    const strengthA = getStrength(heroA, groupStats);
    const strengthB = getStrength(heroB, groupStats);

    COMPARE_SCORE_GROUPS.forEach((group) => {
        const diff = strengthA[group.key] - strengthB[group.key];

        if (Math.abs(diff) < COMPARE_STRENGTH_TIE) {
            parts.push(`${group.label}: ngang nhau.`);
            return;
        }

        parts.push(`${group.label}: ${diff > 0 ? nameA : nameB} nhỉnh hơn.`);
    });

    // 3) Câu nhận xét theo vai trò
    const sharedRole = getSharedRole(heroA, heroB);

    if (sharedRole) {
        const meta = getRoleMeta(sharedRole);
        const details = [];

        COMPARE_SCORE_GROUPS.forEach((group) => {
            const diff = strengthA[group.key] - strengthB[group.key];

            if (Math.abs(diff) < COMPARE_STRENGTH_TIE) return;
            details.push(`${diff > 0 ? nameA : nameB} ${group.better}`);
        });

        if (details.length) {
            parts.push(`Cùng vai trò ${meta.label}, ${details.join(', ')}.`);
        } else {
            parts.push(`Cùng vai trò ${meta.label}, hai tướng khá cân bằng.`);
        }
    } else {
        // Nhóm nổi trội nhất theo z-score; dưới ngưỡng MIN là "cân bằng".
        const topA = getTopStrengthGroup(strengthA);
        const topB = getTopStrengthGroup(strengthB);
        const tendencyA = topA.value >= COMPARE_STRENGTH_MIN ? topA.group : null;
        const tendencyB = topB.value >= COMPARE_STRENGTH_MIN ? topB.group : null;

        if (!tendencyA && !tendencyB) {
            parts.push(`Cả ${nameA} và ${nameB} đều cân bằng.`);
        } else if (tendencyA && tendencyB && tendencyA.key === tendencyB.key) {
            const diff = strengthA[tendencyA.key] - strengthB[tendencyB.key];

            if (Math.abs(diff) < COMPARE_STRENGTH_TIE) {
                parts.push(`Cả hai đều thiên về ${tendencyA.word}.`);
            } else {
                const leader = diff > 0 ? nameA : nameB;
                parts.push(`Cả hai đều thiên về ${tendencyA.word}, nhưng ${leader} nổi trội hơn.`);
            }
        } else {
            const labelA = tendencyA ? `thiên về ${tendencyA.word}` : 'cân bằng';
            const labelB = tendencyB ? `thiên về ${tendencyB.word}` : 'cân bằng';
            parts.push(`${nameA} ${labelA}, ${nameB} ${labelB}.`);
        }
    }

    return parts;
}

/**
 * Nhận xét tự động về 2 tướng (gộp các câu thành 1 chuỗi).
 * @param {object} heroA
 * @param {object} heroB
 * @returns {string}
 */
function buildSummary(heroA, heroB) {
    return buildSummaryParts(heroA, heroB).join(' ');
}

/**
 * Dựng bảng so sánh cho đúng 2 tướng.
 * @param {Array} heroes mảng 2 object theo schema heroes.json.
 * @returns {string} HTML string.
 */
function buildCompareTable(heroes) {
    const statMax = getStatMax(compareHeroes);
    // TB role của từng tướng (theo role chính) để tính % chênh lệch.
    const roleAvgs = heroes.map((hero) => getRoleAverage(compareHeroes, getPrimaryRole(hero)));

    const statRows = COMPARE_STAT_ROWS
        .map((row) => {
            const cells = buildCompareRowData(heroes, row, statMax, roleAvgs);

            return renderCompareStatRow(row.label, (value) => value.toLocaleString('vi-VN'), cells);
        })
        .join('');

    // Hàng "Vai trò" đặt đầu tbody; dùng class phụ --role để không trùng
    // selector .compare-table__row của các dòng chỉ số.
    const roleCells = heroes
        .map((hero) => `<td class="compare-table__role">${renderRoleBadges(hero) || '—'}</td>`)
        .join('');
    const roleRow = `
        <tr class="compare-table__row compare-table__row--role">
            <th scope="row" class="compare-table__label">Vai trò</th>
            ${roleCells}
        </tr>
    `;

    // Độ khó hiển thị theo nhãn ("Dễ"..."Cực khó") và không tô nổi vì cao hơn
    // nghĩa là khó chơi hơn chứ không phải mạnh hơn.
    const difficultyValues = heroes.map((hero) => toCompareNumber(hero?.difficulty));
    const difficultyRow = renderCompareRow(
        'Độ khó',
        difficultyValues,
        (value) => DIFFICULTY_LABEL[value] || `Độ khó ${value}`,
        false,
    );

    return `
        <table class="compare-table">
            <thead>${renderCompareHead(heroes)}</thead>
            <tbody>${roleRow}${statRows}${difficultyRow}</tbody>
        </table>
    `;
}

/**
 * Tìm (hoặc tự tạo) khối theo id để đổ nội dung vào.
 * @param {string} id id của khối (score-summary / compare-summary).
 * @param {string} className class gợi ý khi JS tự tạo.
 * @returns {Element|null}
 */
function resolveSummaryBlock(id, className) {
    const existing = document.getElementById(id);

    // HTML đã có sẵn phần tử -> dùng nó và gỡ bản JS tự tạo (nếu có).
    if (existing && existing.dataset.compareAuto !== 'true') {
        const auto = compareAutoBlocks.get(id);
        if (auto && auto.parentNode) auto.parentNode.removeChild(auto);
        compareAutoBlocks.delete(id);

        return existing;
    }

    if (existing) return existing;

    // Chưa có -> tự tạo, đặt ngay sau #compare-table để hiện ngay kể cả khi
    // HTML chưa kịp thêm khối này.
    const block = document.createElement('div');
    block.id = id;
    block.className = className;
    block.dataset.compareAuto = 'true';

    const tableBox = document.getElementById('compare-table');
    const parent = tableBox && tableBox.parentNode ? tableBox.parentNode : document.body;
    parent.insertBefore(block, tableBox ? tableBox.nextSibling : null);

    compareAutoBlocks.set(id, block);

    return block;
}

/**
 * Vẽ khối điểm tổng hợp (Sống sót / Sát thương / Cơ động) vào #score-summary.
 * @param {Array} heroes 2 tướng.
 */
function renderScoreSummary(heroes) {
    const box = resolveSummaryBlock('score-summary', 'compare-score');
    if (!box) return;

    const statMax = getStatMax(compareHeroes);
    const survivalMax = getSurvivalMax(compareHeroes);

    const columns = heroes
        .map((hero) => {
            const scores = getHeroScores(hero, statMax, survivalMax);
            const items = COMPARE_SCORE_GROUPS
                .map((group) => {
                    const score = scores[group.key];

                    return `
                        <div class="compare-score__item">
                            <span class="compare-score__label">${escapeHtml(group.label)}</span>
                            <span class="stat-bar" aria-hidden="true">
                                <span class="stat-bar-fill" style="width: ${score}%"></span>
                            </span>
                            <span class="compare-score__value">${score}</span>
                        </div>
                    `;
                })
                .join('');

            const role = getPrimaryRole(hero);
            const meta = getRoleMeta(role);

            return `
                <div class="compare-score__col">
                    <div class="compare-score__name">
                        ${escapeHtml(hero.name || '')}
                        ${role ? `<span class="hero-role-badge ${escapeHtml(meta.className)}">${escapeHtml(meta.label)}</span>` : ''}
                    </div>
                    ${items}
                </div>
            `;
        })
        .join('');

    box.innerHTML = `<div class="compare-score__grid">${columns}</div>`;
}

/**
 * Vẽ khối nhận xét tự động vào #compare-summary.
 * @param {Array} heroes 2 tướng.
 */
function renderCompareSummary(heroes) {
    const box = resolveSummaryBlock('compare-summary', 'compare-summary');
    if (!box) return;

    const parts = buildSummaryParts(heroes[0], heroes[1]);

    box.innerHTML = parts
        .map((part) => `<p class="compare-summary__text">${escapeHtml(part)}</p>`)
        .join('');
}

/**
 * Vẽ bảng so sánh + 2 khối tổng hợp/nhận xét theo danh sách id.
 * @param {Array} ids id 2 tướng (mặc định đọc từ 2 ô <select>).
 * @returns {Element|null} vùng chứa, null nếu trang không có.
 */
function renderCompareTable(ids) {
    const tableBox = document.getElementById('compare-table');
    const scoreBox = document.getElementById('score-summary');
    const summaryBox = document.getElementById('compare-summary');

    if (!compareDataReady) return tableBox;

    // loadData() trả mảng rỗng khi fetch lỗi: báo lỗi tải dữ liệu thay vì
    // báo "chưa chọn đủ 2 tướng".
    if (!compareHeroes.length) {
        if (tableBox) tableBox.innerHTML = renderNotFound(COMPARE_ERROR_MESSAGE);
        if (scoreBox) scoreBox.innerHTML = '';
        if (summaryBox) summaryBox.innerHTML = '';

        return tableBox;
    }

    const list = Array.isArray(ids) ? ids : readCompareSelectIds();
    const heroes = list
        .map((id) => compareHeroIndex.get(String(id)))
        .filter((hero) => Boolean(hero))
        .slice(0, COMPARE_LIMIT);

    if (heroes.length < 2) {
        if (tableBox) tableBox.innerHTML = renderNotFound(COMPARE_EMPTY_MESSAGE);
        if (scoreBox) scoreBox.innerHTML = '';
        if (summaryBox) summaryBox.innerHTML = '';

        return tableBox;
    }

    if (tableBox) tableBox.innerHTML = buildCompareTable(heroes);

    renderScoreSummary(heroes);
    renderCompareSummary(heroes);

    return tableBox;
}

/**
 * Đổi 1 trong 2 ô <select>: lưu lựa chọn rồi vẽ lại bảng.
 */
function handleCompareSelectChange() {
    const ids = readCompareSelectIds();

    // Chặn trùng phòng khi LocalStorage bị sửa tay (bình thường option đã bị khoá).
    if (new Set(ids).size !== ids.length) {
        const tableBox = document.getElementById('compare-table');
        if (tableBox) tableBox.innerHTML = renderNotFound(COMPARE_DUPLICATE_MESSAGE);
        return;
    }

    setCompare(ids);
    syncCompareSelectOptions();
    renderCompareTable(ids);
}

/**
 * Khởi tạo trang compare.html: nạp heroes.json, vẽ 2 ô chọn + bảng so sánh
 * theo cặp tướng đã lưu trong aov_compare.
 * Chạy sau DOMContentLoaded nên #compare-select / #compare-table đã tồn tại.
 */
async function initComparePage() {
    const selectBox = document.getElementById('compare-select');
    const tableBox = document.getElementById('compare-table');

    // Trang khác không có 2 khối này thì bỏ qua.
    if (!selectBox && !tableBox) return;

    const heroes = await loadHeroes();
    compareHeroes = Array.isArray(heroes) ? heroes : [];
    compareHeroIndex = buildCompareIndex(compareHeroes);
    compareDataReady = true;

    const selected = getCompare().slice(0, COMPARE_LIMIT);

    // Vẽ ô chọn trước, gắn sự kiện 1 lần (sau này chỉ đổi value, không vẽ lại).
    renderCompareSelect(selected);
    syncCompareSelectOptions();

    getCompareSelects().forEach((select) => {
        select.addEventListener('change', handleCompareSelectChange);
    });

    renderCompareTable(selected);
}

document.addEventListener('DOMContentLoaded', initComparePage);
