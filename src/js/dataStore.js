/**
 * dataStore.js - Lớp dữ liệu JSON dùng chung (tài khoản, bài viết, bình luận, lượt thích)
 *
 * File này TỰ CHỨA: cố ý KHÔNG dùng storage.js / loadData.js / components.js
 * vì trang profile.html nạp auth.js (file này cần dataStore) trước các file kia.
 * Mọi chỗ dùng LocalStorage / File System Access API / IndexedDB / BroadcastChannel
 * đều được bọc try-catch hoặc kiểm tra tồn tại nên thiếu API cũng không sập trang.
 *
 * Bốn bộ sưu tập (collection) ứng với bốn file trong src/data/:
 *   users    -> users.json    (mảng)
 *   posts    -> posts.json    (mảng)
 *   comments -> comments.json (mảng)
 *   likes    -> likes.json    (object { "<postId>": [username, ...] })
 *
 * GIỚI HẠN (đọc kỹ trước khi mở rộng):
 *   - Không có backend riêng. "Dữ liệu dùng chung" thực chất là file JSON nằm trong
 *     repo / máy demo. Trình duyệt tự ghi được file chỉ khi người dùng liên kết thư mục
 *     src/data qua File System Access API (Chrome/Edge). Firefox/Safari không có
 *     showDirectoryPicker nên dùng nhánh "Tải JSON".
 *   - Khi host tĩnh (GitHub Pages...) JSON chỉ đọc được, không ghi được.
 *   - "admin" chỉ là quy ước phía trình duyệt (role trong users.json), không phải bảo mật thật.
 *
 * Phụ thuộc: BASE_PATH / DATA_PATH (config.js nạp trước).
 */

/** Khuôn dữ liệu từng bộ sưu tập: tên file + kiểu giá trị rỗng đúng. */
const DATASTORE_SCHEMA = {
    users: { file: 'users.json', type: 'array' },
    posts: { file: 'posts.json', type: 'array' },
    comments: { file: 'comments.json', type: 'array' },
    likes: { file: 'likes.json', type: 'object' },
};

/**
 * Các key LocalStorage cũ của đợt trước, chỉ ĐỌC để gộp một lần rồi không dùng nữa.
 * Riêng aov_posts_seeded chỉ dùng để biết bài nào đã từng nạp (không phục hồi bài
 * đã xoá) nên không gộp, chỉ xoá sau khi ghi/tải JSON thành công.
 */
const DATASTORE_LEGACY_KEYS = {
    users: ['aov_users'],
    posts: ['aov_posts', 'aov_posts_seeded'],
    comments: ['aov_comments'],
    likes: ['aov_likes'],
};

/** Tiền tố key LocalStorage giữ bản nháp khi CHƯA liên kết thư mục src/data. */
const DATASTORE_DRAFT_PREFIX = 'aov_draft_';

/** Tên IndexedDB lưu handle thư mục dữ liệu. */
const DATASTORE_DIR_DB = 'aov-datastore';
const DATASTORE_DIR_STORE = 'handles';
const DATASTORE_DIR_KEY = 'aov_data_dir';

/** Kênh đồng bộ giữa các tab cùng mở web. */
const DATASTORE_CHANNEL = 'aov-data';

/** Trạng thái nội bộ của lớp dữ liệu. */
const dataStoreState = {
    values: {},          // name -> giá trị thật đang dùng
    loaded: {},          // name -> đã nạp xong chưa
    loading: {},         // name -> Promise đang nạp
    dirty: {},           // name -> có thay đổi chưa lưu vào file JSON
    migrated: {},        // name -> đã gộp dữ liệu LocalStorage cũ chưa
    memoryOnly: false,   // chế độ test: không fetch, không file, không LocalStorage
    seed: null,          // chế độ test: dữ liệu khởi tạo theo từng bộ
    useSeedRef: false,   // chế độ test: dùng chính object seed làm bộ nhớ dùng chung
    writeQueue: Promise.resolve(),
    pendingWrites: 0,
    folderHandle: null,
    folderInit: false,
    permission: 'prompt',
    status: 'unknown',
    channel: null,
    channelReady: false,
    migratedCount: 0,
    pendingLegacy: {},
    domHooked: false,
};

