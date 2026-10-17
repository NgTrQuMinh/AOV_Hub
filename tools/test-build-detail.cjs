/**
 * test-build-detail.cjs - Kiểm tra trang Chi tiết hướng dẫn build
 * (src/pages/build-detail.html + src/js/build-detail.js).
 *
 * Phủ các nhiệm vụ:
 *   HD01/HD10 - builds.json đủ trường mở rộng (phases/skillOrder/tips/situational/
 *               counters/notes/lane/playstyle) và mọi id tham chiếu đều có thật.
 *   HD02 - tra build theo ?id= (và ?heroId=), render đầy đủ nội dung; xử lý lỗi
 *          thiếu id / id sai / JSON hỏng (có nút tải lại trang).
 *   HD03 - khối "Trang bị thay thế theo tình huống".
 *   HD04 - thứ tự nâng kỹ năng, mẹo chơi, tướng khắc chế.
 *
 * Mô phỏng DOM tối giản trong Node nhờ tools/mini-dom.cjs.
 * Chạy: node tools/test-build-detail.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage: loadPageShared, unescapeHtml, fire } = require('./mini-dom.cjs');

const DETAIL_PAGE = 'src/pages/build-detail.html';
const BUILDS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/builds.json'), 'utf8'));
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));
const ITEMS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));

const itemById = (id) => ITEMS_JSON.find((item) => String(item.id) === String(id)) || null;
const heroById = (id) => HEROES_JSON.find((hero) => String(hero.id) === String(id)) || null;

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

function decodeEntities(text) {
    return unescapeHtml(text);
}

/* ================= Mở trang ================= */

/** Bọc mini-dom cho đúng kiểu gọi (search, options). */
function loadPage(search, options) {
    return loadPageShared(Object.assign({ page: DETAIL_PAGE, search }, options));
}

async function openBuildDetail(search) {
    const page = loadPage(search);
    page.run();
    await page.settled();
    page.view = readBuildDetail(page.el('build-detail'));
    return page;
}

/* ================= Đọc kết quả render ================= */

/**
 * Đọc nội dung #build-detail thành object để so khớp, bám theo đúng class mà
 * build-detail.js render ra.
 */
