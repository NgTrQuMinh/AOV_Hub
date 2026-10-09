/**
 * Test trang Quản lý tướng (src/pages/hero-admin.html + src/js/hero-admin.js + src/js/heroData.js).
 *
 * Chạy code thật của dự án trong mini-dom: dựng trang thật, nạp script thật,
 * không mock logic. Chỉ "reload" mô phỏng bằng cách mở lại trang với cùng Map localStorage.
 *
 * Phạm vi kiểm tra:
 *   1. Guard trang: khách bị đưa về Login, user thường bị đưa về trang chủ kèm cảnh báo,
 *      admin thì vào được và thấy form + bảng tướng.
 *   2. Link "Quản lý tướng" trên Header chỉ hiện với admin.
 *   3. Form thêm tướng: vai trò là radio (mỗi tướng chỉ chọn được 1), mở sẵn
 *      đúng 3 ô kỹ năng cố định (không nút Thêm / nút ✕), loại chiêu khoá theo
 *      thứ tự dòng Chiêu 1/2/3 (select disabled — không tự chọn được),
 *      ô chỉ số / hồi chiêu có max theo giới hạn;
 *      validate chối thiếu tên / thiếu vai trò / hơn 1 vai trò / chỉ số vượt
 *      giới hạn / loại chiêu sai thứ tự dòng / hồi chiêu >= 60s / quá 3 kỹ năng
 *      thì báo lỗi và KHÔNG thêm tướng.
 *   4. Thêm tướng mới -> nằm trong file heroes.json (qua API), hiện ở bảng quản trị, ở trang
 *      Danh sách tướng và trang Chi tiết tướng.
 *   4b. Chọn ảnh từ File Explorer: ô ảnh readOnly + input file accept image/*,
 *       FileReader ghi data URL vào ô, ảnh bị cắt giữa về tỉ lệ 1:1 trước khi lưu,
 *       ảnh xem trước, nút Xoá ảnh, file không phải ảnh thì báo lỗi.
 *       imageUrl() hiểu data URL.
 *   5. Sửa tướng -> giữ nguyên id, đổi nội dung trong file heroes.json và bảng.
 *   6. Xoá tướng (có confirm) -> mất khỏi file heroes.json + bảng, dọn yêu thích /
 *      lịch sử / so sánh, không bị "sống lại" khi mở lại trang.
 *   7. createHero()/deleteHero() chặn đúng ở tầng dữ liệu với tài khoản không phải admin.
 *
 * Chạy: node tools/test-hero-admin.cjs
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, fire, unescapeHtml } = require('./mini-dom.cjs');

const HERO_ADMIN_PAGE = 'src/pages/hero-admin.html';
const HEROES_PAGE = 'src/pages/heroes.html';
const HERO_DETAIL_PAGE = 'src/pages/hero-detail.html';
const FEED_PAGE = 'src/pages/feed.html';

const HEROES_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/heroes.json'), 'utf8'));

// Số tướng có trên đĩa và id kế tiếp. Test chạy theo số liệu thật của heroes.json
// chứ không khoá cứng 30/31, nên thêm bớt tướng vào file vẫn qua được.
const HEROES_START = HEROES_JSON.length;
const HEROES_START_MAX_ID = Math.max(...HEROES_JSON.map((hero) => hero.id));
const NEXT_HERO_ID = HEROES_START_MAX_ID + 1;
const COUNT_AFTER_ADD = HEROES_START + 1;

/**
 * "File" heroes.json dùng chung giữa các lần mở trang. API /api/heroes (mô phỏng
 * trong mini-dom) đọc/ghi vào đây, nên tướng thêm/sửa/xoá giữ nguyên qua các lần "reload".
 */
const api = { heroes: JSON.parse(JSON.stringify(HEROES_JSON)) };

/** Tài khoản quản trị viên trong data/users.json */
const ADMIN_USERNAME = 'admin';
/** Tài khoản thường, KHÔNG có quyền quản trị */
const OTHER_USERNAME = 'aovfan';

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

/** Mở một trang bất kỳ và chờ render xong. */
async function open(page, options = {}) {
    const loaded = loadPage(Object.assign({ page, api }, options));
    loaded.run();
    await loaded.settled();
    return loaded;
}

const openHeroAdmin = (options) => open(HERO_ADMIN_PAGE, options);
const openFeed = (options) => open(FEED_PAGE, options);

const formHtml = (page) => page.el('hero-admin-form').innerHTML;
const tableHtml = (page) => page.el('hero-admin-list').innerHTML;
const countText = (page) => page.el('hero-admin-count').textContent;
const plainTable = (page) => unescapeHtml(tableHtml(page));

/** Toàn bộ tướng đang có trong "file" heroes.json (dùng chung qua API). */
const storedHeroes = () => api.heroes;

/** Số dòng tướng trong bảng quản trị (số nút Sửa = số dòng). */
function tableRowCount(page) {
    return tableHtml(page).split('data-hero-edit=').length - 1;
}

/**
 * Điền form thêm / sửa tướng (đọc ghi trực tiếp lên node, như người dùng gõ).
 * Trả về thẻ <form> để test bấm submit.
 */
function fillHeroForm(page, values) {
    const form = page.el('hero-admin-form').querySelector('#hero-form');
    if (!form) throw new Error('Không tìm thấy form #hero-form');

    form.querySelector('#hero-name').value = values.name === undefined ? '' : values.name;
    form.querySelector('#hero-image').value = values.image || '';
    form.querySelector('#hero-difficulty').value = String(values.difficulty === undefined ? 2 : values.difficulty);
    form.querySelector('#hero-build').value = values.build || '';

    ['hp', 'attack', 'defense', 'speed'].forEach((key) => {
        const input = form.querySelector(`#hero-stat-${key}`);
        const value = values.stats && values.stats[key];
        input.value = value === undefined ? '' : String(value);
    });

    // Chọn vai trò kiểu radio: chỉ tick phần tử khớp ĐẦU TIÊN, phần còn lại
    // tự bỏ tick (trình duyệt làm việc này khi 2 radio cùng name).
    let assignedRole = false;
    form.querySelectorAll('input[name="hero-role"]').forEach((input) => {
        const shouldCheck = !assignedRole && (values.roles || []).includes(input.value);
        input.checked = shouldCheck;
        if (shouldCheck) assignedRole = true;
    });

    if (values.skill) {
        // Loại chiêu bị khoá theo vị trí dòng (select disabled) — người dùng
        // không gõ/đổi được nên test cũng không điền, giá trị tự là Chiêu 1.
        const row = form.querySelector('[data-skill-row]');
        row.querySelector('[data-skill-name]').value = values.skill.name || '';
        row.querySelector('[data-skill-desc]').value = values.skill.description || '';
        row.querySelector('[data-skill-cooldown]').value = values.skill.cooldown === undefined ? '' : String(values.skill.cooldown);
    }

    return form;
}

