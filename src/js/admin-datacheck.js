/**
 * admin-datacheck.js - Mục "Kiểm tra dữ liệu" trong tab "Dữ liệu" (task AD09)
 *
 * Trang: src/pages/admin.html?tab=data. admin-shell.js nạp ĐỘNG file này (thứ tự
 * admin-backup.js, admin-storage.js, admin-datacheck.js) rồi gọi
 * renderAdminDataCheckSection() để vẽ phần thân mục; shell tự vẽ tiêu đề.
 *
 * MỤC ĐÍCH
 *   Admin bấm "Chạy kiểm tra" để rà soát dữ liệu tướng, trang bị, build, bài viết,
 *   bình luận, lượt thích và liệt kê mọi chỗ sai/lệch. CHỈ BÁO CÁO, KHÔNG TỰ SỬA
 *   (không setCollection, không gọi API ghi). Với users CHỈ đọc username để đối
 *   chiếu, KHÔNG hiển thị mật khẩu/hash/salt/email.
 *
 * NHÓM LUẬT (xem adminDataCheckRun): Tướng, Trang bị, Build, Bài viết, Bình luận,
 *   Lượt thích. Các luật tham khảo từ tools/audit-data.cjs (KHÔNG require file đó).
 *
 * PHỤ THUỘC (đều kiểm tra typeof trước khi gọi nên thiếu file cũng không lỗi):
 *   config.js (DATA_PATH), loadData.js (loadData), heroData.js (getCachedHeroes/
 *   loadHeroes), dataStore.js (getCollection), feed.js (POST_STATUSES để xét trạng
 *   thái), components.js (escapeHtml/formatDateTime), admin-shell.js
 *   (registerAdminSection), auth.js (isAdmin). Mọi tên toàn cục của file này đều
 *   có tiền tố adminDataCheck (trừ tên hàm render do shell gọi).
 */

/** Số dòng vấn đề tối đa vẽ ra bảng (tránh bảng quá dài). */
const adminDataCheckMaxRows = 200;

/* ---------- Tiện ích nội bộ ---------- */

