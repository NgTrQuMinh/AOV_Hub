/**
 * test-build-admin.cjs - Test tab "Build" của trang Quản lý (admin.html?tab=builds)
 *
 * Tab Build có HAI mục do src/js/admin-builds.js đăng ký:
 *   - "Quản lý build"       (AD07) CRUD hướng dẫn build theo schema builds.json.
 *   - "Tướng chưa có build" (AD08) lọc / liệt kê tướng chưa có build nào.
 *
 * Mô phỏng DOM tối giản trong Node (tools/mini-dom.cjs) để kiểm tra thật sự hành vi
 * render / CRUD / lọc của src/js/admin-builds.js:
 *   1. Chặn truy cập: khách bị đưa về Login, user thường bị cảnh báo + về trang chủ,
 *      cả hai đều KHÔNG thấy form / bảng quản lý build.
 *   2. Admin: bảng liệt kê đủ build từ GET /api/builds + ô đếm + link sang tướng.
 *   3. Tìm build theo tên build / tên tướng.
 *   4. Validate form (tên, tướng, trang bị, pha, tình huống, tướng khắc chế, mẹo...).
 *   5. Form sửa: điền sẵn cả các dòng động (pha / tình huống / tướng khắc chế).
 *   6. Thêm build mới: PUT /api/builds (ghi CẢ mảng), tự cấp id = id lớn nhất + 1.
 *   7. Sửa build: giữ nguyên id, ghi đè nội dung.
 *   8. AD08: liệt kê / lọc tướng chưa có build (tình trạng, vai trò, từ khoá).
 *   9. Xoá build -> tướng trở thành "chưa có build" + nút "Tạo build" chọn sẵn tướng.
 *  10. Tầng dữ liệu fail-closed: user thường gọi thẳng createBuild()/updateBuild()/
 *      deleteBuild() đều bị chặn (không sửa được file).
 *
 * admin-builds.js được nạp ĐỘNG bởi admin-shell.js (trường scripts) bằng thẻ <script>
 * chèn vào DOM, còn mini-dom không thực thi thẻ <script> chèn động nên test nạp thẳng
 * file vào ngữ cảnh trang (page.runInPage) rồi đánh dấu đã nạp để shell không phải chờ
 * hết timeout.
 *
 * Phần DOM giả + bộ nạp trang nằm chung ở tools/mini-dom.cjs.
 *
 * Chạy: node tools/test-build-admin.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, unescapeHtml, fire } = require('./mini-dom.cjs');

const ADMIN_PAGE = 'src/pages/admin.html';
const BUILDS_TAB_SEARCH = '?tab=builds';

const BUILDS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/builds.json'), 'utf8'));
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));
const ITEMS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));

/** Nguồn admin-builds.js: mini-dom không thực thi <script> chèn động nên test nạp thẳng. */
const BUILDS_ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'src/js/admin-builds.js'), 'utf8');

const ADMIN_USERNAME = 'admin';
const OTHER_USERNAME = 'aovfan';

/** Build được chọn làm mục tiêu test điền sẵn / xoá (build đầu tiên, hero 1). */
const TARGET_BUILD_ID = 1;
const TARGET_HERO_ID = Number((BUILDS_JSON.find((build) => Number(build.id) === TARGET_BUILD_ID) || {}).heroId);

/** Id lớn nhất trong builds.json hiện tại + 1 = id mà createBuild() sẽ cấp cho build mới. */
const NEXT_BUILD_ID = Math.max(...BUILDS_JSON.map((build) => Number(build.id))) + 1;

const BUILDS_START = BUILDS_JSON.length;
const HEROES_START = HEROES_JSON.length;

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Số tướng theo một vai trò (dùng cho test lọc AD08 theo vai trò). */
const roleCount = (role) => HEROES_JSON.filter((hero) => Array.isArray(hero.role) && hero.role.includes(role)).length;

/**
 * "File" builds.json / heroes.json / items.json dùng chung qua API, mô phỏng file thật ghi
 * bền giữa nhiều lần mở trang trong test (giống chạy thật với server).
 */
const api = {
    heroes: clone(HEROES_JSON),
    items: clone(ITEMS_JSON),
    builds: clone(BUILDS_JSON),
};

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Chờ tới khi getter() trả giá trị "thật" hoặc hết thời gian (tránh phụ thuộc một mốc ms). */
async function waitFor(getter, timeout = 2000) {
    const started = Date.now();
    let value = getter();

    while (!value && Date.now() - started < timeout) {
        await sleep(10);
        value = getter();
    }

    return value;
}

