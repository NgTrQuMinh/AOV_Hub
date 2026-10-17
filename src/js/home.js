/**
 * home.js - Trang chủ
 * Phụ trách: Người 1
 *
 * Trang chủ mới: tướng của tuần (winRate), chip "được tìm nhiều", ô vai trò,
 * tab vai trò + thẻ tướng nổi bật (winRate), build nhiều lượt thích, tin tức mới nhất.
 * Vẫn giữ khối cũ "Trang bị nổi bật" (featured === true) và nút yêu thích.
 *
 * Phụ thuộc (nạp trước home.js trong index.html): loadData.js, dataStore.js,
 * components.js, heroData.js, favorite.js.
 */
/**
 * Khối "Tướng nổi bật".
 * - role = 'all': giữ nguyên hành vi cũ (tướng có featured === true, tối đa 8).
 * - role = tên vai trò: đúng 5 tướng đầu của vai trò đó, sắp theo tỉ lệ thắng giảm dần.
 * Mỗi thẻ dùng lại markup cũ (hero-card__media/body/name + nút yêu thích) và
 * thêm lớp mới (.hero-card-media/.hero-card-role/.hero-card-name/.win-row) của trang chủ mới.
 * @param {string} [role='all']
 */
async function renderFeaturedHeroes(role) {
    try {
        const container = document.getElementById('featured-heroes');
        if (!container) return;

        const heroes = await homeLoadHeroes();
        const pickedRole = role && role !== 'all' ? String(role) : '';

        let list;
        if (pickedRole) {
            list = homeSortByWinRate(heroes.filter((hero) => homeHeroRoles(hero).includes(pickedRole))).slice(0, 5);
        } else {
            list = heroes.filter((hero) => hero.featured === true).slice(0, 8);
        }

        container.innerHTML = list.length
            ? list.map(homeHeroCardHtml).join('')
            : renderNotFound('Chưa có dữ liệu tướng nổi bật.');

        if (typeof refreshFavoriteButtons === 'function') refreshFavoriteButtons();
    } catch (error) {
        console.error('home: renderFeaturedHeroes lỗi', error);
    }
}

async function renderFeaturedItems() {
    const container = document.getElementById('featured-items');
    if (!container) return;

    const items = await loadData(DATA_PATH.items);
    const featured = items.filter((item) => item.featured === true).slice(0, 8);

    container.innerHTML = featured.length
        ? featured.map(renderItemCard).join('')
        : renderNotFound('Chưa có dữ liệu trang bị nổi bật.');

    if (typeof refreshFavoriteButtons === 'function') refreshFavoriteButtons();
}

/* ============================================================
 * TASK HOME-d - Đổ dữ liệu cho trang chủ mới
 * Mỗi hàm bọc try/catch, một khối lỗi không làm các khối sau dừng chạy.
 * ============================================================ */

/** Đường dẫn gốc của site (BASE_PATH khai báo trong config.js). */
function homeBase() {
    return typeof BASE_PATH === 'string' ? BASE_PATH : '/';
}

/** Đường dẫn file JSON: ưu tiên DATA_PATH của config.js, không có thì ghép thủ công. */
function homeDataPath(name) {
    if (typeof DATA_PATH === 'object' && DATA_PATH && DATA_PATH[name]) return DATA_PATH[name];
    return homeBase() + 'src/data/' + name + '.json';
}

