/**
 * test-heroes-page.cjs - Kiểm tra trang Danh sách tướng (src/pages/heroes.html):
 * lọc (vai trò, độ khó, từ khoá) và sắp xếp A → Z / Z → A.
 * Chạy: node tools/test-heroes-page.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire, unescapeHtml } = require('./mini-dom.cjs');

const PAGE = 'src/pages/heroes.html';
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));

const HEROES_ASC = HEROES_JSON
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));

/** Bản sao của normalizeKeyword() trong search.js: bỏ dấu + chữ thường. */
function normalizeKeyword(text) {
    return String(text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .toLowerCase()
        .trim();
}

/** Tên tướng khớp từ khoá (không phân biệt hoa/thường và dấu), xếp tăng dần theo tên. */
function heroesMatchingKeyword(keyword) {
    return HEROES_ASC
        .filter((hero) => normalizeKeyword(hero.name).includes(normalizeKeyword(keyword)))
        .map((hero) => hero.name);
}

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

/* ================= Trợ giúp đọc kết quả render ================= */

/** Mở trang Danh sách tướng và chờ render xong. */
async function openHeroes(options = {}) {
    const page = loadPage(Object.assign({ page: PAGE }, options));
    page.run();
    await page.settled();
    return page;
}

/** Đổi giá trị một select rồi chờ render lại. */
async function selectOption(page, id, value) {
    const select = page.el(id);
    if (!select) throw new Error('Không tìm thấy #' + id);

    select.value = value;
    fire(select, 'change', page.doc);
    await page.settled();
}

/** Gõ vào ô tìm kiếm rồi chờ render lại. */
async function typeKeyword(page, text) {
    const input = page.el('hero-search');
    if (!input) throw new Error('Không tìm thấy #hero-search');

    input.value = text;
    fire(input, 'input', page.doc);
    await page.settled();
}

/** Đọc tên các thẻ tướng đang render ra DOM (đã giải mã HTML entity do escapeHtml sinh ra). */
function readHeroNames(listEl) {
    return [...listEl.innerHTML.matchAll(/hero-card__name">([^<]*)</g)]
        .map((match) => unescapeHtml(match[1]));
}

(async () => {
    /* ---------- 1. Thanh lọc có đủ ô tìm + 3 select ---------- */
    section('1. Thanh lọc');
    const base = await openHeroes();
    const bar = base.el('hero-filter-bar');

    check('thanh lọc có ô tìm + lọc vai trò + lọc độ khó + select sắp xếp',
        Boolean(base.el('hero-search'))
        && Boolean(base.el('hero-role-filter'))
        && Boolean(base.el('hero-difficulty-filter'))
        && Boolean(base.el('hero-sort-filter')));
    check('select sắp xếp có 3 lựa chọn',
        base.el('hero-sort-filter').querySelectorAll('option').length === 3,
        String(base.el('hero-sort-filter').querySelectorAll('option').length));
    check('mặc định: select sắp xếp = Mặc định',
        base.el('hero-sort-filter').value === 'default',
        base.el('hero-sort-filter').value);
    check('không lọc: hiện đủ tướng theo thứ tự heroes.json',
        readHeroNames(base.el('hero-list')).join(',') === HEROES_JSON.map((h) => h.name).join(','),
        readHeroNames(base.el('hero-list')).join(','));

    /* ---------- 2. Sắp xếp A → Z / Z → A ---------- */
    section('2. Sắp xếp theo tên');

    await selectOption(base, 'hero-sort-filter', 'name-asc');
    check('A → Z: danh sách tăng dần theo tên',
        readHeroNames(base.el('hero-list')).join(',') === HEROES_ASC.map((h) => h.name).join(','),
        readHeroNames(base.el('hero-list')).slice(0, 5).join(', '));
    check('A → Z: đổi cách sắp xếp -> ghi vào URL (?sort=name-asc)',
        new URLSearchParams(base.location.search).get('sort') === 'name-asc',
        base.location.search);

    await selectOption(base, 'hero-sort-filter', 'name-desc');
    check('Z → A: danh sách giảm dần, đúng đảo của A → Z',
        readHeroNames(base.el('hero-list')).join(',') === HEROES_ASC.map((h) => h.name).reverse().join(','),
        readHeroNames(base.el('hero-list')).slice(0, 5).join(', '));

    await selectOption(base, 'hero-sort-filter', 'default');
    check('Mặc định: trả lại thứ tự gốc của heroes.json',
        readHeroNames(base.el('hero-list')).join(',') === HEROES_JSON.map((h) => h.name).join(','));
    check('Mặc định: bỏ tham số sort khỏi URL cho URL gọn',
        !new URLSearchParams(base.location.search).has('sort'),
        base.location.search);

    /* ---------- 3. Sắp xếp cộng với lọc ---------- */
    section('3. Sắp xếp cộng với lọc');
    const combined = await openHeroes();

    await selectOption(combined, 'hero-sort-filter', 'name-asc');
    await selectOption(combined, 'hero-role-filter', 'Xạ thủ');
    const shooters = readHeroNames(combined.el('hero-list'));

    check('lọc vai trò + A → Z: chỉ còn tướng "Xạ thủ"',
        shooters.length > 0
        && shooters.length < HEROES_JSON.length
        && combined.ctx
            && shooters.every((name) => (HEROES_JSON.find((h) => h.name === name) || {}).role.includes('Xạ thủ')),
        shooters.join(', '));
    check('lọc vai trò + A → Z: vẫn tăng dần theo tên',
        shooters.join(',') === shooters.slice().sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' })).join(','),
        shooters.join(', '));

    await typeKeyword(combined, 'a');
    const searched = readHeroNames(combined.el('hero-list'));

    check('lọc từ khoá vẫn giữ cách sắp xếp đang chọn',
        searched.length > 0
        && searched.join(',') === searched.slice().sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' })).join(','),
        searched.join(', '));

    /* ---------- 4. Đọc cách sắp xếp từ URL (F5 không mất bộ lọc) ---------- */
    section('4. Sắp xếp từ URL');
    const fromUrl = await openHeroes({ search: '?sort=name-desc&keyword=a' });

    check('mở bằng ?sort=name-desc -> select sắp xếp đã chọn đúng',
        fromUrl.el('hero-sort-filter').value === 'name-desc',
        fromUrl.el('hero-sort-filter').value);
    check('mở bằng URL -> danh sách đã sắp xếp và lọc sẵn',
        readHeroNames(fromUrl.el('hero-list')).join(',')
            === heroesMatchingKeyword('a').reverse().join(','),
        readHeroNames(fromUrl.el('hero-list')).join(','));

    const badSort = await openHeroes({ search: '?sort=khong-co-that' });
    check('?sort= sai -> rơi về "Mặc định" chứ không vỡ trang',
        badSort.el('hero-sort-filter').value === 'default'
        && readHeroNames(badSort.el('hero-list')).join(',') === HEROES_JSON.map((h) => h.name).join(','),
        badSort.el('hero-sort-filter').value);

    /* ---------- 5. Không lỗi JavaScript ---------- */
    section('5. Không lỗi');
    const allPages = [base, combined, fromUrl, badSort];
    const jsErrors = allPages.flatMap((page) => page.errors.filter((error) => !error.startsWith('console.error')));

    check('không trang nào ném lỗi JavaScript', jsErrors.length === 0, jsErrors.join(' | '));

    console.log(`\n${passed} pass, ${failures.length} fail`);
    if (failures.length) {
        failures.forEach((failure) => console.log('  - ' + failure));
        process.exitCode = 1;
    }
})();