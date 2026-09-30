/**
 * Test cho trang Danh sách Trang bị (src/pages/items.html + src/js/item.js).
 *
 * Mô phỏng DOM tối giảu trong Node để kiểm tra thật sự hành vi render/tìm kiếm/lọc:
 *   - render đủ item từ src/data/items.json
 *   - tìm theo tên (không dấu, không phân biệt hoa thường)
 *   - lọc theo loại
 *   - search + filter cùng lúc
 *   - trường hợp không có kết quả + nút xóa lọc
 *   - click item sang trang chi tiết
 *
 * Chạy: node tools/test-item-page.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PAGE = 'src/pages/items.html';
const DETAIL_PAGE = 'src/pages/item-detail.html';
const ITEMS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/items.json'), 'utf8'));

const VOID_TAGS = new Set(['img', 'br', 'input', 'hr', 'meta', 'link']);
const WAIT_RENDER_MS = 320; // > debounce 200ms trong item.js

/* ================= Mini DOM ================= */

function parseAttrs(text) {
    const attrs = {};

    // Chấp nhận cả attribute không có giá trị (vd data-reset-item-filter).
    for (const match of String(text).matchAll(/([a-zA-Z_:][-\w:.]*)(?:\s*=\s*"([^"]*)")?/g)) {
        attrs[match[1].toLowerCase()] = match[2] === undefined ? '' : unescapeHtml(match[2]);
    }

    return attrs;
}

function unescapeHtml(text) {
    return String(text)
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function parseHtmlInto(host, html) {
    host.children = [];
    const stack = [host];
    // Chấp nhận cả attribute không có giá trị (vd data-reset-item-filter).
    const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>/g;

    let match;
    while ((match = re.exec(String(html))) !== null) {
        const [, closing, rawTag, rawAttrs, selfClosing] = match;
        const tag = rawTag.toLowerCase();

        if (closing) {
            for (let i = stack.length - 1; i > 0; i--) {
                if (stack[i].tag === tag) { stack.length = i; break; }
            }
            continue;
        }

        const node = makeNode(tag, parseAttrs(rawAttrs), match[0]);
        node.parent = stack[stack.length - 1];
        node.parent.children.push(node);

        if (!selfClosing && !VOID_TAGS.has(tag)) stack.push(node);
    }
}

function makeNode(tag, attrs = {}, rawHtml = '') {
    const node = {
        tag,
        attrs,
        dataset: {},
        children: [],
        parent: null,
        value: attrs.value === undefined ? '' : attrs.value,
        textContent: '',
        listeners: {},
        scrollIntoView() {},
        setAttribute(name, value) { this.attrs[name.toLowerCase()] = String(value); },
        getAttribute(name) { return name.toLowerCase() in this.attrs ? this.attrs[name.toLowerCase()] : null; },
        addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
        matches(selector) {
            return selector.split(',').map((s) => s.trim()).filter(Boolean).some((s) => matchesOne(this, s));
        },
        closest(selector) {
            let current = this;
            while (current) {
                if (current.matches && current.matches(selector)) return current;
                current = current.parent;
            }
            return null;
        },
        querySelectorAll(selector) {
            const out = [];
            const walk = (element) => {
                for (const child of element.children) {
                    if (child.matches(selector)) out.push(child);
                    walk(child);
                }
            };
            walk(this);
            return out;
        },
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        },
    };

    const classList = {
        add(...names) {
            const current = new Set(String(node.attrs.class || '').split(/\s+/).filter(Boolean));
            names.forEach((name) => current.add(name));
            node.attrs.class = [...current].join(' ');
        },
        remove(...names) {
            const current = new Set(String(node.attrs.class || '').split(/\s+/).filter(Boolean));
            names.forEach((name) => current.delete(name));
            node.attrs.class = [...current].join(' ');
        },
        toggle(name, force) {
            const has = classList.contains(name);
            const shouldAdd = force === undefined ? !has : Boolean(force);
            if (shouldAdd) classList.add(name); else classList.remove(name);
            return shouldAdd;
        },
        contains(name) {
            return String(node.attrs.class || '').split(/\s+/).includes(name);
        },
    };

    node.classList = classList;
    node.className = attrs.class || '';
    node.id = attrs.id || '';

    for (const [name, value] of Object.entries(attrs)) {
        if (name.startsWith('data-')) {
            node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
        }
    }

    let htmlText = rawHtml;

    Object.defineProperty(node, 'innerHTML', {
        get: () => htmlText,
        set: (value) => {
            htmlText = String(value);
            parseHtmlInto(node, htmlText);
        },
    });

    Object.defineProperty(node, 'className', {
        get: () => node.attrs.class || '',
        set: (value) => { node.attrs.class = String(value); },
    });

    return node;
}

