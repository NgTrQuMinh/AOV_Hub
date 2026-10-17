/**
 * test-item-admin.cjs - Test mục "Trang bị" của trang Quản lý (admin.html?tab=items)
 *
 * Mô phỏng DOM tối giản trong Node (tools/mini-dom.cjs) để kiểm tra thật sự hành vi
 * render / CRUD / dọn tham chiếu của src/js/admin-items.js:
 *   1. Chặn truy cập: khách bị đưa về Login, user thường bị cảnh báo + về trang chủ,
 *      cả hai đều KHÔNG thấy form / bảng quản lý trang bị.
 *   2. Admin: bảng liệt kê đủ trang bị từ GET /api/items + ô đếm + tìm theo tên.
 *   3. Form thêm / sửa: điền sẵn khi sửa, validate đầy đủ các trường (tên / loại / giá /
 *      ảnh / chỉ số / trang bị liên quan).
 *   4. Thêm trang bị mới: PUT /api/items, tự cấp id = id lớn nhất + 1.
 *   5. Sửa trang bị: giữ nguyên id, ghi đè nội dung.
 *   6. Xoá an toàn (AD06): gỡ item khỏi items.json VÀ khỏi items.related, builds.items,
 *      builds[].phases[].items, heroes[].recommendedBuild, aov_favorites.item.
 *   7. Tầng dữ liệu fail-closed: user thường gọi thẳng createItem()/updateItem()/
 *      deleteItem() đều bị chặn (không sửa được file).
 *
 * admin-items.js được nạp ĐỘNG bởi admin-shell.js (trường scripts) bằng thẻ <script> chèn
 * vào DOM, còn mini-dom không thực thi thẻ <script> chèn động nên test nạp thẳng file vào
 * ngữ cảnh trang (page.runInPage) rồi đánh dấu đã nạp để shell không phải chờ hết timeout.
 *
 * Phần DOM giả + bộ nạp trang nằm chung ở tools/mini-dom.cjs.
 *
 * Chạy: node tools/test-item-admin.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, unescapeHtml, fire } = require('./mini-dom.cjs');

const ADMIN_PAGE = 'src/pages/admin.html';
const ITEMS_TAB_SEARCH = '?tab=items';

const ITEMS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));
const BUILDS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/builds.json'), 'utf8'));
const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));

/** Nguồn admin-items.js: mini-dom không thực thi <script> chèn động nên test nạp thẳng. */
const ITEMS_ADMIN_SRC = fs.readFileSync(path.join(ROOT, 'src/js/admin-items.js'), 'utf8');

const ADMIN_USERNAME = 'admin';
const OTHER_USERNAME = 'aovfan';

/** Trang bị được chọn làm mục tiêu test dọn tham chiếu (AD06) — bị tham chiếu ở nhiều nơi. */
const TARGET_ITEM_ID = 101;

/** Id lớn nhất trong items.json hiện tại + 1 = id mà createItem() sẽ cấp cho item mới. */
const NEXT_ITEM_ID = Math.max(...ITEMS_JSON.map((item) => Number(item.id))) + 1;

const ITEMS_START = ITEMS_JSON.length;

/** 14 khoá chỉ số của item.stats (khớp ITEM_STAT_KEYS trong admin-items.js / item.js). */
const STAT_KEYS = [
    'attack', 'magicPower', 'armor', 'magicResist', 'hp', 'moveSpeed',
    'attackSpeed', 'critChance', 'penetration', 'lifesteal',
    'hpRegen', 'cooldownReduction', 'mana', 'manaRegen',
];

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * "File" items.json / builds.json / heroes.json dùng chung qua API, mô phỏng file thật ghi
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
 * Mở mục "Trang bị" của trang Quản lý (admin.html?tab=items) và chờ render xong.
 * Vì admin-items.js được shell nạp động (mini-dom không chạy <script> chèn động), test nạp
 * thẳng file vào ngữ cảnh trang rồi đánh dấu "đã nạp" để shell vẽ mục ngay, không phải chờ
 * hết ADMIN_SCRIPT_TIMEOUT (1.5s).
 */
