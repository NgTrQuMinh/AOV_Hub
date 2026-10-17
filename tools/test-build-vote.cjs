/**
 * test-build-vote.cjs - Kiểm tra bình chọn "Hữu ích" cho build (HD07).
 *
 * Phủ:
 *   - storage.js: getBuildVotes / getBuildVoteCount / hasVotedBuild / toggleBuildVote
 *     với LocalStorage key aov_build_votes = { buildId: [username] }.
 *   - Ràng buộc "mỗi người một lượt/build" (bật/tắt, không nhân đôi phiếu).
 *   - Dữ liệu hỏng trong LocalStorage được bù an toàn.
 *   - UI build-vote.js: nút hiện trên thẻ build (trang danh sách) và trang chi tiết;
 *     khách bấm -> báo cần đăng nhập; đã đăng nhập bấm -> ghi dữ liệu + đổi trạng thái.
 *
 * Chạy: node tools/test-build-vote.cjs
 */
const { ROOT, loadPage: loadPageShared, fire } = require('./mini-dom.cjs');
const path = require('path');
const fs = require('fs');

const BUILDS_PAGE = 'src/pages/builds.html';
const DETAIL_PAGE = 'src/pages/build-detail.html';
const BUILDS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/builds.json'), 'utf8'));
const VOTES_KEY = 'aov_build_votes';

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

async function open(page, search, options) {
    const sp = loadPageShared(Object.assign({ page, search }, options));
    sp.run();
    await sp.settled();
    return sp;
}

/** Gọi một biểu thức trong ngữ cảnh trang và trả về giá trị (JSON nếu là object). */
const inPage = (sp, expr) => sp.runInPage(expr);