function readBuildDetail(containerEl) {
    const html = containerEl ? containerEl.innerHTML : '';

    const sectionOf = (className) => {
        const match = html.match(new RegExp(`<section class="build-detail__section ${className}">[\\s\\S]*?</section>`));
        return match ? match[0] : '';
    };

    const itemsSection = sectionOf('build-detail__items-section');
    const phasesSection = sectionOf('build-detail__phases-section');
    const skillSection = sectionOf('build-detail__skill-section');
    const situationalSection = sectionOf('build-detail__situational-section');
    const tipsSection = sectionOf('build-detail__tips-section');
    const countersSection = sectionOf('build-detail__counters-section');
    const notesSection = sectionOf('build-detail__notes-section');

    const idsIn = (block) => [...block.matchAll(/item-detail\.html\?id=(\d+)/g)].map((match) => Number(match[1]));

    const listItems = (block) => [...block.matchAll(/<li>([^<]*)<\/li>/g)].map((match) => decodeEntities(match[1]));

    const phases = phasesSection.split('<li class="build-phase">').slice(1).map((block) => ({
        title: decodeEntities((block.match(/build-phase__title">([^<]*)</) || [])[1] || ''),
        itemIds: idsIn(block),
        note: decodeEntities((block.match(/build-phase__note">([^<]*)</) || [])[1] || ''),
    }));

    const situational = situationalSection.split('<li class="situational">').slice(1).map((block) => {
        const ids = idsIn(block);
        return {
            when: decodeEntities((block.match(/situational__when">([^<]*)</) || [])[1] || ''),
            replaceId: ids[0],
            withId: ids[1],
            reason: decodeEntities((block.match(/situational__reason">([^<]*)</) || [])[1] || ''),
        };
    });

    const counters = countersSection.split('<li class="counter">').slice(1).map((block) => ({
        heroId: Number((block.match(/hero-detail\.html\?id=(\d+)/) || [])[1] || 0),
        name: decodeEntities((block.match(/counter__name">([^<]*)</) || [])[1] || ''),
        reason: decodeEntities((block.match(/counter__reason">([^<]*)</) || [])[1] || ''),
    }));

    return {
        html,
        isEmptyState: html.includes('build-detail-empty'),
        name: decodeEntities((html.match(/build-detail__name">([^<]*)</) || [])[1] || ''),
        lane: decodeEntities((html.match(/build-detail__lane">([^<]*)</) || [])[1] || ''),
        heroName: decodeEntities((html.match(/build-detail__hero-link"[\s\S]*?<h2>([^<]*)<\/h2>/) || [])[1] || ''),
        heroHref: (html.match(/build-detail__hero-link" href="([^"]*)"/) || [])[1] || '',
        countText: decodeEntities((html.match(/build-detail__count">([^<]*)</) || [])[1] || ''),
        playstyle: decodeEntities((html.match(/build-detail__playstyle">([^<]*)</) || [])[1] || ''),
        mainItemIds: idsIn(itemsSection),
        mainItemNames: [...itemsSection.matchAll(/<span>([^<]*)<\/span>/g)].map((match) => decodeEntities(match[1])),
        phases,
        skillOrder: skillSection.includes('build-detail__skill-order')
            ? decodeEntities((skillSection.match(/build-detail__skill-order">([^<]*)</) || [])[1] || '')
            : '',
        situational,
        tips: listItems(tipsSection),
        counters,
        notes: listItems(notesSection),
        hasBackLink: html.includes('src/pages/builds.html'),
    };
}

/* ================= Kỳ vọng tính từ chính builds.json ================= */

/** Build có đủ mọi trường mở rộng và mọi id tham chiếu đều tồn tại. */
function buildFieldsOk(build) {
    if (!build || !String(build.name || '').trim()) return false;
    if (!heroById(build.heroId)) return false;
    if (!String(build.lane || '').trim()) return false;
    if (!String(build.skillOrder || '').trim()) return false;
    if (!Array.isArray(build.items) || build.items.length === 0) return false;
    if (!build.items.every(itemById)) return false;
    if (!Array.isArray(build.phases) || build.phases.length === 0) return false;

    const phasesOk = build.phases.every((phase) =>
        String(phase.name || '').trim()
        && Array.isArray(phase.items)
        && phase.items.every(itemById));

    if (!phasesOk) return false;
    if (!Array.isArray(build.tips) || build.tips.length === 0) return false;
    if (!Array.isArray(build.notes)) return false;

    const situationalOk = Array.isArray(build.situational) && build.situational.length > 0
        && build.situational.every((entry) => itemById(entry.replace) && itemById(entry.with) && String(entry.reason || '').trim());

    if (!situationalOk) return false;

    const countersOk = Array.isArray(build.counters) && build.counters.length > 0
        && build.counters.every((entry) => heroById(entry.heroId) && String(entry.reason || '').trim());

    return countersOk;
}

(async () => {
    /* ---------- 1. Dữ liệu builds.json đủ trường (HD01/HD10) ---------- */
    section('1. Dữ liệu builds.json đủ trường mở rộng');
    const withinRoles = BUILDS_JSON.every((build) => !heroById(build.heroId) || (heroById(build.heroId).role || []).length > 0);
    check(`có ${BUILDS_JSON.length} build, build nào cũng đủ trường + id hợp lệ`, BUILDS_JSON.every(buildFieldsOk));
    check('mọi build trỏ tới tướng có thật trong heroes.json', withinRoles);

    const situationalWorlds = new Set(BUILDS_JSON.flatMap((build) => (build.situational || []).flatMap((entry) => [entry.replace, entry.with])));
    check('mọi trang bị thay thế (replace/with) đều tồn tại trong items.json',
        [...situationalWorlds].every(itemById));

    const counterHeroIds = new Set(BUILDS_JSON.flatMap((build) => (build.counters || []).map((entry) => entry.heroId)));
    check('mọi tướng khắc chế đều tồn tại trong heroes.json', [...counterHeroIds].every(heroById));

    const noSelfCounter = BUILDS_JSON.every((build) => !(build.counters || []).some((entry) => String(entry.heroId) === String(build.heroId)));
    check('không build nào tự liệt kê chính tướng của mình là tướng khắc chế', noSelfCounter);

    /* ---------- 2. Trang chi tiết: build đầu / giữa / cuối (HD02) ---------- */
    section('2. Trang chi tiết: build đầu tiên, ở giữa, cuối cùng');
    const firstBuild = BUILDS_JSON[0];
    const midBuild = BUILDS_JSON[Math.floor(BUILDS_JSON.length / 2)];
    const lastBuild = BUILDS_JSON[BUILDS_JSON.length - 1];

    for (const [position, target] of [['đầu tiên', firstBuild], ['ở giữa', midBuild], ['cuối cùng', lastBuild]]) {
        const opened = await openBuildDetail(`?id=${target.id}`);
        const view = opened.view;
        const hero = heroById(target.heroId);
        const tag = `build ${position} (id=${target.id} "${target.name}")`;

        check(`${tag}: render tên build + tướng + đường đi`,
            view.name === target.name && view.heroName === hero.name && view.lane === target.lane,
            JSON.stringify({ name: view.name, hero: view.heroName, lane: view.lane }));

        check(`${tag}: hero liên kết tới hero-detail.html?id=${target.heroId}`,
            view.heroHref.includes(`hero-detail.html?id=${target.heroId}`),
            view.heroHref);

        check(`${tag}: render đủ ${target.items.length} trang bị chính đúng thứ tự`,
            JSON.stringify(view.mainItemIds) === JSON.stringify(target.items.map(Number)),
            JSON.stringify(view.mainItemIds));

        check(`${tag}: mỗi trang bị chính liên kết item-detail.html?id= và có tên`,
            target.items.every((id) => {
                const item = itemById(id);
                return view.mainItemIds.includes(Number(id)) && view.mainItemNames.includes(item.name);
            }),
            JSON.stringify(view.mainItemNames));

        check(`${tag}: đếm đúng "${target.items.length} trang bị"`,
            view.countText === `${target.items.length} trang bị`,
            view.countText);

        check(`${tag}: render đủ ${target.phases.length} giai đoạn lên đồ kèm ghi chú`,
            view.phases.length === target.phases.length
                && target.phases.every((phase, index) => {
                    const rendered = view.phases[index];
                    return rendered.title === phase.name
                        && rendered.note === phase.note
                        && JSON.stringify(rendered.itemIds) === JSON.stringify(phase.items.map(Number));
                }),
            JSON.stringify(view.phases.map((phase) => phase.title)));

        check(`${tag}: hiển thị lối chơi (playstyle)`,
            view.playstyle === target.playstyle,
            view.playstyle);
    }

    /* ---------- 3. Thứ tự nâng kỹ năng (HD04) ---------- */
    section('3. Thứ tự nâng kỹ năng (HD04)');
    for (const target of [firstBuild, midBuild, lastBuild]) {
        const view = (await openBuildDetail(`?id=${target.id}`)).view;
        check(`build id=${target.id}: hiển thị đúng thứ tự nâng kỹ năng "${target.skillOrder}"`,
            view.skillOrder === target.skillOrder,
            view.skillOrder);
    }

    /* ---------- 4. Mẹo chơi (HD04) ---------- */
    section('4. Mẹo chơi (HD04)');
    for (const target of [firstBuild, midBuild, lastBuild]) {
        const view = (await openBuildDetail(`?id=${target.id}`)).view;
        check(`build id=${target.id}: render đủ ${target.tips.length} mẹo chơi`,
            JSON.stringify(view.tips) === JSON.stringify(target.tips),
            JSON.stringify(view.tips));
    }

    /* ---------- 5. Tướng khắc chế (HD04) ---------- */
    section('5. Tướng khắc chế (HD04)');
    for (const target of [firstBuild, midBuild, lastBuild]) {
        const view = (await openBuildDetail(`?id=${target.id}`)).view;
        const expected = target.counters.map((entry) => ({
            heroId: Number(entry.heroId),
            name: heroById(entry.heroId).name,
            reason: entry.reason,
        }));

        check(`build id=${target.id}: render đủ ${target.counters.length} tướng khắc chế (tên + lý do + link)`,
            JSON.stringify(view.counters) === JSON.stringify(expected),
            JSON.stringify(view.counters));
    }

    /* ---------- 6. Trang bị thay thế theo tình huống (HD03) ---------- */
    section('6. Trang bị thay thế theo tình huống (HD03)');
    for (const target of [firstBuild, midBuild, lastBuild]) {
        const view = (await openBuildDetail(`?id=${target.id}`)).view;
        const expected = target.situational.map((entry) => ({
            when: entry.when,
            replaceId: Number(entry.replace),
            withId: Number(entry.with),
            reason: entry.reason,
        }));

        check(`build id=${target.id}: render đủ ${target.situational.length} tình huống thay trang bị (thay → bằng)`,
            JSON.stringify(view.situational) === JSON.stringify(expected),
            JSON.stringify(view.situational));
    }

    /* ---------- 7. Ghi chú + điều hướng (HD02) ---------- */
    section('7. Ghi chú + điều hướng');
    const navView = (await openBuildDetail(`?id=${firstBuild.id}`)).view;
    check('render khối ghi chú đúng dữ liệu',
        JSON.stringify(navView.notes) === JSON.stringify(firstBuild.notes),
        JSON.stringify(navView.notes));
    check('có breadcrumb + link quay về danh sách build',
        navView.hasBackLink && navView.html.includes('build-detail__breadcrumb'),
        '');
    check('breadcrumb có tên tướng và tên build',
        decodeEntities(navView.html).includes(heroById(firstBuild.heroId).name) && navView.html.includes('build-detail__breadcrumb'),
        '');

    /* ---------- 8. Tra theo ?heroId= (HD02) ---------- */
    section('8. Tra build theo ?heroId=');
    const heroOnly = BUILDS_JSON[4];
    const byHero = await openBuildDetail(`?heroId=${heroOnly.heroId}`);
    const expectedByHero = BUILDS_JSON.find((build) => String(build.heroId) === String(heroOnly.heroId));
    check(`?heroId=${heroOnly.heroId} -> mở đúng build của tướng đó`,
        byHero.view.name === expectedByHero.name,
        byHero.view.name);
    check('?id= được ưu tiên hơn ?heroId= khi cả hai cùng có',
        (await openBuildDetail(`?id=${lastBuild.id}&heroId=1`)).view.name === lastBuild.name,
        lastBuild.name);

    /* ---------- 9. Xử lý lỗi: thiếu id / id sai / JSON hỏng ---------- */
    section('9. Xử lý lỗi');
    const noId = await openBuildDetail('');
    check('thiếu id -> báo rõ cần id trên URL (có ví dụ)',
        noId.view.isEmptyState && decodeEntities(noId.view.html).includes('Thiếu mã hướng dẫn build trên đường dẫn'),
        decodeEntities(noId.view.html).slice(0, 200));
    check('thiếu id -> vẫn có link về danh sách build', noId.view.hasBackLink);
    check('thiếu id -> không render khối trang bị chính', noId.view.mainItemIds.length === 0);

    const notFound = await openBuildDetail('?id=99999');
    check('id không tồn tại -> báo đúng mã cần tìm',
        notFound.view.isEmptyState && decodeEntities(notFound.view.html).includes('Không tìm thấy hướng dẫn build có mã "99999".'),
        decodeEntities(notFound.view.html).slice(0, 200));

    const brokenJson = loadPage('?id=1', { failData: 'builds.json' });
    brokenJson.run();
    await brokenJson.settled();
    const brokenHtml = brokenJson.el('build-detail').innerHTML;
    check('JSON lỗi / tải hỏng -> báo lỗi tải dữ liệu',
        brokenHtml.includes('build-detail-empty') && decodeEntities(brokenHtml).includes('Không tải được dữ liệu hướng dẫn build'),
        decodeEntities(brokenHtml).slice(0, 200));
    const reloadBtn = brokenJson.el('build-detail').querySelector('[data-reload-build-detail]');
    check('JSON lỗi -> có nút tải lại trang', Boolean(reloadBtn));
    fire(reloadBtn, 'click');
    check('bấm tải lại trang -> gọi location.reload()', brokenJson.reloadCount() === 1, `reloadCount=${brokenJson.reloadCount()}`);

    /* ---------- 10. Chống XSS: dữ liệu độc hại phải được escape ---------- */
    section('10. Escape HTML dữ liệu build');
    const evil = Object.assign({}, firstBuild, {
        name: '<script>alert(1)</script>',
        skillOrder: '<img src=x onerror=alert(2)>',
        tips: ['<b>tip</b>'],
        notes: ['<i>note</i>'],
    });
    const evilPage = loadPage('?id=1', { data: { 'builds.json': [evil] } });
    evilPage.run();
    await evilPage.settled();
    const evilHtml = evilPage.el('build-detail').innerHTML;
    check('tên build độc hại được escape (không có thẻ <script>)',
        !/<script>alert\(1\)<\/script>/.test(evilHtml) && evilHtml.includes('&lt;script&gt;'),
        evilHtml.slice(0, 120));
    check('thứ tự kỹ năng + mẹo chơi độc hại cũng được escape',
        !/<img src=x onerror/.test(evilHtml) && !/<b>tip<\/b>/.test(evilHtml) && evilHtml.includes('&lt;img src=x'),
        '');

    /* ---------- 11. Hàm lọc dữ liệu tham chiếu (robustness) ---------- */
    section('11. Lọc id tham chiếu không hợp lệ');
    const helper = await openBuildDetail(`?id=${firstBuild.id}`);
    helper.runInPage(`var __it = ${JSON.stringify(ITEMS_JSON)}; var __he = ${JSON.stringify(HEROES_JSON)}; true;`);

    const dedupItems = JSON.parse(helper.runInPage(
        `JSON.stringify(buildDetailResolveItems(__it, [${firstBuild.items[0]}, 999999, ${firstBuild.items[0]}, 'abc']).map((i) => i.id))`,
    ));
    check('buildDetailResolveItems: bỏ id lạ + khử trùng lặp', JSON.stringify(dedupItems) === JSON.stringify([Number(firstBuild.items[0])]), JSON.stringify(dedupItems));

    const badCounters = JSON.parse(helper.runInPage(
        'JSON.stringify(buildDetailResolveCounters({ counters: [{ heroId: 999999, reason: "x" }, { heroId: 1, reason: "ok" }, { heroId: 1, reason: "trung" }] }, __he).map((c) => c.hero.id))',
    ));
    check('buildDetailResolveCounters: bỏ tướng lạ + khử trùng lặp', JSON.stringify(badCounters) === JSON.stringify([1]), JSON.stringify(badCounters));

    const badSituational = JSON.parse(helper.runInPage(
        'JSON.stringify(buildDetailResolveSituational({ situational: [{ replace: 999999, with: 101, reason: "x" }, { replace: 101, with: 102, reason: "ok" }] }, __it).map((s) => s.to.id))',
    ));
    check('buildDetailResolveSituational: bỏ tình huống thiếu trang bị hợp lệ', JSON.stringify(badSituational) === JSON.stringify([102]), JSON.stringify(badSituational));

    /* ---------- 12. Không lỗi JavaScript ---------- */
    section('12. Không lỗi');
    const pages = [await openBuildDetail(`?id=${firstBuild.id}`), noId, notFound];
    check('các lần mở trang chi tiết build không ném lỗi',
        pages.every((page) => page.errors.filter((error) => !error.startsWith('console.error')).length === 0),
        pages.flatMap((page) => page.errors).join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((failure) => console.log('  - ' + failure));
        process.exitCode = 1;
    }
})();