/**
 * Mở tab "Build" của trang Quản lý (admin.html?tab=builds) và chờ render xong.
 * Vì admin-builds.js được shell nạp động (mini-dom không chạy <script> chèn động), test
 * nạp thẳng file vào ngữ cảnh trang rồi đánh dấu "đã nạp" để shell vẽ mục ngay, không
 * phải chờ hết ADMIN_SCRIPT_TIMEOUT (1.5s).
 */
async function openBuildsTab(options = {}) {
    const page = loadPage(Object.assign({ page: ADMIN_PAGE, search: BUILDS_TAB_SEARCH, api }, options));
    page.run();

    // Mô phỏng shell nạp admin-builds.js bằng thẻ <script>: chạy file trong ngữ cảnh trang.
    page.runInPage(BUILDS_ADMIN_SRC);
    page.runInPage("ADMIN_LOADED_SCRIPTS[BASE_PATH + 'src/js/admin-builds.js'] = 'loaded';");

    await page.settled();
    await page.settled();
    return page;
}

/** Mở tab Build với tài khoản admin và chờ tới khi cả hai bảng đã có dòng. */
async function openBuildsAsAdmin(options = {}) {
    const page = await openBuildsTab(Object.assign({ login: ADMIN_USERNAME }, options));
    await waitFor(() => page.el('build-admin-list')
        && page.el('build-admin-list').innerHTML.includes('data-build-edit'));
    await waitFor(() => page.el('missing-build-list'));
    return page;
}

// Các helper phải an toàn khi phần tử chưa tồn tại (người không có quyền không được vẽ mục).
const formHtml = (page) => { const node = page.el('build-admin-form'); return node ? node.innerHTML : ''; };
const tableHtml = (page) => { const node = page.el('build-admin-list'); return node ? node.innerHTML : ''; };
const countText = (page) => { const node = page.el('build-admin-count'); return node ? node.textContent : ''; };
const missingHtml = (page) => { const node = page.el('missing-build-list'); return node ? node.innerHTML : ''; };
const missingCountText = (page) => { const node = page.el('missing-build-count'); return node ? node.textContent : ''; };
const plainTable = (page) => unescapeHtml(tableHtml(page));
const plainForm = (page) => unescapeHtml(formHtml(page));
const plainMissing = (page) => unescapeHtml(missingHtml(page));

/** Số dòng build trong bảng (số nút Sửa = số dòng). */
function tableRowCount(page) {
    return tableHtml(page).split('data-build-edit=').length - 1;
}

/** Số dòng tướng trong bảng AD08 (số nút Tạo build = số dòng). */
function missingRowCount(page) {
    return missingHtml(page).split('data-missing-build-create=').length - 1;
}

/** Nội dung khung lỗi / thông báo của form (#build-form-errors bên trong #build-admin-form). */
function formErrorsText(page) {
    const box = page.el('build-admin-form');
    const errors = box ? box.querySelector('#build-form-errors') : null;
    return errors ? unescapeHtml(errors.innerHTML) : '';
}

/** Đọc giá trị đang điền trong form: form.querySelector('#build-name').value ... */
function formValue(page, selector) {
    const box = page.el('build-admin-form');
    const form = box && box.querySelector('#build-form');
    if (!form) return null;
    const input = form.querySelector(selector);
    return input ? input.value : null;
}

/** Số dòng động đang có trong form (pha / tình huống / tướng khắc chế). */
function formRowCount(page, selector) {
    const box = page.el('build-admin-form');
    const form = box && box.querySelector('#build-form');
    return form ? form.querySelectorAll(selector).length : 0;
}

/**
 * Điền form thêm / sửa (đọc ghi trực tiếp lên node, như người dùng gõ).
 * phases / situational / counters được điền theo dòng có sẵn; muốn thêm dòng thì caller
 * bấm nút "Thêm ..." trước rồi truyền đủ số dòng. Trả về <form>.
 */
