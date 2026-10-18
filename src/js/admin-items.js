/**
 * admin-items.js - Quản lý Trang bị (mục "Trang bị" của trang Quản lý)
 *
 * File này là MỘT mục của khung quản trị src/pages/admin.html?tab=items. Tab "Trang bị"
 * đã được khai báo sẵn trong admin-shell.js với trường scripts: ['admin-items.js'] nên
 * KHÔNG cần sửa admin.html hay admin-shell.js: shell tự nạp file này bằng thẻ <script>
 * chèn động khi người dùng mở mục, rồi gọi renderItemAdminSection() mỗi lần mở mục.
 * Đoạn đăng ký ở CUỐI file gọi registerAdminSection() (chỉ có tác dụng khi admin-shell.js
 * đã nạp). Vì file được chèn động SAU khi DOMContentLoaded đã bắn nên không cần (và không
 * nên) thêm handler DOMContentLoaded tự khởi tạo như hero-admin.js.
 *
 * File gộp cả LỚP DỮ LIỆU (đọc/ghi items.json qua API) lẫn GIAO DIỆN (bảng + form) để đúng
 * yêu cầu "xây dựng giao diện và logic đầy đủ cho admin-items.js" và không phải nạp thêm
 * file JS nào khác.
 *
 * NHIỆM VỤ (AD05 + AD06)
 *   - Bảng TẤT CẢ trang bị lấy từ GET /api/items (đọc thẳng src/data/items.json), có tìm
 *     nhanh theo tên, ô đếm, cột Sửa / Xóa cho từng dòng.
 *   - Form thêm / sửa với validate đầy đủ các trường của item: tên, loại, giá, ảnh, 14 chỉ
 *     số trong item.stats, nội tại, mô tả, trang bị liên quan, nổi bật.
 *   - Thêm / sửa ghi qua PUT /api/items. KHÁC /api/heroes, bộ sưu tập items chỉ có 2 route:
 *       GET /api/items  -> đọc cả mảng trang bị
 *       PUT /api/items  -> ghi ĐÚNG cả mảng (server không cấp id, không có POST / PUT theo id)
 *     nên mọi thao tác ghi đều tự đọc mảng hiện tại, tự cấp id (id lớn nhất + 1) rồi PUT lại
 *     toàn bộ (xem vite.config.js). /api/builds cũng vậy (dùng lúc xoá để dọn tham chiếu).
 *   - XÓA AN TOÀN (AD06): ngoài việc gỡ trang bị khỏi items.json, deleteItem() còn dọn mọi
 *     tham chiếu tới id đó:
 *       + items[].related của các trang bị còn lại  -> gộp chung lần PUT /api/items đó luôn
 *       + builds[].items và builds[].phases[].items -> PUT /api/builds
 *       + heroes[].recommendedBuild                 -> PUT /api/heroes/:id (gửi cả tướng)
 *       + yêu thích người dùng aov_favorites.item   -> removeFavorite() của storage.js
 *     Các trang đều tự chịu được id không còn (hiện "không tìm thấy") nhưng dọn sạch sẽ hơn.
 *
 * API đọc/ghi trực tiếp vào src/data/items.json nên thay đổi của admin hiện ra ở mọi trang
 * (Danh sách trang bị, Chi tiết, Trang chủ, Build, Yêu thích...) và giữ nguyên sau khi tải
 * lại trang. Khi API không chạy được (vd mở bằng Live Server), loadItems() tự lùi về đọc
 * file tĩnh để trang vẫn hiển thị được (chỉ đọc, không ghi).
 *
 * PHÂN QUYỀN (fail-closed như hero-admin.js):
 *   - requireAdmin() trong auth.js chặn ở đầu <body> của admin.html.
 *   - initItemAdminPage() kiểm tra lại isAdmin() sau khi chờ usersReady.
 *   - Tầng dữ liệu chặn lần nữa: createItem()/updateItem()/deleteItem() đều gọi
 *     canManageItems(), gọi thẳng từ console cũng không sửa được khi không phải admin.
 *
 * Ảnh trang bị: giữ dạng ĐƯỜNG DẪN FILE ("items/kiem-fafnir.png") chứ không upload data URL
 * như mục Tướng, vì items.json dùng chung cho mọi trang và audit-data.cjs đang kiểm ảnh khớp
 * ^items/[a-z0-9-]+\.png$.
 *
 * DÙNG LẠI: loadData() (loadData.js), DATA_PATH (config.js), isLoggedIn()/isAdmin()/
 * renderErrors()/renderSuccess() (auth.js), escapeHtml()/imageUrl()/renderNotFound()
 * (components.js), matchKeyword()/debounce() (search.js), getFavorites()/removeFavorite()
 * (storage.js).
 */

/* =====================================================================
 * PHẦN 1 — LỚP DỮ LIỆU (đọc / CRUD / dọn tham chiếu)
 * ===================================================================== */

/* ---------- Hằng số ---------- */

/** Địa chỉ API trang bị / build (BASE_PATH khai báo trong config.js, luôn là "/"). */
const ITEMS_API = BASE_PATH + 'api/items';
const BUILDS_API = BASE_PATH + 'api/builds';

/**
 * Địa chỉ API tướng, chỉ dùng lúc xoá trang bị để dọn heroes[].recommendedBuild.
 * KHÔNG dùng chung hằng HEROES_API của heroData.js vì hai file được nạp cùng lúc trong
 * trang Quản lý — khai báo lại const trùng tên ở phạm vi global sẽ ném SyntaxError và làm
 * hỏng cả trang, nên mỗi file tự giữ hằng của mình.
 */
const ITEM_ADMIN_HEROES_API = BASE_PATH + 'api/heroes';

/** Bản trang bị đang đọc được, ghi lại sau mỗi loadItems() để tra cứu đồng bộ. */
let itemsCache = [];

/** Loại trang bị hợp lệ — đúng 6 loại trong data/items.json (khớp ITEM_TYPE_ORDER của item.js). */
const ITEM_TYPES = ['Công', 'Phép', 'Thủ', 'Tốc chạy', 'Phụ trợ', 'Rừng'];

/**
 * Nhãn tiếng Việt cho key trong item.stats. Trùng khớp ITEM_STAT_LABEL của item.js nhưng
 * trang Quản lý không nạp item.js (trang đó chỉ dành cho Danh sách + Chi tiết).
 */
const ITEM_STAT_LABELS = {
    attack: 'Sát thương',
    attackSpeed: 'Tốc độ đánh',
    critChance: 'Tỉ lệ chí mạng',
    penetration: 'Xuyên giáp',
    lifesteal: 'Hồi máu',
    magicPower: 'Sức mạnh phép',
    cooldownReduction: 'Giảm hồi chiêu',
    mana: 'Năng lượng',
    manaRegen: 'Hồi năng lượng',
    armor: 'Giáp',
    magicResist: 'Kháng phép',
    hp: 'Máu',
    hpRegen: 'Tốc độ hồi máu',
    moveSpeed: 'Tốc độ chạy',
};