function matchesOne(node, selector) {
    if (selector.startsWith('.')) return classListOf(node).includes(selector.slice(1));

    const attrMatch = selector.match(/^\[([\w-]+)(?:="?([^"\]]*)"?)?\]$/);
    if (attrMatch) {
        const [, name, value] = attrMatch;
        if (name.startsWith('data-')) {
            const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            const actual = node.dataset[key];
            if (value === undefined) return actual !== undefined;
            return String(actual) === value;
        }
        if (!(name.toLowerCase() in node.attrs)) return false;
        return value === undefined ? true : String(node.attrs[name.toLowerCase()]) === value;
    }

    if (selector.startsWith('#')) return node.attrs.id === selector.slice(1);

    return node.tag === selector.toLowerCase();
}

function classListOf(node) {
    return String(node.attrs.class || '').split(/\s+/).filter(Boolean);
}

function walkAll(root, visit) {
    for (const child of root.children) {
        visit(child);
        walkAll(child, visit);
    }
}

/** Bắn sự kiện và nối bong bóng lên các phần tử cha. */
function fire(node, type) {
    let current = node;

    while (current) {
        const handlers = current.listeners[type] || [];
        const event = { type, target: node, preventDefault() {}, stopPropagation() {} };
        handlers.forEach((fn) => fn(event));
        current = current.parent;
    }
}

/* ================= Load trang vào VM ================= */

function loadPage(page, search) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const scripts = [...html.matchAll(/<script src="\/src\/js\/([^"]+)"><\/script>/g)].map((m) => m[1]);
    const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

    const errors = [];
    const byId = new Map();
    const localStorageStore = new Map();

    const document = {
        body: makeNode('body', { 'data-page': 'items' }),
        documentElement: makeNode('html'),
        listeners: {},
        getElementById(id) {
            if (byId.has(id)) return byId.get(id);

            for (const el of byId.values()) {
                let found = null;
                walkAll(el, (node) => { if (!found && node.attrs.id === id) found = node; });
                if (found) {
                    byId.set(id, found);
                    return found;
                }
            }

            const created = makeNode('div', { id });
            byId.set(id, created);
            return created;
        },
        querySelector(selector) { return document.querySelectorAll(selector)[0] || null; },
        querySelectorAll(selector) {
            const out = [];
            for (const el of byId.values()) {
                if (el.matches(selector)) out.push(el);
                walkAll(el, (node) => { if (node.matches(selector)) out.push(node); });
            }
            return out;
        },
        addEventListener(type, fn) { (document.listeners[type] = document.listeners[type] || []).push(fn); },
        createElement: () => makeNode('div'),
    };

    const ctx = {
        console: {
            log() {},
            warn() {},
            error(...args) { errors.push('console.error: ' + args.map(String).join(' ')); },
        },
        document,
        localStorage: {
            getItem: (key) => (localStorageStore.has(key) ? localStorageStore.get(key) : null),
            setItem: (key, value) => localStorageStore.set(key, String(value)),
            removeItem: (key) => localStorageStore.delete(key),
        },
        location: { pathname: '/' + page, search: search || '', href: '/' + page + (search || '') },
        history: {},
        navigator: { userAgent: 'node' },
        URLSearchParams,
        alert() {},
        confirm: () => true,
        setTimeout,
        clearTimeout,
        fetch: async (url) => {
            const name = path.basename(String(url));
            const file = path.join(ROOT, 'src', 'data', name);
            if (fs.existsSync(file)) {
                return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')), text: async () => '' };
            }
            return { ok: true, status: 200, json: async () => [], text: async () => '' };
        },
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);

    const run = () => {
        for (const file of scripts) {
            vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'js', file), 'utf8'), ctx, { filename: file });
        }
        inlineScripts.forEach((code, i) => vm.runInContext(code, ctx, { filename: `${page}#inline${i}` }));
        for (const fn of document.listeners.DOMContentLoaded || []) {
            const result = fn();
            if (result && typeof result.then === 'function') result.catch((e) => errors.push('DOMContentLoaded: ' + e.message));
        }
    };

    return {
        errors,
        run,
        doc: document,
        el: (id) => document.getElementById(id),
        settled: () => new Promise((resolve) => setTimeout(resolve, 60)),
        afterSearch: () => new Promise((resolve) => setTimeout(resolve, WAIT_RENDER_MS)),
    };
}