/* ================= Hàm nền an toàn ================= */

/** Đọc LocalStorage an toàn (bị chặn / chế độ riêng tư -> null). */
function dataStoreLocalGet(key) {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(key);
    } catch (error) {
        return null;
    }
}

/** Ghi LocalStorage an toàn, trả boolean. */
function dataStoreLocalSet(key, value) {
    try {
        if (typeof localStorage === 'undefined') return false;
        localStorage.setItem(key, String(value));
        return true;
    } catch (error) {
        return false;
    }
}

/** Xoá LocalStorage an toàn, trả boolean. */
function dataStoreLocalRemove(key) {
    try {
        if (typeof localStorage === 'undefined') return false;
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Bản sao sâu. Ưu tiên structuredClone của trình duyệt/Node hiện đại, nếu không có
 * (vd ngữ cảnh vm trong test) thì lùi về JSON (dữ liệu ở đây luôn là JSON thuần).
 */
function dataStoreClone(value) {
    if (value === null || value === undefined) return value;

    try {
        if (typeof structuredClone === 'function') return structuredClone(value);
    } catch (error) {
        // rơi xuống JSON bên dưới
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        return value;
    }
}

/** Giá trị rỗng đúng kiểu của một bộ sưu tập. */
function dataStoreEmpty(name) {
    return DATASTORE_SCHEMA[name].type === 'array' ? [] : {};
}

/** Kiểm tra giá trị có đúng kiểu của bộ sưu tập không. */
function dataStoreIsValid(name, value) {
    if (name === 'likes') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    return Array.isArray(value);
}

/** Đường dẫn fetch của một bộ sưu tập (dùng DATA_PATH của config.js nếu có). */
function dataStoreResolvePath(name) {
    const schema = DATASTORE_SCHEMA[name];
    const base = typeof BASE_PATH === 'string' ? BASE_PATH : '/';

    if (typeof DATA_PATH === 'object' && DATA_PATH && DATA_PATH[name]) return DATA_PATH[name];

    return base + 'src/data/' + schema.file;
}

/* ================= Gộp dữ liệu LocalStorage cũ ================= */

/**
 * Gộp các bản ghi cũ chưa có trong collection theo một khoá định danh.
 * Chỉ nhận phần tử là object; giữ nguyên object cũ (không chuẩn hoá thêm).
 * @returns {number} số bản ghi đã thêm.
 */
function dataStoreMergeByKey(base, legacy, key) {
    if (!Array.isArray(base) || !Array.isArray(legacy)) return 0;

    const seen = new Set(
        base.filter((item) => item && typeof item === 'object').map((item) => String(item[key])),
    );

    let added = 0;
    legacy.forEach((item) => {
        if (!item || typeof item !== 'object') return;

        const value = item[key];
        if (value === undefined || value === null || value === '') return;
        if (seen.has(String(value))) return;

        seen.add(String(value));
        base.push(item);
        added += 1;
    });

    return added;
}

/**
 * Gộp lượt thích cũ: theo postId rồi hợp danh sách username.
 * @returns {number} số username đã thêm.
 */
function dataStoreMergeLikes(base, legacy) {
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return 0;

    let added = 0;

    Object.keys(legacy).forEach((postId) => {
        const incoming = Array.isArray(legacy[postId])
            ? legacy[postId].filter((name) => typeof name === 'string')
            : [];
        const current = Array.isArray(base[postId]) ? base[postId].slice() : [];

        incoming.forEach((name) => {
            if (!current.includes(name)) {
                current.push(name);
                added += 1;
            }
        });

        // Chỉ ghi lại khi có thay đổi để không tạo key rỗng vô nghĩa.
        if (!(postId in base) || current.length !== (Array.isArray(base[postId]) ? base[postId].length : 0)) {
            base[postId] = current;
        }
    });

    return added;
}

/**
 * Gộp dữ liệu cũ của một bộ sưu tập vào giá trị đang có (sửa trực tiếp `value`).
 * aov_posts_seeded không được gộp (chỉ đánh dấu bài đã xoá), sẽ bị xoá khi ghi JSON.
 * @returns {number} số bản ghi đã gộp.
 */
function dataStoreMergeLegacy(name, value) {
    const keys = DATASTORE_LEGACY_KEYS[name] || [];
    let count = 0;

    keys.forEach((key) => {
        const raw = dataStoreLocalGet(key);
        if (raw === null) return;

        let legacy;
        try {
            legacy = JSON.parse(raw);
        } catch (error) {
            console.error('dataStore: dữ liệu cũ "' + key + '" hỏng, bỏ qua');
            return;
        }

        if (legacy === null || legacy === undefined) return;

        if (name === 'likes') count += dataStoreMergeLikes(value, legacy);
        else if (name === 'users') count += dataStoreMergeByKey(value, legacy, 'username');
        else count += dataStoreMergeByKey(value, legacy, 'id');
    });

    return count;
}

/* ================= Bản nháp LocalStorage ================= */

/** Ghi bản nháp một bộ sưu tập khi chưa liên kết được thư mục. */
function dataStoreWriteDraft(name, value) {
    return dataStoreLocalSet(DATASTORE_DRAFT_PREFIX + name, JSON.stringify(value));
}

/** Đọc bản nháp; trả undefined nếu không có hoặc hỏng/sai kiểu. */
function dataStoreReadDraft(name) {
    const raw = dataStoreLocalGet(DATASTORE_DRAFT_PREFIX + name);
    if (raw === null) return undefined;

    try {
        const parsed = JSON.parse(raw);
        return dataStoreIsValid(name, parsed) ? parsed : undefined;
    } catch (error) {
        console.error('dataStore: bản nháp "' + name + '" hỏng, bỏ qua');
        return undefined;
    }
}

/* ================= Nạp dữ liệu ================= */

/** Fetch một bộ sưu tập; lỗi/sai kiểu -> giá trị rỗng đúng kiểu, không ném ra ngoài. */
async function dataStoreFetch(name) {
    const path = dataStoreResolvePath(name);

    try {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);

        const data = await response.json();
        if (!dataStoreIsValid(name, data)) {
            console.error('dataStore: "' + name + '" sai kiểu, dùng giá trị rỗng');
            return dataStoreEmpty(name);
        }

        return data;
    } catch (error) {
        console.error('dataStore: không tải được ' + path, error);
        return dataStoreEmpty(name);
    }
}

/**
 * Nạp một bộ sưu tập (đã nạp/đang nạp thì dùng lại cùng Promise của bộ đó).
 * Thứ tự ưu tiên giá trị: bản nháp LocalStorage > file JSON, sau đó gộp dữ liệu cũ.
 */
function dataStoreLoad(name) {
    if (dataStoreState.loaded[name]) return Promise.resolve(dataStoreState.values[name]);
    if (dataStoreState.loading[name]) return dataStoreState.loading[name];

    const promise = (async () => {
        // Chế độ test: lấy từ seed, không fetch/không LocalStorage.
        if (dataStoreState.memoryOnly) {
            let value = dataStoreEmpty(name);
            if (dataStoreState.seed && Object.prototype.hasOwnProperty.call(dataStoreState.seed, name)) {
                value = dataStoreState.seed[name];
            }
            dataStoreState.values[name] = dataStoreState.useSeedRef ? value : dataStoreClone(value);
            dataStoreState.loaded[name] = true;
            return dataStoreState.values[name];
        }

        const value = await dataStoreFetch(name);

        // Bản nháp (dữ liệu người dùng đang sửa) ưu tiên hơn file JSON. Khi đã có
        // bản nháp nghĩa là file đã được gộp aov_* cũ từ trước, nên KHÔNG gộp lại
        // lần nữa — nếu không, bài đã xoá sẽ "sống lại" từ file mỗi lần mở trang.
        const draft = dataStoreReadDraft(name);
        if (draft !== undefined) {
            dataStoreState.values[name] = draft;
            dataStoreState.dirty[name] = true;
            dataStoreState.loaded[name] = true;
            return draft;
        }

        dataStoreState.dirty[name] = false;

        if (!dataStoreState.migrated[name]) {
            dataStoreState.migrated[name] = true;
            const merged = dataStoreMergeLegacy(name, value);
            if (merged > 0) {
                dataStoreState.dirty[name] = true;
                dataStoreState.migratedCount += merged;
                dataStoreState.pendingLegacy[name] = true;
                dataStoreWriteDraft(name, value);
            }
        }

        dataStoreState.values[name] = value;
        dataStoreState.loaded[name] = true;
        return value;
    })();

    dataStoreState.loading[name] = promise;
    promise.catch(() => {});
    return promise;
}

/** Nạp lại một bộ sưu tập từ file (dùng cho "Bỏ bản nháp" và đồng bộ giữa tab). */
function dataStoreForceReload(name) {
    dataStoreState.loaded[name] = false;
    dataStoreState.loading[name] = null;
    return dataStoreLoad(name);
}

/* ================= Công khai: init / get / set ================= */

/**
 * Khởi tạo lớp dữ liệu.
 * @param {object} [options]
 * @param {string[]} [options.collections] tên các bộ cần nạp (mặc định cả 4).
 * @param {boolean} [options.memoryOnly] chế độ test: không fetch/không file/không LocalStorage.
 * @param {object} [options.seed] dữ liệu khởi tạo theo từng bộ khi memoryOnly.
 * @returns {Promise<Array>} Promise của các bộ được yêu cầu (dùng để await).
 */
function initDataStore(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};

    // Cầu test: mini-dom đặt globalThis.__AOV_DATASTORE_TEST__ trước khi chạy script.
    if (typeof globalThis !== 'undefined' && globalThis.__AOV_DATASTORE_TEST__ && !dataStoreState.memoryOnly) {
        const test = globalThis.__AOV_DATASTORE_TEST__;
        dataStoreState.memoryOnly = true;
        if (test.seed) dataStoreState.seed = test.seed;
        dataStoreState.useSeedRef = Boolean(test.useSeedRef);
    }

    if (opts.memoryOnly) {
        dataStoreState.memoryOnly = true;
        if (opts.seed) dataStoreState.seed = opts.seed;
        if (opts.useSeedRef) dataStoreState.useSeedRef = true;
    }

    dataStoreHookDom();

    if (!dataStoreState.memoryOnly) {
        if (!dataStoreState.folderInit) {
            dataStoreState.folderInit = true;
            dataStoreInitFolder();
        }
        dataStoreSetupChannel();
    }

    const names = Array.isArray(opts.collections) && opts.collections.length
        ? opts.collections.filter((name) => DATASTORE_SCHEMA[name])
        : Object.keys(DATASTORE_SCHEMA);

    return Promise.all(names.map((name) => dataStoreLoad(name)));
}