/** Thoát ký tự HTML (ưu tiên escapeHtml của components.js). */
function adminDataCheckEscape(value) {
    if (typeof escapeHtml === 'function') {
        try {
            return escapeHtml(value);
        } catch (error) {
            // Rơi xuống bản dự phòng bên dưới.
        }
    }

    if (value === null || value === undefined) return '';

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Coi giá trị không phải mảng như mảng rỗng. */
function adminDataCheckAsArray(value) {
    return Array.isArray(value) ? value : [];
}

/** Coi giá trị không phải object thường như object rỗng. */
function adminDataCheckAsObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** id hợp lệ: phải là số hữu hạn (JSON của dự án dùng id số). */
function adminDataCheckIsValidId(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

/** Chuỗi không rỗng sau khi cắt khoảng trắng. */
function adminDataCheckText(value) {
    return typeof value === 'string' && value.trim() !== '';
}

/** Trường coi là "rỗng": thiếu, mảng rỗng hoặc chuỗi rỗng. */
function adminDataCheckEmptyField(value) {
    if (value === undefined || value === null) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'string') return value.trim() === '';
    return false;
}

/** createdAt hợp lệ: không rỗng và parse ra Date hợp lệ. */
function adminDataCheckIsValidDate(value) {
    if (value === undefined || value === null || value === '') return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
}

/** Tên bản ghi theo một khóa (thường là name/title), an toàn với mọi kiểu. */
function adminDataCheckRecordName(record, key) {
    if (!record || typeof record !== 'object') return '';
    const value = record[key];
    return typeof value === 'string' ? value.trim() : '';
}

/** Nhãn đối tượng dạng "Tướng #12 (Tên)". */
function adminDataCheckTarget(prefix, id, name) {
    const idText = id === undefined || id === null || id === '' ? '?' : String(id);
    return prefix + ' #' + idText + (name ? ' (' + name + ')' : '');
}

/** Trạng thái bài hợp lệ theo feed.js; null nếu feed.js chưa nạp. */
function adminDataCheckAllowedStatuses() {
    try {
        if (typeof POST_STATUSES !== 'undefined' && Array.isArray(POST_STATUSES)) return POST_STATUSES;
    } catch (error) {
        // feed.js chưa nạp: bỏ qua luật trạng thái.
    }

    return null;
}

/** Tập id (dạng chuỗi) của các bản ghi có id hợp lệ. */
function adminDataCheckIdSet(list) {
    const set = new Set();

    list.forEach((record) => {
        if (record && typeof record === 'object' && adminDataCheckIsValidId(record.id)) {
            set.add(String(record.id));
        }
    });

    return set;
}

/** Đẩy một vấn đề vào mảng issues. */
function adminDataCheckPush(issues, level, group, target, message) {
    issues.push({ level: level, group: group, target: target, message: message });
}

/**
 * Bắt lỗi trùng id: chỉ báo MỘT lần cho mỗi id bị lặp.
 * @returns {boolean} true nếu id bị trùng (đã báo).
 */
function adminDataCheckTrackId(id, seen, reported, issues, group, target) {
    const key = String(id);
    if (!seen.has(key)) {
        seen.add(key);
        return false;
    }

    if (!reported.has(key)) {
        reported.add(key);
        adminDataCheckPush(issues, 'error', group, target, 'ID trùng: #' + key + '.');
    }

    return true;
}

/** Kiểm tra khối stats: phải là object, mọi giá trị là số (và có thể phải khác rỗng). */
function adminDataCheckStatsIssues(issues, group, target, stats, requireNonEmpty) {
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
        adminDataCheckPush(issues, 'error', group, target, 'Chỉ số (stats) thiếu hoặc sai kiểu.');
        return;
    }

    const keys = Object.keys(stats);
    if (requireNonEmpty && !keys.length) {
        adminDataCheckPush(issues, 'error', group, target, 'Chỉ số (stats) rỗng.');
        return;
    }

    const badKeys = keys.filter((key) => typeof stats[key] !== 'number' || !Number.isFinite(stats[key]));
    if (badKeys.length) {
        adminDataCheckPush(issues, 'error', group, target, 'Giá trị chỉ số không phải số: ' + badKeys.join(', ') + '.');
    }
}

/* ---------- 1. Luật kiểm tra (hàm thuần) ---------- */

/** TƯỚNG. */
function adminDataCheckHeroes(heroes, itemIdSet, issues, checked) {
    const seen = new Set();
    const reported = new Set();

    heroes.forEach((hero) => {
        if (!hero || typeof hero !== 'object') return;
        checked.heroes += 1;

        const name = adminDataCheckRecordName(hero, 'name');
        const target = adminDataCheckTarget('Tướng', hero.id, name);

        if (!adminDataCheckIsValidId(hero.id)) {
            adminDataCheckPush(issues, 'error', 'Tướng', target, 'Thiếu hoặc sai kiểu id.');
        } else {
            adminDataCheckTrackId(hero.id, seen, reported, issues, 'Tướng', target);
        }

        if (!name) adminDataCheckPush(issues, 'error', 'Tướng', target, 'Thiếu tên (name).');
        if (!adminDataCheckText(hero.image)) adminDataCheckPush(issues, 'warn', 'Tướng', target, 'Thiếu ảnh (image).');
        if (adminDataCheckEmptyField(hero.role) || adminDataCheckEmptyField(hero.difficulty)) {
            adminDataCheckPush(issues, 'warn', 'Tướng', target, 'Thiếu vai trò (role) hoặc độ khó (difficulty).');
        }

        adminDataCheckStatsIssues(issues, 'Tướng', target, hero.stats, false);

        const recommended = hero.recommendedBuild;
        if (!Array.isArray(recommended)) {
            adminDataCheckPush(issues, 'warn', 'Tướng', target, 'recommendedBuild không phải mảng.');
        } else {
            const bad = recommended.filter((ref) => !itemIdSet.has(String(ref)));
            if (bad.length) {
                adminDataCheckPush(issues, 'error', 'Tướng', target,
                    'Trang bị đề xuất không tồn tại: ' + bad.map(String).join(', ') + '.');
            }
        }
    });
}

