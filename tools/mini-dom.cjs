/**
 * mini-dom.cjs - DOM tối giản + bộ nạp trang cho các script test trong tools/.
 *
 * Mô phỏng đủ để chạy code thật của dự án (innerHTML, querySelector, addEventListener,
 * localStorage, fetch tới src/data/*.json) trong Node, không cần trình duyệt.
 *
 * Dùng chung bởi: test-item-page.cjs, test-feed-page.cjs
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const VOID_TAGS = new Set(['img', 'br', 'input', 'hr', 'meta', 'link']);

/* ================= Mini DOM ================= */

function unescapeHtml(text) {
    return String(text)
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function parseAttrs(text) {
    const attrs = {};

    // Chấp nhận cả attribute không có giá trị (vd data-reset-item-filter).
    for (const match of String(text).matchAll(/([a-zA-Z_:][-\w:.]*)(?:\s*=\s*"([^"]*)")?/g)) {
        attrs[match[1].toLowerCase()] = match[2] === undefined ? '' : unescapeHtml(match[2]);
    }

    return attrs;
}

function classListOf(node) {
    return String(node.attrs.class || '').split(/\s+/).filter(Boolean);
}

function parseHtmlInto(host, html) {
    host.children = [];
    const stack = [host];
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

/** Tách selector thành các nhóm, mỗi nhóm là chuỗi phần tử con: 'a b, c' -> [['a','b'],['c']]. */
function splitSelector(selector) {
    return String(selector)
        .split(',')
        .map((group) => group.trim())
        .filter(Boolean)
        .map((group) => group.split(/\s+(?![^[]*\])/).filter(Boolean));
}

/** Chỉ so khớp MỘT selector đơn giản: .class / [attr] / [attr="value"] / #id / tag. */
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

/** node khớp "A B" khi node khớp B và có tổ tiên khớp A (đúng nghĩa của Element.matches). */
function matchesParts(node, parts) {
    if (!matchesOne(node, parts[parts.length - 1])) return false;

    const rest = parts.slice(0, -1);
    let current = node.parent;

    while (rest.length) {
        if (current && matchesOne(current, rest[rest.length - 1])) rest.pop();
        current = current.parent;
    }

    return rest.length === 0;
}

/** node khớp "A B" theo hướng xuống: node khớp B và có tổ tiên khớp A. */
function matchesBelow(node, parts) {
    if (!matchesOne(node, parts[parts.length - 1])) return false;
    return hasAncestorChain(node, parts.slice(0, -1));
}

function hasAncestorChain(node, parts) {
    if (!parts.length) return true;

    let current = node.parent;
    while (current) {
        if (matchesOne(current, parts[0]) && hasAncestorChain(current, parts.slice(1))) return true;
        current = current.parent;
    }

    return false;
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
        focus() { node.focused = true; },
        reset() { node.value = ''; },
        setAttribute(name, value) { this.attrs[name.toLowerCase()] = String(value); },
        getAttribute(name) { return name.toLowerCase() in this.attrs ? this.attrs[name.toLowerCase()] : null; },
        addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
        matches(selector) {
            return splitSelector(selector).some((parts) => matchesParts(this, parts));
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
            const groups = splitSelector(selector);
            const out = [];

            const walk = (element) => {
                for (const child of element.children) {
                    if (groups.some((parts) => matchesBelow(child, parts))) out.push(child);
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
            const current = new Set(classListOf(node));
            names.forEach((name) => current.add(name));
            node.attrs.class = [...current].join(' ');
        },
        remove(...names) {
            const current = new Set(classListOf(node));
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
            return classListOf(node).includes(name);
        },
    };

    node.classList = classList;

    for (const [name, value] of Object.entries(attrs)) {
        if (name.startsWith('data-')) {
            node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
        }
    }

    let htmlText = '';

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

function walkAll(root, visit) {
    for (const child of root.children) {
        visit(child);
        walkAll(child, visit);
    }
}

/**
 * Bắn sự kiện và nối bong bóng lên các phần tử cha.
 * @param {object} [document] nếu truyền vào thì listener ở cấp document chạy sau
 *        (đúng thứ tự bubble thật) — cần cho event delegation trong feed.js.
 */
function fire(node, type, document) {
    let current = node;
    const event = { type, target: node, preventDefault() {}, stopPropagation() {} };

    while (current) {
        for (const fn of current.listeners[type] || []) fn(event);
        current = current.parent;
    }

    for (const fn of (document && document.listeners[type]) || []) fn(event);
}

/** Bắn sự kiện ở cấp document (dùng cho event delegation trong feed.js). */
function fireOnDocument(document, target, type) {
    const event = { type, target, preventDefault() {}, stopPropagation() {} };
    for (const fn of document.listeners[type] || []) fn(event);
}

/* ================= Nạp trang thật vào VM ================= */

/**
 * @param {object} options
 * @param {string} options.page      đường dẫn tới file HTML trong src/pages/ (vd 'src/pages/feed.html')
 * @param {string} [options.search]  query string của URL
 * @param {object} [options.storage] Map dùng làm localStorage (để test "reload": giữ dữ liệu giữa 2 lần mở)
 * @param {string} [options.login]   username đang đăng nhập (ghi sẵn vào aov_current_user)
 * @param {string|string[]} [options.failData] file data/*.json cố tình cho tải lỗi
 * @param {object} [options.data]   { 'posts.json': [...] } để thay nội dung JSON trả về (mô phỏng dữ liệu mới)
 */
function loadPage(options) {
    const { page, search = '', storage = new Map(), login = null, failData = [], data = {} } = options;
    const brokenFiles = new Set(Array.isArray(failData) ? failData : [failData].filter(Boolean));

    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const scripts = [...html.matchAll(/<script src="\/src\/js\/([^"]+)"><\/script>/g)].map((m) => m[1]);
    const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

    const errors = [];
    const alerts = [];
    const byId = new Map();
    let reloadCount = 0;

    // Đăng ký các id có thật trong trang. Trình duyệt trả null khi id không tồn tại,
    // nên không được tự tạo phần tử giả: nếu không, mọi trang sẽ "có" đủ container
    // và code gọi nhầm container của trang khác sẽ không bị phát hiện.
    for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) {
        if (!byId.has(id)) byId.set(id, makeNode('div', { id }));
    }

    // Copy storage để không sửa bản gốc: test truyền cùng một Map cho nhiều lần mở trang
    // với login khác nhau (vd đổi từ đã đăng nhập sang khách).
    const local = new Map(storage);

    // auth.js lưu session dạng chuỗi thô (không JSON) trong aov_current_user.
    if (login) local.set('aov_current_user', String(login));

    const document = {
        body: makeNode('body', { 'data-page': 'page' }),
        documentElement: makeNode('html'),
        listeners: {},
        getElementById(id) {
            if (byId.has(id)) return byId.get(id);

            // innerHTML vừa tạo ra phần tử mới thì tìm trong cây DOM rồi đăng ký lại
            for (const el of byId.values()) {
                let found = null;
                walkAll(el, (node) => { if (!found && node.attrs.id === id) found = node; });
                if (found) {
                    byId.set(id, found);
                    return found;
                }
            }

            return null;
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
            getItem: (key) => (local.has(key) ? local.get(key) : null),
            setItem: (key, value) => local.set(key, String(value)),
            removeItem: (key) => local.delete(key),
        },
        location: {
            pathname: '/' + page,
            search,
            href: '/' + page + search,
            reload: () => { reloadCount += 1; },
        },
        history: {},
        navigator: { userAgent: 'node' },
        URLSearchParams,
        alert(message) { alerts.push(String(message)); },
        confirm: () => true,
        setTimeout,
        clearTimeout,
        fetch: async (url) => {
            const name = path.basename(String(url));
            const file = path.join(ROOT, 'src', 'data', name);

            if (brokenFiles.has(name)) {
                return { ok: false, status: 404, json: async () => { throw new Error('404'); }, text: async () => '' };
            }

            if (name in data) {
                return { ok: true, status: 200, json: async () => data[name], text: async () => '' };
            }

            if (fs.existsSync(file)) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
                    text: async () => '',
                };
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
    };

    const start = () => {
        run();
        for (const fn of document.listeners.DOMContentLoaded || []) {
            const result = fn();
            if (result && typeof result.then === 'function') {
                result.catch((error) => errors.push('DOMContentLoaded: ' + error.message));
            }
        }
    };

    return {
        ctx,
        doc: document,
        errors,
        alerts,
        /** Map localStorage của lần mở trang này (đã copy, không phải Map gốc truyền vào). */
        storage: local,
        run: start,
        el: (id) => document.getElementById(id),
        settled: () => new Promise((resolve) => setTimeout(resolve, 60)),
        /** Chạy đoạn code trong ngữ cảnh trang để kiểm tra hàm nội bộ của file JS. */
        runInPage: (code) => vm.runInContext(code, ctx),
        /** Số lần trang gọi location.reload() (dùng để test nút "Tải lại trang"). */
        reloadCount: () => reloadCount,
        readKey: (key) => {
            const raw = local.get(key);
            if (raw === undefined) return null;
            try { return JSON.parse(raw); } catch { return raw; }
        },
    };
}

module.exports = {
    ROOT,
    makeNode,
    fire,
    fireOnDocument,
    walkAll,
    classListOf,
    unescapeHtml,
    loadPage,
};