/**
 * Lấy bản sao sâu của một bộ sưu tập (đồng bộ).
 * Chưa nạp mà gọi -> trả giá trị rỗng đúng kiểu, không throw.
 */
function getCollection(name) {
    if (!DATASTORE_SCHEMA[name]) {
        throw new Error('dataStore: bộ sưu tập không tồn tại "' + name + '"');
    }

    if (!dataStoreState.loaded[name]) return dataStoreEmpty(name);

    return dataStoreClone(dataStoreState.values[name]);
}

/**
 * Cập nhật một bộ sưu tập (đồng bộ).
 * Trả về boolean = đã cập nhật bộ nhớ thành công (giữ đúng chữ ký setStore cũ).
 * Việc ghi file là bất đồng bộ, theo dõi bằng whenDataSaved().
 * @returns {boolean}
 */
function setCollection(name, value) {
    if (!DATASTORE_SCHEMA[name]) {
        throw new Error('dataStore: bộ sưu tập không tồn tại "' + name + '"');
    }

    if (!dataStoreIsValid(name, value)) return false;

    const snapshot = dataStoreClone(value);
    dataStoreState.loaded[name] = true;

    if (dataStoreState.memoryOnly && dataStoreState.useSeedRef
        && dataStoreState.seed && Object.prototype.hasOwnProperty.call(dataStoreState.seed, name)) {
        const target = dataStoreState.seed[name];
        if (Array.isArray(target) && Array.isArray(snapshot)) {
            target.length = 0;
            snapshot.forEach((item) => target.push(item));
        } else if (!Array.isArray(target) && !Array.isArray(snapshot)) {
            Object.keys(target).forEach((key) => delete target[key]);
            Object.assign(target, snapshot);
        }
        dataStoreState.values[name] = target;
    } else {
        dataStoreState.values[name] = snapshot;
    }

    if (dataStoreState.memoryOnly) return true;

    dataStoreState.dirty[name] = true;

    if (getDataFolderStatus() === 'linked' && dataStoreState.folderHandle) {
        dataStoreEnqueueWrite(name);
    } else {
        dataStoreWriteDraft(name, dataStoreState.values[name]);
    }

    dataStoreRefreshBar();
    return true;
}