/**
 * Thứ tự hiển thị các chỉ số trong form và trên bảng — đúng thứ tự ưu tiên của
 * ITEM_STAT_PRIORITY trong item.js (chỉ số "đậm" hiện trước).
 */
const ITEM_STAT_KEYS = [
    'attack', 'magicPower', 'armor', 'magicResist', 'hp', 'moveSpeed',
    'attackSpeed', 'critChance', 'penetration', 'lifesteal',
    'hpRegen', 'cooldownReduction', 'mana', 'manaRegen',
];

/** Độ dài tối thiểu của tên trang bị (ký tự). */
const ITEMS_NAME_MIN = 2;

/** Giá tối đa (Bạc) — chặn nhập nhầm thêm số 0 ở cuối, mọi item thật đều nhỏ hơn. */
const ITEMS_PRICE_MAX = 100000;

/* ---------- Chuẩn hoá id / dữ liệu đọc từ API ---------- */

/**
 * Chuẩn hoá id trang bị về chuỗi ("101" và 101 là một).
 * @returns {string} chuỗi rỗng nếu không có id.
 */
function normalizeItemId(value) {
    if (value === null || value === undefined || value === '') return '';

    const number = Number(value);
    return Number.isFinite(number) ? String(number) : String(value).trim();
}

/**
 * Bỏ trang bị hỏng (không phải object hoặc thiếu id) và chống trùng id.
 * Giữ nguyên thứ tự đang có nên item admin thêm vẫn nằm ở cuối danh sách.
 */
function normalizeItems(list) {
    if (!Array.isArray(list)) return [];

    const seen = new Set();

    return list.filter((item) => {
        if (!item || typeof item !== 'object') return false;

        const id = normalizeItemId(item.id);
        if (!id || seen.has(id)) return false;

        seen.add(id);
        return true;
    });
}

/**
 * Toàn bộ trang bị đang đọc được (cache sau lần loadItems() gần nhất).
 * @returns {Array}
 */
function getCachedItems() {
    return Array.isArray(itemsCache) ? itemsCache : [];
}

/**
 * Đọc toàn bộ trang bị.
 * Ưu tiên API (đọc file items.json hiện tại); khi API lỗi (vd chạy Live Server không có
 * backend) thì lùi về đọc file JSON tĩnh để trang vẫn hiển thị được.
 * @returns {Promise<Array>} luôn là mảng, rỗng nếu dữ liệu hỏng.
 */
