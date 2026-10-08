/**
 * feed.js - Community Feed: đăng bài, thích, bình luận (pages/feed.html)
 * Phụ trách: Người 3 (giao diện) + Người 4 (logic LocalStorage)
 *
 * LocalStorage:
 *   aov_posts         [ { id, author, title, content, heroId, category, createdAt,
 *                     status?, rejectReason?, reviewedBy?, reviewedAt?, flagged?, hidden? } ]
 *                     gồm bài lấy từ data/posts.json + bài người dùng tự đăng;
 *                     các trường có "?" là tùy chọn, bài cũ không có cũng chạy được
 *   aov_posts_seeded  [ id ]  các id bài từ posts.json đã từng nạp, để bài đã
 *                     bị xoá không bị nạp lại ("sống lại") khi mở trang
 *   aov_comments      [ { id, postId, author, content, createdAt } ]
 *   aov_likes         { "<postId>": [username, ...] }
 *   aov_mod_settings  { requireApproval: boolean, bannedWords: [string],
 *                     autoHideThreshold: number }
 *                     cấu hình kiểm duyệt; key chưa ghi thì lấy
 *                     MOD_SETTINGS_DEFAULTS (xem getModSettings)
 *
 * Mỗi lần mở trang, bài trong data/posts.json được MERGE theo id:
 *   - id đã có trong LocalStorage  -> giữ nguyên bản đang lưu, không ghi đè, không thêm lần 2
 *   - id từng nạp rồi nhưng đã xoá  -> không nạp lại
 *   - id mới                        -> thêm vào CUỐI danh sách để không đẩy bài người dùng đã đăng
 * Nên bao giờ không render trùng hai bài cùng id.
 *
 * Này là lớp dữ liệu duy nhất của mọi trang hiển thị bài viết:
 *   - feed.html          : danh sách bài viết
 *   - post-detail.html   : chi tiết một bài viết (nạp src/js/feed.js, chỉ khác phần vẽ giao diện)
 *   - profile.html       : danh sách bài của một người dùng
 *
 * Dùng lại của TV1: loadData(), escapeHtml(), formatDateTime(), renderNotFound(),
 * getStore()/setStore()/toStorageId() (storage.js),
 * getCurrentUser()/isLoggedIn()/isAdmin() (auth.js).
 *
 * Phân quyền bài viết và bình luận (tác giả + admin) nằm ở canEditPost(),
 * canDeletePost() và canDeleteComment(); cả deletePost()/deleteComment() đều gọi lại
 * chính các hàm này nên không thể xoá nhầm chỉ bằng cách gọi trực tiếp từ console.
 *
 * Lọc và sắp xếp (chỉ có ở trang Feed, thanh lọc nằm ở #feed-filter-bar):
 *   - lọc theo chuyên mục và tìm theo tiêu đề (matchKeyword), sắp xếp theo
 *     mới nhất / nhiều like / nhiều bình luận (getVisiblePosts)
 *   - chuyên mục và cách sắp xếp được ghi lên URL (?category=...&sort=...) nên F5
 *     không mất bộ lọc; đọc lại bằng getQueryParam()
 *   - bài đăng trước khi có trường category thì hiển thị và lọc như "Khác"
 *
 * Ẩn bài viết (trang Quản trị src/pages/admin.html):
 *   - bài bị ẩn có thêm trường hidden: true trong aov_posts (xem setPostHidden)
 *   - mọi nơi hiển thị bài cho người đọc (Feed, trang chi tiết, Profile của người
 *     khác) đều lọc qua isPostVisibleForViewer() nên bài ẩn biến mất khỏi giao diện
 *     mà dữ liệu vẫn còn, bấm "Hiện" là bài hiện lại nguyên trạng
 *   - tác giả vẫn thấy bài của mình (kèm nhãn "Đã bị ẩn") để còn biết mình đã đăng gì
 *   - admin thao tác ở trang quản trị, không cần xem bài ẩn trong Feed
 *
 * Duyệt bài viết (trạng thái status, cũng nằm trong aov_posts):
 *   - status: "pending" (chờ duyệt) | "approved" (đã duyệt) | "rejected" (bị từ chối);
 *     bài thiếu trường này (bài cũ trong posts.json, bài đã đăng trước đây, bài mới
 *     tạo) hoặc để giá trị lạ đều coi là "approved" — đọc qua getPostStatus(),
 *     KHÔNG đọc post.status trực tiếp ở bất kỳ đâu
 *   - các trường kèm theo, tùy chọn, chỉ được ghi khi có thao tác duyệt:
 *     rejectReason (lý do từ chối, chuỗi), reviewedBy (ai duyệt, chuỗi),
 *     reviewedAt (thời điểm duyệt, ISO time), flagged (đánh dấu vi phạm, boolean)
 *   - "duyệt" KHÁC "ẩn": hidden là admin ẩn tạm, bấm "Hiện" là bài trở lại;
 *     bài pending/rejected thì người ngoài không thấy ở Feed / trang chi tiết /
 *     Profile của tác giả, chỉ tác giả thấy (kèm huy hiệu "Chờ duyệt" /
 *     "Bị từ chối") — đúng cách bài ẩn vẫn làm với nhãn "Đã bị ẩn"
 *   - admin chỉ thấy bài chờ duyệt / bị từ chối ở trang Quản trị (bảng liệt kê
 *     toàn bộ aov_posts), đúng quy tắc cũ của bài ẩn
 *   - bài mới createPost() ghi status theo aov_mod_settings.requireApproval:
 *     đang bật duyệt trước thì user thường tạo "pending", admin tạo "approved"
 *     (kèm reviewedBy/reviewedAt); tắt chế độ thì ai cũng tạo "approved" —
 *     xem mục "Cấu hình kiểm duyệt" bên dưới
 */

const POSTS_KEY = 'aov_posts';
const POSTS_SEEDED_KEY = 'aov_posts_seeded';
const COMMENTS_KEY = 'aov_comments';
const LIKES_KEY = 'aov_likes';

/** Khóa lưu cấu hình kiểm duyệt cộng đồng (duyệt trước khi đăng), xem getModSettings(). */
const MOD_SETTINGS_KEY = 'aov_mod_settings';

let feedHeroes = [];

/* ---------- Chuẩn hoá id / dữ liệu đọc từ LocalStorage ---------- */

/**
 * id trong posts.json là số, nhưng LocalStorage có thể bị sửa tay hoặc để dạng chuỗi.
 * Mọi so sánh id trong file này đều đi qua đây để không lệch giữa "9001" và 9001.
 * @returns {string} chuỗi rỗng nếu không có id.
 */
function normalizeId(value) {
    if (value === null || value === undefined || value === '') return '';

    const number = Number(value);
    return Number.isFinite(number) ? String(number) : String(value).trim();
}

/**
 * Bỏ bài viết hỏng (không phải object hoặc thiếu id) và chống trùng id.
 * Giữ nguyên thứ tự đang lưu nên bài mới đăng vẫn nằm ở trên cùng.
 */
function normalizePosts(posts) {
    if (!Array.isArray(posts)) return [];

    const seen = new Set();

    return posts.filter((post) => {
        if (!post || typeof post !== 'object') return false;

        const id = normalizeId(post.id);
        if (!id || seen.has(id)) return false;

        seen.add(id);
        return true;
    });
}

/** Cùng kiểu với normalizePosts nhưng cho danh sách bình luận. */
function normalizeComments(comments) {
    if (!Array.isArray(comments)) return [];

    const seen = new Set();

    return comments.filter((comment) => {
        if (!comment || typeof comment !== 'object') return false;

        const id = normalizeId(comment.id);
        if (!id || seen.has(id)) return false;

        seen.add(id);
        return true;
    });
}

/**
 * Sinh id chắc chắn chưa tồn tại.
 * Date.now() có thể trùng khi người dùng bấm "Gửi" hai lần trong cùng một mili giây
 * (khi đó hai bình luận sẽ cùng id và xoá 1 là mất 2), nên phải dò tới khi id mới.
 * @param {Array} taken danh sách id đang dùng.
 */
function nextFeedId(taken) {
    const used = new Set((Array.isArray(taken) ? taken : []).map(normalizeId));
    let id = Date.now();

    while (used.has(normalizeId(id))) id += 1;

    return id;
}

/* ---------- Đọc/ghi dữ liệu ---------- */

function getPosts() {
    return normalizePosts(getStore(POSTS_KEY, []));
}

function setPosts(posts) {
    return setStore(POSTS_KEY, normalizePosts(posts));
}

function getComments() {
    return normalizeComments(getStore(COMMENTS_KEY, []));
}

function setComments(comments) {
    return setStore(COMMENTS_KEY, normalizeComments(comments));
}

function getLikes() {
    const likes = getStore(LIKES_KEY, {});
    return likes && typeof likes === 'object' && !Array.isArray(likes) ? likes : {};
}

function setLikes(likes) {
    return setStore(LIKES_KEY, likes);
}

