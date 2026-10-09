/**
 * test-datastore.cjs - Kiểm tra lớp dữ liệu dùng chung (src/js/dataStore.js):
 * chế độ memoryOnly + seed (mini-dom qua __AOV_DATASTORE_TEST__), get/set collection,
 * kiểm tra tính hợp lệ, đồng bộ ghi ngược seed, viết thêm collection sau khi khởi tạo.
 * Chạy: node tools/test-datastore.cjs
 */
const { loadPage } = require('./mini-dom.cjs');

const PAGE = 'src/pages/login.html';

/** Seed cố lập cho page — chính object này được setCollection ghi ngược (useSeedRef). */
const seed = {
    users: [
        { username: 'admin', passwordHash: 'aa', salt: 'bb', role: 'admin' },
        { username: 'aovfan', passwordHash: 'cc', salt: 'dd', role: 'user' },
    ],
    posts: [
        { id: 1, title: 'Bài cũ' },
        { id: 2, title: 'Bài mới' },
    ],
    likes: { user: { post1: true, post2: false } },
};

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

/* ================= Test ================= */

async function openDataStorePage() {
    const page = loadPage({ page: PAGE, seed });
    page.run();
    await page.settled();
    return page;
}

(async () => {
    const page = await openDataStorePage();
    const run = (code) => page.runInPage(code);

    /* ---------- 1. memoryOnly + seed qua __AOV_DATASTORE_TEST__ ---------- */
    section('1. memoryOnly + seed');
    check('initDataStore nạp users từ seed (2 tài khoản), không đọc users.json',
        run('getCollection("users").length') === 2
        && run('getCollection("users")[0].username') === 'admin');

    const all = 'initDataStore({ collections: ["users", "posts", "comments", "likes"] }).then((values) => { window.__declared = JSON.stringify(values); })';
    run(all);
    // initDataStore trả Promise thật trong VM; đợi settled rồi đọc kết quả đã lưu.
    await page.settled();
    const declared = run('__declared');
    const declaredArr = typeof declared === 'string' ? JSON.parse(declared) : null;
    check('initDataStore trả dữ liệu đủ 4 bộ đã yêu cầu (kể cả sau khi đã khởi tạo)',
        Array.isArray(declaredArr) && declaredArr.length === 4
        && declaredArr[1][0].title === 'Bài cũ',
        String(declared && declared.slice(0, 60)));

    check('posts/likes cũng nạp từ seed (memoryOnly không đọc file)',
        run('getCollection("posts").length') === 2
        && run('getCollection("likes").user.post1') === true);

    /* ---------- 2. getCollection là bản sao sâu ---------- */
    section('2. bản sao sâu');
    run('(function () { const copy = getCollection("users"); copy.push({ username: "fake" }); window.__afterMutate = getCollection("users").length; })();');
    check('sửa bản trả về không làm đổi dữ liệu gốc',
        run('__afterMutate') === 2,
        String(run('__afterMutate')));

    run('(function () { const copy = getCollection("users"); copy[0].username = "doi-ten"; window.__afterEdit = getCollection("users")[0].username; })();');
    check('sửa object con của bản trả về cũng không đổi dữ liệu gốc',
        run('__afterEdit') === 'admin',
        String(run('__afterEdit')));

    /* ---------- 3. setCollection: true khi hợp lệ, false khi sai kiểu ---------- */
    section('3. setCollection hợp lệ / sai kiểu');
    const setOk = run('(function () { const ok = setCollection("users", [{ username: "admin", passwordHash: "a", salt: "b", role: "admin" }, { username: "newbie", passwordHash: "c", salt: "d", role: "user" }]); return JSON.stringify([ok, getCollection("users").length]); })()');
    const [okValue, newLength] = typeof setOk === 'string' ? JSON.parse(setOk) : [null, null];
    check('setCollection mảng hợp lệ trả true và nạp vào bộ nhớ',
        okValue === true && newLength === 2,
        String(setOk));

    const invalid = run('setCollection("posts", "không phải mảng")');
    check('setCollection sai kiểu dữ liệu trả false (không phá collection)',
        invalid === false && run('getCollection("posts").length') === 2,
        String(invalid));

    /* ---------- 4. Lỗi khi dùng bộ không tồn tại ---------- */
    section('4. bộ không tồn tại');
    const noThrow = run('(function () { try { getCollection("khong-tontai"); return "no-throw"; } catch (error) { return error.message; } })()');
    check('getCollection bộ không tồn tại ném lỗi (không im lặng)',
        typeof noThrow === 'string' && noThrow.includes('không tồn tại'),
        String(noThrow));

    run('initDataStore({ collections: ["users", "xyz"] }).then((r) => { window.__declared2 = JSON.stringify(r); })');
    await page.settled();
    const declared2 = run('__declared2');
    const declared2Arr = typeof declared2 === 'string' ? JSON.parse(declared2) : null;
    check('initDataStore lọc bớt bộ không có trong schema (chỉ còn users)',
        Array.isArray(declared2Arr) && declared2Arr.length === 1
        && Array.isArray(declared2Arr[0]) && declared2Arr[0][0].username === 'admin',
        String(declared2 && declared2.slice(0, 60)));

    /* ---------- 5. Đồng bộ ghi ngược về seed (useSeedRef) ---------- */
    section('5. setCollection ghi ngược seed');
    run('setCollection("users", getCollection("users").concat([{ username: "them-nguoi", passwordHash: "e", salt: "f", role: "user" }]))');
    check('object seed truyền từ Node thấy đúng dữ liệu mới (users khiêu qua setCollection)',
        seed.users.length === 3
        && seed.users.some((user) => user.username === 'them-nguoi'),
        String(seed.users.length));

    /* ---------- 6. storage mô phỏng nhìn xuyên collection ---------- */
    section('6. storage aov_* <-> collection');
    const before = page.storage.get('aov_users');
    check('page.storage đọc aov_users trả đúng nội dung collection users',
        typeof before === 'string'
        && JSON.parse(before).some((user) => user.username === 'them-nguoi'),
        typeof before);

    page.storage.set('aov_users', JSON.stringify([{ username: 'admin', passwordHash: 'a', salt: 'b', role: 'admin' }]));
    check('ghi aov_users qua storage -> collection users cập nhật theo',
        run('getCollection("users").length') === 1
        && run('getCollection("users")[0].username') === 'admin');

    /* ---------- 7. whenDataSaved() luôn trả về ---------- */
    section('7. whenDataSaved');
    run('whenDataSaved().then(() => { window.__saved = true; })');
    await page.settled();
    check('whenDataSaved() giải quyết (chế độ memoryOnly không treo)',
        run('__saved') === true,
        String(run('__saved')));

    /* ---------- 8. Không lỗi JavaScript ---------- */
    section('8. Không lỗi');
    check('trang nạp dataStore không ném lỗi JavaScript',
        page.errors.filter((error) => !error.startsWith('console.error')).length === 0,
        page.errors.join(' | '));

    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((failure) => console.log('  - ' + failure));
        process.exitCode = 1;
    }
})();