/** TRANG BỊ. */
function adminDataCheckItems(items, itemIdSet, issues, checked) {
    const seen = new Set();
    const reported = new Set();

    items.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        checked.items += 1;

        const name = adminDataCheckRecordName(item, 'name');
        const target = adminDataCheckTarget('Trang bị', item.id, name);

        if (!adminDataCheckIsValidId(item.id)) {
            adminDataCheckPush(issues, 'error', 'Trang bị', target, 'Thiếu hoặc sai kiểu id.');
        } else {
            adminDataCheckTrackId(item.id, seen, reported, issues, 'Trang bị', target);
        }

        if (!name) adminDataCheckPush(issues, 'error', 'Trang bị', target, 'Thiếu tên (name).');
        if (!adminDataCheckText(item.type)) adminDataCheckPush(issues, 'warn', 'Trang bị', target, 'Thiếu loại (type).');
        if (!(typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0)) {
            adminDataCheckPush(issues, 'error', 'Trang bị', target, 'Giá (price) phải là số dương.');
        }

        adminDataCheckStatsIssues(issues, 'Trang bị', target, item.stats, true);

        if (!adminDataCheckText(item.image)) adminDataCheckPush(issues, 'warn', 'Trang bị', target, 'Thiếu ảnh (image).');
        if (!adminDataCheckText(item.passive) || !adminDataCheckText(item.description)) {
            adminDataCheckPush(issues, 'warn', 'Trang bị', target, 'Thiếu mô tả (passive/description).');
        }

        if (!Array.isArray(item.related)) {
            adminDataCheckPush(issues, 'warn', 'Trang bị', target, 'related không phải mảng.');
        } else {
            const bad = item.related.filter((ref) => !itemIdSet.has(String(ref)));
            if (bad.length) {
                adminDataCheckPush(issues, 'error', 'Trang bị', target,
                    'related trỏ trang bị không tồn tại: ' + bad.map(String).join(', ') + '.');
            }

            if (item.related.some((ref) => String(ref) === String(item.id))) {
                adminDataCheckPush(issues, 'warn', 'Trang bị', target, 'related tự trỏ chính nó.');
            }

            const dup = adminDataCheckDuplicates(item.related);
            if (dup.length) {
                adminDataCheckPush(issues, 'warn', 'Trang bị', target, 'related trùng id: ' + dup.join(', ') + '.');
            }
        }
    });
}

/** BUILD. */
function adminDataCheckBuilds(builds, heroIdSet, itemIdSet, issues, checked) {
    const seen = new Set();
    const reported = new Set();

    builds.forEach((build) => {
        if (!build || typeof build !== 'object') return;
        checked.builds += 1;

        const name = adminDataCheckRecordName(build, 'name');
        const target = adminDataCheckTarget('Build', build.id, name);

        if (!adminDataCheckIsValidId(build.id)) {
            adminDataCheckPush(issues, 'error', 'Build', target, 'Thiếu hoặc sai kiểu id.');
        } else {
            adminDataCheckTrackId(build.id, seen, reported, issues, 'Build', target);
        }

        if (!name) adminDataCheckPush(issues, 'warn', 'Build', target, 'Thiếu tên (name).');

        if (!heroIdSet.has(String(build.heroId))) {
            adminDataCheckPush(issues, 'error', 'Build', target, 'heroId không tồn tại: ' + String(build.heroId) + '.');
        }

        if (!Array.isArray(build.items) || build.items.length === 0) {
            adminDataCheckPush(issues, 'error', 'Build', target, 'items không phải mảng hoặc rỗng.');
        } else {
            const bad = build.items.filter((ref) => !itemIdSet.has(String(ref)));
            if (bad.length) {
                adminDataCheckPush(issues, 'error', 'Build', target,
                    'Trang bị không tồn tại: ' + bad.map(String).join(', ') + '.');
            }

            const dup = adminDataCheckDuplicates(build.items);
            if (dup.length) {
                adminDataCheckPush(issues, 'warn', 'Build', target, 'Trang bị trùng trong build: ' + dup.join(', ') + '.');
            }
        }
    });
}

