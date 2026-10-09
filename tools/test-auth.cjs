/**
 * Test cho lớp xác thực (src/js/auth.js + src/pages/login.html + register.html).
 *
 * Chạy code thật của dự án trong mini-dom, không mock logic:
 *   - A1 getSafeRedirect: chặn open redirect (redirect ngoài host, //, /\, control char, không phải chuỗi)
 *   - A2 chịu dữ liệu hỏng: users.json sai kiểu / phần tử rác vẫn không làm sập trang
 *   - A3 người dùng cũ (dữ liệu còn mật khẩu thô trong bản nháp) vẫn đăng nhập được
 *        admin và demo, tài khoản tự đăng ký không bị mất
 *   - A4 registerUser trả { ok, error }, báo lỗi trùng/không hợp lệ, không ghi khi lỗi
 *   - A5 đăng ký/đăng nhập băm mật khẩu PBKDF2 (không còn mật khẩu thô), nâng cấp
 *        tài khoản cũ sau lần đăng nhập đúng đầu tiên
 *
 * Chạy: node tools/test-auth.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire } = require('./mini-dom.cjs');

const PAGE_LOGIN = 'src/pages/login.html';
const PAGE_REGISTER = 'src/pages/register.html';

const USERS_FILE_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/users.json'), 'utf8'));

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

/** Chờ một điều kiện trở thành true (form submit có async handler). */
async function waitUntil(fn, timeout = 3000, step = 25) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (fn()) return true;
        await new Promise((resolve) => setTimeout(resolve, step));
    }
    return Boolean(fn());
}

