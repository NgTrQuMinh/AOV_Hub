/**
 * admin-builds.js - Quản lý Build (AD07) + Tướng chưa có build (AD08)
 *
 * File này là MỘT mục của khung quản trị src/pages/admin.html?tab=builds. Tab "Build"
 * đã được khai báo sẵn trong admin-shell.js với trường scripts: ['admin-builds.js'] nên
 * KHÔNG cần sửa admin.html hay admin-shell.js: shell tự nạp file này bằng thẻ <script>
 * chèn động khi người dùng mở mục, rồi gọi renderFn() của từng mục mỗi lần mở tab.
 * Cấu trúc (đăng ký mục ở CUỐI file, dữ liệu + giao diện gộp chung) bắt chước hero-admin.js:
 *   - Phần 1: LỚP DỮ LIỆU build (đọc / CRUD qua API /api/builds).
 *   - Phần 2: GIAO DIỆN CRUD build (bảng + form + sự kiện) — mục "Quản lý build".
 *   - Phần 3: GIAO DIỆN lọc tướng chưa có build (AD08) — mục "Tướng chưa có build".
 *
 * File đăng ký HAI mục vào cùng tab "Build":
 *   registerAdminSection('builds', 'build-manager',    'Quản lý build',         renderBuildAdminSection)
 *   registerAdminSection('builds', 'missing-builds',   'Tướng chưa có build',   renderMissingBuildSection)
 * admin-shell.js hỗ trợ nhiều mục trong một tab (ADMIN_SECTIONS[tabId] là mảng) nên hai
 * mục cùng nằm dưới tab Build theo đúng thứ tự đăng ký, không phải sửa khung.
 *
 * NHIỆM VỤ AD07 — CRUD hướng dẫn build theo schema mới của builds.json (HD01):
 *   - Bảng TẤT CẢ build lấy từ GET /api/builds (đọc thẳng src/data/builds.json), có tìm
 *     nhanh theo tên build / tên tướng, ô đếm, cột Sửa / Xóa cho từng dòng.
 *   - Form thêm / sửa đầy đủ các trường của build: tướng (heroId), tên, đường (lane),
 *     lối chơi (playstyle), trang bị chính (items[]), mô tả, các pha lên đồ (phases[]),
 *     thứ tự nâng kỹ năng (skillOrder), mẹo (tips[]), trang bị thay thế theo tình huống
 *     (situational[]), tướng khắc chế (counters[]) và ghi chú (notes[]).
 *   - Thêm / sửa / xóa ghi qua PUT /api/builds. KHÁC /api/heroes, bộ sưu tập builds chỉ có
 *     2 route (xem vite.config.js):
 *         GET /api/builds  -> đọc cả mảng build
 *         PUT /api/builds  -> ghi ĐÚNG cả mảng (server không cấp id, không có POST/PUT theo id)
 *     nên mọi thao tác ghi đều tự đọc mảng hiện tại, tự cấp id (id lớn nhất + 1) rồi PUT lại
 *     toàn bộ — đúng cách admin-items.js làm với /api/items.
 *
 * NHIỆM VỤ AD08 — lọc và hiển thị tướng chưa có build:
 *   - Mục "Tướng chưa có build" liệt kê các tướng KHÔNG có build nào trong builds.json,
 *     kèm bộ lọc theo tên tướng, vai trò và tình trạng build (chưa có / đã có / tất cả).
 *   - Mỗi dòng có nút "Tạo build": tự cuộn lên form và chọn sẵn tướng đó để admin bổ sung
 *     hướng dẫn còn thiếu ngay, không phải nhớ mã tướng.
 *
 * API đọc/ghi trực tiếp vào src/data/builds.json nên thay đổi của admin hiện ra ở mọi trang
 * đọc dữ liệu build (trang Build đề xuất, Trang chủ...) và giữ nguyên sau khi tải lại trang.
 * Khi API không chạy được (vd mở bằng Live Server), loadBuildsData() tự lùi về đọc file tĩnh
 * để trang vẫn hiển thị được (chỉ đọc, không ghi).
 *
 * PHÂN QUYỀN (fail-closed như hero-admin.js / admin-items.js):
 *   - requireAdmin() trong auth.js chặn ở đầu <body> của admin.html.
 *   - initBuildAdminPage() kiểm tra lại isAdmin() sau khi chờ usersReady.
 *   - Tầng dữ liệu chặn lần nữa: createBuild()/updateBuild()/deleteBuild() đều gọi
 *     canManageBuilds(), gọi thẳng từ console cũng không sửa được khi không phải admin.
 *
 * DÙNG LẠI: loadData()/DATA_PATH/BASE_PATH (loadData.js, config.js), isLoggedIn()/isAdmin()/
 * renderErrors()/renderSuccess() (auth.js), escapeHtml()/imageUrl()/renderNotFound()/
 * DIFFICULTY_LABEL (components.js), matchKeyword()/debounce() (search.js),
 * loadHeroes()/getCachedHeroes()/normalizeHeroId()/HERO_ROLES (heroData.js),
 * loadItems()/getCachedItems() (admin-items.js — chỉ khi mục Trang bị đã từng mở).
 *
 * LƯU Ý TRÙNG TÊN: trang Quản lý có thể nạp cùng lúc admin-items.js và admin-builds.js
 * (mỗi file nạp một lần, giữ nguyên trong phiên). Vì vậy mọi hàm / hằng / biến của file này
 * đều mang tiền tố buildAdmin / BUILD_ADMIN để không đụng tên với các file tab khác.
 */

/* =====================================================================
 * PHẦN 1 — LỚP DỮ LIỆU (đọc / CRUD build qua API)
 * ===================================================================== */

/* ---------- Hằng số ---------- */

/** Địa chỉ API build (BASE_PATH khai báo trong config.js, luôn là "/"). */
const BUILD_ADMIN_API = BASE_PATH + 'api/builds';

/**
 * Địa chỉ API tướng, chỉ dùng để đọc danh sách tướng cho ô chọn / lọc AD08 khi
 * heroData.js chưa nạp. KHÔNG dùng chung hằng HEROES_API của heroData.js vì hai file
 * nạp cùng lúc trong trang Quản lý — khai báo lại const trùng tên sẽ ném SyntaxError.
 */
const BUILD_ADMIN_HEROES_API = BASE_PATH + 'api/heroes';

/** Các đường đi hợp lệ trong builds.json (dùng cho ô chọn lane của form). */
const BUILD_ADMIN_LANES = ['Đường Rồng', 'Rừng', 'Đường Giữa', 'Đường Trên'];

/** Tên mặc định của 3 pha lên đồ khi tạo build mới (khớp dữ liệu builds.json). */
const BUILD_ADMIN_PHASE_NAMES = ['Đầu trận', 'Giữa trận', 'Cuối trận'];

/** Độ dài tối thiểu của tên build (ký tự). */
const BUILD_ADMIN_NAME_MIN = 2;

/** Bản build đang đọc được, ghi lại sau mỗi loadBuildsData() để tra cứu đồng bộ. */
let buildAdminCache = [];

/** Bản tướng đang đọc được (cho ô chọn tướng + mục AD08). */
let buildAdminHeroCache = [];

/** Bản trang bị đang đọc được (chỉ để hiện tên trang bị trong xem trước). */
let buildAdminItemCache = [];

/* ---------- Chuẩn hoá id / dữ liệu đọc từ API ---------- */

/**
 * Chuẩn hoá id build / tướng / trang bị về chuỗi ("1" và 1 là một).
 * @returns {string} chuỗi rỗng nếu không có id.
 */
function normalizeBuildId(value) {
    if (value === null || value === undefined || value === '') return '';

    const number = Number(value);
    return Number.isFinite(number) ? String(number) : String(value).trim();
}

/**
 * Đọc một id bắt buộc là số (>= 0). Dùng cho heroId / mã trang bị trong form.
 * @returns {number|null} null nếu để trống hoặc không phải số.
 */
function buildAdminNumberId(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;

    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
}

/**
 * Bỏ build hỏng (không phải object hoặc thiếu id) và chống trùng id.
 * Giữ nguyên thứ tự đang có nên build admin thêm vẫn nằm ở cuối danh sách.
 */
function normalizeBuilds(list) {
    if (!Array.isArray(list)) return [];

    const seen = new Set();

    return list.filter((build) => {
        if (!build || typeof build !== 'object') return false;

        const id = normalizeBuildId(build.id);
        if (!id || seen.has(id)) return false;

        seen.add(id);
        return true;
    });
}

