/**
 * test-compare-page.cjs - Kiểm tra trang So sánh Tướng (src/pages/compare.html):
 * 2 ô chọn tướng, bảng so sánh, tô nổi chỉ số cao hơn, khoá option trùng, lưu
 * giữ nguyên cặp tướng khi mở lại trang.
 * Chạy: node tools/test-compare-page.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire, unescapeHtml } = require('./mini-dom.cjs');

const PAGE = 'src/pages/compare.html';
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));

/** Chọn 2 tướng có chênh lệch chỉ số rõ để kiểm tra ô tô nổi (máu + sát thương). */
const byAttack = HEROES_JSON.slice().sort((a, b) => Number(a.stats.attack) - Number(b.stats.attack));
const HERO_WEAK = byAttack[0];
const HERO_STRONG = byAttack[byAttack.length - 1];

/* ================= Test runner ================= */

let passed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) {
        passed++;
        console.log('  PASS  ' + name);
    } else {
        failures.push(name + (detail ? ` — ${detail}` : ''));
        console.log('  FAIL  ' + name + (detail ? `\n        ${detail}` : ''));
    }
}

function section(title) {
    console.log('\n== ' + title + ' ==');
}

/* ================= Trợ giúp ================= */

async function openCompare(options = {}) {
    const page = loadPage(Object.assign({ page: PAGE }, options));
    page.run();
    await page.settled();
    return page;
}

function getSelects(page) {
    return Array.from(page.doc.querySelectorAll('.compare-picker__select'));
}

/** Trả [value1, value2] đang hiển thị trong 2 ô chọn. */
function selectedValues(page) {
    return getSelects(page).map((select) => select.value);
}

/** Đặt giá trị cả 2 ô rồi bắn sự kiện change lên ô 1 (handler đọc cả 2 ô). */
async function pickPair(page, idA, idB) {
    const selects = getSelects(page);
    selects[0].value = String(idA);
    selects[1].value = String(idB);
    fire(selects[0], 'change', page.doc);
    await page.settled();
}

/** Các ô <td> theo dòng trong bảng so sánh (từng cột giá trị). */
function readStatCells(page) {
    return page.doc.querySelectorAll('#compare-table .compare-table__value');
}

/** Trích các dòng <tr class="compare-table__row"> từ innerHTML của #compare-table. */
function tableRows(html) {
    return String(html).split('<tr class="compare-table__row">').slice(1);
}

