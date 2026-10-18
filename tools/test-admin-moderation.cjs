/**
 * test-admin-moderation.cjs - TEST-b: kiểm duyệt nội dung (KD04, KD07, KD09)
 * và mục "Từ ngữ cấm và vi phạm" trong tab "Cài đặt" của trang Quản trị.
 *
 * 11 nhóm (35 check):
 *   1. classifyContent()            - search.js: 4 mức từ cấm + cách so khớp dấu
 *   2. aov_mod_settings             - feed.js: mặc định, LocalStorage ghi tay sai, chỉ admin ghi
 *   3. getBannedEntries()           - từ admin thêm + mục mức 0 gỡ từ mẫu
 *   4. createPost()                 - duyệt trước khi đăng, cờ cần xem xét, chặn mức 2/3
 *   5. Thông báo kiểm duyệt         - buildModerationNotice KHÔNG nêu từ vi phạm; aov_mod_alerts trần 200
 *   6. recordViolation()            - auth.js: 3 vi phạm mức 2 hoặc 2 vi phạm mức 3 -> tự khóa
 *   7. addComment()                 - bình luận mức 1 giữ + gắn cờ, mức 2/3 bị chặn
 *   8. KD09                         - banUser/unbanUser/warnUser: chỉ admin, không tự khóa, không khóa admin
 *   9. KD04                         - approvePost/rejectPost -> getMyReviewNotices + aov_review_seen
 *  10. resubmitPost()               - gửi lại bài bị từ chối, giữ lý do cũ, chặn ở lần thứ 4, không phạt lại
 *  11. admin.html?tab=settings      - admin-banned.js: thêm từ qua form, bảng hiện từ đã escape HTML
 *
 * Cách chạy (hermetic, không sửa mã dự án):
 *   node tools/test-admin-moderation.cjs
 *
 *   - tools/mini-dom.cjs nạp TRANG THẬT + script THẬT; localStorage là Map mô phỏng,
 *     mỗi lần mở trang một Map riêng -> 11 nhóm độc lập, không ghi vào src/data/*.json.
 *   - admin-banned.js do admin-shell.js chèn <script> động (mini-dom không chạy script
 *     chèn động) nên test chạy thẳng mã nguồn vào ngữ cảnh trang rồi gọi lại
 *     renderAdminTabSections() - đúng cách test-admin-pending.cjs / test-build-submit.cjs làm.
 *   - Tên tài khoản lấy từ src/data/users.json thật (admin / aovfan / demo).
 *
 * KHÔNG sửa src/js/*, KHÔNG sửa mini-dom.cjs: thiếu method DOM nào thì tự bù ngay
 * trong test (enableDomCore / augmentTree), giống TEST-a.
 */
const fs = require('fs');
const path = require('path');

const { ROOT, loadPage, makeNode, fire } = require('./mini-dom.cjs');

const FEED_PAGE = 'src/pages/feed.html';
const ADMIN_PAGE = 'src/pages/admin.html';

const ADMIN_USER = 'admin';
const USER_USER = 'aovfan';
const OTHER_USER = 'demo';

const ADMIN_BANNED_SRC = fs.readFileSync(path.join(ROOT, 'src/js/admin-banned.js'), 'utf8');
const USERS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/users.json'), 'utf8'));

// Tên dùng trong test phải có thật trong src/data/users.json.
[ADMIN_USER, USER_USER, OTHER_USER].forEach((name) => {
    if (!USERS_JSON.some((user) => user.username === name)) {
        throw new Error('Tài khoản "' + name + '" không có trong src/data/users.json');
    }
});

/* ================= Trợ giúp chạy test ================= */

let passed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) {
        passed++;
        console.log('  PASS  ' + name);
        return;
    }

    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log('  FAIL  ' + name + (detail ? '\n        ' + detail : ''));
}

function section(title) {
    console.log('\n== ' + title + ' ==');
}

/**
 * Chạy một biểu thức trong ngữ cảnh trang và trả kết quả đã JSON hóa.
 * Biểu thức phải là MỘT biểu thức (nhiều lệnh thì bọc IIFE).
 * Lỗi phía trang trả về { __error } để check() báo fail thay vì làm sập cả test.
 */
function callPage(page, expr) {
    try {
        const raw = page.runInPage('JSON.stringify(' + expr + ')');
        if (typeof raw !== 'string') return { __error: 'kết quả không phải chuỗi JSON: ' + String(raw) };
        return JSON.parse(raw);
    } catch (error) {
        return { __error: String((error && error.message) || error) };
    }
}

/** Đổi tài khoản đang đăng nhập giữa chừng (vẫn đọc danh sách tài khoản của trang). */
function setUser(page, username) {
    page.ctx.localStorage.setItem('aov_current_user', String(username));
}

/** Lỗi JS thật (bỏ qua console.error - kênh ghi lỗi của dự án). */
function jsErrors(page) {
    return page.errors.filter((error) => !error.startsWith('console.error'));
}