/** Thoát HTML: dùng escapeHtml (components.js) nếu có. */
function homeEscape(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Đường dẫn ảnh: dùng imageUrl (components.js) nếu có, không thì placeholder. */
function homeImage(image) {
    if (typeof imageUrl === 'function') return imageUrl(image);
    return homeBase() + 'assets/images/placeholder.svg';
}

/** Khối "không có dữ liệu" dùng lại renderNotFound (components.js). */
function homeNotFound(message) {
    if (typeof renderNotFound === 'function') return renderNotFound(message);
    return '<div class="not-found" role="status"><p class="not-found__text">' + homeEscape(message) + '</p></div>';
}

/** Gán text an toàn cho một phần tử theo id (không dựng HTML). */
function homeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

/** Chạy một hàm bất đồng bộ mà không để lỗi làm dừng các hàm khác. */
async function homeRunSafe(fn, ...args) {
    try {
        if (typeof fn === 'function') await fn(...args);
    } catch (error) {
        console.error('home: khối khởi tạo lỗi', error);
    }
}

/* ---------- Đọc dữ liệu dùng chung (có cache trong phiên) ---------- */

let homeHeroesCache = null;
let homeItemsCache = null;
let homeBuildsCache = null;

/** Đọc tướng qua loadHeroes (heroData.js). */
async function homeLoadHeroes() {
    if (homeHeroesCache) return homeHeroesCache;

    try {
        const list = typeof loadHeroes === 'function' ? await loadHeroes() : [];
        homeHeroesCache = Array.isArray(list) ? list : [];
    } catch (error) {
        console.error('home: không đọc được tướng', error);
        homeHeroesCache = [];
    }

    return homeHeroesCache;
}

/** Đọc một file JSON qua loadData (loadData.js). */
async function homeLoadJson(name) {
    try {
        const data = await loadData(homeDataPath(name));
        return data === null || data === undefined ? [] : data;
    } catch (error) {
        console.error('home: không đọc được ' + name, error);
        return [];
    }
}

/** Đọc danh sách trang bị. */
async function homeLoadItems() {
    if (homeItemsCache) return homeItemsCache;
    const data = await homeLoadJson('items');
    homeItemsCache = Array.isArray(data) ? data : [];
    return homeItemsCache;
}

/** Đọc danh sách build. */
async function homeLoadBuilds() {
    if (homeBuildsCache) return homeBuildsCache;
    const data = await homeLoadJson('builds');
    homeBuildsCache = Array.isArray(data) ? data : [];
    return homeBuildsCache;
}

/* ---------- Tiện ích tỉ lệ thắng ---------- */

/** Giá trị winRate dạng số (thiếu/không hợp lệ -> -Infinity để xếp cuối). */
function homeWinRateValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : -Infinity;
}

/** Chuỗi hiển thị tỉ lệ thắng, thiếu dữ liệu -> "—". */
function homeWinRateText(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(1) + '%' : '—';
}

/** Phần trăm bề rộng thanh, kẹp trong 0..100; thiếu dữ liệu -> 0. */
function homeWinRatePercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(100, number));
}

/** Sắp xếp danh sách tướng theo tỉ lệ thắng giảm dần (không sửa mảng gốc). */
function homeSortByWinRate(list) {
    return (Array.isArray(list) ? list.slice() : [])
        .sort((a, b) => homeWinRateValue(b && b.winRate) - homeWinRateValue(a && a.winRate));
}

/** Lấy N tướng có tỉ lệ thắng cao nhất. */
function homeTopByWinRate(list, count) {
    return homeSortByWinRate(list).slice(0, count);
}

/* ---------- 1. Tướng của tuần ---------- */

let homeWeekHeroes = [];
let homeWeekIndex = 0;
let homeWeekBound = false;

/** Chuẩn hoá chỉ số vòng: luôn nằm trong 0..length-1. */
function homeNormalizeIndex(index, length) {
    if (!length) return 0;
    return ((Number(index) % length) + length) % length;
}

/**
 * Hiển thị tướng của tuần theo vị trí index (quay vòng) trong 3 tướng winRate cao nhất.
 * @param {number} index
 */
async function renderWeekHero(index) {
    try {
        const heroes = await homeLoadHeroes();
        homeWeekHeroes = homeTopByWinRate(heroes, 3);
        homeWeekIndex = homeNormalizeIndex(index, homeWeekHeroes.length);

        if (!homeWeekHeroes.length) {
            homeSetText('hero-week-name', 'Chưa có dữ liệu');
            homeSetText('hero-week-role', '');
            homeSetText('hero-week-win', '—');
            const dots = document.getElementById('hero-dots');
            if (dots) dots.innerHTML = '';
            return;
        }

        homeUpdateWeekHero();
        homeBindWeekControls();
    } catch (error) {
        console.error('home: renderWeekHero lỗi', error);
    }
}