function getSeededPostIds() {
    const ids = getStore(POSTS_SEEDED_KEY, []);
    return Array.isArray(ids) ? ids.map(normalizeId) : [];
}

/**
 * Nạp bài viết mẫu từ data/posts.json (chạy mỗi lần mở Feed hoặc Profile).
 * Merge theo id nên không tạo bài trùng, xem mô tả đầu file.
 * @returns {Array} danh sách bài viết sau khi merge.
 */
async function seedPostsFromJson() {
    const jsonPosts = await loadData(DATA_PATH.posts);
    const stored = getPosts();

    // Mọi id từng nạp + mọi id đang lưu đều được coi là "đã biết".
    const seeded = getSeededPostIds();
    const known = new Set(seeded);
    stored.forEach((post) => known.add(normalizeId(post.id)));

    const added = normalizePosts(jsonPosts).filter((post) => {
        const id = normalizeId(post.id);
        if (known.has(id)) return false;

        known.add(id);
        return true;
    });

    if (!added.length) {
        // Ghi lại danh sách id đã nạp (lần đầu chưa có ghi, hoặc posts.json vừa thêm id mới).
        if (known.size > seeded.length) setStore(POSTS_SEEDED_KEY, [...known]);
        return stored;
    }

    const merged = stored.concat(added);
    setPosts(merged);
    setStore(POSTS_SEEDED_KEY, [...known]);

    return merged;
}

/* ---------- Cấu hình kiểm duyệt (duyệt trước khi đăng) ---------- */

/**
 * Giá trị mặc định của aov_mod_settings: MẶC ĐỊNH bật duyệt trước khi đăng.
 * bannedWords / autoHideThreshold là cấu hình cho các bước kiểm duyệt sau,
 * ở bước này mới chỉ dùng requireApproval nhưng luôn ghi đủ 3 trường.
 */
const MOD_SETTINGS_DEFAULTS = {
    requireApproval: true,
    bannedWords: [],
    autoHideThreshold: 5,
};

/**
 * Đọc cấu hình kiểm duyệt từ aov_mod_settings.
 *
 * Key chưa từng ghi (lần đầu mở web) hoặc LocalStorage bị sửa tay cho hỏng
 * thì rơi về MOD_SETTINGS_DEFAULTS, luôn trả đủ 3 trường nên nơi gọi không
 * phải kiểm tra null. Đọc từng trường theo kiểu dữ liệu của nó, nên giá trị
 * lạ ("yes", mảng, object...) không làm hỏng được cấu hình.
 *
 * @returns {{ requireApproval: boolean, bannedWords: string[], autoHideThreshold: number }}
 */
function getModSettings() {
    const stored = getStore(MOD_SETTINGS_KEY, null);
    const source = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};

    return {
        requireApproval: typeof source.requireApproval === 'boolean'
            ? source.requireApproval
            : MOD_SETTINGS_DEFAULTS.requireApproval,
        bannedWords: Array.isArray(source.bannedWords)
            ? source.bannedWords.filter((word) => typeof word === 'string' && word.trim())
            : MOD_SETTINGS_DEFAULTS.bannedWords,
        autoHideThreshold: typeof source.autoHideThreshold === 'number'
            && Number.isFinite(source.autoHideThreshold)
            ? source.autoHideThreshold
            : MOD_SETTINGS_DEFAULTS.autoHideThreshold,
    };
}

/**
 * Ghi cấu hình kiểm duyệt vào aov_mod_settings (công tắc ở trang Quản trị gọi).
 *
 * Chặn ở tầng dữ liệu giống setPostHidden(): không phải admin thì trả false
 * và KHÔNG ghi gì, nên user thường gọi thẳng từ console cũng không đổi được.
 * Chỉ ba trường của MOD_SETTINGS_DEFAULTS được nhận; trường lạ trong patch bị
 * bỏ qua để aov_mod_settings không bao giờ bị ghi rác.
 *
 * @param {object} patch phần muốn đổi, ví dụ { requireApproval: false }
 * @returns {boolean} true nếu đã ghi được aov_mod_settings.
 */
function setModSettings(patch) {
    if (!isLoggedIn() || typeof isAdmin !== 'function' || !isAdmin()) return false;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;

    const current = getModSettings();
    const next = {
        requireApproval: current.requireApproval,
        bannedWords: current.bannedWords.slice(),
        autoHideThreshold: current.autoHideThreshold,
    };

    if (typeof patch.requireApproval === 'boolean') next.requireApproval = patch.requireApproval;

    if (Array.isArray(patch.bannedWords)) {
        next.bannedWords = patch.bannedWords
            .filter((word) => typeof word === 'string')
            .map((word) => word.trim())
            .filter(Boolean);
    }

    if (typeof patch.autoHideThreshold === 'number' && Number.isFinite(patch.autoHideThreshold)) {
        next.autoHideThreshold = patch.autoHideThreshold;
    }

    return setStore(MOD_SETTINGS_KEY, next);
}

/* ---------- Tìm bài viết ---------- */

/**
 * Tìm một bài viết theo id.
 * Chuẩn hoá id trước khi so sánh để "9001" trong URL và 9001 trong JSON là một.
 * @param {number|string} postId
 * @returns {object|null}
 */
function findPostById(postId) {
    const id = normalizeId(postId);

    if (!id) return null;

    return getPosts().find((post) => normalizeId(post.id) === id) || null;
}

/* ---------- CRUD bài viết ---------- */

const POST_TITLE_MIN = 5;
const POST_CONTENT_MIN = 10;

/** Độ dài tối đa của một bình luận (ký tự), để aov_comments không bị phình quá lớn. */
const COMMENT_MAX = 500;

/* ---------- Chuyên mục bài viết ---------- */

/** Danh sách chuyên mục hợp lệ, dùng cho select ở form và cho thanh lọc trang Feed. */
const POST_CATEGORIES = ['Build trang bị', 'Mẹo chơi', 'Thảo luận', 'Hỏi đáp'];

/* ---------- Trạng thái duyệt bài viết ---------- */

/** Trạng thái "chờ duyệt": bài chưa được quản trị viên duyệt, chỉ tác giả thấy. */
const POST_STATUS_PENDING = 'pending';

/** Trạng thái "đã duyệt": bài hiển thị bình thường cho mọi người (mặc định). */
const POST_STATUS_APPROVED = 'approved';

/** Trạng thái "bị từ chối": bài không qua duyệt, chỉ tác giả thấy. */
const POST_STATUS_REJECTED = 'rejected';

/** Ba trạng thái hợp lệ; thiếu trường status hoặc giá trị lạ đều coi là "approved". */
const POST_STATUSES = [POST_STATUS_PENDING, POST_STATUS_APPROVED, POST_STATUS_REJECTED];

/** Nhãn tiếng Việt cho từng trạng thái, dùng ở bảng trang Quản trị. */
const POST_STATUS_LABELS = {
    [POST_STATUS_PENDING]: 'Chờ duyệt',
    [POST_STATUS_APPROVED]: 'Đã duyệt',
    [POST_STATUS_REJECTED]: 'Từ chối',
};

/**
 * Chuyên mục hiển thị của một bài viết.
 * Bài đã đăng từ trước khi có trường category thì không có thuộc tính này,
 * coi như thuộc "Khác" để hiển thị và lọc được, không làm hỏng dữ liệu cũ.
 * @param {object} post
 * @returns {string}
 */
function getPostCategory(post) {
    const category = post && post.category;
    return POST_CATEGORIES.includes(category) ? category : 'Khác';
}

/**
 * Trạng thái duyệt của một bài viết, luôn trả về một trong 3 giá trị hợp lệ.
 * Cùng kiểu với getPostCategory: bài viết tạo trước khi có tính năng duyệt thì
 * không có trường status, và LocalStorage có thể bị sửa tay để giá trị lạ
 * ("draft", "1", null...) -> tất cả đều coi là "approved" để dữ liệu cũ chạy bình thường.
 *
 * Mọi nơi trong dự án phải gọi hàm này, KHÔNG đọc post.status trực tiếp,
 * để một chỗ chặn nhầm giá trị lạ không làm bài cũ biến mất khỏi giao diện.
 *
 * @param {object} post
 * @returns {string} "pending" | "approved" | "rejected"
 */
function getPostStatus(post) {
    const status = post && post.status;
    return POST_STATUSES.includes(status) ? status : POST_STATUS_APPROVED;
}

/**
 * Kiểm tra dữ liệu form đăng bài.
 * Tách riêng khỏi createPost() để cùng một bộ quy tắc dùng cho form và cho test.
 *
 * author lấy từ session (getCurrentUser), phải có trong danh sách tài khoản
 * của dự án (aov_users nạp từ data/users.json) thì mới coi là hợp lệ.
 *
 * category phải nằm trong POST_CATEGORIES; bỏ trống hoặc sai tên đều báo lỗi
 * để bài mới luôn có chuyên mục, nhờ đó thanh lọc phân loại được.
 *
 * @returns {{ valid: boolean, errors: string[], values: { title: string, content: string, heroId: *, author: string, category: string } }}
 */