/* ================= Bù method DOM còn thiếu trong mini-dom ================= */

/**
 * Gắn method DOM tối thiểu (appendChild/removeChild/remove/style/options) lên node.
 * Kèm bọc try/catch cho matches(): matchesParts() của mini-dom đọc current.parent
 * khi current đã null (selector tổ tiên không khớp) -> tránh ném lỗi làm sập test.
 */
function augment(node) {
    if (!node || node.__augmented) return node;
    node.__augmented = true;

    if (!node.style) node.style = {};

    const originalMatches = node.matches;
    node.matches = function (selector) {
        try {
            return originalMatches.call(this, selector);
        } catch (error) {
            return false;
        }
    };

    node.appendChild = function (child) {
        child.parent = node;
        node.children.push(child);
        return child;
    };
    node.removeChild = function (child) {
        node.children = node.children.filter((entry) => entry !== child);
        return child;
    };
    node.remove = function () {
        if (node.parent) node.parent.children = node.parent.children.filter((entry) => entry !== node);
        node.__detached = true;
    };

    if (!('options' in node)) {
        Object.defineProperty(node, 'options', {
            get() { return node.querySelectorAll('option'); },
        });
    }

    return node;
}

/** Bù method đệ quy cho cây do admin-shell dựng bằng innerHTML. */
function augmentTree(root) {
    if (!root || typeof root !== 'object') return;
    augment(root);
    if (!Array.isArray(root.children)) return;
    root.children.forEach(augmentTree);
}

/** Bù method cho node trang lấy qua document (KHÔNG đụng document.body). */
function enableDomCore(page) {
    const doc = page.ctx.document;
    const byId = doc.getElementById.bind(doc);
    const queryAll = doc.querySelectorAll.bind(doc);
    const queryOne = doc.querySelector.bind(doc);

    doc.getElementById = (id) => augment(byId(id));
    doc.querySelectorAll = (selector) => queryAll(selector).map(augment);
    doc.querySelector = (selector) => augment(queryOne(selector));
    doc.createElement = (tag) => augment(makeNode(tag === undefined ? 'div' : String(tag).toLowerCase()));
}

/* ================= Mở trang ================= */

async function openFeed(options) {
    const page = loadPage(Object.assign({ page: FEED_PAGE }, options || {}));
    page.run();
    await page.settled();
    await page.settled();
    return page;
}

/** Mở admin.html?tab=settings như admin rồi vẽ mục "Từ ngữ cấm và vi phạm". */
async function openAdminSettings() {
    const page = loadPage({
        page: ADMIN_PAGE,
        search: '?tab=settings',
        login: ADMIN_USER,
        storage: new Map(),
    });

    enableDomCore(page);
    page.run();
    await page.settled();
    await page.settled();

    // admin-shell.js chèn <script admin-banned.js> động -> mini-dom bỏ qua; nạp thẳng mã.
    page.runInPage(ADMIN_BANNED_SRC);
    await page.runInPage("renderAdminTabSections(document.getElementById('admin-panel'), 'settings')");
    await page.settled();

    // Cây mục dựng bằng innerHTML nên chưa được bù method; bù ngay để truy vấn an toàn.
    augmentTree(page.el('admin-panel'));

    return page;
}

/** Thân mục "Từ ngữ cấm và vi phạm" trong tab Cài đặt. */
function settingsBody(page) {
    const panel = page.el('admin-panel');
    if (!panel) return null;
    return panel.querySelector('[data-admin-section="moderation-manager"] .admin-section__body');
}

/* ================= Test ================= */