/** Danh sách id bị lặp (đã loại trùng, giữ dạng chuỗi). */
function adminDataCheckDuplicates(list) {
    const seen = new Set();
    const dup = new Set();

    list.forEach((value) => {
        const key = String(value);
        if (seen.has(key)) dup.add(key);
        else seen.add(key);
    });

    return Array.from(dup);
}

/** Cảnh báo tổng hợp: số tướng chưa có build nào. */
function adminDataCheckHeroBuildSummary(heroes, builds, issues) {
    const withBuild = new Set();

    builds.forEach((build) => {
        if (build && typeof build === 'object' && build.heroId !== undefined && build.heroId !== null && build.heroId !== '') {
            withBuild.add(String(build.heroId));
        }
    });

    let total = 0;
    let missing = 0;

    heroes.forEach((hero) => {
        if (!hero || typeof hero !== 'object' || !adminDataCheckIsValidId(hero.id)) return;
        total += 1;
        if (!withBuild.has(String(hero.id))) missing += 1;
    });

    if (missing > 0) {
        adminDataCheckPush(issues, 'warn', 'Build', 'Tổng hợp', missing + '/' + total + ' tướng chưa có build.');
    }
}

/** BÀI VIẾT. */
function adminDataCheckPosts(posts, heroIdSet, usernameSet, allowedStatuses, issues, checked) {
    const seen = new Set();
    const reported = new Set();
    const checkAuthor = usernameSet && usernameSet.size > 0;

    posts.forEach((post) => {
        if (!post || typeof post !== 'object') return;
        checked.posts += 1;

        const title = adminDataCheckRecordName(post, 'title');
        const target = adminDataCheckTarget('Bài viết', post.id, title);

        if (!adminDataCheckIsValidId(post.id)) {
            adminDataCheckPush(issues, 'error', 'Bài viết', target, 'Thiếu hoặc sai kiểu id.');
        } else {
            adminDataCheckTrackId(post.id, seen, reported, issues, 'Bài viết', target);
        }

        if (checkAuthor && !usernameSet.has(String(post.author))) {
            adminDataCheckPush(issues, 'error', 'Bài viết', target, 'Tác giả không tồn tại: ' + String(post.author) + '.');
        }

        if (!adminDataCheckText(post.title) || !adminDataCheckText(post.content)) {
            adminDataCheckPush(issues, 'error', 'Bài viết', target, 'Thiếu tiêu đề hoặc nội dung.');
        }

        if (post.heroId !== undefined && post.heroId !== null && post.heroId !== ''
            && !heroIdSet.has(String(post.heroId))) {
            adminDataCheckPush(issues, 'warn', 'Bài viết', target, 'heroId không tồn tại: ' + String(post.heroId) + '.');
        }

        if (!adminDataCheckIsValidDate(post.createdAt)) {
            adminDataCheckPush(issues, 'error', 'Bài viết', target, 'createdAt không phải ngày hợp lệ.');
        }

        if (allowedStatuses && 'status' in post && post.status !== undefined && post.status !== null
            && allowedStatuses.indexOf(post.status) === -1) {
            adminDataCheckPush(issues, 'warn', 'Bài viết', target, 'Trạng thái không hợp lệ: ' + String(post.status) + '.');
        }
    });
}