async function loadItems() {
    try {
        const response = await fetch(ITEMS_API, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Không tải được trang bị (HTTP ${response.status})`);

        const data = await response.json();
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
        itemsCache = normalizeItems(list);
        return itemsCache;
    } catch (error) {
        console.error('Không đọc được dữ liệu trang bị từ API, đọc file tĩnh', error);

        const fallback = await loadData(DATA_PATH.items);
        if (Array.isArray(fallback)) itemsCache = normalizeItems(fallback);

        return getCachedItems();
    }
}

/**
 * Tìm một trang bị theo id trong cache (so sánh đã chuẩn hoá kiểu).
 * Chỉ trả kết quả sau khi trang đã gọi loadItems().
 * @param {number|string} itemId
 * @returns {object|null}
 */
function findItemById(itemId) {
    const id = normalizeItemId(itemId);
    if (!id) return null;

    return getCachedItems().find((item) => normalizeItemId(item.id) === id) || null;
}

/* ---------- Phân quyền ---------- */

/**
 * Người dùng hiện tại có quyền thêm / sửa / xoá trang bị không.
 * Chỉ tài khoản admin; trang nào không nạp auth.js (hoặc chưa đăng nhập) -> false.
 * @returns {boolean}
 */
function canManageItems() {
    return Boolean(
        typeof isLoggedIn === 'function'
        && isLoggedIn()
        && typeof isAdmin === 'function'
        && isAdmin(),
    );
}

/* ---------- Validate ---------- */

/**
 * Sinh alias (đường dẫn url thân thiện) từ tên trang bị: bỏ dấu, viết thường, nối bằng -.
 * @param {string} name
 * @returns {string}
 */
function makeItemAlias(name) {
    const text = String(name || '').trim().toLowerCase();
    if (!text) return '';

    if (typeof text.normalize !== 'function') return text.replace(/\s+/g, '-');

    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Kiểm tra dữ liệu form thêm / sửa trang bị.
 * Tách riêng khỏi createItem()/updateItem() để cùng một bộ quy tắc dùng cho form và test.
 *
 * Quy tắc:
 *   - tên: bắt buộc, tối thiểu ITEMS_NAME_MIN ký tự
 *   - loại: bắt buộc, phải nằm trong ITEM_TYPES
 *   - giá: bắt buộc, số nguyên lớn hơn hoặc bằng 0 và không vượt ITEMS_PRICE_MAX
 *   - ảnh: KHÔNG bắt buộc; là đường dẫn file ảnh (vd "items/kiem-fafnir.png"). Chặn dán
 *     data URL vì items.json dùng chung cho mọi trang, data URL vài MB sẽ làm file phình
 *     to và hỏng format ảnh mà audit-data.cjs đang kiểm.
 *   - chỉ số: từng ô để trống thì bỏ qua, có giá trị thì phải là số >= 0
 *   - nội tại / mô tả: không bắt buộc
 *   - trang bị liên quan: chuỗi id cách nhau dấu phẩy (hoặc mảng), id phải là số, tự bỏ id
 *     rỗng / trùng / chính nó (không cho item tự trỏ sang mình)
 *   - nổi bật: checkbox, false nếu không tick
 *
 * @param {object} input dữ liệu thô đọc từ form.
 * @returns {{ valid: boolean, errors: string[], values: object }} values đã chuẩn hoá,
 *          chỉ dùng khi valid === true.
 */
function validateItemForm(input) {
    const errors = [];
    const source = input && typeof input === 'object' ? input : {};

    const name = String(source.name === undefined ? '' : source.name).trim();
    const image = String(source.image === undefined ? '' : source.image).trim();

    // Loại: phải đúng một trong 6 loại của data/items.json (form dùng <select>).
    const type = String(source.type === undefined ? '' : source.type).trim();
    if (!type) {
        errors.push('Bạn phải chọn loại trang bị.');
    } else if (!ITEM_TYPES.includes(type)) {
        errors.push(`Loại trang bị phải là một trong: ${ITEM_TYPES.join(', ')}.`);
    }

    // Giá: số nguyên >= 0, không vượt ITEMS_PRICE_MAX.
    const rawPrice = String(source.price === undefined ? '' : source.price).trim();
    const price = Number(rawPrice);
    if (rawPrice === '' || !Number.isFinite(price) || price < 0) {
        errors.push('Giá trang bị phải là số lớn hơn hoặc bằng 0.');
    } else if (!Number.isInteger(price)) {
        errors.push('Giá trang bị phải là số nguyên (Bạc).');
    } else if (price > ITEMS_PRICE_MAX) {
        errors.push(`Giá trang bị không được vượt quá ${ITEMS_PRICE_MAX} Bạc.`);
    }

    // Ảnh: bắt buộc là đường dẫn file, không nhận dán data URL.
    if (image && image.indexOf('data:') === 0) {
        errors.push('Ảnh trang bị phải là đường dẫn file ảnh (vd "items/kiem-fafnir.png"), không nhận dán data URL.');
    }

    // Chỉ số: bỏ ô trống, ô có giá trị thì phải là số >= 0.
    const rawStats = source.stats && typeof source.stats === 'object' ? source.stats : {};
    const stats = {};
    ITEM_STAT_KEYS.forEach((key) => {
        const raw = rawStats[key];
        if (raw === undefined || raw === null || String(raw).trim() === '') return;

        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) {
            errors.push(`Chỉ số "${ITEM_STAT_LABELS[key] || key}" phải là số lớn hơn hoặc bằng 0.`);
            return;
        }

        stats[key] = value;
    });

    // Trang bị liên quan: nhận mảng id hoặc chuỗi "102, 103"; bỏ id rỗng / trùng / chính nó.
    const selfId = normalizeItemId(source.id);
    const rawRelated = Array.isArray(source.related)
        ? source.related
        : String(source.related === undefined ? '' : source.related).split(',');
    const related = [];

    rawRelated.forEach((rawId) => {
        const text = String(rawId).trim();
        if (!text) return;

        const id = Number(text);
        if (!Number.isFinite(id) || id < 0) {
            errors.push(`Mã trang bị liên quan "${text}" không hợp lệ (phải là số).`);
            return;
        }

        if (selfId && normalizeItemId(id) === selfId) return;
        if (!related.includes(id)) related.push(id);
    });

    if (!name) {
        errors.push('Tên trang bị không được để trống.');
    } else if (name.length < ITEMS_NAME_MIN) {
        errors.push(`Tên trang bị phải có ít nhất ${ITEMS_NAME_MIN} ký tự.`);
    }

    return {
        valid: !errors.length,
        errors,
        values: {
            name,
            alias: makeItemAlias(name),
            image,
            type,
            price,
            stats,
            passive: String(source.passive === undefined ? '' : source.passive).trim(),
            description: String(source.description === undefined ? '' : source.description).trim(),
            related,
            featured: source.featured === true,
        },
    };
}

/* ---------- CRUD (chỉ admin, ghi qua API) ---------- */

/**
 * Gửi JSON tới API nội bộ và trả dữ liệu phản hồi.
 * @param {string} url
 * @param {object} [options] method / body.
 * @returns {Promise<object|null>} null nếu request lỗi.
 */
async function requestJsonApi(url, options) {
    try {
        const response = await fetch(url, Object.assign({
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        }, options));

        if (!response.ok) {
            console.error(`API ${url} trả về HTTP ${response.status}. Hãy chạy "npm run dev" (nạp vite.config.js).`);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error(
            'Không gọi được API nội bộ. Hãy khởi động lại "npm run dev" để nạp vite.config.js '
            + '(nếu server đang chạy từ trước khi tạo vite.config.js thì /api/items sẽ không tồn tại).',
            error,
        );
        return null;
    }
}

/**
 * Ghi TOÀN BỘ mảng trang bị vào items.json.
 * /api/items không có POST/PUT theo id nên mọi thay đổi đều đi qua đây.
 * @param {Array} list mảng trang bị đã chuẩn bị sẵn.
 * @returns {Promise<boolean>} true nếu ghi thành công.
 */
async function writeItems(list) {
    const result = await requestJsonApi(ITEMS_API, {
        method: 'PUT',
        body: JSON.stringify(list),
    });

    return Boolean(result && result.ok === true);
}

/**
 * Id kế tiếp cho item mới: id lớn nhất hiện có + 1 (server không tự cấp).
 * @param {Array} list
 * @returns {number}
 */
function nextItemId(list) {
    const max = list.reduce((current, item) => {
        const value = Number(item && item.id);
        return Number.isFinite(value) && value > current ? value : current;
    }, 0);

    return Math.floor(max) + 1;
}

/**
 * Bỏ id trang bị khỏi mảng related của từng trang bị (dùng lúc xoá, AD06).
 * Trang bị không có related thì giữ nguyên, không tự thêm key related rỗng.
 * @param {Array} list
 * @param {string} itemId id đã chuẩn hoá.
 * @returns {Array} mảng mới (không làm thay đổi mảng gốc).
 */
function stripItemFromRelated(list, itemId) {
    const id = normalizeItemId(itemId);
    if (!id) return list;

    return list.map((item) => {
        if (!item || !Array.isArray(item.related)) return item;
        if (!item.related.some((raw) => normalizeItemId(raw) === id)) return item;

        return Object.assign({}, item, {
            related: item.related.filter((raw) => normalizeItemId(raw) !== id),
        });
    });
}

/**
 * Thêm trang bị mới. Item mới nằm ở CUỐI danh sách nên không đẩy thứ tự item mẫu.
 * Client tự cấp id (id lớn nhất + 1) rồi PUT lại cả mảng.
 *
 * Chỉ admin.
 *
 * @param {object} input dữ liệu form (cùng schema với validateItemForm).
 * @returns {Promise<object|null>} trang bị vừa tạo, null nếu không đủ quyền, dữ liệu
 *          không hợp lệ hoặc lưu thất bại.
 */
async function createItem(input) {
    if (!canManageItems()) return null;

    const checked = validateItemForm(input);
    if (!checked.valid) return null;

    const list = getCachedItems();
    const created = Object.assign({ id: nextItemId(list) }, checked.values);

    const next = list.concat(created);
    if (!await writeItems(next)) return null;

    itemsCache = normalizeItems(next);
    return created;
}

/**
 * Sửa trang bị đã có: giữ nguyên id, chỉ cập nhật nội dung.
 *
 * @param {number|string} itemId
 * @param {object} input dữ liệu form (cùng schema với validateItemForm).
 * @returns {Promise<object|null>} trang bị sau khi sửa, null nếu không đủ quyền, không
 *          tìm thấy, dữ liệu không hợp lệ hoặc lưu thất bại.
 */
async function updateItem(itemId, input) {
    if (!canManageItems()) return null;

    const id = normalizeItemId(itemId);
    if (!id) return null;

    const list = getCachedItems();
    const index = list.findIndex((item) => normalizeItemId(item.id) === id);
    if (index === -1) return null;

    const checked = validateItemForm(input);
    if (!checked.valid) return null;

    // Giữ nguyên id (và mọi trường lạ khác đang có), chỉ ghi đè nội dung form.
    const updated = Object.assign({}, list[index], checked.values, { id: list[index].id });

    const next = list.slice();
    next[index] = updated;

    if (!await writeItems(next)) return null;

    itemsCache = normalizeItems(next);
    return updated;
}

/**
 * Xoá một trang bị và dọn sạch tham chiếu tới nó (AD06).
 *
 * Chỉ admin; thiếu quyền thì trả false và file giữ nguyên. Nếu bước ghi items.json thất
 * bại thì chưa đụng tới builds / heroes / yêu thích gì cả.
 *
 * @param {number|string} itemId
 * @returns {Promise<boolean>} true nếu trang bị đã bị xoá.
 */
async function deleteItem(itemId) {
    if (!canManageItems()) return false;

    const id = normalizeItemId(itemId);
    if (!id || !findItemById(id)) return false;

    const list = getCachedItems();

    // Gỡ item khỏi items.json và khỏi related của các item còn lại trong CÙNG một lần PUT.
    const remaining = stripItemFromRelated(
        list.filter((item) => normalizeItemId(item.id) !== id),
        id,
    );

    if (!await writeItems(remaining)) return false;

    itemsCache = normalizeItems(remaining);

    // Dọn tham chiếu ở các dữ liệu khác (AD06). Dọn lỗi từng phần không được làm trang báo
    // lỗi xoá thất bại — item đã xoá khỏi items.json rồi.
    await purgeItemReferences(id);

    return true;
}

/* ---------- Dọn tham chiếu khi xoá (AD06) ---------- */

/**
 * Đọc một collection qua API để dọn tham chiếu. Trả null nếu không đọc được (lúc đó phải
 * bỏ qua việc dọn collection đó thay vì ghi đè dữ liệu mù).
 * @param {string} url
 * @returns {Promise<Array|null>}
 */
async function readCollectionForCleanup(url) {
    const data = await requestJsonApi(url);
    if (!Array.isArray(data)) {
        console.warn(`Không đọc được ${url} để dọn tham chiếu trang bị, bỏ qua.`);
        return null;
    }

    return data;
}

/**
 * Ghi cả một collection qua API (builds chỉ có GET/PUT cả mảng, không có PUT theo id).
 * @param {string} url
 * @param {Array} list
 * @returns {Promise<boolean>}
 */
async function writeCollection(url, list) {
    const result = await requestJsonApi(url, {
        method: 'PUT',
        body: JSON.stringify(list),
    });

    if (!result || result.ok !== true) {
        console.warn(`Không ghi được ${url} để dọn tham chiếu trang bị.`);
        return false;
    }

    return true;
}

/**
 * Dọn toàn bộ tham chiếu tới trang bị vừa bị xoá (AD06).
 * Không ném lỗi ra ngoài: dọn được phần nào hay phần nấy, phần lỗi chỉ cảnh báo.
 * @param {number|string} itemId id trang bị đã bị xoá.
 * @returns {Promise<void>}
 */
async function purgeItemReferences(itemId) {
    const id = normalizeItemId(itemId);
    if (!id) return;

    purgeItemFromFavorites(id);
    await purgeItemFromBuilds(id);
    await purgeItemFromRecommendedBuilds(id);
}

/**
 * Bỏ id trang bị khỏi aov_favorites.item (Yêu thích của người dùng).
 * Trang nào không nạp storage.js thì bỏ qua (typeof guard).
 * @param {string} itemId id đã chuẩn hoá.
 */
function purgeItemFromFavorites(itemId) {
    const id = normalizeItemId(itemId);
    if (!id) return;

    if (
        typeof getFavorites !== 'function'
        || typeof removeFavorite !== 'function'
        || !Array.isArray(getFavorites('item'))
    ) {
        return;
    }

    if (getFavorites('item').some((raw) => normalizeItemId(raw) === id)) {
        removeFavorite('item', id);
    }
}

/**
 * Bỏ id trang bị khỏi builds.items và builds[].phases[].items của mọi build.
 * Build không có item đó thì giữ nguyên object gốc (không ghi thừa).
 * @param {string} itemId id đã chuẩn hoá.
 * @returns {Promise<boolean>} true nếu đã ổn (không có gì để ghi, hoặc đã ghi xong).
 */
async function purgeItemFromBuilds(itemId) {
    const id = normalizeItemId(itemId);
    if (!id) return false;

    const builds = await readCollectionForCleanup(BUILDS_API);
    if (!Array.isArray(builds)) return false;

    let changed = false;

    const cleaned = builds.map((build) => {
        if (!build || typeof build !== 'object') return build;

        let dirty = false;

        const items = Array.isArray(build.items) ? build.items : [];
        const restItems = items.filter((raw) => normalizeItemId(raw) !== id);
        if (restItems.length !== items.length) dirty = true;

        // Các pha của build (HD01) cũng giữ id trang bị trong phases[].items.
        let phases = Array.isArray(build.phases) ? build.phases : null;
        if (phases) {
            phases = phases.map((phase) => {
                if (!phase || typeof phase !== 'object' || !Array.isArray(phase.items)) return phase;

                const restPhaseItems = phase.items.filter((raw) => normalizeItemId(raw) !== id);
                if (restPhaseItems.length === phase.items.length) return phase;

                dirty = true;
                return Object.assign({}, phase, { items: restPhaseItems });
            });
        }

        if (!dirty) return build;
        changed = true;

        const next = Object.assign({}, build, { items: restItems });
        if (phases) next.phases = phases;

        return next;
    });

    if (!changed) return true;

    return await writeCollection(BUILDS_API, cleaned);
}

/**
 * Bỏ id trang bị khỏi heroes[].recommendedBuild của mọi tướng.
 * PUT /api/heroes/:id của server dựng lại tướng từ body (sanitizeHero) nên BẮT BUỘC gửi cả
 * object tướng đầy đủ, thiếu trường là mất dữ liệu tướng đó. Dùng vòng lặp chờ tuần tự: mỗi
 * PUT ghi lại heroes.json, gọi song song sẽ ghi đè nhau.
 * @param {string} itemId id đã chuẩn hoá.
 * @returns {Promise<boolean>} true nếu đã ổn (không có gì để ghi, hoặc đã ghi xong).
 */
async function purgeItemFromRecommendedBuilds(itemId) {
    const id = normalizeItemId(itemId);
    if (!id) return false;

    const heroes = await readCollectionForCleanup(ITEM_ADMIN_HEROES_API);
    if (!Array.isArray(heroes)) return false;

    const affected = heroes.filter((hero) => hero
        && Array.isArray(hero.recommendedBuild)
        && hero.recommendedBuild.some((raw) => normalizeItemId(raw) === id));

    if (!affected.length) return true;

    let ok = true;

    for (const hero of affected) {
        const updated = Object.assign({}, hero, {
            recommendedBuild: hero.recommendedBuild.filter((raw) => normalizeItemId(raw) !== id),
        });

        const saved = await requestJsonApi(
            `${ITEM_ADMIN_HEROES_API}/${encodeURIComponent(normalizeItemId(hero.id))}`,
            { method: 'PUT', body: JSON.stringify(updated) },
        );

        if (!saved || saved.id === undefined) {
            ok = false;
            console.warn(`Không gỡ được trang bị ${id} khỏi recommendedBuild của tướng "${hero.name}".`);
        }
    }

    return ok;
}

/* =====================================================================
 * PHẦN 2 — GIAO DIỆN (bảng + form + sự kiện)
 * ===================================================================== */

/** Từ khoá đang gõ trong ô tìm kiếm; lưu trong bộ nhớ, không ghi lên URL. */
let itemAdminKeyword = '';

/** Số chỉ số chính in trên mỗi dòng bảng (trang chi tiết in toàn bộ). */
const ITEM_ADMIN_STAT_LIMIT = 3;

/* ---------- Tìm kiếm & bảng ---------- */

/**
 * Toàn bộ trang bị đang lưu (đã đọc từ API /api/items).
 * @returns {Array}
 */
function getItemsAdminItems() {
    return getCachedItems();
}

/**
 * Trang bị khớp với từ khoá đang gõ (so khớp theo tên, không phân biệt hoa/thường và
 * không phân biệt dấu tiếng Việt nhờ matchKeyword).
 * @returns {Array}
 */
function getItemsAdminFilteredItems() {
    const keyword = String(itemAdminKeyword || '').trim();
    const items = getItemsAdminItems();

    if (!keyword) return items;

    return items.filter((item) => matchKeyword(item.name, keyword));
}

/**
 * Vẽ thanh công cụ: ô tìm theo tên + nút "Thêm trang bị".
 * Tái dùng class filter-bar / filter-bar__keyword như trang Quản trị bài viết.
 * @returns {Element|null} vùng chứa thanh công cụ, null nếu trang không có.
 */
function renderItemAdminToolbar() {
    const toolbar = document.getElementById('item-admin-toolbar');
    if (!toolbar) return null;

    toolbar.innerHTML = `
        <div class="filter-bar">
            <input
                type="search"
                class="filter-bar__keyword"
                id="item-admin-keyword"
                placeholder="Tìm trang bị theo tên..."
                aria-label="Tìm trang bị theo tên"
            >
            <button type="button" class="btn btn-primary btn-sm" data-item-add>Thêm trang bị</button>
        </div>
    `;

    const keywordInput = toolbar.querySelector('#item-admin-keyword');
    if (!keywordInput) return toolbar;

    // Gán sau innerHTML để không mất từ khoá đang tìm khi vẽ lại công cụ.
    keywordInput.value = itemAdminKeyword;

    // Gõ liên tục thì chỉ lọc lại sau khi ngừng gõ, tránh vẽ lại bảng mỗi ký tự.
    keywordInput.addEventListener('input', debounce(() => {
        itemAdminKeyword = keywordInput.value;
        renderItemAdminTable();
    }, 200));

    return toolbar;
}

/**
 * Vài chỉ số chính của trang bị dạng "+60 Sát thương, +30 Tốc độ đánh".
 * Lấy theo thứ tự ITEM_STAT_KEYS (chỉ số "đậm" hiện trước), tối đa ITEM_ADMIN_STAT_LIMIT.
 * @param {object} item
 * @returns {string} chuỗi đã escapeHtml, '—' nếu item không có chỉ số nào.
 */
function renderItemStatSummary(item) {
    const stats = item && item.stats && typeof item.stats === 'object' ? item.stats : {};

    const keys = ITEM_STAT_KEYS.filter((key) => {
        const value = stats[key];
        return value !== undefined && value !== null && value !== '';
    });

    if (!keys.length) return '—';

    return escapeHtml(keys
        .slice(0, ITEM_ADMIN_STAT_LIMIT)
        .map((key) => `+${stats[key]} ${ITEM_STAT_LABELS[key] || key}`)
        .join(', '));
}

/**
 * Định dạng giá trang bị kiểu Việt: 2040 -> "2.040 Bạc".
 * @param {number} price
 * @returns {string} '—' nếu giá không phải số.
 */
function formatItemPrice(price) {
    const value = Number(price);
    if (!Number.isFinite(value)) return '—';

    return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} Bạc`;
}

/**
 * Vẽ một dòng trang bị trong bảng quản trị.
 * Mọi dữ liệu đều đi qua escapeHtml() trước khi đưa vào innerHTML.
 * @param {object} item
 * @returns {string} HTML string
 */
function renderItemAdminRow(item) {
    return `
        <tr data-item-id="${escapeHtml(item.id)}">
            <td>${escapeHtml(item.id)}</td>
            <td>
                <a href="${BASE_PATH}src/pages/item-detail.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.name)}</a>
            </td>
            <td><span class="badge">${escapeHtml(item.type || '')}</span></td>
            <td>${formatItemPrice(item.price)}</td>
            <td>${renderItemStatSummary(item)}</td>
            <td>
                <button
                    type="button"
                    class="btn btn-outline btn-sm"
                    data-item-edit="${escapeHtml(item.id)}"
                >Sửa</button>
                <button
                    type="button"
                    class="btn btn-outline btn-sm"
                    data-item-delete="${escapeHtml(item.id)}"
                >Xóa</button>
            </td>
        </tr>
    `;
}

/**
 * Vẽ bảng trang bị theo từ khoá đang gõ.
 * Không item nào khớp thì hiện renderNotFound() thay cho bảng.
 */
function renderItemAdminTable() {
    const tableBox = document.getElementById('item-admin-list');
    if (!tableBox) return;

    const total = getItemsAdminItems().length;
    const items = getItemsAdminFilteredItems();
    const countEl = document.getElementById('item-admin-count');

    // Có từ khoá thì báo "đang xem / tổng", không có thì chỉ báo tổng số.
    if (countEl) {
        countEl.textContent = itemAdminKeyword.trim()
            ? `${items.length} / ${total} trang bị`
            : `${total} trang bị`;
    }

    if (!items.length) {
        tableBox.innerHTML = renderNotFound(
            total ? 'Không có trang bị nào khớp từ khoá đang tìm.' : 'Chưa có trang bị nào trong hệ thống.',
        );
        return;
    }

    tableBox.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Tên trang bị</th>
                    <th>Loại</th>
                    <th>Giá</th>
                    <th>Chỉ số chính</th>
                    <th>Thao tác</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(renderItemAdminRow).join('')}
            </tbody>
        </table>
    `;
}

/* ---------- Form thêm / sửa trang bị ---------- */

/**
 * Giá trị mặc định của form THÊM trang bị mới (loại Công, các ô còn lại trống).
 * @returns {object}
 */
function defaultItemFormValues() {
    return {
        name: '',
        image: '',
        type: ITEM_TYPES[0],
        price: '',
        stats: {},
        passive: '',
        description: '',
        related: [],
        featured: false,
    };
}

/**
 * Chuyển một trang bị đang lưu thành dữ liệu điền sẵn cho form SỬA.
 * @param {object} item
 * @returns {object}
 */
function itemFormValuesFromItem(item) {
    const stats = item.stats && typeof item.stats === 'object' ? item.stats : {};

    return {
        name: item.name || '',
        image: item.image || '',
        type: item.type || ITEM_TYPES[0],
        price: item.price === undefined || item.price === null ? '' : item.price,
        stats: ITEM_STAT_KEYS.reduce((result, key) => {
            const value = stats[key];
            result[key] = value === undefined || value === null ? '' : value;
            return result;
        }, {}),
        passive: item.passive || '',
        description: item.description || '',
        related: Array.isArray(item.related) ? item.related.slice() : [],
        featured: item.featured === true,
    };
}

/**
 * Đọc toàn bộ dữ liệu form đang mở về một object cùng schema với validateItemForm.
 * @param {Element} form thẻ <form id="item-form">.
 * @returns {object}
 */
function readItemFormValues(form) {
    const valueOf = (selector) => {
        const el = form.querySelector(selector);
        return el ? el.value : '';
    };

    const stats = {};
    ITEM_STAT_KEYS.forEach((key) => {
        stats[key] = valueOf(`#item-stat-${key}`);
    });

    const featuredInput = form.querySelector('#item-featured');

    return {
        name: valueOf('#item-name'),
        image: valueOf('#item-image'),
        type: valueOf('#item-type'),
        price: valueOf('#item-price'),
        stats,
        passive: valueOf('#item-passive'),
        description: valueOf('#item-description'),
        related: valueOf('#item-related'),
        featured: Boolean(featuredInput && featuredInput.checked),
    };
}