/** Bấm submit form và chờ trang xử lý xong. */
function submitForm(page, form) {
    fire(form, 'submit', page.doc);
    return page.settled();
}

/** Bắn sự kiện change lên input (ô chọn file ảnh) và chờ trang xử lý xong. */
function submitChange(page, input) {
    fire(input, 'change', page.doc);
    return page.settled();
}

/** HTML đã giải mã entity của form (để so với chuỗi tiếng Việt có dấu). */
const plainForm = (page) => unescapeHtml(formHtml(page));

/**
 * Nội dung khung lỗi / thông báo thành công (#hero-form-errors).
 * mini-dom: innerHTML sống trên node được gán, nên đọc đúng node con này
 * (innerHTML của box #hero-admin-form chỉ là chuỗi render lần cuối, không cập nhật).
 */
const formErrorsText = (page) => {
    const box = page.el('hero-admin-form').querySelector('#hero-form-errors');
    return box ? unescapeHtml(box.innerHTML) : '';
};

/* ================= Test ================= */

(async () => {
    /* ---------- 0. Dữ liệu mẫu ---------- */
    section('0. data/heroes.json có dữ liệu mẫu');

    check(`heroes.json có ${HEROES_START} tướng như cam kết`,
        HEROES_JSON.length === HEROES_START,
        HEROES_JSON.length + ' tướng');
    check('mọi tướng đều có id, name, role, stats, skills',
        HEROES_JSON.every((hero) => (
            hero.id && hero.name && Array.isArray(hero.role) && hero.stats && Array.isArray(hero.skills)
        )),
        JSON.stringify(HEROES_JSON.find((hero) => !(hero.id && hero.name && hero.role && hero.stats && hero.skills))));

    /* ---------- 1. Guard của trang quản lý tướng ---------- */
    section('1. Chặn truy cập trang Quản lý tướng');

    const guest = await openHeroAdmin({ storage: new Map() });
    check('khách chưa đăng nhập bị đưa về trang Login',
        guest.location.href.includes('/src/pages/login.html'),
        guest.location.href);
    check('khách không thấy form thêm tướng',
        !formHtml(guest).includes('id="hero-form"'),
        plainForm(guest).slice(0, 120));
    check('khách không thấy bảng danh sách tướng',
        !tableHtml(guest).includes('data-hero-edit'),
        tableHtml(guest).slice(0, 120));

    const stranger = await openHeroAdmin({ login: OTHER_USERNAME });
    check('user thường bị cảnh báo khi mở trang Quản lý tướng',
        stranger.alerts.some((message) => /không có quyền/i.test(message)),
        JSON.stringify(stranger.alerts));
    check('user thường bị chuyển về trang chủ',
        stranger.location.href === '/index.html',
        stranger.location.href);
    check('user thường không thấy form hay bảng quản trị',
        !formHtml(stranger).includes('id="hero-form"')
        && !tableHtml(stranger).includes('data-hero-edit'),
        tableHtml(stranger).slice(0, 120));

    let admin = await openHeroAdmin({ login: ADMIN_USERNAME });
    check('admin vào được trang (không bị điều hướng đi đâu)',
        admin.location.href === '/' + HERO_ADMIN_PAGE,
        admin.location.href);
    check('admin không bị cảnh báo khi vào trang', admin.alerts.length === 0, JSON.stringify(admin.alerts));
    check('admin thấy form thêm tướng',
        formHtml(admin).includes('id="hero-form"'),
        plainForm(admin).slice(0, 120));
    check('admin thấy bảng đủ số tướng trong heroes.json',
        tableRowCount(admin) === HEROES_JSON.length,
        tableRowCount(admin) + ' dòng');
    check('bảng quản trị có đủ các cột cần quản lý',
        ['ID', 'Tên tướng', 'Vai trò', 'Độ khó', 'Kỹ năng', 'Thao tác']
            .every((label) => tableHtml(admin).includes(`<th>${label}</th>`)),
        tableHtml(admin).slice(0, 300));
    check('bảng có đủ nút Sửa và nút Xóa',
        tableHtml(admin).split('data-hero-delete=').length - 1 === HEROES_JSON.length,
        tableHtml(admin).split('data-hero-delete=').length - 1 + ' nút Xóa');
    check('trang quản lý tướng không ném lỗi JavaScript',
        admin.errors.length === 0,
        admin.errors.join(' | '));

    /* ---------- 2. Link "Quản lý tướng" trên Header ---------- */
    section('2. Link "Quản lý tướng" trên Header chỉ hiện với admin');

    /*
     * mini-dom không nạp được public/partials/header.html (fetch trong mini-dom chỉ đọc
     * src/data/*.json) nên #account-area không tồn tại trong DOM. Vậy nên dựng một
     * phần tử giả rồi gọi đúng hàm thật updateAccountUI() của auth.js để kiểm tra
     * phần HTML mà hàm này sinh ra (cùng cách test-admin-page.cjs đang làm).
     */
    const accountAreaHtml = (page) => page.runInPage(`
        var accountArea = { innerHTML: '' };
        document.getElementById = (id) => (id === 'account-area' ? accountArea : null);
        updateAccountUI();
        accountArea.innerHTML;
    `);

    const adminHeader = accountAreaHtml(await openHeroAdmin({ login: ADMIN_USERNAME }));
    check('admin thấy link Quản lý tướng trên Header',
        adminHeader.includes('Quản lý tướng') && adminHeader.includes('/src/pages/hero-admin.html'),
        adminHeader.replace(/\s+/g, ' ').slice(0, 220));

    const userHeader = accountAreaHtml(await openFeed({ login: OTHER_USERNAME }));
    check('user thường không thấy link Quản lý tướng',
        !userHeader.includes('Quản lý tướng') && !userHeader.includes('/src/pages/hero-admin.html'),
        userHeader.replace(/\s+/g, ' ').slice(0, 220));

    const guestHeader = accountAreaHtml(await openFeed({ storage: new Map() }));
    check('khách không thấy link Quản lý tướng',
        !guestHeader.includes('Quản lý tướng') && guestHeader.includes('Đăng ký'));

    /* ---------- 3. Form thêm tướng + validate ---------- */
    section('3. Form thêm tướng: radio vai trò, 3 ô kỹ năng, giới hạn, validate');

    const setupForm = admin.el('hero-admin-form').querySelector('#hero-form');
    const roleInputs = setupForm.querySelectorAll('input[name="hero-role"]');
    check('các ô vai trò là radio (mỗi tướng chỉ chọn được 1)',
        roleInputs.length === 6 && roleInputs.every((input) => input.getAttribute('type') === 'radio'),
        roleInputs.map((input) => input.getAttribute('type')).join(','));
    check('form thêm mới chưa chọn vai trò nào',
        roleInputs.filter((input) => input.checked).length === 0,
        roleInputs.filter((input) => input.checked).length + ' vai trò');
    check('ô chỉ số có max theo giới hạn (Máu 9999, chỉ số kia 999)',
        formHtml(admin).includes('max="9999"') && formHtml(admin).includes('max="999"'),
        (formHtml(admin).match(/max="\d+"/g) || []).join(' '));
    check('ô hồi chiêu có max=59 (hồi chiêu phải nhỏ hơn 60 giây)',
        formHtml(admin).includes('max="59"'),
        (formHtml(admin).match(/max="\d+"/g) || []).join(' '));

    const typeSelect = setupForm.querySelector('[data-skill-type]');
    const optionValues = typeSelect ? typeSelect.options.map((option) => option.getAttribute('value')) : [];
    check('mở form là sẵn 3 ô kỹ năng trống',
        setupForm.querySelectorAll('[data-skill-row]').length === 3,
        setupForm.querySelectorAll('[data-skill-row]').length + ' dòng');
    check('ô loại chiêu bị khoá (select disabled) nhưng vẫn đủ 3 lựa chọn',
        Boolean(typeSelect) && typeSelect.tag === 'select'
        && typeSelect.getAttribute('disabled') !== null
        && JSON.stringify(optionValues) === JSON.stringify(['Chiêu 1', 'Chiêu 2', 'Chiêu 3']),
        typeSelect
            ? `${typeSelect.tag}, disabled=${typeSelect.getAttribute('disabled') !== null}: ${JSON.stringify(optionValues)}`
            : 'không có [data-skill-type]');

    const skillRows = setupForm.querySelectorAll('[data-skill-row]');
    check('loại chiêu hiện sẵn theo thứ tự dòng: Chiêu 1 / Chiêu 2 / Chiêu 3',
        skillRows.map((row) => row.querySelector('[data-skill-type]').value).join(' | ') === 'Chiêu 1 | Chiêu 2 | Chiêu 3',
        skillRows.map((row) => row.querySelector('[data-skill-type]').value).join(' | '));

    check('không còn nút Thêm kỹ năng lẫn nút ✕ (3 dòng cố định, không thêm/bớt dòng)',
        !setupForm.querySelector('[data-hero-add-skill]')
        && skillRows.every((row) => !row.querySelector('[data-hero-remove-skill]'))
        && skillRows.length === 3,
        `add=${Boolean(setupForm.querySelector('[data-hero-add-skill]'))}, rows=${skillRows.length}`);

    const invalidForm = fillHeroForm(admin, {
        name: '',
        roles: [],
        stats: { hp: 'abc', attack: -5, defense: '', speed: '' },
    });
    await submitForm(admin, invalidForm);

    check('thiếu tên + thiếu vai trò + chỉ số sai thì báo lỗi',
        formErrorsText(admin).includes('Tên tướng không được để trống')
        && formErrorsText(admin).includes('Bạn phải chọn ít nhất một vai trò')
        && formErrorsText(admin).includes('Chỉ số "hp"'),
        formErrorsText(admin).slice(0, 400));
    check('không thêm được tướng khi dữ liệu lỗi',
        storedHeroes(admin).length === HEROES_JSON.length,
        storedHeroes(admin).length + ' tướng');
    check('bảng vẫn giữ nguyên số dòng',
        tableRowCount(admin) === HEROES_JSON.length,
        tableRowCount(admin) + ' dòng');

    const multiRole = admin.runInPage(`
        validateHeroForm({
            name: 'Test Vai Trò',
            roles: ['Xạ thủ', 'Sát thủ'],
            difficulty: 2,
            stats: { hp: 900, attack: 90, defense: 90, speed: 90 },
            skills: [],
            recommendedBuild: '',
        })
    `);
    check('validateHeroForm chối khi dữ liệu có 2 vai trò',
        multiRole && multiRole.valid === false
        && multiRole.errors.some((error) => error.includes('một vai trò')),
        JSON.stringify(multiRole && multiRole.errors));

    const overStat = admin.runInPage(`
        validateHeroForm({
            name: 'Test Chỉ Số',
            roles: ['Xạ thủ'],
            difficulty: 2,
            stats: { hp: 900, attack: 1000, defense: 90, speed: 90 },
            skills: [],
            recommendedBuild: '',
        })
    `);
    check('Sát thương = 1000 bị chối (phải nhỏ hơn 1000)',
        overStat && overStat.valid === false
        && overStat.errors.some((error) => error.includes('Chỉ số "attack" phải nhỏ hơn 1000')),
        JSON.stringify(overStat && overStat.errors));

    const overHp = admin.runInPage(`
        validateHeroForm({
            name: 'Test Máu',
            roles: ['Xạ thủ'],
            difficulty: 2,
            stats: { hp: 10000, attack: 90, defense: 90, speed: 90 },
            skills: [],
            recommendedBuild: '',
        })
    `);
    check('Máu = 10000 bị chối (phải nhỏ hơn 10000)',
        overHp && overHp.valid === false
        && overHp.errors.some((error) => error.includes('Chỉ số "hp" phải nhỏ hơn 10000')),
        JSON.stringify(overHp && overHp.errors));

    const badTypeSkill = admin.runInPage(`
        validateHeroForm({
            name: 'Test Loại Chiêu',
            roles: ['Xạ thủ'],
            difficulty: 2,
            stats: { hp: 900, attack: 90, defense: 90, speed: 90 },
            skills: [{ name: 'Chiêu Lạ', type: 'Chiêu 4', description: '', cooldown: '' }],
            recommendedBuild: '',
        })
    `);
    check('loại chiêu lạ (ngoài Chiêu 1/2/3) thì bị chối',
        badTypeSkill && badTypeSkill.valid === false
        && badTypeSkill.errors.some((error) => error.includes('Loại của kỹ năng')),
        JSON.stringify(badTypeSkill && badTypeSkill.errors));

    const swappedTypeSkill = admin.runInPage(`
        validateHeroForm({
            name: 'Test Sai Thứ Tự',
            roles: ['Xạ thủ'],
            difficulty: 2,
            stats: { hp: 900, attack: 90, defense: 90, speed: 90 },
            skills: [{ name: 'Chiêu Trật Tự', type: 'Chiêu 2', description: '', cooldown: 3 }],
            recommendedBuild: '',
        })
    `);
    check('loại chiêu đúng loại nhưng sai thứ tự dòng vẫn bị chối (dòng 1 phải là Chiêu 1)',
        swappedTypeSkill && swappedTypeSkill.valid === false
        && swappedTypeSkill.errors.some((error) => error.includes('Loại của kỹ năng') && error.includes('Chiêu 1')),
        JSON.stringify(swappedTypeSkill && swappedTypeSkill.errors));

    const overCooldown = admin.runInPage(`
        validateHeroForm({
            name: 'Test Hồi Chiêu',
            roles: ['Xạ thủ'],
            difficulty: 2,
            stats: { hp: 900, attack: 90, defense: 90, speed: 90 },
            skills: [{ name: 'Chiêu Nhanh', type: 'Chiêu 1', description: '', cooldown: 60 }],
            recommendedBuild: '',
        })
    `);
    check('hồi chiêu = 60 giây bị chối (phải nhỏ hơn 60)',
        overCooldown && overCooldown.valid === false
        && overCooldown.errors.some((error) => error.includes('Hồi chiêu') && error.includes('nhỏ hơn 60')),
        JSON.stringify(overCooldown && overCooldown.errors));

    const edgeCooldown = admin.runInPage(`
        validateHeroForm({
            name: 'Test Hồi Chiêu Hợp Lệ',
            roles: ['Xạ thủ'],
            difficulty: 2,
            stats: { hp: 900, attack: 90, defense: 90, speed: 90 },
            skills: [{ name: 'Chiêu Chậm', type: 'Chiêu 1', description: '', cooldown: 59 }],
            recommendedBuild: '',
        })
    `);
    check('hồi chiêu = 59 giây vẫn hợp lệ',
        Boolean(edgeCooldown && edgeCooldown.valid),
        JSON.stringify(edgeCooldown && edgeCooldown.errors));

    const threeSkills = admin.runInPage(`
        validateHeroForm({
            name: 'Test 3 Chiêu',
            roles: ['Xạ thủ'],
            difficulty: 2,
            stats: { hp: 900, attack: 90, defense: 90, speed: 90 },
            skills: [
                { name: 'Chiêu A', type: 'Chiêu 1', description: '', cooldown: 2 },
                { name: 'Chiêu B', type: 'Chiêu 2', description: '', cooldown: 4 },
                { name: 'Chiêu C', type: 'Chiêu 3', description: '', cooldown: 6 },
            ],
            recommendedBuild: '',
        })
    `);
    check('đúng 3 kỹ năng vẫn hợp lệ',
        Boolean(threeSkills && threeSkills.valid),
        JSON.stringify(threeSkills && threeSkills.errors));

    const fourSkills = admin.runInPage(`
        validateHeroForm({
            name: 'Test 4 Chiêu',
            roles: ['Xạ thủ'],
            difficulty: 2,
            stats: { hp: 900, attack: 90, defense: 90, speed: 90 },
            skills: [
                { name: 'Chiêu A', type: 'Chiêu 1', description: '', cooldown: 2 },
                { name: 'Chiêu B', type: 'Chiêu 2', description: '', cooldown: 4 },
                { name: 'Chiêu C', type: 'Chiêu 3', description: '', cooldown: 6 },
                { name: 'Chiêu D', type: 'Chiêu 1', description: '', cooldown: 8 },
            ],
            recommendedBuild: '',
        })
    `);
    check('4 kỹ năng bị chối (một tướng tối đa 3 chiêu)',
        fourSkills && fourSkills.valid === false
        && fourSkills.errors.some((error) => error.includes('tối đa 3 kỹ năng')),
        JSON.stringify(fourSkills && fourSkills.errors));

    const overLimitForm = fillHeroForm(admin, {
        name: 'Test Vượt Chỉ Số',
        roles: ['Xạ thủ'],
        stats: { hp: 900, attack: 1000, defense: 90, speed: 90 },
    });
    await submitForm(admin, overLimitForm);

    check('form báo lỗi khi chỉ số chạm giới hạn trên',
        formErrorsText(admin).includes('Chỉ số "attack" phải nhỏ hơn 1000'),
        formErrorsText(admin).slice(0, 300));
    check('không thêm tướng khi chỉ số vượt giới hạn',
        storedHeroes(admin).length === HEROES_JSON.length,
        storedHeroes(admin).length + ' tướng');
    check('bảng vẫn giữ nguyên số dòng sau lần thử vượt chỉ số',
        tableRowCount(admin) === HEROES_JSON.length,
        tableRowCount(admin) + ' dòng');

    const overCooldownForm = fillHeroForm(admin, {
        name: 'Test Hồi Chiêu Quá Lớn',
        roles: ['Xạ thủ'],
        stats: { hp: 900, attack: 90, defense: 90, speed: 90 },
        skill: { name: 'Chiêu Nhanh', type: 'Chiêu 1', description: '', cooldown: 60 },
    });
    await submitForm(admin, overCooldownForm);

    check('form báo lỗi khi hồi chiêu chạm 60 giây',
        formErrorsText(admin).includes('Hồi chiêu của kỹ năng "Chiêu Nhanh" phải nhỏ hơn 60'),
        formErrorsText(admin).slice(0, 300));
    check('không thêm tướng khi hồi chiêu vượt giới hạn',
        storedHeroes(admin).length === HEROES_JSON.length,
        storedHeroes(admin).length + ' tướng');
    check('bảng vẫn giữ nguyên số dòng sau lần thử vượt hồi chiêu',
        tableRowCount(admin) === HEROES_JSON.length,
        tableRowCount(admin) + ' dòng');

    /* ---------- 4. Thêm tướng mới ---------- */
    section('4. Thêm tướng mới');

    const validForm = fillHeroForm(admin, {
        name: 'Test Tướng',
        image: 'assets/heroes/valhein.png',
        roles: ['Xạ thủ'],
        difficulty: 3,
        stats: { hp: 1200, attack: 80, defense: 40, speed: 320 },
        skill: { name: 'Chiêu Test', description: 'Kỹ năng dùng cho test', cooldown: 5 },
        build: '101, 102',
    });
    await submitForm(admin, validForm);

    const heroesAfterAdd = storedHeroes(admin);
    const added = heroesAfterAdd[heroesAfterAdd.length - 1];

    check(`file heroes.json thêm 1 tướng (${COUNT_AFTER_ADD}/${HEROES_START})`,
        heroesAfterAdd.length === HEROES_JSON.length + 1,
        heroesAfterAdd.length + ' tướng');
    check('tướng mới có tên vừa nhập',
        added && added.name === 'Test Tướng',
        JSON.stringify(added && added.name));
    check(`tướng mới tự nhận id kế tiếp (${NEXT_HERO_ID})`,
        added && added.id === NEXT_HERO_ID,
        JSON.stringify(added && added.id));
    check('tướng mới giữ đúng vai trò đã tick (chỉ 1 vai trò)',
        added && JSON.stringify(added.role) === JSON.stringify(['Xạ thủ']),
        JSON.stringify(added && added.role));
    check('tướng mới có độ khó và chỉ số đã nhập',
        added && added.difficulty === 3 && added.stats.hp === 1200 && added.stats.speed === 320,
        JSON.stringify(added && added.stats));
    check('tướng mới có kỹ năng vừa nhập (tên, loại Chiêu 1, hồi chiêu)',
        added && added.skills.length === 1 && added.skills[0].name === 'Chiêu Test'
        && added.skills[0].type === 'Chiêu 1' && added.skills[0].cooldown === 5,
        JSON.stringify(added && added.skills));
    check('tướng mới có trang bị đề xuất đã nhập',
        added && JSON.stringify(added.recommendedBuild) === JSON.stringify([101, 102]),
        JSON.stringify(added && added.recommendedBuild));
    check('tướng mới có alias sinh từ tên',
        added && added.alias === 'test-tuong',
        JSON.stringify(added && added.alias));
    check('danh sách tướng mẫu trong heroes.json không bị đổi',
        heroesAfterAdd.slice(0, HEROES_JSON.length).every((hero, index) => hero.id === HEROES_JSON[index].id),
        JSON.stringify(heroesAfterAdd.slice(0, 3).map((hero) => hero.id)));

    check('bảng quản trị thêm 1 dòng mới',
        tableRowCount(admin) === HEROES_JSON.length + 1
        && plainTable(admin).includes('Test Tướng'),
        tableRowCount(admin) + ' dòng');
    check(`đếm số tướng đổi thành ${COUNT_AFTER_ADD}`,
        countText(admin) === `${COUNT_AFTER_ADD} tướng`,
        countText(admin));
    check('form quay về trạng thái thêm mới sau khi lưu',
        !formHtml(admin).includes('data-edit-id'),
        plainForm(admin).slice(0, 160));
    check('hiện thông báo thành công',
        formErrorsText(admin).includes('Đã thêm tướng'),
        formErrorsText(admin).slice(0, 300));
    check('trang không ném lỗi JavaScript sau khi thêm',
        admin.errors.length === 0,
        admin.errors.join(' | '));

    /* ---------- 4b. Chọn ảnh từ File Explorer ---------- */
    section('4b. Chọn ảnh từ File Explorer thay vì gõ link');

    const imageForm = admin.el('hero-admin-form').querySelector('#hero-form');
    const imageInput = imageForm.querySelector('#hero-image');
    const fileInput = imageForm.querySelector('#hero-image-file');

    check('form có ô input file ảnh accept="image/*"',
        Boolean(fileInput) && fileInput.getAttribute('accept') === 'image/*',
        fileInput ? String(fileInput.getAttribute('accept')) : 'không có #hero-image-file');
    check('ô nhập ảnh chỉ đọc (không gõ link tay được)',
        Boolean(imageInput) && imageInput.getAttribute('readonly') !== null,
        imageInput ? String(imageInput.getAttribute('readonly')) : 'không có #hero-image');
    check('có nút "Chọn ảnh..." và nút "Xoá ảnh"',
        Boolean(imageForm.querySelector('[data-hero-pick-image]'))
        && Boolean(imageForm.querySelector('[data-hero-clear-image]')));

    /*
     * Trình duyệt có .click() thật trên input file (mở File Explorer). mini-dom thì
     * ghi đè thành bộ đếm để kiểm đúng việc bấm ô ảnh / nút "Chọn ảnh" có gọi mở
     * hộp thoại chọn file hay không.
     */
    let fileDialogOpens = 0;
    fileInput.click = () => { fileDialogOpens += 1; };

    fire(imageInput, 'click', admin.doc);
    check('ấn vào ô ảnh -> mở File Explorer', fileDialogOpens === 1, fileDialogOpens + ' lần');

    fire(imageForm.querySelector('[data-hero-pick-image]'), 'click', admin.doc);
    check('bấm nút "Chọn ảnh..." -> mở File Explorer', fileDialogOpens === 2, fileDialogOpens + ' lần');

    // File không phải ảnh: báo lỗi, ô ảnh vẫn trống.
    fileInput.files = [{ name: 'note.txt', type: 'text/plain' }];
    await submitChange(admin, fileInput);
    check('chọn file không phải ảnh -> báo lỗi',
        formErrorsText(admin).includes('chỉ được chọn file ảnh'),
        formErrorsText(admin));
    check('file sai không làm đổi ô ảnh',
        admin.el('hero-admin-form').querySelector('#hero-image').value === '',
        admin.el('hero-admin-form').querySelector('#hero-image').value.slice(0, 60));

    // FileReader là API trình duyệt, mini-dom không có -> cung cấp bản mô phỏng
    // (code đọc file, hiện preview, cập nhật ô vẫn là code thật của dự án).
    admin.ctx.FileReader = function FakeFileReader() {
        return {
            result: '',
            onload: null,
            onerror: null,
            readAsDataURL() {
                this.result = 'data:image/png;base64,TESTIMAGE';
                if (this.onload) this.onload();
            },
        };
    };

    fileInput.files = [{ name: 'anh-tuong.png', type: 'image/png' }];
    await submitChange(admin, fileInput);

    const pickedImageUrl = admin.el('hero-admin-form').querySelector('#hero-image').value;
    check('chọn ảnh PNG -> ô ảnh nhận data URL',
        pickedImageUrl === 'data:image/png;base64,TESTIMAGE',
        pickedImageUrl.slice(0, 80));
    check('hiện ảnh xem trước của ảnh vừa chọn',
        admin.el('hero-admin-form').querySelector('#hero-image-preview').innerHTML.includes('data:image/png'),
        admin.el('hero-admin-form').querySelector('#hero-image-preview').innerHTML.slice(0, 160));
    check('chọn ảnh hợp lệ thì xoá thông báo lỗi cũ',
        formErrorsText(admin) === '',
        formErrorsText(admin).slice(0, 160));

    // Ép ảnh đã chọn về 1:1: dựng Image/canvas giả để kiểm tra shrinkHeroImage
    // thật sự CẮT GIỮA (không chỉ nén) — 200x100 cắt từ x=50, 100x300 cắt từ y=100.
    const shrinkResult = await admin.runInPage(`
        (async () => {
            const realCreateElement = document.createElement;
            const draws = [];
            let dims = { width: 200, height: 100 };

            document.createElement = (tag) => {
                if (String(tag).toLowerCase() !== 'canvas') return realCreateElement(tag);
                return {
                    width: 0,
                    height: 0,
                    getContext: () => ({
                        drawImage: (img, sx, sy, sw, sh, dx, dy, dw, dh) => draws.push([sx, sy, sw, sh, dx, dy, dw, dh]),
                    }),
                    toDataURL: () => 'data:image/png;base64,CROPPED',
                };
            };

            const realImage = typeof Image === 'undefined' ? undefined : Image;
            Image = class {
                constructor() { this.naturalWidth = dims.width; this.naturalHeight = dims.height; }
                set src(value) { if (this.onload) this.onload(); }
            };

            const wide = await shrinkHeroImage('data:image/png;base64,WIDE200x100', 'image/png');
            const wideDraw = draws.length ? draws[draws.length - 1] : null;

            dims = { width: 100, height: 300 };
            const tall = await shrinkHeroImage('data:image/png;base64,TALL100x300', 'image/png');
            const tallDraw = draws.length ? draws[draws.length - 1] : null;

            Image = realImage;
            document.createElement = realCreateElement;

            return JSON.stringify({ wide, wideDraw, tall, tallDraw });
        })()
    `);
    const shrink = shrinkResult ? JSON.parse(shrinkResult) : {};
    check('ảnh ngang 200x100 bị cắt giữa về 1:1 (nguồn 50,0 -> 100x100)',
        shrink.wide === 'data:image/png;base64,CROPPED'
        && JSON.stringify(shrink.wideDraw) === JSON.stringify([50, 0, 100, 100, 0, 0, 100, 100]),
        JSON.stringify({ wide: shrink.wide, wideDraw: shrink.wideDraw }));
    check('ảnh nhỏ 100x300 vẫn bị cắt 1:1 chứ không bỏ qua (nguồn 0,100)',
        shrink.tall === 'data:image/png;base64,CROPPED'
        && JSON.stringify(shrink.tallDraw) === JSON.stringify([0, 100, 100, 100, 0, 0, 100, 100]),
        JSON.stringify({ tall: shrink.tall, tallDraw: shrink.tallDraw }));

    // Nút "Xoá ảnh": bỏ ảnh đang chọn trên form.
    fire(admin.el('hero-admin-form').querySelector('[data-hero-clear-image]'), 'click', admin.doc);
    await admin.settled();
    check('bấm "Xoá ảnh" -> ô ảnh và ảnh xem trước trống',
        admin.el('hero-admin-form').querySelector('#hero-image').value === ''
        && admin.el('hero-admin-form').querySelector('#hero-image-preview').innerHTML === '',
        `value=${admin.el('hero-admin-form').querySelector('#hero-image').value.slice(0, 60)}`);

    // Các trang công khai phải hiển thị được ảnh data URL (không nối BASE_PATH vào).
    check('imageUrl() giữ nguyên data URL',
        admin.runInPage(`imageUrl('data:image/png;base64,QQ==')`) === 'data:image/png;base64,QQ==',
        admin.runInPage(`imageUrl('data:image/png;base64,QQ==')`));
    check('imageUrl() vẫn chuẩn hoá đường dẫn ảnh thường',
        String(admin.runInPage(`imageUrl('assets/heroes/valhein.png')`)).includes('assets/images/'),
        String(admin.runInPage(`imageUrl('assets/heroes/valhein.png')`)));
    check('trang không ném lỗi JavaScript sau khi chọn ảnh',
        admin.errors.length === 0,
        admin.errors.join(' | '));

    /* ---------- 5. Tướng mới hiện ở trang công khai ---------- */
    section('5. Tướng mới hiện ở Danh sách và Chi tiết');

    const heroesPage = await open(HEROES_PAGE, { storage: admin.storage, search: '?keyword=Test' });
    check(`trang Danh sách tướng đếm được ${COUNT_AFTER_ADD} tướng`,
        unescapeHtml(heroesPage.el('hero-count').textContent).includes('/' + COUNT_AFTER_ADD + ' tướng'),
        heroesPage.el('hero-count').textContent);
    check('tướng mới hiện trong lưới danh sách',
        unescapeHtml(heroesPage.el('hero-list').innerHTML).includes('Test Tướng'),
        unescapeHtml(heroesPage.el('hero-list').innerHTML).slice(0, 200));
    const heroCss = fs.readFileSync(path.join(ROOT, 'public/css/hero.css'), 'utf8');
    const mediaRule = (heroCss.match(/#hero-list\s+\.hero-card__media\s*\{[^}]*\}/s) || [''])[0];
    check('ảnh thẻ tướng ở danh sách bị ép tỉ lệ 1:1 (kèm display:block để tỉ lệ ăn)',
        /aspect-ratio:\s*1\s*\/\s*1/.test(mediaRule) && /display:\s*block/.test(mediaRule),
        mediaRule.slice(0, 200) || 'không thấy rule #hero-list .hero-card__media');
    check('trang Danh sách không ném lỗi JavaScript',
        heroesPage.errors.length === 0,
        heroesPage.errors.join(' | '));

    const detailPage = await open(HERO_DETAIL_PAGE, { storage: admin.storage, search: '?id=' + NEXT_HERO_ID });
    check('trang Chi tiết hiển thị tướng vừa thêm',
        unescapeHtml(detailPage.el('hero-detail').innerHTML).includes('Test Tướng'),
        unescapeHtml(detailPage.el('hero-detail').innerHTML).slice(0, 200));
    check('trang Chi tiết không ném lỗi JavaScript',
        detailPage.errors.length === 0,
        detailPage.errors.join(' | '));

    /*
     * Mở lại trang quản trị (giống admin tải lại trang) ngay sau khi thêm tướng.
     * Tướng đã được API ghi vào file heroes.json nên lần mở sau vẫn đọc được.
     */
    admin = await openHeroAdmin({ storage: admin.storage, login: ADMIN_USERNAME });
    check(`reload vẫn giữ đủ ${COUNT_AFTER_ADD} tướng (đã ghi vào file)`,
        storedHeroes().length === HEROES_JSON.length + 1,
        storedHeroes().length + ' tướng');
    check('tướng vừa thêm vẫn nằm trong file heroes.json',
        storedHeroes().some((hero) => String(hero.id) === String(NEXT_HERO_ID)),
        JSON.stringify(storedHeroes().map((hero) => hero.id).slice(-3)));

    /* ---------- 6. Sửa tướng ---------- */
    section('6. Sửa tướng');

    fire(
        admin.el('hero-admin-list').querySelector('[data-hero-edit="' + NEXT_HERO_ID + '"]'),
        'click',
        admin.doc,
    );
    await admin.settled();

    check('bấm Sửa mở form ở chế độ sửa (có data-edit-id)',
        formHtml(admin).includes('data-edit-id="' + NEXT_HERO_ID + '"'),
        plainForm(admin).slice(0, 200));
    check('form điền sẵn tên tướng đang sửa',
        formHtml(admin).includes('value="Test Tướng"'),
        plainForm(admin).slice(0, 300));
    check('form điền sẵn vai trò đã tick trước đó',
        /value="Xạ thủ" checked/.test(formHtml(admin)) || /value="Xạ thủ"[^>]* checked/.test(formHtml(admin)),
        plainForm(admin).slice(0, 600));

    const editForm = fillHeroForm(admin, {
        name: 'Test Tướng Đã Sửa',
        roles: ['Sát thủ'],
        difficulty: 5,
        stats: { hp: 2000, attack: 99, defense: 10, speed: 400 },
        skill: { name: 'Chiêu Mới', description: 'Đã sửa kỹ năng', cooldown: 8 },
        build: '103',
    });
    await submitForm(admin, editForm);

    const edited = storedHeroes(admin).find((hero) => String(hero.id) === String(NEXT_HERO_ID));
    check('tướng vẫn giữ nguyên id sau khi sửa',
        storedHeroes(admin).length === HEROES_JSON.length + 1 && edited && edited.id === NEXT_HERO_ID,
        JSON.stringify(edited && edited.id));
    check('tên tướng đã được cập nhật',
        edited && edited.name === 'Test Tướng Đã Sửa',
        JSON.stringify(edited && edited.name));
    check('nội dung khác cũng được cập nhật',
        edited && edited.difficulty === 5
        && edited.stats.attack === 99
        && edited.role.length === 1 && edited.role[0] === 'Sát thủ'
        && edited.skills[0].name === 'Chiêu Mới'
        && edited.skills[0].type === 'Chiêu 1'
        && JSON.stringify(edited.recommendedBuild) === JSON.stringify([103]),
        JSON.stringify(edited));
    check('bảng hiển thị tên mới, không nhân đôi dòng',
        tableRowCount(admin) === HEROES_JSON.length + 1 && plainTable(admin).includes('Test Tướng Đã Sửa'),
        tableRowCount(admin) + ' dòng');
    check('hiện thông báo đã cập nhật',
        formErrorsText(admin).includes('Đã cập nhật tướng'),
        formErrorsText(admin).slice(0, 300));

    /* ---------- 7. Xoá tướng ---------- */
    section('7. Xoá tướng');

    // Chuẩn bị sẵn tham chiếu tới tướng vừa thêm để kiểm tra tầng dữ liệu dọn giúp.
    admin.storage.set('aov_favorites', JSON.stringify({ hero: [NEXT_HERO_ID], item: [] }));
    admin.storage.set('aov_history', JSON.stringify([NEXT_HERO_ID, 1]));
    admin.storage.set('aov_compare', JSON.stringify([NEXT_HERO_ID, 2]));

    fire(
        admin.el('hero-admin-list').querySelector('[data-hero-delete="' + NEXT_HERO_ID + '"]'),
        'click',
        admin.doc,
    );
    await admin.settled();

    check(`file heroes.json còn đúng ${HEROES_START} tướng sau khi xoá`,
        storedHeroes(admin).length === HEROES_JSON.length,
        storedHeroes(admin).length + ' tướng');
    check(`tướng ${NEXT_HERO_ID} không còn trong file heroes.json`,
        !storedHeroes(admin).some((hero) => String(hero.id) === String(NEXT_HERO_ID)));
    check('bảng không còn dòng của tướng đã xoá',
        tableRowCount(admin) === HEROES_JSON.length && !plainTable(admin).includes('Test Tướng'),
        tableRowCount(admin) + ' dòng');
    check(`đếm số tướng quay về ${HEROES_START}`,
        countText(admin) === `${HEROES_START} tướng`,
        countText(admin));
    check('dọn tướng khỏi Yêu thích',
        JSON.stringify(admin.readKey('aov_favorites').hero) === '[]',
        JSON.stringify(admin.readKey('aov_favorites')));
    check('dọn tướng khỏi Lịch sử (giữ lại id khác)',
        JSON.stringify(admin.readKey('aov_history')) === '[1]',
        JSON.stringify(admin.readKey('aov_history')));
    check('dọn tướng khỏi So sánh (giữ lại id khác)',
        JSON.stringify(admin.readKey('aov_compare')) === '[2]',
        JSON.stringify(admin.readKey('aov_compare')));
    check('tướng mẫu trong heroes.json không bị xoá theo',
        storedHeroes(admin).some((hero) => hero.id === 1) && storedHeroes(admin).some((hero) => hero.id === HEROES_START_MAX_ID));
    check('trang không ném lỗi JavaScript sau khi xoá',
        admin.errors.length === 0,
        admin.errors.join(' | '));

    /* ---------- 8. Tướng đã xoá không "sống lại" khi mở lại trang ---------- */
    section('8. Mở lại trang sau khi xoá (không sống lại)');

    const reopened = await openHeroAdmin({ storage: admin.storage, login: ADMIN_USERNAME });
    check(`mở lại trang thì vẫn là ${HEROES_START} tướng`,
        storedHeroes(reopened).length === HEROES_JSON.length,
        storedHeroes(reopened).length + ' tướng');
    check('tướng đã xoá không quay lại bảng',
        !plainTable(reopened).includes('Test Tướng'),
        plainTable(reopened).slice(0, 200));
    check('id tướng đã xoá không còn trong file heroes.json',
        !storedHeroes().some((hero) => String(hero.id) === String(NEXT_HERO_ID)),
        JSON.stringify(storedHeroes().map((hero) => hero.id).slice(-3)));
    check('trang không ném lỗi JavaScript',
        reopened.errors.length === 0,
        reopened.errors.join(' | '));

    const heroesAfterDelete = await open(HEROES_PAGE, { storage: admin.storage });
    check('trang Danh sách tướng quay về đủ số tướng',
        unescapeHtml(heroesAfterDelete.el('hero-count').textContent) === `${HEROES_START} tướng`,
        heroesAfterDelete.el('hero-count').textContent);

    /* ---------- 9. Chặn ở tầng dữ liệu với tài khoản không có quyền ---------- */
    section('9. createHero()/deleteHero() chặn khi không phải admin');

    const hacker = await openHeroAdmin({ storage: admin.storage, login: OTHER_USERNAME });

    // Snapshot toàn bộ LocalStorage trước khi gọi — trang dùng chung Map với admin
    // nên chỉ so sánh trước/sau mới biết 3 hàm ghi có thay đổi gì không.
    const storageBefore = JSON.stringify([...hacker.storage.entries()]);

    const hacked = await hacker.runInPage(`
        (async () => await createHero({
            name: 'Hack Tướng',
            roles: ['Xạ thủ'],
            difficulty: 2,
            stats: { hp: 9999, attack: 9999, defense: 9999, speed: 9999 },
        }))()
    `);
    check('createHero() trả null với tài khoản thường',
        hacked === null,
        JSON.stringify(hacked));
    check('updateHero() trả null với tài khoản thường',
        await hacker.runInPage(`(async () => await updateHero(1, { name: 'Hack', roles: ['Xạ thủ'], difficulty: 2, stats: { hp: 1, attack: 1, defense: 1, speed: 1 } }))()`) === null);
    check('deleteHero() trả false với tài khoản thường',
        await hacker.runInPage('(async () => await deleteHero(1))()') === false);
    const storageAfter = JSON.stringify([...hacker.storage.entries()]);
    check('LocalStorage không bị tài khoản thường ghi thêm gì',
        storageAfter === storageBefore,
        storageAfter === storageBefore ? '' : `trước: ${storageBefore.slice(0, 120)} / sau: ${storageAfter.slice(0, 120)}`);

    const guestData = await openHeroAdmin({ storage: new Map() });
    check('createHero() trả null khi chưa đăng nhập',
        await guestData.runInPage(`(async () => await createHero({ name: 'Khách', roles: ['Xạ thủ'], difficulty: 2, stats: { hp: 1, attack: 1, defense: 1, speed: 1 } }))()`) === null);

    /* ---------- Tổng kết ---------- */
    section('Tổng kết');

    console.log(`\nĐạt: ${passed}/${passed + failures.length} kiểm tra`);
    if (failures.length) {
        console.log('Rơi:');
        failures.forEach((failure) => console.log('  - ' + failure));
        process.exitCode = 1;
    } else {
        console.log('Tất cả kiểm tra đều đạt.');
    }
})().catch((error) => {
    console.error('Test bị dừng vì lỗi:', error);
    process.exitCode = 1;
});