/** Lấy nhãn dòng (th nằm đầu) và danh sách ô giá trị trong 1 dòng. */
function parseRow(rowHtml) {
    const labelMatch = rowHtml.match(/compare-table__label">([^<]*)<\/th>/);
    const cells = [...rowHtml.matchAll(/<td class="compare-table__value( is-best)?">([^<]*)/g)]
        .map((match) => ({ best: Boolean(match[1]), text: unescapeHtml(match[2] || '').trim() }));

    return { label: labelMatch ? unescapeHtml(labelMatch[1]).trim() : '', cells };
}

/* ================= Test ================= */

(async () => {
    /* ---------- 1. Vẽ 2 ô chọn tướng ---------- */
    section('1. Hai ô chọn tướng');
    const base = await openCompare();
    const selects = getSelects(base);

    check('trang vẽ đủ 2 ô <select> tướng',
        selects.length === 2,
        String(selects.length));
    check(`mỗi ô có ${HEROES_JSON.length} tướng + 1 ô trống (mặc định)`,
        selects.every((select) => select.querySelectorAll('option').length === HEROES_JSON.length + 1)
        && selectedValues(base).join(',') === ',');

    const placeholder = selects[0].querySelectorAll('option').find((option) => option.getAttribute('value') === '');
    check('ô trống nằm đầu danh sách (giá trị rỗng)',
        Boolean(placeholder));

    /* ---------- 2. Chưa chọn: báo nhắc ---------- */
    section('2. Bảng khi chưa chọn đủ');
    check('bảng hiện nhắc "Chọn đủ 2 tướng..." khi chưa chọn',
        /Chọn đủ 2 tướng để bắt đầu so sánh/.test(base.el('compare-table').innerHTML),
        base.el('compare-table').innerHTML.slice(0, 80));

    /* ---------- 3. Chọn đủ 2 tướng: bảng + lưu cặp ---------- */
    section('3. So sánh 2 tướng');
    await pickPair(base, HERO_WEAK.id, HERO_STRONG.id);

    check('bảng vẽ tên 2 tướng đã chọn',
        base.el('compare-table').innerHTML.includes(HERO_WEAK.name)
        && base.el('compare-table').innerHTML.includes(HERO_STRONG.name));

    const heroCells = base.doc.querySelectorAll('#compare-table .compare-table__hero-name, #compare-table .compare-table__name');
    check('hàng tiêu đề có thẻ a tới hero-detail cho cả 2 tướng',
        heroCells.length === 2
        && base.el('compare-table').innerHTML.includes(`hero-detail.html?id=${HERO_WEAK.id}`)
        && base.el('compare-table').innerHTML.includes(`hero-detail.html?id=${HERO_STRONG.id}`),
        String(heroCells.length));

    const rows = tableRows(base.el('compare-table').innerHTML).map(parseRow);
    check('bảng đủ 4 dòng chỉ số + 1 dòng độ khó',
        rows.length === 5
        && ['Máu', 'Sát thương', 'Giáp', 'Tốc độ', 'Độ khó'].join(',') === rows.map((row) => row.label).join(','),
        rows.map((row) => row.label).join(','));

    const bestCells = base.doc.querySelectorAll('#compare-table .compare-table__value.is-best');
    check('ô có chỉ số cao hơn được tô nổi (có ít nhất 2 ô is-best)',
        bestCells.length >= 2,
        String(bestCells.length));
    check('tô nổi đúng dòng: mỗi dòng chỉ số chỉ 1 ô is-best (phần còn lại không tô)',
        rows.every((row) => row.cells.filter((cell) => cell.best).length <= 1)
        && rows.some((row) => row.cells.some((cell) => cell.best)),
        rows.map((row) => `${row.label}:${row.cells.filter((c) => c.best).length}`).join(' '));

    const strongAttack = Number(HERO_STRONG.stats.attack);
    const attackRow = rows.find((row) => row.label === 'Sát thương');
    const attackStrongCell = attackRow ? attackRow.cells[1] : null;
    check('giá trị sát thương cao hơn nằm đúng cột của tướng mạnh và được tô nổi',
        Boolean(attackStrongCell)
        && attackStrongCell.best === true
        && attackStrongCell.text === strongAttack.toLocaleString('vi-VN'),
        String(strongAttack));

    const saved = JSON.parse(base.storage.get('aov_compare'));
    check('cặp tướng được lưu vào aov_compare dạng [id, id]',
        Array.isArray(saved) && saved.join(',') === `${HERO_WEAK.id},${HERO_STRONG.id}`,
        String(saved));

    const difficultyLabel = base.runInPage('JSON.stringify(DIFFICULTY_LABEL)');
    const labels = typeof difficultyLabel === 'string' ? Object.values(JSON.parse(difficultyLabel)) : [];
    const difficultyRow = rows.find((row) => row.label === 'Độ khó');
    check('dòng "Độ khó" hiển thị nhãn chữ (Dễ/Vừa/Khó...) thay vì số thô',
        Boolean(difficultyRow)
        && difficultyRow.cells.length === 2
        && difficultyRow.cells.every((cell) => cell.text === '—' || labels.includes(cell.text)),
        String(difficultyRow && difficultyRow.cells.map((cell) => cell.text).join(', ')));

    /* ---------- 4. Mở lại trang: giữ nguyên cặp tướng ---------- */
    section('4. F5 giữ nguyên cặp tướng');
    const reloaded = await openCompare({ storage: base.storage });
    check('mở lại trang vẫn chọn đúng 2 tướng đã lưu',
        selectedValues(reloaded).join(',') === `${HERO_WEAK.id},${HERO_STRONG.id}`,
        selectedValues(reloaded).join(','));
    check('mở lại trang đã vẽ sẵn bảng so sánh cho cặp tướng cũ',
        reloaded.el('compare-table').innerHTML.includes(HERO_WEAK.name)
        && reloaded.el('compare-table').innerHTML.includes(HERO_STRONG.name));

    /* ---------- 5. Chọn 2 ô trùng tướng ---------- */
    section('5. Chọn trùng tướng');
    await pickPair(reloaded, HERO_STRONG.id, HERO_STRONG.id);
    check('2 ô chọn cùng 1 tướng -> báo lỗi trùng lặp',
        /Hai ô không được chọn cùng một tướng/.test(reloaded.el('compare-table').innerHTML),
        reloaded.el('compare-table').innerHTML.slice(0, 80));

    const compareAfter = JSON.parse(reloaded.storage.get('aov_compare'));
    check('lựa chọn trùng không được ghi đè vào aov_compare',
        compareAfter.join(',') === `${HERO_WEAK.id},${HERO_STRONG.id}`,
        String(compareAfter));

    /* ---------- 6. Khoá option trùng ---------- */
    section('6. Khoá option trùng');
    // Lựa chọn hợp lệ (không trùng) để handler chạy syncCompareSelectOptions().
    await pickPair(reloaded, HERO_WEAK.id, HERO_STRONG.id);
    const selectsFinal = getSelects(reloaded);
    const blockedInSecond = selectsFinal[1].querySelectorAll('option')
        .find((option) => option.getAttribute('value') === String(HERO_WEAK.id));
    const blockedInFirst = selectsFinal[0].querySelectorAll('option')
        .find((option) => option.getAttribute('value') === String(HERO_STRONG.id));
    check('mỗi ô khoá đúng option của tướng đã chọn ở ô còn lại (disable)',
        Boolean(blockedInSecond) && blockedInSecond.disabled === true
        && Boolean(blockedInFirst) && blockedInFirst.disabled === true);

    /* ---------- 7. Không lỗi JavaScript ---------- */
    section('7. Không lỗi');
    check('mọi lần mở trang không ném lỗi JavaScript',
        [base, reloaded].every((page) =>
            page.errors.filter((error) => !error.startsWith('console.error')).length === 0),
        [base, reloaded].flatMap((page) => page.errors).join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((failure) => console.log('  - ' + failure));
        process.exitCode = 1;
    }
})();