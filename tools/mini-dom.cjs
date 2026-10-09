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

/** Web Crypto (crypto.subtle) cho auth.js: ưu tiên global, lùi về require('crypto'). */
const WEB_CRYPTO = (() => {
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
        return globalThis.crypto;
    }
    try {
        return require('crypto').webcrypto;
    } catch (error) {
        return undefined;
    }
})();

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
    const source = String(html);
    const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*(\/?)>/g;

    let match;
    while ((match = re.exec(source)) !== null) {
        const [, closing, rawTag, rawAttrs, selfClosing] = match;
        const tag = rawTag.toLowerCase();

        if (closing) {
            for (let i = stack.length - 1; i > 0; i--) {
                if (stack[i].tag === tag) {
                    // <textarea>Nội dung</textarea> lấy value từ text bên trong,
                    // đúng như trình duyệt. Không có thì form edit sẽ mất sẵn nội dung.
                    if (tag === 'textarea') {
                        const inner = source.slice(stack[i].lastIndex, match.index);
                        stack[i].value = decodeEntities(inner);
                        stack[i].textContent = stack[i].value;
                    }
                    stack.length = i;
                    break;
                }
            }
            continue;
        }

        const node = makeNode(tag, parseAttrs(rawAttrs), match[0]);
        node.parent = stack[stack.length - 1];
        node.parent.children.push(node);
        node.lastIndex = re.lastIndex;

        if (!selfClosing && !VOID_TAGS.has(tag)) stack.push(node);
    }
}

/**
 * Đánh dấu node cùng toàn bộ con là "đã gỡ khỏi cây" — innerHTML ghi đè thì cây
 * con cũ mất liên kết với node cha nhưng .parent vẫn trỏ về, nên không phân biệt
 * được bằng cách đi lên. getElementById / querySelectorAll sẽ bỏ qua các node này
 * thay vì trả node cũ (stale) sau khi render lại (vd form #hero-form).
 */
function markDetached(root) {
    root.__detached = true;
    walkAll(root, (node) => { node.__detached = true; });
}