/** Promise hoàn tất khi hàng đợi ghi file rỗng (dùng cho form chờ và cho test). */
function whenDataSaved() {
    return dataStoreState.writeQueue.then(() => undefined);
}

/* ================= Ghi file JSON (File System Access API) ================= */

/** Trình duyệt có showDirectoryPicker không (Chrome/Edge). */
function dataStoreSupportsPicker() {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Ghi một file JSON vào thư mục đã liên kết. */
async function writeJsonFile(name, data) {
    if (!dataStoreState.folderHandle) throw new Error('Chưa liên kết thư mục dữ liệu');

    const handle = await dataStoreState.folderHandle.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(data, null, 2) + '\n');
    await writable.close();
}

/** Xếp hàng ghi một bộ sưu tập (tuần tự, không ghi chồng). */
function dataStoreEnqueueWrite(name) {
    const snapshot = dataStoreClone(dataStoreState.values[name]);

    dataStoreState.pendingWrites += 1;
    dataStoreState.writeQueue = dataStoreState.writeQueue
        .then(() => dataStoreWriteFile(name, snapshot))
        .then(() => {
            dataStoreState.pendingWrites = Math.max(0, dataStoreState.pendingWrites - 1);
        })
        .catch((error) => {
            dataStoreState.pendingWrites = Math.max(0, dataStoreState.pendingWrites - 1);
            dataStoreState.dirty[name] = true;
            console.error('dataStore: ghi file "' + name + '" lỗi, giữ dữ liệu trong bộ nhớ', error);
        });

    return dataStoreState.writeQueue;
}

