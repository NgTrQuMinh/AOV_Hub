/**
 * feed.js - Community Feed: đăng bài, thích, bình luận (pages/feed.html)
 * Phụ trách: Người 3 (giao diện) + Người 4 (logic dữ liệu)
 *
 * Dữ liệu dùng chung (posts/comments/likes/users) nằm trong src/data/*.json và được
 * quản lý bởi dataStore.js: đọc bằng fetch, ghi bằng File System Access API, giữ bản
 * nháp aov_draft_* trong LocalStorage khi chưa liên kết thư mục. Mọi đọc/ghi ở đây
 * đi qua getCollection/setCollection; các key cũ aov_posts/aov_posts_seeded/
 * aov_comments/aov_likes chỉ được dataStore gộp đúng một lần rồi không dùng nữa.
 *
 * Cấu trúc từng bài viết:
 *   [ { id, author, title, content, heroId, category, createdAt,
 *       status?, rejectReason?, reviewedBy?, reviewedAt?, flagged?, hidden?,
 *       resubmittedAt?, resubmitCount?, lastRejectReason? } ]
 *   các trường có "?" là tùy chọn, bài cũ không có cũng chạy được
 *   (resubmittedAt = lúc tác giả gửi lại, resubmitCount = số lần đã gửi lại,
 *    lastRejectReason = lý do của lần bị từ chối gần nhất, xem KD04-a)
 * Bình luận:  [ { id, postId, author, content, createdAt } ]
 * Lượt thích: { "<postId>": [username, ...] }
 *
 * aov_mod_settings  { requireApproval: boolean,
 *                     bannedWords: [string | { word, level, fold }],
 *                     autoHideThreshold: number }
 *                     cấu hình kiểm duyệt; key còn ở LocalStorage (ngoại lệ), chưa
 *                     ghi thì lấy MOD_SETTINGS_DEFAULTS (xem getModSettings);
 *                     bannedWords: chuỗi (mức 2) hoặc object mức độ, xem KD07-c
 *
 * Mỗi lần mở Feed/Profile/chi tiết, seedPostsFromJson() chỉ await initDataStore rồi
 * trả getPosts(): bản nháp (nếu có) ưu tiên hơn file, bài đã xoá không "sống lại",
 * bài người dùng tự đăng không bị nhân bản. Không còn cơ chế merge theo id và
 * aov_posts_seeded như trước.
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
 * Tài khoản bị khóa (KD09) không đăng bài/sửa/bình luận/thích: xem
 * isCurrentUserBanned()/getBannedNoticeText() và các dòng chặn ở createPost(),
 * updatePost(), canEditPost(), toggleLike(), addComment(); người bị khóa vẫn tự xoá
 * được nội dung của mình nên deletePost()/deleteComment() KHÔNG bị chặn.
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
 *
 * Thông báo kết quả duyệt + gửi lại bài bị từ chối (KD04-a):
 *   - getMyReviewNotices()/countUnseenReviewNotices()/markReviewNoticesSeen():
 *     hàng thông báo cho tác giả biết bài đã được duyệt / bị từ chối (kèm lý do),
 *     hoặc đang chờ duyệt; trạng thái "đã xem" lưu ở LocalStorage theo key
 *     aov_review_seen = { "<username>": { "<postId>": "<reviewedAt>" } } (chỉ ghi
 *     cho chính người đang đăng nhập; profile.html dùng để hiện danh sách).
 *   - resubmitPost(): tác giả gửi lại bài đã bị từ chối (tối đa 3 lần), chuyển bài
 *     về "pending" và ghi lastRejectReason/resubmittedAt/resubmitCount; sửa bài qua
 *     updatePost() vẫn chuyển về "pending" như cũ nhưng KHÔNG giới hạn số lần.
 *
 * Kiểm duyệt nội dung theo mức từ cấm (KD07-c) — MỚI, CHƯA nối vào
 * createPost()/addComment() (nối ở bước KD07-d), các hàm cũ giữ nguyên hành vi:
 *   - bannedWords giờ chứa chuỗi (cũ, coi mức 2) HOẶC object { word, level:
 *     0|1|2|3, fold? }; level 0 = gỡ một từ khỏi danh sách mẫu (sanitizeBannedWords)
 *   - getBannedEntries / moderateContent / buildModerationNotice (thông báo
 *     tiếng Việt thuần, không HTML) / set|get|clearLastModerationNotice
 *   - aov_mod_alerts: kho thông báo vi phạm (MOD_ALERTS_KEY, addModAlert,
 *     getModAlerts, countUnreadModAlerts, markModAlertsRead, removeModAlert)
 */

/**
 * Dữ liệu dùng chung (posts/comments/likes/users) nằm trong src/data/*.json và được
 * quản lý bởi dataStore.js: đọc bằng fetch, ghi bằng File System Access API, giữ bản
 * nháp tạm ở LocalStorage qua key aov_draft_*. Ở đây chỉ còn MOD_SETTINGS_KEY nằm
 * trong LocalStorage như ngoại lệ đã thống nhất.
 */
const MOD_SETTINGS_KEY = 'aov_mod_settings';

// Trạng thái "đã xem kết quả duyệt" của từng tác giả (KD04-a). Không phải collection
// nên nằm ở LocalStorage: { "<username>": { "<postId>": "<reviewedAt>" } }.
const REVIEW_SEEN_KEY = 'aov_review_seen';
const RESUBMIT_MAX = 3;                 // tối đa 3 lần gửi lại mỗi bài
const LAST_REJECT_REASON_MAX = 200;     // lý do từ chối gần nhất lưu tối đa 200 ký tự

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
    return normalizePosts(getCollection('posts'));
}

function setPosts(posts) {
    return setCollection('posts', normalizePosts(posts));
}

function getComments() {
    return normalizeComments(getCollection('comments'));
}

function setComments(comments) {
    return setCollection('comments', normalizeComments(comments));
}

function getLikes() {
    const likes = getCollection('likes');
    return likes && typeof likes === 'object' && !Array.isArray(likes) ? likes : {};
}

function setLikes(likes) {
    return setCollection('likes', likes);
}

/**
 * Nạp dữ liệu dùng chung từ dataStore (chạy mỗi lần mở Feed / Profile / chi tiết).
 * dataStore tự đọc từng file JSON trong src/data/, gộp dữ liệu cũ (aov_posts,
 * aov_comments, aov_likes) đúng một lần và ưu tiên bản nháp đang sửa hơn file —
 * nhờ vậy bài đã xoá không "sống lại" và bài người dùng tự đăng không bị mất khi F5.
 * @returns {Array} danh sách bài viết hiện có.
 */
async function seedPostsFromJson() {
    await initDataStore({ collections: ['posts', 'comments', 'likes', 'users'] });
    return getPosts();
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

/** Số mục tối đa và độ dài tối đa (ký tự) của một mục từ cấm admin nhập. */
const MOD_BANNED_WORDS_MAX = 500;
const MOD_BANNED_WORD_MAX = 80;

/**
 * Làm sạch mảng cấu hình từ cấm (KD07-c). Hợp lệ: chuỗi không rỗng (giữ NGUYÊN
 * kiểu chuỗi, khi lọc coi là mức 2) hoặc object có word chuỗi không rỗng (word
 * cắt khoảng trắng; level không thuộc 0|1|2|3 -> 2; fold lạ -> bỏ trường fold).
 * Số, null, object thiếu word, word rỗng đều bị bỏ.
 * @param {*} list mảng phần tử (không phải mảng -> []).
 * @param {object} [options] { dedupe: bỏ trùng theo chữ thường, maxItems, maxWord }
 * @returns {Array<string|{word: string, level: number, fold?: string}>}
 */
function sanitizeBannedWords(list, options) {
    try {
        const opts = options && typeof options === 'object' ? options : {};
        const maxItems = Number.isFinite(opts.maxItems) ? opts.maxItems : Infinity;
        const maxWord = Number.isFinite(opts.maxWord) ? opts.maxWord : Infinity;
        if (!Array.isArray(list)) return [];
        const out = [];
        const seen = Object.create(null);

        for (let i = 0; i < list.length && out.length < maxItems; i++) {
            const item = list[i];
            let entry = null;

            if (typeof item === 'string') {
                const word = item.trim();
                if (word && word.length <= maxWord) entry = word;
            } else if (item && typeof item === 'object' && !Array.isArray(item)
                && typeof item.word === 'string') {
                const word = item.word.trim();
                if (word && word.length <= maxWord) {
                    const level = Number.isInteger(item.level) && item.level >= 0
                        && item.level <= 3 ? item.level : 2;
                    entry = { word, level };
                    if (item.fold === 'full' || item.fold === 'review' || item.fold === 'off') {
                        entry.fold = item.fold;
                    }
                }
            }

            if (!entry) continue;

            const key = (typeof entry === 'string' ? entry : entry.word).toLowerCase();
            if (opts.dedupe && seen[key]) continue;
            seen[key] = true;
            out.push(entry);
        }

        return out;
    } catch (error) {
        return [];
    }
}

/**
 * Đọc cấu hình kiểm duyệt từ aov_mod_settings.
 *
 * Key chưa từng ghi (lần đầu mở web) hoặc LocalStorage bị sửa tay cho hỏng
 * thì rơi về MOD_SETTINGS_DEFAULTS, luôn trả đủ 3 trường nên nơi gọi không
 * phải kiểm tra null. Đọc từng trường theo kiểu dữ liệu của nó, nên giá trị
 * lạ ("yes", mảng, object...) không làm hỏng được cấu hình.
 *
 * bannedWords đi qua sanitizeBannedWords(): chỉ giữ chuỗi hoặc object hợp lệ,
 * chuỗi cũ VẪN là chuỗi (dữ liệu cũ không bị đổi kiểu).
 *
 * @returns {{ requireApproval: boolean, bannedWords: Array<string|{word: string, level: number, fold?: string}>, autoHideThreshold: number }}
 */
function getModSettings() {
    const stored = getStore(MOD_SETTINGS_KEY, null);
    const source = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};

    return {
        requireApproval: typeof source.requireApproval === 'boolean'
            ? source.requireApproval
            : MOD_SETTINGS_DEFAULTS.requireApproval,
        bannedWords: Array.isArray(source.bannedWords)
            ? sanitizeBannedWords(source.bannedWords)
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
 * patch.bannedWords là mảng thì làm sạch theo sanitizeBannedWords(): giữ chuỗi
 * hoặc object hợp lệ, cắt khoảng trắng, bỏ mục rỗng/quá 80 ký tự, bỏ trùng theo
 * chữ thường (giữ mục đầu) và tối đa 500 mục (KD07-c).
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
        next.bannedWords = sanitizeBannedWords(patch.bannedWords, {
            dedupe: true,
            maxItems: MOD_BANNED_WORDS_MAX,
            maxWord: MOD_BANNED_WORD_MAX,
        });
    }

    if (typeof patch.autoHideThreshold === 'number' && Number.isFinite(patch.autoHideThreshold)) {
        next.autoHideThreshold = patch.autoHideThreshold;
    }

    return setStore(MOD_SETTINGS_KEY, next);
}

