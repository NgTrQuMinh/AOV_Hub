/**
 * test-build-submit.cjs - TEST-a: tính năng gửi build (HD06-b) và duyệt build (HD06-f).
 *
 * Phạm vi:
 *   Nhóm 1-9  (src/js/build-submit.js + src/pages/build-submit.html):
 *     khách/user thường, vẽ form, giới hạn chọn trang bị, validate, gửi hợp lệ,
 *     giới hạn 3 bản chờ/người, chống XSS, tài khoản bị khóa, kiểm duyệt từ cấm.
 *   Nhóm 10-16 (src/js/admin-build-review.js trong tab "Chờ duyệt"):
 *     liệt kê bản chờ, duyệt/từ chối ở tầng dữ liệu và qua nút DOM, chặn quyền,
 *     API ghi lỗi, bản gửi có tướng/trang bị không còn tồn tại.
 *
 * Cách chạy: dùng tools/mini-dom.cjs nạp TRANG THẬT + script THẬT rồi thao tác DOM thật.
 *   - localStorage mô phỏng: mỗi lần mở trang dùng Map riêng -> các nhóm độc lập.
 *   - API /api/builds mô phỏng: truyền cùng một object `api` để "file" builds.json giữ
 *     nguyên giữa các lần mở trang (giống server đang chạy).
 *   - admin-build-review.js được admin-shell.js nạp ĐỘNG (mini-dom không chạy thẻ
 *     <script> chèn động) nên test chạy thẳng mã vào ngữ cảnh trang rồi gọi lại
 *     renderAdminTabSections() — đúng cách test-admin-pending.cjs đang làm.
 *
 * GHIM KỸ THUẬT (quan trọng):
 *   mini-dom KHÔNG có appendChild/removeChild/.remove/.style và nút <select> theo id
 *   bị tạo như <div> rỗng. build-submit.js lại dựng form bằng appendChild nên nếu chạy
 *   thẳng sẽ ném lỗi. Vì KHÔNG được sửa mini-dom, test tự bù các method DOM còn thiếu
 *   NGAY TRONG ngữ cảnh trang (enableDomCore) — vẫn chạy đúng mã dự án, chỉ bù phần
 *   hạ tầng DOM tối giản. Không bù appendChild cho document.body để admin-shell.js giữ
 *   nguyên hành vi "bỏ qua script động" như các test admin khác.
 *   Sự kiện bắn kèm `this` = chính phần tử (đúng như trình duyệt), vì handler checkbox
 *   của build-submit.js đọc `this.checked`.
 *
 * Mọi dữ liệu tướng/trang bị/id lấy từ src/data thật (không hard-code bừa).
 *
 * Chạy: node tools/test-build-submit.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, makeNode, fire } = require('./mini-dom.cjs');

const SUBMIT_PAGE = 'src/pages/build-submit.html';
const ADMIN_PAGE = 'src/pages/admin.html';

const SUBMISSIONS_KEY = 'aov_build_submissions';

const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));
const ITEMS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));
const BUILDS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/builds.json'), 'utf8'));

const FIRST_HERO = HEROES_JSON[0];
const HERO_COUNT = HEROES_JSON.length;
const ITEM_COUNT = ITEMS_JSON.length;
const FIRST_ITEM_ID = Number(ITEMS_JSON[0].id);
const BUILD_START = BUILDS_JSON.length;
const NEXT_BUILD_ID = Math.max.apply(null, BUILDS_JSON.map((build) => Number(build.id))) + 1;

const ADMIN_BUILD_REVIEW_SRC = fs.readFileSync(path.join(ROOT, 'src/js/admin-build-review.js'), 'utf8');
const ADMIN_PENDING_SRC = fs.readFileSync(path.join(ROOT, 'src/js/admin-pending.js'), 'utf8');
const SUBMIT_PAGE_HTML = fs.readFileSync(path.join(ROOT, SUBMIT_PAGE), 'utf8');

const ADMIN_USERNAME = 'admin';
const USER_USERNAME = 'aovfan';
const OTHER_USERNAME = 'demo';

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

/* ================= Bù method DOM còn thiếu trong mini-dom ================= */

/**
 * Gắn các method DOM tối thiểu (appendChild/removeChild/remove/style/options) lên node.
 * Chỉ bù những gì mini-dom thiếu; không đổi hành vi nào khác.
 */