/**
 * Vẽ ảnh xem trước trong form (thay nội dung của #item-image-preview).
 * @param {Element} form thẻ <form id="item-form">.
 * @param {string} image đường dẫn ảnh (rỗng thì xoá ảnh xem trước).
 */
function renderItemAdminImagePreview(form, image) {
    const preview = form.querySelector('#item-image-preview');
    if (!preview) return;

    preview.innerHTML = image
        ? `<img src="${escapeHtml(imageUrl(image))}" alt="Ảnh xem trước">`
        : '';
}

/**
 * Render form thêm / sửa trang bị.
 * Dùng chung cho cả hai chế độ nên không có form riêng cho việc sửa:
 *   - renderItemAdminForm()            -> form thêm mới (trống)
 *   - renderItemAdminForm(itemToEdit)  -> form sửa, tự điền sẵn dữ liệu cũ
 *
 * Trạng thái đang sửa được ghi ở data-edit-id của chính thẻ <form>.
 *
 * @param {object} [editingItem] trang bị cần sửa, bỏ trống nếu đang thêm mới.
 */
function renderItemAdminForm(editingItem) {
    const box = document.getElementById('item-admin-form');
    if (!box) return;

    const editing = editingItem || null;
    const values = editing ? itemFormValuesFromItem(editing) : defaultItemFormValues();

    const typeHtml = ITEM_TYPES.map((type) => `
            <option value="${escapeHtml(type)}"${values.type === type ? ' selected' : ''}>${escapeHtml(type)}</option>`).join('');

    const statsHtml = ITEM_STAT_KEYS.map((key) => `
        <div class="item-stat-field">
            <label for="item-stat-${key}">${escapeHtml(ITEM_STAT_LABELS[key] || key)}</label>
            <input type="number" min="0" step="any" id="item-stat-${key}" placeholder="Không có" value="${escapeHtml(values.stats[key])}">
        </div>
    `).join('');

    box.innerHTML = `
        <form class="feed-form${editing ? ' is-editing' : ''}" id="item-form" novalidate${editing ? ` data-edit-id="${escapeHtml(editing.id)}"` : ''}>
            <h2>${editing ? 'Sửa trang bị' : 'Thêm trang bị mới'}</h2>
            ${editing ? `<p class="feed-form__hint">Đang sửa trang bị “${escapeHtml(editing.name)}” (mã ${escapeHtml(editing.id)}). Thay đổi sẽ ghi đè trang bị cũ, giữ nguyên id.</p>` : ''}
            <div id="item-form-errors"></div>

            <div class="form-group">
                <label for="item-name">Tên trang bị *</label>
                <input type="text" id="item-name" placeholder="Ví dụ: Kiếm Fafnir" value="${escapeHtml(values.name)}">
            </div>

            <div class="form-group">
                <label for="item-type">Loại *</label>
                <select id="item-type">${typeHtml}
                </select>
            </div>

            <div class="form-group">
                <label for="item-price">Giá (Vàng) *</label>
                <input type="number" min="0" step="1" id="item-price" placeholder="Ví dụ: 2040" value="${escapeHtml(values.price)}">
            </div>

            <div class="form-group">
                <label for="item-image">Ảnh trang bị</label>
                <div class="item-image-controls" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                    <input type="text" id="item-image" placeholder="items/kiem-fafnir.png" value="${escapeHtml(values.image)}" aria-describedby="item-image-hint" style="flex:1 1 240px; min-width:200px;">
                    <input type="file" id="item-image-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display:none;">
                    <button type="button" class="btn btn-sm btn-outline" id="item-image-pick">Chọn file ảnh</button>
                    <button type="button" class="btn btn-sm btn-ghost" id="item-image-clear">Xóa</button>
                </div>
                <div id="item-image-preview">${values.image ? `<img src="${escapeHtml(imageUrl(values.image))}" alt="Ảnh xem trước">` : ''}</div>
                <p class="feed-form__hint" id="item-image-hint">Chọn file ảnh (sẽ tự điền đường dẫn dạng <code>items/tên-file</code>). Ảnh lưu dạng đường dẫn chung cho toàn trang.</p>
            </div>

            <div class="form-group">
                <label>Chỉ số (để trống ô nào không có chỉ số đó)</label>
                <div class="item-stat-grid">${statsHtml}
                </div>
            </div>

            <div class="form-group">
                <label for="item-passive">Nội tại</label>
                <input type="text" id="item-passive" placeholder="Đòn đánh thường gây thêm sát thương..." value="${escapeHtml(values.passive)}">
            </div>

            <div class="form-group">
                <label for="item-description">Mô tả</label>
                <textarea id="item-description" rows="3" placeholder="Mô tả ngắn về công dụng của trang bị">${escapeHtml(values.description)}</textarea>
            </div>

            <div class="form-group">
                <label>Trang bị liên quan</label>
                <input type="hidden" id="item-related" value="${escapeHtml((values.related || []).join(', '))}">
                <div class="item-related-toolbar" style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:8px;">
                    <input type="text" id="item-related-filter" placeholder="Tìm kiếm theo mã hoặc tên...">
                    <button type="button" class="btn btn-sm btn-ghost" id="item-related-clear">Bỏ chọn tất cả</button>
                </div>
                <div id="item-related-list" class="item-related-grid"></div>
                <p class="feed-form__hint">Chọn các trang bị liên quan (hiển thị Mã – Tên). Có thể tìm kiếm để lọc nhanh.</p>
            </div>

            <div class="form-group">
                <label class="item-featured-option" for="item-featured">
                    <input type="checkbox" id="item-featured"${values.featured ? ' checked' : ''}>
                    Đặt ở khối Trang bị nổi bật trên Trang chủ
                </label>
            </div>

            <div class="feed-form__actions">
                <button type="submit" class="btn btn-primary">${editing ? 'Lưu thay đổi' : 'Thêm trang bị'}</button>
                ${editing ? '<button type="button" class="btn btn-outline" data-item-cancel>Huỷ</button>' : ''}
            </div>
        </form>
    `;

    const form = box.querySelector('#item-form');
    if (!form) return;

    // Gõ đường dẫn ảnh là thấy ngay ảnh xem trước, không cần submit.
    const imageInput = form.querySelector('#item-image');
    if (imageInput) {
        imageInput.addEventListener('input', () => {
            renderItemAdminImagePreview(form, imageInput.value);
        });
    }

    // File ảnh: chọn file -> tự điền đường dẫn items/xxx
    const imageFileInput = form.querySelector('#item-image-file');
    const imagePickBtn = form.querySelector('#item-image-pick');
    const imageClearBtn = form.querySelector('#item-image-clear');
    if (imagePickBtn && imageFileInput) {
        imagePickBtn.addEventListener('click', () => imageFileInput.click());
        imageFileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const name = file.name || 'image.png';
            let ext = name.split('.').pop().toLowerCase();
            if (!['png','jpg','jpeg','webp','svg'].includes(ext)) ext = 'png';
            let base = name.replace(/\.[^.]+$/, '').toLowerCase();
            base = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            base = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
            const pathImg = 'items/' + base + '.' + ext;
            if (imageInput) {
                imageInput.value = pathImg;
                renderItemAdminImagePreview(form, pathImg);
            }
            imageFileInput.value = '';
        });
    }
    if (imageClearBtn && imageInput) {
        imageClearBtn.addEventListener('click', () => {
            imageInput.value = '';
            renderItemAdminImagePreview(form, '');
        });
    }

    function renderRelatedList() {
        const listBox = form.querySelector('#item-related-list');
        const filterInput = form.querySelector('#item-related-filter');
        const hiddenInput = form.querySelector('#item-related');
        if (!listBox) return;
        let all = Array.isArray(window.__itemsCache) ? window.__itemsCache : [];
        if (!all.length && typeof getCachedItems === 'function') all = getCachedItems();
        if (all.length && !window.__itemsCache) window.__itemsCache = all;
        const currentStr = hiddenInput ? hiddenInput.value : '';
        const currentIds = currentStr.split(',').map(x => parseInt(x.trim())).filter(n => Number.isFinite(n));
        const editingId = form.dataset.editId ? parseInt(form.dataset.editId) : null;
        const term = filterInput ? filterInput.value.toLowerCase().trim() : '';
        listBox.innerHTML = '';
        const sorted = all.slice().sort((a, b) => (a.id - b.id));
        sorted.forEach(it => {
            if (editingId && it.id === editingId) return;
            const labelText = '#' + it.id + ' – ' + (it.name || '');
            const key = (labelText + ' ' + it.id).toLowerCase();
            if (term && key.indexOf(term) === -1) return;
            const wrap = document.createElement('label');
            wrap.className = 'item-related-item';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = it.id;
            cb.checked = currentIds.indexOf(it.id) !== -1;
            cb.addEventListener('change', () => {
                const vals = [];
                listBox.querySelectorAll('input[type="checkbox"]:checked').forEach(c => {
                    const v = parseInt(c.value);
                    if (Number.isFinite(v)) vals.push(v);
                });
                const uniq = [...new Set(vals)].sort((a, b) => (a - b));
                if (hiddenInput) hiddenInput.value = uniq.join(', ');
            });
            const span = document.createElement('span');
            span.textContent = labelText;
            wrap.appendChild(cb);
            wrap.appendChild(span);
            listBox.appendChild(wrap);
        });
    }
    const relClear = form.querySelector('#item-related-clear');
    if (relClear) {
        relClear.addEventListener('click', () => {
            const h = form.querySelector('#item-related');
            if (h) h.value = '';
            form.querySelectorAll('#item-related-list input[type="checkbox"]').forEach(c => c.checked = false);
        });
    }
    const relFilter = form.querySelector('#item-related-filter');
    if (relFilter) relFilter.addEventListener('input', renderRelatedList);
    renderRelatedList();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const input = readItemFormValues(form);
        const checked = validateItemForm(input);
        const errorBox = form.querySelector('#item-form-errors');

        renderErrors(errorBox, checked.errors);
        if (!checked.valid) return;

        const editId = form.dataset.editId;

        if (editId) {
            // Sửa trang bị cũ: giữ nguyên id, chỉ đổi nội dung.
            const updated = await updateItem(editId, input);
            if (!updated) {
                renderErrors(errorBox, ['Không lưu được trang bị. Hãy khởi động lại server bằng "npm run dev" (nạp vite.config.js) và dùng tài khoản quản trị viên.']);
                return;
            }

            // Vẽ lại form ở chế độ sửa với dữ liệu vừa lưu rồi báo thành công.
            renderItemAdminForm(updated);
            renderSuccess(
                document.getElementById('item-admin-form').querySelector('#item-form-errors'),
                `Đã cập nhật trang bị "${updated.name}".`,
            );
            renderItemAdminTable();
            return;
        }

        const created = await createItem(input);
        if (!created) {
            renderErrors(errorBox, ['Không lưu được trang bị. Hãy khởi động lại server bằng "npm run dev" (nạp vite.config.js) và dùng tài khoản quản trị viên.']);
            return;
        }

        // Thêm xong thì quay về form trống để sẵn sàng thêm trang bị tiếp theo.
        renderItemAdminForm(null);
        renderSuccess(
            document.getElementById('item-admin-form').querySelector('#item-form-errors'),
            `Đã thêm trang bị "${created.name}" (mã ${created.id}).`,
        );
        renderItemAdminTable();
    });
}

