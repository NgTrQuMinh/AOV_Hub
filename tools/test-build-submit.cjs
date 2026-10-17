/**
 * test-build-submit.cjs - Kiểm tra form gửi hướng dẫn build (HD06).
 *
 * Phủ:
 *   - Trang build-submit.html: khách thấy lời mời đăng nhập, người dùng thấy form
 *     (đủ tướng/đường/trang bị), đếm trang bị giới hạn 6.
 *   - validateBuildSubmission(): các nhánh lỗi + dữ liệu hợp lệ.
 *   - storage.js addBuildSubmission(): cấp id cộng đồng >= 9000, chuẩn hoá trường, lưu LocalStorage.
 *   - Gửi thành công -> có thông báo + link xem lại + xuất hiện ở "Hướng dẫn bạn đã gửi".
 *   - Tích hợp: build cộng đồng mở được ở build-detail.html và hiện ở mục "Build cộng đồng" (builds.html).
 *
 * Chạy: node tools/test-build-submit.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage: loadPageShared, fire, unescapeHtml } = require('./mini-dom.cjs');

const SUBMIT_PAGE = 'src/pages/build-submit.html';
const BUILDS_PAGE = 'src/pages/builds.html';
const DETAIL_PAGE = 'src/pages/build-detail.html';
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));
const ITEMS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));
const BUILDS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/builds.json'), 'utf8'));
const SUBMISSIONS_KEY = 'aov_build_submissions';

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

const inPage = (sp, expr) => sp.runInPage(expr);

/** Giá trị hợp lệ tối thiểu để validateBuildSubmission() chấp nhận. */
const validValues = () => ({
    heroId: 1,
    name: 'Build kiểm thử cộng đồng',
    lane: 'Đường Rồng',
    playstyle: 'bám tuyến sau',
    items: [101, 102],
    description: 'Đây là mô tả hướng dẫn đủ dài để vượt qua kiểm tra tối thiểu.',
    skillOrder: 'Chiêu 1 > Chiêu 2 > Chiêu 3',
    tips: ['Mẹo một', 'Mẹo hai'],
});

const validate = (sp, values, ctx) => JSON.parse(sp.runInPage(
    `JSON.stringify(validateBuildSubmission(${JSON.stringify(values)}, ${JSON.stringify(ctx)}))`
));