/** BÌNH LUẬN. */
function adminDataCheckComments(comments, postIdSet, usernameSet, issues, checked) {
    const seen = new Set();
    const reported = new Set();
    const checkAuthor = usernameSet && usernameSet.size > 0;

    comments.forEach((comment) => {
        if (!comment || typeof comment !== 'object') return;
        checked.comments += 1;

        const target = adminDataCheckTarget('Bình luận', comment.id, '');

        if (!adminDataCheckIsValidId(comment.id)) {
            adminDataCheckPush(issues, 'error', 'Bình luận', target, 'Thiếu hoặc sai kiểu id.');
        } else {
            adminDataCheckTrackId(comment.id, seen, reported, issues, 'Bình luận', target);
        }

        if (!postIdSet.has(String(comment.postId))) {
            adminDataCheckPush(issues, 'error', 'Bình luận', target, 'postId không tồn tại: ' + String(comment.postId) + '.');
        }

        if (checkAuthor && !usernameSet.has(String(comment.author))) {
            adminDataCheckPush(issues, 'warn', 'Bình luận', target, 'Tác giả không tồn tại: ' + String(comment.author) + '.');
        }

        if (!adminDataCheckText(comment.content)) {
            adminDataCheckPush(issues, 'error', 'Bình luận', target, 'Thiếu nội dung (content).');
        }
    });
}

/** LƯỢT THÍCH. */
function adminDataCheckLikes(likes, postIdSet, usernameSet, issues, checked) {
    const keys = Object.keys(likes);
    checked.likes = keys.length;
    const checkUser = usernameSet && usernameSet.size > 0;

    keys.forEach((postId) => {
        const target = 'Bài viết #' + postId;
        const value = likes[postId];

        if (!postIdSet.has(String(postId))) {
            adminDataCheckPush(issues, 'warn', 'Lượt thích', target, 'Không có bài viết tương ứng.');
        }

        if (!Array.isArray(value)) {
            adminDataCheckPush(issues, 'error', 'Lượt thích', target, 'Giá trị không phải mảng.');
            return;
        }

        if (checkUser) {
            const bad = value.filter((name) => typeof name === 'string' && !usernameSet.has(name));
            if (bad.length) {
                adminDataCheckPush(issues, 'warn', 'Lượt thích', target,
                    'Username không tồn tại: ' + Array.from(new Set(bad)).join(', ') + '.');
            }
        }

        const dup = adminDataCheckDuplicates(value);
        if (dup.length) {
            adminDataCheckPush(issues, 'warn', 'Lượt thích', target, 'Username lặp: ' + dup.join(', ') + '.');
        }
    });
}

/**
 * Hàm THUẦN rà soát dữ liệu (không đụng DOM, không gọi fetch).
 * @param {object} datasets { heroes, items, builds, posts, comments, likes, usernames }.
 *        Phần sai kiểu (null/chuỗi/số...) coi như rỗng, KHÔNG ném lỗi.
 * @returns {{ issues: Array<{level:string,group:string,target:string,message:string}>,
 *            checked: { heroes:number, items:number, builds:number, posts:number, comments:number, likes:number } }}
 */
function adminDataCheckRun(datasets) {
    const issues = [];
    const checked = { heroes: 0, items: 0, builds: 0, posts: 0, comments: 0, likes: 0 };

    try {
        const source = adminDataCheckAsObject(datasets);

        const heroes = adminDataCheckAsArray(source.heroes);
        const items = adminDataCheckAsArray(source.items);
        const builds = adminDataCheckAsArray(source.builds);
        const posts = adminDataCheckAsArray(source.posts);
        const comments = adminDataCheckAsArray(source.comments);
        const likes = adminDataCheckAsObject(source.likes);
        const usernames = adminDataCheckAsArray(source.usernames).filter((name) => typeof name === 'string');

        const itemIdSet = adminDataCheckIdSet(items);
        const heroIdSet = adminDataCheckIdSet(heroes);
        const postIdSet = adminDataCheckIdSet(posts);
        const usernameSet = new Set(usernames.map(String));

        adminDataCheckHeroes(heroes, itemIdSet, issues, checked);
        adminDataCheckItems(items, itemIdSet, issues, checked);
        adminDataCheckBuilds(builds, heroIdSet, itemIdSet, issues, checked);
        adminDataCheckHeroBuildSummary(heroes, builds, issues);
        adminDataCheckPosts(posts, heroIdSet, usernameSet, adminDataCheckAllowedStatuses(), issues, checked);
        adminDataCheckComments(comments, postIdSet, usernameSet, issues, checked);
        adminDataCheckLikes(likes, postIdSet, usernameSet, issues, checked);

        // error trước warn, rồi theo nhóm.
        issues.sort((a, b) => {
            if (a.level !== b.level) return a.level === 'error' ? -1 : 1;
            return String(a.group).localeCompare(String(b.group));
        });
    } catch (error) {
        // Dữ liệu bất ngờ cũng không được làm ném lỗi ra ngoài.
    }

    return { issues: issues, checked: checked };
}