/* ---------- Thông báo khi không có quyền ---------- */

/**
 * Thông báo cho người dùng không có quyền (đã đăng nhập nhưng không phải admin).
 * Không vẽ form, không vẽ bảng, không đụng dữ liệu (fail-closed).
 */
function renderItemAdminDenied() {
    const formBox = document.getElementById('item-admin-form');
    if (formBox) formBox.innerHTML = '';

    const toolbar = document.getElementById('item-admin-toolbar');
    if (toolbar) toolbar.innerHTML = '';

    const tableBox = document.getElementById('item-admin-list');
    if (!tableBox) return;

    tableBox.innerHTML = `
        <div class="post-detail-empty">
            ${renderNotFound('Bạn không có quyền truy cập mục Quản lý trang bị.')}
            <p class="post-detail-empty__actions">
                <a class="btn btn-outline" href="${BASE_PATH}index.html">← Về trang chủ</a>
            </p>
        </div>
    `;
}

/* ---------- Khởi tạo ---------- */

/**
 * Khởi tạo mục Quản lý trang bị.
 * Chạy tự thoát nếu trang không có #item-admin-list để file này có thể nạp thừa ở trang
 * khác mà không làm hỏng trang đó.
 */
async function initItemAdminPage() {
    const tableBox = document.getElementById('item-admin-list');
    if (!tableBox) return;

    // requireAdmin() đã được gọi sớm ở đầu admin.html. Ở đây chỉ kiểm tra lại bằng
    // isAdmin() sau khi chờ usersReady, vẫn fail-closed: không xác minh được là admin thì
    // không vẽ gì cả.
    await usersReady;

    if (typeof isAdmin !== 'function' || !isAdmin()) {
        renderItemAdminDenied();
        return;
    }

    // Nạp danh sách trang bị từ API (đọc thẳng src/data/items.json) để bảng đầy đủ và để
    // hợp đồng findItemById() tra cứu được đồng bộ ở các handler bên dưới.
    await loadItems();

    renderItemAdminForm(null);
    renderItemAdminToolbar();
    renderItemAdminTable();
}

