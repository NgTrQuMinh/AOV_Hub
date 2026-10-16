/**
 * Test lớp gộp + kiểm tra dữ liệu của tab "Dữ liệu" (src/js/admin-datacheck.js).
 * Task CM06 ("Test tự động lớp gộp dữ liệu") / AD11.
 *
 * Phạm vi:
 *   1. Dữ liệu THẬT (heroes.json, items.json, builds.json, posts.json, users.json)
 *      gộp qua adminDataCheckRun() phải SẠCH: 0 vấn đề mức "error".
 *   2. adminDataCheckRun() thật sự BẮT ĐƯỢC lỗi: id trùng, heroId/trang bị không tồn tại,
 *      related hỏng, tác giả lạ, createdAt sai, postId bình luận sai, lượt thích sai kiểu.
 *   3. Dữ liệu sai kiểu (null/chuỗi...) không làm hàm gộp ném lỗi.
 *   4. loadData(): đọc được file thật, trả [] khi file thiếu / HTTP lỗi.
 *   5. adminDataCheckLoad() gom dữ liệu từ các lớp: đọc items/builds qua loadData,
 *      đọc posts/... qua getCollection, và ghi tên phần không lấy được vào skipped.
 *
 * Chạy: node tools/test-admin-data.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage } = require('./mini-dom.cjs');

const ADMIN_PAGE = 'src/pages/admin.html';
const DATACHECK_JS = fs.readFileSync(path.join(ROOT, 'src/js/admin-datacheck.js'), 'utf8');

const HEROES = require('../src/data/heroes.json');
const ITEMS = require('../src/data/items.json');
const BUILDS = require('../src/data/builds.json');
const POSTS = require('../src/data/posts.json');
const USERS = require('../src/data/users.json');

const ADMIN_USERNAME = 'admin';

/* ================= Test runner ================= */

let passed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) {
        passed++;
        console.log('  PASS  ' + name);
        return;
    }

    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log('  FAIL  ' + name + (detail ? `\n        ${detail}` : ''));
}

function section(title) {
    console.log('\n== ' + title + ' ==');
}

/* ================= Trợ giúp ================= */

/** Trang admin có config.js + dataStore.js + loadData.js + heroData.js + admin-datacheck. */
async function openAdminCheck(options) {
    const page = loadPage(Object.assign({
        page: ADMIN_PAGE,
        login: ADMIN_USERNAME,
        search: '?tab=data',
    }, options));

    page.run();
    await page.settled();

    // admin-shell.js nạp admin-datacheck.js động; mini-dom không chạy <script> động.
    page.runInPage(DATACHECK_JS);

    return page;
}

/** Gọi adminDataCheckRun() trong ngữ cảnh trang với bộ dữ liệu truyền vào. */
function runCheck(page, datasets) {
    page.runInPage('window.__datasets = ' + JSON.stringify(datasets) + ';');
    return page.runInPage('adminDataCheckRun(window.__datasets)');
}

/** Lọc vấn đề theo mức. */
const levelCount = (report, level) => report.issues.filter((issue) => issue.level === level).length;

/** Nối toàn bộ thông điệp vấn đề để dò chuỗi con. */
const messages = (report) => report.issues.map((issue) => issue.message).join('\n');

/* ================= Test ================= */

