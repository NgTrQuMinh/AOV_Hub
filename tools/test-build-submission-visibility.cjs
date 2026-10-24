/**
 * test-build-submission-visibility.cjs - Kiểm tra build cộng đồng chỉ hiện khi
 * đã duyệt và không bị lặp với build chính thức.
 *
 * Phủ:
 *   - Hero Detail: ẩn pending/rejected, ẩn approved đã có buildId trong builds.json.
 *   - Build Detail: ẩn pending/rejected khỏi cả build hiện tại lẫn khối "Build khác".
 *   - Build cũ không có status vẫn hiển thị để tương thích dữ liệu cũ.
 *
 * Chạy: node tools/test-build-submission-visibility.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, unescapeHtml } = require('./mini-dom.cjs');

const HEROES = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));
const HERO = HEROES[0];

const HERO_PAGE = 'src/pages/hero-detail.html';
const BUILD_PAGE = 'src/pages/build-detail.html';

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

function storageFor(submissions) {
    return new Map([['aov_build_submissions', JSON.stringify(submissions)]]);
}

async function openHero(builds, submissions) {
    const page = loadPage({
        page: HERO_PAGE,
        search: '?id=' + HERO.id,
        storage: storageFor(submissions),
        data: { 'builds.json': builds },
    });
    page.run();
    await page.settled();
    return page;
}

async function openBuild(builds, submissions, id) {
    const page = loadPage({
        page: BUILD_PAGE,
        search: '?id=' + id,
        storage: storageFor(submissions),
        data: { 'builds.json': builds },
    });
    page.run();
    await page.settled();
    return page;
}

function heroBuildNames(page) {
    const container = page.el('hero-detail');
    if (!container) return [];

    return [...container.innerHTML.matchAll(/hero-build-list-card__name">\s*<a[^>]*>([^<]*)<\/a>/g)]
        .map((match) => unescapeHtml(match[1]));
}

function relatedBuildNames(page) {
    const html = page.el('build-detail') ? page.el('build-detail').innerHTML : '';
    return [...html.matchAll(/related-build__name">([^<]*)</g)].map((match) => unescapeHtml(match[1]));
}

function pageErrors(page) {
    return page.errors.filter((error) => !error.startsWith('console.error'));
}

function officialBuild(id, name, heroId = HERO.id) {
    return {
        id,
        heroId,
        name,
        lane: 'Đường Rồng',
        items: [],
        playstyle: 'Build chính thức',
    };
}

(async () => {
    /* ---------- 1. Hero Detail ---------- */
    section('1. Hero Detail chỉ hiện build đã duyệt, không lặp');
    const heroOfficial = [officialBuild(501, 'Build chính thức')];
    const heroSubmissions = [
        { id: 9101, heroId: HERO.id, name: 'Build đang chờ duyệt', status: ' PENDING ', author: 'demo' },
        { id: 9102, heroId: HERO.id, name: 'Build bị từ chối', status: 'rejected', author: 'demo' },
        { id: 9103, heroId: HERO.id, name: 'Build đã duyệt bị trùng buildId', status: 'approved', buildId: 501, author: 'demo' },
        { id: 9104, heroId: HERO.id, name: 'Build đã duyệt hợp lệ', status: 'approved', author: 'demo' },
        { id: 9105, heroId: HERO.id, name: 'Build cũ không có status', author: 'demo' },
    ];
    const heroPage = await openHero(heroOfficial, heroSubmissions);
    const heroNames = heroBuildNames(heroPage);

    check('vẫn hiện build chính thức', heroNames.includes('Build chính thức'), heroNames.join(', '));
    check('hiện build approved hợp lệ', heroNames.includes('Build đã duyệt hợp lệ'), heroNames.join(', '));
    check('hiện build cũ không có status', heroNames.includes('Build cũ không có status'), heroNames.join(', '));
    check('không hiện build pending', !heroNames.includes('Build đang chờ duyệt'), heroNames.join(', '));
    check('không hiện build rejected', !heroNames.includes('Build bị từ chối'), heroNames.join(', '));
    check('không hiện approved đã trùng buildId chính thức',
        !heroNames.includes('Build đã duyệt bị trùng buildId'), heroNames.join(', '));
    check('chỉ có đúng 3 build được phép hiển thị', heroNames.length === 3, heroNames.join(', '));
    check('Hero Detail không lỗi JavaScript', pageErrors(heroPage).length === 0, pageErrors(heroPage).join(' | '));

    /* ---------- 2. Build Detail: build hiện tại ---------- */
    section('2. Build Detail không mở được build pending/rejected');
    const buildOfficial = [
        officialBuild(501, 'Build chính thức đang xem'),
        officialBuild(502, 'Build chính thức cùng tướng'),
    ];
    const buildSubmissions = [
        { id: 9201, heroId: HERO.id, name: 'Build cộng đồng pending', status: 'pending', author: 'demo' },
        { id: 9202, heroId: HERO.id, name: 'Build cộng đồng rejected', status: 'rejected', author: 'demo' },
        { id: 9203, heroId: HERO.id, name: 'Build cộng đồng approved trùng buildId', status: 'approved', buildId: 501, author: 'demo' },
        { id: 9204, heroId: HERO.id, name: 'Build cộng đồng approved hợp lệ', status: 'approved', author: 'demo' },
    ];

    const pendingPage = await openBuild(buildOfficial, buildSubmissions, 9201);
    check('không mở được build pending bằng id cộng đồng',
        !pendingPage.el('build-detail').innerHTML.includes('Build cộng đồng pending'));

    const rejectedPage = await openBuild(buildOfficial, buildSubmissions, 9202);
    check('không mở được build rejected bằng id cộng đồng',
        !rejectedPage.el('build-detail').innerHTML.includes('Build cộng đồng rejected'));

    /* ---------- 3. Build Detail: khối build khác ---------- */
    section('3. Khối "Build khác" chỉ gợi ý build đã duyệt');
    const currentPage = await openBuild(buildOfficial, buildSubmissions, 501);
    const relatedNames = relatedBuildNames(currentPage);

    check('có gợi ý build chính thức cùng tướng',
        relatedNames.includes('Build chính thức cùng tướng'), relatedNames.join(', '));
    check('có gợi ý build approved hợp lệ',
        relatedNames.includes('Build cộng đồng approved hợp lệ'), relatedNames.join(', '));
    check('không gợi ý build pending', !relatedNames.includes('Build cộng đồng pending'), relatedNames.join(', '));
    check('không gợi ý build rejected', !relatedNames.includes('Build cộng đồng rejected'), relatedNames.join(', '));
    check('không gợi ý approved trùng buildId của build đang xem',
        !relatedNames.includes('Build cộng đồng approved trùng buildId'), relatedNames.join(', '));
    check('Build Detail không lỗi JavaScript', pageErrors(currentPage).length === 0, pageErrors(currentPage).join(' | '));

    /* ---------- Tổng kết ---------- */
    console.log(`\n${passed} PASS, ${failures.length} FAIL`);
    if (failures.length) {
        console.log('\nFAIL:');
        for (const failure of failures) console.log(' - ' + failure);
        process.exitCode = 1;
    }
})();