function validatePostForm(title, content, heroId, category) {
    const errors = [];
    const cleanTitle = String(title || '').trim();
    const cleanContent = String(content || '').trim();
    const author = String(getCurrentUser() || '').trim();
    const cleanCategory = String(category || '').trim();

    if (!author) {
        errors.push('Bạn cần đăng nhập để đăng bài.');
    } else if (typeof findUser === 'function' && !findUser(author)) {
        errors.push('Tài khoản của bạn không còn tồn tại. Hãy đăng nhập lại.');
    }

    if (!cleanTitle) errors.push('Tiêu đề không được để trống.');
    else if (cleanTitle.length < POST_TITLE_MIN) errors.push(`Tiêu đề phải có ít nhất ${POST_TITLE_MIN} ký tự.`);

    if (!cleanContent) errors.push('Nội dung không được để trống.');
    else if (cleanContent.length < POST_CONTENT_MIN) errors.push(`Nội dung phải có ít nhất ${POST_CONTENT_MIN} ký tự.`);

    if (!POST_CATEGORIES.includes(cleanCategory)) errors.push('Vui lòng chọn chuyên mục cho bài viết.');

    return {
        valid: !errors.length,
        errors,
        values: {
            title: cleanTitle,
            content: cleanContent,
            heroId: toStorageId(heroId),
            author,
            category: cleanCategory,
        },
    };
}

/**
 * Đăng bài mới. Bài mới luôn lên đầu danh sách.
 *
 * Bài chỉ nằm trong aov_posts (LocalStorage), KHÔNG ghi vào data/posts.json
 * vì file đó là dữ liệu tĩnh của project.
 *
 * Cùng lúc khởi tạo sẵn lượt thích và bình luận rỗng cho bài mới để
 * mọi trang đọc cùng một cấu trúc dữ liệu, không phải tự xử lý vắng mặt.
 *
 * Trạng thái duyệt ghi theo cấu hình aov_mod_settings.requireApproval (xem
 * getModSettings): đang bật duyệt trước thì user thường tạo "pending", admin
 * tạo "approved" ngay kèm reviewedBy/reviewedAt; đang tắt thì mọi bài ra
 * "approved" — luôn có trường status để bảng quản trị khỏi phải đoán.
 *
 * @returns {object|null} bài vừa tạo, null nếu dữ liệu không hợp lệ hoặc lưu thất bại.
 */
function createPost(title, content, heroId, category) {
    const checked = validatePostForm(title, content, heroId, category);
    if (!checked.valid) return null;

    const posts = getPosts();
    const id = nextFeedId(posts.map((row) => row.id));
    const createdAt = new Date().toISOString();

    const approvalOn = getModSettings().requireApproval;
    const posterIsAdmin = typeof isAdmin === 'function' && isAdmin();

    const post = {
        id,
        author: checked.values.author,
        title: checked.values.title,
        content: checked.values.content,
        heroId: checked.values.heroId,
        category: checked.values.category,
        createdAt,
        status: approvalOn && !posterIsAdmin ? POST_STATUS_PENDING : POST_STATUS_APPROVED,
    };

    // Admin đăng trong lúc đang bật duyệt trước -> duyệt luôn, ghi lại ai duyệt
    // và lúc nào để bảng quản trị truy vết được (đúng reviewedBy/reviewedAt của KD01).
    if (approvalOn && posterIsAdmin) {
        post.reviewedBy = checked.values.author;
        post.reviewedAt = createdAt;
    }

    posts.unshift(post);

    if (!setPosts(posts)) return null;

    // Khởi tạo lượt thích rỗng cho bài mới (bình luận thì vốn đã rỗng:
    // đọc theo postId mà không có bản ghi nào thì ra mảng rỗng).
    const likes = getLikes();
    if (!(id in likes)) {
        likes[id] = [];
        setLikes(likes);
    }

    return post;
}

/**
 * Người dùng hiện tại có quyền sửa bài viết này không.
 * Dùng chung cho nút "Sửa" ở Feed và ở trang chi tiết, và cả updatePost() bên dưới
 * để không lộ nút sửa cho bài của người khác.
 * @param {object} post
 * @returns {boolean}
 */
function canEditPost(post) {
    if (!post || !isLoggedIn()) return false;

    return isPostAuthor(post);
}

/**
 * Sửa bài viết đã có: giữ nguyên id và createdAt, chỉ cập nhật nội dung và updatedAt.
 *
 * Chỉ tác giả của bài mới sửa được. Không tạo bài mới và không đụng data/posts.json.
 * Bài bị từ chối mà sửa lại thì chuyển về "pending" (coi như gửi duyệt lần nữa)
 * và bỏ lý do từ chối; bài "approved" / "pending" giữ nguyên trạng thái.
 *
 * @param {number|string} postId
 * @param {string} title
 * @param {string} content
 * @param {*} heroId
 * @param {string} [category] chuyên mục mới. Bỏ trống thì giữ chuyên mục đang có
 *        của bài (gọi từ test hoặc từ code cũ chỉ truyền 3 tham số vẫn chạy được).
 * @returns {object|null} bài sau khi sửa, null nếu không tìm thấy bài,
 *         không phải tác giả, dữ liệu không hợp lệ hoặc lưu thất bại.
 */
function updatePost(postId, title, content, heroId, category) {
    const id = normalizeId(postId);
    const posts = getPosts();
    const index = posts.findIndex((post) => normalizeId(post.id) === id);

    if (index === -1) return null;

    const current = posts[index];

    if (!canEditPost(current)) return null;

    const checked = validatePostForm(title, content, heroId, category || current.category);
    if (!checked.valid) return null;

    // Sửa bài bị từ chối = gửi duyệt lại: chuyển về "pending" và bỏ lý do
    // từ chối cũ. Bài "approved" giữ nguyên (đã duyệt rồi, sửa nội dung không
    // mất duyệt), bài "pending" vẫn chờ duyệt.
    const wasRejected = getPostStatus(current) === POST_STATUS_REJECTED;

    // Giữ nguyên id + createdAt, chỉ đổi phần nội dung và ghi thời điểm sửa.
    const updated = Object.assign({}, current, {
        title: checked.values.title,
        content: checked.values.content,
        heroId: checked.values.heroId,
        category: checked.values.category,
        updatedAt: new Date().toISOString(),
    });

    if (wasRejected) {
        updated.status = POST_STATUS_PENDING;
        delete updated.rejectReason;
    }

    posts[index] = updated;

    return setPosts(posts) ? updated : null;
}

/**
 * Người dùng hiện tại có quyền xoá bài viết này không.
 * Quyền xoá rộng hơn quyền sửa: tác giả xoá được bài của mình, admin xoá được
 * bài của bất kỳ ai (để dọn bài viết vi phạm).
 *
 * Dùng chung cho nút "Xoá bài" ở Feed, ở trang chi tiết và ở Profile (cả ba đều vẽ
 * bằng renderPostCard), và cho deletePost() bên dưới — nhờ vậy giao diện không bao
 * giờ hiện nút Xoá cho người không có quyền, nhưng quyền thật vẫn được kiểm tra
 * lại trong deletePost() chứ không tin vào giao diện.
 *
 * @param {object} post
 * @returns {boolean}
 */
function canDeletePost(post) {
    if (!post || !isLoggedIn()) return false;

    const isAuthor = String(post.author || '').trim() === String(getCurrentUser() || '').trim();
    if (isAuthor) return true;

    // Trang nào không nạp auth.js vẫn chạy được (không có isAdmin -> không có quyền admin).
    return typeof isAdmin === 'function' && isAdmin();
}

/**
 * Người dùng hiện tại có quyền xoá bình luận này không.
 * Quy tắc giống hệt canDeletePost(): tác giả của bình luận hoặc admin.
 *
 * @param {object} comment
 * @returns {boolean}
 */
function canDeleteComment(comment) {
    if (!comment || !isLoggedIn()) return false;

    const isAuthor = String(comment.author || '').trim() === String(getCurrentUser() || '').trim();
    if (isAuthor) return true;

    return typeof isAdmin === 'function' && isAdmin();
}

/**
 * Xoá bài viết kèm toàn bộ bình luận và lượt thích của bài đó.
 *
 * Chỉ tác giả của bài hoặc admin mới xoá được: không tìm thấy bài, chưa đăng nhập
 * hoặc không đủ quyền thì trả về false và KHÔNG ghi gì đè lên LocalStorage
 * (không chạm vào aov_posts, aov_comments, aov_likes).
 *
 * @param {number|string} postId
 * @returns {boolean} true nếu bài đã bị xoá.
 */
