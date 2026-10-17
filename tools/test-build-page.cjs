/**
 * test-build-page.cjs - Kiểm tra trang Build đề xuất (src/pages/builds.html):
 * danh sách build, ghép tên tướng + trang bị, ô tìm build theo từ khoá (debounce),
 * bộ lọc đường / vai trò / sắp xếp (HD08), liên kết sang trang chi tiết build (HD02),
 * ghi bộ lọc lên URL và đếm kết quả.
 * Chạy: node tools/test-build-page.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire, unescapeHtml } = require('./mini-dom.cjs');

const PAGE = 'src/pages/builds.html';
const BUILDS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/builds.json'), 'utf8'));
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));
const ITEMS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));

const heroNameOf = (heroId) => {
    const hero = HEROES_JSON.find((h) => h.id === heroId);
    return hero ? hero.name : String(heroId);
};

/** Mọi build phải thuộc tướng có thật trong heroes.json và có tên build. */
const validHeroLinks = BUILDS_JSON.every((build) =>
    HEROES_JSON.some((hero) => hero.id === build.heroId) && String(build.name || '').trim());

/** Mọi trang bị trong build.items phải có thật trong items.json (không id lạ). */
const validItemLinks = BUILDS_JSON.every((build) =>
    (build.items || []).every((itemId) => ITEMS_JSON.some((item) => item.id === itemId)));

/** Mọi tướng trong heroes.json đều phải có ít nhất một build (phủ 32/32). */
const everyHeroCovered = HEROES_JSON.every((hero) =>
    BUILDS_JSON.some((build) => build.heroId === hero.id));

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

/** Các id build xuất hiện trong link build-detail.html?id=... của danh sách. */
function detailLinksOf(page) {
    return [...cardHtml(page).matchAll(/build-detail\.html\?id=(\d+)/g)].map((match) => Number(match[1]));
}

/** Chọn 1 giá trị cho <select> rồi bắn 'change' (bộ lọc select chạy ngay, không debounce). */
function pickOption(page, id, value) {
    const select = page.el(id);
    select.value = value;
    fire(select, 'change', page.doc);
    return select;
}

