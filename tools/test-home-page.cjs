/**
 * test-home-page.cjs - Kiểm tra Trang chủ (index.html): Tướng nổi bật + Trang bị
 * nổi bật (8 mục đầu mỗi loại), liên kết chi tiết và trạng thái nút yêu thích.
 * Chạy: node tools/test-home-page.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, unescapeHtml } = require('./mini-dom.cjs');

const PAGE = 'index.html';
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));
const ITEMS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));

const FEATURED_HEROES = HEROES_JSON.slice(0, 8);
const FEATURED_ITEMS = ITEMS_JSON.slice(0, 8);

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

async function openHome(options = {}) {
    const page = loadPage(Object.assign({ page: PAGE }, options));
    page.run();
    await page.settled();
    return page;
}

function namesOf(el, className) {
    return [...el.innerHTML.matchAll(new RegExp(className + '">([^<]*)<', 'g'))]
        .map((match) => unescapeHtml(match[1]));
}

(async () => {
    /* ---------- 1. Tướng nổi bật ---------- */
    section('1. Tướng nổi bật');
    const base = await openHome();
    const heroesBox = base.el('featured-heroes');

    check('khu vực Tướng nổi bật hiện đúng 8 card đầu heroes.json',
        namesOf(heroesBox, 'hero-card__name').join(',') === FEATURED_HEROES.map((hero) => hero.name).join(','),
        namesOf(heroesBox, 'hero-card__name').join(','));
    check('mỗi card tướng liên kết tới trang chi tiết tướng',
        FEATURED_HEROES.every((hero) => heroesBox.innerHTML.includes(`hero-detail.html?id=${hero.id}`)));

    /* ---------- 2. Trang bị nổi bật ---------- */
    section('2. Trang bị nổi bật');
    const itemsBox = base.el('featured-items');

    check('khu vực Trang bị nổi bật hiện đúng 8 card đầu items.json',
        namesOf(itemsBox, 'item-card__name').join(',') === FEATURED_ITEMS.map((item) => item.name).join(','),
        namesOf(itemsBox, 'item-card__name').join(','));
    check('mỗi card trang bị liên kết tới trang chi tiết trang bị',
        FEATURED_ITEMS.every((item) => itemsBox.innerHTML.includes(`item-detail.html?id=${item.id}`)));

    /* ---------- 3. Nút yêu thích trên card ---------- */
    section('3. Nút yêu thích');
    check('mỗi card (tướng + trang bị) đều có nút ♥',
        base.doc.querySelectorAll('.btn-favorite').length === 16,
        String(base.doc.querySelectorAll('.btn-favorite').length));
    check('các nút ♥ được đồng bộ trạng thái (aria-pressed=false khi chưa yêu thích)',
        Array.from(base.doc.querySelectorAll('.btn-favorite')).every((btn) => btn.getAttribute('aria-pressed') === 'false'));

    /* ---------- 4. Yêu thích sẵn -> nút đúng trạng thái ---------- */
    section('4. Nút ♥ theo dữ liệu yêu thích');
    const firstHeroId = FEATURED_HEROES[0].id;
    const firstItemId = FEATURED_ITEMS[0].id;
    const liked = await openHome({ storage: new Map([
        ['aov_favorites', JSON.stringify({ hero: [firstHeroId], item: [firstItemId] })],
    ]) });

    const heroBtn = Array.from(liked.doc.querySelectorAll('.btn-favorite[data-type="hero"]'))
        .find((btn) => btn.dataset.id === String(firstHeroId));
    const itemBtn = Array.from(liked.doc.querySelectorAll('.btn-favorite[data-type="item"]'))
        .find((btn) => btn.dataset.id === String(firstItemId));
    check('card tướng đã yêu thích sẵn có nút ♥ đang active',
        Boolean(heroBtn) && heroBtn.getAttribute('aria-pressed') === 'true');
    check('card trang bị đã yêu thích sẵn có nút ♥ đang active',
        Boolean(itemBtn) && itemBtn.getAttribute('aria-pressed') === 'true');

    /* ---------- 5. Cấu trúc trang (markup tĩnh của index.html) ---------- */
    section('5. Cấu trúc trang');
    const homeHtml = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');

    check('trang tĩnh có đủ 4 liên kết điều hướng nhanh',
        (homeHtml.match(/quick-nav__item/g) || []).length === 4,
        String((homeHtml.match(/quick-nav__item/g) || []).length));
    check('trang có đủ vùng #featured-heroes, #featured-items và nạp script home.js',
        homeHtml.includes('id="featured-heroes"')
        && homeHtml.includes('id="featured-items"')
        && /src\/js\/home\.js/.test(homeHtml));
    check('thứ tự nạp script: home.js sau storage.js và favorite.js (đủ phụ thuộc card)',
        homeHtml.indexOf('home.js') > homeHtml.indexOf('favorite.js')
        && homeHtml.indexOf('favorite.js') > homeHtml.indexOf('storage.js'));

    /* ---------- 6. Không lỗi JavaScript ---------- */
    section('6. Không lỗi');
    check('[base, liked] không ném lỗi JavaScript',
        [base, liked].every((page) =>
            page.errors.filter((error) => !error.startsWith('console.error')).length === 0),
        [base, liked].flatMap((page) => page.errors).join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((failure) => console.log('  - ' + failure));
        process.exitCode = 1;
    }
})();