/**
 * Mục "Trang bị" của trang Quản lý (đăng ký bằng registerAdminSection() ở cuối file).
 * Shell tạo sẵn khung .admin-section + tiêu đề rồi truyền vào đây phần thân (container),
 * nên hàm chỉ dựng mô tả + 4 id mà initItemAdminPage() cần rồi vẽ.
 * @param {Element} container phần thân .admin-section__body do shell cung cấp.
 */
async function renderItemAdminSection(container) {
    if (!container) return;

    container.innerHTML = `
        <p class="admin-section__desc">
            Dành cho quản trị viên: thêm trang bị mới, sửa thông tin trang bị
            (tên, loại, giá, ảnh, chỉ số, nội tại, mô tả, trang bị liên quan)
            hoặc xóa trang bị khỏi hệ thống. Khi xóa, mã trang bị được dọn khỏi
            các build, trang bị đề xuất của tướng, danh sách liên quan và mục Yêu
            thích. Thay đổi lưu thẳng vào file src/data/items.json và hiển thị ngay
            ở các trang đọc dữ liệu trang bị.
        </p>

        <!-- Form thêm / sửa trang bị: do renderItemAdminForm() vẽ và gắn sự kiện -->
        <div id="item-admin-form"></div>

        <!-- Ô tìm theo tên trang bị + nút thêm mới -->
        <div id="item-admin-toolbar" class="feed-filter"></div>

        <!-- Số trang bị đang hiển thị / tổng số trang bị trong hệ thống -->
        <p id="item-admin-count" class="feed-count" aria-live="polite"></p>

        <!-- Bảng trang bị: do renderItemAdminTable() vẽ từ lớp dữ liệu của file này -->
        <div id="item-admin-list" class="card"></div>
    `;

    // Từ khoá tìm kiếm cũ không được dính sang lần mở mục sau.
    itemAdminKeyword = '';

    try {
        await initItemAdminPage();
    } catch (error) {
        // Không để trang trắng nếu lớp dữ liệu lỗi.
        container.innerHTML = `
            <p class="admin-empty">
                Không hiển thị được mục Quản lý trang bị. Hãy tải lại trang hoặc kiểm tra server.
            </p>
        `;
    }
}