/** Vẽ lại phần hiển thị của tướng của tuần (ảnh, tên, vai trò, tỉ lệ thắng, chấm). */
function homeUpdateWeekHero() {
    const hero = homeWeekHeroes[homeWeekIndex];
    if (!hero) return;

    const img = document.getElementById('hero-week-img');
    if (img) {
        img.src = homeImage(hero.image);
        img.alt = hero.name || '';
    }

    homeSetText('hero-week-name', hero.name || '—');
    homeSetText('hero-week-role', homeHeroRoles(hero).join(', '));
    homeSetText('hero-week-win', homeWinRateText(hero.winRate));
    homeRenderWeekDots();
}

/** Tạo 3 chấm chọn tướng, chấm đang xem có class active. */
function homeRenderWeekDots() {
    const dots = document.getElementById('hero-dots');
    if (!dots) return;

    dots.innerHTML = homeWeekHeroes.map((hero, i) => (
        '<button type="button" class="hero-dot' + (i === homeWeekIndex ? ' active' : '')
        + '" data-index="' + i + '" aria-label="Tướng ' + (i + 1) + '"></button>'
    )).join('');
}

/** Gắn sự kiện cho nút trước/sau và chấm (chỉ gắn một lần). */
function homeBindWeekControls() {
    if (homeWeekBound) return;
    homeWeekBound = true;

    const prev = document.getElementById('hero-prev');
    const next = document.getElementById('hero-next');
    if (prev) prev.addEventListener('click', () => homeStepWeek(-1));
    if (next) next.addEventListener('click', () => homeStepWeek(1));

    const dots = document.getElementById('hero-dots');
    if (dots) {
        dots.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-index]');
            if (!btn) return;
            homeWeekIndex = homeNormalizeIndex(Number(btn.dataset.index), homeWeekHeroes.length);
            homeUpdateWeekHero();
        });
    }
}

/** Đổi tướng của tuần sang trước/sau và quay vòng. */
function homeStepWeek(direction) {
    if (!homeWeekHeroes.length) return;
    homeWeekIndex = homeNormalizeIndex(homeWeekIndex + direction, homeWeekHeroes.length);
    homeUpdateWeekHero();
}

/* ---------- 2. Được tìm nhiều ---------- */

let homeTrendingBound = false;

/** Tạo 4 chip tên 4 tướng winRate cao nhất; bấm chip thì điền vào ô tìm kiếm header. */
async function renderTrending() {
    try {
        const container = document.getElementById('hero-trending');
        if (!container) return;

        const heroes = await homeLoadHeroes();
        const top = homeTopByWinRate(heroes, 4);

        container.innerHTML = top.map((hero) => (
            '<button type="button" class="trend-chip" data-keyword="' + homeEscape(hero.name) + '">'
            + homeEscape(hero.name) + '</button>'
        )).join('');

        if (!homeTrendingBound) {
            homeTrendingBound = true;
            container.addEventListener('click', homeTrendingClick);
        }
    } catch (error) {
        console.error('home: renderTrending lỗi', error);
    }
}

/** Bấm chip: điền tên tướng vào ô tìm kiếm trên header rồi focus. */
function homeTrendingClick(event) {
    const chip = event.target.closest('.trend-chip');
    if (!chip) return;

    const input = document.querySelector('.header-search__input');
    if (input) {
        input.value = chip.dataset.keyword || '';
        input.focus();
    }
}

/* ---------- 3. Khám phá theo vai trò ---------- */

/** Chuẩn hoá 1 tướng thành danh sách vai trò (hero.role là mảng trong heroes.json). */
function homeHeroRoles(hero) {
    if (!hero) return [];
    if (Array.isArray(hero.role)) return hero.role.filter(Boolean).map(String);
    if (hero.role) return [String(hero.role)];
    return [];
}

/** Danh sách vai trò theo đúng thứ tự hiển thị của dự án (HERO_ROLES nếu có). */
function homeRoleList(heroes) {
    const fromData = [];
    heroes.forEach((hero) => {
        homeHeroRoles(hero).forEach((role) => {
            if (!fromData.includes(role)) fromData.push(role);
        });
    });

    if (typeof HERO_ROLES !== 'undefined' && Array.isArray(HERO_ROLES)) {
        const ordered = HERO_ROLES.filter((role) => fromData.includes(role));
        fromData.forEach((role) => { if (!ordered.includes(role)) ordered.push(role); });
        return ordered;
    }

    return fromData;
}

