/**
 * heroData.js - Lớp dữ liệu Tướng: đọc gộp và CRUD cho quản trị viên
 *
 * LocalStorage:
 *   aov_heroes         [ { id, name, alias, image, role[], difficulty,
 *                          stats{hp,attack,defense,speed},
 *                          skills[{name,type,description,cooldown}],
 *                          recommendedBuild[] } ]
 *                      tướng lấy từ data/heroes.json + tướng admin tự thêm
 *   aov_heroes_seeded  [ id ]  các id tướng từ heroes.json đã từng nạp, để tướng
 *                      đã bị xoá không bị nạp lại ("sống lại") khi mở trang
 *
 * Mỗi lần đọc, tướng trong data/heroes.json được MERGE theo id (giống hệt cách
 * feed.js nạp bài viết từ data/posts.json):
 *   - id đã có trong LocalStorage  -> giữ nguyên bản đang lưu, không ghi đè
 *   - id từng nạp rồi nhưng đã xoá -> không nạp lại
 *   - id mới                        -> thêm vào CUỐI danh sách
 *
 * Mọi trang hiển thị tướng đều đọc qua loadHeroes() thay vì loadData(DATA_PATH.heroes),
 * nhờ đó tướng admin thêm / sửa / xoá ở trang quản lý hiện ra ở mọi nơi
 * (Danh sách tướng, Chi tiết, So sánh, Yêu thích, Build, Feed, Trang chủ...).
 *
 * Phân quyền: thêm / sửa / xoá đều là việc của admin nên createHero(),
 * updateHero() và deleteHero() đều kiểm tra canManageHeroes() ở tầng dữ liệu
 * (đúng kiểu setPostHidden() của feed.js) — giao diện không tin được, gọi thẳng
 * từ console cũng không sửa được khi không đăng nhập bằng tài khoản admin.
 *
 * Dùng lại của các file khác: loadData() (loadData.js), DATA_PATH (config.js),
 * getStore()/setStore() (storage.js), isLoggedIn()/isAdmin() (auth.js),
 * escapeHtml()/renderHeroCard() (components.js), matchKeyword()/debounce() (search.js),
 * renderErrors()/renderSuccess() (auth.js).
 */

const HEROES_KEY = 'aov_heroes';
const HEROES_SEEDED_KEY = 'aov_heroes_seeded';

/** Vai trò hợp lệ của tướng, đúng theo dữ liệu trong data/heroes.json. */
const HERO_ROLES = ['Xạ thủ', 'Sát thủ', 'Pháp sư', 'Đấu sĩ', 'Đỡ đòn', 'Trợ thủ'];

/** Độ khó hợp lệ (nhãn hiển thị nằm trong DIFFICULTY_LABEL của components.js). */
const HERO_DIFFICULTIES = [1, 2, 3, 4, 5];

/** 4 chỉ số cơ bản trong hero.stats, đúng thứ tự hiển thị của bảng chỉ số. */
const HERO_STAT_KEYS = ['hp', 'attack', 'defense', 'speed'];

/** Loại kỹ năng hợp lệ — form dùng ô chọn sẵn, không nhập tay. */
const HERO_SKILL_TYPES = ['Chiêu 1', 'Chiêu 2', 'Chiêu 3'];

/** Số kỹ năng tối đa của một tướng — form mở sẵn từng đó ô trống. */
const HERO_SKILL_MAX = 3;

/** Giới hạn trên (giá trị phải nhỏ hơn) của từng chỉ số cơ bản trong form. */
const HERO_STAT_LIMITS = { hp: 10000, attack: 1000, defense: 1000, speed: 1000 };

/** Thời gian hồi chiêu tối đa (giá trị phải nhỏ hơn) của một kỹ năng, tính bằng giây. */
const HERO_SKILL_COOLDOWN_MAX = 60;

/* ---------- Chuẩn hoá id / dữ liệu đọc từ LocalStorage ---------- */

/**
 * Chuẩn hoá id tướng về chuỗi ("9001" và 9001 là một).
 * @returns {string} chuỗi rỗng nếu không có id.
 */
