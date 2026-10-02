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

/* ---------- Chuyên mục bài viết ---------- */

/** Danh sách chuyên mục hợp lệ, dùng cho select ở form và cho thanh lọc trang Feed. */
const POST_CATEGORIES = ['Build trang bị', 'Mẹo chơi', 'Thảo luận', 'Hỏi đáp'];

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
 * @returns {object|null} bài vừa tạo, null nếu dữ liệu không hợp lệ hoặc lưu thất bại.
 */
function createPost(title, content, heroId, category) {
    const checked = validatePostForm(title, content, heroId, category);
    if (!checked.valid) return null;

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
    const name = String(username || '').trim();
    if (!name) return [];

    // Lọc cả bài ẩn: tác giả xem trang Profile của chính mình thì vẫn thấy bài của mình
    // (kèm nhãn "Đã bị ẩn"), còn Profile của người khác thì không lộ bài ẩn của họ.
    return getPosts().filter((post) => (
        String(post.author || '').trim() === name && isPostVisibleForViewer(post)
    ));
}

/* ---------- Thích ---------- */

function getLikeUsers(postId) {
    const likes = getLikes();
    return Array.isArray(likes[postId]) ? likes[postId] : [];
}

function isLikedByCurrentUser(postId) {
    return getLikeUsers(postId).includes(getCurrentUser());
}

/**
 * Bật/tắt lượt thích của người dùng đang đăng nhập.
 * @returns {boolean} true nếu vừa thích, false nếu vừa bỏ thích hoặc chưa đăng nhập.
 */
function toggleLike(postId) {
    const username = getCurrentUser();
    if (!id || !username) return false;

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
                <a class="btn btn-primary" href="${BASE_PATH}src/pages/login.html?redirect=${encodeURIComponent(BASE_PATH + 'src/pages/feed.html')}">Đăng nhập</a>
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

    if (!post || !canEditPost(post)) return false;

    renderPostForm(post, formBox);
    if (formBox && formBox.scrollIntoView) formBox.scrollIntoView({ behavior: 'smooth', block: 'center' });

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
        // Bài đã bị ẩn thì không hiện trong Feed (trừ bài của chính tác giả đang xem).
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

    // Khi hai bài bằng nhau (cùng lượt like / cùng số bình luận) thì bài mới hơn đứng trước.
    const sorted = list.slice();

    if (state.sort === POST_SORT_LIKES) {
        sorted.sort((a, b) => getLikeUsers(b.id).length - getLikeUsers(a.id).length || timeOf(b) - timeOf(a));
    } else if (state.sort === POST_SORT_COMMENTS) {
        sorted.sort((a, b) => getCommentsOfPost(b.id).length - getCommentsOfPost(a.id).length || timeOf(b) - timeOf(a));
    } else {
        sorted.sort((a, b) => timeOf(b) - timeOf(a));
    }

    return sorted;
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

    // Bài đã bị quản trị viên ẩn: mọi người khác không mở được, tác giả vẫn xem được
    // (để kiểm tra bài của mình) và sẽ thấy nhãn "Đã bị ẩn" bên dưới.
    if (!isPostVisibleForViewer(post)) {
        detailContainer.innerHTML = renderPostDetailPlaceholder(
            'Bài viết này đã bị ẩn bởi quản trị viên.',
        );
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