function fillBuildForm(page, values) {
    const box = page.el('build-admin-form');
    const form = box && box.querySelector('#build-form');
    if (!form) throw new Error('Không tìm thấy form #build-form');

    form.querySelector('#build-name').value = values.name === undefined ? '' : String(values.name);
    form.querySelector('#build-hero').value = values.heroId === undefined ? '' : String(values.heroId);
    form.querySelector('#build-lane').value = values.lane || '';
    form.querySelector('#build-items').value = values.items === undefined ? '' : String(values.items);
    form.querySelector('#build-playstyle').value = values.playstyle || '';
    form.querySelector('#build-description').value = values.description || '';
    form.querySelector('#build-skill-order').value = values.skillOrder || '';
    form.querySelector('#build-tips').value = values.tips === undefined ? '' : String(values.tips);
    form.querySelector('#build-notes').value = values.notes === undefined ? '' : String(values.notes);

    (values.phases || []).forEach((phase, index) => {
        const row = form.querySelectorAll('[data-build-phase-row]')[index];
        if (!row) return;
        row.querySelector('[data-phase-name]').value = phase.name || '';
        row.querySelector('[data-phase-items]').value = phase.items === undefined ? '' : String(phase.items);
        row.querySelector('[data-phase-note]').value = phase.note || '';
    });

    (values.situational || []).forEach((item, index) => {
        const row = form.querySelectorAll('[data-build-situational-row]')[index];
        if (!row) return;
        row.querySelector('[data-situational-when]').value = item.when || '';
        row.querySelector('[data-situational-replace]').value = item.replace === undefined ? '' : String(item.replace);
        row.querySelector('[data-situational-with]').value = item.with === undefined ? '' : String(item.with);
        row.querySelector('[data-situational-reason]').value = item.reason || '';
    });

    (values.counters || []).forEach((item, index) => {
        const row = form.querySelectorAll('[data-build-counter-row]')[index];
        if (!row) return;
        row.querySelector('[data-counter-hero]').value = item.heroId === undefined ? '' : String(item.heroId);
        row.querySelector('[data-counter-reason]').value = item.reason || '';
    });

    return form;
}

/** Bấm submit form và chờ trang xử lý xong. */
function submitForm(page, form) {
    fire(form, 'submit', page.doc);
    return page.settled();
}

/** Bấm một nút (event delegation ở document) và chờ xử lý xong. */
function click(page, node) {
    fire(node, 'click', page.doc);
    return page.settled();
}

/** Vẽ lại các dòng động (bấm nút "Thêm ..." trong form) để có thêm dòng trống. */
async function addFormRows(page, selector, times) {
    for (let i = 0; i < times; i++) {
        const btn = page.el('build-admin-form').querySelector(selector);
        // eslint-disable-next-line no-await-in-loop
        await click(page, btn);
    }
}

/** Gọi validateBuildForm() trong ngữ cảnh trang và trả kết quả. */
function validate(page, input) {
    return page.runInPage('validateBuildForm(' + JSON.stringify(input) + ')');
}

/** Đặt bộ lọc AD08 (tình trạng / vai trò) và chờ bảng vẽ lại. */
async function setMissingFilter(page, { status, role, keyword } = {}) {
    if (status !== undefined) {
        const select = page.el('missing-build-toolbar').querySelector('#missing-build-status');
        select.value = status;
        fire(select, 'change', page.doc);
        await page.settled();
    }

    if (role !== undefined) {
        const select = page.el('missing-build-toolbar').querySelector('#missing-build-role');
        select.value = role;
        fire(select, 'change', page.doc);
        await page.settled();
    }

    if (keyword !== undefined) {
        const input = page.el('missing-build-toolbar').querySelector('#missing-build-keyword');
        input.value = keyword;
        fire(input, 'input', page.doc);
        await sleep(320); // debounce() lọc sau 200ms
    }
}

/* ================= Test ================= */