/* ---------- 2. Gom dữ liệu thật ---------- */

/** Đường dẫn JSON theo DATA_PATH của config.js; thiếu thì trả chuỗi rỗng. */
function adminDataCheckDataPath(key) {
    try {
        if (typeof DATA_PATH === 'object' && DATA_PATH && DATA_PATH[key]) return DATA_PATH[key];
    } catch (error) {
        // config.js chưa nạp.
    }

    return '';
}

/** Đọc một file JSON qua loadData (rỗng + ghi skipped nếu thiếu hàm hoặc lỗi). */
async function adminDataCheckLoadJson(key, label, skipped) {
    const path = adminDataCheckDataPath(key);

    if (typeof loadData !== 'function' || !path) {
        skipped.push(label);
        return [];
    }

    try {
        const data = await loadData(path);
        return Array.isArray(data) ? data : [];
    } catch (error) {
        skipped.push(label);
        return [];
    }
}

/** Đọc một bộ sưu tập qua getCollection (ok=false nếu thiếu hàm hoặc ném lỗi). */
function adminDataCheckLoadCollection(name) {
    if (typeof getCollection !== 'function') return { ok: false, value: null };

    try {
        return { ok: true, value: getCollection(name) };
    } catch (error) {
        return { ok: false, value: null };
    }
}

/**
 * Gom dữ liệu thật từ các lớp dữ liệu đang có. Phần nào không lấy được thì để rỗng
 * và ghi tên vào skipped để giao diện nhắc người dùng.
 * @returns {Promise<{ datasets: object, skipped: string[] }>}
 */
async function adminDataCheckLoad() {
    const datasets = { heroes: [], items: [], builds: [], posts: [], comments: [], likes: {}, usernames: [] };
    const skipped = [];

    // Tướng: ưu tiên cache đang có; cache rỗng thì tải qua loadHeroes (trang admin
    // có thể chưa gọi loadHeroes nên heroesCache trống dù heroData.js đã nạp).
    try {
        let heroes = [];
        if (typeof getCachedHeroes === 'function') {
            const cached = getCachedHeroes();
            if (Array.isArray(cached) && cached.length) heroes = cached;
        }

        if (!heroes.length && typeof loadHeroes === 'function') {
            const loaded = await loadHeroes();
            if (Array.isArray(loaded) && loaded.length) heroes = loaded;
        }

        if (!heroes.length && typeof getCachedHeroes !== 'function' && typeof loadHeroes !== 'function') {
            skipped.push('tướng');
        }

        datasets.heroes = heroes;
    } catch (error) {
        skipped.push('tướng');
    }

    datasets.items = await adminDataCheckLoadJson('items', 'trang bị', skipped);
    datasets.builds = await adminDataCheckLoadJson('builds', 'build', skipped);

    const posts = adminDataCheckLoadCollection('posts');
    if (posts.ok) datasets.posts = Array.isArray(posts.value) ? posts.value : [];
    else skipped.push('bài viết');

    const comments = adminDataCheckLoadCollection('comments');
    if (comments.ok) datasets.comments = Array.isArray(comments.value) ? comments.value : [];
    else skipped.push('bình luận');

    const likes = adminDataCheckLoadCollection('likes');
    if (likes.ok) datasets.likes = likes.value && typeof likes.value === 'object' && !Array.isArray(likes.value) ? likes.value : {};
    else skipped.push('lượt thích');

    // users: CHỈ lấy username để đối chiếu (không dùng hash/salt).
    const users = adminDataCheckLoadCollection('users');
    if (users.ok) {
        datasets.usernames = Array.isArray(users.value)
            ? users.value.map((user) => (user && user.username)).filter((name) => typeof name === 'string')
            : [];
    } else {
        skipped.push('người dùng');
    }

    return { datasets: datasets, skipped: skipped };
}