(async () => {
    /* ---------------- 1. Đường đi dùng chung dữ liệu ---------------- */
    section('1. Đường đi trong form khớp builds.json');

    const submitPage = await open(SUBMIT_PAGE, '', { login: 'alice', storage: new Map() });
    const lanes = JSON.parse(inPage(submitPage, 'JSON.stringify(BUILD_SUBMIT_LANES)'));
    const buildLanes = [...new Set(BUILDS_JSON.map((build) => build.lane))];
    check('mọi đường trong builds.json đều có trong form', buildLanes.every((lane) => lanes.includes(lane)), buildLanes.join(', '));

    /* ---------------- 2. Khách phải đăng nhập ---------------- */
    section('2. Khách: mời đăng nhập, không hiện form');

    const guestPage = await open(SUBMIT_PAGE, '', { storage: new Map() });
    const guestHtml = guestPage.el('build-submit-form').innerHTML;
    check('khách thấy lời mời đăng nhập', /đăng nhập/i.test(guestHtml));
    check('khách có link tới trang đăng nhập', guestHtml.includes('login.html'));
    check('khách không có form gửi build', guestPage.el('build-submit-form-el') === null);
    check('khách không có mục "Hướng dẫn bạn đã gửi"', guestPage.el('build-submit-mine').hidden === true);

    /* ---------------- 3. Người dùng thấy form ---------------- */
    section('3. Người dùng: form đầy đủ trường');

    const userPage = await open(SUBMIT_PAGE, '', { login: 'alice', storage: new Map() });
    const formEl = userPage.el('build-submit-form-el');
    check('có form #build-submit-form-el', Boolean(formEl));
    check('form có ô chọn tướng', Boolean(userPage.el('build-submit-hero')));
    check('form có ô tên hướng dẫn', Boolean(userPage.el('build-submit-name')));
    check('form có ô đường đi', Boolean(userPage.el('build-submit-lane')));
    check('form có ô mô tả', Boolean(userPage.el('build-submit-desc')));
    check('ô chọn tướng có đủ ' + HEROES_JSON.length + ' tướng + lựa chọn rỗng',
        userPage.el('build-submit-hero').querySelectorAll('option').length === HEROES_JSON.length + 1);
    check('có đủ ' + ITEMS_JSON.length + ' ô trang bị để chọn',
        formEl.querySelectorAll('[data-build-submit-item]').length === ITEMS_JSON.length);

    /* Giới hạn 6 trang bị: tick 7 ô -> ô thứ 7 bị bỏ. */
    const itemInputs = formEl.querySelectorAll('[data-build-submit-item]');
    for (let i = 0; i < 7; i++) itemInputs[i].checked = true;
    fire(itemInputs[6], 'change', userPage.doc);
    check('giới hạn 6 trang bị: ô thứ 7 bị bỏ tick', itemInputs[6].checked === false);
    check('bộ đếm trang bị hiện 6', formEl.querySelector('[data-build-submit-count]').textContent === '6',
        formEl.querySelector('[data-build-submit-count]').textContent);

    /* ---------------- 4. validateBuildSubmission() ---------------- */
    section('4. validateBuildSubmission()');

    const ctx = {
        heroes: HEROES_JSON.map((hero) => ({ id: hero.id })),
        items: ITEMS_JSON.map((item) => ({ id: item.id })),
        author: 'alice',
    };

    const okResult = validate(userPage, validValues(), ctx);
    check('dữ liệu hợp lệ -> valid=true, không lỗi', okResult.valid === true && okResult.errors.length === 0, JSON.stringify(okResult.errors));

    const needHero = validate(userPage, Object.assign(validValues(), { heroId: '' }), ctx);
    check('thiếu tướng -> báo lỗi', needHero.valid === false && needHero.errors.some((e) => /chọn tướng/.test(e)), JSON.stringify(needHero.errors));

    const badHero = validate(userPage, Object.assign(validValues(), { heroId: 999999 }), ctx);
    check('tướng không tồn tại -> báo lỗi', badHero.valid === false && badHero.errors.some((e) => /không có trong dữ liệu/.test(e)), JSON.stringify(badHero.errors));

    const shortName = validate(userPage, Object.assign(validValues(), { name: 'a' }), ctx);
    check('tên quá ngắn -> báo lỗi', shortName.valid === false && shortName.errors.some((e) => /Tên hướng dẫn/.test(e)), JSON.stringify(shortName.errors));

    const badLane = validate(userPage, Object.assign(validValues(), { lane: 'Đường Lạ' }), ctx);
    check('đường đi sai -> báo lỗi', badLane.valid === false && badLane.errors.some((e) => /đường đi/.test(e)), JSON.stringify(badLane.errors));

    const noItems = validate(userPage, Object.assign(validValues(), { items: [] }), ctx);
    check('không chọn trang bị -> báo lỗi', noItems.valid === false && noItems.errors.some((e) => /ít nhất một trang bị/.test(e)), JSON.stringify(noItems.errors));

    const fakeItems = validate(userPage, Object.assign(validValues(), { items: [999999] }), ctx);
    check('trang bị không tồn tại -> báo lỗi', fakeItems.valid === false && fakeItems.errors.some((e) => /ít nhất một trang bị/.test(e)), JSON.stringify(fakeItems.errors));

    const tooMany = validate(userPage, Object.assign(validValues(), { items: [101, 102, 103, 104, 105, 106, 107] }), ctx);
    check('quá 6 trang bị -> báo lỗi', tooMany.valid === false && tooMany.errors.some((e) => /tối đa 6/.test(e)), JSON.stringify(tooMany.errors));

    const shortDesc = validate(userPage, Object.assign(validValues(), { description: 'ngắn' }), ctx);
    check('mô tả quá ngắn -> báo lỗi', shortDesc.valid === false && shortDesc.errors.some((e) => /Mô tả/.test(e)), JSON.stringify(shortDesc.errors));

    const noAuthor = validate(userPage, validValues(), Object.assign({}, ctx, { author: '' }));
    check('chưa đăng nhập -> báo lỗi', noAuthor.valid === false && noAuthor.errors.some((e) => /đăng nhập/.test(e)), JSON.stringify(noAuthor.errors));

    const trimmed = validate(userPage, Object.assign(validValues(), { name: '  Tên có khoảng trắng  ', tips: ['  a  ', '', 'b'] }), ctx);
    check('giá trị được trim, tips rỗng bị bỏ', trimmed.values.name === 'Tên có khoảng trắng' && JSON.stringify(trimmed.values.tips) === JSON.stringify(['a', 'b']), JSON.stringify(trimmed.values.tips));

    /* ---------------- 5. Gửi qua form thật ---------------- */
    section('5. Gửi qua form -> lưu LocalStorage');

    const storage = new Map();
    const livePage = await open(SUBMIT_PAGE, '', { login: 'alice', storage });
    const liveForm = livePage.el('build-submit-form-el');

    livePage.el('build-submit-hero').value = '1';
    livePage.el('build-submit-name').value = 'Build cộng đồng của Alice';
    livePage.el('build-submit-lane').value = 'Rừng';
    livePage.el('build-submit-desc').value = 'Mô tả hướng dẫn đủ dài cho kiểm thử gửi build.';
    livePage.el('build-submit-skill').value = 'Chiêu 2 > Chiêu 1 > Chiêu 3';
    livePage.el('build-submit-tips').value = 'Mẹo một\nMẹo hai';
    const liveItems = liveForm.querySelectorAll('[data-build-submit-item]');
    liveItems[0].checked = true;
    liveItems[1].checked = true;

    fire(liveForm, 'submit', livePage.doc);

    const stored = livePage.readKey(SUBMISSIONS_KEY);
    check('gửi hợp lệ -> lưu 1 hướng dẫn vào aov_build_submissions', Array.isArray(stored) && stored.length === 1, JSON.stringify(stored));
    const saved = stored ? stored[0] : {};
    check('bản ghi có id cộng đồng >= 9000', saved.id >= 9000, String(saved.id));
    check('bản ghi đánh dấu source=community', saved.source === 'community', String(saved.source));
    check('bản ghi lưu tác giả đang đăng nhập', saved.author === 'alice', String(saved.author));
    check('bản ghi chuẩn hoá items + tips', JSON.stringify(saved.items) === JSON.stringify([ITEMS_JSON[0].id, ITEMS_JSON[1].id])
        && JSON.stringify(saved.tips) === JSON.stringify(['Mẹo một', 'Mẹo hai']), JSON.stringify(saved));
    check('bản ghi có createdAt', Boolean(saved.createdAt));

    const afterSubmitHtml = livePage.el('build-submit-form').innerHTML;
    check('hiện thông báo gửi thành công', afterSubmitHtml.includes('Đã gửi hướng dẫn'));
    check('thông báo có link xem lại build vừa gửi', afterSubmitHtml.includes(`build-detail.html?id=${saved.id}`));
    check('mục "Hướng dẫn bạn đã gửi" hiện ra', livePage.el('build-submit-mine').hidden === false);
    check('danh sách đã gửi có tên hướng dẫn', livePage.el('build-submit-list').innerHTML.includes('Build cộng đồng của Alice'));

    /* Gửi dữ liệu sai -> hiện lỗi, không thêm bản ghi. */
    const badPage = await open(SUBMIT_PAGE, '', { login: 'alice', storage: new Map() });
    const badForm = badPage.el('build-submit-form-el');
    fire(badForm, 'submit', badPage.doc);
    check('gửi thiếu dữ liệu -> không lưu gì', badPage.readKey(SUBMISSIONS_KEY) === null, String(badPage.readKey(SUBMISSIONS_KEY)));
    check('gửi thiếu dữ liệu -> hiện danh sách lỗi', badPage.el('build-submit-form').innerHTML.includes('build-submit__errors')
        && !badPage.el('build-submit-form').querySelector('[data-build-submit-errors]').hidden);

    /* ---------------- 6. addBuildSubmission() cấp id tăng dần ---------------- */
    section('6. addBuildSubmission()');

    const idPage = await open(SUBMIT_PAGE, '', { login: 'alice', storage: new Map() });
    const first = JSON.parse(inPage(idPage, `JSON.stringify(addBuildSubmission({ heroId: 1, name: 'A', items: [101] }))`));
    const second = JSON.parse(inPage(idPage, `JSON.stringify(addBuildSubmission({ heroId: 2, name: 'B', items: [102] }))`));
    check('bản ghi đầu tiên có id 9001', first.id === 9001, String(first.id));
    check('bản ghi thứ hai có id 9002', second.id === 9002, String(second.id));
    check('thiếu tên -> trả null', inPage(idPage, `String(addBuildSubmission({ heroId: 1 }))`) === 'null');
    check('thiếu tướng -> trả null', inPage(idPage, `String(addBuildSubmission({ name: 'X' }))`) === 'null');

    /* ---------------- 7. Tích hợp: build cộng đồng xem được ---------------- */
    section('7. Tích hợp: build cộng đồng mở được + hiện ở trang Build');

    const sharedStorage = livePage.storage;
    const detailPage = await open(DETAIL_PAGE, '?id=' + saved.id, { login: 'alice', storage: sharedStorage });
    const detailHtml = detailPage.el('build-detail').innerHTML;
    check('build-detail.html?id=<id cộng đồng> render đúng tên build', detailHtml.includes('Build cộng đồng của Alice'));
    check('build cộng đồng hiển thị trang bị đã chọn', detailHtml.includes('build-detail__items'));
    check('build cộng đồng có khối ngọc / phép bổ trợ', detailHtml.includes('build-detail__runes-section'));
    check('mở build cộng đồng không ném lỗi', detailPage.errors.length === 0, detailPage.errors.join(' | '));

    const listPage = await open(BUILDS_PAGE, '', { login: 'alice', storage: sharedStorage });
    check('mục "Build cộng đồng" hiện ra trên builds.html', listPage.el('build-community').hidden === false);
    check('mục "Build cộng đồng" có tên build đã gửi', listPage.el('build-community-list').innerHTML.includes('Build cộng đồng của Alice'));
    check('build gốc (32) vẫn nguyên trong danh sách chính',
        (listPage.el('build-list').innerHTML.match(/class="build-card"/g) || []).length === BUILDS_JSON.length);

    const emptyList = await open(BUILDS_PAGE, '', { storage: new Map() });
    check('chưa ai gửi -> mục "Build cộng đồng" ẩn', emptyList.el('build-community').hidden === true);
    check('mở builds.html không ném lỗi', listPage.errors.length === 0 && emptyList.errors.length === 0, listPage.errors.join(' | ') + emptyList.errors.join(' | '));

    /* ---------------- Tổng kết ---------------- */
    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})();
