/**
 * feed.js - Community Feed: đăng bài, thích, bình luận (pages/feed.html)
 * Phụ trách: Người 3 (giao diện) + Người 4 (logic LocalStorage)
 *
 * LocalStorage:
 *   aov_posts         [ { id, author, title, content, heroId, createdAt } ]
 *                     gồm bài lấy từ data/posts.json + bài người dùng tự đăng
 *   aov_posts_seeded  [ id ]  các id bài từ posts.json đã từng nạp, để bài đã
 *                     bị xoá không bị nạp lại ("sống lại") khi mở trang
 *   aov_comments      [ { id, postId, author, content, createdAt } ]
 *   aov_likes         { "<postId>": [username, ...] }
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
 * getStore()/setStore()/toStorageId() (storage.js), getCurrentUser()/isLoggedIn() (auth.js).
 */

const POSTS_KEY = 'aov_posts';
const POSTS_SEEDED_KEY = 'aov_posts_seeded';
const COMMENTS_KEY = 'aov_comments';
const LIKES_KEY = 'aov_likes';

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
    const known = new Set(getSeededPostIds());
    stored.forEach((post) => known.add(normalizeId(post.id)));

    const added = normalizePosts(jsonPosts).filter((post) => {
        const id = normalizeId(post.id);
        if (known.has(id)) return false;

        known.add(id);
        return true;
    });

    if (!added.length) {
        // Ghi lại danh sách id đã nạp (lần đầu chưa có ghi, hoặc posts.json vừa thêm id mới).
        if (known.size > getSeededPostIds().length) setStore(POSTS_SEEDED_KEY, [...known]);
        return stored;
    }

    const merged = stored.concat(added);
    setPosts(merged);
    setStore(POSTS_SEEDED_KEY, [...known]);

    return merged;
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

/**
 * Kiểm tra dữ liệu form đăng bài.
 * Tách riêng khỏi createPost() để cùng một bộ quy tắc dùng cho form và cho test.
 *
 * author lấy từ session (getCurrentUser), phải có trong danh sách tài khoản
 * của dự án (aov_users nạp từ data/users.json) thì mới coi là hợp lệ.
 *
 * @returns {{ valid: boolean, errors: string[], values: { title: string, content: string, heroId: *, author: string } }}
 */