function augment(node) {
    if (!node || node.__augmented) return node;
    node.__augmented = true;

    if (!node.style) node.style = {};

    // Bù lỗi có sẵn của mini-dom: matchesParts() đọc current.parent khi current = null
    // (gặp khi querySelectorAll dùng selector tổ tiên như '#bs-tips-list input' mà node
    // không có tổ tiên khớp) -> tránh ném lỗi để code dự án chạy tiếp.
    const originalMatches = node.matches;
    node.matches = function (selector) {
        try {
            return originalMatches.call(this, selector);
        } catch (error) {
            return false;
        }
    };

    node.appendChild = function (child) {
        child.parent = node;
        node.children.push(child);
        return child;
    };
    node.removeChild = function (child) {
        node.children = node.children.filter((entry) => entry !== child);
        return child;
    };
    node.remove = function () {
        if (node.parent) node.parent.children = node.parent.children.filter((entry) => entry !== node);
        node.__detached = true;
    };

    // Nút <select> lấy theo id bị mini-dom tạo như <div> rỗng -> bù .options để code đọc được.
    if (!('options' in node)) {
        Object.defineProperty(node, 'options', {
            get() { return node.querySelectorAll('option'); },
        });
    }

    return node;
}

/** Gắn method bù đệ quy cho cả một cây DOM (dùng cho cây do admin-shell dựng bằng innerHTML). */
function augmentTree(root) {
    if (!root || typeof root !== 'object') return;
    augment(root);
    if (!Array.isArray(root.children)) return;
    root.children.forEach(augmentTree);
}

/** Bù method cho mọi node mà trang lấy ra qua document (KHÔNG đụng document.body). */
function enableDomCore(page) {
    const doc = page.ctx.document;
    const byId = doc.getElementById.bind(doc);
    const queryAll = doc.querySelectorAll.bind(doc);
    const queryOne = doc.querySelector.bind(doc);

    doc.getElementById = (id) => augment(byId(id));
    doc.querySelectorAll = (selector) => queryAll(selector).map(augment);
    doc.querySelector = (selector) => augment(queryOne(selector));
    doc.createElement = (tag) => augment(makeNode(tag === undefined ? 'div' : String(tag).toLowerCase()));
}

/* ================= Bắn sự kiện (this = phần tử, như trình duyệt) ================= */

function dispatch(node, type) {
    const event = {
        type,
        target: node,
        currentTarget: node,
        preventDefault() {},
        stopPropagation() {},
    };
    (node.listeners[type] || []).forEach((fn) => fn.call(node, event));
}

function setCheckbox(page, cb, value) {
    cb.checked = value;
    dispatch(cb, 'change');
}

/* ================= Trợ giúp trang gửi build ================= */

async function openSubmit(options) {
    const page = loadPage(Object.assign({ page: SUBMIT_PAGE }, options || {}));
    enableDomCore(page);
    page.run();
    await page.settled();
    await page.settled();
    return page;
}

function itemsGrid(page, phase) {
    const cont = page.el('bs-phase-' + phase + '-items');
    return cont ? cont.querySelector('.build-submit-items-grid') : null;
}

function checkboxes(page, phase) {
    const grid = itemsGrid(page, phase);
    return grid ? grid.querySelectorAll('input') : [];
}

function checkboxFor(page, phase, itemId) {
    return checkboxes(page, phase).find((cb) => String(cb.value) === String(itemId)) || null;
}

/** Chọn một trang bị ở giai đoạn; trả về trạng thái checked sau khi handler chạy. */
function checkItem(page, phase, itemId) {
    const cb = checkboxFor(page, phase, itemId);
    if (!cb) throw new Error('Không có checkbox item ' + itemId + ' ở giai đoạn ' + phase);
    setCheckbox(page, cb, true);
    return cb.checked;
}

function previewItemCount(page) {
    const html = page.el('bs-items-preview') ? page.el('bs-items-preview').innerHTML : '';
    return (html.match(/build-submit-preview__item/g) || []).length;
}

/** Điền các trường bắt buộc với giá trị hợp lệ (có thể ghi đè từng trường). */
function fillRequired(page, overrides) {
    const values = overrides || {};
    page.el('bs-hero').value = values.heroId === undefined ? String(FIRST_HERO.id) : String(values.heroId);
    page.el('bs-name').value = values.name === undefined ? 'Build kiểm thử' : values.name;
    page.el('bs-lane').value = values.lane === undefined ? 'Rừng' : values.lane;
    page.el('bs-playstyle').value = values.playstyle === undefined
        ? 'Lối chơi kiểm thử đủ dài cho hợp lệ.' : values.playstyle;
    page.el('bs-skill-order').value = values.skillOrder === undefined ? '1 > 2 > 1' : values.skillOrder;
}

/** Gọi handler onsubmit thật của form. */
async function submitForm(page) {
    const form = page.el('build-submit-form');
    form.onsubmit({ preventDefault() {} });
    await page.settled();
}

function submissionsOf(page) {
    const list = page.readKey(SUBMISSIONS_KEY);
    return Array.isArray(list) ? list : [];
}

/** Tiêm các thẻ p.form-error tĩnh (mini-dom không parse markup tĩnh) để đọc được lỗi. */
function injectErrorNodes(page) {
    const names = ['hero', 'name', 'lane', 'playstyle', 'skillOrder', 'phase0Note', 'phase1Note', 'phase2Note'];
    page.el('build-submit-form').innerHTML = names
        .map((name) => '<p class="form-error" data-error-for="' + name + '" hidden></p>')
        .join('');
}