/** Tên build theo thứ tự sau khi sắp xếp y hệt build.js (localeCompare 'vi', không phân biệt dấu). */
function sortedBuildNames(builds, direction) {
    return builds
        .slice()
        .sort((a, b) => direction * String(a.name).localeCompare(String(b.name), 'vi', { sensitivity: 'base' }))
        .map((build) => build.name);
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
    check('mọi trang bị trong builds.json đều có thật trong items.json',
        validItemLinks,
        validItemLinks ? '' : 'có item id không tồn tại');
    check(`mọi tướng (${HEROES_JSON.length}/${HEROES_JSON.length}) đều có ít nhất một build`,
        everyHeroCovered,
        everyHeroCovered ? '' : 'còn tướng chưa có build');

    check(`không lọc: hiện đủ ${BUILDS_JSON.length} thẻ build`,
        cardCount(base) === BUILDS_JSON.length,
        String(cardCount(base)));
    check('thẻ build đúng thứ tự và tên build từng thẻ khớp builds.json',
        buildNames(base).join('|') === BUILDS_JSON.map((build) => build.name).join('|'),
        buildNames(base).join('|'));
    const heroNamesOk = (() => {
        // So trên HTML đã giải mã để tên có dấu nháy (vd Tel'Annas -> &#39;) vẫn khớp.
        const html = unescapeHtml(cardHtml(base));
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

    /* ---------- 1b. Bộ lọc + liên kết chi tiết (HD08/HD02) ---------- */
    check('trang có đủ bộ lọc đường / vai trò / sắp xếp',
        ['build-lane-filter', 'build-role-filter', 'build-sort-filter'].every((id) => Boolean(base.el(id))));

    const laneOptions = base.el('build-lane-filter').options.map((option) => unescapeHtml(option.getAttribute('value') || ''));
    const laneValues = [...new Set(BUILDS_JSON.map((build) => build.lane))];
    check('ô lọc đường có đủ các đường trong builds.json + "Tất cả đường"',
        laneValues.every((lane) => laneOptions.includes(lane)) && laneOptions.includes('all'),
        laneOptions.join(' | '));

    const roleOptions = base.el('build-role-filter').options.map((option) => unescapeHtml(option.getAttribute('value') || ''));
    const roleValues = [...new Set(HEROES_JSON.flatMap((hero) => hero.role || []))];
    check('ô lọc vai trò có đủ vai trò trong heroes.json + "Tất cả vai trò"',
        roleValues.every((role) => roleOptions.includes(role)) && roleOptions.includes('all'),
        roleOptions.join(' | '));

    const detailLinks = detailLinksOf(base);
    check('mỗi thẻ build liên kết tới build-detail.html?id=<id> của chính nó',
        BUILDS_JSON.every((build) => detailLinks.includes(build.id)),
        `có ${detailLinks.length} link`);

    const laneBadgesOk = BUILDS_JSON.every((build) =>
        cardHtml(base).includes(`build-card__lane">${build.lane}<`));
    check('mỗi thẻ build hiển thị huy hiệu đường đi',
        laneBadgesOk,
        laneBadgesOk ? '' : 'thiếu huy hiệu đường đi');

    const skillFactsOk = BUILDS_JSON.every((build) =>
        !build.skillOrder || unescapeHtml(cardHtml(base)).includes(build.skillOrder));
    check('mỗi thẻ build hiển thị thứ tự nâng kỹ năng',
        skillFactsOk,
        skillFactsOk ? '' : 'thiếu thứ tự kỹ năng');

    const playstyleOk = BUILDS_JSON.every((build) =>
        !build.playstyle || unescapeHtml(cardHtml(base)).includes(build.playstyle));
    check('mỗi thẻ build hiển thị lối chơi (playstyle)',
        playstyleOk,
        playstyleOk ? '' : 'thiếu lối chơi');

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

    /* ---------- 5. Lọc theo đường (lane) ---------- */
    section('5. Lọc theo đường');
    const lanePage = await openBuilds();
    const lane = 'Rừng';
    const laneBuilds = BUILDS_JSON.filter((build) => build.lane === lane);
    pickOption(lanePage, 'build-lane-filter', lane);
    check(`lọc đường "${lane}" -> còn ${laneBuilds.length} build đúng đường`,
        cardCount(lanePage) === laneBuilds.length
        && buildNames(lanePage).join('|') === laneBuilds.map((build) => build.name).join('|'),
        buildNames(lanePage).join('|'));
    check('đếm kết quả đổi theo bộ lọc đường',
        lanePage.el('build-count').textContent === `${laneBuilds.length} build`,
        String(lanePage.el('build-count').textContent));
    check('bộ lọc đường được ghi lên URL (?lane=)',
        decodeURIComponent(lanePage.location.search).includes(`lane=${lane}`),
        lanePage.location.search);

    /* ---------- 6. Lọc theo vai trò tướng ---------- */
    section('6. Lọc theo vai trò');
    const rolePage = await openBuilds();
    const role = 'Xạ thủ';
    const roleHeroIds = HEROES_JSON.filter((hero) => (hero.role || []).includes(role)).map((hero) => hero.id);
    const roleBuilds = BUILDS_JSON.filter((build) => roleHeroIds.includes(build.heroId));
    pickOption(rolePage, 'build-role-filter', role);
    check(`lọc vai trò "${role}" -> còn ${roleBuilds.length} build của tướng vai trò đó`,
        cardCount(rolePage) === roleBuilds.length
        && buildNames(rolePage).join('|') === roleBuilds.map((build) => build.name).join('|'),
        buildNames(rolePage).join('|'));

    /* ---------- 7. Sắp xếp theo tên ---------- */
    section('7. Sắp xếp theo tên');
    const sortPage = await openBuilds();
    pickOption(sortPage, 'build-sort-filter', 'name-asc');
    check('sắp xếp A → Z đúng thứ tự tên build',
        buildNames(sortPage).join('|') === sortedBuildNames(BUILDS_JSON, 1).join('|'),
        buildNames(sortPage).slice(0, 3).join('|'));
    pickOption(sortPage, 'build-sort-filter', 'name-desc');
    check('sắp xếp Z → A đảo ngược thứ tự tên build (vẫn đủ build)',
        sortPage.el('build-count').textContent === `${BUILDS_JSON.length} build`
        && buildNames(sortPage).join('|') === sortedBuildNames(BUILDS_JSON, -1).join('|'),
        buildNames(sortPage).slice(0, 3).join('|'));

    /* ---------- 8. Kết hợp nhiều bộ lọc ---------- */
    section('8. Kết hợp bộ lọc');
    const comboPage = await openBuilds();
    const comboHeroIds = HEROES_JSON.filter((hero) => (hero.role || []).includes(role)).map((hero) => hero.id);
    const comboBuilds = BUILDS_JSON.filter((build) => build.lane === lane && comboHeroIds.includes(build.heroId));
    pickOption(comboPage, 'build-lane-filter', lane);
    pickOption(comboPage, 'build-role-filter', role);
    check(`đường "${lane}" + vai trò "${role}" -> ${comboBuilds.length} build`,
        cardCount(comboPage) === comboBuilds.length
        && buildNames(comboPage).join('|') === comboBuilds.map((build) => build.name).join('|'),
        buildNames(comboPage).join('|'));

    /* ---------- 9. Bộ lọc đọc lại từ URL ---------- */
    section('9. Bộ lọc đọc lại từ URL');
    const laneUrl = await openBuilds('?lane=' + encodeURIComponent(lane));
    check(`mở bằng ?lane=${lane} -> lọc sẵn đúng đường`,
        cardCount(laneUrl) === laneBuilds.length
        && buildNames(laneUrl).join('|') === laneBuilds.map((build) => build.name).join('|'),
        buildNames(laneUrl).join('|'));
    check('ô lọc đường hiển thị đúng giá trị đọc từ URL',
        laneUrl.el('build-lane-filter').value === lane,
        String(laneUrl.el('build-lane-filter').value));

    const roleUrl = await openBuilds('?role=' + encodeURIComponent(role));
    check(`mở bằng ?role=${role} -> lọc sẵn đúng vai trò`,
        cardCount(roleUrl) === roleBuilds.length,
        String(cardCount(roleUrl)));
    check('ô lọc vai trò hiển thị đúng giá trị đọc từ URL',
        roleUrl.el('build-role-filter').value === role,
        String(roleUrl.el('build-role-filter').value));

    const sortUrl = await openBuilds('?sort=name-asc');
    check('mở bằng ?sort=name-asc -> sắp xếp sẵn đúng thứ tự',
        buildNames(sortUrl).join('|') === sortedBuildNames(BUILDS_JSON, 1).join('|'));
    check('ô sắp xếp hiển thị đúng giá trị đọc từ URL',
        sortUrl.el('build-sort-filter').value === 'name-asc',
        String(sortUrl.el('build-sort-filter').value));

    /* ---------- 9b. Giá trị lạ trên URL không làm vỡ trang ---------- */
    section('9b. URL lạ');
    const bogus = await openBuilds('?lane=Không-Có&role=Sai&sort=zzz');
    check('lane/role/sort lạ trên URL -> bỏ qua, hiện đủ build như mặc định',
        cardCount(bogus) === BUILDS_JSON.length
        && bogus.el('build-lane-filter').value === 'all'
        && bogus.el('build-role-filter').value === 'all'
        && bogus.el('build-sort-filter').value === 'default',
        `lane=${bogus.el('build-lane-filter').value} role=${bogus.el('build-role-filter').value} sort=${bogus.el('build-sort-filter').value}`);

    /* ---------- 10. Không lỗi JavaScript ---------- */
    section('10. Không lỗi');
    const allPages = [base, fromUrl, lanePage, rolePage, sortPage, comboPage, laneUrl, roleUrl, sortUrl, bogus];
    check('mọi lần mở trang không ném lỗi JavaScript',
        allPages.every((page) =>
            page.errors.filter((error) => !error.startsWith('console.error')).length === 0),
        allPages.flatMap((page) => page.errors).join(' | '));


    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((failure) => console.log('  - ' + failure));
        process.exitCode = 1;
    }
})();