function deletePost(postId) {
    const id = normalizeId(postId);
    if (!id) return false;

    const posts = getPosts();
    const target = posts.find((post) => normalizeId(post.id) === id);

    // Chặn ở tầng dữ liệu: không có bài hoặc không đủ quyền thì dừng, dữ liệu giữ nguyên.
    if (!target || !canDeletePost(target)) return false;

    setPosts(posts.filter((post) => normalizeId(post.id) !== id));
    setComments(getComments().filter((comment) => normalizeId(comment.postId) !== id));

    const likes = getLikes();
    if (id in likes) {
        delete likes[id];
        setLikes(likes);
    }

    return true;
}

/**
 * Người dùng hiện tại có phải tác giả của bài viết này không.
 * Tách riêng khỏi canEditPost() vì cần dùng cả khi bài chưa tới bước sửa:
 * tác giả vẫn xem được bài của chính mình kể cả khi bài đã bị admin ẩn.
 *
 * @param {object} post
 * @returns {boolean}
 */
function isPostAuthor(post) {
    const username = getCurrentUser();
    if (!post || !username) return false;

    return String(post.author || '').trim() === String(username).trim();
}

/**
 * Bài viết đã bị quản trị viên ẩn hay chưa (trường hidden: true trong aov_posts).
 * Bài đăng từ trước khi có tính năng ẩn thì không có trường này -> coi như đang hiện.
 *
 * @param {object} post
 * @returns {boolean}
 */
function isPostHidden(post) {
    return Boolean(post && post.hidden);
}

/**
 * Bài viết này có hiện với người đang xem không.
 *
 * Quy tắc (ẩn và duyệt xử lý cùng một kiểu):
 *   - bài đang hiện VÀ đã được duyệt (approved) -> ai cũng thấy;
 *   - bài bị ẩn (hidden) HOẶC chưa được duyệt (pending / rejected) -> chỉ tác giả
 *     thấy (kèm nhãn "Đã bị ẩn" hoặc huy hiệu "Chờ duyệt" / "Bị từ chối"),
 *     mọi người khác kể cả admin đều không thấy trên Feed / trang chi tiết /
 *     Profile — bảng ở trang Quản trị mới là nơi duy nhất admin thấy bài ẩn
 *     và bài chờ duyệt / bị từ chối.
 *
 * Dùng hàm này ở MỌI nơi vẽ danh sách bài cho người đọc, không tự viết lại điều kiện,
 * để không sót chỗ nào bài ẩn hay bài chưa duyệt vẫn lọt ra giao diện.
 *
 * @param {object} post
 * @returns {boolean}
 */
function isPostVisibleForViewer(post) {
    // Bài bị admin ẩn thì chỉ tác giả được xem (giữ nguyên quy tắc cũ).
    if (isPostHidden(post)) return isPostAuthor(post);

    // Bài chưa qua duyệt (chờ duyệt / bị từ chối) cũng chỉ tác giả được xem;
    // bài thiếu trường status hoặc status lạ đều là "approved" nên vẫn hiện bình thường.
    if (getPostStatus(post) !== POST_STATUS_APPROVED) return isPostAuthor(post);

    return true;
}

/**
 * Ẩn / hiện một bài viết: bật hoặc tắt trường hidden của bài đó trong aov_posts.
 *
 * Chỉ admin mới gọi được (kiểm tra isAdmin(), giống cách canDeletePost() chặn quyền xoá),
 * nên giao diện không cần tự tin rằng nút bấm là của admin — tầng dữ liệu vẫn chặn lại.
 * Không xoá bài, không đụng bình luận/lượt thích: ẩn xong bấm "Hiện" là bài trở lại nguyên trạng.
 *
 * @param {number|string} postId
 * @param {boolean} hidden true = ẩn, false = hiện lại
 * @returns {boolean} true nếu đã cập nhật aov_posts.
 */
function setPostHidden(postId, hidden) {
    const id = normalizeId(postId);
    if (!id) return false;

    // Trang nào không nạp auth.js (hoặc không đăng nhập) thì không có quyền admin.
    if (!isLoggedIn() || typeof isAdmin !== 'function' || !isAdmin()) return false;

    const posts = getPosts();
    const index = posts.findIndex((post) => normalizeId(post.id) === id);
    if (index === -1) return false;

    const updated = Object.assign({}, posts[index]);

    if (hidden) {
        updated.hidden = true;
    } else {
        // Hiện lại thì xoá hẳn trường hidden cho khớp với bài chưa từng bị ẩn.
        delete updated.hidden;
    }

    posts[index] = updated;

    return setPosts(posts);
}

function getPostsByUser(username) {
    const name = String(username || '').trim();
    if (!name) return [];

    // Bài ẩn / bài chưa được duyệt của chính mình vẫn thấy (kèm nhãn) nhờ
    // isPostVisibleForViewer(); bài đó của người khác thì không lộ ra Profile của họ.
    return getPosts().filter((post) => (
        String(post.author || '').trim() === name && isPostVisibleForViewer(post)
    ));
}

/* ---------- Thích ---------- */

function getLikeUsers(postId) {
    const users = getLikes()[normalizeId(postId)];
    return Array.isArray(users) ? users : [];
}

function isLikedByCurrentUser(postId) {
    const username = getCurrentUser();
    return Boolean(username) && getLikeUsers(postId).includes(username);
}

/**
 * Bật/tắt lượt thích của người dùng đang đăng nhập.
 * @returns {boolean} true nếu vừa thích, false nếu vừa bỏ thích, chưa đăng nhập,
 *         bài viết không còn tồn tại hoặc bài không hiển thị với người đang xem
 *         (bài ẩn, bài chờ duyệt / bị từ chối của người khác) — chặn cả khi
 *         gọi thẳng từ console.
 */
function toggleLike(postId) {
    const id = normalizeId(postId);
    const username = getCurrentUser();
    if (!id || !username) return false;

    const post = findPostById(id);

    // Bài không còn trong hệ thống (đã bị xoá) thì không ghi rác vào aov_likes.
    // Bài chưa được duyệt hoặc đang bị ẩn mà người gọi không phải tác giả thì
    // không được thích: giao diện đã không vẽ nút, đây là chặn thêm ở tầng dữ liệu.
    if (!post || !isPostVisibleForViewer(post)) return false;

    const likes = getLikes();
    const users = getLikeUsers(id);
    const liked = !users.includes(username);

    likes[id] = liked ? users.concat(username) : users.filter((name) => name !== username);
    setLikes(likes);

    return liked;
}

/* ---------- Bình luận ---------- */

function getCommentsOfPost(postId) {
    const id = normalizeId(postId);
    return getComments().filter((comment) => normalizeId(comment.postId) === id);
}

/**
 * Thêm bình luận cho một bài viết.
 * @returns {object|null} bình luận vừa tạo, null nếu chưa đăng nhập, nội dung rỗng,
 *         quá COMMENT_MAX ký tự, bài viết không còn tồn tại, bài không hiển thị
 *         với người đang xem (bài ẩn, bài chờ duyệt / bị từ chối của người khác —
 *         chặn cả khi gọi thẳng từ console) hoặc lưu thất bại.
 */
function addComment(postId, content) {
    const id = normalizeId(postId);
    const text = String(content || '').trim();
    const author = getCurrentUser();

    if (!id || !text || !author) return null;

    const post = findPostById(id);

    // Không bình luận vào bài không tồn tại (đã bị xoá) để aov_comments không sinh rác.
    // Bài chưa được duyệt hoặc đang bị ẩn mà người gọi không phải tác giả thì
    // không nhận bình luận: giao diện đã không vẽ ô, đây là chặn thêm ở tầng dữ liệu.
    if (!post || !isPostVisibleForViewer(post)) return null;

    // Chặn bình luận quá dài để một bình luận không làm phình toàn bộ aov_comments.
    if (text.length > COMMENT_MAX) return null;

    const comments = getComments();
    const comment = {
        id: nextFeedId(comments.map((row) => row.id)),
        postId: toStorageId(id),
        author,
        content: text,
        createdAt: new Date().toISOString(),
    };

    comments.push(comment);

    return setComments(comments) ? comment : null;
}

/**
 * Xoá một bình luận.
 * Chỉ tác giả của bình luận hoặc admin mới xoá được; thiếu quyền thì trả false
 * và aov_comments giữ nguyên.
 * @param {number|string} commentId
 * @returns {boolean} true nếu bình luận đã bị xoá.
 */
function deleteComment(commentId) {
    const id = normalizeId(commentId);
    if (!id) return false;

    const comments = getComments();
    const target = comments.find((comment) => normalizeId(comment.id) === id);

    if (!target || !canDeleteComment(target)) return false;

    return setComments(comments.filter((comment) => normalizeId(comment.id) !== id));
}

/* ---------- Giao diện trang Feed ---------- */

/**
 * Hàm vẽ lại giao diện sau khi thích / bình luận / xoá.
 * Mặc định dùng của trang Feed; trang chi tiết bài viết (post-detail.html) ghi đè
 * bằng setFeedRerender() để vẽ lại phần chi tiết thay vì danh sách.
 * @param {string|number} [focusPostId] id bài cần đưa lại con trỏ vào ô bình luận.
 * @type {function(string|number=): void}
 */