/* ================= Đọc kết quả render ================= */

function readCards(listEl) {
    const html = listEl.innerHTML;

    return html
        .split('<article class="card item-card">')
        .slice(1)
        .map((block) => ({
            name: (block.match(/class="item-card__name">([^<]*)</) || [])[1] || '',
            type: (block.match(/item-card__meta">[\s\S]*?<span class="badge">([^<]*)</) || [])[1] || '',
            price: (block.match(/class="item-card__price">([^<]*)</) || [])[1] || '',
            image: (block.match(/<img src="([^"]*)"/) || [])[1] || '',
            statsCount: (block.match(/class="item-card__stat"/g) || []).length,
            detailId: (block.match(/item-detail\.html\?id=(\d+)/) || [])[1] || '',
        }));
}

function stripAccents(text) {
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/** renderNotFound() escape HTML nên dấu " thành &quot; — giải mã lại để so khớp. */
function decodeEntities(text) {
    return unescapeHtml(text);
}

function countByType(items) {
    const counts = {};
    for (const item of items) counts[item.type] = (counts[item.type] || 0) + 1;
    return counts;
}

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

async function openListPage(search) {
    const page = loadPage(PAGE, search);
    page.run();
    await page.settled();
    return page;
}

async function search(page, keyword) {
    const input = page.el('item-search');
    input.value = keyword;
    fire(input, 'input');
    await page.afterSearch();
}

async function clickChip(page, type) {
    const chip = page.el('item-filter-bar').querySelector(`[data-type="${type}"]`);
    if (!chip) throw new Error('Không tìm thấy nút lọc loại: ' + type);
    fire(chip, 'click');
    await page.settled();
}

async function clickPage(page, number) {
    const btn = page.el('item-pagination').querySelector(`[data-page="${number}"]`);
    if (!btn) throw new Error('Không tìm thấy nút trang: ' + number);
    fire(btn, 'click');
    await page.settled();
}

(async () => {
    console.log('Dữ liệu src/data/items.json: ' + ITEMS_JSON.length + ' item');
    console.log('Số loại: ' + JSON.stringify(countByType(ITEMS_JSON)));

    /* ---------- 1. Render đủ item ---------- */
    section('1. Render danh sách từ items.json');
    const page = await openListPage('');
    const listEl = page.el('item-list');
    const filterEl = page.el('item-filter-bar');
    const countEl = page.el('item-count');

    check('không có lỗi JS khi khởi tạo', page.errors.length === 0, page.errors.join(' | '));

    const page1 = readCards(listEl);
    check('trang 1 render đúng 12 card (phân trang)', page1.length === 12, `thực tế: ${page1.length}`);
    check('ô đếm kết quả hiển thị tổng số item', countEl.textContent === `${ITEMS_JSON.length} trang bị`, countEl.textContent);

    // Gom tất cả card qua các trang để chứng minh render đủ 40 item
    const totalPages = (listEl.innerHTML, page.el('item-pagination').querySelectorAll('.pagination__item').length);
    check('có phân trang 4 trang cho 40 item', totalPages === Math.ceil(ITEMS_JSON.length / 12), `thực tế: ${totalPages}`);

    const allCards = [];
    for (let p = 1; p <= totalPages; p++) {
        if (p > 1) await clickPage(page, p);
        allCards.push(...readCards(listEl));
    }
    check('render đủ 40 card qua các trang', allCards.length === ITEMS_JSON.length, `thực tế: ${allCards.length}`);

    const ids = new Set(allCards.map((card) => card.detailId));
    check('40 id item khác nhau, đúng với items.json', ids.size === ITEMS_JSON.length, `id khác nhau: ${ids.size}`);
    check(
        'tên card khớp với items.json',
        allCards.every((card) => ITEMS_JSON.some((item) => item.name === card.name)),
    );

    check('mỗi card có ảnh', allCards.every((card) => card.image.startsWith('/assets/images/items/')), allCards[0].image);
    check('mỗi card có tên', allCards.every((card) => card.name.length > 0));
    check('mỗi card có loại', allCards.every((card) => ITEMS_JSON.some((item) => item.type === card.type)));
    check(
        'mỗi card có giá định dạng "x.xxx Bạc"',
        allCards.every((card) => /^\d{1,3}(\.\d{3})* Bạc$/.test(card.price)),
        allCards.map((c) => c.price).slice(0, 3).join(', '),
    );
    check('mỗi card có ít nhất 1 chỉ số chính', allCards.every((card) => card.statsCount >= 1));
    check(
        'chỉ số trên card lấy đúng từ items.json (ví dụ Kiếm Fafnir: +60/+30)',
        (() => {
            const card = allCards.find((c) => c.name === 'Kiếm Fafnir');
            return card && card.statsCount === 2;
        })(),
    );

    /* ---------- 2. Bộ lọc loại trong thanh filter ---------- */
    section('2. Bộ lọc theo loại');
    const chips = filterEl.querySelectorAll('.item-chip');
    const chipTypes = chips.map((chip) => chip.dataset.type);
    check(
        'thanh filter có đủ 6 loại + "Tất cả"',
        JSON.stringify(chipTypes) === JSON.stringify(['all', 'Công', 'Phép', 'Giáp', 'Kháng Phép', 'Giày', 'Đặc Biệt']),
        JSON.stringify(chipTypes),
    );
    check('nút "Tất cả" mặc định được đánh dấu active', chips[0].classList.contains('is-active'));
    check(
        'chip hiển thị số lượng item tương ứng',
        /Phép <span class="item-chip__count">10<\/span>/.test(filterEl.innerHTML),
    );

    const typeCounts = countByType(ITEMS_JSON);
    for (const [type, expected] of Object.entries(typeCounts)) {
        await clickChip(page, type);
        const cards = readCards(listEl);
        check(`lọc "${type}" ra đúng ${expected} item`, cards.length === expected && cards.every((card) => card.type === type), `thực tế: ${cards.length}`);
    }
    await clickChip(page, 'Công');
    check(
        'lọc "Công" (10 item) hiện đủ 10 card, không phân trang',
        readCards(listEl).length === 10 && page.el('item-pagination').innerHTML === '',
        readCards(listEl).length,
    );

    await clickChip(page, 'all');
    check('bấm "Tất cả" trả lại đủ 40 item qua 4 trang', readCards(listEl).length === 12 && page.el('item-pagination').querySelectorAll('.pagination__item').length === 4);

    /* ---------- 3. Tìm kiếm theo tên ---------- */
    section('3. Tìm kiếm theo tên');
    await search(page, 'kiem');
    let cards = readCards(listEl);
    check('tìm "kiem" (không dấu) ra 4 trang bị', cards.length === 4, `thực tế: ${cards.length}: ${cards.map((c) => c.name).join(', ')}`);
    check('kết quả "kiem" đều chứa "kiếm" khi bỏ dấu', cards.every((card) => stripAccents(card.name).includes('kiem')));
    check('tìm "kiem" không lọc nhầm loại khác', cards.every((card) => card.type === 'Công'));

    await search(page, 'kiếm');
    const cardsWithMarks = readCards(listEl);
    check('tìm "kiếm" (có dấu) cho kết quả giống "kiem"', cardsWithMarks.length === cards.length, `${cardsWithMarks.length} vs ${cards.length}`);

    await search(page, 'KIẾM');
    check('tìm "KIẾM" ( HOA) cho kết quả giống "kiem"', readCards(listEl).length === cards.length);

    await search(page, 'GIAP');
    const armorCards = readCards(listEl);
    check('tìm "GIAP" (không dấu + hoa) ra 7 trang bị Giáp', armorCards.length === 7 && armorCards.every((card) => card.type === 'Giáp'), armorCards.map((c) => c.name).join(', '));

    await search(page, 'phep');
    const magicCards = readCards(listEl);
    check(
        'tìm "phep" (không dấu) ra 3 item có chữ "Phép" trong tên',
        magicCards.length === 3 && magicCards.every((card) => stripAccents(card.name).includes('phep')),
        magicCards.map((c) => `${c.name} [${c.type}]`).join(', '),
    );

    await search(page, 'giay');
    check('tìm "giay" (không dấu) ra 4 trang bị Giày', readCards(listEl).every((card) => card.type === 'Giày') && readCards(listEl).length === 4);

    await search(page, '');
    check('xóa từ khoá hiển thị lại 40 item', page.el('item-pagination').querySelectorAll('.pagination__item').length === 4);

    /* ---------- 4. Search + filter đồng thời ---------- */
    section('4. Search và filter hoạt động đồng thời');
    await clickChip(page, 'Giày');
    await search(page, 'giay');
    cards = readCards(listEl);
    check('search "giay" + filter "Giày" -> 4 item', cards.length === 4 && cards.every((card) => card.type === 'Giày'), `thực tế: ${cards.length}`);

    await search(page, 'giap');
    const emptyCombo = listEl.innerHTML;
    check('search "giap" + filter "Giày" -> không có kết quả', emptyCombo.includes('item-empty') && readCards(listEl).length === 0);
    check(
        'thông báo rỗng nêu rõ cả từ khoá lẫn loại',
        decodeEntities(emptyCombo).includes('Không tìm thấy trang bị nào khớp với từ khoá "giap" và loại "Giày".'),
        emptyCombo.slice(0, 300),
    );

    await clickChip(page, 'Công');
    await search(page, 'kiem');
    cards = readCards(listEl);
    check('search "kiem" + filter "Công" -> chỉ item thỏa cả 2 điều kiện', cards.length === 4 && cards.every((card) => card.type === 'Công' && stripAccents(card.name).includes('kiem')));

    await search(page, 'giay');
    check('search "giay" + filter "Công" -> 0 kết quả (loại sai)', listEl.innerHTML.includes('item-empty'));

    // URL: items.html?keyword=kiem&type=Công
    const fromUrl = await openListPage('?keyword=kiem&type=C%C3%B4ng');
    await fromUrl.settled();
    const urlCards = readCards(fromUrl.el('item-list'));
    check(
        'URL ?keyword=kiem&type=Công -> 4 item Công chứa kiếm',
        urlCards.length === 4 && urlCards.every((card) => card.type === 'Công' && stripAccents(card.name).includes('kiem')),
        urlCards.map((c) => c.name).join(', '),
    );
    check('ô tìm kiếm được điền sẵn từ URL', fromUrl.el('item-search').value === 'kiem');
    check('nút lọc "Công" được đánh dấu active', fromUrl.el('item-filter-bar').querySelector('[data-type="Công"]').classList.contains('is-active'));

    /* ---------- 5. Trường hợp không có kết quả ---------- */
    section('5. Không có kết quả');
    await clickChip(page, 'all');
    await search(page, 'vunghiemkhongton');
    const emptyHtml = listEl.innerHTML;
    check('hiển thị khối thông báo không có kết quả', emptyHtml.includes('not-found') && emptyHtml.includes('item-empty'));
    check('thông báo nhắc lại từ khoá đã tìm', decodeEntities(emptyHtml).includes('Không tìm thấy trang bị nào khớp với từ khoá "vunghiemkhongton".'));
    check('không còn card item nào', readCards(listEl).length === 0);
    check('ẩn thanh phân trang khi rỗng', fromUrl.el('item-pagination').innerHTML === '' && page.el('item-pagination').innerHTML === '');

    const resetBtn = listEl.querySelector('[data-reset-item-filter]');
    check('có nút "Xóa tìm kiếm & bộ lọc"', Boolean(resetBtn));
    fire(resetBtn, 'click');
    await page.settled();
    check('bấm nút xóa lọc -> hiển thị lại 12 card/trang', readCards(listEl).length === 12);
    check('bấm nút xóa lọc -> xóa luôn từ khoá trong ô nhập', page.el('item-search').value === '');

    // Không có kết quả do chỉ lọc loại không tồn tại trong dữ liệu
    const fakeChip = page.el('item-filter-bar').querySelectorAll('.item-chip')[0];
    fakeChip.dataset.type = 'Không Có Loại Này';
    fire(fakeChip, 'click');
    await page.settled();
    check(
        'lọc 1 loại không có trong dữ liệu -> thông báo rõ ràng',
        decodeEntities(listEl.innerHTML).includes('Không tìm thấy trang bị nào khớp với loại "Không Có Loại Này".'),
        listEl.innerHTML.slice(0, 260),
    );

    /* ---------- 6. Click item sang trang chi tiết ---------- */
    section('6. Click item sang trang chi tiết');
    const detailPage = await openListPage('?keyword=fafnir');
    await detailPage.settled();
    const card = readCards(detailPage.el('item-list'))[0];
    const linkHref = (detailPage.el('item-list').innerHTML.match(/href="([^"]*item-detail\.html\?id=101)"/) || [])[1] || '';
    check('card có link sang item-detail.html?id=101', linkHref.includes('src/pages/item-detail.html?id=101'), linkHref);
    check('card hiển thị đúng tên/loại/giá của item 101', card.name === 'Kiếm Fafnir' && card.type === 'Công' && card.price === '2.040 Bạc', JSON.stringify(card));

    const detail = loadPage(DETAIL_PAGE, '?id=101');
    detail.run();
    await detail.settled();
    const detailHtml = detail.el('item-detail').innerHTML;
    check('item-detail.html?id=101 render đủ thông tin', ['Kiếm Fafnir', 'Công', '2.040 Bạc', '+60', '+30', 'items/fafnir.png'].every((text) => detailHtml.includes(text)), detailHtml.slice(0, 200));

    const missing = loadPage(DETAIL_PAGE, '?id=99999');
    missing.run();
    await missing.settled();
    check('id không tồn tại -> renderNotFound', missing.el('item-detail').innerHTML.includes('Không tìm thấy trang bị này.'));
    check('các trang item không ném lỗi', page.errors.length === 0 && detail.errors.length === 0 && missing.errors.length === 0, [...page.errors, ...detail.errors, ...missing.errors].join(' | '));

    /* ---------- Kết quả ---------- */
    console.log(`\n${passed} test PASS, ${failures.length} test FAIL`);
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})();