function errorNode(page, name) {
    return page.el('build-submit-form').querySelector('[data-error-for="' + name + '"]');
}

/* ================= Trợ giúp trang admin (duyệt build) ================= */

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function makeApi() {
    return { heroes: clone(HEROES_JSON), items: clone(ITEMS_JSON), builds: clone(BUILDS_JSON) };
}

function submissionSeed(id, status, overrides) {
    return Object.assign({
        id,
        heroId: FIRST_HERO.id,
        name: 'Build ' + id,
        lane: 'Rừng',
        playstyle: 'Lối chơi kiểm thử đủ dài cho hợp lệ.',
        items: [101, 102, 103],
        phases: [
            { name: 'Đầu trận', items: [101], note: '' },
            { name: 'Giữa trận', items: [102], note: '' },
            { name: 'Cuối trận', items: [103], note: '' },
        ],
        skillOrder: '1 > 2 > 1',
        tips: ['Mẹo kiểm thử'],
        author: USER_USERNAME,
        createdAt: '2025-06-01T00:00:00.000Z',
        status,
    }, overrides || {});
}

function storageWithSubmissions(list) {
    return new Map([[SUBMISSIONS_KEY, JSON.stringify(list)]]);
}

/** 2 bản pending + 1 bản approved; bản bs_9002 cố tình chứa thẻ HTML để thử chống XSS. */
function pendingSeeds() {
    return [
        submissionSeed('bs_9001', 'pending', { name: 'Build chờ một', createdAt: '2025-06-03T00:00:00.000Z' }),
        submissionSeed('bs_9002', 'pending', {
            name: 'Build chờ hai <b>x</b>',
            playstyle: 'Lối chơi <script>alert(1)</script> đủ dài cho hợp lệ.',
            createdAt: '2025-06-02T00:00:00.000Z',
        }),
        submissionSeed('bs_9003', 'approved', { name: 'Build đã duyệt', createdAt: '2025-06-01T00:00:00.000Z' }),
    ];
}

async function openAdminPending(options) {
    const page = loadPage(Object.assign({ page: ADMIN_PAGE, search: '?tab=pending' }, options || {}));
    enableDomCore(page);
    page.run();
    await page.settled();
    await page.settled();

    // Giống admin-shell.js chèn <script> cho tab 'pending' (mini-dom không chạy script động).
    page.runInPage(ADMIN_PENDING_SRC);
    page.runInPage(ADMIN_BUILD_REVIEW_SRC);
    await page.runInPage("renderAdminTabSections(document.getElementById('admin-panel'), 'pending')");
    await page.settled();

    // Cây mục do admin-shell dựng bằng innerHTML nên chưa được bù method; bù ngay để
    // findReviewSectionBody() (dùng document.querySelector với selector tổ tiên) không
    // vấp lỗi có sẵn của mini-dom khi vẽ lại sau mỗi lần duyệt/từ chối.
    augmentTree(page.el('admin-panel'));

    return page;
}

function reviewBody(page) {
    const panel = page.el('admin-panel');
    return panel ? panel.querySelector('[data-admin-section="pending-builds"] .admin-section__body') : null;
}

function reviewBodyHtml(page) {
    const body = reviewBody(page);
    return body ? body.innerHTML : '';
}

function reviewRowCount(page) {
    return (reviewBodyHtml(page).match(/data-build-review-row=/g) || []).length;
}

/** Nội dung vùng thông báo trạng thái (code ghi bằng textContent, không phải innerHTML). */
function reviewStatusText(page) {
    const body = reviewBody(page);
    const status = body ? body.querySelector('[data-build-review-status]') : null;
    return status ? String(status.textContent || '') : '';
}

/* ================= Test ================= */