/* ---------- Sự kiện thêm / sửa / xóa ---------- */

/*
 * Form và bảng đều được vẽ động bằng innerHTML nên không gắn sự kiện cho từng nút, mà gắn
 * một lần ở cấp document rồi dò theo data attribute (event delegation), đúng cách
 * hero-admin.js xử lý nút thêm / sửa / xóa tướng.
 */
document.addEventListener('click', async (event) => {
    // Chỉ xử lý click trong khu vực quản lý trang bị để không bắt nhầm click của các mục
    // admin khác (nhiều mục cùng nằm trong trang Quản lý).
    if (!event.target || typeof event.target.closest !== 'function'
        || !event.target.closest('#item-admin-form, #item-admin-toolbar, #item-admin-list')) {
        return;
    }

    // Nút "Thêm trang bị" trên thanh công cụ: quay về form trống.
    const addBtn = event.target.closest('[data-item-add]');
    if (addBtn) {
        renderItemAdminForm(null);
        const formBox = document.getElementById('item-admin-form');
        if (formBox && formBox.scrollIntoView) formBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    // Nút "Huỷ" trong form sửa: bỏ thay đổi, về form thêm mới.
    const cancelBtn = event.target.closest('[data-item-cancel]');
    if (cancelBtn) {
        renderItemAdminForm(null);
        return;
    }

    // Nút "Sửa": mở form ở chế độ sửa, điền sẵn dữ liệu của trang bị đó.
    const editBtn = event.target.closest('[data-item-edit]');
    if (editBtn) {
        const item = findItemById(editBtn.dataset.itemEdit);
        if (!item) {
            alert('Không tìm thấy trang bị cần sửa.');
            return;
        }

        renderItemAdminForm(item);
        const formBox = document.getElementById('item-admin-form');
        if (formBox && formBox.scrollIntoView) formBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    // Nút "Xóa": hỏi lại rồi xóa hẳn trang bị (deleteItem() tự kiểm tra quyền + dọn tham chiếu).
    const deleteBtn = event.target.closest('[data-item-delete]');
    if (deleteBtn) {
        const item = findItemById(deleteBtn.dataset.itemDelete);
        if (!item) {
            alert('Không tìm thấy trang bị cần xóa.');
            return;
        }

        if (!confirm(`Xóa vĩnh viễn trang bị "${item.name}"? Các build, trang bị đề xuất của tướng và danh sách yêu thích có nhắc tới trang bị này cũng sẽ bị dọn.`)) return;

        if (!await deleteItem(item.id)) {
            alert('Không xóa được trang bị. Bạn cần đăng nhập bằng tài khoản quản trị viên và server phải đang chạy.');
            return;
        }

        // Đang sửa đúng trang bị vừa bị xóa thì quay về form thêm mới.
        const form = document.getElementById('item-form');
        if (form && form.dataset.editId && normalizeItemId(form.dataset.editId) === normalizeItemId(item.id)) {
            renderItemAdminForm(null);
        }

        renderItemAdminTable();
    }
});

// Đăng ký mục "Trang bị" vào trang Quản lý (chỉ có tác dụng khi admin-shell.js đã nạp).
if (typeof registerAdminSection === 'function') {
    registerAdminSection('items', 'item-manager', 'Quản lý trang bị', renderItemAdminSection);
}