/** Nhóm tướng theo vai trò: tướng đầu tiên (để lấy ảnh) và số lượng. */
function homeRoleGroups(heroes) {
    return homeRoleList(heroes).map((role) => {
        const members = heroes.filter((hero) => homeHeroRoles(hero).includes(role));
        return { role: role, hero: members[0] || null, count: members.length };
    });
}

/** Ô vai trò: ảnh + tên + số tướng, trỏ trang danh sách tướng (không lọc vai trò trên URL). */
async function renderRoleGrid() {
    try {
        const container = document.getElementById('role-grid');
        if (!container) return;

        const heroes = await homeLoadHeroes();
        const groups = homeRoleGroups(heroes);

        if (!groups.length) {
            container.innerHTML = homeNotFound('Chưa có dữ liệu tướng.');
            return;
        }

        container.innerHTML = groups.map((group) => {
            const img = group.hero ? homeImage(group.hero.image) : homeImage('');
            return '<a class="role-tile" href="' + homeBase() + 'src/pages/heroes.html">'
                + '<img class="role-tile-img" src="' + img + '" alt="' + homeEscape(group.role) + '" loading="lazy" onerror="handleImageError(this)">'
                + '<span class="role-tile-name">' + homeEscape(group.role) + '</span>'
                + '<span class="role-tile-count">' + group.count + ' tướng</span>'
                + '</a>';
        }).join('');
    } catch (error) {
        console.error('home: renderRoleGrid lỗi', error);
    }
}

/* ---------- 4. Tab vai trò + thẻ tướng nổi bật ---------- */

let homeActiveRole = 'all';
let homeRoleTabsBound = false;

/** Tạo tab "Tất cả" + mỗi vai trò; tab đang chọn có class active. */
async function renderRoleTabs() {
    try {
        const container = document.getElementById('role-tabs');
        if (!container) return;

        const heroes = await homeLoadHeroes();
        const tabs = ['all'].concat(homeRoleList(heroes));

        container.innerHTML = tabs.map((role) => {
            const label = role === 'all' ? 'Tất cả' : role;
            const active = role === homeActiveRole ? ' active' : '';
            return '<button type="button" class="role-tab' + active + '" data-role="' + homeEscape(role) + '">'
                + homeEscape(label) + '</button>';
        }).join('');

        if (!homeRoleTabsBound) {
            homeRoleTabsBound = true;
            container.addEventListener('click', homeRoleTabClick);
        }
    } catch (error) {
        console.error('home: renderRoleTabs lỗi', error);
    }
}

/** Bấm tab: đổi vai trò đang chọn rồi vẽ lại lưới tướng nổi bật. */
function homeRoleTabClick(event) {
    const tab = event.target.closest('.role-tab');
    if (!tab) return;

    homeActiveRole = tab.dataset.role || 'all';

    document.querySelectorAll('#role-tabs .role-tab').forEach((btn) => {
        btn.classList.toggle('active', btn === tab);
    });

    homeRunSafe(renderFeaturedHeroes, homeActiveRole);
}

/** HTML 1 thẻ tướng nổi bật (giữ class cũ + thêm class mới của trang chủ mới). */
function homeHeroCardHtml(hero) {
    const id = encodeURIComponent(hero.id);
    const url = homeBase() + 'src/pages/hero-detail.html?id=' + id;
    const rolesText = homeHeroRoles(hero).map(homeEscape).join(', ');

    return '<article class="hero-card">'
        + '<a class="hero-card-media hero-card__media" href="' + url + '">'
        + '<img src="' + homeImage(hero.image) + '" alt="' + homeEscape(hero.name) + '" width="300" height="225" loading="lazy" decoding="async" onerror="handleImageError(this)">'
        + '</a>'
        + '<button type="button" class="btn-favorite" data-type="hero" data-id="' + homeEscape(hero.id) + '"'
        + ' aria-label="Yêu thích ' + homeEscape(hero.name) + '" aria-pressed="false">'
        + '<span aria-hidden="true">♥</span></button>'
        + '<div class="hero-card-body hero-card__body">'
        + (rolesText ? '<span class="hero-card-role">' + rolesText + '</span>' : '')
        + '<h3 class="hero-card-name hero-card__name">' + homeEscape(hero.name) + '</h3>'
        + '<div class="win-row"><span>Tỉ lệ thắng</span><b class="win-value">' + homeWinRateText(hero.winRate) + '</b></div>'
        + '<div class="win-bar"><i style="width:' + homeWinRatePercent(hero.winRate) + '%"></i></div>'
        + '<a class="hero-card__link" href="' + url + '">Xem chi tiết</a>'
        + '</div>'
        + '</article>';
}