(async () => {
    /* ---------- 1. classifyContent ---------- */
    section('1. classifyContent - 4 mức từ cấm (search.js)');

    const g1 = await openFeed({ storage: new Map() });
    const classify = (text) => callPage(g1, 'classifyContent(' + JSON.stringify(text) + ', getDefaultBannedEntries())');

    const clean1 = classify('Mình chia sẻ cách lên đồ Violet trong trận này.');
    check('văn bản sạch -> mức 0, hành động "ok"',
        clean1.level === 0 && clean1.action === 'ok',
        JSON.stringify(clean1));

    const review1 = classify('Bài viết này đồ rác quá.');
    check('từ mức 1 (đồ rác) -> mức 1, hành động "review"',
        review1.level === 1 && review1.action === 'review',
        JSON.stringify(review1));

    const block1 = classify('Thằng này ngu lắm.');
    const severe1 = classify('Tao giết mày ngay bây giờ.');
    check('từ mức 2 (ngu) -> "block" và từ mức 3 (giết mày) -> "severe"',
        block1.level === 2 && block1.action === 'block'
        && severe1.level === 3 && severe1.action === 'severe',
        'block=' + JSON.stringify(block1) + ' severe=' + JSON.stringify(severe1));

    const offExact = classify('Nói chuyện với con đĩ kia.');
    const offFolded = classify('Noi chuyen voi con di kia.');
    const reviewExact = classify('Đéo gì đâu.');
    const reviewFolded = classify('Deo gi dau.');
    check('so khớp dấu: fold "off" chỉ bắt đúng dấu, fold "review" hạ xuống mức 1 khi thiếu dấu',
        offExact.level === 2 && offFolded.level === 0
        && reviewExact.level === 2 && reviewFolded.level === 1,
        'offExact=' + offExact.level + ' offFolded=' + offFolded.level
        + ' reviewExact=' + reviewExact.level + ' reviewFolded=' + reviewFolded.level);

    /* ---------- 2. aov_mod_settings ---------- */
    section('2. Cấu hình aov_mod_settings (feed.js)');

    const g2 = await openFeed({ login: ADMIN_USER, storage: new Map() });
    const defaults = callPage(g2, 'getModSettings()');
    check('mặc định: bật duyệt trước, danh sách từ rỗng, ngưỡng 5',
        defaults.requireApproval === true
        && Array.isArray(defaults.bannedWords) && defaults.bannedWords.length === 0
        && defaults.autoHideThreshold === 5,
        JSON.stringify(defaults));

    const g2b = await openFeed({
        storage: new Map([['aov_mod_settings', JSON.stringify({
            requireApproval: 'yes',
            bannedWords: 'hàng rào',
            autoHideThreshold: 'nhiều',
        })]]),
    });
    const broken = callPage(g2b, 'getModSettings()');
    check('LocalStorage bị ghi tay sai kiểu dữ liệu -> vẫn rơi về mặc định',
        broken.requireApproval === true
        && Array.isArray(broken.bannedWords) && broken.bannedWords.length === 0
        && broken.autoHideThreshold === 5,
        JSON.stringify(broken));

    const g2c = await openFeed({ login: USER_USER, storage: new Map() });
    const asUser = callPage(g2c, 'setModSettings({ requireApproval: false })');
    const afterUserWrite = g2c.readKey('aov_mod_settings');
    setUser(g2c, ADMIN_USER);
    const asAdmin = callPage(g2c,
        'setModSettings({ requireApproval: false, toTruong: "x", bannedWords: "không phải mảng" })');
    const saved = g2c.readKey('aov_mod_settings');
    check('chỉ admin ghi được; patch lạ bị bỏ qua (đúng 3 trường)',
        asUser === false && afterUserWrite === null
        && asAdmin === true
        && saved && saved.requireApproval === false
        && Array.isArray(saved.bannedWords) && saved.bannedWords.length === 0
        && Object.keys(saved).length === 3 && !('toTruong' in saved),
        'user=' + JSON.stringify(asUser) + ' sau khi user ghi=' + JSON.stringify(afterUserWrite)
        + ' admin=' + JSON.stringify(asAdmin) + ' saved=' + JSON.stringify(saved));

    /* ---------- 3. Danh sách từ cấm hiệu lực ---------- */
    section('3. getBannedEntries - từ admin thêm và mục mức 0');

    // moderateContent BỎ QUA khi người đăng nhập là admin (feed.js) -> đổi sang
    // tài khoản thường trước khi đo, admin chỉ dùng để ghi cấu hình.
    const g3 = await openFeed({ login: ADMIN_USER, storage: new Map() });
    callPage(g3, 'setModSettings({ bannedWords: ["từ cấm riêng của admin"] })');
    setUser(g3, USER_USER);
    const entries3 = callPage(g3, 'getBannedEntries().map(function (entry) { return entry.word; })');
    const hit3 = callPage(g3,
        "moderateContent('bài này có từ cấm riêng của admin ở giữa', 'post')");
    check('từ admin thêm vào có hiệu lực với getBannedEntries lẫn moderateContent',
        Array.isArray(entries3) && entries3.indexOf('từ cấm riêng của admin') !== -1
        && hit3.level === 2 && hit3.action === 'block'
        && hit3.words.indexOf('từ cấm riêng của admin') !== -1,
        'entries=' + JSON.stringify(entries3) + ' hit=' + JSON.stringify(hit3));

    setUser(g3, ADMIN_USER);
    callPage(g3, 'setModSettings({ bannedWords: [{ word: "ngu", level: 0 }] })');
    setUser(g3, USER_USER);
    const entries3b = callPage(g3, 'getBannedEntries().map(function (entry) { return entry.word; })');
    const hit3b = callPage(g3, "moderateContent('cái này ngu quá', 'post')");
    const hit3bStill = callPage(g3, "moderateContent('thằng ngu cái gì', 'post')");
    check('mục mức 0 gỡ đúng "ngu" (mất bắt lẻ) nhưng từ ghép "thằng ngu" vẫn bắt',
        Array.isArray(entries3b) && entries3b.indexOf('ngu') === -1
        && hit3b.level === 0 && hit3b.action === 'ok'
        && hit3bStill.level === 2,
        'entries=' + JSON.stringify(entries3b) + ' lẻ=' + JSON.stringify(hit3b)
        + ' ghép=' + JSON.stringify(hit3bStill));

    /* ---------- 4. createPost ---------- */
    section('4. createPost - duyệt trước khi đăng + kiểm duyệt nội dung');

    const g4 = await openFeed({ login: USER_USER, storage: new Map() });
    const pending4 = callPage(g4,
        "createPost('Tiêu đề bài viết kiểm thử', 'Nội dung bài viết hoàn toàn bình thường.', '', 'Mẹo chơi')");
    setUser(g4, ADMIN_USER);
    const byAdmin4 = callPage(g4,
        "createPost('Tiêu đề bài viết kiểm thử', 'Nội dung bài viết hoàn toàn bình thường.', '', 'Mẹo chơi')");
    setUser(g4, USER_USER);
    check('user thường + duyệt trước bật -> "pending"; admin đăng -> "approved" ngay',
        pending4 && pending4.status === 'pending'
        && byAdmin4 && byAdmin4.status === 'approved' && byAdmin4.reviewedBy === ADMIN_USER,
        'pending=' + JSON.stringify(pending4 && pending4.status)
        + ' admin=' + JSON.stringify(byAdmin4));

    const flagged4 = callPage(g4,
        "createPost('Bài viết có đồ rác ở đây', 'Nội dung bài viết có đồ rác ở giữa.', '', 'Thảo luận')");
    const alerts4a = g4.readKey('aov_mod_alerts') || [];
    check('mức 1 (cần xem xét) -> bài vẫn tạo nhưng "pending" + flagged + báo admin',
        flagged4 && flagged4.status === 'pending' && flagged4.flagged === true
        && alerts4a.length === 1 && alerts4a[0].action === 'review'
        && alerts4a[0].words.indexOf('đồ rác') !== -1,
        'post=' + JSON.stringify(flagged4) + ' alerts=' + JSON.stringify(alerts4a));

    const postsBefore4 = (g4.readKey('aov_posts') || []).length;
    const blocked42 = callPage(g4,
        "createPost('Tiêu đề bài viết kiểm thử', 'Nội dung có thằng ngu ở giữa bài.', '', 'Thảo luận')");
    const blocked43 = callPage(g4,
        "createPost('Tiêu đề bài viết kiểm thử', 'Tao giết mày ngay bây giờ.', '', 'Thảo luận')");
    const postsAfter4 = (g4.readKey('aov_posts') || []).length;
    const alerts4b = g4.readKey('aov_mod_alerts') || [];
    const blockAlert4 = alerts4b.find((entry) => entry.action === 'block');
    const severeAlert4 = alerts4b.find((entry) => entry.action === 'severe');
    const warnings4 = callPage(g4, "getUserWarnings('" + USER_USER + "').length");
    check('mức 2 và mức 3 -> chặn, không tạo bài, ghi alert đủ từ + cảnh cáo tài khoản',
        blocked42 === null && blocked43 === null && postsAfter4 === postsBefore4
        && blockAlert4 && blockAlert4.words.indexOf('ngu') !== -1
        && blockAlert4.excerpt.indexOf('thằng ngu') !== -1
        && severeAlert4 && severeAlert4.words.indexOf('giết mày') !== -1
        && warnings4 === 2,
        'blocked2=' + JSON.stringify(blocked42) + ' blocked3=' + JSON.stringify(blocked43)
        + ' posts ' + postsBefore4 + '->' + postsAfter4 + ' warnings=' + JSON.stringify(warnings4));

    /* ---------- 5. Thông báo kiểm duyệt ---------- */
    section('5. Thông báo cho người dùng + kho aov_mod_alerts');

    const notice5 = callPage(g4,
        "buildModerationNotice({ action: 'block', level: 2, label: 'Vi phạm', words: ['thằng ngu'] }, "
        + "{ counted: true, warningNumber: 2, remaining: 1, banned: false }, 'post')");
    check('thông báo người dùng KHÔNG nêu từ vi phạm nhưng vẫn nói số cảnh cáo còn lại',
        Array.isArray(notice5.words) && notice5.words.length === 0
        && (notice5.title + ' ' + notice5.message).indexOf('thằng ngu') === -1
        && notice5.type === 'danger'
        && notice5.message.indexOf('cảnh cáo thứ 2') !== -1
        && notice5.message.indexOf('Còn tối đa 1') !== -1,
        JSON.stringify(notice5));

    const g5 = await openFeed({ login: ADMIN_USER, storage: new Map() });
    callPage(g5, '(function () {'
        + ' for (var i = 0; i < 205; i++) {'
        + ' addModAlert({ kind: "post", targetId: i, action: "review", level: 1,'
        + ' label: "L" + i, words: ["w" + i], excerpt: "Trích đoạn " + i });'
        + ' } return true; })()');
    const alerts5 = g5.readKey('aov_mod_alerts') || [];
    const newest5 = callPage(g5, 'getModAlerts()[0].words[0]');
    setUser(g5, USER_USER);
    const alertsAsUser5 = callPage(g5, 'getModAlerts()');
    setUser(g5, ADMIN_USER);
    check('kho aov_mod_alerts giữ tối đa 200 mục mới nhất và chỉ admin đọc được',
        alerts5.length === 200 && newest5 === 'w204'
        && Array.isArray(alertsAsUser5) && alertsAsUser5.length === 0,
        'số mục=' + alerts5.length + ' mới nhất=' + JSON.stringify(newest5)
        + ' user đọc=' + JSON.stringify(alertsAsUser5));

    /* ---------- 6. recordViolation ---------- */
    section('6. recordViolation - tự khóa tài khoản (auth.js)');

    const g6 = await openFeed({ login: USER_USER, storage: new Map() });
    const first6 = callPage(g6, "recordViolation(2, { label: 'Vi phạm', words: ['thằng ngu'] })");
    check('vi phạm mức 2 lần đầu: tính vào hồ sơ, còn 2 lần nữa thì khóa',
        first6.counted === true && first6.strikesTotal === 1
        && first6.remaining === 2 && first6.banned === false,
        JSON.stringify(first6));

    callPage(g6, "recordViolation(2, {})");
    const third6 = callPage(g6, "recordViolation(2, {})");
    const user6 = (g6.readKey('aov_users') || []).find((u) => u.username === USER_USER) || {};
    check('đủ 3 vi phạm mức 2 -> tự khóa với bannedBy là "system"',
        third6.banned === true
        && user6.banned === true && user6.bannedBy === 'system'
        && callPage(g6, "isUserBanned('" + USER_USER + "')") === true,
        'kết quả=' + JSON.stringify(third6) + ' user=' + JSON.stringify(user6));

    const g6b = await openFeed({ login: USER_USER, storage: new Map() });
    const severe61 = callPage(g6b, 'recordViolation(3, {})');
    const severe62 = callPage(g6b, 'recordViolation(3, {})');
    check('2 vi phạm mức 3 (nghiêm trọng) -> tự khóa, không cần đủ 3 lần',
        severe61.banned === false && severe61.strikesSevere === 1
        && severe62.banned === true && severe62.strikesSevere === 2,
        'lần 1=' + JSON.stringify(severe61) + ' lần 2=' + JSON.stringify(severe62));

    const g6c = await openFeed({ login: ADMIN_USER, storage: new Map() });
    const adminViol6 = callPage(g6c, 'recordViolation(2, {})');
    const adminWarn6 = callPage(g6c, "getUserWarnings('" + ADMIN_USER + "').length");
    check('admin không bao giờ bị phạt bởi recordViolation',
        adminViol6.counted === false && adminViol6.banned === false && adminWarn6 === 0,
        JSON.stringify(adminViol6) + ' warnings=' + JSON.stringify(adminWarn6));

    /* ---------- 7. addComment ---------- */
    section('7. addComment - kiểm duyệt bình luận');

    const g7 = await openFeed({ login: ADMIN_USER, storage: new Map() });
    const target7 = callPage(g7,
        "createPost('Bài viết để bình luận kiểm thử', 'Nội dung bài viết hoàn toàn bình thường.', '', 'Thảo luận')");
    const postId7 = target7 && target7.id;
    setUser(g7, USER_USER);
    const cleanComment7 = callPage(g7, 'addComment(' + JSON.stringify(postId7) + ', "Bình luận hoàn toàn bình thường.")');
    const flaggedComment7 = callPage(g7, 'addComment(' + JSON.stringify(postId7) + ', "Bình luận này có đồ rác ở đây.")');
    const alerts7 = g7.readKey('aov_mod_alerts') || [];
    const alertComment7 = alerts7.find((entry) => entry.kind === 'comment');
    check('bình luận sạch tạo được; mức 1 vẫn tạo nhưng flagged + ghi alert kind "comment"',
        cleanComment7 && !cleanComment7.flagged
        && flaggedComment7 && flaggedComment7.flagged === true
        && alertComment7 && alertComment7.commentId === flaggedComment7.id
        && alertComment7.words.indexOf('đồ rác') !== -1,
        'sạch=' + JSON.stringify(cleanComment7) + ' mức 1=' + JSON.stringify(flaggedComment7)
        + ' alert=' + JSON.stringify(alertComment7));

    const commentsBefore7 = (g7.readKey('aov_comments') || []).length;
    const blocked72 = callPage(g7, 'addComment(' + JSON.stringify(postId7) + ', "Thằng này ngu quá.")');
    const blocked73 = callPage(g7, 'addComment(' + JSON.stringify(postId7) + ', "Tao giết mày ngay.")');
    const commentsAfter7 = (g7.readKey('aov_comments') || []).length;
    check('bình luận mức 2 và mức 3 bị chặn, aov_comments không đổi',
        blocked72 === null && blocked73 === null && commentsAfter7 === commentsBefore7,
        'mức 2=' + JSON.stringify(blocked72) + ' mức 3=' + JSON.stringify(blocked73)
        + ' comments ' + commentsBefore7 + '->' + commentsAfter7);

    /* ---------- 8. KD09 - khóa / mở khóa / cảnh cáo ---------- */
    section('8. KD09 - khóa tài khoản, mở khóa và cảnh cáo (auth.js)');

    const g8 = await openFeed({ login: ADMIN_USER, storage: new Map() });
    setUser(g8, OTHER_USER);
    const banByUser8 = callPage(g8, "banUser('" + ADMIN_USER + "', 'Thử nghiệm quyền')");
    setUser(g8, ADMIN_USER);
    const selfBan8 = callPage(g8, "banUser('" + ADMIN_USER + "', 'Thử tự khóa')");
    callPage(g8, '(function () { setUsers(getUsers().map(function (u) {'
        + ' return u.username === "' + OTHER_USER + '" ? Object.assign({}, u, { role: "admin" }) : u;'
        + '})); return true; })()');
    const banOtherAdmin8 = callPage(g8, "banUser('" + OTHER_USER + "', 'Thử khóa admin')");
    check('khách quyền: user thường không khóa được; admin không tự khóa mình hay khóa admin khác',
        banByUser8 === false && selfBan8 === false && banOtherAdmin8 === false,
        'user=' + JSON.stringify(banByUser8) + ' self=' + JSON.stringify(selfBan8)
        + ' otherAdmin=' + JSON.stringify(banOtherAdmin8));

    callPage(g8, '(function () { setUsers(getUsers().map(function (u) {'
        + ' return u.username === "' + OTHER_USER + '" ? Object.assign({}, u, { role: "user" }) : u;'
        + '})); return true; })()');
    const banned8 = callPage(g8, "banUser('" + OTHER_USER + "', 'Lý do kiểm thử')");
    const moderation8 = callPage(g8, "getUserModeration('" + OTHER_USER + "')");
    check('admin khóa được tài khoản thường (đủ bannedAt/bannedReason/bannedBy)',
        banned8 === true && moderation8 && moderation8.banned === true
        && moderation8.bannedReason === 'Lý do kiểm thử' && moderation8.bannedBy === ADMIN_USER,
        'ban=' + JSON.stringify(banned8) + ' moderation=' + JSON.stringify(moderation8));

    setUser(g8, OTHER_USER);
    const bannedPost8 = callPage(g8,
        "createPost('Tiêu đề bài viết kiểm thử', 'Nội dung bài viết hoàn toàn bình thường.', '', 'Mẹo chơi')");
    const bannedComment8 = callPage(g8, 'addComment(1, "Bình luận hoàn toàn bình thường.")');
    const bannedLike8 = callPage(g8, 'toggleLike(1)');
    check('tài khoản bị khóa không đăng bài, không bình luận, không thích được',
        bannedPost8 === null && bannedComment8 === null && bannedLike8 === false
        && callPage(g8, 'isCurrentUserBanned()') === true,
        'post=' + JSON.stringify(bannedPost8) + ' comment=' + JSON.stringify(bannedComment8)
        + ' like=' + JSON.stringify(bannedLike8));

    setUser(g8, ADMIN_USER);
    const unban8 = callPage(g8, "unbanUser('" + OTHER_USER + "')");
    const userAfter8 = (g8.readKey('aov_users') || []).find((u) => u.username === OTHER_USER) || {};
    const warnShort8 = callPage(g8, "warnUser('" + OTHER_USER + "', 'xx')");
    const warnOk8 = callPage(g8, "warnUser('" + OTHER_USER + "', 'Lý do cảnh cáo chính đáng')");
    setUser(g8, USER_USER);
    const warnByUser8 = callPage(g8, "warnUser('" + OTHER_USER + "', 'Lý do cảnh cáo chính đáng')");
    const warnings8 = callPage(g8, "getUserWarnings('" + OTHER_USER + "').length");
    check('mở khóa xóa hẳn dấu vết khóa; cảnh cáo: lý do quá ngắn bị chặn, chỉ admin ghi được',
        unban8 === true && userAfter8.banned === undefined && userAfter8.strikes === undefined
        && warnShort8 === false && warnOk8 === true && warnByUser8 === false && warnings8 === 1,
        'unban=' + JSON.stringify(unban8) + ' user=' + JSON.stringify(userAfter8)
        + ' short=' + JSON.stringify(warnShort8) + ' ok=' + JSON.stringify(warnOk8)
        + ' byUser=' + JSON.stringify(warnByUser8) + ' warnings=' + JSON.stringify(warnings8));

    /* ---------- 9. KD04 - thông báo kết quả duyệt ---------- */
    section('9. KD04 - thông báo duyệt cho tác giả (aov_review_seen)');

    const g9 = await openFeed({ login: USER_USER, storage: new Map() });
    const post9 = callPage(g9,
        "createPost('Tiêu đề bài viết chờ duyệt', 'Nội dung bài viết hoàn toàn bình thường.', '', 'Hỏi đáp')");
    setUser(g9, ADMIN_USER);
    const approve9 = callPage(g9, 'approvePost(' + JSON.stringify(post9 && post9.id) + ')');
    setUser(g9, USER_USER);
    const notices9 = callPage(g9, 'getMyReviewNotices()') || [];
    const approvedNotice9 = notices9.find((n) => String(n.postId) === String(post9 && post9.id));
    const unseenBefore9 = callPage(g9, 'countUnseenReviewNotices()');
    const markSeen9 = callPage(g9, 'markReviewNoticesSeen()');
    const unseenAfter9 = callPage(g9, 'countUnseenReviewNotices()');
    const seenMap9 = g9.readKey('aov_review_seen') || {};
    check('duyệt bài -> tác giả có thông báo "đã duyệt" chưa xem; đánh dấu xong về 0',
        approve9 === true && approvedNotice9 && approvedNotice9.status === 'approved'
        && approvedNotice9.seen === false && unseenBefore9 >= 1
        && markSeen9 === true && unseenAfter9 === 0
        && seenMap9[USER_USER] && seenMap9[USER_USER][String(post9 && post9.id)] === approvedNotice9.at,
        'approve=' + JSON.stringify(approve9) + ' notice=' + JSON.stringify(approvedNotice9)
        + ' unseen ' + JSON.stringify(unseenBefore9) + '->' + JSON.stringify(unseenAfter9)
        + ' map=' + JSON.stringify(seenMap9));

    const post9b = callPage(g9,
        "createPost('Tiêu đề bài viết bị từ chối', 'Nội dung bài viết hoàn toàn bình thường.', '', 'Hỏi đáp')");
    setUser(g9, ADMIN_USER);
    const reject9 = callPage(g9,
        'rejectPost(' + JSON.stringify(post9b && post9b.id) + ', "Nội dung chưa phù hợp")');
    setUser(g9, USER_USER);
    const notices9b = callPage(g9, 'getMyReviewNotices()') || [];
    const rejectedNotice9 = notices9b.find((n) => String(n.postId) === String(post9b && post9b.id));
    check('từ chối bài -> thông báo của tác giả kèm lý do và chưa xem',
        reject9 === true && rejectedNotice9 && rejectedNotice9.status === 'rejected'
        && rejectedNotice9.reason === 'Nội dung chưa phù hợp' && rejectedNotice9.seen === false,
        'reject=' + JSON.stringify(reject9) + ' notice=' + JSON.stringify(rejectedNotice9));

    /* ---------- 10. resubmitPost ---------- */
    section('10. resubmitPost - gửi lại bài bị từ chối (KD04-a)');

    const g10 = await openFeed({ login: USER_USER, storage: new Map() });
    const post10 = callPage(g10,
        "createPost('Tiêu đề bài viết gửi lại', 'Nội dung bài viết hoàn toàn bình thường.', '', 'Mẹo chơi')");
    setUser(g10, ADMIN_USER);
    callPage(g10, 'rejectPost(' + JSON.stringify(post10 && post10.id) + ', "Lý do từ chối lần đầu")');
    setUser(g10, USER_USER);
    const resubmit10 = callPage(g10, 'resubmitPost(' + JSON.stringify(post10 && post10.id) + ')');
    check('gửi lại thành công: về "pending", tăng resubmitCount, giữ lastRejectReason',
        resubmit10 && resubmit10.status === 'pending'
        && resubmit10.resubmitCount === 1
        && resubmit10.lastRejectReason === 'Lý do từ chối lần đầu'
        && resubmit10.rejectReason === undefined,
        JSON.stringify(resubmit10));

    setUser(g10, OTHER_USER);
    const resubmitOther10 = callPage(g10, 'resubmitPost(' + JSON.stringify(post10 && post10.id) + ')');
    check('không phải tác giả (và không phải admin) thì không gửi lại được',
        resubmitOther10 === null, JSON.stringify(resubmitOther10));

    callPage(g10, '(function () { var posts = getPosts();'
        + ' for (var i = 0; i < posts.length; i++) {'
        + ' if (String(posts[i].id) === ' + JSON.stringify(String(post10 && post10.id)) + ') {'
        + ' posts[i].content = "Nội dung bài viết có thằng ngu ở giữa.";'
        + ' posts[i].status = "rejected";'
        + ' posts[i].rejectReason = "Nội dung vi phạm";'
        + ' } } return setPosts(posts); })()');
    setUser(g10, USER_USER);
    const warningsBefore10 = callPage(g10, "getUserWarnings('" + USER_USER + "').length");
    const blockedResubmit10 = callPage(g10, 'resubmitPost(' + JSON.stringify(post10 && post10.id) + ')');
    const warningsAfter10 = callPage(g10, "getUserWarnings('" + USER_USER + "').length");
    const notice10 = callPage(g10, 'getLastModerationNotice()');
    check('nội dung có từ cấm -> chặn gửi lại, KHÔNG phạt thêm, có thông báo "danger"',
        blockedResubmit10 === null && warningsBefore10 === warningsAfter10
        && notice10 && notice10.type === 'danger',
        'gửi lại=' + JSON.stringify(blockedResubmit10)
        + ' warnings ' + JSON.stringify(warningsBefore10) + '->' + JSON.stringify(warningsAfter10)
        + ' notice=' + JSON.stringify(notice10));

    const g10b = await openFeed({ login: USER_USER, storage: new Map() });
    const post10b = callPage(g10b,
        "createPost('Tiêu đề bài viết gửi lại nhiều lần', 'Nội dung bài viết hoàn toàn bình thường.', '', 'Thảo luận')");
    for (let round = 1; round <= 3; round += 1) {
        setUser(g10b, ADMIN_USER);
        callPage(g10b, 'rejectPost(' + JSON.stringify(post10b && post10b.id)
            + ', "Lần từ chối ' + round + '")');
        setUser(g10b, USER_USER);
        callPage(g10b, 'resubmitPost(' + JSON.stringify(post10b && post10b.id) + ')');
    }
    setUser(g10b, ADMIN_USER);
    callPage(g10b, 'rejectPost(' + JSON.stringify(post10b && post10b.id) + ', "Lần từ chối thứ 4")');
    setUser(g10b, USER_USER);
    const resubmit4th = callPage(g10b, 'resubmitPost(' + JSON.stringify(post10b && post10b.id) + ')');
    const notice4th = callPage(g10b, 'getLastModerationNotice()');
    const finalCount10 = callPage(g10b,
        'getPosts().filter(function (p) { return String(p.id) === '
        + JSON.stringify(String(post10b && post10b.id)) + '; })[0].resubmitCount');
    check('lần gửi lại thứ 4 bị chặn (RESUBMIT_MAX = 3) và báo rõ "Không thể gửi lại"',
        resubmit4th === null && finalCount10 === 3
        && notice4th && notice4th.title === 'Không thể gửi lại',
        'gửi lại=' + JSON.stringify(resubmit4th) + ' số lần=' + JSON.stringify(finalCount10)
        + ' notice=' + JSON.stringify(notice4th));

    /* ---------- 11. Tab Cài đặt - admin-banned.js ---------- */
    section('11. admin.html?tab=settings - thêm từ cấm qua form');

    const g11 = await openAdminSettings();
    const body11 = settingsBody(g11);
    const input11 = body11 ? body11.querySelector('[data-admin-banned-input]') : null;
    const saveButton11 = body11 ? body11.querySelector('[data-admin-banned-action="save-word"]') : null;
    check('mục "Từ ngữ cấm và vi phạm" được vẽ đủ form thêm từ, không lỗi JS lạ',
        Boolean(body11) && Boolean(input11) && Boolean(saveButton11)
        && jsErrors(g11).length === 0,
        'body=' + Boolean(body11) + ' input=' + Boolean(input11)
        + ' nút=' + Boolean(saveButton11) + ' lỗi=' + JSON.stringify(jsErrors(g11)));

    const htmlWord11 = '<b>từ cấm test</b>';
    input11.value = htmlWord11;
    body11.querySelector('[data-admin-banned-level]').value = '3';
    fire(saveButton11, 'click');
    const savedWords11 = callPage(g11, 'getModSettings().bannedWords');
    const wordsView11 = body11.querySelector('[data-admin-banned-words]');
    const wordsHtml11 = wordsView11 ? wordsView11.innerHTML : '';
    check('bấm Lưu: từ nằm trong aov_mod_settings và hiện trong bảng từ tùy chỉnh',
        Array.isArray(savedWords11)
        && savedWords11.some((entry) => (entry && entry.word) === htmlWord11 && entry.level === 3)
        && wordsHtml11.indexOf('từ cấm test') !== -1,
        'settings=' + JSON.stringify(savedWords11) + '\n        bảng=' + wordsHtml11.slice(0, 400));

    const feedback11 = body11.querySelector('[data-admin-banned-form-feedback]');
    const feedbackHtml11 = feedback11 ? feedback11.innerHTML : '';
    check('HTML trong từ bị escape khi vẽ bảng (không chèn được thẻ <b>) và có thông báo đã lưu',
        wordsHtml11.indexOf('<b>') === -1
        && wordsHtml11.indexOf('&lt;b&gt;') !== -1
        && feedbackHtml11.indexOf('Đã lưu từ') !== -1,
        'phản hồi=' + feedbackHtml11 + '\n        bảng=' + wordsHtml11.slice(0, 400));

    /* ---------- Tổng kết ---------- */
    console.log('\n' + passed + ' test PASS, ' + failures.length + ' test FAIL');
    if (failures.length) {
        failures.forEach((name) => console.log('  - ' + name));
        process.exitCode = 1;
    }
})().catch((error) => {
    console.error('\nLỗi khi chạy test:', error);
    process.exitCode = 1;
});