let rerenderFeedView = (focusPostId) => renderFeedList(focusPostId);

/**
 * Cho trang khác dùng chung bộ dữ liệu + logic của feed.js mà không phải viết lại.
 * @param {function(string|number=): void} rerender callback vẽ lại giao diện sau khi thao tác.
 */
function setFeedRerender(rerender) {
    if (typeof rerender === 'function') rerenderFeedView = rerender;
}

async function initFeedPage() {
    const listContainer = document.getElementById('feed-list');
    if (!listContainer) return;

    await seedPostsFromJson();
    feedHeroes = await loadHeroes();
    if (!Array.isArray(feedHeroes)) feedHeroes = [];

    // Vẽ thanh lọc trước danh sách để renderFeedList() dùng luôn trạng thái đó.
    renderFeedFilterBar();

    renderPostForm();
    renderFeedList();
}

/**
 * Render form đăng/sửa bài viết.
 *
 * Dùng chung cho cả hai chế độ nên không có form riêng cho việc sửa:
 * - renderPostForm()           -> form đăng bài mới (trống)
 * - renderPostForm(postToEdit) -> form sửa, tự điền sẵn dữ liệu cũ
 *
 * Trạng thái đang sửa được ghi ở data-edit-id của chính thẻ <form>,
 * nên handler submit chỉ cần đọc lại thuộc tính này, không cần biến global.
 *
 * @param {object} [editingPost] bài viết cần sửa, bỏ trống nếu đang đăng bài mới
 * @param {Element} [formBox] vùng chứa form, mặc định là #feed-form
 */
function renderPostForm(editingPost, formBox) {
    const box = formBox || document.getElementById('feed-form');
    if (!box) return;

    if (!isLoggedIn()) {
        box.innerHTML = `
            <div class="feed-form feed-form--guest">
                <p>Bạn cần đăng nhập để đăng bài và bình luận.</p>
                <a class="btn btn-primary" href="${BASE_PATH}src/pages/login.html?redirect=${encodeURIComponent(BASE_PATH + 'src/pages/feed.html')}">Đăng nhập</a>
            </div>
        `;
        return;
    }

    // Bài đang sửa phải thuộc về người dùng hiện tại, nếu không thì coi như đăng bài mới.
    const editing = canEditPost(editingPost) ? editingPost : null;
    const heroOptions = feedHeroes
        .map((hero) => `<option value="${hero.id}">${escapeHtml(hero.name)}</option>`)
        .join('');

    // Không có option rỗng: muốn đăng bài thì bắt buộc chọn chuyên mục.
    const categoryOptions = POST_CATEGORIES
        .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
        .join('');

    // Bài cũ chưa có chuyên mục thì coi như "Khác" và chọn sẵn chuyên mục đầu tiên.
    const editingCategory = editing ? getPostCategory(editing) : POST_CATEGORIES[0];

    box.innerHTML = `
        <form class="feed-form ${editing ? 'is-editing' : ''}" id="post-form" novalidate${editing ? ` data-edit-id="${escapeHtml(editing.id)}"` : ''}>
            <h2>${editing ? 'Sửa bài viết' : 'Đăng bài mới'}</h2>
            ${editing ? `<p class="feed-form__hint">Đang sửa bài “${escapeHtml(editing.title)}”. Thay đổi sẽ ghi đè bài cũ, không tạo bài mới.</p>` : ''}
            <div id="post-errors"></div>
            <div class="form-group">
                <label for="post-title">Tiêu đề</label>
                <input type="text" id="post-title" placeholder="Ví dụ: Cách lên đồ cho xạ thủ" value="${editing ? escapeHtml(editing.title) : ''}">
            </div>
            <div class="form-group">
                <label for="post-content">Nội dung</label>
                <textarea id="post-content" rows="4" placeholder="Chia sẻ kinh nghiệm của bạn...">${editing ? escapeHtml(editing.content) : ''}</textarea>
            </div>
            <div class="form-group">
                <label for="post-category">Chuyên mục</label>
                <select class="filter-bar__select" id="post-category">
                    ${categoryOptions}
                </select>
            </div>
            <div class="form-group">
                <label for="post-hero">Gắn với tướng (không bắt buộc)</label>
                <select class="filter-bar__select" id="post-hero">
                    <option value="">-- Không chọn --</option>
                    ${heroOptions}
                </select>
            </div>
            <div class="feed-form__actions">
                <button type="submit" class="btn btn-primary">${editing ? 'Lưu thay đổi' : 'Đăng bài'}</button>
                ${editing ? `<button type="button" class="btn btn-outline" data-post-edit-cancel>Huỷ</button>` : ''}
            </div>
        </form>
    `;

    const form = box.querySelector('#post-form');
    if (!form) return;

    // Chọn lại tướng đang gắn của bài cũ (đặt sau innerHTML để option đã tồn tại).
    if (editing && editing.heroId) form.querySelector('#post-hero').value = editing.heroId;

    // Chọn lại chuyên mục của bài cũ; bài cũ không có thì để ở chuyên mục đầu tiên.
    if (editing && POST_CATEGORIES.includes(editing.category)) {
        form.querySelector('#post-category').value = editing.category;
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const title = form.querySelector('#post-title').value;
        const content = form.querySelector('#post-content').value;
        const heroId = form.querySelector('#post-hero').value;
        const category = form.querySelector('#post-category').value;
        const errorBox = form.querySelector('#post-errors');
        const checked = validatePostForm(title, content, heroId, category);

        renderErrors(errorBox, checked.errors);
        if (!checked.valid) return;

        const editId = form.dataset.editId;

        if (editId) {
            // Sửa bài cũ: giữ nguyên id và createdAt, chỉ đổi nội dung + ghi updatedAt.
            const updated = updatePost(editId, title, content, heroId, category);
            if (!updated) {
                renderErrors(errorBox, ['Không lưu được bài viết. Bạn chỉ có thể sửa bài của chính mình.']);
                return;
            }

            // Vẽ lại form ở chế độ sửa với dữ liệu vừa lưu để người dùng thấy kết quả.
            renderPostForm(updated, box);

            // renderPostForm() đã thay thế thẻ <form> cũ nên phải tra lại form mới,
            // nếu không thông báo sẽ ghi vào node đã bị tách khỏi DOM và không hiện được.
            const updatedForm = box.querySelector('#post-form');
            renderSuccess(
                updatedForm.querySelector('#post-errors'),
                `Đã lưu bài "${checked.values.title}".`,
            );
            updatedForm.querySelector('#post-errors').insertAdjacentHTML(
                'beforeend',
                ` <a href="${BASE_PATH}src/pages/post-detail.html?id=${encodeURIComponent(updated.id)}">Xem bài vừa sửa</a>`,
            );

            rerenderFeedView(updated.id);
            if (typeof renderProfilePosts === 'function') renderProfilePosts();

            return;
        }

        const newPost = createPost(title, content, heroId, category);
        if (!newPost) {
            renderErrors(errorBox, ['Không lưu được bài viết. Hãy thử lại hoặc kiểm tra dung lượng trình duyệt.']);
            return;
        }

        // Bài mới lên đầu danh sách nên Feed hiển thị ngay,
        // đồng thời báo kèm link để mở trang chi tiết của chính bài vừa đăng.
        // Thông báo theo kết quả duyệt: bài đang chờ duyệt thì báo rõ để tác
        // giả khỏi tưởng người khác đã thấy; bài đã duyệt giữ nguyên lời báo cũ.
        form.reset();
        const waitingApproval = getPostStatus(newPost) === POST_STATUS_PENDING;
        renderSuccess(
            form.querySelector('#post-errors'),
            waitingApproval
                ? `Đã đăng bài "${checked.values.title}". Bài của bạn đang chờ duyệt.`
                : `Đã đăng bài "${checked.values.title}".`,
        );
        form.querySelector('#post-errors').insertAdjacentHTML(
            'beforeend',
            ` <a href="${BASE_PATH}src/pages/post-detail.html?id=${encodeURIComponent(newPost.id)}">${waitingApproval ? 'Xem bài' : 'Xem bài vừa đăng'}</a>`,
        );

        rerenderFeedView();
        if (typeof renderProfilePosts === 'function') renderProfilePosts();
    });

    form.addEventListener('click', (event) => {
        if (!event.target.closest('[data-post-edit-cancel]')) return;

        event.preventDefault();
        renderPostForm(null, box);
    });
}

/**
 * Mở form sửa cho một bài viết: tìm bài trong aov_posts rồi đổi form hiện tại sang chế độ sửa.
 * Chạy được từ cả Feed lẫn trang chi tiết vì chỉ cần một vùng chứa form.
 * @param {number|string} postId
 * @param {Element} formBox
 * @returns {boolean} đã mở được form sửa hay không
 */
