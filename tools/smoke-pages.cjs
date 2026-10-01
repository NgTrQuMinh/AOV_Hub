/**
 * Smoke test: mô phỏng trình duyệt tối giản để kiểm tra các trang có
 * ném ReferenceError / TypeError lúc chạy hay không.
 * Chạy: node tools/smoke-pages.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PAGES = [
    'index.html',
    'src/pages/heroes.html',
    'src/pages/hero-detail.html',
    'src/pages/items.html',
    'src/pages/item-detail.html',
    'src/pages/builds.html',
    'src/pages/feed.html',
    'src/pages/post-detail.html',
    'src/pages/favorite.html',
    'src/pages/compare.html',
    'src/pages/profile.html',
    'src/pages/login.html',
    'src/pages/register.html',
    'src/pages/404.html',
];

function makeEl(id) {
    const el = {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        className: '',
        dataset: {},
        style: {},
        children: [],
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        addEventListener() {},
        removeEventListener() {},
        appendChild(c) { this.children.push(c); },
        querySelector: () => null,
        querySelectorAll: () => [],
        closest: () => null,
        setAttribute() {},
        getAttribute: () => null,
        scrollIntoView() {},
    };
    return el;
}

function runPage(page, extraSearch) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const scripts = [...html.matchAll(/<script src="\/src\/js\/([^"]+)"><\/script>/g)].map((m) => m[1]);
    // Script inline trong thẻ <script>...</script> cũng phải chạy (vd login/profile/404)
    const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const errors = [];
    const els = new Map();
    const store = new Map();

    // Trình duyệt trả null cho id không tồn tại trong trang. Nếu tự tạo phần tử cho mọi id
    // thì mỗi trang sẽ "có" đủ container và smoke test không phát hiện được trang gọi
    // nhầm vào container của trang khác.
    const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

    const localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
    };

    const doc = {
        body: { dataset: { page: 'test' } },
        documentElement: {},
        listeners: { click: [], submit: [], DOMContentLoaded: [] },
        getElementById(id) {
            if (!htmlIds.has(id)) return null;
            if (!els.has(id)) els.set(id, makeEl(id));
            return els.get(id);
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(type, fn) {
            (doc.listeners[type] = doc.listeners[type] || []).push(fn);
        },
        createElement: () => makeEl('created'),
    };

    const ctx = {
        console: { log() {}, warn() {}, error(...a) { errors.push('console.error: ' + a.join(' ')); } },
        document: doc,
        localStorage,
        location: { pathname: '/' + page, search: extraSearch || '', href: '' },
        history: {},
        navigator: { userAgent: 'node' },
        URLSearchParams,
        alert: () => {},
        confirm: () => true,
        setTimeout,
        clearTimeout,
        fetch: async (url) => {
            const file = path.join(ROOT, 'src', 'data', path.basename(url));
            if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => [] };
            return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')), text: async () => '' };
        },
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);

    try {
        for (const file of scripts) {
            const code = fs.readFileSync(path.join(ROOT, 'src', 'js', file), 'utf8');
            vm.runInContext(code, ctx, { filename: file });
        }
        for (const [i, code] of inlineScripts.entries()) {
            vm.runInContext(code, ctx, { filename: page + '#inline' + i });
        }
        for (const fn of doc.listeners.DOMContentLoaded) {
            const r = fn();
            if (r && typeof r.then === 'function') {
                r.catch((e) => errors.push('DOMContentLoaded: ' + e.message));
            }
        }
    } catch (e) {
        errors.push('THROW: ' + e.message);
    }

    return errors;
}

(async () => {
    let bad = 0;
    for (const page of PAGES) {
        const search = page.includes('hero-detail') ? '?id=1' : page.includes('post-detail') ? '?id=9001' : '';
        const errors = runPage(page, search);
        if (errors.length) {
            bad++;
            console.log('FAIL ' + page);
            [...new Set(errors)].forEach((e) => console.log('      ' + e));
        } else {
            console.log('OK   ' + page);
        }
    }
    console.log(bad ? '\n' + bad + ' trang còn lỗi' : '\nTất cả trang chạy không lỗi');
})();