(async () => {
    /* ---------- 1. Dữ liệu thật phải sạch ---------- */
    section('1. adminDataCheckRun() trên dữ liệu thật');

    const page = await openAdminCheck({});
    const usernames = USERS.map((user) => user.username).filter((name) => typeof name === 'string');

    const real = runCheck(page, {
        heroes: HEROES,
        items: ITEMS,
        builds: BUILDS,
        posts: POSTS,
        comments: [],
        likes: {},
        usernames: usernames,
    });

    check('đếm đúng số bản ghi đã kiểm (32 tướng, 40 trang bị, 32 build, ' + POSTS.length + ' bài)',
        real.checked.heroes === 32 && real.checked.items === 40
        && real.checked.builds === 32 && real.checked.posts === POSTS.length,
        JSON.stringify(real.checked));
    check('dữ liệu thật KHÔNG có vấn đề mức "error"',
        levelCount(real, 'error') === 0,
        messages(real));
    check('mọi vấn đề (nếu có) đều là "warn"',
        real.issues.every((issue) => issue.level === 'warn'),
        JSON.stringify(real.issues.slice(0, 5)));

    console.log('        (cảnh báo cấp "warn" trên dữ liệu thật: ' + levelCount(real, 'warn') + ')');

    /* ---------- 2. Bắt được lỗi tham chiếu ---------- */
    section('2. adminDataCheckRun() bắt lỗi');

    const broken = runCheck(page, {
        heroes: [
            { id: 1, name: 'Tướng A', image: 'a.png', role: ['Đấu sĩ'], difficulty: 'Dễ', stats: { hp: 100 }, recommendedBuild: [9999] },
            { id: 1, name: 'Tướng trùng id', image: 'b.png', role: ['Xạ thủ'], difficulty: 'Khó', stats: { hp: 100 }, recommendedBuild: [] },
        ],
        items: [
            { id: 101, name: 'Trang bị A', type: 'Công', price: 1000, stats: { attack: 10 }, image: 'i.png', passive: 'p', description: 'd', related: [9999, 101] },
            { id: 101, name: 'Trang bị trùng id', type: 'Thủ', price: 1000, stats: { defense: 10 }, image: 'j.png', passive: 'p', description: 'd', related: [] },
        ],
        builds: [
            { id: 1, heroId: 9999, name: 'Build hỏng', items: [9999, 101], description: 'x' },
        ],
        posts: [
            { id: 1, title: '', content: '', author: 'nguoi_la', heroId: 7777, createdAt: 'khong-phai-ngay', status: 'trang-thai-la' },
        ],
        comments: [
            { id: 1, postId: 999, author: 'nguoi_la', content: '' },
        ],
        likes: {
            9999: ['nguoi_la', 'nguoi_la'],
            1: 'khong-phai-mang',
        },
        usernames: ['admin'],
    });

    const text = messages(broken);

    check('bắt id trùng (Tướng/Trang bị)', text.includes('ID trùng: #1') && text.includes('ID trùng: #101'));
    check('bắt heroId không tồn tại', text.includes('heroId không tồn tại: 9999'));
    check('bắt trang bị của build không tồn tại', text.includes('Trang bị không tồn tại: 9999'));
    check('bắt recommendedBuild trỏ trang bị không tồn tại', text.includes('Trang bị đề xuất không tồn tại: 9999'));
    check('bắt related trỏ trang bị không tồn tại', text.includes('related trỏ trang bị không tồn tại: 9999'));
    check('bắt tác giả bài viết không tồn tại', text.includes('Tác giả không tồn tại: nguoi_la'));
    check('bắt createdAt sai', text.includes('createdAt không phải ngày hợp lệ'));
    check('bắt trạng thái bài viết không hợp lệ', text.includes('Trạng thái không hợp lệ: trang-thai-la'));
    check('bắt postId bình luận không tồn tại', text.includes('postId không tồn tại: 999'));
    check('bắt lượt thích sai kiểu + username lạ', text.includes('Giá trị không phải mảng') && text.includes('Username không tồn tại: nguoi_la'));
    check('các lỗi trên đều ở mức "error"', levelCount(broken, 'error') >= 8, 'errors=' + levelCount(broken, 'error'));

    /* ---------- 3. Dữ liệu sai kiểu không làm ném lỗi ---------- */
    section('3. Chịu được dữ liệu sai kiểu');

    const messy = runCheck(page, {
        heroes: null,
        items: 'sai-kiểu',
        builds: 42,
        posts: { khong: 'phai mang' },
        comments: null,
        likes: [1, 2, 3],
        usernames: 'admin',
    });

    check('datasets sai kiểu -> trả { issues, checked } rỗng, không ném lỗi',
        messy && Array.isArray(messy.issues) && messy.checked
        && messy.issues.length === 0
        && messy.checked.heroes === 0 && messy.checked.items === 0 && messy.checked.builds === 0,
        JSON.stringify(messy));

    /* ---------- 4. loadData() ---------- */
    section('4. loadData()');

    const itemsLoaded = await page.runInPage('loadData(DATA_PATH.items)').then((value) => value);
    check('đọc items.json thật trả về mảng 40 phần tử',
        Array.isArray(itemsLoaded) && itemsLoaded.length === 40,
        Array.isArray(itemsLoaded) ? String(itemsLoaded.length) : typeof itemsLoaded);

    const missing = await page.runInPage('loadData(BASE_PATH + "src/data/khong-ton-tai.json")');
    check('file không tồn tại -> trả mảng rỗng', Array.isArray(missing) && missing.length === 0);

    const brokenPage = await openAdminCheck({ failData: 'items.json' });
    const failed = await brokenPage.runInPage('loadData(DATA_PATH.items)');
    check('HTTP lỗi (failData) -> trả mảng rỗng', Array.isArray(failed) && failed.length === 0);

    /* ---------- 5. adminDataCheckLoad() gom dữ liệu ---------- */
    section('5. adminDataCheckLoad()');

    const seedPosts = [
        { id: 9001, author: ADMIN_USERNAME, title: 'Bài seed', content: 'Nội dung seed', heroId: 1, category: 'Khác', createdAt: '2025-01-01T00:00:00.000Z', status: 'approved' },
    ];

    const loadPageAdmin = await openAdminCheck({
        storage: new Map([['aov_posts', JSON.stringify(seedPosts)]]),
    });

    const gathered = await loadPageAdmin.runInPage('adminDataCheckLoad()');
    const sets = gathered.datasets;
    const skipped = gathered.skipped;

    check('gom được items (40) và builds (32) qua loadData',
        Array.isArray(sets.items) && sets.items.length === 40
        && Array.isArray(sets.builds) && sets.builds.length === 32,
        'items=' + (sets.items || []).length + ' builds=' + (sets.builds || []).length);
    check('gom được posts qua getCollection (aov_posts đã dựng)',
        Array.isArray(sets.posts) && sets.posts.some((post) => post.id === 9001),
        JSON.stringify((sets.posts || []).map((post) => post.id)));
    check('LẤY được username (đối chiếu tác giả)',
        Array.isArray(sets.usernames) && sets.usernames.includes(ADMIN_USERNAME),
        JSON.stringify(sets.usernames));
    check('skipped KHÔNG liệt kê trang bị / build / bài viết / người dùng (đều lấy được)',
        !skipped.includes('trang bị') && !skipped.includes('build')
        && !skipped.includes('bài viết') && !skipped.includes('người dùng'),
        JSON.stringify(skipped));

    /* ---------- 6. Không lỗi JavaScript ---------- */
    section('6. Không lỗi JavaScript');

    const allPages = [page, brokenPage, loadPageAdmin];
    const jsErrors = allPages.flatMap((p) => p.errors.filter((error) => !error.startsWith('console.error')));
    check('không lần mở trang nào ném lỗi JavaScript', jsErrors.length === 0, jsErrors.join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})();