/** Ghi thật một bộ sưu tập xuống file rồi dọn bản nháp + key cũ. */
async function dataStoreWriteFile(name, value) {
    if (getDataFolderStatus() !== 'linked' || !dataStoreState.folderHandle) {
        dataStoreState.dirty[name] = true;
        return false;
    }

    await writeJsonFile(DATASTORE_SCHEMA[name].file, value);

    dataStoreState.dirty[name] = false;
    dataStoreLocalRemove(DATASTORE_DRAFT_PREFIX + name);
    dataStoreClearLegacy(name);
    dataStoreBroadcast(name);
    dataStoreRefreshBar();
    return true;
}

/** Xếp hàng ghi mọi bộ đang dirty (gọi sau khi liên kết / xin lại quyền). */
async function dataStoreFlushDirty() {
    Object.keys(DATASTORE_SCHEMA).forEach((name) => {
        if (dataStoreState.dirty[name] && dataStoreState.loaded[name]) dataStoreEnqueueWrite(name);
    });

    return whenDataSaved();
}

/** Xoá các key LocalStorage cũ của một bộ sưu tập sau khi đã lưu/tải JSON thành công. */
function dataStoreClearLegacy(name) {
    (DATASTORE_LEGACY_KEYS[name] || []).forEach((key) => dataStoreLocalRemove(key));
    dataStoreState.pendingLegacy[name] = false;
}

