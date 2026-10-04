/**
 * test-heroes-page.cjs - Kiểm tra trang Danh sách Tướng (src/pages/heroes.html):
 * lọc (vai trò, độ khó, từ khoá), sắp xếp A → Z / Z → A và phân trang.
 * Chạy: node tools/test-heroes-page.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire, unescapeHtml } = require('./mini-dom.cjs');

const PAGE = 'src/pages/heroes.html';
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));

/** Số tướng mỗi trang, phải khớp HERO_PAGE_SIZE trong js/hero.js (4 cột × 3 dòng). */
const PAGE_SIZE = 12;

/** Chỉ trang 1 của 1 danh sách đã lọc/sắp xếp (trang đầu luôn lấy từ đầu mảng). */
const firstPage = (list) => list.slice(0, PAGE_SIZE);

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

/** Các nút trong thanh phân trang, theo thứ tự đang hiển thị (đọc từ innerHTML). */
function readPaginationLabels(page) {
    const box = page.el('hero-pagination');

    if (!box) return [];

    return [...box.innerHTML.matchAll(/aria-current="[a-z]+"\s*>\s*(\d+)\s*<\/button>/g)].map((match) => match[1]);
}

/** Bấm nút thứ `index` (0-based) của thanh phân trang rồi chờ render lại. */
async function clickPage(page, index) {
    const buttons = page.el('hero-pagination').querySelectorAll('.pagination__item');

    if (!buttons[index]) throw new Error('Không có nút phân trang ở vị trí ' + index);

    fire(buttons[index], 'click', page.el('hero-pagination'));
    await page.settled();
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
    check('không lọc: trang 1 hiện 12 tướng đầu theo thứ tự heroes.json',
        readHeroNames(base.el('hero-list')).join(',') === firstPage(HEROES_JSON).map((h) => h.name).join(','),
        readHeroNames(base.el('hero-list')).join(','));

    /* ---------- 2. Sắp xếp A → Z / Z → A ---------- */
    section('2. Sắp xếp theo tên');

    await selectOption(base, 'hero-sort-filter', 'name-asc');
    check('A → Z: trang 1 tăng dần theo tên',
        readHeroNames(base.el('hero-list')).join(',') === firstPage(HEROES_ASC).map((h) => h.name).join(','),
        readHeroNames(base.el('hero-list')).slice(0, 5).join(', '));
    check('A → Z: đổi cách sắp xếp -> ghi vào URL (?sort=name-asc)',
        new URLSearchParams(base.location.search).get('sort') === 'name-asc',
        base.location.search);

    await selectOption(base, 'hero-sort-filter', 'name-desc');
    check('Z → A: trang 1 giảm dần, đúng đảo của A → Z',
        readHeroNames(base.el('hero-list')).join(',')
            === HEROES_ASC.slice(-PAGE_SIZE).map((h) => h.name).reverse().join(','),
        readHeroNames(base.el('hero-list')).slice(0, 5).join(', '));

    await selectOption(base, 'hero-sort-filter', 'default');
    check('Mặc định: trả lại thứ tự gốc của heroes.json',
        readHeroNames(base.el('hero-list')).join(',') === firstPage(HEROES_JSON).map((h) => h.name).join(','));
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
        && shooters.length <= PAGE_SIZE
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
            === firstPage(heroesMatchingKeyword('a').reverse()).join(','),
        readHeroNames(fromUrl.el('hero-list')).join(','));

    const badSort = await openHeroes({ search: '?sort=khong-co-that' });
    check('?sort= sai -> rơi về "Mặc định" chứ không vỡ trang',
        badSort.el('hero-sort-filter').value === 'default'
        && readHeroNames(badSort.el('hero-list')).join(',') === firstPage(HEROES_JSON).map((h) => h.name).join(','),
        badSort.el('hero-sort-filter').value);

    /* ---------- 5. Phân trang ---------- */
    section('5. Phân trang');
    const pager = await openHeroes();
    const expectedPages = Math.ceil(HEROES_JSON.length / PAGE_SIZE);

    check(`30 tướng / ${PAGE_SIZE} mỗi trang -> ${expectedPages} nút trang`,
        readPaginationLabels(pager).join(',') === Array.from({ length: expectedPages }, (_, i) => String(i + 1)).join(','),
        readPaginationLabels(pager).join(','));
    check('trang 1 là nút active (aria-current=page)',
        pager.el('hero-pagination').querySelectorAll('.pagination__item')[0].getAttribute
            && pager.el('hero-pagination').querySelectorAll('.pagination__item')[0].getAttribute('aria-current') === 'page');
    check('tiêu đề đếm kết quả hiện tổng số tướng',
        pager.el('hero-count').textContent === `${HEROES_JSON.length} tướng`,
        pager.el('hero-count').textContent);

    await clickPage(pager, 1);
    check('bấm trang 2 -> hiện 12 tướng tiếp theo',
        readHeroNames(pager.el('hero-list')).join(',') === HEROES_JSON.slice(PAGE_SIZE, PAGE_SIZE * 2).map((h) => h.name).join(','),
        readHeroNames(pager.el('hero-list')).slice(0, 3).join(', '));
    check('bấm trang 2 -> nút 2 chuyển sang active',
        pager.el('hero-pagination').querySelectorAll('.pagination__item')[1].getAttribute('aria-current') === 'page');

    await clickPage(pager, expectedPages - 1);
    check(`bấm trang ${expectedPages} -> chỉ còn ${HEROES_JSON.length % PAGE_SIZE} tướng (trang cuối không đủ ch)`,
        readHeroNames(pager.el('hero-list')).join(',') === HEROES_JSON.slice(PAGE_SIZE * (expectedPages - 1)).map((h) => h.name).join(','),
        String(readHeroNames(pager.el('hero-list')).length));

    await selectOption(pager, 'hero-role-filter', 'Pháp thuật');
    check('đổi bộ lọc -> tự quay về trang 1',
        readHeroNames(pager.el('hero-list')).join(',')
            === firstPage(HEROES_JSON.filter((h) => h.role.includes('Pháp thuật'))).map((h) => h.name).join(','),
        readHeroNames(pager.el('hero-list')).slice(0, 3).join(', '));
    check('đếm kết quả cập nhật khi lọc (dạng "n/tổng tướng")',
        /^(\d+)\/30 tướng$/.test(pager.el('hero-count').textContent),
        pager.el('hero-count').textContent);

    // Kết quả lọc chỉ còn 1 trang thì ẩn thanh phân trang.
    const onePager = await openHeroes({ search: '?keyword=Lu+Bu' });
    check('lọc còn 1 trang -> ẩn thanh phân trang',
        readPaginationLabels(onePager).length === 0
        && readHeroNames(onePager.el('hero-list')).join(',') === 'Lu Bu',
        readPaginationLabels(onePager).join(',') + ' | ' + readHeroNames(onePager.el('hero-list')).join(','));

    /* ---------- 6. Không lỗi JavaScript ---------- */
    section('6. Không lỗi');
    const allPages = [base, combined, fromUrl, badSort, pager, onePager];
    const jsErrors = allPages.flatMap((page) => page.errors.filter((error) => !error.startsWith('console.error')));

    check('không trang nào ném lỗi JavaScript', jsErrors.length === 0, jsErrors.join(' | '));

    console.log(`\n${passed} pass, ${failures.length} fail`);
    if (failures.length) {
        failures.forEach((failure) => console.log('  - ' + failure));
        process.exitCode = 1;
    }
})();