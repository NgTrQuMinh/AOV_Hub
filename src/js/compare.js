/**
 * compare.js - Trang So sánh Tướng (pages/compare.html)
 * Phụ trách: Người 4
 *
 * Trang gồm 2 khối rỗng do file này vẽ:
 *   #compare-select : 2 ô <select> chọn tướng (Tướng 1 / Tướng 2)
 *   #compare-table  : bảng so sánh các chỉ số, chỉ số cao hơn được tô nổi
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
    Array.prototype.forEach.call(select.options, (option) => {
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
 * Giá trị cao nhất trong các chỉ số, dùng để tô nổi ô thắng.
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
 * Vẽ 1 dòng chỉ số của bảng so sánh.
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
 * Vẽ hàng tiêu đề: ảnh + tên từng tướng (bấm vào mở trang chi tiết).
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
 * Dựng bảng so sánh cho đúng 2 tướng.
 * @param {Array} heroes mảng 2 object theo schema heroes.json.
 * @returns {string} HTML string.
 */
function buildCompareTable(heroes) {
    const statRows = COMPARE_STAT_ROWS
        .map((row) => {
            const values = heroes.map((hero) => toCompareNumber(hero?.stats?.[row.key]));
            return renderCompareRow(row.label, values, (value) => value.toLocaleString('vi-VN'));
        })
        .join('');

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
            <tbody>${statRows}${difficultyRow}</tbody>
        </table>
    `;
}

/**
 * Vẽ bảng so sánh vào #compare-table theo danh sách id.
 * @param {Array} ids id 2 tướng (mặc định đọc từ 2 ô <select>).
 * @returns {Element|null} vùng chứa, null nếu trang không có.
 */
function renderCompareTable(ids) {
    const tableBox = document.getElementById('compare-table');
    if (!tableBox) return null;

    if (!compareDataReady) return tableBox;

    // loadData() trả mảng rỗng khi fetch lỗi: báo lỗi tải dữ liệu thay vì
    // báo "chưa chọn đủ 2 tướng".
    if (!compareHeroes.length) {
        tableBox.innerHTML = renderNotFound(COMPARE_ERROR_MESSAGE);
        return tableBox;
    }

    const list = Array.isArray(ids) ? ids : readCompareSelectIds();
    const heroes = list
        .map((id) => compareHeroIndex.get(String(id)))
        .filter((hero) => Boolean(hero))
        .slice(0, COMPARE_LIMIT);

    tableBox.innerHTML = heroes.length < 2
        ? renderNotFound(COMPARE_EMPTY_MESSAGE)
        : buildCompareTable(heroes);

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

    const heroes = await loadData(DATA_PATH.heroes);
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