/* ================= IndexedDB lưu handle thư mục ================= */

function dataStoreIdbOpen() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB không khả dụng'));
            return;
        }

        const request = indexedDB.open(DATASTORE_DIR_DB, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(DATASTORE_DIR_STORE)) {
                request.result.createObjectStore(DATASTORE_DIR_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dataStoreIdbSet(handle) {
    return dataStoreIdbOpen().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(DATASTORE_DIR_STORE, 'readwrite');
        tx.objectStore(DATASTORE_DIR_STORE).put(handle, DATASTORE_DIR_KEY);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    }));
}

function dataStoreIdbGet() {
    return dataStoreIdbOpen().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(DATASTORE_DIR_STORE, 'readonly');
        const request = tx.objectStore(DATASTORE_DIR_STORE).get(DATASTORE_DIR_KEY);
        request.onsuccess = () => { db.close(); resolve(request.result || null); };
        request.onerror = () => { db.close(); reject(request.error); };
    }));
}

/* ================= Liên kết thư mục src/data ================= */

/** Trạng thái liên kết: 'linked' | 'unlinked' | 'unsupported'. */
function getDataFolderStatus() {
    if (!dataStoreSupportsPicker()) return 'unsupported';
    if (dataStoreState.folderHandle && dataStoreState.permission === 'granted') return 'linked';
    return 'unlinked';
}

/** Nạp lại handle thư mục đã lưu và kiểm tra quyền (không xin quyền). */
async function dataStoreInitFolder() {
    dataStoreState.status = dataStoreSupportsPicker() ? 'unlinked' : 'unsupported';
    if (typeof indexedDB === 'undefined') return;

    try {
        const handle = await dataStoreIdbGet();
        if (!handle) return;

        dataStoreState.folderHandle = handle;

        let permission = 'prompt';
        try {
            permission = await handle.queryPermission({ mode: 'readwrite' });
        } catch (error) {
            permission = 'prompt';
        }

        dataStoreState.permission = permission;
        if (permission === 'granted') dataStoreState.status = 'linked';
    } catch (error) {
        // Không lấy được handle cũng không sao: người dùng liên kết lại.
    }
}

/**
 * Liên kết thư mục src/data: chọn thư mục, kiểm tra có users.json, lưu handle vào
 * IndexedDB rồi đẩy các bộ đang dirty xuống file. PHẢI gọi từ thao tác bấm người dùng.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function linkDataFolder() {
    if (!dataStoreSupportsPicker()) {
        return { ok: false, error: 'Trình duyệt không hỗ trợ chọn thư mục. Hãy dùng nút "Tải JSON".' };
    }

    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });

        let hasUsers = false;
        try {
            await handle.getFileHandle('users.json');
            hasUsers = true;
        } catch (error) {
            hasUsers = false;
        }

        if (!hasUsers) {
            return { ok: false, error: 'Hãy chọn đúng thư mục src/data (không thấy users.json).' };
        }

        dataStoreState.folderHandle = handle;
        dataStoreState.permission = 'granted';
        dataStoreState.status = 'linked';

        try { await dataStoreIdbSet(handle); } catch (error) { /* vẫn dùng được trong phiên */ }

        await dataStoreFlushDirty();
        dataStoreRefreshBar();

        return { ok: true };
    } catch (error) {
        if (error && error.name === 'AbortError') return { ok: false, error: 'Đã huỷ chọn thư mục.' };

        console.error('dataStore: liên kết thư mục lỗi', error);
        return { ok: false, error: (error && error.message) || 'Không liên kết được thư mục.' };
    }
}

/**
 * Xin lại quyền ghi cho handle đã lưu (gọi từ nút bấm sau khi F5).
 * requestPermission chỉ chạy được trong thao tác người dùng.
 */
