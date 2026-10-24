/**
 * test-build-related-hero-builds.cjs - Kiểm tra khối "Build khác của tướng này"
 * ở cuối trang Chi tiết hướng dẫn build (build-detail.html).
 *
 * Phủ các yêu cầu:
 *   - chỉ lấy build trùng heroId với build đang xem;
 *   - loại đúng build hiện tại bằng id thật (không nhầm heroId với buildId);
 *   - không lấy build của tướng khác, kể cả khi heroId của nó trùng id build hiện tại;
 *   - link mở đúng build-detail.html?id=<buildId>;
 *   - không render khối rỗng khi không có build liên quan;
 *   - dữ liệu thật (mỗi tướng hiện có 1 build) không hiện khối này.
 *
 * Chạy: node tools/test-build-related-hero-builds.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, unescapeHtml } = require('./mini-dom.cjs');

const DETAIL_PAGE = 'src/pages/build-detail.html';
const BUILDS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/builds.json'), 'utf8'));
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));

const TEMPLATE = BUILDS_JSON[0];
const HERO_ID = Number(TEMPLATE.heroId);

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

/* ================= Dữ liệu thử ================= */

function cloneBuild(overrides) {
    return Object.assign({}, TEMPLATE, overrides);
}

// Build hiện tại id=7, heroId=HERO_ID. Build cùng tướng id=1 (id trùng heroId hiện tại)
// và id=8. Build tướng khác có heroId=7 (trùng id build hiện tại) và heroId=2.
const currentBuild = cloneBuild({ id: 7, heroId: HERO_ID, name: 'Build hiện tại' });
const sameHeroA = cloneBuild({ id: 1, heroId: HERO_ID, name: 'Build cùng tướng A' });
const sameHeroB = cloneBuild({ id: 8, heroId: HERO_ID, name: 'Build cùng tướng B' });
const otherHeroSameAsBuildId = cloneBuild({ id: 9, heroId: 7, name: 'Build tướng khác trùng id hiện tại' });
const otherHero = cloneBuild({ id: 10, heroId: HERO_ID + 1, name: 'Build tướng khác' });

const fixture = [currentBuild, sameHeroA, otherHeroSameAsBuildId, sameHeroB, otherHero];

/* ================= Mở trang + đọc kết quả ================= */

async function open(search, builds = fixture, storage = new Map()) {
    const page = loadPage({
        page: DETAIL_PAGE,
        search,
        storage,
        data: { 'builds.json': builds },
    });
    page.run();
    await page.settled();
    return page;
}

/** Build cộng đồng nằm trong localStorage aov_build_submissions (HD06). */
function communityStorage(submissions) {
    return new Map([['aov_build_submissions', JSON.stringify(submissions)]]);
}

const decode = (text) => unescapeHtml(text);

