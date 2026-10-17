/**
 * test-build-runes.cjs - Kiểm tra Bảng ngọc / Phép bổ trợ (HD05).
 *
 * Phủ:
 *   - src/data/runes.json hợp lệ: mọi vai trò tướng trong heroes.json đều có bảng ngọc,
 *     mỗi bảng 3 ngọc (Đỏ / Xanh dương / Xanh lá) + 2 phép bổ trợ, đường Rừng có Trừng phạt.
 *   - buildDetailResolveRunes() ghép theo vai trò tướng, đường Rừng ghi đè phép bổ trợ,
 *     vai trò lạ / thiếu tướng thì dùng bảng mặc định.
 *   - Trang chi tiết render khối "Bảng ngọc / Phép bổ trợ" (bảng 3 dòng + danh sách phép).
 *   - Dữ liệu độc hại được escape.
 *
 * Chạy: node tools/test-build-runes.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage: loadPageShared, unescapeHtml } = require('./mini-dom.cjs');

const DETAIL_PAGE = 'src/pages/build-detail.html';
const BUILDS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/builds.json'), 'utf8'));
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));
const RUNES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/runes.json'), 'utf8'));

const heroById = (id) => HEROES_JSON.find((hero) => String(hero.id) === String(id)) || null;
const heroRoles = [...new Set(HEROES_JSON.flatMap((hero) => hero.role || []))];
const jungleBuild = BUILDS_JSON.find((build) => build.lane === 'Rừng') || null;

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

async function openBuildDetail(search, options) {
    const page = loadPageShared(Object.assign({ page: DETAIL_PAGE, search }, options));
    page.run();
    await page.settled();
    return page;
}

/** Gọi buildDetailResolveRunes() trong ngữ cảnh trang và trả về object thuần. */
function resolveInPage(page, runesData, build, hero) {
    const code = `(function () {
        const info = buildDetailResolveRunes(${JSON.stringify(runesData)}, ${JSON.stringify(build)}, ${JSON.stringify(hero)});
        return JSON.stringify({ role: info.role, lane: info.lane, runes: info.runes, spells: info.spells, matched: info.matched });
    })()`;
    return JSON.parse(page.runInPage(code));
}

const RUNE_COLORS = ['Đỏ', 'Xanh dương', 'Xanh lá'];