/* ---------- 3. Giao diện ---------- */

/** Ô số liệu .admin-stat. */
function adminDataCheckStat(value, label) {
    return '<div class="admin-stat">'
        + '<div class="admin-stat__value">' + adminDataCheckEscape(String(value)) + '</div>'
        + '<div class="admin-stat__label">' + adminDataCheckEscape(label) + '</div>'
        + '</div>';
}

/** Thời điểm hiện tại dạng dd/MM/yyyy HH:mm (ưu tiên formatDateTime của components.js). */
function adminDataCheckNow() {
    try {
        if (typeof formatDateTime === 'function') return formatDateTime(new Date());
    } catch (error) {
        // Rơi xuống bản dự phòng.
    }

    try {
        const date = new Date();
        const pad = (number) => String(number).padStart(2, '0');
        return pad(date.getDate()) + '/' + pad(date.getMonth() + 1) + '/' + date.getFullYear()
            + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    } catch (error) {
        return '';
    }
}

/** Dựng HTML kết quả kiểm tra (thông báo skipped + số liệu + bảng vấn đề). */
function adminDataCheckRenderReport(skipped, report) {
    const skippedList = Array.isArray(skipped) ? skipped : [];
    const notice = skippedList.length
        ? '<div class="admin-notice admin-notice--warn">Chưa kiểm tra được: '
            + adminDataCheckEscape(skippedList.join(', ')) + '.</div>'
        : '';

    const issues = report && Array.isArray(report.issues) ? report.issues : [];
    const errorCount = issues.filter((issue) => issue.level === 'error').length;
    const warnCount = issues.filter((issue) => issue.level === 'warn').length;

    const checked = report && report.checked && typeof report.checked === 'object' ? report.checked : {};
    const totalChecked = ['heroes', 'items', 'builds', 'posts', 'comments', 'likes']
        .reduce((sum, key) => sum + (Number(checked[key]) || 0), 0);

    const stats = '<div class="admin-stats">'
        + adminDataCheckStat(errorCount, 'Lỗi')
        + adminDataCheckStat(warnCount, 'Cảnh báo')
        + adminDataCheckStat(totalChecked, 'Bản ghi đã xét')
        + adminDataCheckStat(adminDataCheckNow(), 'Lúc kiểm tra')
        + '</div>';

    if (!issues.length) {
        return notice + stats + '<div class="admin-notice admin-notice--success">Không phát hiện vấn đề nào.</div>';
    }

    const shown = issues.slice(0, adminDataCheckMaxRows);
    const rows = shown.map((issue) => {
        const badge = issue.level === 'error'
            ? '<span class="admin-badge admin-badge--rejected">Lỗi</span>'
            : '<span class="admin-badge admin-badge--pending">Cảnh báo</span>';

        return '<tr>'
            + '<td>' + badge + '</td>'
            + '<td>' + adminDataCheckEscape(issue.group) + '</td>'
            + '<td>' + adminDataCheckEscape(issue.target) + '</td>'
            + '<td>' + adminDataCheckEscape(issue.message) + '</td>'
            + '</tr>';
    }).join('');

    const table = '<div class="admin-table-wrap"><table class="admin-table">'
        + '<thead><tr><th>Mức</th><th>Nhóm</th><th>Đối tượng</th><th>Vấn đề</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';

    const more = issues.length > adminDataCheckMaxRows
        ? '<p class="admin-section__desc">Đang hiện ' + adminDataCheckMaxRows + '/' + issues.length + ' vấn đề đầu tiên.</p>'
        : '';

    return notice + stats + table + more;
}

/** Lấy vùng kết quả trong phần thân mục. */
function adminDataCheckResultEl(body) {
    try {
        return body && typeof body.querySelector === 'function' ? body.querySelector('[data-admin-datacheck-result]') : null;
    } catch (error) {
        return null;
    }
}