function normalizeHeroId(value) {
    if (value === null || value === undefined || value === '') return '';

    const number = Number(value);
    return Number.isFinite(number) ? String(number) : String(value).trim();
}

/**
 * Bỏ tướng hỏng (không phải object hoặc thiếu id) và chống trùng id.
 * Giữ nguyên thứ tự đang lưu nên tướng admin thêm vẫn nằm ở cuối danh sách.
 */
function normalizeHeroes(list) {
    if (!Array.isArray(list)) return [];

    const seen = new Set();

    return list.filter((hero) => {
        if (!hero || typeof hero !== 'object') return false;

        const id = normalizeHeroId(hero.id);
        if (!id || seen.has(id)) return false;

        seen.add(id);
        return true;
    });
}

function getStoredHeroes() {
    return normalizeHeroes(getStore(HEROES_KEY, []));
}

function setStoredHeroes(heroes) {
    return setStore(HEROES_KEY, normalizeHeroes(heroes));
}

function getSeededHeroIds() {
    const ids = getStore(HEROES_SEEDED_KEY, []);
    return Array.isArray(ids) ? ids.map(normalizeHeroId) : [];
}

/**
 * Nạp tướng mẫu từ data/heroes.json (mọi trang đọc tướng đều chạy).
 * Merge theo id nên không tạo tướng trùng, xem mô tả đầu file.
 * @returns {Array} danh sách tướng sau khi merge.
 */
async function seedHeroesFromJson() {
    const jsonHeroes = await loadData(DATA_PATH.heroes);
    const stored = getStoredHeroes();

    // Mọi id từng nạp + mọi id đang lưu đều được coi là "đã biết".
    const seeded = getSeededHeroIds();
    const known = new Set(seeded);
    stored.forEach((hero) => known.add(normalizeHeroId(hero.id)));

    const added = normalizeHeroes(jsonHeroes).filter((hero) => {
        const id = normalizeHeroId(hero.id);
        if (known.has(id)) return false;

        known.add(id);
        return true;
    });

    if (!added.length) {
        // Ghi lại danh sách id đã nạp (lần đầu chưa có ghi, hoặc heroes.json vừa thêm id mới).
        if (known.size > seeded.length) setStore(HEROES_SEEDED_KEY, [...known]);
        return stored;
    }

    const merged = stored.concat(added);
    setStoredHeroes(merged);
    setStore(HEROES_SEEDED_KEY, [...known]);

    return merged;
}

/**
 * Đọc toàn bộ tướng (dữ liệu tĩnh đã merge với bản chỉnh sửa trong LocalStorage).
 * Thay thế trực tiếp cho loadData(DATA_PATH.heroes) ở mọi trang.
 * @returns {Promise<Array>} luôn là mảng, rỗng nếu dữ liệu hỏng.
 */
async function loadHeroes() {
    try {
        const heroes = await seedHeroesFromJson();
        return Array.isArray(heroes) ? heroes : [];
    } catch (error) {
        console.error('Không đọc được dữ liệu tướng', error);
        return getStoredHeroes();
    }
}

/**
 * Tìm một tướng theo id (so sánh đã chuẩn hoá kiểu).
 * @param {number|string} heroId
 * @returns {object|null}
 */
function findHeroById(heroId) {
    const id = normalizeHeroId(heroId);
    if (!id) return null;

    return getStoredHeroes().find((hero) => normalizeHeroId(hero.id) === id) || null;
}

/* ---------- Phân quyền ---------- */

/**
 * Người dùng hiện tại có quyền thêm / sửa / xoá tướng không.
 * Chỉ tài khoản admin; trang nào không nạp auth.js (hoặc chưa đăng nhập) -> false.
 * @returns {boolean}
 */
function canManageHeroes() {
    return Boolean(
        typeof isLoggedIn === 'function'
        && isLoggedIn()
        && typeof isAdmin === 'function'
        && isAdmin(),
    );
}

/* ---------- Validate ---------- */

/**
 * Sinh alias (đường dẫn url thân thiện) từ tên tướng: bỏ dấu, viết thường, nối bằng -.
 * alias không được dùng để tra cứu trong dự án nhưng giữ cho schema giống heroes.json.
 * @param {string} name
 * @returns {string}
 */