(async () => {
    /* ---------------- 1. Dữ liệu runes.json ---------------- */
    section('1. Dữ liệu runes.json');

    check('runes.json có ghi chú giải thích nguồn', Boolean(String(RUNES_JSON.note || '').trim()));
    check('runes.json có nhánh roles / lanes / fallback',
        RUNES_JSON.roles && typeof RUNES_JSON.roles === 'object'
        && RUNES_JSON.lanes && typeof RUNES_JSON.lanes === 'object'
        && RUNES_JSON.fallback && typeof RUNES_JSON.fallback === 'object');

    const missingRoles = heroRoles.filter((role) => !RUNES_JSON.roles[role]);
    check('mọi vai trò tướng trong heroes.json đều có bảng ngọc', missingRoles.length === 0, missingRoles.join(', '));

    const badRoleEntry = heroRoles.filter((role) => {
        const entry = RUNES_JSON.roles[role];
        if (!entry) return true;
        const runesOk = Array.isArray(entry.runes) && entry.runes.length === 3
            && entry.runes.every((rune) => rune && rune.color && rune.name && rune.effect);
        const spellsOk = Array.isArray(entry.spells) && entry.spells.length === 2;
        return !runesOk || !spellsOk;
    });
    check('mỗi vai trò có 3 ngọc (đủ color/name/effect) + 2 phép bổ trợ', badRoleEntry.length === 0, badRoleEntry.join(', '));

    const coloredOk = heroRoles.every((role) => RUNES_JSON.roles[role].runes.every((rune) => RUNE_COLORS.includes(rune.color)));
    check('màu ngọc thuộc bộ Đỏ / Xanh dương / Xanh lá', coloredOk);

    check('đường Rừng có phép "Trừng phạt"',
        Array.isArray(RUNES_JSON.lanes['Rừng'] && RUNES_JSON.lanes['Rừng'].spells)
        && RUNES_JSON.lanes['Rừng'].spells.includes('Trừng phạt'));

    check('bảng mặc định (fallback) có ngọc + phép',
        Array.isArray(RUNES_JSON.fallback.runes) && RUNES_JSON.fallback.runes.length >= 1
        && Array.isArray(RUNES_JSON.fallback.spells) && RUNES_JSON.fallback.spells.length >= 1);

    check('có ít nhất 1 build đường Rừng để kiểm tra ghi đè phép bổ trợ', Boolean(jungleBuild));

    /* ---------------- 2. buildDetailResolveRunes() ---------------- */
    section('2. buildDetailResolveRunes()');

    const page = await openBuildDetail('?id=1');
    const firstBuild = BUILDS_JSON[0];
    const firstHero = heroById(firstBuild.heroId);

    const base = resolveInPage(page, RUNES_JSON, firstBuild, firstHero);
    check('build id=1: trả về đúng vai trò tướng', base.role === (firstHero.role || [])[0], `role=${base.role}`);
    check('build id=1: có 3 ngọc', base.runes.length === 3, `got ${base.runes.length}`);
    check('build id=1: có 2 phép bổ trợ', base.spells.length === 2, base.spells.join(', '));
    check('build id=1: khớp bảng ngọc của vai trò', base.matched === true);

    if (jungleBuild) {
        const jungleHero = heroById(jungleBuild.heroId);
        const jungle = resolveInPage(page, RUNES_JSON, jungleBuild, jungleHero);
        check('build đường Rừng: phép bổ trợ đầu là "Trừng phạt"', jungle.spells[0] === 'Trừng phạt', jungle.spells.join(', '));
    }

    const unknownRole = resolveInPage(page, RUNES_JSON, firstBuild, Object.assign({}, firstHero, { role: ['Vai trò không tồn tại'] }));
    check('vai trò lạ: dùng bảng ngọc mặc định',
        JSON.stringify(unknownRole.runes) === JSON.stringify(RUNES_JSON.fallback.runes),
        JSON.stringify(unknownRole.runes));

    const noHero = resolveInPage(page, RUNES_JSON, firstBuild, null);
    check('thiếu tướng: dùng bảng ngọc mặc định', noHero.runes.length === RUNES_JSON.fallback.runes.length);

    const broken = resolveInPage(page, null, firstBuild, firstHero);
    check('runes.json hỏng (null): không ném lỗi, trả về rỗng',
        Array.isArray(broken.runes) && broken.runes.length === 0 && broken.spells.length === 0 && broken.matched === false);

    /* ---------------- 3. Trang chi tiết render khối ngọc ---------------- */
    section('3. Trang chi tiết: khối "Bảng ngọc / Phép bổ trợ"');

    const detailHtml = page.el('build-detail').innerHTML;
    const runesSection = detailHtml.match(/<section class="build-detail__section build-detail__runes-section">[\s\S]*?<\/section>/);
    check('có khối build-detail__runes-section', Boolean(runesSection));

    const block = runesSection ? runesSection[0] : '';
    check('khối ngọc có tiêu đề "Bảng ngọc / Phép bổ trợ"', block.includes('Bảng ngọc / Phép bổ trợ'));
    check('bảng ngọc có 3 dòng (rune-table__name)', (block.match(/rune-table__name"/g) || []).length === 3);
    check('ngọc có lớp màu tương ứng', /rune-table__color--(red|blue|green|default)/.test(block));
    check('có danh sách phép bổ trợ', block.includes('spell-list') && block.includes('Phép bổ trợ'));

    if (jungleBuild) {
        const junglePage = await openBuildDetail('?id=' + jungleBuild.id);
        const jungleHtml = junglePage.el('build-detail').innerHTML;
        check('build đường Rừng: khối ngọc hiển thị "Trừng phạt"', jungleHtml.includes('Trừng phạt'));
    }

    /* ---------------- 4. Escape ---------------- */
    section('4. Escape dữ liệu ngọc độc hại');

    const evilRunes = {
        roles: {
            'Xạ thủ': {
                runes: [{ color: 'Đỏ', name: '<script>alert(1)</script>', effect: '<b>x</b>' }],
                spells: ['<i>z</i>'],
            },
        },
        fallback: { runes: [], spells: [] },
    };
    const evilHtml = page.runInPage(`renderBuildDetailRunes(${JSON.stringify(evilRunes)}, ${JSON.stringify({ lane: '' })}, ${JSON.stringify({ role: ['Xạ thủ'] })})`);
    check('tên ngọc độc hại được escape', !evilHtml.includes('<script>') && evilHtml.includes('&lt;script&gt;'));
    check('phép bổ trợ độc hại được escape', evilHtml.includes('&lt;i&gt;') && !evilHtml.includes('<i>z</i>'));

    /* ---------------- 5. Không lỗi ---------------- */
    section('5. Không lỗi JavaScript');
    check('mở trang chi tiết build không ném lỗi', page.errors.length === 0, page.errors.join(' | '));

    /* ---------------- Tổng kết ---------------- */
    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})();