/* ---------- Kiểm duyệt nội dung theo mức từ cấm (KD07-c) ---------- */

/**
 * Danh sách từ cấm HIỆU LỰC = mẫu của search.js gộp cấu hình admin
 * (aov_mod_settings.bannedWords, entry level 0 GỠ một từ mẫu).
 * Thiếu search.js -> [] (không lọc gì); mọi lỗi -> [], không ném ra ngoài.
 * @returns {Array<{word: string, level: number, fold: string}>}
 */
function getBannedEntries() {
    try {
        if (typeof getDefaultBannedEntries !== 'function'
            || typeof mergeBannedEntries !== 'function') return [];

        return mergeBannedEntries(getDefaultBannedEntries(), getModSettings().bannedWords);
    } catch (error) {
        return [];
    }
}

/** Gộp source vào out, bỏ trùng theo chữ thường của item hoặc item[keyField]. */
function mergeUniqueMod(out, seen, source, keyField) {
    if (!Array.isArray(source)) return;

    source.forEach((item) => {
        const key = typeof item === 'string' ? item : item && item[keyField];
        if (typeof key !== 'string' || !key) return;
        const low = key.toLowerCase();
        if (seen[low]) return;
        seen[low] = true;
        out.push(item);
    });
}

/**
 * Kiểm tra nội dung theo từ cấm, lấy mức CAO NHẤT trong các đoạn văn.
 * texts: chuỗi hoặc mảng chuỗi; kind: 'post'/'comment' (lạ -> 'post'). LUÔN
 * trả { level, action, label, words, matches, kind }, words/matches gộp không
 * trùng. Không lọc khi thiếu classifyContent (chưa nạp search.js), đầu vào
 * rỗng/lỗi hoặc người đang đăng nhập là admin. Hàm thuần, không ném lỗi.
 */
function moderateContent(texts, kind) {
    const cleanKind = kind === 'comment' ? 'comment' : 'post';
    const empty = { level: 0, action: 'ok', label: '', words: [], matches: [], kind: cleanKind };

    try {
        if (typeof classifyContent !== 'function') return empty;
        if (typeof isLoggedIn === 'function' && isLoggedIn()
            && typeof isAdmin === 'function' && isAdmin()) return empty;

        const parts = (Array.isArray(texts) ? texts : [texts])
            .filter((text) => typeof text === 'string' && text.trim());
        if (!parts.length) return empty;

        const entries = getBannedEntries();
        const words = [];
        const matches = [];
        const seen = { words: Object.create(null), matches: Object.create(null) };
        let level = 0;
        let label = '';

        for (const text of parts) {
            const one = classifyContent(text, entries);
            if (!one || typeof one !== 'object') continue;
            const oneLevel = Number.isFinite(one.level) ? one.level : 0;
            if (oneLevel > level) {
                level = oneLevel;
                label = typeof one.label === 'string' ? one.label : '';
            }
            mergeUniqueMod(words, seen.words, one.words, 'word');
            mergeUniqueMod(matches, seen.matches, one.matches, 'word');
        }

        if (!level) return empty;
        return {
            level,
            action: level === 1 ? 'review' : level === 2 ? 'block' : 'severe',
            label, words, matches, kind: cleanKind,
        };
    } catch (error) {
        return empty;
    }
}

/**
 * Dựng thông báo tiếng Việt cho người dùng (thuần, không đụng DOM, KHÔNG chèn
 * HTML: nơi hiển thị tự escapeHtml). KHÔNG nêu từ vi phạm ra giao diện (admin
 * vẫn xem trong kho aov_mod_alerts). review -> type 'info', block/severe -> 'danger',
 * 'ok' -> type 'ok' với title/message rỗng.
 * penalty là object auth.js recordViolation() trả (thiếu thì coi counted=false):
 * counted -> thêm "Đây là cảnh cáo thứ N", chưa bị khóa thì thêm "Còn tối đa M
 * lần..."; banned -> thêm câu tự động khóa và bỏ câu "Còn tối đa...".
 * @param {{ action?: string, level?: number, label?: string, words?: Array }} [result]
 * @param {{ counted?: boolean, warningNumber?: number, remaining?: number, banned?: boolean }} [penalty]
 * @param {'post'|'comment'} kind
 * @returns {{ type: 'info'|'danger'|'ok', title: string, message: string, words: string[], level: number, label: string }}
 */
function buildModerationNotice(result, penalty, kind) {
    try {
        const res = result && typeof result === 'object' ? result : {};
        const action = typeof res.action === 'string' ? res.action : 'ok';
        const cleanKind = kind === 'comment' ? 'comment' : 'post';
        const level = Number.isFinite(res.level) ? res.level : 0;
        const label = typeof res.label === 'string' ? res.label : '';

        // words LUÔN rỗng ở đây: từ vi phạm không được lộ ra giao diện người dùng.
        const notice = { type: 'ok', title: '', message: '', words: [], level, label };
        if (action !== 'review' && action !== 'block' && action !== 'severe') return notice;

        let title = '';
        let message = '';

        if (action === 'review') {
            notice.type = 'info';
            if (cleanKind === 'comment') {
                title = 'Bình luận cần được xem xét';
                message = 'Bình luận của bạn có nội dung cần xem xét. '
                    + 'Bình luận vẫn được đăng và đã được báo cho quản trị viên.';
            } else {
                title = 'Bài viết cần được xem xét';
                message = 'Bài của bạn có nội dung cần xem xét nên đã được gửi '
                    + 'và đang chờ quản trị viên duyệt.';
            }
        } else if (action === 'block') {
            notice.type = 'danger';
            title = 'Nội dung vi phạm quy tắc cộng đồng';
            message = 'Nội dung của bạn chứa từ ngữ không được phép nên không được đăng. '
                + 'Vui lòng chỉnh sửa lại cho phù hợp với quy tắc cộng đồng.';
        } else {
            notice.type = 'danger';
            title = 'Vi phạm nghiêm trọng';
            message = 'Nội dung của bạn có lời lẽ đe dọa hoặc thù ghét nên không được đăng. '
                + 'Vi phạm này đã được báo cho quản trị viên.';
        }

        const info = penalty && typeof penalty === 'object' ? penalty : {};
        const banned = info.banned === true;

        if (info.counted === true) {
            message += ` Đây là cảnh cáo thứ ${Number.isFinite(info.warningNumber) ? info.warningNumber : 1}.`;
            if (!banned) {
                message += ` Còn tối đa ${Number.isFinite(info.remaining) ? info.remaining : 0}`
                    + ' lần vi phạm nữa tài khoản sẽ bị khóa.';
            }
        }

        if (banned) {
            message += ' Tài khoản của bạn đã bị tự động khóa do vi phạm nhiều lần'
                + ' và sẽ bị đăng xuất khi tải lại trang.';
        }

        notice.title = title;
        notice.message = message;
        return notice;
    } catch (error) {
        return { type: 'ok', title: '', message: '', words: [], level: 0, label: '' };
    }
}