function makeHeroAlias(name) {
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
 * Kiểm tra dữ liệu form thêm / sửa tướng.
 * Tách riêng khỏi createHero()/updateHero() để cùng một bộ quy tắc dùng cho
 * form và cho test.
 *
 * Quy tắc:
 *   - tên: tối thiểu HERO_NAME_MIN ký tự
 *   - vai trò: chính xác 1 giá trị nằm trong HERO_ROLES (form dùng radio,
 *     bỏ giá trị lạ, chối nếu tick từ 2 vai trò trở lên)
 *   - độ khó: phải là 1 trong HERO_DIFFICULTIES
 *   - 4 chỉ số: phải là số lớn hơn hoặc bằng 0 và nhỏ hơn HERO_STAT_LIMITS[key]
 *     (hp < 10000, attack / defense / speed < 1000)
 *   - kỹ năng: tối đa HERO_SKILL_MAX (3) dòng; dòng không có tên / mô tả / hồi chiêu
 *     thì bỏ qua (loại chiêu được chọn sẵn theo vị trí dòng nên không xét khi bỏ),
 *     dòng có nội dung thì bắt buộc có tên,
 *     loại chiêu CỐ ĐỊNH theo thứ tự dòng: dòng 1 -> Chiêu 1, dòng 2 -> Chiêu 2,
 *     dòng 3 -> Chiêu 3 (form khoá ô chọn nên chỉ nhận đúng loại tương ứng vị trí),
 *     hồi chiêu để trống thì coi là 0, có giá trị thì phải là số lớn hơn hoặc bằng 0
 *     và nhỏ hơn HERO_SKILL_COOLDOWN_MAX giây (60)
 *   - trang bị đề xuất: chuỗi id cách nhau dấu phẩy (hoặc mảng), id phải là số
 *
 * @param {object} input dữ liệu thô đọc từ form.
 * @returns {{ valid: boolean, errors: string[], values: object }} values đã chuẩn hoá,
 *          chỉ dùng khi valid === true.
 */
function validateHeroForm(input) {
    const errors = [];
    const source = input && typeof input === 'object' ? input : {};

    const name = String(source.name === undefined ? '' : source.name).trim();
    const image = String(source.image === undefined ? '' : source.image).trim();

    // Chỉ nhận vai trò có trong HERO_ROLES, giữ đúng thứ tự hiển thị của dự án.
    const pickedRoles = Array.isArray(source.roles) ? source.roles : [];
    const pickedSet = new Set(pickedRoles.map((role) => String(role).trim()));
    const roles = HERO_ROLES.filter((role) => pickedSet.has(role));
    if (!roles.length) errors.push('Bạn phải chọn ít nhất một vai trò hợp lệ.');
    else if (roles.length > 1) errors.push('Chỉ được chọn một vai trò cho mỗi tướng.');

    const difficulty = Number(source.difficulty);
    if (!HERO_DIFFICULTIES.includes(difficulty)) {
        errors.push('Độ khó phải là một số từ 1 đến 5.');
    }

    const rawStats = source.stats && typeof source.stats === 'object' ? source.stats : {};
    const stats = {};
    HERO_STAT_KEYS.forEach((key) => {
        const raw = rawStats[key];
        const isMissing = raw === undefined || raw === null || String(raw).trim() === '';
        const value = Number(raw);

        if (isMissing || !Number.isFinite(value) || value < 0) {
            errors.push(`Chỉ số "${key}" phải là số lớn hơn hoặc bằng 0.`);
            return;
        }

        if (value >= HERO_STAT_LIMITS[key]) {
            errors.push(`Chỉ số "${key}" phải nhỏ hơn ${HERO_STAT_LIMITS[key]}.`);
            return;
        }

        stats[key] = value;
    });

    // Kỹ năng: bỏ dòng trống (dòng mặc định vẫn có loại chiêu theo vị trí dòng
    // nên chỉ xét tên / mô tả / hồi chiêu), dòng có nội dung thì bắt buộc có tên
    // và loại chiêu đúng thứ tự dòng: dòng 1 -> Chiêu 1, 2 -> Chiêu 2, 3 -> Chiêu 3.
    const rawSkills = Array.isArray(source.skills) ? source.skills : [];
    const skills = [];

    rawSkills.forEach((rawSkill, rowIndex) => {
        const row = rawSkill && typeof rawSkill === 'object' ? rawSkill : {};
        const skillName = String(row.name === undefined ? '' : row.name).trim();
        const type = String(row.type === undefined ? '' : row.type).trim();
        const description = String(row.description === undefined ? '' : row.description).trim();
        const rawCooldown = String(row.cooldown === undefined ? '' : row.cooldown).trim();

        if (!skillName && !description && !rawCooldown) return;

        if (!skillName) {
            errors.push('Mỗi kỹ năng phải có tên.');
            return;
        }

        const expectedType = HERO_SKILL_TYPES[rowIndex];
        if (expectedType && type !== expectedType) {
            errors.push(`Loại của kỹ năng "${skillName}" phải là "${expectedType}" (loại chiêu cố định theo thứ tự dòng).`);
            return;
        }

        const cooldown = rawCooldown === '' ? 0 : Number(rawCooldown);
        if (!Number.isFinite(cooldown) || cooldown < 0) {
            errors.push(`Hồi chiêu của kỹ năng "${skillName}" phải là số lớn hơn hoặc bằng 0.`);
            return;
        }

        if (cooldown >= HERO_SKILL_COOLDOWN_MAX) {
            errors.push(`Hồi chiêu của kỹ năng "${skillName}" phải nhỏ hơn ${HERO_SKILL_COOLDOWN_MAX} giây.`);
            return;
        }

        skills.push({ name: skillName, type, description, cooldown });
    });

    if (skills.length > HERO_SKILL_MAX) {
        errors.push(`Một tướng chỉ được tối đa ${HERO_SKILL_MAX} kỹ năng.`);
    }

    // Trang bị đề xuất: nhận mảng id hoặc chuỗi "101, 102, 103".
    const rawBuild = Array.isArray(source.recommendedBuild)
        ? source.recommendedBuild
        : String(source.recommendedBuild === undefined ? '' : source.recommendedBuild).split(',');
    const recommendedBuild = [];

    rawBuild.forEach((rawId) => {
        const text = String(rawId).trim();
        if (!text) return;

        const id = Number(text);
        if (!Number.isFinite(id) || id < 0) {
            errors.push(`Mã trang bị "${text}" không hợp lệ (phải là số).`);
            return;
        }

        if (!recommendedBuild.includes(id)) recommendedBuild.push(id);
    });

    if (!name) {
        errors.push('Tên tướng không được để trống.');
    } else if (name.length < HERO_NAME_MIN) {
        errors.push(`Tên tướng phải có ít nhất ${HERO_NAME_MIN} ký tự.`);
    }

    return {
        valid: !errors.length,
        errors,
        values: {
            name,
            alias: makeHeroAlias(name),
            image,
            role: roles,
            difficulty,
            stats,
            skills,
            recommendedBuild,
        },
    };
}

/** Độ dài tối thiểu của tên tướng (ký tự). */
const HERO_NAME_MIN = 2;

/* ---------- CRUD (chỉ admin) ---------- */

/**
 * id tiếp theo cho tướng mới: lớn nhất trong danh sách + 1, luôn là số nguyên dương.
 * Dùng id số nguyên vì builds.json / posts.json / yêu thích / so sánh đều tham chiếu
 * tướng bằng id số.
 * @param {Array} heroes
 * @returns {number}
 */
function nextHeroId(heroes) {
    const max = (Array.isArray(heroes) ? heroes : []).reduce((current, hero) => {
        const id = Number(hero && hero.id);
        return Number.isFinite(id) && id > current ? id : current;
    }, 0);

    return Math.floor(max) + 1;
}

/**
 * Thêm tướng mới. Tướng mới nằm ở CUỐI danh sách nên không đẩy thứ tự
 * tướng mẫu trong heroes.json (trang Danh sách vẫn giữ "Thứ tự mặc định" cũ).
 *
 * Chỉ admin. Bài chỉ nằm trong aov_heroes (LocalStorage), KHÔNG ghi vào
 * data/heroes.json vì file đó là dữ liệu tĩnh của dự án.
 *
 * @param {object} input dữ liệu form (cùng schema với validateHeroForm).
 * @returns {object|null} tướng vừa tạo, null nếu không đủ quyền, dữ liệu không
 *          hợp lệ hoặc lưu thất bại.
 */
function createHero(input) {
    if (!canManageHeroes()) return null;

    const checked = validateHeroForm(input);
    if (!checked.valid) return null;

    const heroes = getStoredHeroes();
    const hero = Object.assign({ id: nextHeroId(heroes) }, checked.values);

    heroes.push(hero);

    return setStoredHeroes(heroes) ? hero : null;
}

/**
 * Sửa tướng đã có: giữ nguyên id, chỉ cập nhật nội dung và ghi updatedAt.
 *
 * @param {number|string} heroId
 * @param {object} input dữ liệu form (cùng schema với validateHeroForm).
 * @returns {object|null} tướng sau khi sửa, null nếu không đủ quyền, không tìm
 *          thấy tướng, dữ liệu không hợp lệ hoặc lưu thất bại.
 */
function updateHero(heroId, input) {
    if (!canManageHeroes()) return null;

    const id = normalizeHeroId(heroId);
    if (!id) return null;

    const heroes = getStoredHeroes();
    const index = heroes.findIndex((hero) => normalizeHeroId(hero.id) === id);
    if (index === -1) return null;

    const checked = validateHeroForm(input);
    if (!checked.valid) return null;

    const updated = Object.assign({}, heroes[index], checked.values, {
        updatedAt: new Date().toISOString(),
    });

    heroes[index] = updated;

    return setStoredHeroes(heroes) ? updated : null;
}

/**
 * Xoá một tướng.
 *
 * Chỉ admin; thiếu quyền thì trả false và aov_heroes giữ nguyên.
 * Id tướng đã xoá nằm trong aov_heroes_seeded nên heroes.json sẽ không nạp lại
 * ("sống lại") ở lần mở trang sau.
 *
 * @param {number|string} heroId
 * @returns {boolean} true nếu tướng đã bị xoá.
 */
function deleteHero(heroId) {
    if (!canManageHeroes()) return false;

    const id = normalizeHeroId(heroId);
    if (!id) return false;

    const heroes = getStoredHeroes();
    const target = heroes.find((hero) => normalizeHeroId(hero.id) === id);
    if (!target) return false;

    if (!setStoredHeroes(heroes.filter((hero) => normalizeHeroId(hero.id) !== id))) {
        return false;
    }

    purgeHeroReferences(id);

    return true;
}

/**
 * Dọn các tham chiếu tới tướng vừa bị xoá để dữ liệu khác không còn trỏ vào id ma:
 * bỏ khỏi Yêu thích / Lịch sử / So sánh. Các trang đều tự chịu được id không còn
 * (hiện "không tìm thấy") nhưng dọn sạch sẽ hơn.
 *
 * storage.js không nạp trên trang nào thì bỏ qua phần đó (typeof guard).
 * @param {number|string} heroId id đã chuẩn hoá qua normalizeHeroId.
 */
function purgeHeroReferences(heroId) {
    const id = normalizeHeroId(heroId);
    if (!id) return;

    if (
        typeof getFavorites === 'function'
        && typeof removeFavorite === 'function'
        && getFavorites('hero').some((item) => normalizeHeroId(item) === id)
    ) {
        removeFavorite('hero', id);
    }

    if (typeof getHistory === 'function' && typeof setStore === 'function') {
        const history = getHistory().filter((item) => normalizeHeroId(item) !== id);
        setStore('aov_history', history);
    }

    if (typeof getCompare === 'function' && typeof setCompare === 'function') {
        const compare = getCompare().filter((item) => normalizeHeroId(item) !== id);
        setCompare(compare);
    }
}