/** Lấy nút "Chạy kiểm tra". */
function adminDataCheckButtonEl(body) {
    try {
        return body && typeof body.querySelector === 'function' ? body.querySelector('[data-admin-datacheck-run]') : null;
    } catch (error) {
        return null;
    }
}

/** Bật / tắt trạng thái disabled của nút (chống bấm đúp). */
function adminDataCheckSetDisabled(button, disabled) {
    try {
        if (!button) return;

        if (disabled) {
            if (typeof button.setAttribute === 'function') button.setAttribute('disabled', '');
            else button.disabled = true;
        } else if (typeof button.removeAttribute === 'function') {
            button.removeAttribute('disabled');
        } else {
            button.disabled = false;
        }
    } catch (error) {
        // Bỏ qua.
    }
}

/** Chạy load + kiểm tra rồi vẽ kết quả vào vùng kết quả. */
async function adminDataCheckPerform(body) {
    const result = adminDataCheckResultEl(body);
    const button = adminDataCheckButtonEl(body);

    try {
        adminDataCheckSetDisabled(button, true);
        if (result) result.innerHTML = '<p class="admin-section__desc">Đang kiểm tra…</p>';

        const loaded = await adminDataCheckLoad();
        const report = adminDataCheckRun(loaded.datasets);

        if (result) result.innerHTML = adminDataCheckRenderReport(loaded.skipped, report);
    } catch (error) {
        if (result) {
            result.innerHTML = '<div class="admin-notice admin-notice--danger">Không chạy được kiểm tra dữ liệu.</div>';
        }
    } finally {
        adminDataCheckSetDisabled(button, false);
    }
}

/** Khung HTML của mục (không gồm tiêu đề do shell vẽ). */
function adminDataCheckSectionHtml() {
    return ''
        + '<p class="admin-section__desc">'
        + 'Rà soát tham chiếu và dữ liệu thiếu/sai ở tướng, trang bị, build, bài viết, bình luận, lượt thích. '
        + 'Chỉ báo cáo, không tự sửa.'
        + '</p>'
        + '<div class="admin-toolbar">'
        + '<button type="button" class="btn btn-primary" data-admin-datacheck-run>Chạy kiểm tra</button>'
        + '</div>'
        + '<div data-admin-datacheck-result></div>';
}

/** Gắn nút chạy kiểm tra (phần tử luôn mới sau mỗi lần vẽ nên không sợ trùng sự kiện). */
function adminDataCheckBind(body) {
    try {
        if (typeof body.querySelector !== 'function') return;

        const button = body.querySelector('[data-admin-datacheck-run]');
        if (button && typeof button.addEventListener === 'function') {
            button.addEventListener('click', () => { adminDataCheckPerform(body); });
        }
    } catch (error) {
        // Không gắn được cũng không sao.
    }
}

/**
 * Vẽ mục "Kiểm tra dữ liệu" vào phần thân .admin-section__body và tự chạy một lần.
 * @param {Element} body container do admin-shell.js cung cấp.
 * @returns {Promise<void>}
 */
async function renderAdminDataCheckSection(body) {
    try {
        if (!body) return;

        if (typeof isAdmin !== 'function' || !isAdmin()) {
            body.innerHTML = '<p class="admin-empty">Chỉ quản trị viên được kiểm tra dữ liệu.</p>';
            return;
        }

        body.innerHTML = adminDataCheckSectionHtml();
        adminDataCheckBind(body);
        await adminDataCheckPerform(body);
    } catch (error) {
        try {
            body.innerHTML = '<div class="admin-notice admin-notice--danger">'
                + 'Không hiển thị được mục kiểm tra dữ liệu.'
                + '</div>';
        } catch (innerError) {
            // Bỏ qua.
        }
    }
}

// Đăng ký mục vào tab "Dữ liệu" (chỉ có tác dụng khi admin-shell.js đã nạp).
if (typeof registerAdminSection === 'function') {
    registerAdminSection('data', 'datacheck', 'Kiểm tra dữ liệu', renderAdminDataCheckSection);
}