/* ---------- Trạng thái "thông báo kiểm duyệt gần nhất" (dùng ở KD07-d) ---------- */

/**
 * Thông báo kiểm duyệt của lần gần nhất (giao diện đọc khi createPost/
 * addComment trả null). Giữ trong bộ nhớ, sao chép hai chiều hai đầu vào/ra.
 */
let lastModerationNotice = null;

/** Ghi thông báo gần nhất (null/không phải object thì xoá). @returns {boolean} */
function setLastModerationNotice(notice) {
    try {
        lastModerationNotice = notice && typeof notice === 'object'
            ? JSON.parse(JSON.stringify(notice))
            : null;
        return true;
    } catch (error) {
        lastModerationNotice = null;
        return false;
    }
}

/** Đọc bản sao thông báo gần nhất, chưa có thì null. */
function getLastModerationNotice() {
    try {
        return lastModerationNotice ? JSON.parse(JSON.stringify(lastModerationNotice)) : null;
    } catch (error) {
        return null;
    }
}

/** Xoá thông báo gần nhất. @returns {boolean} */
function clearLastModerationNotice() {
    try {
        lastModerationNotice = null;
        return true;
    } catch (error) {
        return false;
    }
}

/* ---------- Kho thông báo vi phạm cho admin (aov_mod_alerts, KD07-c) ---------- */

const MOD_ALERTS_KEY = 'aov_mod_alerts';          // kho thông báo cho admin
const MOD_ALERTS_MAX = 200;                       // giữ 200 mục mới nhất
const MOD_ALERT_ACTIONS = ['review', 'block', 'severe'];   // 'ok' không ghi kho
const MOD_ALERT_WORDS_MAX = 10;                   // tối đa 10 từ mỗi mục
const MOD_ALERT_WORD_MAX = 40;                    // mỗi từ tối đa 40 ký tự
const MOD_ALERT_LABEL_MAX = 80;
const MOD_ALERT_EXCERPT_MAX = 120;                // trích dẫn tối đa 120 ký tự

/** Chuỗi cho mục thông báo: bỏ ký tự điều khiển, gộp khoảng trắng, cắt tối đa. */
function cleanModAlertText(value, max) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

/**
 * Đọc toàn bộ aov_mod_alerts: JSON rác / LocalStorage hỏng / không phải mảng
 * đều coi là danh sách rỗng, không ném lỗi. @returns {Array<object>} mới nhất trước.
 */
function getModAlertList() {
    try {
        const stored = getStore(MOD_ALERTS_KEY, []);
        return Array.isArray(stored)
            ? stored.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
            : [];
    } catch (error) {
        return [];
    }
}

/**
 * Ghi một thông báo vi phạm vào aov_mod_alerts cho admin theo dõi.
 * user LUÔN lấy từ getCurrentUser() (bỏ qua user trong data, chống giả mạo);
 * bắt buộc đã đăng nhập và action thuộc 'review'|'block'|'severe', sai -> null.
 * Mục mới luôn read:false; urgent = level 3; kho giữ tối đa MOD_ALERTS_MAX mục.
 * @param {{ kind?, targetId?, commentId?, action, level?, label?, words?, excerpt?, penalty? }} data
 * @returns {object|null} mục vừa ghi, null nếu không hợp lệ hoặc ghi thất bại.
 */
function addModAlert(data) {
    try {
        if (typeof isLoggedIn !== 'function' || !isLoggedIn()) return null;

        const info = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        const action = MOD_ALERT_ACTIONS.indexOf(info.action) === -1 ? '' : info.action;
        if (!action) return null;

        const levelOf = { review: 1, block: 2, severe: 3 };
        const level = (info.level === 1 || info.level === 2 || info.level === 3)
            ? info.level
            : levelOf[action];
        const words = (Array.isArray(info.words) ? info.words : [])
            .filter((word) => typeof word === 'string' && word.trim())
            .slice(0, MOD_ALERT_WORDS_MAX)
            .map((word) => word.trim().slice(0, MOD_ALERT_WORD_MAX));
        const penalty = info.penalty && typeof info.penalty === 'object' ? info.penalty : {};

        const alerts = getModAlertList();
        const alert = {
            id: nextFeedId(alerts.map((item) => item.id)),
            at: new Date().toISOString(),
            user: String(getCurrentUser() || ''),
            kind: info.kind === 'comment' ? 'comment' : 'post',
            targetId: info.targetId === null || info.targetId === undefined ? '' : info.targetId,
            commentId: info.commentId === null || info.commentId === undefined ? '' : info.commentId,
            action, level,
            label: cleanModAlertText(info.label, MOD_ALERT_LABEL_MAX),
            words, excerpt: cleanModAlertText(info.excerpt, MOD_ALERT_EXCERPT_MAX),
            penalty: { warned: penalty.warned === true, banned: penalty.banned === true },
            urgent: level === 3, read: false,
        };

        alerts.unshift(alert);
        if (alerts.length > MOD_ALERTS_MAX) alerts.length = MOD_ALERTS_MAX;

        return setStore(MOD_ALERTS_KEY, alerts) ? alert : null;
    } catch (error) {
        return null;
    }
}

/** Kho thông báo: CHỈ admin nhận dữ liệu (mới nhất trước, bản sao), khác -> []. */
function getModAlerts() {
    try {
        if (typeof isAdmin !== 'function' || !isAdmin()) return [];
        return JSON.parse(JSON.stringify(getModAlertList()));
    } catch (error) {
        return [];
    }
}

/** Số thông báo CHƯA đọc của admin; không phải admin -> 0. */
function countUnreadModAlerts() {
    try {
        if (typeof isAdmin !== 'function' || !isAdmin()) return 0;
        return getModAlertList().filter((item) => item.read === false).length;
    } catch (error) {
        return 0;
    }
}

/**
 * Đánh dấu đã đọc; CHỈ admin. ids bỏ trống / không phải mảng = đánh dấu TẤT CẢ.
 * @param {Array<number|string>} [ids]
 * @returns {boolean} true nếu đã ghi aov_mod_alerts.
 */
function markModAlertsRead(ids) {
    try {
        if (typeof isAdmin !== 'function' || !isAdmin()) return false;

        const alerts = getModAlertList();
        const wanted = new Set((Array.isArray(ids) && ids.length ? ids : []).map(normalizeId));

        alerts.forEach((item) => {
            if (item.read !== true && (!wanted.size || wanted.has(normalizeId(item.id)))) {
                item.read = true;
            }
        });

        return setStore(MOD_ALERTS_KEY, alerts);
    } catch (error) {
        return false;
    }
}

/** Xoá một thông báo; CHỈ admin. @returns {boolean} true nếu mục đã bị xoá. */
function removeModAlert(id) {
    try {
        if (typeof isAdmin !== 'function' || !isAdmin()) return false;

        const target = normalizeId(id);
        if (!target) return false;

        const alerts = getModAlertList();
        const next = alerts.filter((item) => normalizeId(item.id) !== target);
        if (next.length === alerts.length) return false;

        return setStore(MOD_ALERTS_KEY, next);
    } catch (error) {
        return false;
    }
}

/* ---------- Nối kiểm duyệt vào đăng bài / bình luận (KD07-d) ---------- */

/**
 * Kiểm duyệt nội dung sắp đăng và ghi "thông báo gần nhất" cho giao diện đọc.
 * - 'ok'        : xoá thông báo cũ, blocked/review đều false (hành vi cũ giữ nguyên).
 * - 'block'/'severe': phạt tài khoản qua recordViolation (lỗi -> penalty null),
 *   dựng notice và ghi vào lastModerationNotice, blocked true -> người gọi trả null.
 * - 'review'    : KHÔNG phạt tài khoản, notice mức 'info', review true -> vẫn tạo
 *   nhưng bài/bình luận được gắn cờ chờ admin xử lý.
 * Không gọi addModAlert ở đây: chỗ đăng bài/bình luận tự ghi sau khi lưu thành công.
 *
 * @param {string|string[]} texts nội dung cần kiểm (tiêu đề + nội dung hoặc 1 bình luận)
 * @param {'post'|'comment'} kind
 * @returns {{ result: object, penalty: object|null, blocked: boolean, review: boolean }}
 */