(async () => {
    /* ---------------- 1. Hàm dữ liệu ---------------- */
    section('1. Hàm dữ liệu bình chọn (storage.js)');

    const storage = new Map();
    const page = await open(BUILDS_PAGE, '', { storage });

    check('getBuildVotes() mặc định là object rỗng', inPage(page, 'JSON.stringify(getBuildVotes())') === '{}');

    const first = JSON.parse(inPage(page, "JSON.stringify(toggleBuildVote(1, 'alice'))"));
    check('toggle lần 1: voted=true, count=1', first.voted === true && first.count === 1, JSON.stringify(first));
    check('đã lưu vào aov_build_votes', JSON.stringify(page.readKey(VOTES_KEY)) === JSON.stringify({ 1: ['alice'] }), JSON.stringify(page.readKey(VOTES_KEY)));
    check('hasVotedBuild(1, alice) = true', inPage(page, "hasVotedBuild(1, 'alice')") === true);
    check('getBuildVoteCount(1) = 1', inPage(page, 'getBuildVoteCount(1)') === 1);

    const second = JSON.parse(inPage(page, "JSON.stringify(toggleBuildVote(1, 'alice'))"));
    check('toggle lần 2 (cùng người): voted=false, count=0', second.voted === false && second.count === 0, JSON.stringify(second));
    check('hasVotedBuild(1, alice) trở lại false', inPage(page, "hasVotedBuild(1, 'alice')") === false);

    /* Mỗi người một lượt: alice + bob = 2, alice bỏ phiếu còn 1. */
    inPage(page, "toggleBuildVote(2, 'alice')");
    inPage(page, "toggleBuildVote(2, 'bob')");
    check('hai người khác nhau -> count = 2', inPage(page, 'getBuildVoteCount(2)') === 2);
    inPage(page, "toggleBuildVote(2, 'alice')");
    check('một người bỏ phiếu -> còn phiếu của người kia', inPage(page, 'getBuildVoteCount(2)') === 1 && inPage(page, "hasVotedBuild(2, 'bob')") === true);
    check('không nhân đôi phiếu dù gọi hasVoted nhiều lần', JSON.stringify(page.readKey(VOTES_KEY)[2]) === JSON.stringify(['bob']), JSON.stringify(page.readKey(VOTES_KEY)));

    check('toggleBuildVote thiếu username -> null', inPage(page, "String(toggleBuildVote(3, ''))") === 'null');
    check('toggleBuildVote thiếu buildId -> null', inPage(page, "String(toggleBuildVote(null, 'alice'))") === 'null');
    check('hasVotedBuild với build chưa ai bình chọn -> false', inPage(page, "hasVotedBuild(999, 'alice')") === false);
    check('getBuildVoteCount build lạ -> 0', inPage(page, 'getBuildVoteCount(999)') === 0);

    /* Bền vững qua nhiều lần mở trang + dữ liệu hỏng. */
    const reopened = await open(BUILDS_PAGE, '', { storage: page.storage });
    check('phiếu giữ nguyên sau khi tải lại trang', inPage(reopened, 'getBuildVoteCount(2)') === 1);

    const broken = await open(BUILDS_PAGE, '', { storage: new Map([[VOTES_KEY, '{khong-phai-json']]) });
    check('aov_build_votes hỏng JSON -> coi như rỗng', inPage(broken, 'JSON.stringify(getBuildVotes())') === '{}');

    const wrongShape = await open(BUILDS_PAGE, '', { storage: new Map([[VOTES_KEY, JSON.stringify({ 1: 'alice', 2: ['bob', '', null], 3: [42] })]]) });
    check('aov_build_votes sai kiểu -> bỏ khoá không phải mảng, lọc username rỗng',
        inPage(wrongShape, 'JSON.stringify(getBuildVotes())') === JSON.stringify({ 2: ['bob'], 3: ['42'] }),
        inPage(wrongShape, 'JSON.stringify(getBuildVotes())'));

    /* ---------------- 2. UI trang danh sách ---------------- */
    section('2. UI: nút "Hữu ích" trên thẻ build');

    const listPage = await open(BUILDS_PAGE, '', { storage: new Map() });
    const listHtml = listPage.el('build-list').innerHTML;
    check('mỗi thẻ build có nút bình chọn', (listHtml.match(/data-build-vote="/g) || []).length === BUILDS_JSON.length,
        `${(listHtml.match(/data-build-vote="/g) || []).length} nút / ${BUILDS_JSON.length} build`);
    check('nút bình chọn có nhãn "Hữu ích"', listHtml.includes('Hữu ích'));
    check('nút bình chọn có số lượt', listHtml.includes('btn-vote-build__count'));

    /* Khách bấm -> báo đăng nhập, không ghi dữ liệu. */
    const guestBtn = listPage.el('build-list').querySelector('[data-build-vote="1"]');
    fire(guestBtn, 'click', listPage.doc);
    check('khách bấm nút -> báo cần đăng nhập', listPage.alerts.some((msg) => /đăng nhập/.test(msg)), listPage.alerts.join(' | '));
    check('khách bấm nút -> không ghi aov_build_votes', guestBtn && listPage.readKey(VOTES_KEY) === null, String(listPage.readKey(VOTES_KEY)));

    /* ---------------- 3. UI đã đăng nhập ---------------- */
    section('3. UI: người dùng đã đăng nhập bình chọn');

    const userPage = await open(BUILDS_PAGE, '', { login: 'alice', storage: new Map() });
    const btn = userPage.el('build-list').querySelector('[data-build-vote="1"]');
    check('nút tìm được trên thẻ build', Boolean(btn));

    fire(btn, 'click', userPage.doc);
    const stored = userPage.readKey(VOTES_KEY);
    check('bấm nút -> ghi phiếu của alice', stored && stored[1] && stored[1].includes('alice'), JSON.stringify(stored));
    check('bấm nút -> cập nhật aria-pressed=true', btn.getAttribute('aria-pressed') === 'true', btn.getAttribute('aria-pressed'));
    check('bấm nút -> thêm lớp is-active', btn.classList.contains('is-active'));
    check('bấm nút -> số lượt trên nút = 1', btn.querySelector('.btn-vote-build__count').textContent === '1',
        btn.querySelector('.btn-vote-build__count').textContent);

    fire(btn, 'click', userPage.doc);
    check('bấm lại -> bỏ phiếu (không còn phiếu nào)',
        btn.getAttribute('aria-pressed') === 'false' && Object.keys(userPage.readKey(VOTES_KEY) || {}).length === 0,
        JSON.stringify(userPage.readKey(VOTES_KEY)));

    /* ---------------- 4. UI trang chi tiết ---------------- */
    section('4. UI: nút bình chọn trên trang chi tiết build');

    const detailPage = await open(DETAIL_PAGE, '?id=1', { login: 'bob', storage: new Map() });
    const detailBtn = detailPage.el('build-detail').querySelector('[data-build-vote="1"]');
    check('trang chi tiết có nút bình chọn build id=1', Boolean(detailBtn));

    if (detailBtn) {
        fire(detailBtn, 'click', detailPage.doc);
        check('bấm nút ở trang chi tiết -> ghi phiếu', detailPage.readKey(VOTES_KEY)[1].includes('bob'), JSON.stringify(detailPage.readKey(VOTES_KEY)));
    }

    check('mở trang chi tiết không ném lỗi', detailPage.errors.length === 0, detailPage.errors.join(' | '));
    check('mở trang danh sách không ném lỗi', listPage.errors.length === 0, listPage.errors.join(' | '));

    /* ---------------- Tổng kết ---------------- */
    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})();