(async () => {
    /* ---------- 0. Dữ liệu mẫu ---------- */
    section('0. data/builds.json có dữ liệu mẫu');

    check('builds.json có ít nhất 30 build như cam kết', BUILDS_START >= 30, BUILDS_START + ' build');
    check('mọi build đều có id, heroId, name và mảng items',
        BUILDS_JSON.every((build) => (build.id !== undefined && build.heroId !== undefined
            && build.name && Array.isArray(build.items))),
        JSON.stringify(BUILDS_JSON.find((build) => !(build.id !== undefined && build.heroId !== undefined
            && build.name && Array.isArray(build.items)))));

    const target = BUILDS_JSON.find((build) => Number(build.id) === TARGET_BUILD_ID);
    check(`build ${TARGET_BUILD_ID} tồn tại và có đủ dữ liệu để test điền sẵn / xoá`,
        Boolean(target && target.name && Array.isArray(target.phases) && target.phases.length),
        JSON.stringify(target));

    check(`mọi tướng hiện đều có ít nhất 1 build (AD08 mặc định rỗng)`,
        HEROES_JSON.every((hero) => BUILDS_JSON.some((build) => Number(build.heroId) === Number(hero.id))),
        HEROES_JSON.filter((hero) => !BUILDS_JSON.some((build) => Number(build.heroId) === Number(hero.id)))
            .map((hero) => hero.name).join(', '));

    /* ---------- 1. Chặn truy cập ---------- */
    section('1. Chặn truy cập tab Quản lý build');

    const guest = await openBuildsTab({ storage: new Map() });
    check('khách chưa đăng nhập bị đưa về trang Login',
        guest.location.href.includes('/src/pages/login.html'),
        guest.location.href);
    check('khách không thấy form thêm build',
        !formHtml(guest).includes('id="build-form"'),
        plainForm(guest).slice(0, 120));
    check('khách không thấy bảng danh sách build',
        !tableHtml(guest).includes('data-build-edit'),
        tableHtml(guest).slice(0, 120));

    const stranger = await openBuildsTab({ login: OTHER_USERNAME });
    check('user thường bị cảnh báo khi mở trang Quản lý',
        stranger.alerts.some((message) => /không có quyền/i.test(message)),
        JSON.stringify(stranger.alerts));
    check('user thường bị chuyển về trang chủ',
        stranger.location.href === '/index.html',
        stranger.location.href);
    check('user thường không thấy form hay bảng quản trị build',
        !formHtml(stranger).includes('id="build-form"')
        && !tableHtml(stranger).includes('data-build-edit'),
        tableHtml(stranger).slice(0, 120));

    /* ---------- 2. Admin: bảng danh sách ---------- */
    section('2. Bảng danh sách build (admin)');

    const admin = await openBuildsAsAdmin();
    check('admin vào được tab Build của trang Quản lý',
        admin.alerts.length === 0 && formHtml(admin).includes('id="build-form"'),
        JSON.stringify(admin.alerts));
    check('bảng liệt kê đủ số build trong builds.json',
        tableRowCount(admin) === BUILDS_START,
        tableRowCount(admin) + ' dòng / ' + BUILDS_START + ' build');
    check('ô đếm báo đúng tổng số build',
        countText(admin) === `${BUILDS_START} build`,
        countText(admin));
    check('bảng có link tướng sang trang chi tiết',
        plainTable(admin).includes('hero-detail.html?id='),
        plainTable(admin).slice(0, 160));
    check('mục "Quản lý build" đã đăng ký vào shell đúng id',
        admin.runInPage("ADMIN_SECTIONS['builds'] && ADMIN_SECTIONS['builds'][0] && ADMIN_SECTIONS['builds'][0].sectionId") === 'build-manager');
    check('mục "Tướng chưa có build" (AD08) cũng đăng ký cùng tab',
        admin.runInPage("ADMIN_SECTIONS['builds'] && ADMIN_SECTIONS['builds'][1] && ADMIN_SECTIONS['builds'][1].sectionId") === 'missing-builds');
    check('form mặc định là "Thêm build mới" (chưa có data-edit-id)',
        formHtml(admin).includes('Thêm build mới')
        && formHtml(admin).includes('id="build-form"')
        && formValue(admin, '#build-name') === '',
        plainForm(admin).slice(0, 160));

    /* ---------- 3. Tìm kiếm theo tên build / tên tướng ---------- */
    section('3. Tìm build theo tên build / tên tướng');

    const keywordInput = admin.el('build-admin-toolbar').querySelector('#build-admin-keyword');
    keywordInput.value = 'valhein';
    fire(keywordInput, 'input', admin.doc);
    await sleep(320); // debounce() lọc sau 200ms

    check('gõ "valhein" (tên tướng, không dấu) lọc còn 1 build',
        tableRowCount(admin) === 1 && plainTable(admin).includes('Build sát thương chuẩn'),
        tableRowCount(admin) + ' dòng');
    check('ô đếm báo "đang xem / tổng" khi có từ khoá',
        countText(admin) === `1 / ${BUILDS_START} build`,
        countText(admin));

    keywordInput.value = 'khong-co-build-nao';
    fire(keywordInput, 'input', admin.doc);
    await sleep(320);

    check('từ khoá không khớp thì hiện thông báo trống, không vẽ bảng',
        tableRowCount(admin) === 0 && /không có build/i.test(plainTable(admin)),
        plainTable(admin).slice(0, 120));

    keywordInput.value = '';
    fire(keywordInput, 'input', admin.doc);
    await sleep(320);

    check('xoá từ khoá thì bảng trở lại đủ build',
        tableRowCount(admin) === BUILDS_START,
        tableRowCount(admin) + ' dòng');

    /* ---------- 4. Validate form ---------- */
    section('4. Validate dữ liệu form thêm / sửa');

    check('dữ liệu tối thiểu hợp lệ (tên + tướng)',
        validate(admin, { name: 'Build thử', heroId: '5' }).valid === true,
        JSON.stringify(validate(admin, { name: 'Build thử', heroId: '5' }).errors));

    const tooShort = validate(admin, { name: 'A', heroId: '5' });
    check('tên ngắn hơn 2 ký tự bị chặn',
        tooShort.valid === false && tooShort.errors.some((e) => /ít nhất/i.test(e)),
        JSON.stringify(tooShort.errors));

    const noHero = validate(admin, { name: 'Build thử', heroId: '' });
    check('thiếu tướng bị chặn',
        noHero.valid === false && noHero.errors.some((e) => /chọn tướng/i.test(e)),
        JSON.stringify(noHero.errors));

    const badItem = validate(admin, { name: 'Build thử', heroId: '5', items: '101, abc' });
    check('mã trang bị không phải số bị chặn',
        badItem.valid === false && badItem.errors.some((e) => /Trang bị chính/i.test(e)),
        JSON.stringify(badItem.errors));

    const itemsNormalized = validate(admin, { name: 'Build thử', heroId: '5', items: '101, 102, 101' });
    check('trang bị chính tự bỏ mã trùng',
        itemsNormalized.valid === true
        && JSON.stringify(itemsNormalized.values.items) === JSON.stringify([101, 102]),
        JSON.stringify(itemsNormalized.values.items));

    const badSituational = validate(admin, {
        name: 'Build thử',
        heroId: '5',
        situational: [{ when: 'Khi địch đông', replace: 'abc', with: '', reason: '' }],
    });
    check('tình huống có trang bị gốc không phải số bị chặn',
        badSituational.valid === false && badSituational.errors.some((e) => /trang bị gốc/i.test(e)),
        JSON.stringify(badSituational.errors));

    const badCounter = validate(admin, {
        name: 'Build thử',
        heroId: '5',
        counters: [{ heroId: '', reason: 'Khắc chế mạnh' }],
    });
    check('tướng khắc chế có lý do mà thiếu tướng bị chặn',
        badCounter.valid === false && badCounter.errors.some((e) => /khắc chế/i.test(e)),
        JSON.stringify(badCounter.errors));

    const cleaned = validate(admin, {
        name: 'Build thử',
        heroId: '5',
        phases: [{ name: '', items: '', note: '' }, { name: 'Đầu trận', items: '101', note: 'x' }],
        situational: [{ when: '', replace: '', with: '', reason: '' }],
        counters: [{ heroId: '', reason: '' }],
        tips: 'Mẹo 1\n\nMẹo 2\n',
        notes: 'Ghi chú A\n',
    });
    check('pha / tình huống / khắc chế trống hoàn toàn bị bỏ',
        cleaned.valid === true
        && cleaned.values.phases.length === 1
        && cleaned.values.situational.length === 0
        && cleaned.values.counters.length === 0,
        JSON.stringify(cleaned.values));
    check('mẹo / ghi chú tách theo dòng và bỏ dòng trống',
        JSON.stringify(cleaned.values.tips) === JSON.stringify(['Mẹo 1', 'Mẹo 2'])
        && JSON.stringify(cleaned.values.notes) === JSON.stringify(['Ghi chú A']),
        JSON.stringify(cleaned.values.tips) + ' / ' + JSON.stringify(cleaned.values.notes));

    /* ---------- 5. Form sửa: điền sẵn dữ liệu cũ ---------- */
    section('5. Mở form sửa và điền sẵn dữ liệu (kể cả dòng động)');

    const editBtn = admin.el('build-admin-list').querySelector('[data-build-edit="' + TARGET_BUILD_ID + '"]');
    await click(admin, editBtn);

    check('form sửa hiện đúng tiêu đề và data-edit-id',
        formHtml(admin).includes('Sửa build')
        && formValue(admin, '#build-name') === target.name,
        plainForm(admin).slice(0, 200));
    check('form sửa điền sẵn tướng và đường đi',
        formValue(admin, '#build-hero') === String(target.heroId)
        && formValue(admin, '#build-lane') === (target.lane || ''),
        formValue(admin, '#build-hero') + ' / ' + formValue(admin, '#build-lane'));
    check('form sửa điền sẵn trang bị chính',
        formValue(admin, '#build-items') === (target.items || []).join(', '),
        formValue(admin, '#build-items'));
    check('form sửa điền sẵn số dòng pha / tình huống / tướng khắc chế',
        formRowCount(admin, '[data-build-phase-row]') === target.phases.length
        && formRowCount(admin, '[data-build-situational-row]') === (target.situational || []).length
        && formRowCount(admin, '[data-build-counter-row]') === (target.counters || []).length,
        formRowCount(admin, '[data-build-phase-row]') + ' / '
            + formRowCount(admin, '[data-build-situational-row]') + ' / '
            + formRowCount(admin, '[data-build-counter-row]'));
    check('form sửa điền sẵn một dòng tình huống đầu tiên',
        formRowCount(admin, '[data-build-situational-row]') > 0
        && formValue(admin, '[data-situational-when]') === target.situational[0].when,
        formValue(admin, '[data-situational-when]'));

    const cancelBtn = admin.el('build-admin-form').querySelector('[data-build-cancel]');
    await click(admin, cancelBtn);
    check('bấm Huỷ quay về form thêm mới',
        formHtml(admin).includes('Thêm build mới') && formValue(admin, '#build-name') === '',
        plainForm(admin).slice(0, 120));

    /* ---------- 6. Thêm build mới ---------- */
    section('6. Thêm build mới (PUT cả mảng, tự cấp id)');

    // Form mới chỉ có 3 dòng pha, chưa có dòng tình huống / khắc chế -> thêm dòng trước.
    await addFormRows(admin, '[data-build-situational-add]', 2);
    await addFormRows(admin, '[data-build-counter-add]', 2);

    const newForm = fillBuildForm(admin, {
        name: 'Build Thử Nghiệm',
        heroId: 5,
        lane: 'Rừng',
        items: '101, 102, 101',
        playstyle: 'Lối chơi thử nghiệm.',
        description: 'Mô tả thử nghiệm.',
        skillOrder: 'Chiêu 1 > Chiêu 2',
        phases: [
            { name: 'Đầu trận', items: '101, 102', note: 'Mua đồ rẻ' },
            { name: 'Giữa trận', items: '103, 104', note: '' },
            { name: '', items: '', note: '' },
        ],
        tips: 'Mẹo 1\nMẹo 2\n\n',
        situational: [
            { when: 'Khi địch đông', replace: '106', with: '401', reason: 'Lý do A' },
            { when: '', replace: '', with: '', reason: '' },
        ],
        counters: [
            { heroId: 3, reason: 'Khắc chế A' },
            { heroId: '', reason: '' },
        ],
        notes: 'Ghi chú A',
    });
    await submitForm(admin, newForm);

    const created = api.builds.find((build) => build.name === 'Build Thử Nghiệm');
    check('thêm: build mới được ghi vào builds.json', Boolean(created), 'không tìm thấy build vừa thêm');
    check(`thêm: id tự cấp = id lớn nhất + 1 (${NEXT_BUILD_ID})`,
        created && Number(created.id) === NEXT_BUILD_ID,
        created ? String(created.id) : '—');
    check('thêm: giữ tướng, đường, lối chơi, mô tả, thứ tự kỹ năng',
        created && Number(created.heroId) === 5 && created.lane === 'Rừng'
        && created.playstyle === 'Lối chơi thử nghiệm.'
        && created.description === 'Mô tả thử nghiệm.'
        && created.skillOrder === 'Chiêu 1 > Chiêu 2',
        JSON.stringify(created));
    check('thêm: trang bị chính bỏ mã trùng',
        created && JSON.stringify(created.items) === JSON.stringify([101, 102]),
        created ? JSON.stringify(created.items) : '—');
    check('thêm: chỉ giữ 2 pha có nội dung, bỏ pha trống',
        created && JSON.stringify(created.phases) === JSON.stringify([
            { name: 'Đầu trận', items: [101, 102], note: 'Mua đồ rẻ' },
            { name: 'Giữa trận', items: [103, 104], note: '' },
        ]),
        created ? JSON.stringify(created.phases) : '—');
    check('thêm: tình huống đúng, bỏ dòng trống',
        created && JSON.stringify(created.situational) === JSON.stringify([
            { when: 'Khi địch đông', replace: 106, with: 401, reason: 'Lý do A' },
        ]),
        created ? JSON.stringify(created.situational) : '—');
    check('thêm: tướng khắc chế đúng, bỏ dòng trống',
        created && JSON.stringify(created.counters) === JSON.stringify([{ heroId: 3, reason: 'Khắc chế A' }]),
        created ? JSON.stringify(created.counters) : '—');
    check('thêm: mẹo và ghi chú tách theo dòng',
        created && JSON.stringify(created.tips) === JSON.stringify(['Mẹo 1', 'Mẹo 2'])
        && JSON.stringify(created.notes) === JSON.stringify(['Ghi chú A']),
        created ? JSON.stringify(created.tips) + ' / ' + JSON.stringify(created.notes) : '—');
    check('thêm: file có thêm đúng 1 build',
        api.builds.length === BUILDS_START + 1,
        api.builds.length + ' build');
    check('thêm: bảng vẽ lại đủ số dòng',
        tableRowCount(admin) === api.builds.length,
        tableRowCount(admin) + ' dòng');
    check('thêm: form quay về trạng thái thêm mới và báo thành công',
        formHtml(admin).includes('Thêm build mới')
        && /Đã thêm build/i.test(formErrorsText(admin)),
        formErrorsText(admin).slice(0, 160));

    /* ---------- 7. Sửa build ---------- */
    section('7. Sửa build vừa thêm (giữ nguyên id)');

    await click(admin, admin.el('build-admin-list').querySelector('[data-build-edit="' + NEXT_BUILD_ID + '"]'));

    check('form sửa build mới điền sẵn 1 dòng tình huống / khắc chế đã lưu',
        formRowCount(admin, '[data-build-situational-row]') === 1
        && formRowCount(admin, '[data-build-counter-row]') === 1,
        formRowCount(admin, '[data-build-situational-row]') + ' / ' + formRowCount(admin, '[data-build-counter-row]'));

    const editNewForm = fillBuildForm(admin, {
        name: 'Build Thử Nghiệm 2',
        heroId: 6,
        lane: 'Đường Giữa',
        items: '105',
        phases: [
            { name: 'Đầu trận', items: '105', note: '' },
            { name: '', items: '', note: '' },
            { name: '', items: '', note: '' },
        ],
        tips: '',
        situational: [{ when: '', replace: '', with: '', reason: '' }],
        counters: [{ heroId: '', reason: '' }],
        notes: '',
    });
    await submitForm(admin, editNewForm);

    const updated = api.builds.filter((build) => Number(build.id) === NEXT_BUILD_ID);
    check('sửa: vẫn chỉ có đúng 1 build với id cũ',
        updated.length === 1,
        updated.length + ' build');
    check('sửa: đổi tên / tướng / đường / trang bị',
        updated[0] && updated[0].name === 'Build Thử Nghiệm 2' && Number(updated[0].heroId) === 6
        && updated[0].lane === 'Đường Giữa'
        && JSON.stringify(updated[0].items) === JSON.stringify([105]),
        JSON.stringify(updated[0]));
    check('sửa: thay pha cũ bằng pha mới',
        updated[0] && JSON.stringify(updated[0].phases) === JSON.stringify([
            { name: 'Đầu trận', items: [105], note: '' },
        ]),
        updated[0] ? JSON.stringify(updated[0].phases) : '—');
    check('sửa: xoá hết tình huống / tướng khắc chế / mẹo',
        updated[0] && updated[0].situational.length === 0
        && updated[0].counters.length === 0
        && updated[0].tips.length === 0,
        updated[0] ? JSON.stringify(updated[0]) : '—');
    check('sửa: báo thành công',
        /Đã cập nhật build/i.test(formErrorsText(admin)),
        formErrorsText(admin).slice(0, 160));
    check('sửa: số build trong file không đổi',
        api.builds.length === BUILDS_START + 1,
        api.builds.length + ' build');

    /* ---------- 8. AD08: lọc tướng chưa có build ---------- */
    section('8. AD08 - lọc tướng chưa có build');

    check('mặc định (chưa có build): không tướng nào thiếu, hiện thông báo phù hợp',
        missingRowCount(admin) === 0 && /Tất cả tướng đều đã có build/i.test(plainMissing(admin)),
        plainMissing(admin).slice(0, 120));
    check('ô đếm AD08 báo đúng khi chưa có tướng nào thiếu',
        missingCountText(admin) === `0 / ${HEROES_START} tướng chưa có build`,
        missingCountText(admin));

    await setMissingFilter(admin, { status: 'all' });
    check('lọc "Tất cả tướng": liệt kê đủ số tướng',
        missingRowCount(admin) === HEROES_START,
        missingRowCount(admin) + ' dòng / ' + HEROES_START + ' tướng');
    check('ô đếm AD08 đổi nhãn khi lọc "tất cả"',
        missingCountText(admin) === `${HEROES_START} / ${HEROES_START} tướng`,
        missingCountText(admin));
    check('bảng AD08 có link tướng sang trang chi tiết',
        plainMissing(admin).includes('hero-detail.html?id='),
        plainMissing(admin).slice(0, 160));

    await setMissingFilter(admin, { status: 'has' });
    check('lọc "Đã có build": tất cả tướng đều có build',
        missingRowCount(admin) === HEROES_START,
        missingRowCount(admin) + ' dòng');

    const xaThu = roleCount('Xạ thủ');
    await setMissingFilter(admin, { role: 'Xạ thủ' });
    check(`lọc theo vai trò "Xạ thủ": còn ${xaThu} tướng`,
        missingRowCount(admin) === xaThu,
        missingRowCount(admin) + ' dòng / kỳ vọng ' + xaThu);

    await setMissingFilter(admin, { status: 'all', role: '', keyword: 'valhein' });
    check('lọc theo từ khoá "valhein": còn 1 tướng',
        missingRowCount(admin) === 1 && plainMissing(admin).includes('Valhein'),
        missingRowCount(admin) + ' dòng');

    await setMissingFilter(admin, { status: 'missing', keyword: '' });
    check('trở về lọc "chưa có build": lại rỗng',
        missingRowCount(admin) === 0,
        missingRowCount(admin) + ' dòng');

    /* ---------- 9. Xoá build -> tướng thành "chưa có build" ---------- */
    section('9. Xoá build + nút "Tạo build" chọn sẵn tướng (AD08)');

    const buildsBefore = api.builds.length;
    await click(admin, admin.el('build-admin-list').querySelector('[data-build-delete="' + TARGET_BUILD_ID + '"]'));
    await waitFor(() => !api.builds.some((build) => Number(build.id) === TARGET_BUILD_ID));

    check('sau khi xoá: build không còn trong builds.json',
        !api.builds.some((build) => Number(build.id) === TARGET_BUILD_ID));
    check('sau khi xoá: file bớt đúng 1 build',
        api.builds.length === buildsBefore - 1,
        api.builds.length + ' build');
    check('sau khi xoá: bảng vẽ lại đúng số dòng',
        tableRowCount(admin) === api.builds.length,
        tableRowCount(admin) + ' dòng');
    check('sau khi xoá: tên build đã xoá không còn trên bảng',
        !plainTable(admin).includes(target.name),
        target.name);

    await waitFor(() => missingRowCount(admin) === 1);
    check('AD08: tướng vừa mất build hiện trong danh sách "chưa có build"',
        missingRowCount(admin) === 1 && plainMissing(admin).includes('Valhein'),
        plainMissing(admin).slice(0, 160));
    check('AD08: ô đếm cập nhật số tướng còn thiếu',
        missingCountText(admin) === `1 / ${HEROES_START} tướng chưa có build`,
        missingCountText(admin));

    const targetHeroRow = admin.el('missing-build-list')
        .querySelector('[data-missing-build-create="' + TARGET_HERO_ID + '"]');
    await click(admin, targetHeroRow);
    check('AD08: bấm "Tạo build" mở form thêm mới và chọn sẵn đúng tướng',
        formHtml(admin).includes('Thêm build mới')
        && formValue(admin, '#build-hero') === String(TARGET_HERO_ID),
        formValue(admin, '#build-hero'));
    check('AD08: form báo rõ đã chọn sẵn tướng nào',
        /Valhein/.test(formErrorsText(admin)),
        formErrorsText(admin).slice(0, 160));

    /* ---------- 10. Tầng dữ liệu fail-closed (không phải admin) ---------- */
    section('10. Tầng dữ liệu chặn người không có quyền');

    const hacker = await openBuildsTab({ login: OTHER_USERNAME });

    check('user thường: canManageBuilds() = false',
        hacker.runInPage('canManageBuilds()') === false);

    const buildsBeforeHack = api.builds.length;
    const hackCreate = await hacker.runInPage("createBuild({ name: 'Hack build', heroId: 1 })");
    check('user thường: createBuild() trả null', hackCreate === null, JSON.stringify(hackCreate));
    check('user thường: createBuild() không ghi thêm build', api.builds.length === buildsBeforeHack);

    const hackUpdate = await hacker.runInPage(`updateBuild(${NEXT_BUILD_ID}, { name: 'Hacked', heroId: 1 })`);
    check('user thường: updateBuild() trả null', hackUpdate === null, JSON.stringify(hackUpdate));
    check('user thường: updateBuild() không đổi tên build',
        (api.builds.find((build) => Number(build.id) === NEXT_BUILD_ID) || {}).name === 'Build Thử Nghiệm 2',
        JSON.stringify(api.builds.find((build) => Number(build.id) === NEXT_BUILD_ID)));

    const hackDelete = await hacker.runInPage('deleteBuild(2)');
    check('user thường: deleteBuild() trả false', hackDelete === false, JSON.stringify(hackDelete));
    check('user thường: deleteBuild() không xoá build', api.builds.some((build) => Number(build.id) === 2));

    /* ---------- Tổng kết ---------- */
    console.log('\n' + passed + ' PASS, ' + failures.length + ' FAIL');
    if (failures.length) {
        console.log('\nDANH SÁCH LỖI:');
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})().catch((error) => {
    console.error('\nLỗi khi chạy test:', error);
    process.exitCode = 1;
});