function applyModeration(texts, kind) {
    const out = {
        result: { level: 0, action: 'ok', label: '', words: [], matches: [], kind: kind === 'comment' ? 'comment' : 'post' },
        penalty: null,
        blocked: false,
        review: false,
    };

    try {
        const result = moderateContent(texts, kind);
        out.result = result;

        if (result.action === 'ok') {
            clearLastModerationNotice();
            return out;
        }

        let penalty = null;
        if (result.action === 'block' || result.action === 'severe') {
            // recordViolation tự bọc lỗi và tự bỏ qua admin; lỗi ở đây -> penalty null.
            if (typeof recordViolation === 'function') {
                try {
                    penalty = recordViolation(result.level, {
                        label: result.label,
                        words: result.words,
                        kind: result.kind,
                    });
                } catch (error) {
                    penalty = null;
                }
            }
            out.blocked = true;
        }

        out.penalty = penalty;
        out.review = result.action === 'review';
        setLastModerationNotice(buildModerationNotice(result, penalty, kind));
        return out;
    } catch (error) {
        return out;
    }
}

/**
 * Dựng dữ liệu aov_mod_alerts từ kết quả applyModeration, dùng chung cho đăng bài,
 * sửa bài và bình luận: blocked -> action thật + penalty; review -> action 'review'
 * và penalty { warned:false, banned:false }.
 * @param {{ result: object, penalty: object|null, review: boolean }} moderation
 * @param {'post'|'comment'} kind
 * @param {number|string} targetId id bài (bình luận thì thêm commentId ở nơi gọi)
 * @param {string} excerpt trích dẫn nội dung cho admin xem nhanh
 * @returns {object} đối tượng truyền thẳng cho addModAlert()
 */
function buildModAlertData(moderation, kind, targetId, excerpt) {
    const result = moderation && moderation.result ? moderation.result : {};
    const penalty = moderation && moderation.penalty ? moderation.penalty : {};

    return {
        kind,
        targetId,
        commentId: '',
        action: moderation && moderation.review ? 'review' : (result.action || 'block'),
        level: result.level,
        label: result.label,
        words: result.words,
        excerpt,
        penalty: { warned: penalty.counted === true, banned: penalty.banned === true },
    };
}

/**
 * Khối HTML thông báo kiểm duyệt cho #post-errors / form bình luận (KD07-d).
 * Dùng lại class có sẵn của trang (form-errors / form-success) nên không cần CSS mới;
 * escapeHtml toàn bộ chữ từ dữ liệu người dùng. KHÔNG in từ vi phạm cho người dùng
 * (KD07-d2). Trả chuỗi rỗng nếu notice rỗng.
 * @param {{ type?: string, title?: string, message?: string }} notice
 * @returns {string}
 */
function moderationNoticeHtml(notice) {
    try {
        if (!notice || typeof notice !== 'object') return '';

        const title = String(notice.title || '').trim();
        const message = String(notice.message || '').trim();

        const lines = [];
        if (title) lines.push(`<strong>${escapeHtml(title)}</strong>`);
        if (message) lines.push(escapeHtml(message));
        if (!lines.length) return '';

        if (notice.type === 'info') return `<p class="form-success">${lines.join('<br>')}</p>`;
        return `<ul class="form-errors">${lines.map((line) => `<li>${line}</li>`).join('')}</ul>`;
    } catch (error) {
        return '';
    }
}

/**
 * Gắn một phần tử con vào phần tử cha theo cách an toàn với cả hai kiểu DOM:
 * trình duyệt thật (appendChild) và DOM rút gọn của bộ test (children là mảng
 * thật, không có appendChild). Không được ném lỗi để không chặn thao tác người dùng.
 * @param {Element} parent
 * @param {Element} child
 * @returns {boolean} true nếu đã gắn được
 */
function appendModerationChild(parent, child) {
    try {
        if (!parent || !child) return false;

        if (typeof parent.appendChild === 'function') {
            parent.appendChild(child);
            return true;
        }

        if (Array.isArray(parent.children) && typeof parent.children.push === 'function') {
            child.parent = parent;
            parent.children.push(child);
            return true;
        }
    } catch (error) {
        // Bỏ qua: thông báo chỉ là phần phụ, không được làm hỏng luồng gửi.
    }

    return false;
}

/**
 * Hiện thông báo kiểm duyệt ngay dưới ô nhập của form bình luận đang gửi.
 * Tạo phần tử con [data-comment-notice] nếu chưa có, có thì tái sử dụng (không nhân bản).
 * @param {Element} form thẻ <form data-comment-form>
 * @param {object} notice nội dung từ getLastModerationNotice()
 */
function showCommentNotice(form, notice) {
    try {
        if (!form || typeof form.querySelector !== 'function' || !notice) return;

        const html = moderationNoticeHtml(notice);
        if (!html) return;

        const existing = form.querySelector('[data-comment-notice]');
        if (existing) {
            existing.innerHTML = html;
            return;
        }

        if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;

        const box = document.createElement('div');
        box.setAttribute('data-comment-notice', '');
        // DOM rút gọn của bộ test không tự đồng bộ dataset khi setAttribute().
        if (box.dataset) box.dataset.commentNotice = '';
        box.innerHTML = html;

        appendModerationChild(form, box);
    } catch (error) {
        // Lỗi hiển thị không được chặn thao tác bình luận của người dùng.
    }
}