function readRelated(html) {
    const match = html.match(/<section class="build-detail__section build-detail__related-section">[\s\S]*?<\/section>/);
    const block = match ? match[0] : '';
    const names = [...block.matchAll(/related-build__name">([^<]*)</g)].map((m) => decode(m[1]));
    const hrefs = [...block.matchAll(/build-detail\.html\?id=(\d+)/g)].map((m) => Number(m[1]));

    return {
        exists: Boolean(block),
        block,
        names,
        hrefs,
        title: decode((block.match(/<h2>([^<]*)<\/h2>/) || [])[1] || ''),
        intro: decode((block.match(/related-build__intro">([\s\S]*?)<\/p>/) || [])[1] || ''),
        html: html,
    };
}

(async () => {
    /* ---------- 1. Lọc đúng build cùng tướng ---------- */
    section('1. Lọc build cùng tướng và loại build hiện tại');
    const opened = await open('?id=7');
    const view = readRelated(opened.el('build-detail').innerHTML);

    check('có khối "Build khác của tướng này"', view.exists);
    check('tiêu đề đúng', view.title === 'Build khác của tướng này', view.title);
    check('chỉ hiện 2 build cùng heroId (bỏ build hiện tại + tướng khác)',
        JSON.stringify(view.names) === JSON.stringify(['Build cùng tướng A', 'Build cùng tướng B']),
        JSON.stringify(view.names));
    check('không chứa build hiện tại (id=7)', !view.hrefs.includes(7), JSON.stringify(view.hrefs));
    check('không chứa build tướng khác dù heroId trùng id hiện tại (heroId=7)',
        !view.hrefs.includes(9) && !view.names.includes('Build tướng khác trùng id hiện tại'),
        JSON.stringify(view.hrefs));
    check('không chứa build tướng khác (heroId=2)', !view.hrefs.includes(10), JSON.stringify(view.hrefs));
    check('vẫn giữ build cùng tướng có id trùng heroId hiện tại (id=1)',
        view.hrefs.includes(1) && view.names.includes('Build cùng tướng A'),
        JSON.stringify(view.hrefs));

    /* ---------- 2. Liên kết đúng build ---------- */
    section('2. Liên kết mở đúng build');
    check('mỗi build có đúng một link build-detail.html?id=<id thật>',
        JSON.stringify(view.hrefs) === JSON.stringify([1, 8]), JSON.stringify(view.hrefs));
    check('link nằm trong thẻ cùng tướng (intro có tên tướng)',
        view.intro.includes(HEROES_JSON.find((hero) => Number(hero.id) === HERO_ID).name),
        view.intro);

    /* ---------- 3. Không có build liên quan -> ẩn khối ---------- */
    section('3. Không có build liên quan');
    const onlyCurrent = await open('?id=7', [currentBuild]);
    const noRelatedView = readRelated(onlyCurrent.el('build-detail').innerHTML);
    check('chỉ có build hiện tại -> không render khối rỗng', !noRelatedView.exists,
        noRelatedView.block.slice(0, 120));
    check('trang vẫn render bình thường', onlyCurrent.el('build-detail').innerHTML.includes('build-detail__name'));

    const onlyOtherHero = await open('?id=7', [currentBuild, otherHero]);
    check('chỉ có build tướng khác -> vẫn ẩn khối', !readRelated(onlyOtherHero.el('build-detail').innerHTML).exists);

    /* ---------- 4. Vào bằng ?heroId= vẫn loại đúng build đầu tiên ---------- */
    section('4. Vào bằng ?heroId=');
    const byHero = await open(`?heroId=${HERO_ID}`);
    const byHeroView = readRelated(byHero.el('build-detail').innerHTML);
    check('?heroId= chọn build đầu tiên của tướng và không tự gợi ý chính nó',
        !byHeroView.hrefs.includes(7) && byHeroView.hrefs.includes(1) && byHeroView.hrefs.includes(8),
        JSON.stringify(byHeroView.hrefs));

    /* ---------- 5. Dữ liệu thật: mỗi tướng 1 build -> không có khối ---------- */
    section('5. Dữ liệu thật hiện tại');
    const realPage = await open(`?id=${BUILDS_JSON[0].id}`, BUILDS_JSON);
    const realView = readRelated(realPage.el('build-detail').innerHTML);
    const buildsPerHero = BUILDS_JSON.reduce((count, build) => {
        const key = String(build.heroId);
        count[key] = (count[key] || 0) + 1;
        return count;
    }, {});
    const hasHeroWithMultipleBuilds = Object.values(buildsPerHero).some((count) => count > 1);
    check('builds.json hiện tại chỉ có 1 build/tướng nên không render khối gợi ý',
        !hasHeroWithMultipleBuilds && !realView.exists,
        JSON.stringify({ hasHeroWithMultipleBuilds, exists: realView.exists }));

    /* ---------- 6. Build cộng đồng đang hiển thị ---------- */
    section('6. Build cộng đồng');
    const communitySameHero = cloneBuild({
        id: 9001, heroId: HERO_ID, name: 'Build cộng đồng cùng tướng',
        source: 'community', author: 'demo',
    });
    const communityOtherHero = cloneBuild({
        id: 9002, heroId: HERO_ID + 1, name: 'Build cộng đồng tướng khác',
        source: 'community', author: 'demo',
    });
    const withCommunity = await open(
        '?id=7',
        [currentBuild],
        communityStorage([communitySameHero, communityOtherHero]),
    );
    const communityView = readRelated(withCommunity.el('build-detail').innerHTML);
    check('build cộng đồng cùng tướng đang hiển thị được gợi ý',
        communityView.exists
        && communityView.hrefs.includes(9001)
        && communityView.names.includes('Build cộng đồng cùng tướng'),
        JSON.stringify(communityView.hrefs));
    check('build cộng đồng của tướng khác không xuất hiện',
        !communityView.hrefs.includes(9002), JSON.stringify(communityView.hrefs));

    const currentCommunity = cloneBuild({
        id: 9101, heroId: HERO_ID, name: 'Build cộng đồng đang xem',
        source: 'community', author: 'demo',
    });
    const anotherCommunity = cloneBuild({
        id: 9102, heroId: HERO_ID, name: 'Build cộng đồng khác',
        source: 'community', author: 'demo',
    });
    const viewingCommunity = await open(
        '?id=9101',
        [],
        communityStorage([currentCommunity, anotherCommunity]),
    );
    const viewingCommunityView = readRelated(viewingCommunity.el('build-detail').innerHTML);
    check('đang xem build cộng đồng -> loại chính nó, chỉ gợi ý build cộng đồng còn lại',
        JSON.stringify(viewingCommunityView.hrefs) === JSON.stringify([9102]),
        JSON.stringify(viewingCommunityView.hrefs));

    /* ---------- 7. Escape dữ liệu build khác ---------- */
    section('7. Escape HTML');
    const evilOther = cloneBuild({ id: 11, heroId: HERO_ID, name: '<script>alert(1)</script>' });
    const evilPage = await open('?id=7', [currentBuild, evilOther]);
    const evilHtml = evilPage.el('build-detail').innerHTML;
    const evilView = readRelated(evilHtml);
    check('tên build khác được escape, không chạy thẻ <script>',
        !/<script>alert\(1\)<\/script>/.test(evilHtml)
        && evilView.names.includes('<script>alert(1)</script>')
        && evilHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
        evilHtml.slice(0, 160));

    /* ---------- 8. Không lỗi JavaScript ---------- */
    section('8. Không lỗi');
    const pages = [opened, onlyCurrent, byHero, realPage, withCommunity, viewingCommunity, evilPage];
    check('các lần mở trang không ném lỗi',
        pages.every((page) => page.errors.filter((error) => !error.startsWith('console.error')).length === 0),
        pages.flatMap((page) => page.errors).join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((failure) => console.log('  - ' + failure));
        process.exitCode = 1;
    }
})();