(async () => {
    /* ---------- 1. Khách chưa đăng nhập ---------- */
    section('1. Trang gửi build - khách chưa đăng nhập');

    const guest = await openSubmit({ storage: new Map() });
    check('form bị ẩn và #build-submit-gate hiện cho khách',
        guest.el('build-submit-form').hidden === true && guest.el('build-submit-gate').hidden === false,
        'form.hidden=' + guest.el('build-submit-form').hidden + ', gate.hidden=' + guest.el('build-submit-gate').hidden);
    check('#build-submit-gate có link đăng nhập trong HTML thật',
        /id="build-submit-gate"[\s\S]*?href="login\.html"/.test(SUBMIT_PAGE_HTML));
    check('khách: không ném lỗi JavaScript',
        guest.errors.filter((error) => !error.startsWith('console.error')).length === 0,
        guest.errors.join(' | '));

    /* ---------- 2. User thường đăng nhập ---------- */
    section('2. Trang gửi build - user thường (aovfan)');

    const member = await openSubmit({ login: USER_USERNAME, storage: new Map() });
    check('form hiện và gate ẩn cho user thường',
        member.el('build-submit-form').hidden === false && member.el('build-submit-gate').hidden === true);

    const heroOptions = member.el('bs-hero').querySelectorAll('option');
    check('select#bs-hero có placeholder + đủ tướng từ heroes.json',
        heroOptions.length === HERO_COUNT + 1
        && heroOptions[0].value === ''
        && heroOptions.some((opt) => opt.textContent === FIRST_HERO.name),
        heroOptions.length + ' option / kỳ vọng ' + (HERO_COUNT + 1));

    const laneOptions = member.el('bs-lane').options.map((opt) => opt.value);
    check('select#bs-lane có 4 đường + placeholder rỗng',
        laneOptions.length === 5 && laneOptions[0] === ''
        && ['Đường Rồng', 'Rừng', 'Đường Giữa', 'Đường Trên'].every((lane) => laneOptions.includes(lane)),
        JSON.stringify(laneOptions));

    const gridsOk = [0, 1, 2].every((phase) => itemsGrid(member, phase)
        && checkboxes(member, phase).length === ITEM_COUNT);
    check('3 giai đoạn đều có lưới trang bị đủ số trang bị', gridsOk);

    /* ---------- 3. Giới hạn chọn trang bị ---------- */
    section('3. Giới hạn chọn trang bị');

    const sel = await openSubmit({ login: USER_USERNAME, storage: new Map() });

    check('chọn 3 trang bị trong 1 giai đoạn OK, cái thứ 4 bị chặn',
        checkItem(sel, 0, 101) && checkItem(sel, 0, 102) && checkItem(sel, 0, 103)
        && checkItem(sel, 0, 104) === false && previewItemCount(sel) === 3,
        'xem trước ' + previewItemCount(sel) + ' item');

    check('chọn trùng trong cùng một giai đoạn không nhân đôi',
        checkItem(sel, 1, 105) && checkItem(sel, 1, 105) && previewItemCount(sel) === 4,
        'xem trước ' + previewItemCount(sel) + ' item');

    const totalCap = await openSubmit({ login: USER_USERNAME, storage: new Map() });
    checkItem(totalCap, 0, 101); checkItem(totalCap, 0, 102); checkItem(totalCap, 0, 103);
    checkItem(totalCap, 1, 104); checkItem(totalCap, 1, 105); checkItem(totalCap, 1, 106);
    check('tổng tối đa 6: cái thứ 7 bị chặn',
        checkItem(totalCap, 2, 107) === false && previewItemCount(totalCap) === 6,
        'xem trước ' + previewItemCount(totalCap) + ' item');

    const cross = await openSubmit({ login: USER_USERNAME, storage: new Map() });
    check('cùng một trang bị chọn ở 2 giai đoạn đều được tính (KHÔNG chặn trùng xuyên giai đoạn)',
        checkItem(cross, 0, 101) && checkItem(cross, 1, 101) && previewItemCount(cross) === 2,
        'xem trước ' + previewItemCount(cross) + ' item');

    /* ---------- 4. Validate khi submit ---------- */
    section('4. Validate khi submit');

    const val = await openSubmit({ login: USER_USERNAME, storage: new Map() });
    injectErrorNodes(val);

    await submitForm(val);
    check('để trống: báo lỗi ở p[data-error-for="hero"] và KHÔNG lưu',
        errorNode(val, 'hero').hidden === false
        && /chọn tướng/i.test(errorNode(val, 'hero').textContent)
        && submissionsOf(val).length === 0,
        JSON.stringify(submissionsOf(val)));

    fillRequired(val, { heroId: FIRST_HERO.id, name: 'A' });
    await submitForm(val);
    check('tên < 2 ký tự: báo lỗi ở p[data-error-for="name"] và KHÔNG lưu',
        errorNode(val, 'name').hidden === false && submissionsOf(val).length === 0);

    fillRequired(val, { name: 'Build hợp lệ', playstyle: 'ngắn' });
    await submitForm(val);
    const shortPlay = errorNode(val, 'playstyle').hidden === false && submissionsOf(val).length === 0;

    fillRequired(val, { name: 'Build hợp lệ', playstyle: 'x'.repeat(501) });
    await submitForm(val);
    check('lối chơi quá ngắn hoặc quá dài: báo lỗi playstyle và KHÔNG lưu',
        shortPlay && errorNode(val, 'playstyle').hidden === false && submissionsOf(val).length === 0);

    fillRequired(val);
    checkItem(val, 0, 101); checkItem(val, 0, 102);
    await submitForm(val);
    check('ít hơn 3 trang bị: bị chặn (alert) và KHÔNG lưu',
        val.alerts.some((message) => /3 đến 6 trang bị/i.test(message)) && submissionsOf(val).length === 0,
        JSON.stringify(val.alerts));

    /* ---------- 5. Gửi hợp lệ ---------- */
    section('5. Gửi hợp lệ');

    const okPage = await openSubmit({ login: USER_USERNAME, storage: new Map() });
    fillRequired(okPage, { name: 'Build Test Gửi', lane: 'Đường Giữa', skillOrder: '1 > 2 > 1' });
    checkItem(okPage, 0, 101); checkItem(okPage, 0, 102); checkItem(okPage, 1, 103);
    okPage.el('bs-tips-list').querySelectorAll('input')[0].value = 'Mẹo hay';
    await submitForm(okPage);

    const savedList = submissionsOf(okPage);
    check('lưu đúng 1 bản ghi với status "pending", author và tướng/đường/tên đúng',
        savedList.length === 1
        && savedList[0].status === 'pending'
        && savedList[0].author === USER_USERNAME
        && Number(savedList[0].heroId) === Number(FIRST_HERO.id)
        && savedList[0].lane === 'Đường Giữa'
        && savedList[0].name === 'Build Test Gửi',
        JSON.stringify(savedList[0]));

    const record = savedList[0] || {};
    check('trang bị gộp và 3 giai đoạn đúng tên + đúng trang bị',
        JSON.stringify(record.items) === JSON.stringify([101, 102, 103])
        && Array.isArray(record.phases) && record.phases.length === 3
        && record.phases.map((phase) => phase.name).join(',') === 'Đầu trận,Giữa trận,Cuối trận'
        && JSON.stringify(record.phases[0].items) === JSON.stringify([101, 102])
        && JSON.stringify(record.phases[1].items) === JSON.stringify([103]),
        JSON.stringify(record.phases));

    check('lưu skillOrder và tips đúng',
        record.skillOrder === '1 > 2 > 1'
        && JSON.stringify(record.tips) === JSON.stringify(['Mẹo hay']),
        JSON.stringify({ skillOrder: record.skillOrder, tips: record.tips }));

    check('khung #build-submit-result hiện và form ẩn',
        okPage.el('build-submit-result').hidden === false
        && /Đã gửi/.test(okPage.el('build-submit-result').innerHTML)
        && okPage.el('build-submit-form').hidden === true);

    /* ---------- 6. Giới hạn 3 bản chờ mỗi người ---------- */
    section('6. Giới hạn 3 bản pending mỗi người');

    const threePending = [
        submissionSeed('bs_8001', 'pending', { author: USER_USERNAME }),
        submissionSeed('bs_8002', 'pending', { author: USER_USERNAME }),
        submissionSeed('bs_8003', 'pending', { author: USER_USERNAME }),
    ];
    const seededStorage = storageWithSubmissions(threePending);

    const limitPage = await openSubmit({ login: USER_USERNAME, storage: seededStorage });
    fillRequired(limitPage);
    checkItem(limitPage, 0, 101); checkItem(limitPage, 0, 102); checkItem(limitPage, 1, 103);
    await submitForm(limitPage);
    check('đã có 3 bản pending: lần gửi thứ 4 bị chặn, vẫn đúng 3 bản',
        limitPage.alerts.some((message) => /3 build đang chờ duyệt/i.test(message))
        && submissionsOf(limitPage).length === 3,
        JSON.stringify(limitPage.alerts));

    const otherPage = await openSubmit({ login: OTHER_USERNAME, storage: seededStorage });
    fillRequired(otherPage, { name: 'Build của demo' });
    checkItem(otherPage, 0, 101); checkItem(otherPage, 0, 102); checkItem(otherPage, 1, 103);
    await submitForm(otherPage);
    const afterOther = submissionsOf(otherPage);
    check('người dùng khác (demo) vẫn gửi được thành 4 bản, bản mới thuộc demo',
        afterOther.length === 4
        && afterOther[afterOther.length - 1].author === OTHER_USERNAME
        && afterOther[afterOther.length - 1].name === 'Build của demo',
        afterOther.length + ' bản');

    /* ---------- 7. Chống XSS ---------- */
    section('7. Chống XSS ở phần xem trước');

    const evilItems = [
        { id: 501, name: '<b>x</b>', alias: 'x', image: '', type: 'Công', price: 1 },
        { id: 502, name: '<script>alert(1)</script>', alias: 'y', image: '', type: 'Công', price: 1 },
        { id: 503, name: 'Trang bị thường', alias: 'z', image: '', type: 'Công', price: 1 },
    ];
    const xssPage = await openSubmit({
        login: USER_USERNAME,
        storage: new Map(),
        data: { 'items.json': evilItems },
    });
    checkItem(xssPage, 0, 501); checkItem(xssPage, 1, 502); checkItem(xssPage, 2, 503);
    const previewHtml = xssPage.el('bs-items-preview').innerHTML;
    check('tên trang bị chứa thẻ HTML bị escape, không tạo markup thật',
        previewHtml.includes('&lt;b&gt;') && previewHtml.includes('&lt;script&gt;')
        && !previewHtml.includes('<script>alert(1)</script>'),
        previewHtml.slice(0, 160));
    check('khớp escapeHtml() của dự án',
        previewHtml.includes(xssPage.runInPage("escapeHtml('<b>x</b>')")),
        xssPage.runInPage("escapeHtml('<b>x</b>')"));

    /* ---------- 8. Tài khoản bị khóa ---------- */
    section('8. Tài khoản bị khóa (banned)');

    const bannedStorage = new Map([['aov_current_user', USER_USERNAME]]);
    const bannedPage = await openSubmit({
        login: USER_USERNAME,
        storage: bannedStorage,
        seed: { users: [
            { username: USER_USERNAME, displayName: 'Fan', role: 'user', banned: true, bannedReason: 'Thử' },
        ] },
    });
    check('tài khoản bị khóa: form ẩn, gate hiện',
        bannedPage.el('build-submit-form').hidden === true && bannedPage.el('build-submit-gate').hidden === false);
    check('tài khoản bị khóa: không gửi được (không lưu gì)',
        submissionsOf(bannedPage).length === 0);

    /* ---------- 9. Kiểm duyệt từ cấm ---------- */
    section('9. Kiểm duyệt từ cấm');

    const modPage = await openSubmit({ login: USER_USERNAME, storage: new Map() });
    modPage.runInPage('getBannedEntries = function () { return getDefaultBannedEntries(); };');
    fillRequired(modPage, { name: 'Build sạch sẽ', playstyle: 'Lối chơi có từ địt trong câu cho đủ dài.' });
    checkItem(modPage, 0, 101); checkItem(modPage, 0, 102); checkItem(modPage, 1, 103);
    await submitForm(modPage);
    check('có getBannedEntries: nội dung chứa từ cấm bị chặn, KHÔNG lưu',
        modPage.alerts.some((message) => /không phù hợp/i.test(message)) && submissionsOf(modPage).length === 0,
        JSON.stringify(modPage.alerts));

    const plainMod = await openSubmit({ login: USER_USERNAME, storage: new Map() });
    fillRequired(plainMod, { name: 'Build sạch sẽ', playstyle: 'Lối chơi có từ địt trong câu cho đủ dài.' });
    checkItem(plainMod, 0, 101); checkItem(plainMod, 0, 102); checkItem(plainMod, 1, 103);
    await submitForm(plainMod);
    check('trang thật (getBannedEntries không được nạp): có gọi classifyContent nhưng KHÔNG chặn được từ cấm',
        plainMod.runInPage('typeof classifyContent') === 'function'
        && plainMod.runInPage('typeof getBannedEntries') === 'undefined'
        && submissionsOf(plainMod).length === 1,
        'classifyContent=' + plainMod.runInPage('typeof classifyContent')
        + ', getBannedEntries=' + plainMod.runInPage('typeof getBannedEntries'));

    /* ---------- 10. Admin: mục Build chờ duyệt ---------- */
    section('10. Admin - mục "Build chờ duyệt"');

    const listApi = makeApi();
    const adminList = await openAdminPending({ login: ADMIN_USERNAME, storage: storageWithSubmissions(pendingSeeds()), api: listApi });

    check('tab Chờ duyệt có cả mục "Bài viết chờ duyệt" cũ lẫn "Build chờ duyệt"',
        adminList.el('admin-panel').innerHTML.includes('data-admin-section="pending-posts"')
        && adminList.el('admin-panel').innerHTML.includes('data-admin-section="pending-builds"'));

    check('chỉ liệt kê bản "pending" (2 dòng), không hiện bản đã duyệt',
        reviewRowCount(adminList) === 2 && !reviewBodyHtml(adminList).includes('Build đã duyệt'),
        reviewRowCount(adminList) + ' dòng');

    check('đếm đúng "Đang chờ: 2 · Đã duyệt: 1 · Đã từ chối: 0"',
        reviewBodyHtml(adminList).includes('Đang chờ: 2')
        && reviewBodyHtml(adminList).includes('Đã duyệt: 1')
        && reviewBodyHtml(adminList).includes('Đã từ chối: 0'));

    check('tên/lối chơi chứa thẻ HTML bị escape trong hàng admin (chống XSS)',
        reviewBodyHtml(adminList).includes('&lt;b&gt;')
        && reviewBodyHtml(adminList).includes('&lt;script&gt;')
        && !reviewBodyHtml(adminList).includes('<script>alert(1)</script>'));

    /* ---------- 11. Duyệt build ---------- */
    section('11. Duyệt build (AdminBuildReview.approveSubmission)');

    const approveApi = makeApi();
    const approvePage = await openAdminPending({
        login: ADMIN_USERNAME,
        storage: storageWithSubmissions(pendingSeeds()),
        api: approveApi,
    });
    const approveResult = await approvePage.runInPage("AdminBuildReview.approveSubmission('bs_9001')");
    check('duyệt trả true và builds.json tăng đúng 1 build với id = max+1',
        approveResult === true
        && approveApi.builds.length === BUILD_START + 1
        && Number(approveApi.builds[approveApi.builds.length - 1].id) === NEXT_BUILD_ID,
        'kết quả=' + approveResult + ', builds=' + approveApi.builds.length + ', id=' + NEXT_BUILD_ID);

    const created = approveApi.builds[approveApi.builds.length - 1] || {};
    const schemaKeys = ['id', 'heroId', 'name', 'lane', 'playstyle', 'items', 'description', 'phases',
        'skillOrder', 'tips', 'situational', 'counters', 'notes'];
    check('build mới đúng schema builds.json, KHÔNG có author/status',
        JSON.stringify(Object.keys(created).sort()) === JSON.stringify(schemaKeys.slice().sort())
        && created.description === '' && Array.isArray(created.phases) && created.phases.length === 3
        && !('author' in created) && !('status' in created),
        JSON.stringify(Object.keys(created)));

    const approvedSeed = (approvePage.readKey(SUBMISSIONS_KEY) || []).find((entry) => entry.id === 'bs_9001') || {};
    check('bản gửi chuyển "approved" kèm reviewedBy/reviewedAt/buildId',
        approvedSeed.status === 'approved'
        && approvedSeed.reviewedBy === ADMIN_USERNAME
        && typeof approvedSeed.reviewedAt === 'string' && approvedSeed.reviewedAt.length > 0
        && Number(approvedSeed.buildId) === NEXT_BUILD_ID,
        JSON.stringify(approvedSeed));

    const approveLog = approvePage.readKey('aov_admin_log') || [];
    check('aov_admin_log ghi "duyet-build" cho build mới',
        approveLog.some((entry) => entry.action === 'duyet-build' && Number(entry.targetId) === NEXT_BUILD_ID),
        JSON.stringify(approveLog.map((entry) => entry.action + ':' + entry.targetId)));

    /* ---------- 12. Từ chối build ---------- */
    section('12. Từ chối build (AdminBuildReview.rejectSubmission)');

    const rejectApi = makeApi();
    const rejectPage = await openAdminPending({
        login: ADMIN_USERNAME,
        storage: storageWithSubmissions(pendingSeeds()),
        api: rejectApi,
    });

    const rejectWithReason = await rejectPage.runInPage("AdminBuildReview.rejectSubmission('bs_9001', 'Nội dung sơ sài')");
    const rejected1 = (rejectPage.readKey(SUBMISSIONS_KEY) || []).find((entry) => entry.id === 'bs_9001') || {};
    check('từ chối CÓ lý do: status "rejected", rejectReason đúng, builds không đổi',
        rejectWithReason === true && rejected1.status === 'rejected'
        && rejected1.rejectReason === 'Nội dung sơ sài'
        && rejected1.reviewedBy === ADMIN_USERNAME
        && rejectApi.builds.length === BUILD_START,
        JSON.stringify(rejected1));

    const rejectNoReason = await rejectPage.runInPage("AdminBuildReview.rejectSubmission('bs_9002', '')");
    const rejected2 = (rejectPage.readKey(SUBMISSIONS_KEY) || []).find((entry) => entry.id === 'bs_9002') || {};
    check('từ chối KHÔNG lý do: status "rejected" nhưng không có rejectReason',
        rejectNoReason === true && rejected2.status === 'rejected' && !('rejectReason' in rejected2),
        JSON.stringify(rejected2));

    /* ---------- 13. Chặn quyền ---------- */
    section('13. Chặn quyền duyệt/từ chối');

    const userApi = makeApi();
    const userAdmin = await openAdminPending({
        login: USER_USERNAME,
        storage: storageWithSubmissions(pendingSeeds()),
        api: userApi,
    });
    const userApprove = await userAdmin.runInPage("AdminBuildReview.approveSubmission('bs_9001')");
    const userReject = await userAdmin.runInPage("AdminBuildReview.rejectSubmission('bs_9001', 'x')");
    check('user thường: approve/reject trả false, builds và status không đổi',
        userApprove === false && userReject === false
        && userApi.builds.length === BUILD_START
        && ((userAdmin.readKey(SUBMISSIONS_KEY) || []).find((entry) => entry.id === 'bs_9001') || {}).status === 'pending');

    const guestApi = makeApi();
    const guestAdmin = await openAdminPending({
        storage: storageWithSubmissions(pendingSeeds()),
        api: guestApi,
    });
    const guestApprove = await guestAdmin.runInPage("AdminBuildReview.approveSubmission('bs_9001')");
    check('khách: approve trả false, builds không đổi',
        guestApprove === false && guestApi.builds.length === BUILD_START);

    /* ---------- 14. Duyệt khi API ghi lỗi ---------- */
    section('14. Duyệt khi API /api/builds ghi lỗi');

    const failApi = makeApi();
    const failPage = await openAdminPending({
        login: ADMIN_USERNAME,
        storage: storageWithSubmissions(pendingSeeds()),
        api: failApi,
    });
    const originalFetch = failPage.ctx.fetch;
    failPage.ctx.fetch = async (url, options) => {
        if (String(url).indexOf('/api/builds') !== -1 && options
            && String(options.method).toUpperCase() === 'PUT') {
            return { ok: false, status: 500, json: async () => ({ error: 'boom' }), text: async () => 'boom' };
        }
        return originalFetch(url, options);
    };

    const failResult = await failPage.runInPage("AdminBuildReview.approveSubmission('bs_9001')");
    const failSeed = (failPage.readKey(SUBMISSIONS_KEY) || []).find((entry) => entry.id === 'bs_9001') || {};
    check('PUT lỗi: approve trả false, bản gửi VẪN "pending", builds không đổi',
        failResult === false && failSeed.status === 'pending' && failApi.builds.length === BUILD_START);
    check('PUT lỗi: vùng trạng thái báo "Không ghi được builds.json"',
        reviewStatusText(failPage).includes('Không ghi được builds.json'),
        reviewStatusText(failPage));

    /* ---------- 15. Bản gửi có tham chiếu không còn tồn tại ---------- */
    section('15. Bản gửi có tướng/trang bị không còn tồn tại');

    const badSeeds = [
        submissionSeed('bs_7001', 'pending', { heroId: 99999, name: 'Tướng lạ' }),
        submissionSeed('bs_7002', 'pending', { items: [88888], name: 'Trang bị lạ' }),
    ];
    const badApi = makeApi();
    const badPage = await openAdminPending({
        login: ADMIN_USERNAME,
        storage: storageWithSubmissions(badSeeds),
        api: badApi,
    });
    const badBody = reviewBody(badPage);
    const badHeroButton = badBody.querySelector('[data-build-review-approve="bs_7001"]');
    check('nút Duyệt của bản sai tướng bị disabled',
        badHeroButton && badHeroButton.getAttribute('disabled') !== null,
        badHeroButton ? 'disabled=' + badHeroButton.getAttribute('disabled') : 'không tìm thấy nút');

    const badHeroResult = await badPage.runInPage("AdminBuildReview.approveSubmission('bs_7001')");
    const badItemResult = await badPage.runInPage("AdminBuildReview.approveSubmission('bs_7002')");
    check('duyệt bản sai tướng/trang bị bị chặn, builds không đổi',
        badHeroResult === false && badItemResult === false && badApi.builds.length === BUILD_START);

    /* ---------- 16. Bấm nút trên DOM thật ---------- */
    section('16. Bấm nút Duyệt / Từ chối trên DOM');

    const clickApi = makeApi();
    const clickPage = await openAdminPending({
        login: ADMIN_USERNAME,
        storage: storageWithSubmissions(pendingSeeds()),
        api: clickApi,
    });

    const approveButton = reviewBody(clickPage).querySelector('[data-build-review-approve="bs_9001"]');
    fire(approveButton, 'click', clickPage.doc);
    await clickPage.settled();
    await clickPage.settled();
    check('bấm Duyệt: builds +1 và dòng bs_9001 biến khỏi danh sách chờ',
        clickApi.builds.length === BUILD_START + 1
        && !reviewBodyHtml(clickPage).includes('data-build-review-row="bs_9001"'),
        clickApi.builds.length + ' build, dòng=' + reviewRowCount(clickPage));

    const rejectButton = reviewBody(clickPage).querySelector('[data-build-review-reject="bs_9002"]');
    const reasonInput = reviewBody(clickPage).querySelector('[data-build-review-reason="bs_9002"]');
    if (reasonInput) reasonInput.value = 'Không đạt';
    fire(rejectButton, 'click', clickPage.doc);
    await clickPage.settled();
    await clickPage.settled();
    const clickedRejected = (clickPage.readKey(SUBMISSIONS_KEY) || []).find((entry) => entry.id === 'bs_9002') || {};
    check('bấm Từ chối: bản gửi "rejected" kèm lý do và dòng biến khỏi danh sách',
        clickedRejected.status === 'rejected' && clickedRejected.rejectReason === 'Không đạt'
        && !reviewBodyHtml(clickPage).includes('data-build-review-row="bs_9002"'));

    /* ---------- Tổng kết ---------- */
    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})().catch((error) => {
    console.error('\nLỗi khi chạy test:', error);
    process.exitCode = 1;
});