function openPostEditForm(postId, formBox) {
    const post = findPostById(postId);
    const box = formBox || document.getElementById('feed-form') || document.getElementById('post-edit-form');

    // Trang không có vùng để vẽ form (vd profile.html) thì báo thất bại để handler
    // hiện alert, thay vì im lặng rồi trả true khiến người dùng tưởng đã mở form sửa.
    if (!post || !canEditPost(post) || !box) return false;

    renderPostForm(post, box);
    if (box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'center' });

    return true;
}

/* ---------- Lọc & sắp xếp Feed ---------- */

/** Giá trị mặc định: xem tất cả chuyên mục, sắp xếp mới nhất trước. */
const POST_CATEGORY_ALL = 'all';
const POST_SORT_NEWEST = 'newest';
const POST_SORT_LIKES = 'likes';
const POST_SORT_COMMENTS = 'comments';

/** Nhãn hiển thị cho từng kiểu sắp xếp (thứ tự chính là thứ tự trong select). */
const POST_SORT_LABELS = {
    [POST_SORT_NEWEST]: 'Mới nhất',
    [POST_SORT_LIKES]: 'Nhiều like nhất',
    [POST_SORT_COMMENTS]: 'Nhiều bình luận nhất',
};

/**
 * Trạng thái bộ lọc của trang Feed, tạo một lần rồi giữ trong bộ nhớ.
 * Đọc sẵn từ URL nên F5 hay copy link sang máy khác vẫn giữ nguyên bộ lọc:
 *   feed.html?category=Mẹo%20chơi&sort=likes
 * Chỉ chuyên mục và cách sắp xếp được ghi lên URL, từ khoá tìm kiếm thì không
 * (để link gọn và vì từ khoá không cần chia sẻ).
 */
let feedFilterState = null;

function getFeedFilterState() {
    if (feedFilterState) return feedFilterState;

    const categoryParam = String(getQueryParam('category') || '').trim();
    const sortParam = String(getQueryParam('sort') || '').trim();

    feedFilterState = {
        // Chỉ nhận chuyên mục có thật trong POST_CATEGORIES, còn lại (chuyên mục lạ trên
        // URL) thì rơi về "tất cả". Bài cũ thiếu category vẫn hiện là "Khác" trên thẻ bài
        // nhưng không có trong danh sách lọc.
        category: POST_CATEGORIES.includes(categoryParam) ? categoryParam : POST_CATEGORY_ALL,
        sort: POST_SORT_LABELS[sortParam] ? sortParam : POST_SORT_NEWEST,
        keyword: '',
    };

    return feedFilterState;
}

/**
 * Ghi trạng thái lọc lên URL (không tải lại trang).
 * Bỏ tham số rỗng để URL luôn gọn, và giữ lại các tham số khác của trang (vd ?id=).
 */
function syncFeedFilterUrl(state) {
    const params = new URLSearchParams(window.location.search);

    if (state.category && state.category !== POST_CATEGORY_ALL) params.set('category', state.category);
    else params.delete('category');

    if (state.sort && state.sort !== POST_SORT_NEWEST) params.set('sort', state.sort);
    else params.delete('sort');

    const query = params.toString();

    history.replaceState(null, '', query ? `${BASE_PATH}src/pages/feed.html?${query}` : `${BASE_PATH}src/pages/feed.html`);
}

/**
 * Lọc (chuyên mục + từ khoá trong tiêu đề) rồi sắp xếp danh sách bài viết.
 * Lọc dùng phép AND: bài phải thỏa cả chuyên mục lẫn từ khoá.
 * @param {object} state trạng thái lọc hiện tại.
 * @returns {Array}
 */
function getVisiblePosts(state) {
    const keyword = String(state.keyword || '').trim();
    const list = getPosts().filter((post) => {
        // Bài bị ẩn hoặc bài chưa được duyệt (chờ duyệt / bị từ chối) thì không hiện
        // trong Feed với người khác (trừ bài của chính tác giả đang xem).
        if (!isPostVisibleForViewer(post)) return false;

        const matchesCategory = state.category === POST_CATEGORY_ALL || getPostCategory(post) === state.category;
        const matchesKeyword = !keyword || matchKeyword(post.title, keyword);

        return matchesCategory && matchesKeyword;
    });

    // createdAt là chuỗi ISO nên so sánh chuỗi cũng đúng thứ tự thời gian,
    // nhưng dùng Date.parse để chắc chắn và để xử lý được giá trị thiếu.
    const timeOf = (post) => {
        const time = Date.parse(post.createdAt);
        return Number.isNaN(time) ? 0 : time;
    };

    const sorted = list.slice();

    // Sắp xếp theo mới nhất không cần đọc thêm dữ liệu nào nên sort thẳng.
    if (state.sort !== POST_SORT_LIKES && state.sort !== POST_SORT_COMMENTS) {
        sorted.sort((a, b) => timeOf(b) - timeOf(a));
        return sorted;
    }

    // Đếm sẵn một lần cho toàn bộ danh sách trước khi sort.
    // Nếu gọi getLikeUsers()/getCommentsOfPost() ngay trong hàm so sánh thì mỗi lần gọi
    // sẽ đọc + JSON.parse TOÀN BỘ aov_likes / aov_comments, tức O(n log n) lần parse
    // mỗi lần vẽ lại danh sách (đo được: 200 bài -> 2251 lần đọc, ~96 ms chặn trình duyệt).
    const countOf = state.sort === POST_SORT_LIKES
        ? buildLikeCountMap(getLikes())
        : buildCommentCountMap(getComments());

    // Khi hai bài bằng nhau (cùng lượt like / cùng số bình luận) thì bài mới hơn đứng trước.
    sorted.sort((a, b) => (
        (countOf.get(normalizeId(b.id)) || 0) - (countOf.get(normalizeId(a.id)) || 0)
        || timeOf(b) - timeOf(a)
    ));

    return sorted;
}

/**
 * Gom sẵn số người đã thích theo id bài (Map<id, số lượt>) để lúc sort tra cứu O(1)
 * thay vì đọc lại LocalStorage mỗi lần so sánh.
 * @param {object} likes dữ liệu aov_likes đã đọc sẵn.
 * @returns {Map<string, number>}
 */
function buildLikeCountMap(likes) {
    const counts = new Map();

    Object.keys(likes || {}).forEach((id) => {
        const users = likes[id];
        counts.set(normalizeId(id), Array.isArray(users) ? users.length : 0);
    });

    return counts;
}

/**
 * Gom sẵn số bình luận theo id bài (Map<id, số lượt>), đọc aov_comments đúng 1 lần.
 * @param {Array} comments dữ liệu aov_comments đã đọc sẵn.
 * @returns {Map<string, number>}
 */
function buildCommentCountMap(comments) {
    const counts = new Map();

    comments.forEach((comment) => {
        const id = normalizeId(comment.postId);
        counts.set(id, (counts.get(id) || 0) + 1);
    });

    return counts;
}

/**
 * Vẽ thanh lọc: chuyên mục, cách sắp xếp và ô tìm theo tiêu đề.
 * Tái dùng class filter-bar / filter-bar__select / filter-bar__keyword của common.css.
 * @returns {Element|null} vùng chứa thanh lọc, null nếu trang không có.
 */
function renderFeedFilterBar() {
    const bar = document.getElementById('feed-filter-bar');
    if (!bar) return null;

    const state = getFeedFilterState();

    bar.innerHTML = `
        <div class="filter-bar">
            <input
                type="search"
                class="filter-bar__keyword"
                id="feed-keyword"
                placeholder="Tìm bài viết theo tiêu đề..."
                aria-label="Tìm bài viết theo tiêu đề"
            >
            <select class="filter-bar__select" id="feed-category-filter" aria-label="Lọc theo chuyên mục">
                <option value="${POST_CATEGORY_ALL}">Tất cả chuyên mục</option>
                ${POST_CATEGORIES.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}
            </select>
            <select class="filter-bar__select" id="feed-sort-filter" aria-label="Sắp xếp bài viết">
                ${Object.keys(POST_SORT_LABELS)
                    .map((sort) => `<option value="${sort}">${escapeHtml(POST_SORT_LABELS[sort])}</option>`)
                    .join('')}
            </select>
        </div>
    `;

    const categorySelect = bar.querySelector('#feed-category-filter');
    const sortSelect = bar.querySelector('#feed-sort-filter');
    const keywordInput = bar.querySelector('#feed-keyword');

    // Gán value sau khi đã có option trong DOM, giống cách chọn lại tướng ở form.
    if (categorySelect) categorySelect.value = state.category;
    if (sortSelect) sortSelect.value = state.sort;
    if (keywordInput) keywordInput.value = state.keyword;

    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            // Trình duyệt trả về chuỗi rỗng nếu giá trị không khớp option nào,
            // khi đó quay về "tất cả" cho an toàn.
            const picked = categorySelect.value;
            state.category = POST_CATEGORIES.includes(picked) ? picked : POST_CATEGORY_ALL;
            categorySelect.value = state.category;
            syncFeedFilterUrl(state);
            renderFeedList();
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            const picked = sortSelect.value;
            state.sort = POST_SORT_LABELS[picked] ? picked : POST_SORT_NEWEST;
            sortSelect.value = state.sort;
            syncFeedFilterUrl(state);
            renderFeedList();
        });
    }

    if (keywordInput) {
        // Gõ liên tục thì chỉ lọc lại sau khi ngừng gõ, tránh vẽ lại danh sách mỗi ký tự.
        keywordInput.addEventListener('input', debounce(() => {
            state.keyword = keywordInput.value;
            renderFeedList();
        }, 200));
    }

    return bar;
}