/** Xoá khối thông báo bình luận (nếu còn) trước khi gửi lại / gửi thành công. */
function clearCommentNotice(form) {
    try {
        if (!form || typeof form.querySelector !== 'function') return;

        const box = form.querySelector('[data-comment-notice]');
        if (!box) return;

        if (typeof box.remove === 'function') {
            box.remove();
            return;
        }

        // DOM rút gọn của bộ test: cha giữ mảng children thật, không có removeChild().
        const parent = box.parentNode || box.parent;
        if (!parent) return;

        if (typeof parent.removeChild === 'function') {
            parent.removeChild(box);
            return;
        }

        if (Array.isArray(parent.children)) {
            const index = parent.children.indexOf(box);
            if (index !== -1) parent.children.splice(index, 1);
        }
    } catch (error) {
        // Bỏ qua: khối thông báo cũ không quan trọng bằng thao tác tiếp theo.
    }
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
 * Bài mới được lưu vào collection posts (do dataStore quản lý, nằm trong
 * posts.json của src/data/); khi chưa liên kết thư mục, dataStore giữ thay bản nháp
 *
 * Cùng lúc khởi tạo sẵn lượt thích và bình luận rỗng cho bài mới để
 * mọi trang đọc cùng một cấu trúc dữ liệu, không phải tự xử lý vắng mặt.
 *
 * Trạng thái duyệt ghi theo cấu hình aov_mod_settings.requireApproval (xem
 * getModSettings): đang bật duyệt trước thì user thường tạo "pending", admin
 * tạo "approved" ngay kèm reviewedBy/reviewedAt; đang tắt thì mọi bài ra
 * "approved" — luôn có trường status để bảng quản trị khỏi phải đoán.
 *
 * Tài khoản bị khóa (KD09) không đăng bài/sửa/bình luận/thích: trả null ngay từ đầu.
 *
 * Kiểm duyệt nội dung (KD07-d): từ cấm mức 2/3 -> trả null, ghi cảnh cáo và một mục
 * aov_mod_alerts cho admin; mức 1 (cần xem xét) -> bài VẪN tạo nhưng luôn ở trạng
 * thái "pending" + flagged:true dù duyệt trước đang tắt, kèm một mục alert kind 'post'.
 *
 * @returns {object|null} bài vừa tạo, null nếu dữ liệu không hợp lệ, nội dung bị
 *         chặn bởi kiểm duyệt hoặc lưu thất bại.
 */
function createPost(title, content, heroId, category) {
    if (isCurrentUserBanned()) return null;

    // Thông báo cũ không được lẫn sang lần gửi này (UI đọc sau khi trả null).
    clearLastModerationNotice();

    const checked = validatePostForm(title, content, heroId, category);
    if (!checked.valid) return null;

    const moderation = applyModeration([checked.values.title, checked.values.content], 'post');

    // Bị chặn: KHÔNG tạo bài, KHÔNG ghi posts; đã có lastModerationNotice cho giao diện.
    if (moderation.blocked) {
        addModAlert(buildModAlertData(moderation, 'post', '', `${checked.values.title} - ${checked.values.content}`));
        return null;
    }

    const posts = getPosts();
    const id = nextFeedId(posts.map((row) => row.id));
    const createdAt = new Date().toISOString();

    const approvalOn = getModSettings().requireApproval;
    const posterIsAdmin = typeof isAdmin === 'function' && isAdmin();

    // Bài có từ cần xem xét luôn chờ duyệt, bất kể requireApproval đang bật hay tắt.
    const waitingReview = moderation.review === true;

    const post = {
        id,
        author: checked.values.author,
        title: checked.values.title,
        content: checked.values.content,
        heroId: checked.values.heroId,
        category: checked.values.category,
        createdAt,
        status: waitingReview || (approvalOn && !posterIsAdmin) ? POST_STATUS_PENDING : POST_STATUS_APPROVED,
    };

    if (waitingReview) post.flagged = true;

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

    // Bài chờ admin duyệt vì có từ cần xem xét -> báo cho admin theo dõi.
    if (waitingReview) addModAlert(buildModAlertData(moderation, 'post', post.id, `${post.title} - ${post.content}`));

    return post;
}

/**
 * Tài khoản đang đăng nhập có đang bị khóa không (KD09).
 *
 * Chỉ chặn khi chắc chắn: auth.js phải nạp và có hàm isUserBanned(), và phải có
 * người đang đăng nhập. Thiếu auth.js / lỗi bất kỳ -> false để không chặn nhầm
 * (nhất quán với fail-open của isUserBanned() bên auth.js).
 *
 * @returns {boolean}
 */
function isCurrentUserBanned() {
    try {
        if (typeof isUserBanned !== 'function') return false;

        const username = getCurrentUser();
        if (!username) return false;

        return isUserBanned(username) === true;
    } catch (error) {
        return false;
    }
}

/**
 * Câu thông báo cho tài khoản bị khóa (KD09), kèm lý do nếu có.
 * Trả chuỗi THÔ; nơi chèn vào HTML phải tự escapeHtml().
 *
 * @returns {string}
 */
function getBannedNoticeText() {
    const base = 'Tài khoản của bạn đang bị khóa nên không thể đăng bài, bình luận hoặc thích bài viết.';

    try {
        if (typeof getUserModeration !== 'function') return base;

        const moderation = getUserModeration(getCurrentUser());
        const reason = moderation && typeof moderation.bannedReason === 'string'
            ? moderation.bannedReason.trim()
            : '';

        return reason ? `${base} Lý do: ${reason}.` : base;
    } catch (error) {
        return base;
    }
}

/**
 * Người dùng hiện tại có quyền sửa bài viết này không.
 * Dùng chung cho nút "Sửa" ở Feed và ở trang chi tiết, và cả updatePost() bên dưới
 * để không lộ nút sửa cho bài của người khác.
 *
 * Tài khoản bị khóa (KD09) không sửa được: nút "Sửa" biến mất và openPostEditForm()/
 * updatePost() cũng từ chối vì đều dựa vào hàm này.
 *
 * @param {object} post
 * @returns {boolean}
 */
function canEditPost(post) {
    if (isCurrentUserBanned()) return false;
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
 *         không phải tác giả, dữ liệu không hợp lệ, nội dung mới bị kiểm duyệt
 *         chặn (KD07-d) hoặc lưu thất bại. Sửa mà nội dung có từ cần xem xét thì
 *         bài chuyển về "pending" + flagged:true và ghi một mục aov_mod_alerts.
 */
function updatePost(postId, title, content, heroId, category) {
    if (isCurrentUserBanned()) return null;

    // Thông báo cũ không được lẫn sang lần gửi này (UI đọc sau khi trả null).
    clearLastModerationNotice();

    const id = normalizeId(postId);
    const posts = getPosts();
    const index = posts.findIndex((post) => normalizeId(post.id) === id);

    if (index === -1) return null;

    const current = posts[index];

    if (!canEditPost(current)) return null;

    const checked = validatePostForm(title, content, heroId, category || current.category);
    if (!checked.valid) return null;

    const moderation = applyModeration([checked.values.title, checked.values.content], 'post');

    // Bị chặn: giữ nguyên bài cũ, không ghi gì; ghi alert cho admin theo dõi.
    if (moderation.blocked) {
        addModAlert(buildModAlertData(moderation, 'post', current.id, `${checked.values.title} - ${checked.values.content}`));
        return null;
    }

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

        // KD04-a: giữ lại lý do lần từ chối trước và tăng số lần đã gửi lại
        // (sửa bài để gửi duyệt lại KHÔNG bị giới hạn 3 lần như resubmitPost).
        if (typeof current.rejectReason === 'string' && current.rejectReason.trim()) {
            updated.lastRejectReason = current.rejectReason.trim().slice(0, LAST_REJECT_REASON_MAX);
        }
        updated.resubmitCount = (Number.isFinite(Number(current.resubmitCount)) ? Number(current.resubmitCount) : 0) + 1;

        delete updated.rejectReason;
    }

    // Nội dung mới có từ cần xem xét -> gửi lại chờ admin duyệt và gắn cờ vi phạm.
    if (moderation.review) {
        updated.status = POST_STATUS_PENDING;
        updated.flagged = true;
        delete updated.rejectReason;
    }

    posts[index] = updated;

    if (!setPosts(posts)) return null;

    if (moderation.review) {
        addModAlert(buildModAlertData(moderation, 'post', updated.id, `${updated.title} - ${updated.content}`));
    }

    return updated;
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
 * Xoá xong, nếu trang có nạp adminlog.js và người xoá là admin thì logAdminAction()
 * sẽ ghi 1 bản ghi vào aov_admin_log; tác giả xoá bài mình không được ghi.
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

    // Nhật ký thao tác admin (adminlog.js): logAdminAction() tự kiểm tra quyền
    // nên chỉ admin xoá bài mới được ghi — tác giả xoá bài của chính mình thì
    // lời gọi này là no-op (trả false, không ghi). Bọc typeof như trên để trang
    // không nạp adminlog.js không lỗi.
    if (typeof logAdminAction === 'function') {
        logAdminAction('delete-post', 'post', id, target.title);
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
 * Ẩn hoặc hiện thành công mà trang có nạp adminlog.js thì logAdminAction() ghi
 * 1 bản ghi 'hide-post' / 'unhide-post' vào aov_admin_log.
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

    if (!setPosts(posts)) return false;

    // Nhật ký thao tác admin (adminlog.js): bọc typeof để trang không nạp file
    // này (Feed, Profile...) gọi setPostHidden cũng không lỗi ReferenceError;
    // logAdminAction() bên trong còn tự kiểm tra quyền admin một lần nữa.
    if (typeof logAdminAction === 'function') {
        logAdminAction(
            hidden ? 'hide-post' : 'unhide-post',
            'post',
            id,
            updated.title
        );
    }

    return true;
}

/**
 * Danh sách bài viết đang chờ duyệt (status "pending"), bài mới nhất trước.
 * Dùng cho mục "Bài viết chờ duyệt" ở tab Chờ duyệt (trang Quản trị) và cho test.
 * Đọc qua getPostStatus() nên bài thiếu trường status (coi là đã duyệt) không lọt vào.
 * @returns {Array}
 */
function getPendingPosts() {
    // createdAt là chuỗi ISO nên dùng Date.parse để xử lý được giá trị thiếu (coi như 0).
    const timeOf = (post) => {
        const time = Date.parse(post.createdAt);
        return Number.isNaN(time) ? 0 : time;
    };

    return getPosts()
        .filter((post) => getPostStatus(post) === POST_STATUS_PENDING)
        .sort((a, b) => timeOf(b) - timeOf(a));
}

/**
 * Duyệt một bài viết: chuyển status sang "approved" và ghi lại ai duyệt, lúc nào.
 *
 * Chỉ admin mới gọi được (kiểm tra isAdmin(), giống setPostHidden()/setModSettings()),
 * nên giao diện không phải tự tin nút bấm là của admin — tầng dữ liệu vẫn chặn lại.
 * Duyệt xong thì xoá lý do từ chối cũ (nếu có) để bài không còn dấu vết lần bị từ chối
 * trước. KHÔNG đụng hidden và KHÔNG xoá bài: đây là hàng đợi duyệt, khác với ẩn/hiện.
 *
 * Duyệt thành công mà trang có nạp adminlog.js thì logAdminAction() ghi
 * 1 bản ghi 'approve-post' vào aov_admin_log.
 *
 * @param {number|string} postId
 * @returns {boolean} true nếu đã ghi aov_posts; false nếu không đủ quyền, không
 *          tìm thấy bài hoặc lưu thất bại (dữ liệu giữ nguyên, không ghi dở dang).
 */
function approvePost(postId) {
    if (!isLoggedIn() || typeof isAdmin !== 'function' || !isAdmin()) return false;

    const id = normalizeId(postId);
    if (!id) return false;

    const posts = getPosts();
    const index = posts.findIndex((post) => normalizeId(post.id) === id);
    if (index === -1) return false;

    const updated = Object.assign({}, posts[index], {
        status: POST_STATUS_APPROVED,
        reviewedBy: getCurrentUser(),
        reviewedAt: new Date().toISOString(),
    });

    // Duyệt lại bài từng bị từ chối: bỏ lý do cũ để không còn rác.
    delete updated.rejectReason;

    posts[index] = updated;

    if (!setPosts(posts)) return false;

    if (typeof logAdminAction === 'function') {
        logAdminAction('approve-post', 'post', id, updated.title);
    }

    return true;
}

/**
 * Từ chối một bài viết: chuyển status sang "rejected", kèm lý do (nếu có).
 *
 * Cùng cách chặn quyền như approvePost() (chỉ admin). Lý do KHÔNG bắt buộc: gửi
 * chuỗi rỗng thì bài vẫn bị từ chối nhưng không ghi rejectReason (và xoá lý do cũ
 * nếu bài từng bị từ chối trước đó). Người duyệt và thời điểm luôn được ghi lại.
 *
 * Từ chối thành công mà trang có nạp adminlog.js thì logAdminAction() ghi
 * 1 bản ghi 'reject-post' (detail kèm lý do nếu có) vào aov_admin_log.
 *
 * @param {number|string} postId
 * @param {string} [reason] lý do từ chối, không bắt buộc.
 * @returns {boolean} true nếu đã ghi aov_posts; false nếu không đủ quyền, không
 *          tìm thấy bài hoặc lưu thất bại (dữ liệu giữ nguyên, không ghi dở dang).
 */
function rejectPost(postId, reason) {
    if (!isLoggedIn() || typeof isAdmin !== 'function' || !isAdmin()) return false;

    const id = normalizeId(postId);
    if (!id) return false;

    const posts = getPosts();
    const index = posts.findIndex((post) => normalizeId(post.id) === id);
    if (index === -1) return false;

    const cleanReason = String(reason || '').trim();

    const updated = Object.assign({}, posts[index], {
        status: POST_STATUS_REJECTED,
        reviewedBy: getCurrentUser(),
        reviewedAt: new Date().toISOString(),
    });

    if (cleanReason) updated.rejectReason = cleanReason;
    else delete updated.rejectReason;

    posts[index] = updated;

    if (!setPosts(posts)) return false;

    if (typeof logAdminAction === 'function') {
        const detail = cleanReason ? updated.title + ' — ' + cleanReason : updated.title;
        logAdminAction('reject-post', 'post', id, detail);
    }

    return true;
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

/* ---------- Thông báo kết quả duyệt cho tác giả (KD04-a, key aov_review_seen) ---------- */

/**
 * Mốc thời gian của một thông báo duyệt, dùng để sắp xếp và so sánh "đã xem".
 * Chuỗi ISO nên Date.parse xử lý được; giá trị thiếu/sai -> 0.
 * @param {string} value
 * @returns {number}
 */
function reviewNoticeTime(value) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? 0 : time;
}

/**
 * Đọc bảng "đã xem kết quả duyệt" từ aov_review_seen.
 * Dữ liệu LocalStorage hỏng / không đúng kiểu (không phải object, giá trị con
 * không phải chuỗi...) đều bị bỏ qua, luôn trả object sạch, không ném lỗi.
 * @returns {Object<string, Object<string, string>>}
 */
function getReviewSeenMap() {
    try {
        const stored = getStore(REVIEW_SEEN_KEY, {});
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};

        const out = {};
        Object.keys(stored).forEach((user) => {
            const per = stored[user];
            if (!per || typeof per !== 'object' || Array.isArray(per)) return;

            const clean = {};
            Object.keys(per).forEach((postId) => {
                const at = per[postId];
                if (typeof at === 'string') clean[normalizeId(postId)] = at;
            });
            out[user] = clean;
        });

        return out;
    } catch (error) {
        return {};
    }
}

/** Bảng "đã xem" riêng của một tài khoản (chưa có -> object rỗng). */
function getReviewSeenFor(username) {
    const name = String(username || '').trim();
    const all = getReviewSeenMap();
    const per = name ? all[name] : null;
    return per && typeof per === 'object' ? per : {};
}

/**
 * Danh sách thông báo kết quả duyệt của người đang đăng nhập, mới nhất trước.
 * Mỗi mục: { postId, title, status, reason, at, flagged?, seen }.
 * Quy tắc (bài bị admin ẩn luôn bỏ qua):
 *   - rejected : thông báo bị từ chối, kèm lý do (nếu có); seen theo aov_review_seen;
 *   - approved : chỉ khi có reviewedAt VÀ reviewedBy khác chính tác giả (loại bài tự
 *                động duyệt / bài cũ chưa từng qua duyệt); seen theo aov_review_seen;
 *   - pending  : thông tin "đang chờ duyệt", luôn coi đã xem (không tính chưa xem).
 * Chưa đăng nhập / lỗi bất kỳ -> []. Trả bản sao mới của từng mục.
 * @returns {Array<object>}
 */
function getMyReviewNotices() {
    try {
        if (typeof isLoggedIn !== 'function' || !isLoggedIn()) return [];

        const username = String(getCurrentUser() || '').trim();
        if (!username) return [];

        const seen = getReviewSeenFor(username);
        const notices = [];

        getPostsByUser(username).forEach((post) => {
            if (isPostHidden(post)) return;

            const status = getPostStatus(post);
            const postId = normalizeId(post.id);

            if (status === POST_STATUS_REJECTED) {
                const at = post.reviewedAt || post.updatedAt || post.createdAt || '';
                notices.push({
                    postId: post.id,
                    title: post.title,
                    status: POST_STATUS_REJECTED,
                    reason: typeof post.rejectReason === 'string' ? post.rejectReason : '',
                    at,
                    seen: seen[postId] === String(at),
                });
                return;
            }

            if (status === POST_STATUS_APPROVED) {
                // Bỏ qua bài cũ chưa từng qua duyệt và bài tự động duyệt (reviewedBy là chính tác giả).
                if (!post.reviewedAt) return;
                if (!post.reviewedBy) return;
                if (String(post.reviewedBy).trim() === username) return;

                notices.push({
                    postId: post.id,
                    title: post.title,
                    status: POST_STATUS_APPROVED,
                    reason: '',
                    at: post.reviewedAt,
                    seen: seen[postId] === String(post.reviewedAt),
                });
                return;
            }

            if (status === POST_STATUS_PENDING) {
                notices.push({
                    postId: post.id,
                    title: post.title,
                    status: POST_STATUS_PENDING,
                    reason: '',
                    at: post.createdAt || post.updatedAt || '',
                    flagged: Boolean(post.flagged),
                    seen: true,
                });
            }
        });

        return notices
            .sort((a, b) => reviewNoticeTime(b.at) - reviewNoticeTime(a.at))
            .map((notice) => Object.assign({}, notice));
    } catch (error) {
        return [];
    }
}

/** Số thông báo approved/rejected CHƯA xem của người đang đăng nhập; chưa đăng nhập -> 0. */
function countUnseenReviewNotices() {
    try {
        if (typeof isLoggedIn !== 'function' || !isLoggedIn()) return 0;

        return getMyReviewNotices().filter((notice) => (
            (notice.status === POST_STATUS_APPROVED || notice.status === POST_STATUS_REJECTED)
            && notice.seen === false
        )).length;
    } catch (error) {
        return 0;
    }
}

/**
 * Đánh dấu "đã xem" cho người ĐANG đăng nhập (không nhận username từ ngoài).
 * postIds: mảng id cần đánh dấu; bỏ trống / không phải mảng / mảng rỗng = tất cả
 * thông báo approved/rejected hiện có. Chỉ ghi lại đúng mốc reviewedAt đang có nên
 * lần admin duyệt/từ chối sau (reviewedAt mới) sẽ trở thành chưa xem trở lại.
 * @param {Array<number|string>} [postIds]
 * @returns {boolean} true nếu đã ghi aov_review_seen.
 */
function markReviewNoticesSeen(postIds) {
    try {
        if (typeof isLoggedIn !== 'function' || !isLoggedIn()) return false;

        const username = String(getCurrentUser() || '').trim();
        if (!username) return false;

        const wanted = Array.isArray(postIds) && postIds.length
            ? new Set(postIds.map(normalizeId))
            : null;

        const map = getReviewSeenMap();
        const per = map[username] && typeof map[username] === 'object' ? map[username] : {};

        getMyReviewNotices()
            .filter((notice) => notice.status === POST_STATUS_APPROVED || notice.status === POST_STATUS_REJECTED)
            .forEach((notice) => {
                const postId = normalizeId(notice.postId);
                if (wanted && !wanted.has(postId)) return;
                per[postId] = String(notice.at);
            });

        map[username] = per;
        return setStore(REVIEW_SEEN_KEY, map);
    } catch (error) {
        return false;
    }
}

/** Thông báo duyệt của một bài (nếu có) cho người đang đăng nhập, dùng cho giao diện. */
function findMyReviewNotice(postId) {
    try {
        const id = normalizeId(postId);
        if (!id) return null;

        return getMyReviewNotices().find((notice) => normalizeId(notice.postId) === id) || null;
    } catch (error) {
        return null;
    }
}

/**
 * Gửi lại bài đã bị từ chối để admin duyệt lại (KD04-a).
 *
 * Chỉ tác giả (canEditPost) và chỉ khi bài đang "rejected"; tài khoản bị khóa hoặc
 * bài không tồn tại -> null. Giới hạn tối đa RESUBMIT_MAX lần gửi lại mỗi bài
 * (trường resubmitCount); vượt giới hạn -> null kèm lastModerationNotice 'danger'
 * (tác giả phải sửa nội dung rồi lưu qua updatePost, không tính vào giới hạn này).
 *
 * Kiểm tra lại từ cấm trên nội dung hiện tại: mức 2/3 ('block'/'severe') -> null,
 * KHÔNG phạt tài khoản, KHÔNG sửa bài; mức 1 ('review') -> vẫn gửi và giữ/đặt
 * flagged:true.
 *
 * Thành công: status -> 'pending', xoá rejectReason, ghi resubmittedAt + tăng
 * resubmitCount, lưu lastRejectReason (lý do lần từ chối trước, tối đa 200 ký tự);
 * giữ nguyên id/createdAt/nội dung.
 *
 * @param {number|string} postId
 * @returns {object|null} bài sau khi gửi lại, null nếu không hợp lệ/chưa đủ điều kiện.
 */
function resubmitPost(postId) {
    try {
        // Thông báo cũ không được lẫn sang lần gửi này (UI đọc sau khi trả null).
        clearLastModerationNotice();

        if (isCurrentUserBanned()) return null;

        const id = normalizeId(postId);
        if (!id) return null;

        const posts = getPosts();
        const index = posts.findIndex((post) => normalizeId(post.id) === id);
        if (index === -1) return null;

        const current = posts[index];

        if (!canEditPost(current)) return null;
        if (getPostStatus(current) !== POST_STATUS_REJECTED) return null;

        const count = Number.isFinite(Number(current.resubmitCount)) ? Number(current.resubmitCount) : 0;

        if (count >= RESUBMIT_MAX) {
            setLastModerationNotice({
                type: 'danger',
                title: 'Không thể gửi lại',
                message: 'Bài này đã được gửi lại tối đa 3 lần. Hãy sửa nội dung rồi lưu để gửi duyệt.',
                words: [],
                level: 0,
                label: '',
            });
            return null;
        }

        const moderation = moderateContent([current.title, current.content], 'post');

        // Mức 2/3: chặn, không sửa bài, KHÔNG phạt tài khoản ở bước gửi lại.
        if (moderation.action === 'block' || moderation.action === 'severe') {
            setLastModerationNotice(buildModerationNotice(moderation, null, 'post'));
            return null;
        }

        const updated = Object.assign({}, current, {
            status: POST_STATUS_PENDING,
            resubmittedAt: new Date().toISOString(),
            resubmitCount: count + 1,
        });

        // Lưu lại lý do lần từ chối trước để tác giả/admin còn đối chiếu.
        if (typeof current.rejectReason === 'string' && current.rejectReason.trim()) {
            updated.lastRejectReason = current.rejectReason.trim().slice(0, LAST_REJECT_REASON_MAX);
        }

        delete updated.rejectReason;

        // Mức 1: vẫn gửi nhưng gắn cờ cho admin chú ý.
        if (moderation.action === 'review') updated.flagged = true;

        posts[index] = updated;

        if (!setPosts(posts)) return null;

        return updated;
    } catch (error) {
        return null;
    }
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
 *         (bài ẩn, bài chờ duyệt / bị từ chối của người khác), hoặc tài khoản bị khóa
 *         (KD09) không thích được — chặn cả khi gọi thẳng từ console.
 */
function toggleLike(postId) {
    if (isCurrentUserBanned()) return false;

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
 *         chặn cả khi gọi thẳng từ console), tài khoản bị khóa (KD09) không bình luận
 *         được, nội dung bị kiểm duyệt chặn (KD07-d) hoặc lưu thất bại.
 *         Bình luận có từ cần xem xét VẪN được tạo nhưng gắn flagged:true và ghi
 *         một mục aov_mod_alerts kind 'comment' cho admin.
 */
function addComment(postId, content) {
    if (isCurrentUserBanned()) return null;

    // Thông báo cũ không được lẫn sang lần gửi này (giao diện đọc sau khi trả null).
    clearLastModerationNotice();

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

    const moderation = applyModeration([text], 'comment');

    // Bị chặn: không tạo bình luận; lastModerationNotice còn để giao diện hiển thị.
    if (moderation.blocked) {
        addModAlert(buildModAlertData(moderation, 'comment', id, text));
        return null;
    }

    const comments = getComments();
    const comment = {
        id: nextFeedId(comments.map((row) => row.id)),
        postId: toStorageId(id),
        author,
        content: text,
        createdAt: new Date().toISOString(),
    };

    // Bình luận vẫn hiển thị bình thường cho mọi người; cờ chỉ để admin xử lý sau.
    if (moderation.review) comment.flagged = true;

    comments.push(comment);

    if (!setComments(comments)) return null;

    if (moderation.review) {
        const alertData = buildModAlertData(moderation, 'comment', id, text);
        alertData.commentId = comment.id;
        addModAlert(alertData);
    }

    return comment;
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

    // Tài khoản bị khóa (KD09): chỉ hiện thông báo, không vẽ form, không có link đăng nhập.
    if (isCurrentUserBanned()) {
        box.innerHTML = `
            <div class="feed-form feed-form--guest">
                <p>${escapeHtml(getBannedNoticeText())}</p>
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
                // Lỗi kiểm duyệt (KD07-d) có lastModerationNotice -> hiện đúng thông báo
                // đó; còn lỗi quyền/lưu thì giữ câu báo cáo cũ. Không xoá chữ đã gõ.
                const notice = getLastModerationNotice();
                const noticeHtml = notice && notice.type !== 'ok' ? moderationNoticeHtml(notice) : '';
                if (noticeHtml) {
                    errorBox.innerHTML = noticeHtml;
                } else {
                    renderErrors(errorBox, ['Không lưu được bài viết. Bạn chỉ có thể sửa bài của chính mình.']);
                }

                // Vừa bị tự động khóa -> vẽ lại form ở trạng thái "tài khoản bị khóa" (KD09).
                if (isCurrentUserBanned()) renderPostForm(null, box);
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

            // Bài sửa có từ cần xem xét -> hiện thêm thông báo 'info' (KD07-d).
            const editNotice = getLastModerationNotice();
            if (editNotice && editNotice.type === 'info') {
                updatedForm.querySelector('#post-errors').insertAdjacentHTML(
                    'beforeend',
                    moderationNoticeHtml(editNotice),
                );
            }

            rerenderFeedView(updated.id);
            if (typeof renderProfilePosts === 'function') renderProfilePosts();

            return;
        }

        const newPost = createPost(title, content, heroId, category);
        if (!newPost) {
            // Bị kiểm duyệt chặn (KD07-d) -> hiện thông báo vi phạm thay vì câu chung chung;
            // giữ nguyên chữ trong ô để người dùng sửa lại.
            const notice = getLastModerationNotice();
            const noticeHtml = notice && notice.type !== 'ok' ? moderationNoticeHtml(notice) : '';
            if (noticeHtml) {
                errorBox.innerHTML = noticeHtml;
            } else {
                renderErrors(errorBox, ['Không lưu được bài viết. Hãy thử lại hoặc kiểm tra dung lượng trình duyệt.']);
            }

            // Vừa bị tự động khóa -> vẽ lại form ở trạng thái "tài khoản bị khóa" (KD09).
            if (isCurrentUserBanned()) renderPostForm(null, box);
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

        // Bài đăng nhưng có từ cần xem xét -> hiện thêm thông báo 'info' (KD07-d).
        const notice = getLastModerationNotice();
        if (notice && notice.type === 'info') {
            form.querySelector('#post-errors').insertAdjacentHTML('beforeend', moderationNoticeHtml(notice));
        }

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
 * Các bài viết đang hiển thị của một tướng, mới nhất trước.
 *
 * Dùng đúng nguồn dữ liệu của Feed (getPosts() -> aov_posts, đã gộp posts.json
 * và bản nháp LocalStorage) và đúng hàm kiểm soát hiển thị isPostVisibleForViewer().
 * Nhờ vậy bài bị ẩn, bài chờ duyệt hoặc bài bị từ chối không lọt ra chỉ vì có
 * cùng heroId; tác giả vẫn thấy bài của mình theo quy tắc sẵn có.
 *
 * Bỏ qua bài hỏng, bài không có heroId và bài có heroId không khớp.
 * So khớp qua normalizeId() để "1" trên URL và 1 trong dữ liệu là một.
 *
 * @param {number|string} heroId id tướng đang xem.
 * @returns {Array} bài viết của tướng, mới nhất trước.
 */
function getPostsByHero(heroId) {
    const wanted = normalizeId(heroId);
    if (!wanted) return [];

    // createdAt là chuỗi ISO nên dùng Date.parse để xử lý được giá trị thiếu.
    const timeOf = (post) => {
        const time = Date.parse(post.createdAt);
        return Number.isNaN(time) ? 0 : time;
    };

    return getPosts()
        .filter((post) => {
            if (!post || post.heroId === undefined || post.heroId === null) return false;
            if (String(post.heroId).trim() === '') return false;
            if (normalizeId(post.heroId) !== wanted) return false;

            return isPostVisibleForViewer(post);
        })
        .sort((a, b) => timeOf(b) - timeOf(a));
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

/**
 * Khối thông báo kết quả duyệt ngay trên thẻ bài/trang chi tiết (KD04-a).
 * CHỈ gọi khi người xem là tác giả (canEditPost(post) === true). Trả '' khi
 * không áp dụng:
 *   - rejected : "Bài viết chưa được duyệt." + lý do (nếu có) + gợi ý sửa/gửi lại;
 *   - pending  : nhắc đang chờ duyệt, thêm "(có nội dung cần xem xét)" nếu flagged;
 *   - approved : chỉ khi đã qua duyệt (reviewedBy khác tác giả) và tác giả CHƯA xem.
 * KHÔNG nêu từ cấm. Mọi chuỗi đưa vào HTML đều qua escapeHtml().
 * @param {object} post
 * @returns {string}
 */
function renderPostReviewNote(post) {
    try {
        const status = getPostStatus(post);

        if (status === POST_STATUS_REJECTED) {
            const reason = typeof post.rejectReason === 'string' ? post.rejectReason : '';
            return `
                <div class="post-review-note post-review-note--rejected">
                    <p><strong>Bài viết chưa được duyệt.</strong></p>
                    ${reason ? `<p>Lý do: ${escapeHtml(reason)}</p>` : ''}
                    <p>Bạn có thể sửa bài rồi lưu, hoặc gửi lại nếu thấy không cần sửa.</p>
                </div>
            `;
        }

        if (status === POST_STATUS_PENDING) {
            const reviewHint = post.flagged ? ' (có nội dung cần xem xét)' : '';
            return `<div class="post-review-note post-review-note--pending">Bài đang chờ quản trị viên duyệt.${reviewHint}</div>`;
        }

        if (status === POST_STATUS_APPROVED) {
            const notice = findMyReviewNotice(post.id);
            if (notice && notice.status === POST_STATUS_APPROVED && notice.seen === false) {
                return '<div class="post-review-note post-review-note--approved">Bài của bạn đã được duyệt.</div>';
            }
        }

        return '';
    } catch (error) {
        return '';
    }
}

/**
 * Nút "Gửi lại duyệt" cho bài bị từ chối (chỉ tác giả thấy, nằm cạnh nút Sửa).
 * Đã gửi lại đủ RESUBMIT_MAX lần thì ẩn nút, chỉ còn câu nhắc sửa bài. Trả ''
 * cho bài không bị từ chối.
 * @param {object} post
 * @returns {string}
 */
function renderPostResubmitAction(post) {
    try {
        if (getPostStatus(post) !== POST_STATUS_REJECTED) return '';

        const count = Number.isFinite(Number(post.resubmitCount)) ? Number(post.resubmitCount) : 0;
        if (count >= RESUBMIT_MAX) {
            return ' <span class="post-card__resubmit-note">Đã gửi lại tối đa 3 lần, hãy sửa bài.</span>';
        }

        return ` <button type="button" class="post-card__resubmit" data-post-resubmit="${escapeHtml(post.id)}">Gửi lại duyệt</button>`;
    } catch (error) {
        return '';
    }
}

/**
 * Hiện thông báo gửi lại thất bại ngay trong thẻ bài, dưới khối post-review-note.
 * Tạo (hoặc tái sử dụng) phần tử [data-post-notice]; dùng class thông báo có sẵn
 * của trang (form-errors / form-success) nên không cần CSS mới. Không có
 * lastModerationNotice thì hiện câu "Chưa gửi lại được bài viết.".
 * @param {Element} btn nút [data-post-resubmit] vừa bấm
 * @param {number|string} postId
 */
function showPostResubmitNotice(btn, postId) {
    try {
        const card = btn && typeof btn.closest === 'function' ? btn.closest('[data-post-id]') : null;
        const host = card || (typeof document !== 'undefined' ? document.getElementById('post-detail') : null);
        if (!host || typeof host.querySelector !== 'function') return;

        const html = moderationNoticeHtml(getLastModerationNotice())
            || '<ul class="form-errors"><li>Chưa gửi lại được bài viết.</li></ul>';

        const existing = host.querySelector('[data-post-notice]');
        if (existing) {
            existing.innerHTML = html;
            return;
        }

        if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;

        const box = document.createElement('div');
        box.setAttribute('data-post-notice', '');
        // DOM rút gọn của bộ test không tự đồng bộ dataset khi setAttribute().
        if (box.dataset) box.dataset.postNotice = '';
        box.innerHTML = html;

        // Chèn ngay sau khối post-review-note (nếu có) trong cùng một node cha.
        const note = host.querySelector('.post-review-note');
        const parent = note && note.parent ? note.parent : null;

        if (note && parent && Array.isArray(parent.children)) {
            const index = parent.children.indexOf(note);
            box.parent = parent;
            parent.children.splice(index + 1, 0, box);
            return;
        }

        appendModerationChild(host, box);
    } catch (error) {
        // Thông báo chỉ là phần phụ, không được làm hỏng luồng gửi lại.
    }
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

    // Thông báo duyệt + nút gửi lại CHỈ dành cho tác giả (KD04-a).
    const reviewNote = canEdit ? renderPostReviewNote(post) : '';
    const resubmitAction = canEdit ? renderPostResubmitAction(post) : '';

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
                    ${resubmitAction}
                    ${canDelete ? `<button type="button" class="post-card__delete" data-post-delete="${escapeHtml(post.id)}">Xoá bài</button>` : ''}
                </div>
            </header>

            ${reviewNote}

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

            ${isLoggedIn() && !isCurrentUserBanned() ? `
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
    const canEdit = canEditPost(post);

    // Thông báo duyệt + nút gửi lại CHỈ dành cho tác giả (KD04-a).
    const reviewNote = canEdit ? renderPostReviewNote(post) : '';
    const resubmitAction = canEdit ? renderPostResubmitAction(post) : '';

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

            ${reviewNote}

            <div class="post-detail__content">${escapeHtml(post.content)}</div>

            <div class="post-detail__actions">
                <button type="button"
                    class="post-action ${liked ? 'is-active' : ''}"
                    data-post-like="${escapeHtml(post.id)}"
                    aria-pressed="${liked ? 'true' : 'false'}">
                    ♥ Thích (${likeUsers.length})
                </button>
                <span class="post-action">💬 ${comments.length} bình luận</span>
                ${canEdit ? `<button type="button" class="post-card__edit" data-post-edit="${escapeHtml(post.id)}">Sửa bài</button>` : ''}
                ${resubmitAction}
                ${canDelete ? `<button type="button" class="post-card__delete" data-post-delete="${escapeHtml(post.id)}">Xoá bài</button>` : ''}
            </div>

            <section class="post-detail__comments">
                <h2>Bình luận (${comments.length})</h2>
                <ul class="comment-list">${commentsHtml || '<li class="comment-list__empty">Chưa có bình luận nào.</li>'}</ul>

                ${isLoggedIn() && isCurrentUserBanned() ? `
                    <p class="post-detail__guest-note">${escapeHtml(getBannedNoticeText())}</p>
                ` : isLoggedIn() ? `
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

    const resubmitBtn = event.target.closest('[data-post-resubmit]');
    if (resubmitBtn) {
        // resubmitPost() tự kiểm tra lại quyền + trạng thái + từ cấm ở tầng dữ liệu.
        const result = resubmitPost(resubmitBtn.dataset.postResubmit);

        if (result) {
            rerenderFeedView(result.id);
            if (typeof renderProfilePosts === 'function') renderProfilePosts();
            return;
        }

        // Thất bại: hiện thông báo ngay trong thẻ bài đó, KHÔNG dùng alert/confirm.
        showPostResubmitNotice(resubmitBtn, resubmitBtn.dataset.postResubmit);
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

    if (!content) return;

    const comment = addComment(postId, content);

    if (!comment) {
        // Bị kiểm duyệt chặn (KD07-d): hiện thông báo ngay dưới ô nhập của CHÍNH form
        // này và giữ nguyên chữ người dùng đã gõ để họ sửa lại.
        const notice = getLastModerationNotice();
        if (notice && notice.type !== 'ok') showCommentNotice(form, notice);

        // Vừa bị tự động khóa (KD09) -> vẽ lại để form chuyển sang trạng thái bị khóa.
        if (isCurrentUserBanned()) rerenderFeedView(postId);
        return;
    }

    clearCommentNotice(form);

    // Bình luận có từ cần xem xét vẫn được đăng; hiện thêm notice 'info' ngắn
    // trên form vừa vẽ lại (tự mất ở lần render tiếp theo).
    const notice = getLastModerationNotice();
    const infoNotice = notice && notice.type === 'info' ? notice : null;

    input.value = '';
    rerenderFeedView(postId);
    if (typeof renderProfilePosts === 'function') renderProfilePosts();

    if (infoNotice) {
        showCommentNotice(document.querySelector(`[data-comment-form="${postId}"]`), infoNotice);
    }
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