function validatePostForm(title, content, heroId) {
    const errors = [];
    const cleanTitle = String(title || '').trim();
    const cleanContent = String(content || '').trim();
    const author = String(getCurrentUser() || '').trim();

    if (!author) {
        errors.push('Bạn cần đăng nhập để đăng bài.');
    } else if (typeof findUser === 'function' && !findUser(author)) {
        errors.push('Tài khoản của bạn không còn tồn tại. Hãy đăng nhập lại.');
    }

    if (!cleanTitle) errors.push('Tiêu đề không được để trống.');
    else if (cleanTitle.length < POST_TITLE_MIN) errors.push(`Tiêu đề phải có ít nhất ${POST_TITLE_MIN} ký tự.`);

    if (!cleanContent) errors.push('Nội dung không được để trống.');
    else if (cleanContent.length < POST_CONTENT_MIN) errors.push(`Nội dung phải có ít nhất ${POST_CONTENT_MIN} ký tự.`);

    return {
        valid: !errors.length,
        errors,
        values: { title: cleanTitle, content: cleanContent, heroId: toStorageId(heroId), author },
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
 * @returns {object|null} bài vừa tạo, null nếu dữ liệu không hợp lệ hoặc lưu thất bại.
 */
function createPost(title, content, heroId) {
    const checked = validatePostForm(title, content, heroId);
    if (!checked.valid) return null;

    const posts = getPosts();
    const id = nextFeedId(posts.map((row) => row.id));
    const post = {
        id,
        author: checked.values.author,
        title: checked.values.title,
        content: checked.values.content,
        heroId: checked.values.heroId,
        createdAt: new Date().toISOString(),
    };

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
 * Xoá bài viết kèm toàn bộ bình luận và lượt thích của bài đó.
 * @returns {boolean}
 */
function deletePost(postId) {
    const id = normalizeId(postId);
    if (!id) return false;

    setPosts(getPosts().filter((post) => normalizeId(post.id) !== id));
    setComments(getComments().filter((comment) => normalizeId(comment.postId) !== id));

    const likes = getLikes();
    if (id in likes) {
        delete likes[id];
        setLikes(likes);
    }

    return true;
}

function getPostsByUser(username) {
    const name = String(username || '').trim();
    if (!name) return [];

    return getPosts().filter((post) => String(post.author || '').trim() === name);
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
 * @returns {boolean} true nếu vừa thích, false nếu vừa bỏ thích hoặc chưa đăng nhập.
 */
function toggleLike(postId) {
    const id = normalizeId(postId);
    const username = getCurrentUser();
    if (!id || !username) return false;

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
 * @returns {object|null} bình luận vừa tạo, null nếu chưa đăng nhập hoặc nội dung rỗng.
 */
function addComment(postId, content) {
    const id = normalizeId(postId);
    const text = String(content || '').trim();
    const author = getCurrentUser();

    if (!id || !text || !author) return null;

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

function deleteComment(commentId) {
    const id = normalizeId(commentId);
    if (!id) return false;

    return setComments(getComments().filter((comment) => normalizeId(comment.id) !== id));
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
    feedHeroes = await loadData(DATA_PATH.heroes);
    if (!Array.isArray(feedHeroes)) feedHeroes = [];

    renderPostForm();
    renderFeedList();
}

function renderPostForm() {
    const formBox = document.getElementById('feed-form');
    if (!formBox) return;

    if (!isLoggedIn()) {
        formBox.innerHTML = `
            <div class="feed-form feed-form--guest">
                <p>Bạn cần đăng nhập để đăng bài và bình luận.</p>
                <a class="btn btn-primary" href="${BASE_PATH}src/pages/login.html?redirect=${BASE_PATH}src/pages/feed.html">Đăng nhập</a>
            </div>
        `;
        return;
    }

    const heroOptions = feedHeroes
        .map((hero) => `<option value="${hero.id}">${escapeHtml(hero.name)}</option>`)
        .join('');

    formBox.innerHTML = `
        <form class="feed-form" id="post-form" novalidate>
            <h2>Đăng bài mới</h2>
            <div id="post-errors"></div>
            <div class="form-group">
                <label for="post-title">Tiêu đề</label>
                <input type="text" id="post-title" placeholder="Ví dụ: Cách lên đồ cho xạ thủ">
            </div>
            <div class="form-group">
                <label for="post-content">Nội dung</label>
                <textarea id="post-content" rows="4" placeholder="Chia sẻ kinh nghiệm của bạn..."></textarea>
            </div>
            <div class="form-group">
                <label for="post-hero">Gắn với tướng (không bắt buộc)</label>
                <select class="filter-bar__select" id="post-hero">
                    <option value="">-- Không chọn --</option>
                    ${heroOptions}
                </select>
            </div>
            <button type="submit" class="btn btn-primary">Đăng bài</button>
        </form>
    `;

    const form = formBox.querySelector('#post-form');
    if (!form) return;

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        const title = form.querySelector('#post-title').value;
        const content = form.querySelector('#post-content').value;
        const heroId = form.querySelector('#post-hero').value;
        const errorBox = form.querySelector('#post-errors');
        const checked = validatePostForm(title, content, heroId);

        renderErrors(errorBox, checked.errors);
        if (!checked.valid) return;

        const newPost = createPost(title, content, heroId);
        if (!newPost) {
            renderErrors(errorBox, ['Không lưu được bài viết. Hãy thử lại hoặc kiểm tra dung lượng trình duyệt.']);
            return;
        }

        // Bài mới lên đầu danh sách nên Feed hiển thị ngay,
        // đồng thời báo kèm link để mở trang chi tiết của chính bài vừa đăng.
        form.reset();
        renderSuccess(
            form.querySelector('#post-errors'),
            `Đã đăng bài "${checked.values.title}".`,
        );
        form.querySelector('#post-errors').insertAdjacentHTML(
            'beforeend',
            ` <a href="${BASE_PATH}src/pages/post-detail.html?id=${encodeURIComponent(newPost.id)}">Xem bài vừa đăng</a>`,
        );

        rerenderFeedView();
        if (typeof renderProfilePosts === 'function') renderProfilePosts();
    });
}

/**
 * Vẽ danh sách bài viết.
 * @param {number|string} [focusPostId] id bài cần đưa lại con trỏ vào ô bình luận sau khi vẽ.
 *        Cần thiết vì danh sách bị vẽ lại toàn bộ sau mỗi lượt thích / bình luận,
 *        không làm vậy thì nội dung đang gõ ở các ô khác sẽ mất sạch.
 */
function renderFeedList(focusPostId) {
    const listContainer = document.getElementById('feed-list');
    if (!listContainer) return;

    const posts = getPosts();

    listContainer.innerHTML = posts.length
        ? posts.map(renderPostCard).join('')
        : renderNotFound('Chưa có bài viết nào. Hãy là người đăng bài đầu tiên!');

    if (focusPostId === undefined || focusPostId === null) return;

    const input = listContainer.querySelector(`[data-comment-form="${normalizeId(focusPostId)}"] input`);
    if (input) input.focus();
}

function renderPostCard(post) {
    const hero = feedHeroes.find((record) => record.id === post.heroId);
    const likeUsers = getLikeUsers(post.id);
    const liked = isLikedByCurrentUser(post.id);
    const comments = getCommentsOfPost(post.id);
    const canDelete = isLoggedIn() && post.author === getCurrentUser();

    const commentsHtml = comments.map((comment) => `
        <li class="comment">
            <strong>${escapeHtml(comment.author)}</strong>
            <span class="comment__time">${formatDateTime(comment.createdAt)}</span>
            <p>${escapeHtml(comment.content)}</p>
            ${isLoggedIn() && comment.author === getCurrentUser()
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
                        ${hero ? ` · <a href="${BASE_PATH}src/pages/hero-detail.html?id=${hero.id}">${escapeHtml(hero.name)}</a>` : ''}
                    </span>
                </div>
                ${canDelete ? `<button type="button" class="post-card__delete" data-post-delete="${escapeHtml(post.id)}">Xoá bài</button>` : ''}
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
    feedHeroes = await loadData(DATA_PATH.heroes);
    if (!Array.isArray(feedHeroes)) feedHeroes = [];

    // Các nút thích / gửi bình luận trên trang chi tiết được xử lý bởi đúng
    // event delegation của trang Feed, chỉ cần đổi hàm vẽ lại.
    setFeedRerender(renderPostDetailView);

    renderPostDetailView();
}

/**
 * Vẽ lại trang chi tiết (cũng dùng sau mỗi lượt thích / bình luận).
 * @param {string|number} [focusPostId] bỏ qua, trang chi tiết chỉ có một bình luận đang gõ.
 */
function renderPostDetailView() {
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

    const hero = feedHeroes.find((record) => record.id === post.heroId);
    const likeUsers = getLikeUsers(post.id);
    const liked = isLikedByCurrentUser(post.id);
    const comments = getCommentsOfPost(post.id);
    const canDelete = isLoggedIn() && post.author === getCurrentUser();

    const commentsHtml = comments.map((comment) => `
        <li class="comment">
            <strong>${escapeHtml(comment.author)}</strong>
            <span class="comment__time">${formatDateTime(comment.createdAt)}</span>
            <p>${escapeHtml(comment.content)}</p>
            ${isLoggedIn() && comment.author === getCurrentUser()
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
                    </span>
                    ${hero ? `<a href="${BASE_PATH}src/pages/hero-detail.html?id=${hero.id}">${escapeHtml(hero.name)}</a>` : ''}
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
                        <a href="${BASE_PATH}src/pages/login.html?redirect=${BASE_PATH}src/pages/post-detail.html?id=${encodeURIComponent(post.id)}">Đăng nhập</a>
                        để viết bình luận.
                    </p>
                `}
            </section>
        </article>
    `;

    // Vẽ xong thì trả con trỏ về ô bình luận để người dùng viết tiếp ngay
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

    const deleteBtn = event.target.closest('[data-post-delete]');
    if (deleteBtn) {
        if (!confirm('Xoá bài viết này?')) return;

        deletePost(deleteBtn.dataset.postDelete);
        rerenderFeedView(deleteBtn.dataset.postDelete);
        if (typeof renderProfilePosts === 'function') renderProfilePosts();
        return;
    }

    const commentDeleteBtn = event.target.closest('[data-comment-delete]');
    if (commentDeleteBtn) {
        const postId = commentDeleteBtn.closest('[data-post-id]')?.dataset.postId;
        deleteComment(commentDeleteBtn.dataset.commentDelete);
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