/** Giải mã các entity HTML cơ bản để value của textarea/input khớp với trình duyệt. */
function decodeEntities(text) {
    return String(text)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

/** Tách selector thành các nhóm, mỗi nhóm là chuỗi phần tử con: 'a b, c' -> [['a','b'],['c']]. */
function splitSelector(selector) {
    return String(selector)
        .split(',')
        .map((group) => group.trim())
        .filter(Boolean)
        .map((group) => group.split(/\s+(?![^[]*\])/).filter(Boolean));
}

/**
 * Tách selector ghép đơn giản thành các mảnh: 'input[name="x"]' -> ['input', '[name="x"]'].
 * Trả null khi có cú pháp chưa hỗ trợ (vd: pseudo-class 'input:hover').
 */
function tokenizeCompound(selector) {
    const text = String(selector);
    const parts = [];
    let index = 0;

    while (index < text.length) {
        const rest = text.slice(index);
        const match = rest.match(/^[a-zA-Z][\w-]*|^\.[\w-]+|^#[\w-]+|^\[[^\]]+\]/);
        if (!match) return null;
        parts.push(match[0]);
        index += match[0].length;
    }

    return parts;
}

/** Chỉ so khớp MỘT selector đơn giản: .class / [attr] / [attr="value"] / #id / tag. */
function matchesSimple(node, selector) {
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

/** So khớp MỘT selector (hỗ trợ ghép 'tag.class', 'tag#id', 'tag[attr="v"]'). */
function matchesOne(node, selector) {
    const parts = tokenizeCompound(selector);
    if (!parts) return false;
    return parts.every((part) => matchesSimple(node, part));
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
        /**
         * Chèn HTML vào trong phần tử. Mới hỗ trợ 'beforeend' và 'afterbegin'
         * (đúng hai vị trí mà test cần), vì innerHTML ở đây lưu dạng chuỗi.
         */
        insertAdjacentHTML(position, html) {
            const text = String(html);

            if (position === 'beforeend') htmlText += text;
            else if (position === 'afterbegin') htmlText = text + htmlText;
            else throw new Error('mini-dom: insertAdjacentHTML chỉ hỗ trợ beforeend/afterbegin, nhận "' + position + '"');

            parseHtmlInto(node, htmlText);

            return null;
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

    // Trình duyệt: <select> mà không có option nào được chọn thì .value là giá trị của
    // option đầu tiên. Mô phỏng điều đó để form đăng bài đọc được chuyên mục mặc định
    // y hệt ngoài trình duyệt (nếu không, .value sẽ là chuỗi rỗng và mọi bài đăng đều
    // bị validatePostForm() báo thiếu chuyên mục).
    if (tag === 'select') {
        let assigned = attrs.value === undefined ? null : attrs.value;

        Object.defineProperty(node, 'value', {
            get() {
                if (assigned !== null) return assigned;

                const options = node.querySelectorAll('option');
                const chosen = options.find((option) => option.getAttribute('selected') !== null);
                const picked = chosen || options[0];

                return picked ? (picked.getAttribute('value') || '') : '';
            },
            set(value) { assigned = String(value); },
        });

        // Trình duyệt: select.options là collection các <option> con (compare.js
        // duyệt .options để khoá option trùng). Trả về mảng node con cho đúng.
        Object.defineProperty(node, 'options', {
            get() { return node.querySelectorAll('option'); },
        });
    }

    for (const [name, value] of Object.entries(attrs)) {
        if (name.startsWith('data-')) {
            node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
        }
    }

    // Attribute checked (vd checkbox điền sẵn trong form sửa tướng) -> property,
    // đúng như trình duyệt, để code đọc input.checked được cả trong test.
    if ('checked' in attrs) node.checked = true;

    let htmlText = '';

    Object.defineProperty(node, 'innerHTML', {
        get: () => htmlText,
        set: (value) => {
            // Cây con cũ sắp bị parseHtmlInto vứt khỏi node.children: đánh dấu đã gỡ
            // để getElementById không trả node cũ sau khi render lại.
            for (const child of node.children) markDetached(child);
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

/* ================= API quản lý tướng (mô phỏng vite.config.js) ================= */

/** Đọc nội dung heroes.json thật làm dữ liệu khởi tạo cho "file" của API. */
function readHeroesFile() {
    const file = path.join(ROOT, 'src', 'data', 'heroes.json');
    if (!fs.existsSync(file)) return [];

    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        return [];
    }
}

/**
 * "File" heroes.json dùng chung giữa nhiều lần mở trang trong test (giống file thật).
 * store.heroes = null nghĩa là chưa nạp, lần request đầu sẽ đọc từ heroes.json.
 */
function createHeroesApi(initial) {
    return { heroes: Array.isArray(initial) ? initial : null };
}

function heroesApiResponse(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
    };
}

/** Mô phỏng đúng các route /api/heroes của plugin trong vite.config.js. */
function handleHeroesApi(store, pathname, options) {
    if (!Array.isArray(store.heroes)) store.heroes = readHeroesFile();

    const method = String((options && options.method) || 'GET').toUpperCase();
    const id = pathname.startsWith('/api/heroes/')
        ? decodeURIComponent(pathname.slice('/api/heroes/'.length))
        : '';

    if (method === 'GET' && !id) return heroesApiResponse(200, store.heroes.slice());

    let body = {};
    if (options && options.body) {
        try {
            body = JSON.parse(options.body);
        } catch (error) {
            body = null;
        }
    }

    if (body === null) return heroesApiResponse(400, { error: 'JSON không hợp lệ' });

    if (method === 'POST' && !id) {
        const max = store.heroes.reduce((current, hero) => {
            const value = Number(hero && hero.id);
            return Number.isFinite(value) && value > current ? value : current;
        }, 0);

        const hero = Object.assign({}, body, { id: Math.floor(max) + 1 });
        store.heroes.push(hero);
        return heroesApiResponse(201, hero);
    }

    if (method === 'PUT' && id) {
        const index = store.heroes.findIndex((hero) => String(hero.id) === String(id));
        if (index === -1) return heroesApiResponse(404, { error: 'Không tìm thấy tướng' });

        const hero = Object.assign({}, store.heroes[index], body, {
            id: store.heroes[index].id,
            updatedAt: new Date().toISOString(),
        });
        store.heroes[index] = hero;
        return heroesApiResponse(200, hero);
    }

    if (method === 'DELETE' && id) {
        const before = store.heroes.length;
        store.heroes = store.heroes.filter((hero) => String(hero.id) !== String(id));
        if (store.heroes.length === before) return heroesApiResponse(404, { error: 'Không tìm thấy tướng' });
        return heroesApiResponse(200, { ok: true });
    }

    return heroesApiResponse(405, { error: 'Phương thức không được hỗ trợ' });
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

/* ================= Cầu nối dataStore <-> storage cũ =================
 *
 * Từ đợt này dữ liệu dùng chung (tài khoản, bài viết, bình luận, lượt thích) nằm
 * trong các collection của dataStore (src/js/dataStore.js), không còn nằm trực tiếp
 * trong LocalStorage. Các test đang viết theo kiểu cũ (đọc/ghi aov_users, aov_posts,
 * aov_comments, aov_likes) nên storage mô phỏng ở đây "nhìn xuyên" sang collection:
 *  - đọc aov_posts / aov_comments / aov_likes / aov_users -> lấy nội dung collection,
 *    giữ nguyên định dạng JSON chuỗi của localStorage cũ;
 *  - ghi aov_posts / ... -> cập nhật luôn collection;
 *  - dữ liệu test dựng sẵn qua những key đó được nạp thành BẢN NHÁP của dataStore
 *    (aov_draft_<name>) khi mở trang, để nó thay thế hẳn file JSON (đúng ngữ nghĩa
 *    "bài đã xoá thì không sống lại").
 */
const COLLECTION_KEYS = {
    aov_users: 'users',
    aov_posts: 'posts',
    aov_comments: 'comments',
    aov_likes: 'likes',
};

/**
 * Storage mô phỏng vừa giữ các key thường (aov_current_user, aov_mod_settings,
 * aov_favorites...), vừa nhìn xuyên bốn key collection sang dataStore sau khi
 * trang chạy. Dùng cho cả page.storage lẫn localStorage của trang.
 */
function createStorage(entries) {
    const base = new Map(entries);
    const api = {
        __base: base,
        __ctx: null,

        has(key) {
            if (Object.prototype.hasOwnProperty.call(COLLECTION_KEYS, key)) {
                if (readLive(key) !== undefined) return true;
            }
            return base.has(key);
        },
        get(key) {
            const live = readLive(key);
            if (live !== undefined) return live;
            return base.has(key) ? base.get(key) : undefined;
        },
        set(key, value) {
            // Không nhận undefined: Map cũ vẫn chấp nhận nhưng storage thật không có.
            if (value === undefined) return api;
            const text = String(value);
            base.set(key, text);

            if (Object.prototype.hasOwnProperty.call(COLLECTION_KEYS, key) && api.__ctx
                && typeof api.__ctx.setCollection === 'function') {
                try {
                    api.__ctx.setCollection(COLLECTION_KEYS[key], JSON.parse(text));
                } catch (error) {
                    // JSON hỏng: giữ nguyên giá trị thô, không cập nhật collection.
                }
            }
            return api;
        },
        delete(key) {
            return base.delete(key);
        },
        get size() { return snapshot().size; },
        keys() { return snapshot().keys(); },
        values() { return snapshot().values(); },
        entries() { return snapshot().entries(); },
        forEach(fn, thisArg) { snapshot().forEach(fn, thisArg); },
        [Symbol.iterator]() { return snapshot().entries(); },
    };

    function readLive(key) {
        if (!Object.prototype.hasOwnProperty.call(COLLECTION_KEYS, key)) return undefined;
        if (!api.__ctx || typeof api.__ctx.getCollection !== 'function') return undefined;
        try {
            return JSON.stringify(api.__ctx.getCollection(COLLECTION_KEYS[key]));
        } catch (error) {
            return undefined;
        }
    }

    /**
     * Bản sao chụp gồm các key thường (aov_current_user, favorites, history, ...) +
     * các collection đã có dữ liệu (kèm theo người dùng đã chạm tới) qua key cũ
     * tương ứng. KHÔNG mang theo bản nháp aov_draft_*: bản nháp là nội bộ một phiên
     * mở trang, trang sau tự dựng lại từ dữ liệu collection mang theo. Nhờ vậy dữ
     * liệu thuần từ file không bị "kẹt" qua các lần mở trang (file được sửa vẫn có
     * hiệu lực), còn thay đổi của người dùng vẫn giữ nguyên.
     */
    function snapshot() {
        const out = new Map();
        const hadDraft = new Set();
        for (const [key, value] of base) {
            if (key.startsWith('aov_draft_')) {
                hadDraft.add(key.slice('aov_draft_'.length));
                continue;
            }
            out.set(key, value);
        }
        for (const key of Object.keys(COLLECTION_KEYS)) {
            if (!hadDraft.has(COLLECTION_KEYS[key]) && !out.has(key)) continue;
            const live = readLive(key);
            if (live !== undefined) out.set(key, live);
        }
        return out;
    }

    return api;
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
    const { page, search = '', storage = new Map(), login = null, failData = [], data = {}, api = null } = options;
    const brokenFiles = new Set(Array.isArray(failData) ? failData : [failData].filter(Boolean));

    // "File" heroes.json dùng chung cho API /api/heroes. Truyền cùng object api qua
    // nhiều lần open() để mô phỏng file được ghi bền (giống chạy thật).
    const heroesApi = api || createHeroesApi(null);

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
    const local = createStorage(storage);

    // auth.js lưu session dạng chuỗi thô (không JSON) trong aov_current_user.
    // Trong thực tế session luôn đi kèm tài khoản có thật trong aov_users
    // (registerUser/loginUser đảm bảo điều đó), nên ở đây cũng vậy để các trang
    // kiểm tra findUser() chạy đúng như trình duyệt.
    if (login) {
        local.set('aov_current_user', String(login));

        const usersFile = path.join(ROOT, 'src', 'data', 'users.json');
        const users = local.has('aov_users')
            ? JSON.parse(local.get('aov_users'))
            : (fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile, 'utf8')) : []);

        if (!users.some((user) => user.username === String(login))) {
            users.push({
                username: String(login),
                password: 'test123',
                displayName: String(login),
                joinedAt: '2025-01-01T00:00:00.000Z',
            });
        }

        local.set('aov_users', JSON.stringify(users));
    }

    // Dữ liệu test dựng sẵn theo key cũ (aov_users/aov_posts/...) được đưa vào bản
    // nháp của dataStore để khi mở trang nó thay thế hẳn file JSON. Không đè lên bản
    // nháp đã có (nếu không sẽ khôi phục lại những thứ đã xoá trong lần mở trước).
    for (const key of Object.keys(COLLECTION_KEYS)) {
        const draftKey = 'aov_draft_' + COLLECTION_KEYS[key];
        if (local.__base.has(key) && !local.__base.has(draftKey)) {
            local.__base.set(draftKey, local.__base.get(key));
        }
    }

    const document = {
        body: makeNode('body', { 'data-page': 'page' }),
        documentElement: makeNode('html'),
        listeners: {},
        getElementById(id) {
            if (byId.has(id)) {
                const cached = byId.get(id);
                // Node đã bị innerHTML ghi đè thì bỏ đi và tìm lại node mới trong cây.
                if (!cached.__detached) return cached;
                byId.delete(id);
            }

            // innerHTML vừa tạo ra phần tử mới thì tìm trong cây DOM rồi đăng ký lại
            for (const el of byId.values()) {
                if (el.__detached) continue;
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
                if (el.__detached) continue;
                if (el.matches(selector)) out.push(el);
                walkAll(el, (node) => { if (node.matches(selector)) out.push(node); });
            }
            return out;
        },
        addEventListener(type, fn) { (document.listeners[type] = document.listeners[type] || []).push(fn); },
        createElement: () => makeNode('div'),
    };

    // location tách riêng ra biến để history.replaceState() cập nhật được,
    // đúng như trình duyệt (dùng để test trạng thái lọc trên URL của trang Feed).
    const location = {
        pathname: '/' + page,
        search,
        href: '/' + page + search,
        reload: () => { reloadCount += 1; },
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
        location,
        history: {
            /** Ghi URL mà không tải lại trang; cập nhật cả pathname lẫn search. */
            replaceState(_state, _title, url) {
                const [path, query] = String(url).split('?');
                location.pathname = path;
                location.search = query ? '?' + query : '';
                location.href = location.pathname + location.search;
            },
            pushState(_state, _title, url) {
                this.replaceState(_state, _title, url);
            },
        },
        navigator: { userAgent: 'node' },
        crypto: WEB_CRYPTO,
        TextEncoder,
        TextDecoder,
        URLSearchParams,
        alert(message) { alerts.push(String(message)); },
        confirm: () => true,
        setTimeout,
        clearTimeout,
        fetch: async (url, fetchOptions = {}) => {
            const target = String(url);
            const pathname = target.split('?')[0].replace(/\/+$/, '');

            // API quản lý tướng (đọc/ghi "file" heroes.json) — giống vite.config.js.
            if (pathname === '/api/heroes' || pathname.startsWith('/api/heroes/')) {
                return handleHeroesApi(heroesApi, pathname, fetchOptions);
            }

            const name = path.basename(target);
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
    local.__ctx = ctx;

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
        /** "File" heroes.json mà API /api/heroes đang đọc/ghi. */
        api: heroesApi,
        run: start,
        el: (id) => document.getElementById(id),
        settled: () => new Promise((resolve) => setTimeout(resolve, 60)),
        /** Chạy đoạn code trong ngữ cảnh trang để kiểm tra hàm nội bộ của file JS. */
        runInPage: (code) => vm.runInContext(code, ctx),
        /** Số lần trang gọi location.reload() (dùng để test nút "Tải lại trang"). */
        reloadCount: () => reloadCount,
        /** location hiện tại (đã tính cả các lần history.replaceState). */
        location,
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