(async () => {
    /* ---------- A1. getSafeRedirect chặn open redirect ---------- */
    section('A1. getSafeRedirect chặn open redirect');

    const page = loadPage({ page: PAGE_LOGIN });
    page.run();

    const cases = [
        { input: '/src/pages/profile.html', expect: '/src/pages/profile.html' },
        { input: '/index.html?a=1#x', expect: '/index.html?a=1#x' },
        { input: undefined, expect: '/index.html' },
        { input: null, expect: '/index.html' },
        { input: '', expect: '/index.html' },
        { input: 'yyy', expect: '/index.html' },
        { input: 'https://evil.com', expect: '/index.html' },
        { input: '//evil.com', expect: '/index.html' },
        { input: '/\\evil', expect: '/index.html' },
        { input: 'javascript:alert(1)', expect: '/index.html' },
        { input: '/a\u0000b', expect: '/index.html' },
        { input: '/a\u001fb', expect: '/index.html' },
    ];

    for (const { input, expect } of cases) {
        const code = input === undefined
            ? 'getSafeRedirect()'
            : `getSafeRedirect(${JSON.stringify(input)})`;
        const actual = page.runInPage(code);
        check(`getSafeRedirect(${JSON.stringify(input)}) -> ${JSON.stringify(expect)}`,
            actual === expect, String(actual));
    }

    section('A1. Đăng nhập điều hướng bằng getSafeRedirect');

    const redirectGood = loadPage({ page: PAGE_LOGIN, search: '?redirect=%2Fsrc%2Fpages%2Fprofile.html' });
    redirectGood.run();
    redirectGood.el('login-username').value = 'demo';
    redirectGood.el('login-password').value = '123456';
    fire(redirectGood.el('login-form'), 'submit');
    const goodWent = await waitUntil(() => redirectGood.location.href === '/src/pages/profile.html');
    check('redirect nội bộ hợp lệ: chuyển về đúng trang cũ', goodWent, redirectGood.location.href);

    const redirectEvil = loadPage({ page: PAGE_LOGIN, search: '?redirect=https%3A%2F%2Fevil.example%2Fadmin' });
    redirectEvil.run();
    redirectEvil.el('login-username').value = 'demo';
    redirectEvil.el('login-password').value = '123456';
    fire(redirectEvil.el('login-form'), 'submit');
    const evilWent = await waitUntil(() => redirectEvil.location.href === '/index.html');
    check('redirect ra ngoài host bị chặn -> về trang chủ', evilWent, redirectEvil.location.href);

    const redirectDanger = loadPage({ page: PAGE_LOGIN, search: '?redirect=%2F%2Fevil.example%2Fx' });
    redirectDanger.run();
    redirectDanger.el('login-username').value = 'demo';
    redirectDanger.el('login-password').value = '123456';
    fire(redirectDanger.el('login-form'), 'submit');
    const dangerWent = await waitUntil(() => redirectDanger.location.href === '/index.html');
    check('redirect "//..." bị chặn -> về trang chủ', dangerWent, redirectDanger.location.href);

    check('đăng nhập demo không ném lỗi JS',
        redirectGood.errors.filter((error) => !error.startsWith('console.error')).length === 0,
        redirectGood.errors.join(' | '));

    /* ---------- A2. Chịu dữ liệu hỏng ---------- */
    section('A2. Dữ liệu users hỏng không làm sập trang (F3)');

    const brokenPage = loadPage({ page: PAGE_LOGIN, data: { 'users.json': null } });
    brokenPage.run();
    await brokenPage.settled();
    check('users.json là null: getUsers() trả mảng rỗng',
        brokenPage.runInPage('Array.isArray(getUsers()) && getUsers().length === 0'),
        JSON.stringify(brokenPage.runInPage('getUsers()')));
    check('users.json là null: findUser() không ném lỗi',
        brokenPage.runInPage('(function(){ try { return typeof findUser("demo") === "undefined"; } catch (e) { return false; } })()'));

    const junkPage = loadPage({ page: PAGE_LOGIN, data: {
        'users.json': [{ username: 'ok' }, { foo: 1 }, 'junk', null, 42, { username: 42 }],
    } });
    junkPage.run();
    await junkPage.settled();
    check('users.json có phần tử rác: getUsers() chỉ giữ object có username chuỗi',
        junkPage.runInPage('JSON.stringify(getUsers().map((u) => u.username))') === '["ok"]');
    check('users.json có phần tử rác: findUser() không ném lỗi',
        junkPage.runInPage('(function(){ try { return findUser("junk") === undefined; } catch (e) { return false; } })()'));

    const guestPage = loadPage({ page: PAGE_LOGIN });
    guestPage.run();
    await guestPage.settled();
    check('khách: getCurrentUser() trả null', guestPage.runInPage('getCurrentUser()') === null);
    check('khách: isAdmin() trả false (fail-closed)', guestPage.runInPage('isAdmin()') === false);

    /* ---------- A3. Người dùng cũ vẫn đăng nhập được admin/demo, không mất tài khoản ---------- */
    section('A3. Bản nháp cũ (mật khẩu thô) vẫn đăng nhập được admin và demo (F2)');

    const legacyStorage = new Map([[`aov_draft_users`, JSON.stringify(
        USERS_FILE_JSON.map((user) => Object.assign({}, user)).concat([{
            username: 'olduser',
            password: 'oldpass123',
            displayName: 'Nguoi dung cu',
            joinedAt: '2025-03-01T00:00:00.000Z',
        }]),
    )]]);

    const legacy = loadPage({ page: PAGE_LOGIN, storage: legacyStorage });
    legacy.run();
    await legacy.settled();

    const namesAll = () => JSON.parse(legacy.runInPage('JSON.stringify(getUsers().map((u) => u.username))')).sort();

    check('người dùng cũ + admin + demo đều còn trong danh sách',
        JSON.stringify(namesAll()) === JSON.stringify(['admin', 'aovfan', 'demo', 'olduser'].sort()),
        JSON.stringify(namesAll()));

    check('admin vẫn đăng nhập được (mật khẩu admin1)',
        await legacy.runInPage('loginUser("admin", "admin1")') === true);
    check('demo vẫn đăng nhập được (mật khẩu 123456)',
        await legacy.runInPage('loginUser("demo", "123456")') === true);
    check('aovfan vẫn đăng nhập được (mật khẩu aov123)',
        await legacy.runInPage('loginUser("aovfan", "aov123")') === true);

    check('người dùng cũ đăng nhập được bằng mật khẩu thô (tự nâng cấp lên hash)',
        await legacy.runInPage('loginUser("olduser", "oldpass123")') === true);
    check('mật khẩu thô không còn sau khi nâng cấp',
        legacy.runInPage('(function(){ const u = findUser("olduser"); return u.passwordHash && u.salt && !Object.prototype.hasOwnProperty.call(u, "password"); })()'));
    check('tài khoản cũ không bị mất sau khi đăng nhập',
        JSON.stringify(namesAll()) === JSON.stringify(['admin', 'aovfan', 'demo', 'olduser'].sort()),
        JSON.stringify(namesAll()));

    /* ---------- A4. Đăng ký: { ok, error }, kiểm tra ghi, kiểm tra trùng ---------- */
    section('A4. registerUser trả { ok, error } và kiểm tra ghi/trùng (F6)');

    const regPage = loadPage({ page: PAGE_REGISTER });
    regPage.run();
    await regPage.settled();

    const created = await regPage.runInPage('registerUser("newbie", "secret1")');
    check('registerUser hợp lệ trả { ok: true }',
        created && created.ok === true,
        JSON.stringify(created));

    check('tài khoản mới chỉ lưu passwordHash + salt (không có password thô)',
        regPage.runInPage('(function(){ const u = findUser("newbie"); return !!u && !!u.passwordHash && !!u.salt && !Object.prototype.hasOwnProperty.call(u, "password") && u.role === "user"; })()'));

    const dup = await regPage.runInPage('registerUser("newbie", "secret2")');
    check('trùng username: trả { ok: false } kèm lỗi',
        dup && dup.ok === false && /tồn tại/i.test(dup.error || ''),
        JSON.stringify(dup));

    const badName = await regPage.runInPage('registerUser("ab", "secret1")');
    check('username ngắn (<3): trả { ok: false }',
        badName && badName.ok === false,
        JSON.stringify(badName));

    const badName2 = await regPage.runInPage('registerUser("hai nguoi", "secret1")');
    check('username chứa ký tự không hợp lệ: trả { ok: false }',
        badName2 && badName2.ok === false,
        JSON.stringify(badName2));

    const badPass = await regPage.runInPage('registerUser("nguoidung", "123")');
    check('mật khẩu quá ngắn (<6): trả { ok: false }',
        badPass && badPass.ok === false,
        JSON.stringify(badPass));

    const longPass = await regPage.runInPage('registerUser("nguoidung", "01234567890123456789012345678901234567890123456789012345678901234567890123")');
    check('mật khẩu quá dài (>64): trả { ok: false }',
        longPass && longPass.ok === false,
        JSON.stringify(longPass));

    /* ---------- A5. Băm mật khẩu khi đăng nhập + nâng cấp tài khoản thô ---------- */
    section('A5. Đăng nhập bằng PBKDF2 (F4)');

    check('đăng nhập tài khoản mới đúng mật khẩu -> true',
        await regPage.runInPage('loginUser("newbie", "secret1")') === true);
    check('đăng nhập tài khoản mới sai mật khẩu -> false',
        await regPage.runInPage('loginUser("newbie", "sai-mat-khau")') === false);

    check('registerUser tạo hash đúng chuẩn PBKDF2 (salt 16 byte hex, hash 32 byte hex)',
        regPage.runInPage('(function(){ const u = findUser("newbie"); return /^[0-9a-f]{32}$/.test(u.salt) && /^[0-9a-f]{64}$/.test(u.passwordHash); })()'));

    check('đăng nhập demo sai mật khẩu -> false',
        await regPage.runInPage('loginUser("demo", "sai-mat-khau")') === false);
    check('đăng nhập demo đúng mật khẩu -> true',
        await regPage.runInPage('loginUser("demo", "123456")') === true);

    section('A4+A5. Đăng ký qua form thật (validate + ghi + tự đăng nhập)');

    const formStorage = new Map();
    const formPage = loadPage({ page: PAGE_REGISTER, storage: formStorage });
    formPage.run();
    formPage.el('register-username').value = 'formuser';
    formPage.el('register-password').value = 'matkhau123';
    formPage.el('register-confirm').value = 'matkhau123';
    fire(formPage.el('register-form'), 'submit');

    const registered = await waitUntil(() => formPage.el('register-errors').innerHTML.includes('Đăng ký thành công'));
    check('form đăng ký thành công tự đăng nhập', registered
        && formPage.runInPage('getCurrentUser()') === 'formuser',
        String(formPage.el('register-errors').innerHTML));
    check('form đăng ký không lưu mật khẩu thô',
        formPage.runInPage('(function(){ const u = findUser("formuser"); return !!u && !Object.prototype.hasOwnProperty.call(u, "password"); })()'));

    const formDupe = loadPage({ page: PAGE_REGISTER, storage: formPage.storage });
    formDupe.run();
    formDupe.el('register-username').value = 'formuser';
    formDupe.el('register-password').value = 'matkhau456';
    formDupe.el('register-confirm').value = 'matkhau456';
    fire(formDupe.el('register-form'), 'submit');
    const dupeShown = await waitUntil(() =>
        formDupe.el('register-errors').innerHTML.includes('tồn tại')
        || formDupe.el('register-errors').innerHTML.includes('Username'));
    check('đăng ký trùng username qua form: báo lỗi, không ghi đè',
        dupeShown
        && await formDupe.runInPage('loginUser("formuser", "matkhau123")') === true
        && await formDupe.runInPage('loginUser("formuser", "matkhau456")') === false,
        String(formDupe.el('register-errors').innerHTML));

    check('trang register không ném lỗi JS',
        regPage.errors.filter((error) => !error.startsWith('console.error')).length === 0
        && formPage.errors.filter((error) => !error.startsWith('console.error')).length === 0
        && formDupe.errors.filter((error) => !error.startsWith('console.error')).length === 0,
        [...regPage.errors, ...formPage.errors, ...formDupe.errors].join(' | '));

    /* ---------- Chốt ---------- */
    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})();