/* ---------- 5. Build nổi bật ---------- */

/** Số lượt thích của build đọc từ likes.json (object { id: [username, ...] }). */
function homeBuildLikeCount(build, likes) {
    if (!build || !likes || typeof likes !== 'object' || Array.isArray(likes)) return 0;
    const list = likes[String(build.id)];
    return Array.isArray(list) ? list.length : 0;
}

/** Tên tác giả của build: ưu tiên trường thật nếu có, còn lại ghi "Cộng đồng". */
function homeBuildAuthor(build, users) {
    const username = build && (build.author || build.username || build.user);
    if (!username) return 'Cộng đồng';

    const list = Array.isArray(users) ? users : [];
    const user = list.find((item) => String(item.username) === String(username));
    return (user && (user.displayName || user.username)) || String(username);
}

/** HTML 1 thẻ build. */
function homeBuildCardHtml(build, likeCount, items, heroes, users) {
    const hero = (heroes || []).find((item) => String(item.id) === String(build.heroId)) || null;
    const roleText = hero && homeHeroRoles(hero).length ? homeHeroRoles(hero)[0] : (build.lane || '');
    const author = homeBuildAuthor(build, users);

    const avatar = hero
        ? '<img class="build-avatar" src="' + homeImage(hero.image) + '" alt="' + homeEscape(hero.name) + '" loading="lazy" onerror="handleImageError(this)">'
        : '';

    const itemImgs = (build.items || []).slice(0, 6).map((itemId) => {
        const item = (items || []).find((it) => String(it.id) === String(itemId));
        if (!item) return '';
        return '<img class="build-item" src="' + homeImage(item.image) + '" alt="' + homeEscape(item.name) + '" loading="lazy" onerror="handleImageError(this)">';
    }).join('');

    const meta = (roleText ? homeEscape(roleText) + ' · ' : '') + 'bởi ' + homeEscape(author);

    return '<article class="build-card">'
        + '<div class="build-card-head">'
        + avatar
        + '<div>'
        + '<div class="build-title">' + homeEscape(build.name) + '</div>'
        + '<div class="build-meta">' + meta + '</div>'
        + '</div>'
        + '</div>'
        + '<div class="build-items">' + itemImgs + '</div>'
        + '<div class="build-foot">'
        + '<span class="build-likes">♥ ' + likeCount + ' lượt thích</span>'
        + '<a class="build-btn" href="' + homeBase() + 'src/pages/build-detail.html?id=' + encodeURIComponent(build.id) + '">Xem build</a>'
        + '</div>'
        + '</article>';
}

/** Lấy 3 build nhiều lượt thích nhất (đếm từ likes.json). */
async function renderHotBuilds() {
    try {
        const container = document.getElementById('hot-builds');
        if (!container) return;

        const results = await Promise.all([
            homeLoadBuilds(),
            homeLoadItems(),
            homeLoadHeroes(),
            homeLoadJson('likes'),
            homeLoadJson('users'),
        ]);

        const builds = results[0];
        const items = results[1];
        const heroes = results[2];
        const likes = results[3];
        const users = results[4];

        if (!builds.length) {
            container.innerHTML = homeNotFound('Chưa có dữ liệu build.');
            return;
        }

        const ranked = builds
            .map((build) => ({ build: build, likes: homeBuildLikeCount(build, likes) }))
            .sort((a, b) => b.likes - a.likes)
            .slice(0, 3);

        container.innerHTML = ranked
            .map((entry) => homeBuildCardHtml(entry.build, entry.likes, items, heroes, users))
            .join('');
    } catch (error) {
        console.error('home: renderHotBuilds lỗi', error);
    }
}

/* ---------- 6. Tin tức / cộng đồng ---------- */

