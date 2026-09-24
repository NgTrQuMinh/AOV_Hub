/**
 * feed.js - Community Feed: đăng bài, thích, bình luận (pages/feed.html)
 * Phụ trách: Người 3 (giao diện) + Người 4 (logic LocalStorage)
 *
 * LocalStorage:
 *   aov_posts     [ { id, author, title, content, heroId, createdAt } ]
 *   aov_comments  [ { id, postId, author, content, createdAt } ]
 *   aov_likes     { "<postId>": [username, ...] }
 *
 * Lần đầu mở web, aov_posts được nạp sẵn từ data/posts.json.
 * Dùng lại của TV1: loadData(), escapeHtml(), formatDateTime(), renderNotFound(),
 * getCurrentUser()/isLoggedIn() (auth.js).
 */

const POSTS_KEY = 'aov_posts';
const COMMENTS_KEY = 'aov_comments';
const LIKES_KEY = 'aov_likes';

let feedHeroes = [];

/* ---------- Đọc/ghi dữ liệu ---------- */

function getPosts() {
    const posts = getStore(POSTS_KEY, []);
    return Array.isArray(posts) ? posts : [];
}

function setPosts(posts) {
    setStore(POSTS_KEY, posts);
}

function getComments() {
    const comments = getStore(COMMENTS_KEY, []);
    return Array.isArray(comments) ? comments : [];
}

function setComments(comments) {
    setStore(COMMENTS_KEY, comments);
}

function getLikes() {
    return getStore(LIKES_KEY, {}) || {};
}

function setLikes(likes) {
    setStore(LIKES_KEY, likes);
}

/**
 * Nạp bài viết mẫu từ data/posts.json ở lần chạy đầu tiên.
 */
async function seedPostsFromJson() {
    if (localStorage.getItem(POSTS_KEY)) return;

    const posts = await loadData(DATA_PATH.posts);
    setPosts(posts);
}

/* ---------- CRUD bài viết ---------- */

function createPost(title, content, heroId) {
    const posts = getPosts();

    posts.unshift({
        id: Date.now(),
        author: getCurrentUser(),
        title: String(title).trim(),
        content: String(content).trim(),
        heroId: heroId ? Number(heroId) : null,
        createdAt: new Date().toISOString(),
    });

    setPosts(posts);
}

function deletePost(postId) {
    setPosts(getPosts().filter((post) => post.id !== Number(postId)));
    setComments(getComments().filter((comment) => comment.postId !== Number(postId)));

    const likes = getLikes();
    delete likes[postId];
    setLikes(likes);
}

function getPostsByUser(username) {
    return getPosts().filter((post) => post.author === username);
}

/* ---------- Thích ---------- */

function getLikeUsers(postId) {
    const likes = getLikes();
    return Array.isArray(likes[postId]) ? likes[postId] : [];
}

function isLikedByCurrentUser(postId) {
    return getLikeUsers(postId).includes(getCurrentUser());
}

function toggleLike(postId) {
    const username = getCurrentUser();
    if (!username) return;

    const likes = getLikes();
    const users = getLikeUsers(postId);

    likes[postId] = users.includes(username)
        ? users.filter((name) => name !== username)
        : users.concat(username);

    setLikes(likes);
}

/* ---------- Bình luận ---------- */

function getCommentsOfPost(postId) {
    return getComments().filter((comment) => comment.postId === Number(postId));
}

function addComment(postId, content) {
    const comments = getComments();

    comments.push({
        id: Date.now(),
        postId: Number(postId),
        author: getCurrentUser(),
        content: String(content).trim(),
        createdAt: new Date().toISOString(),
    });

    setComments(comments);
}

function deleteComment(commentId) {
    setComments(getComments().filter((comment) => comment.id !== Number(commentId)));
}

/* ---------- Giao diện trang Feed ---------- */

async function initFeedPage() {
    const listContainer = document.getElementById('feed-list');
    if (!listContainer) return;

    await seedPostsFromJson();
    feedHeroes = await loadData(DATA_PATH.heroes);

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

    document.getElementById('post-form').addEventListener('submit', (event) => {
        event.preventDefault();

        const title = document.getElementById('post-title').value;
        const content = document.getElementById('post-content').value;
        const heroId = document.getElementById('post-hero').value;
        const errorBox = document.getElementById('post-errors');
        const errors = [];

        if (!title.trim()) errors.push('Tiêu đề không được để trống.');
        else if (title.trim().length < 5) errors.push('Tiêu đề phải có ít nhất 5 ký tự.');

        if (!content.trim()) errors.push('Nội dung không được để trống.');
        else if (content.trim().length < 10) errors.push('Nội dung phải có ít nhất 10 ký tự.');

        renderErrors(errorBox, errors);
        if (errors.length) return;

        createPost(title, content, heroId);
        document.getElementById('post-form').reset();
        renderFeedList();
    });
}