async function requestDataFolderPermission() {
    if (!dataStoreState.folderHandle) return linkDataFolder();

    try {
        const permission = await dataStoreState.folderHandle.requestPermission({ mode: 'readwrite' });
        dataStoreState.permission = permission;

        if (permission === 'granted') {
            dataStoreState.status = 'linked';
            await dataStoreFlushDirty();
            dataStoreRefreshBar();
            return { ok: true };
        }

        return { ok: false, error: 'Quyền ghi chưa được cấp.' };
    } catch (error) {
        return { ok: false, error: (error && error.message) || 'Không xin được quyền ghi.' };
    }
}

/* ================= Tải JSON / bỏ bản nháp ================= */

/** Tải một bộ sưu tập về máy dạng file JSON (nhánh Firefox/Safari hoặc chưa liên kết). */
function downloadJson(name) {
    if (!DATASTORE_SCHEMA[name]) {
        throw new Error('dataStore: bộ sưu tập không tồn tại "' + name + '"');
    }

    if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
        return false;
    }

    const value = dataStoreState.loaded[name] ? dataStoreState.values[name] : dataStoreEmpty(name);
    const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = DATASTORE_SCHEMA[name].file;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);

    dataStoreState.dirty[name] = false;
    dataStoreLocalRemove(DATASTORE_DRAFT_PREFIX + name);
    dataStoreClearLegacy(name);
    dataStoreRefreshBar();

    return true;
}

/** Danh sách tên các bộ đang có thay đổi chưa lưu vào JSON. */
function getDirtyCollections() {
    return Object.keys(DATASTORE_SCHEMA).filter((name) => dataStoreState.dirty[name]);
}

/** Bỏ toàn bộ bản nháp LocalStorage và nạp lại từ file. */
async function discardDrafts() {
    Object.keys(DATASTORE_SCHEMA).forEach((name) => {
        dataStoreLocalRemove(DATASTORE_DRAFT_PREFIX + name);
    });

    await Promise.all(Object.keys(DATASTORE_SCHEMA).map((name) => dataStoreForceReload(name)));

    Object.keys(DATASTORE_SCHEMA).forEach((name) => {
        dataStoreState.dirty[name] = dataStoreState.migrated[name] ? false : dataStoreState.dirty[name];
    });

    dataStoreRefreshBar();
}

/* ================= Đồng bộ giữa các tab ================= */

/** Tạo kênh BroadcastChannel một lần (không có cũng không sao). */
function dataStoreSetupChannel() {
    if (dataStoreState.channelReady || dataStoreState.memoryOnly) return;
    dataStoreState.channelReady = true;

    if (typeof BroadcastChannel === 'undefined') return;

    try {
        dataStoreState.channel = new BroadcastChannel(DATASTORE_CHANNEL);
        dataStoreState.channel.onmessage = (event) => {
            const data = event && event.data;
            if (!data || data.type !== 'updated' || !DATASTORE_SCHEMA[data.name]) return;
            dataStoreReloadFromFile(data.name);
        };
    } catch (error) {
        dataStoreState.channel = null;
    }
}

/** Báo các tab khác biết một bộ vừa được ghi xuống file. */
function dataStoreBroadcast(name) {
    if (!dataStoreState.channel) return;
    try {
        dataStoreState.channel.postMessage({ type: 'updated', name });
    } catch (error) {
        // Bỏ qua: đồng bộ tab chỉ là tiện ích.
    }
}

/** Tab nhận cập nhật: nạp lại đúng bộ đó từ file, KHÔNG ghi lại (tránh vòng lặp). */
async function dataStoreReloadFromFile(name) {
    const value = await dataStoreFetch(name);
    dataStoreState.values[name] = value;
    dataStoreState.loaded[name] = true;
    dataStoreState.dirty[name] = false;

    if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function'
        && typeof CustomEvent === 'function') {
        try {
            document.dispatchEvent(new CustomEvent('aov-data-updated', { detail: { name } }));
        } catch (error) {
            // Bỏ qua.
        }
    }
}

/* ================= Thanh trạng thái dữ liệu ================= */

