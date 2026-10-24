/**
 * test-hero-detail-builds.cjs - Kiểm tra khu "Build của tướng" ở trang
 * Chi tiết tướng (src/pages/hero-detail.html):
 *   - lọc đúng build theo heroId, hiện nhiều build của cùng một tướng;
 *   - link mở đúng build-detail.html?id=...;
 *   - gộp build cộng đồng từ LocalStorage;
 *   - tướng không có build / builds.json tải lỗi vẫn hiện thông báo thân thiện;
 *   - khối "Trang bị đề xuất" (recommendedBuild) vẫn hoạt động như cũ.
 *
 * Chạy: node tools/test-hero-detail-builds.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, unescapeHtml } = require('./mini-dom.cjs');

const PAGE = 'src/pages/hero-detail.html';
const HEROES = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));
const BUILDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/builds.json'), 'utf8'));

const HERO = HEROES[0];
const HERO_BUILDS = BUILDS.filter((build) => String(build.heroId) === String(HERO.id));

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

/** Mở trang chi tiết tướng với các tùy chọn của mini-dom. */
async function openHeroDetail(options = {}) {
    const page = loadPage(Object.assign({ page: PAGE, search: '?id=' + HERO.id }, options));
    page.run();
    await page.settled();
    return page;
}

/** Tên các build đang render trong khu "Build của tướng" (đã giải mã HTML entity). */
function readBuildNames(page) {
    const container = page.el('hero-detail');
    if (!container) return [];

    return [...container.innerHTML.matchAll(/hero-build-card__name">\s*<a[^>]*>([^<]*)<\/a>/g)]
        .map((match) => unescapeHtml(match[1]));
}

/** Các href của link "Xem hướng dẫn chi tiết" trong khu build. */
function readBuildLinks(page) {
    const container = page.el('hero-detail');
    if (!container) return [];

    return container.querySelectorAll('a.hero-build-card__link')
        .map((link) => link.getAttribute('href'));
}

function hasSection(page) {
    const container = page.el('hero-detail');
    return Boolean(container && container.querySelector('.hero-builds'));
}

function recommendedItemsCount(page) {
    const container = page.el('hero-detail');
    if (!container) return 0;

    return container.querySelectorAll('.hero-build .build-item').length;
}

(async () => {
    /* ---------- 1. Tướng có build trong builds.json ---------- */
    section('1. Tướng có build');
    const normal = await openHeroDetail();

    check('có khu "Build của tướng"', hasSection(normal));
    check('tiêu đề đúng', normal.el('hero-detail').innerHTML.includes('Build của tướng'));
    check('hiện đúng số build của tướng trong builds.json',
        readBuildNames(normal).join(',') === HERO_BUILDS.map((build) => build.name).join(','),
        readBuildNames(normal).join(', '));
    check('mỗi build có link build-detail.html?id=<buildId>',
        readBuildLinks(normal).length === HERO_BUILDS.length
        && HERO_BUILDS.every((build, index) => readBuildLinks(normal)[index]
            .includes('build-detail.html?id=' + encodeURIComponent(build.id))),
        readBuildLinks(normal).join(' | '));
    check('khối "Trang bị đề xuất" vẫn render đúng recommendedBuild',
        recommendedItemsCount(normal) === (HERO.recommendedBuild || []).length,
        String(recommendedItemsCount(normal)));
    check('không lỗi JavaScript',
        normal.errors.filter((error) => !error.startsWith('console.error')).length === 0,
        normal.errors.join(' | '));

    /* ---------- 2. Nhiều build cho cùng một tướng ---------- */
    section('2. Nhiều build cho một tướng');
    const multiBuilds = [
        { id: 501, heroId: HERO.id, name: 'Build đường Rồng', lane: 'Đường Rồng', items: [101, 102], playstyle: 'Đánh xa, giữ vị trí.' },
        { id: 502, heroId: HERO.id, name: 'Build đường Giữa', lane: 'Đường Giữa', items: [103], playstyle: 'Cấu rỉa từ xa.' },
        { id: 503, heroId: 99999, name: 'Build của tướng khác', items: [] },
    ];
    const multi = await openHeroDetail({ data: { 'builds.json': multiBuilds } });

    check('hiện đủ nhiều build của cùng tướng (không giới hạn 1 build)',
        readBuildNames(multi).join(',') === 'Build đường Rồng,Build đường Giữa',
        readBuildNames(multi).join(', '));
    check('không lẫn build của tướng khác',
        !readBuildNames(multi).includes('Build của tướng khác'));
    check('hiện huy hiệu đường đi khi có dữ liệu',
        multi.el('hero-detail').querySelectorAll('.hero-build-card__lane').length === 2);
    check('link của từng build đúng id',
        readBuildLinks(multi).join(',') === 'build-detail.html?id=501,build-detail.html?id=502'
        || readBuildLinks(multi).map((href) => href.split('?id=')[1]).join(',') === '501,502',
        readBuildLinks(multi).join(' | '));

    /* ---------- 3. Gộp build cộng đồng ---------- */
    section('3. Build cộng đồng');
    const submissions = [
        { id: 9001, heroId: HERO.id, name: 'Build cộng đồng A', lane: 'Rừng', items: [101], author: 'demo' },
        { id: 9002, heroId: 99999, name: 'Build cộng đồng tướng khác', author: 'demo' },
    ];
    const community = await openHeroDetail({
        storage: new Map([['aov_build_submissions', JSON.stringify(submissions)]]),
    });

    check('hiện thêm build cộng đồng đúng tướng',
        readBuildNames(community).includes('Build cộng đồng A'));
    check('không hiện build cộng đồng của tướng khác',
        !readBuildNames(community).includes('Build cộng đồng tướng khác'));
    check('link build cộng đồng mở được bằng id cộng đồng',
        readBuildLinks(community).some((href) => href.includes('id=9001')));
    check('hiện tên người gửi của build cộng đồng',
        community.el('hero-detail').innerHTML.includes('Người gửi: demo'));

    /* ---------- 4. Tướng không có build ---------- */
    section('4. Tướng không có build');
    const noBuilds = await openHeroDetail({ data: { 'builds.json': [] } });

    check('vẫn có khu "Build của tướng"', hasSection(noBuilds));
    check('hiện thông báo thân thiện thay vì danh sách rỗng',
        noBuilds.el('hero-detail').innerHTML.includes('Tướng này chưa có build nào.'));
    check('khối "Trang bị đề xuất" không bị ảnh hưởng',
        recommendedItemsCount(noBuilds) === (HERO.recommendedBuild || []).length);

    /* ---------- 5. Dữ liệu build hỏng / thiếu trường ---------- */
    section('5. Dữ liệu thiếu / không hợp lệ');
    const malformed = await openHeroDetail({
        data: {
            'builds.json': [
                null,
                { id: null, heroId: HERO.id, name: 'Không có id' },
                { id: 601, heroId: HERO.id, name: 'Thiếu lane/items' },
                { id: 602, heroId: HERO.id, name: 'Trùng id', lane: '' },
                { id: 601, heroId: HERO.id, name: 'Build trùng id' },
            ],
        },
    });

    check('bỏ bản ghi hỏng, không có id và id trùng',
        readBuildNames(malformed).join(',') === 'Thiếu lane/items,Trùng id',
        readBuildNames(malformed).join(', '));
    check('build thiếu items vẫn hiện "0 trang bị"',
        malformed.el('hero-detail').innerHTML.includes('0 trang bị'));

    /* ---------- 6. builds.json tải lỗi ---------- */
    section('6. builds.json tải lỗi');
    const failed = await openHeroDetail({ failData: 'builds.json' });

    check('không vỡ trang, vẫn có khu build và thông báo trống',
        hasSection(failed)
        && failed.el('hero-detail').innerHTML.includes('Tướng này chưa có build nào.'));
    check('recommendedBuild vẫn hoạt động khi builds.json lỗi',
        recommendedItemsCount(failed) === (HERO.recommendedBuild || []).length);
    check('chỉ có console.error do tải JSON lỗi (không có lỗi runtime)',
        failed.errors.every((error) => error.startsWith('console.error')),
        failed.errors.join(' | '));

    console.log(`\n${passed} pass, ${failures.length} fail`);
    if (failures.length) {
        failures.forEach((failure) => console.log('  - ' + failure));
        process.exitCode = 1;
    }
})();
