/**
 * test-build-page.cjs - Kiểm tra trang Build đề xuất (src/pages/builds.html):
 * danh sách build, ghép tên tướng + trang bị, ô tìm build theo từ khoá (debounce)
 * và đếm kết quả.
 * Chạy: node tools/test-build-page.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire, unescapeHtml } = require('./mini-dom.cjs');

const PAGE = 'src/pages/builds.html';
const BUILDS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/builds.json'), 'utf8'));
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));

const heroNameOf = (heroId) => {
    const hero = HEROES_JSON.find((h) => h.id === heroId);
    return hero ? hero.name : String(heroId);
};

/** Mọi build phải thuộc tướng có thật trong heroes.json và có tên build. */
const validHeroLinks = BUILDS_JSON.every((build) =>
    HEROES_JSON.some((hero) => hero.id === build.heroId) && String(build.name || '').trim());

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

async function openBuilds(search = '') {
    const page = loadPage({ page: PAGE, search });
    page.run();
    await page.settled();
    return page;
}

/** Đánh vào ô tìm và chờ debounce (300ms) chạy xong. */
async function typeKeyword(page, text) {
    const input = page.el('build-keyword');
    input.value = text;
    fire(input, 'input', page.doc);
    await new Promise((resolve) => setTimeout(resolve, 400));
}

function cardHtml(page) {
    return page.el('build-list').innerHTML;
}

function buildNames(page) {
    return [...cardHtml(page).matchAll(/build-card__name">([^<]*)</g)]
        .map((match) => unescapeHtml(match[1]));
}

function cardCount(page) {
    return (cardHtml(page).match(/class="build-card"/g) || []).length;
}

(async () => {
    /* ---------- 1. Thanh lọc + danh sách ban đầu ---------- */
    section('1. Danh sách build');
    const base = await openBuilds();

    check('trang vẽ ô tìm kiếm #build-keyword',
        Boolean(base.el('build-keyword'))
        && base.el('build-keyword').getAttribute('placeholder') !== null);
    check(`dữ liệu builds.json hợp lệ: ${BUILDS_JSON.length} build, mọi build đều có tướng thật`,
        validHeroLinks);

    check(`không lọc: hiện đủ ${BUILDS_JSON.length} thẻ build`,
        cardCount(base) === BUILDS_JSON.length,
        String(cardCount(base)));
    check('thẻ build đúng thứ tự và tên build từng thẻ khớp builds.json',
        buildNames(base).join('|') === BUILDS_JSON.map((build) => build.name).join('|'),
        buildNames(base).join('|'));
    const heroNamesOk = (() => {
        const html = cardHtml(base);
        return BUILDS_JSON.every((build) => html.includes(heroNameOf(build.heroId)));
    })();
    check('mỗi thẻ build có tên tướng chủ (trong các lần render đầu tiên)',
        heroNamesOk,
        heroNamesOk ? '' : 'thiếu tên tướng trong HTML');
    check('đếm kết quả hiện "N build" với tổng số build',
        base.el('build-count').textContent === `${BUILDS_JSON.length} build`,
        String(base.el('build-count').textContent));

    const itemLinks = (cardHtml(base).match(/src\/pages\/item-detail\.html\?id=\d+/g) || []).length;
    check('thẻ build liên kết từng trang bị tới item-detail.html?id=',
        itemLinks >= BUILDS_JSON.length,
        String(itemLinks));

    /* ---------- 2. Tìm theo tên tướng (gõ từ khoá, debounce) ---------- */
    section('2. Tìm theo từ khoá');
    // Build của khách hàng đầu (Valhein, heroId 1): lọc theo tên tướng chính xác.
    const targetHeroName = heroNameOf(1);
    const targetBuilds = BUILDS_JSON.filter((build) => heroNameOf(build.heroId).includes(targetHeroName));

    await typeKeyword(base, targetHeroName);
    check(`gõ tên tướng "${targetHeroName}" -> chỉ còn ${targetBuilds.length} build (đã chờ debounce)`,
        cardCount(base) === targetBuilds.length
        && buildNames(base).join('|') === targetBuilds.map((build) => build.name).join('|'),
        buildNames(base).join('|'));
    check('đếm cập nhật theo kết quả lọc',
        base.el('build-count').textContent === `${targetBuilds.length} build`,
        String(base.el('build-count').textContent));

    /* ---------- 3. Tìm không ra ---------- */
    section('3. Không tìm thấy');
    await typeKeyword(base, 'xyzabc');
    check('từ khoá không trùng -> báo "Không tìm thấy build phù hợp."',
        /Không tìm thấy build phù hợp/.test(cardHtml(base)),
        cardHtml(base).slice(0, 80));
    check('đếm hiện "0 build"',
        base.el('build-count').textContent === '0 build',
        String(base.el('build-count').textContent));

    /* ---------- 4. Lọc sẵn từ URL ??keyword= ---------- */
    section('4. Từ khoá trên URL');
    const fromUrl = await openBuilds('?keyword=' + encodeURIComponent(targetHeroName));
    check(`mở bằng ?keyword=${targetHeroName} -> đã lọc sẵn đúng thẻ build của tướng đó`,
        cardCount(fromUrl) === targetBuilds.length
        && buildNames(fromUrl).join('|') === targetBuilds.map((build) => build.name).join('|'),
        buildNames(fromUrl).join('|'));

    /* ---------- 5. Không lỗi JavaScript ---------- */
    section('5. Không lỗi');
    check('mọi lần mở trang không ném lỗi JavaScript',
        [base, fromUrl].every((page) =>
            page.errors.filter((error) => !error.startsWith('console.error')).length === 0),
        [base, fromUrl].flatMap((page) => page.errors).join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((failure) => console.log('  - ' + failure));
        process.exitCode = 1;
    }
})();