async function openItemsTab(options = {}) {
    const page = loadPage(Object.assign({ page: ADMIN_PAGE, search: ITEMS_TAB_SEARCH, api }, options));
    page.run();

    // Mô phỏng shell nạp admin-items.js bằng thẻ <script>: chạy file trong ngữ cảnh trang.
    page.runInPage(ITEMS_ADMIN_SRC);
    page.runInPage("ADMIN_LOADED_SCRIPTS[BASE_PATH + 'src/js/admin-items.js'] = 'loaded';");

    await page.settled();
    await page.settled();
    return page;
}

/** Mở mục Trang bị với tài khoản admin và chờ tới khi bảng đã có dòng. */
async function openItemsAsAdmin(options = {}) {
    const page = await openItemsTab(Object.assign({ login: ADMIN_USERNAME }, options));
    await waitFor(() => page.el('item-admin-list')
        && page.el('item-admin-list').innerHTML.includes('data-item-edit'));
    return page;
}

// Các helper phải an toàn khi phần tử chưa tồn tại (người không có quyền không được vẽ mục).
const formHtml = (page) => { const node = page.el('item-admin-form'); return node ? node.innerHTML : ''; };
const tableHtml = (page) => { const node = page.el('item-admin-list'); return node ? node.innerHTML : ''; };
const countText = (page) => { const node = page.el('item-admin-count'); return node ? node.textContent : ''; };
const plainTable = (page) => unescapeHtml(tableHtml(page));
const plainForm = (page) => unescapeHtml(formHtml(page));

/** Số dòng trang bị trong bảng (số nút Sửa = số dòng). */
function tableRowCount(page) {
    return tableHtml(page).split('data-item-edit=').length - 1;
}

/** Nội dung khung lỗi / thông báo của form (#item-form-errors bên trong #item-admin-form). */
function formErrorsText(page) {
    const box = page.el('item-admin-form');
    const errors = box ? box.querySelector('#item-form-errors') : null;
    return errors ? unescapeHtml(errors.innerHTML) : '';
}

/** Đọc giá trị đang điền trong form sửa: form.querySelector('#item-name').value ... */
function formValue(page, selector) {
    const form = page.el('item-admin-form') && page.el('item-admin-form').querySelector('#item-form');
    if (!form) return null;
    const input = form.querySelector(selector);
    return input ? input.value : null;
}