/**
 * Toàn bộ build đang đọc được (cache sau lần loadBuildsData() gần nhất).
 * @returns {Array}
 */
function getCachedBuilds() {
    return Array.isArray(buildAdminCache) ? buildAdminCache : [];
}

/**
 * Toàn bộ tướng đang đọc được (cache sau lần loadBuildHeroes() gần nhất).
 * @returns {Array}
 */
function getBuildAdminHeroes() {
    return Array.isArray(buildAdminHeroCache) ? buildAdminHeroCache : [];
}

/**
 * Toàn bộ trang bị đang đọc được (cache sau lần loadBuildItems() gần nhất).
 * @returns {Array}
 */
function getBuildAdminItems() {
    return Array.isArray(buildAdminItemCache) ? buildAdminItemCache : [];
}

/**
 * Tìm một build theo id trong cache (so sánh đã chuẩn hoá kiểu).
 * Chỉ trả kết quả sau khi trang đã gọi loadBuildsData().
 * @param {number|string} buildId
 * @returns {object|null}
 */
function findBuildById(buildId) {
    const id = normalizeBuildId(buildId);
    if (!id) return null;

    return getCachedBuilds().find((build) => normalizeBuildId(build.id) === id) || null;
}

/**
 * Tìm tướng theo id trong cache (để hiện tên tướng trên bảng và ô chọn).
 * @param {number|string} heroId
 * @returns {object|null}
 */
function findBuildAdminHero(heroId) {
    const id = normalizeBuildId(heroId);
    if (!id) return null;

    return getBuildAdminHeroes().find((hero) => normalizeBuildId(hero.id) === id) || null;
}

/**
 * Đọc toàn bộ build.
 * Ưu tiên API (đọc file builds.json hiện tại); khi API lỗi (vd chạy Live Server không có
 * backend) thì lùi về đọc file JSON tĩnh để trang vẫn hiển thị được.
 * @returns {Promise<Array>} luôn là mảng, rỗng nếu dữ liệu hỏng.
 */
async function loadBuildsData() {
    try {
        const response = await fetch(BUILD_ADMIN_API, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Không tải được build (HTTP ${response.status})`);

        const data = await response.json();
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.builds) ? data.builds : []);
        buildAdminCache = normalizeBuilds(list);
        return buildAdminCache;
    } catch (error) {
        console.error('Không đọc được dữ liệu build từ API, đọc file tĩnh', error);

        const fallback = await loadData(DATA_PATH.builds);
        if (Array.isArray(fallback)) buildAdminCache = normalizeBuilds(fallback);

        return getCachedBuilds();
    }
}

/**
 * Đọc toàn bộ tướng cho ô chọn / mục AD08.
 * Ưu tiên loadHeroes() của heroData.js (đã nạp sẵn trong admin.html); nếu vì lý do nào đó
 * chưa có hàm này thì tự đọc qua API rồi lùi về file tĩnh.
 * @returns {Promise<Array>}
 */
async function loadBuildHeroes() {
    if (typeof loadHeroes === 'function') {
        try {
            const list = await loadHeroes();
            if (Array.isArray(list) && list.length) {
                buildAdminHeroCache = list;
                return buildAdminHeroCache;
            }
        } catch (error) {
            // Rơi xuống nhánh dự phòng bên dưới.
        }
    }

    try {
        const response = await fetch(BUILD_ADMIN_HEROES_API, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Không tải được tướng (HTTP ${response.status})`);

        const data = await response.json();
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.heroes) ? data.heroes : []);
        buildAdminHeroCache = list;
        return buildAdminHeroCache;
    } catch (error) {
        const fallback = await loadData(DATA_PATH.heroes);
        buildAdminHeroCache = Array.isArray(fallback) ? fallback : [];
        return buildAdminHeroCache;
    }
}

/**
 * Đọc toàn bộ trang bị (chỉ để hiện tên trong phần xem trước trang bị của form).
 * Ưu tiên loadItems() của admin-items.js nếu mục Trang bị đã từng mở; nếu không thì tự đọc.
 * @returns {Promise<Array>}
 */