/**
 * Vẽ danh sách bài viết theo bộ lọc hiện tại.
 * @param {number|string} [focusPostId] id bài cần đưa lại con trỏ vào ô bình luận sau khi vẽ.
 *        Cần thiết vì danh sách bị vẽ lại toàn bộ sau mỗi lượt thích / bình luận,
 *        không làm vậy thì nội dung đang gõ ở các ô khác sẽ mất sạch.
 */
function renderFeedList(focusPostId) {
    const listContainer = document.getElementById('feed-list');
    if (!listContainer) return;

    // Trang nào không có thanh lọc (vd post-detail.html) thì vẽ toàn bộ bài như cũ.
    const state = getFeedFilterState();
    const posts = getVisiblePosts(state);
    const countEl = document.getElementById('feed-count');

    if (countEl) countEl.textContent = `${posts.length} bài viết`;

    listContainer.innerHTML = posts.length
        ? posts.map(renderPostCard).join('')
        : renderNotFound('Chưa có bài viết nào khớp bộ lọc. Hãy thử đổi chuyên mục hoặc xoá từ khoá.');

    if (focusPostId === undefined || focusPostId === null) return;

    const input = listContainer.querySelector(`[data-comment-form="${normalizeId(focusPostId)}"] input`);
    if (input) input.focus();
}

/**
 * Huy hiệu trạng thái duyệt của bài viết (dùng cho cả thẻ bài lẫn trang chi tiết).
 * - bài đang "approved" -> không cần huy hiệu (trạng thái bình thường, khỏi làm chật giao diện);
 * - bài "pending" -> "Chờ duyệt", bài "rejected" -> "Bị từ chối";
 * - bài bị ẩn -> để trống: chỗ render đã có sẵn huy hiệu "Đã bị ẩn"
 *   (giữ nguyên kiểu hiện tại), tránh hiện hai huy hiệu chồng lên nhau.
 *
 * Chỉ tác giả mới thấy bài pending/rejected nên huy hiệu này cũng chỉ họ thấy.
 * Mọi chuỗi đưa vào HTML đều qua escapeHtml().
 *
 * @param {object} post
 * @returns {string} HTML string, '' nếu không cần huy hiệu.
 */