/** Điền form thêm / sửa (đọc ghi trực tiếp lên node, như người dùng gõ). Trả về <form>. */
function fillItemForm(page, values) {
    const box = page.el('item-admin-form');
    const form = box && box.querySelector('#item-form');
    if (!form) throw new Error('Không tìm thấy form #item-form');

    form.querySelector('#item-name').value = values.name === undefined ? '' : String(values.name);
    form.querySelector('#item-image').value = values.image || '';
    form.querySelector('#item-type').value = values.type || 'Công';
    form.querySelector('#item-price').value = values.price === undefined ? '' : String(values.price);
    form.querySelector('#item-passive').value = values.passive || '';
    form.querySelector('#item-description').value = values.description || '';
    form.querySelector('#item-related').value = values.related === undefined ? '' : String(values.related);

    const featuredInput = form.querySelector('#item-featured');
    if (featuredInput) featuredInput.checked = values.featured === true;

    STAT_KEYS.forEach((key) => {
        const input = form.querySelector('#item-stat-' + key);
        const value = values.stats && values.stats[key];
        input.value = value === undefined ? '' : String(value);
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

/** Gọi validateItemForm() trong ngữ cảnh trang và trả kết quả. */
function validate(page, input) {
    return page.runInPage('validateItemForm(' + JSON.stringify(input) + ')');
}

/* ================= Test ================= */

(async () => {
    /* ---------- 0. Dữ liệu mẫu ---------- */
    section('0. data/items.json có dữ liệu mẫu');

    check(`items.json có ít nhất 30 trang bị như cam kết`, ITEMS_START >= 30, ITEMS_START + ' trang bị');
    check('mọi trang bị đều có id, name, type, price, stats',
        ITEMS_JSON.every((item) => (item.id && item.name && item.type && item.price !== undefined && item.stats)),
        JSON.stringify(ITEMS_JSON.find((item) => !(item.id && item.name && item.type && item.price !== undefined && item.stats))));

    const target = ITEMS_JSON.find((item) => Number(item.id) === TARGET_ITEM_ID);
    check(`item ${TARGET_ITEM_ID} tồn tại và có đủ dữ liệu để test dọn tham chiếu`,
        Boolean(target && target.name && Array.isArray(target.related)),
        JSON.stringify(target));

    /* ---------- 1. Chặn truy cập ---------- */
    section('1. Chặn truy cập mục Quản lý trang bị');

    const guest = await openItemsTab({ storage: new Map() });
    check('khách chưa đăng nhập bị đưa về trang Login',
        guest.location.href.includes('/src/pages/login.html'),
        guest.location.href);
    check('khách không thấy form thêm trang bị',
        !formHtml(guest).includes('id="item-form"'),
        plainForm(guest).slice(0, 120));
    check('khách không thấy bảng danh sách trang bị',
        !tableHtml(guest).includes('data-item-edit'),
        tableHtml(guest).slice(0, 120));

    const stranger = await openItemsTab({ login: OTHER_USERNAME });
    check('user thường bị cảnh báo khi mở trang Quản lý',
        stranger.alerts.some((message) => /không có quyền/i.test(message)),
        JSON.stringify(stranger.alerts));
    check('user thường bị chuyển về trang chủ',
        stranger.location.href === '/index.html',
        stranger.location.href);
    check('user thường không thấy form hay bảng quản trị trang bị',
        !formHtml(stranger).includes('id="item-form"')
        && !tableHtml(stranger).includes('data-item-edit'),
        tableHtml(stranger).slice(0, 120));

    /* ---------- 2. Admin: bảng danh sách ---------- */
    section('2. Bảng danh sách trang bị (admin)');

    const admin = await openItemsAsAdmin();
    check('admin vào được mục Trang bị của trang Quản lý',
        admin.alerts.length === 0 && formHtml(admin).includes('id="item-form"'),
        JSON.stringify(admin.alerts));
    check('bảng liệt kê đủ số trang bị trong items.json',
        tableRowCount(admin) === ITEMS_START,
        tableRowCount(admin) + ' dòng / ' + ITEMS_START + ' item');
    check('ô đếm báo đúng tổng số trang bị',
        countText(admin) === `${ITEMS_START} trang bị`,
        countText(admin));
    check('bảng có cột Tên trang bị và Liên kết sang trang chi tiết',
        plainTable(admin).includes('item-detail.html?id='),
        plainTable(admin).slice(0, 160));
    check('mục Trang bị đã đăng ký vào shell đúng id',
        admin.runInPage("ADMIN_SECTIONS['items'] && ADMIN_SECTIONS['items'][0] && ADMIN_SECTIONS['items'][0].sectionId") === 'item-manager');
    check('form mặc định là "Thêm trang bị mới" (chưa có data-edit-id)',
        formHtml(admin).includes('Thêm trang bị mới')
        && formHtml(admin).includes('id="item-form"')
        && formValue(admin, '#item-name') === '',
        plainForm(admin).slice(0, 160));

    /* ---------- 3. Tìm kiếm theo tên ---------- */
    section('3. Tìm trang bị theo tên');

    const keywordInput = admin.el('item-admin-toolbar').querySelector('#item-admin-keyword');
    keywordInput.value = 'fafnir';
    fire(keywordInput, 'input', admin.doc);
    await sleep(320); // debounce() lọc sau 200ms

    check('gõ "fafnir" (không dấu) lọc còn 1 trang bị',
        tableRowCount(admin) === 1 && plainTable(admin).includes('Kiếm Fafnir'),
        tableRowCount(admin) + ' dòng');
    check('ô đếm báo "đang xem / tổng" khi có từ khoá',
        countText(admin) === `1 / ${ITEMS_START} trang bị`,
        countText(admin));

    keywordInput.value = 'khong-co-trang-bi-nao';
    fire(keywordInput, 'input', admin.doc);
    await sleep(320);

    check('từ khoá không khớp thì hiện thông báo trống, không vẽ bảng',
        tableRowCount(admin) === 0 && /không có trang bị/i.test(plainTable(admin)),
        plainTable(admin).slice(0, 120));

    keywordInput.value = '';
    fire(keywordInput, 'input', admin.doc);
    await sleep(320);

    check('xoá từ khoá thì bảng trở lại đủ trang bị',
        tableRowCount(admin) === ITEMS_START,
        tableRowCount(admin) + ' dòng');

    /* ---------- 4. Validate form ---------- */
    section('4. Validate dữ liệu form thêm / sửa');

    check('dữ liệu tối thiểu hợp lệ (tên + loại + giá)',
        validate(admin, { name: 'Kiếm thử', type: 'Công', price: '100' }).valid === true);

    const tooShort = validate(admin, { name: 'A', type: 'Công', price: '100' });
    check('tên ngắn hơn 2 ký tự bị chặn',
        tooShort.valid === false && tooShort.errors.some((e) => /ít nhất/i.test(e)),
        JSON.stringify(tooShort.errors));

    const noType = validate(admin, { name: 'Kiếm thử', type: '', price: '100' });
    check('thiếu loại bị chặn',
        noType.valid === false && noType.errors.some((e) => /chọn loại/i.test(e)),
        JSON.stringify(noType.errors));

    const badType = validate(admin, { name: 'Kiếm thử', type: 'Sai loại', price: '100' });
    check('loại không nằm trong 6 loại bị chặn',
        badType.valid === false && badType.errors.some((e) => /Loại trang bị phải là/i.test(e)),
        JSON.stringify(badType.errors));

    ['', '-1', '1.5', '100001', 'abc'].forEach((price) => {
        const result = validate(admin, { name: 'Kiếm thử', type: 'Công', price });
        check(`giá "${price}" không hợp lệ bị chặn`, result.valid === false, JSON.stringify(result.errors));
    });

    const dataImage = validate(admin, { name: 'Kiếm thử', type: 'Công', price: '100', image: 'data:image/png;base64,AAAA' });
    check('ảnh dán data URL bị chặn',
        dataImage.valid === false && dataImage.errors.some((e) => /data URL/i.test(e)),
        JSON.stringify(dataImage.errors));

    const badStat = validate(admin, { name: 'Kiếm thử', type: 'Công', price: '100', stats: { attack: -5 } });
    check('chỉ số âm bị chặn',
        badStat.valid === false && badStat.errors.some((e) => /Sát thương/.test(e)),
        JSON.stringify(badStat.errors));

    const badRelated = validate(admin, { name: 'Kiếm thử', type: 'Công', price: '100', related: 'abc' });
    check('mã trang bị liên quan không phải số bị chặn',
        badRelated.valid === false && badRelated.errors.some((e) => /liên quan/i.test(e)),
        JSON.stringify(badRelated.errors));

    const relatedNormalized = validate(admin, {
        id: TARGET_ITEM_ID,
        name: 'Kiếm thử',
        type: 'Công',
        price: '100',
        related: `${TARGET_ITEM_ID}, 102, 102`,
    });
    check('liên quan tự bỏ id trùng và id của chính nó',
        relatedNormalized.valid === true
        && JSON.stringify(relatedNormalized.values.related) === JSON.stringify([102]),
        JSON.stringify(relatedNormalized.values.related));

    const statsKept = validate(admin, {
        name: 'Kiếm thử',
        type: 'Công',
        price: '100',
        stats: { attack: '60', lifesteal: '10', hp: '' },
    });
    check('chỉ số giữ ô có giá trị, bỏ ô để trống',
        statsKept.valid === true
        && JSON.stringify(statsKept.values.stats) === JSON.stringify({ attack: 60, lifesteal: 10 }),
        JSON.stringify(statsKept.values.stats));

    /* ---------- 5. Form sửa: điền sẵn dữ liệu cũ ---------- */
    section('5. Mở form sửa và điền sẵn dữ liệu');

    const editBtn = admin.el('item-admin-list').querySelector('[data-item-edit="' + TARGET_ITEM_ID + '"]');
    await click(admin, editBtn);

    check('form sửa hiện đúng tiêu đề và data-edit-id',
        formHtml(admin).includes('Sửa trang bị')
        && formValue(admin, '#item-name') === target.name,
        plainForm(admin).slice(0, 200));
    check('form sửa điền sẵn loại và giá',
        formValue(admin, '#item-type') === target.type
        && formValue(admin, '#item-price') === String(target.price),
        formValue(admin, '#item-type') + ' / ' + formValue(admin, '#item-price'));
    check('form sửa điền sẵn chỉ số',
        formValue(admin, '#item-stat-attack') === String(target.stats.attack),
        formValue(admin, '#item-stat-attack'));
    check('form sửa điền sẵn trang bị liên quan',
        formValue(admin, '#item-related') === (target.related || []).join(', '),
        formValue(admin, '#item-related'));

    const cancelBtn = admin.el('item-admin-form').querySelector('[data-item-cancel]');
    await click(admin, cancelBtn);
    check('bấm Huỷ quay về form thêm mới',
        formHtml(admin).includes('Thêm trang bị mới') && formValue(admin, '#item-name') === '',
        plainForm(admin).slice(0, 120));

    /* ---------- 6. Thêm trang bị mới ---------- */
    section('6. Thêm trang bị mới');

    const newForm = fillItemForm(admin, {
        name: 'Kiếm Thử Nghiệm',
        type: 'Phép',
        price: 1234,
        image: 'items/kiem-thu-nghiem.png',
        passive: 'Nội tại thử nghiệm.',
        description: 'Mô tả thử nghiệm.',
        related: '102, 103',
        featured: true,
        stats: { attack: 10, magicPower: 20, hp: '' },
    });
    await submitForm(admin, newForm);

    const created = api.items.find((item) => item.name === 'Kiếm Thử Nghiệm');
    check('thêm: item mới được ghi vào items.json',
        Boolean(created), 'không tìm thấy item vừa thêm');
    check(`thêm: id tự cấp = id lớn nhất + 1 (${NEXT_ITEM_ID})`,
        created && Number(created.id) === NEXT_ITEM_ID,
        created ? String(created.id) : '—');
    check('thêm: alias sinh từ tên (bỏ dấu)',
        created && created.alias === 'kiem-thu-nghiem',
        created ? created.alias : '—');
    check('thêm: giữ loại, giá, ảnh, nội tại, mô tả',
        created && created.type === 'Phép' && created.price === 1234
        && created.image === 'items/kiem-thu-nghiem.png'
        && created.passive === 'Nội tại thử nghiệm.'
        && created.description === 'Mô tả thử nghiệm.',
        JSON.stringify(created));
    check('thêm: chỉ số chỉ giữ ô có giá trị',
        created && JSON.stringify(created.stats) === JSON.stringify({ attack: 10, magicPower: 20 }),
        created ? JSON.stringify(created.stats) : '—');
    check('thêm: trang bị liên quan đúng',
        created && JSON.stringify(created.related) === JSON.stringify([102, 103]),
        created ? JSON.stringify(created.related) : '—');
    check('thêm: cờ nổi bật = true',
        created && created.featured === true,
        created ? String(created.featured) : '—');
    check('thêm: file có thêm đúng 1 item',
        api.items.length === ITEMS_START + 1,
        api.items.length + ' item');
    check('thêm: bảng vẽ lại đủ số dòng',
        tableRowCount(admin) === api.items.length,
        tableRowCount(admin) + ' dòng');
    check('thêm: form quay về trạng thái thêm mới và báo thành công',
        formHtml(admin).includes('Thêm trang bị mới')
        && /Đã thêm trang bị/i.test(formErrorsText(admin)),
        formErrorsText(admin).slice(0, 160));

    /* ---------- 7. Sửa trang bị ---------- */
    section('7. Sửa trang bị vừa thêm (giữ nguyên id)');

    await click(admin, admin.el('item-admin-list').querySelector('[data-item-edit="' + NEXT_ITEM_ID + '"]'));

    const editNewForm = fillItemForm(admin, {
        name: 'Kiếm Thử Nghiệm 2',
        type: 'Thủ',
        price: 999,
        image: 'items/kiem-thu-nghiem-2.png',
        related: '104',
        featured: false,
        stats: { hp: 500 },
    });
    await submitForm(admin, editNewForm);

    const updated = api.items.filter((item) => Number(item.id) === NEXT_ITEM_ID);
    check('sửa: vẫn chỉ có đúng 1 item với id cũ',
        updated.length === 1,
        updated.length + ' item');
    check('sửa: đổi tên / loại / giá / ảnh',
        updated[0] && updated[0].name === 'Kiếm Thử Nghiệm 2' && updated[0].type === 'Thủ'
        && updated[0].price === 999 && updated[0].image === 'items/kiem-thu-nghiem-2.png',
        JSON.stringify(updated[0]));
    check('sửa: thay chỉ số cũ bằng chỉ số mới',
        updated[0] && JSON.stringify(updated[0].stats) === JSON.stringify({ hp: 500 }),
        updated[0] ? JSON.stringify(updated[0].stats) : '—');
    check('sửa: cập nhật trang bị liên quan',
        updated[0] && JSON.stringify(updated[0].related) === JSON.stringify([104]),
        updated[0] ? JSON.stringify(updated[0].related) : '—');
    check('sửa: báo thành công',
        /Đã cập nhật trang bị/i.test(formErrorsText(admin)),
        formErrorsText(admin).slice(0, 160));
    check('sửa: số item trong file không đổi',
        api.items.length === ITEMS_START + 1,
        api.items.length + ' item');

    /* ---------- 8. Xoá an toàn (AD06) ---------- */
    section('8. Xoá trang bị + dọn tham chiếu (AD06)');

    // Yêu thích của người dùng: có cả item 101 (sẽ xoá) và 102 (phải giữ).
    const storage = new Map();
    storage.set('aov_favorites', JSON.stringify({ hero: [1], item: [TARGET_ITEM_ID, 102] }));

    const admin2 = await openItemsAsAdmin({ login: ADMIN_USERNAME, storage });

    // Chụp lại trạng thái trước khi xoá để so sánh phần "giữ nguyên" sau khi dọn.
    const hero1Before = clone((api.heroes.find((hero) => Number(hero.id) === 1) || {}).recommendedBuild || []);
    const build1Before = clone((api.builds.find((build) => Number(build.id) === 1) || {}).items || []);

    check('trước khi xoá: item 101 có trong items.json', api.items.some((item) => Number(item.id) === TARGET_ITEM_ID));
    check('trước khi xoá: items.related có trỏ tới 101',
        api.items.some((item) => Array.isArray(item.related) && item.related.map(Number).includes(TARGET_ITEM_ID)));
    check('trước khi xoá: builds.items có 101',
        api.builds.some((build) => Array.isArray(build.items) && build.items.map(Number).includes(TARGET_ITEM_ID)));
    check('trước khi xoá: builds[].phases[].items có 101',
        api.builds.some((build) => Array.isArray(build.phases)
            && build.phases.some((phase) => Array.isArray(phase.items) && phase.items.map(Number).includes(TARGET_ITEM_ID))));
    check('trước khi xoá: heroes.recommendedBuild có 101',
        api.heroes.some((hero) => Array.isArray(hero.recommendedBuild) && hero.recommendedBuild.map(Number).includes(TARGET_ITEM_ID)));
    check('trước khi xoá: yêu thích có 101',
        admin2.readKey('aov_favorites').item.map(Number).includes(TARGET_ITEM_ID));

    const itemsBefore = api.items.length;
    await click(admin2, admin2.el('item-admin-list').querySelector('[data-item-delete="' + TARGET_ITEM_ID + '"]'));
    await waitFor(() => !api.items.some((item) => Number(item.id) === TARGET_ITEM_ID));

    check('sau khi xoá: 101 không còn trong items.json',
        !api.items.some((item) => Number(item.id) === TARGET_ITEM_ID));
    check('sau khi xoá: file bớt đúng 1 item',
        api.items.length === itemsBefore - 1,
        api.items.length + ' item');
    check('AD06: gỡ 101 khỏi items.related của các trang bị còn lại',
        !api.items.some((item) => Array.isArray(item.related) && item.related.map(Number).includes(TARGET_ITEM_ID)));
    check('AD06: gỡ 101 khỏi builds.items',
        !api.builds.some((build) => Array.isArray(build.items) && build.items.map(Number).includes(TARGET_ITEM_ID)));
    check('AD06: gỡ 101 khỏi builds[].phases[].items',
        !api.builds.some((build) => Array.isArray(build.phases)
            && build.phases.some((phase) => Array.isArray(phase.items) && phase.items.map(Number).includes(TARGET_ITEM_ID))));
    check('AD06: gỡ 101 khỏi heroes[].recommendedBuild',
        !api.heroes.some((hero) => Array.isArray(hero.recommendedBuild) && hero.recommendedBuild.map(Number).includes(TARGET_ITEM_ID)));

    const favoritesAfter = admin2.readKey('aov_favorites');
    check('AD06: gỡ 101 khỏi yêu thích (aov_favorites.item)',
        !favoritesAfter.item.map(Number).includes(TARGET_ITEM_ID),
        JSON.stringify(favoritesAfter.item));
    check('AD06: giữ nguyên yêu thích khác (item 102, hero 1)',
        favoritesAfter.item.map(Number).includes(102) && favoritesAfter.hero.map(Number).includes(1),
        JSON.stringify(favoritesAfter));

    check('AD06: build 1 vẫn giữ các trang bị còn lại',
        [102, 103, 104, 105, 106].every((id) => api.builds.find((b) => Number(b.id) === 1).items.map(Number).includes(id)),
        JSON.stringify(api.builds.find((b) => Number(b.id) === 1).items));
    check('AD06: hero 1 chỉ mất đúng 101 khỏi recommendedBuild',
        hero1Before.length > 0
        && api.heroes.find((h) => Number(h.id) === 1).recommendedBuild.length === hero1Before.length - 1,
        JSON.stringify(api.heroes.find((h) => Number(h.id) === 1).recommendedBuild));

    check('sau khi xoá: bảng vẽ lại đúng số dòng',
        tableRowCount(admin2) === api.items.length,
        tableRowCount(admin2) + ' dòng / ' + api.items.length + ' item');
    check('sau khi xoá: tên trang bị đã xoá không còn trên bảng',
        !plainTable(admin2).includes(target.name),
        target.name);

    /* ---------- 9. Tầng dữ liệu fail-closed (không phải admin) ---------- */
    section('9. Tầng dữ liệu chặn người không có quyền');

    const hacker = await openItemsTab({ login: OTHER_USERNAME });

    check('user thường: canManageItems() = false',
        hacker.runInPage('canManageItems()') === false);

    const itemsBeforeHack = api.items.length;
    const hackCreate = await hacker.runInPage("createItem({ name: 'Hack item', type: 'Công', price: 100 })");
    check('user thường: createItem() trả null', hackCreate === null, JSON.stringify(hackCreate));
    check('user thường: createItem() không ghi thêm item', api.items.length === itemsBeforeHack);

    const hackUpdate = await hacker.runInPage(`updateItem(${NEXT_ITEM_ID}, { name: 'Hacked', type: 'Công', price: 1 })`);
    check('user thường: updateItem() trả null', hackUpdate === null, JSON.stringify(hackUpdate));
    check('user thường: updateItem() không đổi tên item',
        (api.items.find((item) => Number(item.id) === NEXT_ITEM_ID) || {}).name === 'Kiếm Thử Nghiệm 2',
        JSON.stringify(api.items.find((item) => Number(item.id) === NEXT_ITEM_ID)));

    const hackDelete = await hacker.runInPage('deleteItem(102)');
    check('user thường: deleteItem() trả false', hackDelete === false, JSON.stringify(hackDelete));
    check('user thường: deleteItem() không xoá item', api.items.some((item) => Number(item.id) === 102));

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