async function loadBuildItems() {
    if (typeof loadItems === 'function') {
        try {
            const list = await loadItems();
            if (Array.isArray(list) && list.length) {
                buildAdminItemCache = list;
                return buildAdminItemCache;
            }
        } catch (error) {
            // Rơi xuống nhánh dự phòng bên dưới.
        }
    }

    try {
        const response = await fetch(BASE_PATH + 'api/items', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Không tải được trang bị (HTTP ${response.status})`);

        const data = await response.json();
        buildAdminItemCache = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
        return buildAdminItemCache;
    } catch (error) {
        const fallback = await loadData(DATA_PATH.items);
        buildAdminItemCache = Array.isArray(fallback) ? fallback : [];
        return buildAdminItemCache;
    }
}

/* ---------- Phân quyền ---------- */

/**
 * Người dùng hiện tại có quyền thêm / sửa / xoá build không.
 * Chỉ tài khoản admin; trang nào không nạp auth.js (hoặc chưa đăng nhập) -> false.
 * @returns {boolean}
 */
function canManageBuilds() {
    return Boolean(
        typeof isLoggedIn === 'function'
        && isLoggedIn()
        && typeof isAdmin === 'function'
        && isAdmin(),
    );
}

/* ---------- Validate ---------- */

/**
 * Tách danh sách id (mảng hoặc chuỗi "101, 102") thành mảng số, tự bỏ id rỗng / trùng.
 * Id không phải số thì ghi lỗi vào errors.
 * @param {Array|string} value
 * @param {string} label tên trường để gắn vào thông báo lỗi.
 * @param {string[]} errors mảng lỗi được ghi thêm (truyền tham chiếu).
 * @returns {number[]}
 */
function buildAdminParseIdList(value, label, errors) {
    const parts = Array.isArray(value) ? value : String(value === undefined || value === null ? '' : value).split(',');
    const out = [];

    parts.forEach((raw) => {
        const text = String(raw).trim();
        if (!text) return;

        const id = Number(text);
        if (!Number.isFinite(id) || id < 0) {
            errors.push(`${label}: mã "${text}" không hợp lệ (phải là số lớn hơn hoặc bằng 0).`);
            return;
        }

        if (!out.includes(id)) out.push(id);
    });

    return out;
}

/**
 * Chuẩn hoá danh sách văn bản (mảng hoặc chuỗi nhiều dòng) thành mảng chuỗi đã trim,
 * bỏ dòng trống. Dùng cho tips[] và notes[].
 * @param {Array|string} value
 * @returns {string[]}
 */
function buildAdminTextList(value) {
    const parts = Array.isArray(value) ? value : String(value === undefined || value === null ? '' : value).split(/\r?\n/);
    return parts.map((line) => String(line).trim()).filter(Boolean);
}

/**
 * Chuẩn hoá các pha lên đồ. Bỏ pha hoàn toàn trống; mỗi pha còn lại có name / items / note.
 * @param {Array} value
 * @param {string[]} errors
 * @returns {Array<{ name: string, items: number[], note: string }>}
 */
function buildAdminNormalizePhases(value, errors) {
    const list = Array.isArray(value) ? value : [];
    const out = [];

    list.forEach((row, index) => {
        const source = row && typeof row === 'object' ? row : {};
        const name = String(source.name === undefined ? '' : source.name).trim();
        const note = String(source.note === undefined ? '' : source.note).trim();
        const items = buildAdminParseIdList(source.items, `Pha ${index + 1}`, errors);

        if (!name && !note && !items.length) return;
        out.push({ name, items, note });
    });

    return out;
}

/**
 * Chuẩn hoá trang bị thay thế theo tình huống. Bỏ dòng hoàn toàn trống; mã trang bị
 * gốc / thay thế để trống thì bỏ qua (chỉ nhận số nếu có nhập).
 * @param {Array} value
 * @param {string[]} errors
 * @returns {Array<{ when: string, replace: number|null, with: number|null, reason: string }>}
 */
function buildAdminNormalizeSituational(value, errors) {
    const list = Array.isArray(value) ? value : [];
    const out = [];

    list.forEach((row, index) => {
        const source = row && typeof row === 'object' ? row : {};
        const when = String(source.when === undefined ? '' : source.when).trim();
        const reason = String(source.reason === undefined ? '' : source.reason).trim();

        const hasReplace = source.replace !== undefined && String(source.replace).trim() !== '';
        const hasWith = source.with !== undefined && String(source.with).trim() !== '';
        const replace = buildAdminNumberId(source.replace);
        const withId = buildAdminNumberId(source.with);

        if (hasReplace && replace === null) {
            errors.push(`Tình huống ${index + 1}: trang bị gốc phải là mã số.`);
        }
        if (hasWith && withId === null) {
            errors.push(`Tình huống ${index + 1}: trang bị thay thế phải là mã số.`);
        }

        if (!when && !reason && !hasReplace && !hasWith) return;
        out.push({ when, replace, with: withId, reason });
    });

    return out;
}

/**
 * Chuẩn hoá tướng khắc chế. Bỏ dòng trống; dòng có lý do mà thiếu tướng thì báo lỗi.
 * @param {Array} value
 * @param {string[]} errors
 * @returns {Array<{ heroId: number, reason: string }>}
 */
function buildAdminNormalizeCounters(value, errors) {
    const list = Array.isArray(value) ? value : [];
    const out = [];

    list.forEach((row, index) => {
        const source = row && typeof row === 'object' ? row : {};
        const reason = String(source.reason === undefined ? '' : source.reason).trim();
        const heroId = buildAdminNumberId(source.heroId);

        if (heroId === null && !reason) return;
        if (heroId === null) {
            errors.push(`Tướng khắc chế ${index + 1}: phải chọn tướng.`);
            return;
        }

        out.push({ heroId, reason });
    });

    return out;
}

/**
 * Kiểm tra dữ liệu form thêm / sửa build.
 * Tách riêng khỏi createBuild()/updateBuild() để cùng một bộ quy tắc dùng cho form và test.
 *
 * Quy tắc:
 *   - tên: bắt buộc, tối thiểu BUILD_ADMIN_NAME_MIN ký tự
 *   - tướng (heroId): bắt buộc, phải là mã số
 *   - đường (lane) / lối chơi / mô tả / thứ tự kỹ năng: không bắt buộc
 *   - trang bị chính (items): chuỗi "101, 102" hoặc mảng; tự bỏ id rỗng / trùng
 *   - pha lên đồ (phases): mảng { name, items, note }; bỏ pha trống hoàn toàn
 *   - tình huống (situational): mảng { when, replace, with, reason }; bỏ dòng trống
 *   - tướng khắc chế (counters): mảng { heroId, reason }; bỏ dòng trống
 *   - mẹo (tips) / ghi chú (notes): mảng hoặc chuỗi nhiều dòng
 *
 * @param {object} input dữ liệu thô đọc từ form.
 * @returns {{ valid: boolean, errors: string[], values: object }} values đã chuẩn hoá,
 *          chỉ dùng khi valid === true.
 */
function validateBuildForm(input) {
    const errors = [];
    const source = input && typeof input === 'object' ? input : {};

    const name = String(source.name === undefined ? '' : source.name).trim();
    if (!name) {
        errors.push('Tên build không được để trống.');
    } else if (name.length < BUILD_ADMIN_NAME_MIN) {
        errors.push(`Tên build phải có ít nhất ${BUILD_ADMIN_NAME_MIN} ký tự.`);
    }

    const heroId = buildAdminNumberId(source.heroId);
    if (heroId === null) errors.push('Bạn phải chọn tướng cho build.');

    const items = buildAdminParseIdList(source.items, 'Trang bị chính', errors);
    const phases = buildAdminNormalizePhases(source.phases, errors);
    const situational = buildAdminNormalizeSituational(source.situational, errors);
    const counters = buildAdminNormalizeCounters(source.counters, errors);

    return {
        valid: !errors.length,
        errors,
        values: {
            heroId,
            name,
            lane: String(source.lane === undefined ? '' : source.lane).trim(),
            playstyle: String(source.playstyle === undefined ? '' : source.playstyle).trim(),
            description: String(source.description === undefined ? '' : source.description).trim(),
            skillOrder: String(source.skillOrder === undefined ? '' : source.skillOrder).trim(),
            items,
            phases,
            tips: buildAdminTextList(source.tips),
            situational,
            counters,
            notes: buildAdminTextList(source.notes),
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
async function requestBuildApi(url, options) {
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
            + '(nếu server đang chạy từ trước khi tạo vite.config.js thì /api/builds sẽ không tồn tại).',
            error,
        );
        return null;
    }
}

/**
 * Ghi TOÀN BỘ mảng build vào builds.json.
 * /api/builds không có POST/PUT theo id nên mọi thay đổi đều đi qua đây.
 * @param {Array} list mảng build đã chuẩn bị sẵn.
 * @returns {Promise<boolean>} true nếu ghi thành công.
 */
async function writeBuilds(list) {
    const result = await requestBuildApi(BUILD_ADMIN_API, {
        method: 'PUT',
        body: JSON.stringify(list),
    });

    return Boolean(result && result.ok === true);
}

/**
 * Id kế tiếp cho build mới: id lớn nhất hiện có + 1 (server không tự cấp).
 * @param {Array} list
 * @returns {number}
 */
function nextBuildId(list) {
    const max = list.reduce((current, build) => {
        const value = Number(build && build.id);
        return Number.isFinite(value) && value > current ? value : current;
    }, 0);

    return Math.floor(max) + 1;
}

/**
 * Thêm build mới. Build mới nằm ở CUỐI danh sách nên không đẩy thứ tự build mẫu.
 * Client tự cấp id (id lớn nhất + 1) rồi PUT lại cả mảng.
 *
 * Chỉ admin.
 *
 * @param {object} input dữ liệu form (cùng schema với validateBuildForm).
 * @returns {Promise<object|null>} build vừa tạo, null nếu không đủ quyền, dữ liệu
 *          không hợp lệ hoặc lưu thất bại.
 */
async function createBuild(input) {
    if (!canManageBuilds()) return null;

    const checked = validateBuildForm(input);
    if (!checked.valid) return null;

    const list = getCachedBuilds();
    const created = Object.assign({ id: nextBuildId(list) }, checked.values);

    const next = list.concat(created);
    if (!await writeBuilds(next)) return null;

    buildAdminCache = normalizeBuilds(next);
    return created;
}

/**
 * Sửa build đã có: giữ nguyên id, chỉ cập nhật nội dung.
 *
 * @param {number|string} buildId
 * @param {object} input dữ liệu form (cùng schema với validateBuildForm).
 * @returns {Promise<object|null>} build sau khi sửa, null nếu không đủ quyền, không
 *          tìm thấy, dữ liệu không hợp lệ hoặc lưu thất bại.
 */
async function updateBuild(buildId, input) {
    if (!canManageBuilds()) return null;

    const id = normalizeBuildId(buildId);
    if (!id) return null;

    const list = getCachedBuilds();
    const index = list.findIndex((build) => normalizeBuildId(build.id) === id);
    if (index === -1) return null;

    const checked = validateBuildForm(input);
    if (!checked.valid) return null;

    // Giữ nguyên id (và mọi trường lạ khác đang có), chỉ ghi đè nội dung form.
    const updated = Object.assign({}, list[index], checked.values, { id: list[index].id });

    const next = list.slice();
    next[index] = updated;

    if (!await writeBuilds(next)) return null;

    buildAdminCache = normalizeBuilds(next);
    return updated;
}

/**
 * Xoá một build khỏi builds.json.
 * Không dữ liệu nào khác trỏ tới id build nên chỉ cần gỡ khỏi mảng rồi ghi lại.
 *
 * Chỉ admin; thiếu quyền thì trả false và file giữ nguyên.
 *
 * @param {number|string} buildId
 * @returns {Promise<boolean>} true nếu build đã bị xoá.
 */
async function deleteBuild(buildId) {
    if (!canManageBuilds()) return false;

    const id = normalizeBuildId(buildId);
    if (!id || !findBuildById(id)) return false;

    const list = getCachedBuilds();
    const remaining = list.filter((build) => normalizeBuildId(build.id) !== id);

    if (!await writeBuilds(remaining)) return false;

    buildAdminCache = normalizeBuilds(remaining);
    return true;
}

/* =====================================================================
 * PHẦN 2 — GIAO DIỆN QUẢN LÝ BUILD (bảng + form + sự kiện)
 * ===================================================================== */

/** Từ khoá đang gõ trong ô tìm build; lưu trong bộ nhớ, không ghi lên URL. */
let buildAdminKeyword = '';

/** Lời hứa nạp dữ liệu dùng chung cho cả hai mục của tab (tránh nạp trùng). */
let buildAdminDataPromise = null;

/**
 * Nạp build + tướng + trang bị một lần cho cả hai mục của tab Build.
 * Mục "Quản lý build" đặt lại lời hứa này lúc mở tab (để lấy dữ liệu mới) rồi cả hai mục
 * cùng chờ chung một lời hứa (shell vẽ tuần tự: mục quản lý trước, mục tướng thiếu sau).
 * @returns {Promise<void>}
 */
function ensureBuildAdminData() {
    if (!buildAdminDataPromise) {
        buildAdminDataPromise = (async () => {
            await loadBuildsData();
            await loadBuildHeroes();
            await loadBuildItems();
        })();
    }

    return buildAdminDataPromise;
}

/* ---------- Bảng build ---------- */

/**
 * Đếm số build của một tướng (dùng cho cột "Số build" và mục AD08).
 * @param {number|string} heroId
 * @returns {number}
 */
function getBuildCountForHero(heroId) {
    const id = normalizeBuildId(heroId);
    if (!id) return 0;

    return getCachedBuilds().filter((build) => normalizeBuildId(build.heroId) === id).length;
}

/**
 * Build khớp với từ khoá đang gõ (so khớp theo tên build hoặc tên tướng, không phân biệt
 * hoa/thường và không phân biệt dấu tiếng Việt nhờ matchKeyword).
 * @returns {Array}
 */
function getBuildAdminFilteredBuilds() {
    const keyword = String(buildAdminKeyword || '').trim();
    const builds = getCachedBuilds();

    if (!keyword) return builds;

    return builds.filter((build) => {
        const hero = findBuildAdminHero(build.heroId);
        const text = `${build.name || ''} ${hero ? hero.name : ''}`;
        return matchKeyword(text, keyword);
    });
}

/**
 * Vẽ thanh công cụ: ô tìm theo tên build / tên tướng + nút "Thêm build".
 * Tái dùng class filter-bar / filter-bar__keyword như trang Quản trị bài viết.
 * @returns {Element|null} vùng chứa thanh công cụ, null nếu trang không có.
 */
function renderBuildAdminToolbar() {
    const toolbar = document.getElementById('build-admin-toolbar');
    if (!toolbar) return null;

    toolbar.innerHTML = `
        <div class="filter-bar">
            <input
                type="search"
                class="filter-bar__keyword"
                id="build-admin-keyword"
                placeholder="Tìm build theo tên build hoặc tên tướng..."
                aria-label="Tìm build theo tên build hoặc tên tướng"
            >
            <button type="button" class="btn btn-primary btn-sm" data-build-add>Thêm build</button>
        </div>
    `;

    const keywordInput = toolbar.querySelector('#build-admin-keyword');
    if (!keywordInput) return toolbar;

    // Gán sau innerHTML để không mất từ khoá đang tìm khi vẽ lại công cụ.
    keywordInput.value = buildAdminKeyword;

    // Gõ liên tục thì chỉ lọc lại sau khi ngừng gõ, tránh vẽ lại bảng mỗi ký tự.
    keywordInput.addEventListener('input', debounce(() => {
        buildAdminKeyword = keywordInput.value;
        renderBuildAdminTable();
    }, 200));

    return toolbar;
}

/**
 * Vẽ một dòng build trong bảng quản trị.
 * Mọi dữ liệu từ LocalStorage / API đều đi qua escapeHtml() trước khi đưa vào innerHTML.
 * @param {object} build
 * @returns {string} HTML string
 */
function renderBuildAdminRow(build) {
    const hero = findBuildAdminHero(build.heroId);
    const itemCount = Array.isArray(build.items) ? build.items.length : 0;
    const phaseCount = Array.isArray(build.phases) ? build.phases.length : 0;

    const heroCell = hero
        ? `<a href="${BASE_PATH}src/pages/hero-detail.html?id=${encodeURIComponent(hero.id)}">${escapeHtml(hero.name)}</a>`
        : '<span class="build-admin-muted">Chưa xác định</span>';

    return `
        <tr data-build-id="${escapeHtml(build.id)}">
            <td>${escapeHtml(build.id)}</td>
            <td>${heroCell}</td>
            <td>${escapeHtml(build.name || '')}</td>
            <td>${escapeHtml(build.lane || '—')}</td>
            <td>${itemCount} trang bị</td>
            <td>${phaseCount} pha</td>
            <td>
                <button
                    type="button"
                    class="btn btn-outline btn-sm"
                    data-build-edit="${escapeHtml(build.id)}"
                >Sửa</button>
                <button
                    type="button"
                    class="btn btn-outline btn-sm"
                    data-build-delete="${escapeHtml(build.id)}"
                >Xóa</button>
            </td>
        </tr>
    `;
}

/**
 * Vẽ bảng build theo từ khoá đang gõ.
 * Không build nào khớp thì hiện renderNotFound() thay cho bảng.
 */
function renderBuildAdminTable() {
    const tableBox = document.getElementById('build-admin-list');
    if (!tableBox) return;

    const total = getCachedBuilds().length;
    const builds = getBuildAdminFilteredBuilds();
    const countEl = document.getElementById('build-admin-count');

    // Có từ khoá thì báo "đang xem / tổng", không có thì chỉ báo tổng số build.
    if (countEl) {
        countEl.textContent = buildAdminKeyword.trim()
            ? `${builds.length} / ${total} build`
            : `${total} build`;
    }

    if (!builds.length) {
        tableBox.innerHTML = renderNotFound(
            total ? 'Không có build nào khớp từ khoá đang tìm.' : 'Chưa có build nào trong hệ thống.',
        );
        return;
    }

    tableBox.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Tướng</th>
                    <th>Tên build</th>
                    <th>Đường</th>
                    <th>Trang bị</th>
                    <th>Pha</th>
                    <th>Thao tác</th>
                </tr>
            </thead>
            <tbody>
                ${builds.map(renderBuildAdminRow).join('')}
            </tbody>
        </table>
    `;
}

/* ---------- Form thêm / sửa build ---------- */

/** Chuyển mảng id thành chuỗi để điền vào ô nhập ("101, 102"). */
function buildAdminIdListText(value) {
    return (Array.isArray(value) ? value : []).join(', ');
}

/** Dựng danh sách <option> tướng cho ô chọn (kèm tuỳ chọn "chưa chọn"). */
function buildAdminHeroOptionsHtml(selectedId, placeholder) {
    const selected = normalizeBuildId(selectedId);
    let html = `<option value=""${selected ? '' : ' selected'}>${escapeHtml(placeholder)}</option>`;

    getBuildAdminHeroes().forEach((hero) => {
        const id = normalizeBuildId(hero.id);
        html += `<option value="${escapeHtml(id)}"${id === selected ? ' selected' : ''}>`
            + `${escapeHtml(hero.name)} (${escapeHtml(id)})</option>`;
    });

    return html;
}

/** Dựng danh sách <option> đường đi cho ô chọn lane. */
function buildAdminLaneOptionsHtml(selected) {
    const current = String(selected || '');
    let html = `<option value=""${current ? '' : ' selected'}>— Chọn đường —</option>`;

    BUILD_ADMIN_LANES.forEach((lane) => {
        html += `<option value="${escapeHtml(lane)}"${current === lane ? ' selected' : ''}>${escapeHtml(lane)}</option>`;
    });

    return html;
}

/**
 * Một dòng pha lên đồ. Đọc/ghi qua thuộc tính data-* nên giá trị không mất khi thêm / bớt
 * dòng khác (mini-DOM và trình duyệt đều đọc được).
 * @param {object} [phase]
 * @returns {string} HTML string
 */
function renderBuildPhaseRow(phase) {
    const row = phase && typeof phase === 'object' ? phase : {};

    return `
        <div class="build-admin-row build-admin-row--phase" data-build-phase-row>
            <input type="text" data-phase-name placeholder="Tên pha (vd: Đầu trận)" aria-label="Tên pha" value="${escapeHtml(row.name || '')}">
            <input type="text" data-phase-items placeholder="Trang bị trong pha (mã, cách nhau dấu phẩy)" aria-label="Trang bị trong pha" value="${escapeHtml(buildAdminIdListText(row.items))}">
            <input type="text" data-phase-note placeholder="Ghi chú cho pha" aria-label="Ghi chú cho pha" value="${escapeHtml(row.note || '')}">
            <button type="button" class="btn btn-outline btn-sm" data-build-phase-remove aria-label="Xoá pha">×</button>
        </div>
    `;
}

/**
 * Một dòng trang bị thay thế theo tình huống (situational[]).
 * @param {object} [row]
 * @returns {string} HTML string
 */
function renderBuildSituationalRow(row) {
    const source = row && typeof row === 'object' ? row : {};
    const replace = source.replace === undefined || source.replace === null ? '' : source.replace;
    const withId = source.with === undefined || source.with === null ? '' : source.with;

    return `
        <div class="build-admin-row build-admin-row--situational" data-build-situational-row>
            <input type="text" data-situational-when placeholder="Khi nào (vd: Địch nhiều khống chế)" aria-label="Tình huống" value="${escapeHtml(source.when || '')}">
            <input type="number" min="0" step="1" data-situational-replace placeholder="Thay trang bị (mã)" aria-label="Trang bị bị thay" value="${escapeHtml(replace)}">
            <input type="number" min="0" step="1" data-situational-with placeholder="Bằng trang bị (mã)" aria-label="Trang bị thay vào" value="${escapeHtml(withId)}">
            <input type="text" data-situational-reason placeholder="Lý do" aria-label="Lý do thay trang bị" value="${escapeHtml(source.reason || '')}">
            <button type="button" class="btn btn-outline btn-sm" data-build-situational-remove aria-label="Xoá tình huống">×</button>
        </div>
    `;
}

/**
 * Một dòng tướng khắc chế (counters[]).
 * @param {object} [row]
 * @returns {string} HTML string
 */
function renderBuildCounterRow(row) {
    const source = row && typeof row === 'object' ? row : {};

    return `
        <div class="build-admin-row build-admin-row--counter" data-build-counter-row>
            <select data-counter-hero aria-label="Tướng khắc chế">${buildAdminHeroOptionsHtml(source.heroId, '— Chọn tướng khắc chế —')}
            </select>
            <input type="text" data-counter-reason placeholder="Lý do khắc chế" aria-label="Lý do khắc chế" value="${escapeHtml(source.reason || '')}">
            <button type="button" class="btn btn-outline btn-sm" data-build-counter-remove aria-label="Xoá tướng khắc chế">×</button>
        </div>
    `;
}

/**
 * Giá trị mặc định của form THÊM build mới (3 pha trống, chưa chọn tướng).
 * @returns {object}
 */
function defaultBuildFormValues() {
    return {
        heroId: '',
        name: '',
        lane: '',
        playstyle: '',
        description: '',
        skillOrder: '',
        items: [],
        phases: BUILD_ADMIN_PHASE_NAMES.map((name) => ({ name, items: [], note: '' })),
        tips: [],
        situational: [],
        counters: [],
        notes: [],
    };
}

/**
 * Chuyển một build đang lưu thành dữ liệu điền sẵn cho form SỬA.
 * @param {object} build
 * @returns {object}
 */
function buildFormValuesFromBuild(build) {
    const phases = Array.isArray(build.phases) && build.phases.length
        ? build.phases.map((phase) => {
            const row = phase && typeof phase === 'object' ? phase : {};
            return {
                name: row.name || '',
                items: Array.isArray(row.items) ? row.items.slice() : [],
                note: row.note || '',
            };
        })
        : defaultBuildFormValues().phases;

    return {
        heroId: normalizeBuildId(build.heroId),
        name: build.name || '',
        lane: build.lane || '',
        playstyle: build.playstyle || '',
        description: build.description || '',
        skillOrder: build.skillOrder || '',
        items: Array.isArray(build.items) ? build.items.slice() : [],
        phases,
        tips: Array.isArray(build.tips) ? build.tips.slice() : [],
        situational: Array.isArray(build.situational)
            ? build.situational.map((row) => {
                const item = row && typeof row === 'object' ? row : {};
                return {
                    when: item.when || '',
                    replace: item.replace === undefined || item.replace === null ? '' : item.replace,
                    with: item.with === undefined || item.with === null ? '' : item.with,
                    reason: item.reason || '',
                };
            })
            : [],
        counters: Array.isArray(build.counters)
            ? build.counters.map((row) => {
                const item = row && typeof row === 'object' ? row : {};
                return { heroId: normalizeBuildId(item.heroId), reason: item.reason || '' };
            })
            : [],
        notes: Array.isArray(build.notes) ? build.notes.slice() : [],
    };
}

/**
 * Đọc toàn bộ dữ liệu form đang mở về một object cùng schema với validateBuildForm.
 * @param {Element} form thẻ <form id="build-form">.
 * @returns {object}
 */
function readBuildFormValues(form) {
    const valueOf = (root, selector) => {
        const el = root.querySelector(selector);
        return el ? el.value : '';
    };

    const phases = Array.from(form.querySelectorAll('[data-build-phase-row]')).map((row) => ({
        name: valueOf(row, '[data-phase-name]'),
        items: valueOf(row, '[data-phase-items]'),
        note: valueOf(row, '[data-phase-note]'),
    }));

    const situational = Array.from(form.querySelectorAll('[data-build-situational-row]')).map((row) => ({
        when: valueOf(row, '[data-situational-when]'),
        replace: valueOf(row, '[data-situational-replace]'),
        with: valueOf(row, '[data-situational-with]'),
        reason: valueOf(row, '[data-situational-reason]'),
    }));

    const counters = Array.from(form.querySelectorAll('[data-build-counter-row]')).map((row) => ({
        heroId: valueOf(row, '[data-counter-hero]'),
        reason: valueOf(row, '[data-counter-reason]'),
    }));

    return {
        heroId: valueOf(form, '#build-hero'),
        name: valueOf(form, '#build-name'),
        lane: valueOf(form, '#build-lane'),
        playstyle: valueOf(form, '#build-playstyle'),
        description: valueOf(form, '#build-description'),
        skillOrder: valueOf(form, '#build-skill-order'),
        items: valueOf(form, '#build-items'),
        phases,
        tips: valueOf(form, '#build-tips'),
        situational,
        counters,
        notes: valueOf(form, '#build-notes'),
    };
}

/**
 * Vẽ phần xem trước trang bị chính: đọc mã trong #build-items rồi hiện tên trang bị tương ứng.
 * Mã không tìm thấy trong danh sách trang bị thì hiện cảnh báo nhỏ.
 * @param {Element} form thẻ <form id="build-form">.
 */
function renderBuildItemsPreview(form) {
    const box = form.querySelector('#build-items-preview');
    if (!box) return;

    const input = form.querySelector('#build-items');
    const ids = buildAdminParseIdList(input ? input.value : '', '', []);
    const items = getBuildAdminItems();

    if (!ids.length) {
        box.innerHTML = '';
        return;
    }

    box.innerHTML = ids.map((id) => {
        const item = items.find((entry) => normalizeBuildId(entry.id) === normalizeBuildId(id));
        const label = item ? item.name : `Không tìm thấy mã ${id}`;
        const modifier = item ? '' : ' is-missing';
        return `<span class="build-admin-chip${modifier}">${escapeHtml(label)}</span>`;
    }).join('');
}

/**
 * Render form thêm / sửa build.
 * Dùng chung cho cả hai chế độ nên không có form riêng cho việc sửa:
 *   - renderBuildAdminForm()                     -> form thêm mới (trống)
 *   - renderBuildAdminForm(buildToEdit)          -> form sửa, tự điền sẵn dữ liệu cũ
 *   - renderBuildAdminForm(null, heroId)         -> form thêm mới, chọn sẵn tướng (nút AD08)
 *
 * Trạng thái đang sửa được ghi ở data-edit-id của chính thẻ <form>.
 *
 * @param {object} [editingBuild] build cần sửa, bỏ trống nếu đang thêm mới.
 * @param {number|string} [preselectedHeroId] tướng chọn sẵn khi thêm mới (mục AD08).
 */
function renderBuildAdminForm(editingBuild, preselectedHeroId) {
    const box = document.getElementById('build-admin-form');
    if (!box) return;

    const editing = editingBuild || null;
    const values = editing ? buildFormValuesFromBuild(editing) : defaultBuildFormValues();

    if (!editing && preselectedHeroId !== undefined && preselectedHeroId !== null && preselectedHeroId !== '') {
        values.heroId = normalizeBuildId(preselectedHeroId);
    }

    const phasesHtml = values.phases.map(renderBuildPhaseRow).join('');
    const situationalHtml = values.situational.map(renderBuildSituationalRow).join('');
    const countersHtml = values.counters.map(renderBuildCounterRow).join('');

    box.innerHTML = `
        <form class="feed-form${editing ? ' is-editing' : ''}" id="build-form" novalidate${editing ? ` data-edit-id="${escapeHtml(editing.id)}"` : ''}>
            <h2>${editing ? 'Sửa build' : 'Thêm build mới'}</h2>
            ${editing ? `<p class="feed-form__hint">Đang sửa build “${escapeHtml(editing.name)}” (mã ${escapeHtml(editing.id)}). Thay đổi sẽ ghi đè build cũ, giữ nguyên id.</p>` : ''}
            <div id="build-form-errors"></div>

            <div class="form-group">
                <label for="build-name">Tên build *</label>
                <input type="text" id="build-name" placeholder="Ví dụ: Build sát thương chuẩn" value="${escapeHtml(values.name)}">
            </div>

            <div class="build-admin-grid">
                <div class="form-group">
                    <label for="build-hero">Tướng *</label>
                    <select id="build-hero">${buildAdminHeroOptionsHtml(values.heroId, '— Chọn tướng —')}
                    </select>
                </div>

                <div class="form-group">
                    <label for="build-lane">Đường đi</label>
                    <select id="build-lane">${buildAdminLaneOptionsHtml(values.lane)}
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label for="build-items">Trang bị chính</label>
                <input type="text" id="build-items" placeholder="101, 102, 103 (mã trang bị, cách nhau dấu phẩy)" value="${escapeHtml(buildAdminIdListText(values.items))}">
                <div id="build-items-preview" class="build-admin-chips"></div>
                <p class="feed-form__hint">Nhập mã trang bị theo đúng thứ tự lên đồ. Tên trang bị hiện ngay bên dưới để kiểm tra.</p>
            </div>

            <div class="form-group">
                <label for="build-playstyle">Lối chơi / định hướng</label>
                <textarea id="build-playstyle" rows="2" placeholder="Tướng này vào giao tranh thế nào, giữ vị trí ra sao...">${escapeHtml(values.playstyle)}</textarea>
            </div>

            <div class="form-group">
                <label for="build-description">Mô tả ngắn</label>
                <textarea id="build-description" rows="2" placeholder="Tóm tắt nhanh về hướng lên đồ của build">${escapeHtml(values.description)}</textarea>
            </div>

            <div class="form-group">
                <label for="build-skill-order">Thứ tự nâng kỹ năng</label>
                <input type="text" id="build-skill-order" placeholder="Chiêu 1 > Chiêu 2 > Chiêu 3" value="${escapeHtml(values.skillOrder)}">
            </div>

            <div class="form-group">
                <label>Các pha lên đồ</label>
                <div id="build-phase-rows" class="build-admin-rows">${phasesHtml}</div>
                <button type="button" class="btn btn-outline btn-sm" data-build-phase-add>Thêm pha</button>
            </div>

            <div class="form-group">
                <label>Trang bị thay thế theo tình huống</label>
                <div id="build-situational-rows" class="build-admin-rows">${situationalHtml}</div>
                <button type="button" class="btn btn-outline btn-sm" data-build-situational-add>Thêm tình huống</button>
            </div>

            <div class="form-group">
                <label>Tướng khắc chế</label>
                <div id="build-counter-rows" class="build-admin-rows">${countersHtml}</div>
                <button type="button" class="btn btn-outline btn-sm" data-build-counter-add>Thêm tướng khắc chế</button>
            </div>

            <div class="form-group">
                <label for="build-tips">Mẹo chơi (mỗi dòng một mẹo)</label>
                <textarea id="build-tips" rows="3" placeholder="Mỗi dòng là một mẹo khi chơi build này">${escapeHtml(values.tips.join('\n'))}</textarea>
            </div>

            <div class="form-group">
                <label for="build-notes">Ghi chú (mỗi dòng một ghi chú)</label>
                <textarea id="build-notes" rows="2" placeholder="Mỗi dòng là một ghi chú thêm">${escapeHtml(values.notes.join('\n'))}</textarea>
            </div>

            <div class="feed-form__actions">
                <button type="submit" class="btn btn-primary">${editing ? 'Lưu thay đổi' : 'Thêm build'}</button>
                ${editing ? '<button type="button" class="btn btn-outline" data-build-cancel>Huỷ</button>' : ''}
            </div>
        </form>
    `;

    const form = box.querySelector('#build-form');
    if (!form) return;

    // Gõ mã trang bị là thấy ngay tên trang bị tương ứng, không cần submit.
    const itemsInput = form.querySelector('#build-items');
    if (itemsInput) {
        itemsInput.addEventListener('input', () => renderBuildItemsPreview(form));
        renderBuildItemsPreview(form);
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const input = readBuildFormValues(form);
        const checked = validateBuildForm(input);
        const errorBox = form.querySelector('#build-form-errors');

        renderErrors(errorBox, checked.errors);
        if (!checked.valid) return;

        const editId = form.dataset.editId;

        if (editId) {
            // Sửa build cũ: giữ nguyên id, chỉ đổi nội dung.
            const updated = await updateBuild(editId, input);
            if (!updated) {
                renderErrors(errorBox, ['Không lưu được build. Hãy khởi động lại server bằng "npm run dev" (nạp vite.config.js) và dùng tài khoản quản trị viên.']);
                return;
            }

            // Vẽ lại form ở chế độ sửa với dữ liệu vừa lưu rồi báo thành công.
            renderBuildAdminForm(updated);
            renderSuccess(
                document.getElementById('build-admin-form').querySelector('#build-form-errors'),
                `Đã cập nhật build "${updated.name}".`,
            );
            refreshBuildAdminViews();
            return;
        }

        const created = await createBuild(input);
        if (!created) {
            renderErrors(errorBox, ['Không lưu được build. Hãy khởi động lại server bằng "npm run dev" (nạp vite.config.js) và dùng tài khoản quản trị viên.']);
            return;
        }

        // Thêm xong thì quay về form trống để sẵn sàng thêm build tiếp theo.
        renderBuildAdminForm(null);
        renderSuccess(
            document.getElementById('build-admin-form').querySelector('#build-form-errors'),
            `Đã thêm build "${created.name}" (mã ${created.id}).`,
        );
        refreshBuildAdminViews();
    });
}

/**
 * Thêm / bớt một dòng động (pha / tình huống / tướng khắc chế) ngay trong form mà không
 * vẽ lại cả form, để không mất dữ liệu đang gõ ở các ô khác.
 * @param {string} containerId
 * @param {string} html
 */
function appendBuildAdminRow(containerId, html) {
    const container = document.getElementById(containerId);
    if (container && typeof container.insertAdjacentHTML === 'function') {
        container.insertAdjacentHTML('beforeend', html);
    }
}

/**
 * Gỡ một dòng động khỏi form. Dùng .remove() của trình duyệt; môi trường DOM tối giản
 * (test) không có .remove() thì tự gỡ khỏi mảng children của phần tử cha.
 * @param {Element} row
 */
function removeBuildAdminRow(row) {
    if (!row) return;

    if (typeof row.remove === 'function') {
        row.remove();
        return;
    }

    const parent = row.parent;
    if (parent && Array.isArray(parent.children)) {
        parent.children = parent.children.filter((child) => child !== row);
    }
}

/* ---------- Thông báo khi không có quyền ---------- */

/**
 * Thông báo cho người dùng không có quyền (đã đăng nhập nhưng không phải admin).
 * Không vẽ form, không vẽ bảng, không đụng dữ liệu (fail-closed).
 * @param {string} message
 */
function renderBuildAdminDenied(message) {
    const formBox = document.getElementById('build-admin-form');
    if (formBox) formBox.innerHTML = '';

    const toolbar = document.getElementById('build-admin-toolbar');
    if (toolbar) toolbar.innerHTML = '';

    const listBox = document.getElementById('build-admin-list');
    if (!listBox) return;

    listBox.innerHTML = `
        <div class="post-detail-empty">
            ${renderNotFound(message)}
            <p class="post-detail-empty__actions">
                <a class="btn btn-outline" href="${BASE_PATH}index.html">← Về trang chủ</a>
            </p>
        </div>
    `;
}

/* ---------- Khởi tạo mục Quản lý build ---------- */

/**
 * Khởi tạo mục Quản lý build.
 * Chạy tự thoát nếu trang không có #build-admin-list để file này có thể nạp thừa ở trang
 * khác mà không làm hỏng trang đó.
 */
async function initBuildAdminPage() {
    const tableBox = document.getElementById('build-admin-list');
    if (!tableBox) return;

    // requireAdmin() đã được gọi sớm ở đầu admin.html. Ở đây chỉ kiểm tra lại bằng
    // isAdmin() sau khi chờ usersReady, vẫn fail-closed.
    await usersReady;

    if (typeof isAdmin !== 'function' || !isAdmin()) {
        renderBuildAdminDenied('Bạn không có quyền truy cập mục Quản lý build.');
        return;
    }

    // Nạp build + tướng + trang bị để bảng đầy đủ và để hợp đồng findBuildById() tra cứu
    // được đồng bộ ở các handler bên dưới.
    await ensureBuildAdminData();

    renderBuildAdminForm(null);
    renderBuildAdminToolbar();
    renderBuildAdminTable();
}

/**
 * Mục "Quản lý build" của tab Build (đăng ký bằng registerAdminSection() ở cuối file).
 * Shell tạo sẵn khung .admin-section + tiêu đề rồi truyền vào đây phần thân (container).
 * @param {Element} container phần thân .admin-section__body do shell cung cấp.
 */
async function renderBuildAdminSection(container) {
    if (!container) return;

    container.innerHTML = `
        <p class="admin-section__desc">
            Dành cho quản trị viên: thêm build mới, sửa hướng dẫn build (tướng, đường đi,
            lối chơi, trang bị chính, các pha lên đồ, thứ tự nâng kỹ năng, mẹo, trang bị
            thay thế, tướng khắc chế, ghi chú) hoặc xoá build khỏi hệ thống. Thay đổi lưu
            thẳng vào file src/data/builds.json và hiển thị ngay ở trang Build đề xuất.
        </p>

        <!-- Form thêm / sửa build: do renderBuildAdminForm() vẽ và gắn sự kiện -->
        <div id="build-admin-form"></div>

        <!-- Ô tìm theo tên build / tên tướng + nút thêm mới -->
        <div id="build-admin-toolbar" class="feed-filter"></div>

        <!-- Số build đang hiển thị / tổng số build trong hệ thống -->
        <p id="build-admin-count" class="feed-count" aria-live="polite"></p>

        <!-- Bảng build: do renderBuildAdminTable() vẽ từ lớp dữ liệu của file này -->
        <div id="build-admin-list" class="card"></div>
    `;

    // Từ khoá tìm kiếm cũ không được dính sang lần mở mục sau.
    buildAdminKeyword = '';

    // Mở lại tab thì lấy dữ liệu mới (build có thể vừa đổi ở mục Trang bị hoặc lần trước).
    buildAdminDataPromise = null;

    try {
        await initBuildAdminPage();
    } catch (error) {
        // Không để trang trắng nếu lớp dữ liệu lỗi.
        container.innerHTML = `
            <p class="admin-empty">
                Không hiển thị được mục Quản lý build. Hãy tải lại trang hoặc kiểm tra server.
            </p>
        `;
    }
}

/* =====================================================================
 * PHẦN 3 — GIAO DIỆN TƯỚNG CHƯA CÓ BUILD (AD08)
 * ===================================================================== */

/** Từ khoá tìm tướng trong mục AD08. */
let missingBuildKeyword = '';

/** Vai trò đang lọc trong mục AD08 ('' = tất cả). */
let missingBuildRole = '';

/**
 * Tình trạng build đang lọc: 'missing' (chưa có build — mặc định), 'has' (đã có build)
 * hoặc 'all' (tất cả tướng).
 */
let missingBuildStatus = 'missing';

/**
 * Danh sách tướng kèm số build tương ứng, đã áp bộ lọc tình trạng / vai trò / từ khoá.
 * Hàm thuần dữ liệu: không đụng DOM, không ném lỗi.
 * @returns {Array<{ hero: object, count: number }>}
 */
function getMissingBuildRows() {
    const keyword = String(missingBuildKeyword || '').trim();
    const role = String(missingBuildRole || '').trim();
    const status = missingBuildStatus;

    let rows = getBuildAdminHeroes().map((hero) => ({
        hero,
        count: getBuildCountForHero(hero.id),
    }));

    if (status === 'missing') rows = rows.filter((row) => row.count === 0);
    else if (status === 'has') rows = rows.filter((row) => row.count > 0);

    if (role) {
        rows = rows.filter((row) => Array.isArray(row.hero.role) && row.hero.role.includes(role));
    }

    if (keyword) {
        rows = rows.filter((row) => matchKeyword(row.hero.name, keyword));
    }

    return rows;
}

/**
 * Vẽ thanh công cụ lọc của mục AD08: ô tìm tướng, ô chọn vai trò và ô chọn tình trạng build.
 * @returns {Element|null}
 */
function renderMissingBuildToolbar() {
    const toolbar = document.getElementById('missing-build-toolbar');
    if (!toolbar) return null;

    const roles = typeof HERO_ROLES !== 'undefined' && Array.isArray(HERO_ROLES) ? HERO_ROLES : [];
    const roleOptions = roles.map((role) => `
                <option value="${escapeHtml(role)}"${missingBuildRole === role ? ' selected' : ''}>${escapeHtml(role)}</option>`).join('');

    const statuses = [
        { value: 'missing', label: 'Chưa có build' },
        { value: 'has', label: 'Đã có build' },
        { value: 'all', label: 'Tất cả tướng' },
    ];
    const statusOptions = statuses.map((item) => `
                <option value="${item.value}"${missingBuildStatus === item.value ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('');

    toolbar.innerHTML = `
        <div class="filter-bar">
            <input
                type="search"
                class="filter-bar__keyword"
                id="missing-build-keyword"
                placeholder="Tìm tướng theo tên..."
                aria-label="Tìm tướng theo tên"
            >
            <select class="filter-bar__select" id="missing-build-role" aria-label="Lọc theo vai trò">
                <option value="">Tất cả vai trò</option>${roleOptions}
            </select>
            <select class="filter-bar__select" id="missing-build-status" aria-label="Lọc theo tình trạng build">${statusOptions}
            </select>
        </div>
    `;

    const keywordInput = toolbar.querySelector('#missing-build-keyword');
    if (keywordInput) {
        keywordInput.value = missingBuildKeyword;
        keywordInput.addEventListener('input', debounce(() => {
            missingBuildKeyword = keywordInput.value;
            renderMissingBuildTable();
        }, 200));
    }

    const roleSelect = toolbar.querySelector('#missing-build-role');
    if (roleSelect) {
        roleSelect.addEventListener('change', () => {
            missingBuildRole = roleSelect.value;
            renderMissingBuildTable();
        });
    }

    const statusSelect = toolbar.querySelector('#missing-build-status');
    if (statusSelect) {
        statusSelect.addEventListener('change', () => {
            missingBuildStatus = statusSelect.value;
            renderMissingBuildTable();
        });
    }

    return toolbar;
}

/**
 * Vẽ một dòng tướng trong bảng AD08, kèm nút "Tạo build" chọn sẵn tướng cho form.
 * @param {{ hero: object, count: number }} row
 * @returns {string} HTML string
 */
function renderMissingBuildRow(row) {
    const hero = row.hero;
    const roles = (Array.isArray(hero.role) ? hero.role : []).map((role) => escapeHtml(role)).join(', ');
    const difficultyText = typeof DIFFICULTY_LABEL !== 'undefined' && DIFFICULTY_LABEL[hero.difficulty]
        ? DIFFICULTY_LABEL[hero.difficulty]
        : `Độ khó ${hero.difficulty}`;
    const countText = row.count === 0 ? '—' : `${row.count} build`;

    return `
        <tr data-missing-hero-id="${escapeHtml(hero.id)}">
            <td>${escapeHtml(hero.id)}</td>
            <td>
                <a href="${BASE_PATH}src/pages/hero-detail.html?id=${encodeURIComponent(hero.id)}">${escapeHtml(hero.name)}</a>
            </td>
            <td>${roles}</td>
            <td>${escapeHtml(difficultyText)}</td>
            <td>${countText}</td>
            <td>
                <button
                    type="button"
                    class="btn btn-outline btn-sm"
                    data-missing-build-create="${escapeHtml(hero.id)}"
                >Tạo build</button>
            </td>
        </tr>
    `;
}

/**
 * Vẽ bảng tướng theo bộ lọc AD08 đang áp.
 * Không tướng nào khớp thì hiện renderNotFound() với thông báo phù hợp tình trạng lọc.
 */
function renderMissingBuildTable() {
    const tableBox = document.getElementById('missing-build-list');
    if (!tableBox) return;

    const total = getBuildAdminHeroes().length;
    const rows = getMissingBuildRows();
    const countEl = document.getElementById('missing-build-count');

    if (countEl) {
        countEl.textContent = missingBuildStatus === 'missing'
            ? `${rows.length} / ${total} tướng chưa có build`
            : `${rows.length} / ${total} tướng`;
    }

    if (!rows.length) {
        let message = 'Không có tướng nào khớp bộ lọc đang chọn.';
        if (missingBuildStatus === 'missing' && !String(missingBuildKeyword || '').trim() && !missingBuildRole) {
            message = 'Tất cả tướng đều đã có build.';
        }
        tableBox.innerHTML = renderNotFound(message);
        return;
    }

    tableBox.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Tướng</th>
                    <th>Vai trò</th>
                    <th>Độ khó</th>
                    <th>Số build</th>
                    <th>Thao tác</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(renderMissingBuildRow).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Khởi tạo mục AD08.
 * Chạy tự thoát nếu trang không có #missing-build-list.
 */
async function initMissingBuildPage() {
    const tableBox = document.getElementById('missing-build-list');
    if (!tableBox) return;

    await usersReady;

    if (typeof isAdmin !== 'function' || !isAdmin()) {
        tableBox.innerHTML = `
            <div class="post-detail-empty">
                ${renderNotFound('Bạn không có quyền truy cập mục Tướng chưa có build.')}
            </div>
        `;
        return;
    }

    await ensureBuildAdminData();

    renderMissingBuildToolbar();
    renderMissingBuildTable();
}

/**
 * Mục "Tướng chưa có build" của tab Build (đăng ký bằng registerAdminSection() ở cuối file).
 * @param {Element} container phần thân .admin-section__body do shell cung cấp.
 */
async function renderMissingBuildSection(container) {
    if (!container) return;

    container.innerHTML = `
        <p class="admin-section__desc">
            Danh sách tướng CHƯA có build nào trong builds.json để quản trị viên biết còn
            thiếu hướng dẫn cho tướng nào. Lọc theo tên, vai trò và tình trạng build; bấm
            "Tạo build" để mở sẵn form bên trên với đúng tướng đó.
        </p>

        <!-- Ô tìm + lọc vai trò + lọc tình trạng build -->
        <div id="missing-build-toolbar" class="feed-filter"></div>

        <!-- Số tướng đang hiển thị / tổng số tướng -->
        <p id="missing-build-count" class="feed-count" aria-live="polite"></p>

        <!-- Bảng tướng: do renderMissingBuildTable() vẽ -->
        <div id="missing-build-list" class="card"></div>
    `;

    // Bộ lọc cũ không được dính sang lần mở mục sau.
    missingBuildKeyword = '';
    missingBuildRole = '';
    missingBuildStatus = 'missing';

    try {
        await initMissingBuildPage();
    } catch (error) {
        container.innerHTML = `
            <p class="admin-empty">
                Không hiển thị được mục Tướng chưa có build. Hãy tải lại trang hoặc kiểm tra server.
            </p>
        `;
    }
}

/* ---------- Làm mới cả hai mục sau khi CRUD ---------- */

/**
 * Vẽ lại bảng build, bảng AD08 và ô đếm sau mỗi lần thêm / sửa / xoá.
 * Mỗi hàm tự thoát nếu phần tử tương ứng chưa có trên trang.
 */
function refreshBuildAdminViews() {
    renderBuildAdminTable();
    renderMissingBuildTable();
}

/* =====================================================================
 * PHẦN 4 — SỰ KIỆN THÊM / SỬA / XOÁ + DÒNG ĐỘNG (event delegation)
 * ===================================================================== */

/*
 * Form và bảng đều được vẽ động bằng innerHTML nên không gắn sự kiện cho từng nút, mà gắn
 * một lần ở cấp document rồi dò theo data attribute (event delegation), đúng cách
 * hero-admin.js / admin-items.js xử lý nút thêm / sửa / xoá.
 */
document.addEventListener('click', async (event) => {
    // Chỉ xử lý click trong khu vực quản lý build (cả hai mục của tab) để không bắt nhầm
    // click của các mục admin khác.
    if (!event.target || typeof event.target.closest !== 'function'
        || !event.target.closest('#build-admin-form, #build-admin-toolbar, #build-admin-list, #missing-build-toolbar, #missing-build-list')) {
        return;
    }

    // Nút "Thêm build" trên thanh công cụ: quay về form trống.
    const addBtn = event.target.closest('[data-build-add]');
    if (addBtn) {
        renderBuildAdminForm(null);
        const formBox = document.getElementById('build-admin-form');
        if (formBox && formBox.scrollIntoView) formBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    // Nút "Huỷ" trong form sửa: bỏ thay đổi, về form thêm mới.
    const cancelBtn = event.target.closest('[data-build-cancel]');
    if (cancelBtn) {
        renderBuildAdminForm(null);
        return;
    }

    // Thêm / bớt dòng pha lên đồ.
    if (event.target.closest('[data-build-phase-add]')) {
        appendBuildAdminRow('build-phase-rows', renderBuildPhaseRow({ name: '', items: [], note: '' }));
        return;
    }
    if (event.target.closest('[data-build-phase-remove]')) {
        removeBuildAdminRow(event.target.closest('[data-build-phase-row]'));
        return;
    }

    // Thêm / bớt dòng trang bị thay thế theo tình huống.
    if (event.target.closest('[data-build-situational-add]')) {
        appendBuildAdminRow('build-situational-rows', renderBuildSituationalRow({}));
        return;
    }
    if (event.target.closest('[data-build-situational-remove]')) {
        removeBuildAdminRow(event.target.closest('[data-build-situational-row]'));
        return;
    }

    // Thêm / bớt dòng tướng khắc chế.
    if (event.target.closest('[data-build-counter-add]')) {
        appendBuildAdminRow('build-counter-rows', renderBuildCounterRow({}));
        return;
    }
    if (event.target.closest('[data-build-counter-remove]')) {
        removeBuildAdminRow(event.target.closest('[data-build-counter-row]'));
        return;
    }

    // Nút "Sửa": mở form ở chế độ sửa, điền sẵn dữ liệu của build đó.
    const editBtn = event.target.closest('[data-build-edit]');
    if (editBtn) {
        const build = findBuildById(editBtn.dataset.buildEdit);
        if (!build) {
            alert('Không tìm thấy build cần sửa.');
            return;
        }

        renderBuildAdminForm(build);
        const formBox = document.getElementById('build-admin-form');
        if (formBox && formBox.scrollIntoView) formBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    // Nút "Xóa": hỏi lại rồi xoá hẳn build (deleteBuild() tự kiểm tra quyền).
    const deleteBtn = event.target.closest('[data-build-delete]');
    if (deleteBtn) {
        const build = findBuildById(deleteBtn.dataset.buildDelete);
        if (!build) {
            alert('Không tìm thấy build cần xóa.');
            return;
        }

        if (!confirm(`Xóa vĩnh viễn build "${build.name}" của tướng "${(findBuildAdminHero(build.heroId) || {}).name || 'không xác định'}"?`)) return;

        if (!await deleteBuild(build.id)) {
            alert('Không xóa được build. Bạn cần đăng nhập bằng tài khoản quản trị viên và server phải đang chạy.');
            return;
        }

        // Đang sửa đúng build vừa bị xoá thì quay về form thêm mới.
        const form = document.getElementById('build-form');
        if (form && form.dataset.editId && normalizeBuildId(form.dataset.editId) === normalizeBuildId(build.id)) {
            renderBuildAdminForm(null);
        }

        refreshBuildAdminViews();
        return;
    }

    // Nút "Tạo build" của mục AD08: mở form thêm mới với tướng đã chọn sẵn.
    const createBtn = event.target.closest('[data-missing-build-create]');
    if (createBtn) {
        renderBuildAdminForm(null, createBtn.dataset.missingBuildCreate);

        const hero = findBuildAdminHero(createBtn.dataset.missingBuildCreate);
        const formBox = document.getElementById('build-admin-form');
        if (formBox && formBox.scrollIntoView) formBox.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Báo nhẹ để admin biết form đã chọn sẵn tướng nào.
        const box = document.getElementById('build-admin-form');
        const errorBox = box ? box.querySelector('#build-form-errors') : null;
        if (hero && errorBox && typeof renderSuccess === 'function') {
            renderSuccess(errorBox, `Đã chọn sẵn tướng "${hero.name}". Điền các trường còn lại rồi bấm "Thêm build".`);
        }

        return;
    }
});

/* =====================================================================
 * PHẦN 5 — ĐĂNG KÝ MỤC VÀO TRANG QUẢN LÝ
 * ===================================================================== */

// Đăng ký hai mục của tab "Build" (chỉ có tác dụng khi admin-shell.js đã nạp).
// File được shell chèn động SAU DOMContentLoaded nên không thêm handler tự khởi tạo.
if (typeof registerAdminSection === 'function') {
    registerAdminSection('builds', 'build-manager', 'Quản lý build', renderBuildAdminSection);
    registerAdminSection('builds', 'missing-builds', 'Tướng chưa có build', renderMissingBuildSection);
}