/**
 * Hiện thanh trạng thái đầu trang cho admin (mọi trang) hoặc cho người vừa có
 * thay đổi chưa lưu. Không có DOM / thiếu API thì bỏ qua êm.
 */
function renderDataStatusBar() {
    if (typeof document === 'undefined' || !document.body) return;
    if (typeof document.body.insertBefore !== 'function') return;

    const status = getDataFolderStatus();
    const dirty = getDirtyCollections();
    const isAdminUser = typeof isAdmin === 'function' && (() => {
        try { return isAdmin(); } catch (error) { return false; }
    })();

    let bar = typeof document.getElementById === 'function' ? document.getElementById('data-status-bar') : null;

    if (!isAdminUser && !dirty.length) {
        if (bar) {
            bar.innerHTML = '';
            if (bar.style) bar.style.display = 'none';
        }
        return;
    }

    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'data-status-bar';

        if (document.body.firstChild) document.body.insertBefore(bar, document.body.firstChild);
        else document.body.appendChild(bar);
    }

    if (bar.style) bar.style.display = '';

    const statusText = status === 'linked'
        ? 'Đã liên kết thư mục dữ liệu'
        : 'Trình duyệt không hỗ trợ ghi file — dữ liệu lưu tạm trong trình duyệt';

    const dirtyText = dirty.length
        ? `Có ${dirty.length} bộ dữ liệu chưa lưu vào JSON`
        : 'Dữ liệu đã đồng bộ';

    const migratedText = dataStoreState.migratedCount > 0
        ? `Đã gộp ${dataStoreState.migratedCount} bản ghi cũ, hãy lưu vào JSON`
        : '';

    bar.className = 'data-status-bar' + (dirty.length ? ' data-status-bar--dirty' : '');
    bar.innerHTML = `
        <div class="data-status-bar__inner">
            <span class="data-status-bar__state">${dataStoreEscape(statusText)}</span>
            <span class="data-status-bar__dirty">${dataStoreEscape(dirtyText)}</span>
            ${migratedText ? `<span class="data-status-bar__migrated">${dataStoreEscape(migratedText)}</span>` : ''}
            <span class="data-status-bar__actions">
                <button type="button" class="btn btn-outline btn-sm" data-datastore-link>Liên kết thư mục src/data</button>
                <button type="button" class="btn btn-outline btn-sm" data-datastore-download>Tải JSON</button>
                <button type="button" class="btn btn-outline btn-sm" data-datastore-discard>Bỏ bản nháp</button>
            </span>
        </div>
    `;

    const linkBtn = bar.querySelector('[data-datastore-link]');
    const downloadBtn = bar.querySelector('[data-datastore-download]');
    const discardBtn = bar.querySelector('[data-datastore-discard]');

    if (linkBtn) {
        linkBtn.addEventListener('click', async () => {
            const result = getDataFolderStatus() === 'linked'
                ? await requestDataFolderPermission()
                : await linkDataFolder();
            if (!result.ok && result.error) alert(result.error);
            renderDataStatusBar();
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const names = getDirtyCollections();
            (names.length ? names : []).forEach((name) => downloadJson(name));
            renderDataStatusBar();
        });
    }

    if (discardBtn) {
        discardBtn.addEventListener('click', () => {
            discardDrafts();
        });
    }
}

/** Thoát chuỗi cho innerHTML của thanh trạng thái (dùng components.escapeHtml nếu có). */
function dataStoreEscape(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Vẽ lại thanh trạng thái nếu trang đã có DOM. */
function dataStoreRefreshBar() {
    try {
        renderDataStatusBar();
    } catch (error) {
        // Thanh trạng thái không được phép làm hỏng trang.
    }
}

/** Gắn hook DOM một lần để vẽ thanh trạng thái và mở kênh đồng bộ. */
function dataStoreHookDom() {
    if (dataStoreState.domHooked) return;
    dataStoreState.domHooked = true;

    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;

    document.addEventListener('DOMContentLoaded', () => {
        dataStoreSetupChannel();
        dataStoreRefreshBar();
    });
}