function renderPostStatusBadge(post) {
    if (isPostHidden(post)) return '';

    const status = getPostStatus(post);
    if (status === POST_STATUS_APPROVED) return '';

    // Nhãn theo yêu cầu giao diện: "Chờ duyệt" / "Bị từ chối"
    // (bảng quản trị dùng POST_STATUS_LABELS nên từ chối ở đó là "Từ chối").
    const label = status === POST_STATUS_PENDING ? 'Chờ duyệt' : 'Bị từ chối';

    return `<span class="badge post-status--${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function renderPostCard(post) {
    const hero = feedHeroes.find((record) => record.id === post.heroId);
    const likeUsers = getLikeUsers(post.id);
    const liked = isLikedByCurrentUser(post.id);
    const comments = getCommentsOfPost(post.id);
    // Quyền xoá lấy từ canDeletePost/canDeleteComment để Feed, trang chi tiết và
    // Profile (cùng dùng renderPostCard) luôn hiện nút theo đúng một bộ quy tắc.
    const canDelete = canDeletePost(post);
    const canEdit = canEditPost(post);

    // Bài bị admin ẩn chỉ hiện với chính tác giả, kèm nhãn để tác giả biết bài đang bị ẩn.
    const hiddenBadge = isPostHidden(post)
        ? '<span class="badge post-card__hidden">Đã bị ẩn</span>'
        : '';

    // Bài chờ duyệt / bị từ chối cũng chỉ hiện với tác giả, kèm huy hiệu tương ứng
    // (renderPostStatusBadge() tự bỏ qua bài approved và bài đang có nhãn "Đã bị ẩn").
    const statusBadge = renderPostStatusBadge(post);

    const commentsHtml = comments.map((comment) => `
        <li class="comment">
            <strong>${escapeHtml(comment.author)}</strong>
            <span class="comment__time">${formatDateTime(comment.createdAt)}</span>
            <p>${escapeHtml(comment.content)}</p>
            ${canDeleteComment(comment)
                ? `<button type="button" class="comment__delete" data-comment-delete="${escapeHtml(comment.id)}">Xoá</button>`
                : ''}
        </li>
    `).join('');

    return `
        <article class="post-card" data-post-id="${escapeHtml(post.id)}">
            <header class="post-card__head">
                <span class="post-card__avatar" aria-hidden="true">👤</span>
                <div>
                    <h3 class="post-card__title">${escapeHtml(post.title)}</h3>
                    <span class="post-card__meta">
                        ${escapeHtml(post.author)} · ${formatDateTime(post.createdAt)}
                        ${post.updatedAt ? ` · <span class="post-card__updated" title="${escapeHtml(formatDateTime(post.updatedAt))}">đã sửa</span>` : ''}
                        ${hero ? ` · <a href="${BASE_PATH}src/pages/hero-detail.html?id=${hero.id}">${escapeHtml(hero.name)}</a>` : ''}
                        · <span class="post-card__category">${escapeHtml(getPostCategory(post))}</span>
                    </span>
                    ${hiddenBadge}${statusBadge}
                </div>
                <div class="post-card__owner-actions">
                    ${canEdit ? `<button type="button" class="post-card__edit" data-post-edit="${escapeHtml(post.id)}">Sửa</button>` : ''}
                    ${canDelete ? `<button type="button" class="post-card__delete" data-post-delete="${escapeHtml(post.id)}">Xoá bài</button>` : ''}
                </div>
            </header>

            <p class="post-card__content">${escapeHtml(post.content)}</p>

            <div class="post-card__actions">
                <a class="post-action" href="${BASE_PATH}src/pages/post-detail.html?id=${encodeURIComponent(post.id)}">Xem chi tiết</a>
                <button type="button"
                    class="post-action ${liked ? 'is-active' : ''}"
                    data-post-like="${escapeHtml(post.id)}"
                    aria-pressed="${liked ? 'true' : 'false'}">
                    ♥ Thích (${likeUsers.length})
                </button>
                <span class="post-action">💬 ${comments.length} bình luận</span>
            </div>

            <ul class="comment-list">${commentsHtml}</ul>

            ${isLoggedIn() ? `
                <form class="comment-form" data-comment-form="${escapeHtml(post.id)}">
                    <input type="text" placeholder="Viết bình luận..." aria-label="Nội dung bình luận">
                    <button type="submit" class="btn btn-outline btn-sm">Gửi</button>
                </form>
            ` : ''}
        </article>
    `;
}

/* ---------- Trang Chi tiết bài viết (post-detail.html) ---------- */

/**
 * Trang chi tiết: đọc ?id= trên URL rồi tra trong aov_posts.
 * Bài lấy từ posts.json đã được nạp vào LocalStorage nên lúc nào cũng tra được,
 * kể cả bài người dùng tự đăng (vẫn dùng đúng một cấu trúc dữ liệu).
 *
 * File này KHÔNG tạo bảng dữ liệu riêng: đọc/ghi, thích và bình luận đều gọi lại
 * đúng các hàm của trang Feed, nên thao tác ở hai trang luôn thấy cùng dữ liệu.
 */
async function initPostDetailPage() {
    const detailContainer = document.getElementById('post-detail');
    if (!detailContainer) return;

    const postId = getQueryParam('id');

    // Bài viết mẫu phải được nạp vào LocalStorage trước thì mới tra cứu được,
    // nên nạp trước rồi mới render (giống hệt cách trang Feed mở).
    await seedPostsFromJson();
    feedHeroes = await loadHeroes();
    if (!Array.isArray(feedHeroes)) feedHeroes = [];

    // Các nút thích / gửi bình luận trên trang chi tiết được xử lý bởi đúng
    // event delegation của trang Feed, chỉ cần đổi hàm vẽ lại.
    setFeedRerender(renderPostDetailView);

    renderPostDetailView();
}

/**
 * Vẽ lại trang chi tiết (cũng dùng sau mỗi lượt thích / bình luận).
 * @param {string|number} [focusPostId] id bài cần đưa con trỏ về ô bình luận sau khi vẽ.
 *        Bỏ trống (lúc mới mở trang) thì KHÔNG tự ý giành focus vào ô bình luận.
 */
function renderPostDetailView(focusPostId) {
    const detailContainer = document.getElementById('post-detail');
    if (!detailContainer) return;

    const postId = getQueryParam('id');

    if (!String(postId).trim()) {
        detailContainer.innerHTML = renderPostDetailPlaceholder(
            'Thiếu mã bài viết trên đường dẫn. Ví dụ hợp lệ: post-detail.html?id=9001',
        );
        return;
    }

    const post = findPostById(postId);

    if (!post) {
        detailContainer.innerHTML = renderPostDetailPlaceholder(
            `Không tìm thấy bài viết có mã "${String(postId).trim()}".`,
        );
        return;
    }

    // Bài không hiển thị với người đang xem:
    // - bài bị ẩn -> báo đúng như trước đây ("đã bị ẩn bởi quản trị viên");
    // - bài chờ duyệt / bị từ chối mà người xem không phải tác giả -> báo y hệt
    //   bài không tồn tại, để không lộ cả chuyện bài đang chờ duyệt.
    if (!isPostVisibleForViewer(post)) {
        const message = isPostHidden(post)
            ? 'Bài viết này đã bị ẩn bởi quản trị viên.'
            : `Không tìm thấy bài viết có mã "${String(postId).trim()}".`;

        detailContainer.innerHTML = renderPostDetailPlaceholder(message);
        return;
    }

    const hero = feedHeroes.find((record) => record.id === post.heroId);
    const likeUsers = getLikeUsers(post.id);
    const liked = isLikedByCurrentUser(post.id);
    const comments = getCommentsOfPost(post.id);
    const canDelete = canDeletePost(post);

    const commentsHtml = comments.map((comment) => `
        <li class="comment">
            <strong>${escapeHtml(comment.author)}</strong>
            <span class="comment__time">${formatDateTime(comment.createdAt)}</span>
            <p>${escapeHtml(comment.content)}</p>
            ${canDeleteComment(comment)
                ? `<button type="button" class="comment__delete" data-comment-delete="${escapeHtml(comment.id)}">Xoá</button>`
                : ''}
        </li>
    `).join('');

    detailContainer.innerHTML = `
        <article class="post-detail" data-post-id="${escapeHtml(post.id)}">
            <header class="post-detail__head">
                <h1 class="post-detail__title">${escapeHtml(post.title)}</h1>
                <p class="post-detail__meta">
                    <span class="post-detail__author">👤 ${escapeHtml(post.author)}</span>
                    <span class="post-detail__time">
                        <time datetime="${escapeHtml(post.createdAt)}">${formatDateTime(post.createdAt)}</time>
                        ${post.updatedAt ? `<span class="post-detail__updated" title="${escapeHtml(formatDateTime(post.updatedAt))}">đã sửa</span>` : ''}
                    </span>
                    ${hero ? `<a href="${BASE_PATH}src/pages/hero-detail.html?id=${hero.id}">${escapeHtml(hero.name)}</a>` : ''}
                    <span class="post-card__category">${escapeHtml(getPostCategory(post))}</span>
                    ${isPostHidden(post) ? '<span class="badge post-detail__hidden">Đã bị ẩn</span>' : ''}
                    ${renderPostStatusBadge(post)}
                </p>
            </header>

            <div class="post-detail__content">${escapeHtml(post.content)}</div>

            <div class="post-detail__actions">
                <button type="button"
                    class="post-action ${liked ? 'is-active' : ''}"
                    data-post-like="${escapeHtml(post.id)}"
                    aria-pressed="${liked ? 'true' : 'false'}">
                    ♥ Thích (${likeUsers.length})
                </button>
                <span class="post-action">💬 ${comments.length} bình luận</span>
                ${canEditPost(post) ? `<button type="button" class="post-card__edit" data-post-edit="${escapeHtml(post.id)}">Sửa bài</button>` : ''}
                ${canDelete ? `<button type="button" class="post-card__delete" data-post-delete="${escapeHtml(post.id)}">Xoá bài</button>` : ''}
            </div>

            <section class="post-detail__comments">
                <h2>Bình luận (${comments.length})</h2>
                <ul class="comment-list">${commentsHtml || '<li class="comment-list__empty">Chưa có bình luận nào.</li>'}</ul>

                ${isLoggedIn() ? `
                    <form class="comment-form" data-comment-form="${escapeHtml(post.id)}">
                        <input type="text" placeholder="Viết bình luận..." aria-label="Nội dung bình luận">
                        <button type="submit" class="btn btn-outline btn-sm">Gửi</button>
                    </form>
                ` : `
                    <p class="post-detail__guest-note">
                        <a href="${BASE_PATH}src/pages/login.html?redirect=${encodeURIComponent(BASE_PATH + 'src/pages/post-detail.html?id=' + post.id)}">Đăng nhập</a>
                        để viết bình luận.
                    </p>
                `}
            </section>
        </article>
    `;

    // Chỉ trả con trỏ về ô bình luận khi có yêu cầu rõ ràng (sau khi vừa thích / gửi bình luận),
    // không tự ý giành focus lúc người dùng vừa mở trang và đang muốn đọc bài viết.
    if (focusPostId === undefined || focusPostId === null) return;

    // Chỉ focus khi bài đang hiển thị đúng là bài vừa thao tác, tránh nhảy nhầm sang bài khác.
    if (normalizeId(focusPostId) !== normalizeId(post.id)) return;

    const input = detailContainer.querySelector('[data-comment-form] input');
    if (input) input.focus();
}

/**
 * Khối thông báo dùng chung cho các trường hợp lỗi của trang chi tiết.
 * @param {string} message
 * @returns {string} HTML string
 */
function renderPostDetailPlaceholder(message) {
    return `
        <div class="post-detail-empty">
            ${renderNotFound(message)}
            <p class="post-detail-empty__actions">
                <a class="btn btn-outline" href="${BASE_PATH}src/pages/feed.html">← Về danh sách bài viết</a>
            </p>
        </div>
    `;
}

/* Event delegation: bài viết được render động nên gắn sự kiện ở cấp document */
document.addEventListener('click', (event) => {
    const likeBtn = event.target.closest('[data-post-like]');
    if (likeBtn) {
        if (!isLoggedIn()) {
            alert('Bạn cần đăng nhập để thích bài viết.');
            return;
        }

        const postId = likeBtn.dataset.postLike;
        toggleLike(postId);
        rerenderFeedView(postId);
        // Trang Profile cũng hiển thị bài viết nên phải vẽ lại cho khớp
        if (typeof renderProfilePosts === 'function') renderProfilePosts();
        return;
    }

    const editBtn = event.target.closest('[data-post-edit]');
    if (editBtn) {
        // Tái sử dụng đúng form đăng bài: chỉ đổi sang chế độ sửa và điền sẵn dữ liệu cũ.
        const editBox = document.getElementById('feed-form') || document.getElementById('post-edit-form');

        if (!openPostEditForm(editBtn.dataset.postEdit, editBox)) {
            alert('Bạn chỉ có thể sửa bài viết của chính mình.');
        }

        return;
    }

    const deleteBtn = event.target.closest('[data-post-delete]');
    if (deleteBtn) {
        if (!confirm('Xoá bài viết này?')) return;

        // deletePost() tự kiểm tra lại quyền (tác giả hoặc admin). Trả false nghĩa là
        // bài không tồn tại hoặc người gọi không đủ quyền -> dữ liệu giữ nguyên.
        if (!deletePost(deleteBtn.dataset.postDelete)) {
            alert('Bạn không có quyền xoá bài viết này.');
            return;
        }

        rerenderFeedView(deleteBtn.dataset.postDelete);
        if (typeof renderProfilePosts === 'function') renderProfilePosts();
        return;
    }

    const commentDeleteBtn = event.target.closest('[data-comment-delete]');
    if (commentDeleteBtn) {
        const postId = commentDeleteBtn.closest('[data-post-id]')?.dataset.postId;

        // Tương tự: quyền xoá bình luận do deleteComment() kiểm tra lại.
        if (!deleteComment(commentDeleteBtn.dataset.commentDelete)) {
            alert('Bạn không có quyền xoá bình luận này.');
            return;
        }

        rerenderFeedView(postId);
        if (typeof renderProfilePosts === 'function') renderProfilePosts();
    }
});

document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-comment-form]');
    if (!form) return;

    event.preventDefault();

    const input = form.querySelector('input');
    const content = input.value.trim();
    const postId = form.dataset.commentForm;

    if (!content || !addComment(postId, content)) return;

    input.value = '';
    rerenderFeedView(postId);
    if (typeof renderProfilePosts === 'function') renderProfilePosts();
});

/**
 * feed.js được nạp bởi cả feed.html, post-detail.html và profile.html nhưng mỗi trang
 * chỉ có một phần giao diện, nên hai hàm khởi tạo tự thoát sớm nếu không thấy container.
 * Chạy tuần tự và bắt lỗi để trang nào thiếu gì cũng không làm sập trang còn lại.
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initFeedPage();
    } catch (error) {
        console.error('Không khởi tạo được trang Feed', error);
    }

    try {
        await initPostDetailPage();
    } catch (error) {
        console.error('Không khởi tạo được trang chi tiết bài viết', error);
    }
});