function renderFeedList() {
    const listContainer = document.getElementById('feed-list');
    if (!listContainer) return;

    const posts = getPosts();

    listContainer.innerHTML = posts.length
        ? posts.map(renderPostCard).join('')
        : renderNotFound('Chưa có bài viết nào. Hãy là người đăng bài đầu tiên!');
}

function renderPostCard(post) {
    const hero = feedHeroes.find((record) => record.id === post.heroId);
    const likeUsers = getLikeUsers(post.id);
    const comments = getCommentsOfPost(post.id);
    const canDelete = isLoggedIn() && post.author === getCurrentUser();

    const commentsHtml = comments.map((comment) => `
        <li class="comment">
            <strong>${escapeHtml(comment.author)}</strong>
            <span class="comment__time">${formatDateTime(comment.createdAt)}</span>
            <p>${escapeHtml(comment.content)}</p>
            ${isLoggedIn() && comment.author === getCurrentUser()
                ? `<button type="button" class="comment__delete" data-comment-delete="${comment.id}">Xoá</button>`
                : ''}
        </li>
    `).join('');

    return `
        <article class="post-card" data-post-id="${post.id}">
            <header class="post-card__head">
                <span class="post-card__avatar" aria-hidden="true">👤</span>
                <div>
                    <h3 class="post-card__title">${escapeHtml(post.title)}</h3>
                    <span class="post-card__meta">
                        ${escapeHtml(post.author)} · ${formatDateTime(post.createdAt)}
                        ${hero ? ` · <a href="${BASE_PATH}src/pages/hero-detail.html?id=${hero.id}">${escapeHtml(hero.name)}</a>` : ''}
                    </span>
                </div>
                ${canDelete ? `<button type="button" class="post-card__delete" data-post-delete="${post.id}">Xoá bài</button>` : ''}
            </header>

            <p class="post-card__content">${escapeHtml(post.content)}</p>

            <div class="post-card__actions">
                <button type="button" class="post-action ${isLikedByCurrentUser(post.id) ? 'is-active' : ''}" data-post-like="${post.id}">
                    ♥ Thích (${likeUsers.length})
                </button>
                <span class="post-action">💬 ${comments.length} bình luận</span>
            </div>

            <ul class="comment-list">${commentsHtml}</ul>

            ${isLoggedIn() ? `
                <form class="comment-form" data-comment-form="${post.id}">
                    <input type="text" placeholder="Viết bình luận..." aria-label="Nội dung bình luận">
                    <button type="submit" class="btn btn-outline btn-sm">Gửi</button>
                </form>
            ` : ''}
        </article>
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
        toggleLike(Number(likeBtn.dataset.postLike));
        renderFeedList();
        // Trang Profile cũng hiển thị bài viết nên phải vẽ lại cho khớp
        if (typeof renderProfilePosts === 'function') renderProfilePosts();
        return;
    }

    const deleteBtn = event.target.closest('[data-post-delete]');
    if (deleteBtn) {
        if (!confirm('Xoá bài viết này?')) return;
        deletePost(deleteBtn.dataset.postDelete);
        renderFeedList();
        if (typeof renderProfilePosts === 'function') renderProfilePosts();
        return;
    }

    const commentDeleteBtn = event.target.closest('[data-comment-delete]');
    if (commentDeleteBtn) {
        deleteComment(commentDeleteBtn.dataset.commentDelete);
        renderFeedList();
        if (typeof renderProfilePosts === 'function') renderProfilePosts();
    }
});

document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-comment-form]');
    if (!form) return;

    event.preventDefault();

    const input = form.querySelector('input');
    const content = input.value.trim();

    if (!content) return;

    addComment(form.dataset.commentForm, content);
    input.value = '';
    renderFeedList();
    if (typeof renderProfilePosts === 'function') renderProfilePosts();
});

document.addEventListener('DOMContentLoaded', initFeedPage);