/** Bài hiển thị trên trang chủ: bỏ bài đã ẩn hoặc bị từ chối. */
function homePostVisible(post) {
    if (!post || typeof post !== 'object') return false;
    if (post.hidden === true) return false;
    if (post.status === 'rejected') return false;
    return true;
}

/** Mốc thời gian của bài (createdAt), không hợp lệ -> 0. */
function homePostTime(post) {
    const time = Date.parse(post && post.createdAt);
    return Number.isFinite(time) ? time : 0;
}

/** Số bình luận của một bài tính từ comments.json. */
function homeCommentCount(postId, comments) {
    if (!Array.isArray(comments)) return 0;
    return comments.filter((comment) => String(comment.postId) === String(postId)).length;
}

/** HTML bài nổi bật (bài mới nhất). */
function homeNewsFeatureHtml(post) {
    return '<a class="news-feature" href="' + homeBase() + 'src/pages/post-detail.html?id=' + encodeURIComponent(post.id) + '">'
        + '<img src="' + homeImage(post.image) + '" alt="' + homeEscape(post.title) + '" loading="lazy" onerror="handleImageError(this)">'
        + '<div class="news-overlay">'
        + '<span class="news-tag">' + homeEscape(post.category || 'Bài viết') + '</span>'
        + '<h3 class="news-title">' + homeEscape(post.title) + '</h3>'
        + '</div>'
        + '</a>';
}

/** HTML một bài trong danh sách "Có gì mới?". */
function homeNewsRowHtml(post, comments) {
    const count = homeCommentCount(post.id, comments);
    const time = typeof formatDateTime === 'function' ? formatDateTime(post.createdAt) : '';
    const meta = count + ' bình luận' + (time ? ' · ' + time : '');

    return '<a class="news-row" href="' + homeBase() + 'src/pages/post-detail.html?id=' + encodeURIComponent(post.id) + '">'
        + '<img class="news-thumb" src="' + homeImage(post.image) + '" alt="' + homeEscape(post.title) + '" loading="lazy" onerror="handleImageError(this)">'
        + '<div>'
        + '<span class="news-tag">' + homeEscape(post.category || 'Bài viết') + '</span>'
        + '<div class="news-title">' + homeEscape(post.title) + '</div>'
        + '<span class="news-time">' + homeEscape(meta) + '</span>'
        + '</div>'
        + '</a>';
}

/** 5 bài mới nhất: bài đầu vào #news-feature, 4 bài còn lại vào #news-list. */
async function renderNews() {
    try {
        const featureEl = document.getElementById('news-feature');
        const listEl = document.getElementById('news-list');
        if (!featureEl && !listEl) return;

        const results = await Promise.all([
            homeLoadJson('posts'),
            homeLoadJson('comments'),
        ]);
        const posts = Array.isArray(results[0]) ? results[0] : [];
        const comments = Array.isArray(results[1]) ? results[1] : [];

        const visible = posts
            .filter(homePostVisible)
            .sort((a, b) => homePostTime(b) - homePostTime(a))
            .slice(0, 5);

        if (!visible.length) {
            if (featureEl) featureEl.innerHTML = homeNotFound('Chưa có dữ liệu tin tức.');
            if (listEl) listEl.innerHTML = '';
            return;
        }

        if (featureEl) featureEl.innerHTML = homeNewsFeatureHtml(visible[0]);
        if (listEl) listEl.innerHTML = visible.slice(1).map((post) => homeNewsRowHtml(post, comments)).join('');
    } catch (error) {
        console.error('home: renderNews lỗi', error);
    }
}

/* ---------- Khởi tạo trang chủ ---------- */

/** Gọi lần lượt các khối; mỗi khối tự bọc lỗi nên một khối hỏng không dừng khối sau. */
async function initHomePage() {
    await homeRunSafe(renderWeekHero, 0);
    await homeRunSafe(renderTrending);
    await homeRunSafe(renderRoleGrid);
    await homeRunSafe(renderRoleTabs);
    await homeRunSafe(renderFeaturedHeroes, 'all');
    await homeRunSafe(renderFeaturedItems);
    await homeRunSafe(renderHotBuilds);
    await homeRunSafe(renderNews);
}

document.addEventListener('DOMContentLoaded', initHomePage);
