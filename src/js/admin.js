/**
 * admin.js - Trang quản trị bài viết (src/pages/admin.html)
 *
 * Nhiệm vụ: giúp quản trị viên (tài khoản có role === 'admin') kiểm duyệt cộng đồng:
 *   - xem bảng TẤT CẢ bài viết (kể cả bài đã bị ẩn và bài chờ duyệt) với id, tác giả,
 *     tiêu đề, chuyên mục, ngày đăng, số like, số bình luận, trạng thái hiện/ẩn
 *     và trạng thái duyệt (Chờ duyệt / Đã duyệt / Từ chối)
 *   - ẩn / hiện một bài: setPostHidden() (feed.js) bật hoặc tắt trường hidden
 *   - xoá hẳn một bài: deletePost() (feed.js) — hàm này tự kiểm tra lại quyền
 *   - tìm nhanh theo tiêu đề hoặc tên tác giả
 *
 * Trạng thái duyệt CHỈ hiển thị ở cột "Trạng thái duyệt", chưa có nút duyệt/từ chối
 * (nút đó nằm ở bước duyệt sau); trạng thái đọc qua getPostStatus() của feed.js.
 *
 * Quyền truy cập (không phải việc của file này, nhưng file này phải tôn trọng):
 *   - requireAdmin() trong auth.js chặn ở thẻ <body> của admin.html: chưa đăng nhập
 *     thì về trang Login, đã đăng nhập nhưng không phải admin thì báo lý do rồi về
 *     trang chủ.
 *   - Dù vậy initAdminPage() vẫn kiểm tra lại isAdmin() trước khi vẽ bảng, để không
 *     bao giờ lộ dữ liệu quản trị chỉ vì giao diện chưa kịp điều hướng (fail-closed).
 *
 * Dữ liệu: dùng đúng lớp dữ liệu của trang Cộng đồng (feed.js) nên thao tác ở đây
 * và ở Feed / trang chi tiết / Profile luôn thấy cùng một dữ liệu trong aov_posts.
 *
 * Dùng lại của nhóm khác: requireAdmin()/isAdmin() (auth.js), escapeHtml()/
 * formatDateTime()/renderNotFound() (components.js), matchKeyword()/debounce()
 * (search.js), getPosts()/seedPostsFromJson()/getPostCategory()/getLikeUsers()/
 * getCommentsOfPost()/setPostHidden()/deletePost()/getPostStatus()/POST_STATUS_LABELS
 * (feed.js).
 */

/** Từ khoá đang gõ trong ô tìm kiếm; lưu trong bộ nhớ, không ghi lên URL. */
let adminKeyword = '';

/**
 * Mốc thời gian của một bài để sắp xếp.
 * createdAt là chuỗi ISO nên so sánh chuỗi cũng đúng thứ tự, nhưng dùng Date.parse
 * để xử lý được bài thiếu hoặc sai định dạng (coi như 0, tức là cũ nhất).
 * @param {object} post
 * @returns {number}
 */
function getAdminPostTime(post) {
    const time = Date.parse(post.createdAt);
    return Number.isNaN(time) ? 0 : time;
}

/**
 * Toàn bộ bài viết trong hệ thống, bài mới nhất trước.
 * Không lọc bài ẩn và không lọc theo trạng thái duyệt: bảng quản trị là nơi duy
 * nhất admin nhìn thấy bài đã bị ẩn, bài chờ duyệt và bài bị từ chối.
 * @returns {Array}
 */
function getAdminPosts() {
    return getPosts().slice().sort((a, b) => getAdminPostTime(b) - getAdminPostTime(a));
}

/**
 * Bài viết khớp với từ khoá đang gõ: so khớp tiêu đề HOẶC tên tác giả
 * (không phân biệt hoa/thường và không phân biệt dấu tiếng Việt, như matchKeyword).
 * @returns {Array}
 */
function getAdminFilteredPosts() {
    const keyword = String(adminKeyword || '').trim();
    if (!keyword) return getAdminPosts();

    return getAdminPosts().filter((post) => (
        matchKeyword(post.title, keyword) || matchKeyword(post.author, keyword)
    ));
}

/**
 * Vẽ thanh công cụ: ô tìm theo tiêu đề / tác giả.
 * Tái dùng class filter-bar / filter-bar__keyword của common.css cho giống trang Feed.
 * @returns {Element|null} vùng chứa thanh công cụ, null nếu trang không có.
 */
function renderAdminToolbar() {
    const toolbar = document.getElementById('admin-toolbar');
    if (!toolbar) return null;

    toolbar.innerHTML = `
        <div class="filter-bar">
            <input
                type="search"
                class="filter-bar__keyword"
                id="admin-keyword"
                placeholder="Tìm bài viết theo tiêu đề hoặc tác giả..."
                aria-label="Tìm bài viết theo tiêu đề hoặc tác giả"
            >
        </div>
    `;

    const keywordInput = toolbar.querySelector('#admin-keyword');
    if (!keywordInput) return toolbar;

    // Gán sau innerHTML để không mất từ khoá đang tìm khi vẽ lại bảng.
    keywordInput.value = adminKeyword;

    // Gõ liên tục thì chỉ lọc lại sau khi ngừng gõ, tránh vẽ lại bảng mỗi ký tự.
    keywordInput.addEventListener('input', debounce(() => {
        adminKeyword = keywordInput.value;
        renderAdminTable();
    }, 200));

    return toolbar;
}

/**
 * Vẽ một dòng bài viết trong bảng quản trị.
 * Mọi dữ liệu từ aov_posts đều đi qua escapeHtml() trước khi đưa vào innerHTML.
 * @param {object} post
 * @returns {string} HTML string
 */
function renderAdminRow(post) {
    const hidden = isPostHidden(post);
    // Trạng thái duyệt lấy qua getPostStatus() để bài cũ thiếu status vẫn là "Đã duyệt".
    const status = getPostStatus(post);
    const likeCount = getLikeUsers(post.id).length;
    const commentCount = getCommentsOfPost(post.id).length;

    return `
        <tr data-post-id="${escapeHtml(post.id)}">
            <td>${escapeHtml(post.id)}</td>
            <td>${escapeHtml(post.author)}</td>
            <td>
                <a href="${BASE_PATH}src/pages/post-detail.html?id=${encodeURIComponent(post.id)}">${escapeHtml(post.title)}</a>
            </td>
            <td>${escapeHtml(getPostCategory(post))}</td>
            <td>${escapeHtml(formatDateTime(post.createdAt))}</td>
            <td>${likeCount}</td>
            <td>${commentCount}</td>
            <td>
                <span class="badge">${hidden ? 'Đã ẩn' : 'Đang hiện'}</span>
            </td>
            <td>
                <!-- Chỉ hiển thị trạng thái duyệt, CHƯA có nút duyệt/từ chối (bước sau) -->
                <span class="badge post-status--${escapeHtml(status)}">${escapeHtml(POST_STATUS_LABELS[status])}</span>
            </td>
            <td>
                <!-- data-admin-hidden lưu trạng thái HIỆN TẠI để handler biết cần đổi sang gì -->
                <button
                    type="button"
                    class="btn btn-outline btn-sm"
                    data-admin-toggle="${escapeHtml(post.id)}"
                    data-admin-hidden="${hidden ? 'true' : 'false'}"
                >${hidden ? 'Hiện' : 'Ẩn'}</button>
                <button
                    type="button"
                    class="btn btn-outline btn-sm"
                    data-admin-delete="${escapeHtml(post.id)}"
                >Xóa</button>
            </td>
        </tr>
    `;
}

/**
 * Vẽ bảng bài viết theo từ khoá đang gõ.
 * Không có bài nào khớp thì hiện renderNotFound() thay cho bảng, giống trang Feed.
 */
function renderAdminTable() {
    const tableBox = document.getElementById('admin-list');
    if (!tableBox) return;

    const total = getPosts().length;
    const posts = getAdminFilteredPosts();
    const countEl = document.getElementById('admin-count');

    // Có từ khoá thì báo "đang xem / tổng", không có thì chỉ báo tổng số bài.
    if (countEl) {
        countEl.textContent = adminKeyword.trim()
            ? `${posts.length} / ${total} bài viết`
            : `${total} bài viết`;
    }

    if (!posts.length) {
        tableBox.innerHTML = renderNotFound('Không có bài viết nào khớp từ khoá đang tìm.');
        return;
    }

    tableBox.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Tác giả</th>
                    <th>Tiêu đề</th>
                    <th>Chuyên mục</th>
                    <th>Ngày đăng</th>
                    <th>Like</th>
                    <th>Bình luận</th>
                    <th>Trạng thái</th>
                    <th>Trạng thái duyệt</th>
                    <th>Thao tác</th>
                </tr>
            </thead>
            <tbody>
                ${posts.map(renderAdminRow).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Thông báo cho người dùng không có quyền (đã đăng nhập nhưng không phải admin).
 * Không vẽ bảng, không đụng dữ liệu.
 */
function renderAdminDenied() {
    const tableBox = document.getElementById('admin-list');
    if (!tableBox) return;

    tableBox.innerHTML = `
        <div class="post-detail-empty">
            ${renderNotFound('Bạn không có quyền truy cập trang Quản trị bài viết.')}
            <p class="post-detail-empty__actions">
                <a class="btn btn-outline" href="${BASE_PATH}index.html">← Về trang chủ</a>
            </p>
        </div>
    `;
}

/**
 * Khởi tạo trang quản trị.
 * Chạy tự thoát nếu trang không có #admin-list để file này có thể nạp thừa ở trang khác
 * mà không làm hỏng trang đó (giống initFeedPage()/initPostDetailPage() của feed.js).
 */
async function initAdminPage() {
    const tableBox = document.getElementById('admin-list');
    if (!tableBox) return;

    // requireAdmin() đã được gọi sớm 1 lần trong <script> requireAdmin(); </script>
    // ở đầu admin.html. Nếu gọi lại ở đây thì người đã đăng nhập nhưng không phải admin
    // sẽ bị bắn alert "không có quyền" 2 lần liên tiếp, nên chỉ tự kiểm tra bằng
    // isAdmin() sau khi chờ usersReady (tức aov_users chắc chắn đã có role).
    // Vẫn fail-closed: không xác minh được là admin thì không vẽ bảng, không đụng dữ liệu.
    await usersReady;

    if (typeof isAdmin !== 'function' || !isAdmin()) {
        renderAdminDenied();
        return;
    }

    // Bài mẫu trong data/posts.json phải được nạp vào aov_posts trước thì bảng mới đầy đủ,
    // nạp theo đúng cách trang Feed và trang chi tiết đang làm.
    await seedPostsFromJson();

    renderAdminToolbar();
    renderAdminTable();
}

/* ---------- Sự kiện ẩn/hiện và xoá bài ---------- */

/*
 * Bảng được vẽ động bằng innerHTML nên không gắn sự kiện cho từng nút,
 * mà gắn một lần ở cấp document rồi dò theo data attribute (event delegation),
 * đúng cách feed.js xử lý nút thích / xoá bài.
 */
document.addEventListener('click', (event) => {
    // Nút "Ẩn" / "Hiện": đọc trạng thái hiện tại trong data-admin-hidden rồi đảo ngược lại.
    const toggleBtn = event.target.closest('[data-admin-toggle]');
    if (toggleBtn) {
        const postId = toggleBtn.dataset.adminToggle;
        const hidden = toggleBtn.dataset.adminHidden === 'true';

        // setPostHidden() kiểm tra lại quyền admin; trả false nghĩa là không lưu được.
        if (!setPostHidden(postId, !hidden)) {
            alert('Không cập nhật được bài viết. Bạn không có quyền quản trị.');
            return;
        }

        renderAdminTable();
        return;
    }

    // Nút "Xóa": xoá hẳn bài kèm bình luận và lượt thích (deletePost() làm phần này).
    const deleteBtn = event.target.closest('[data-admin-delete]');
    if (deleteBtn) {
        const postId = deleteBtn.dataset.adminDelete;
        const post = findPostById(postId);

        if (!post) {
            alert('Không tìm thấy bài viết cần xóa.');
            return;
        }

        if (!confirm(`Xóa vĩnh viễn bài viết "${post.title}"? Bình luận và lượt thích của bài cũng sẽ bị xóa.`)) return;

        // deletePost() tự kiểm tra lại quyền (tác giả hoặc admin) trước khi xoá.
        if (!deletePost(postId)) {
            alert('Bạn không có quyền xóa bài viết này.');
            return;
        }

        renderAdminTable();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initAdminPage();
    } catch (error) {
        console.error('Không khởi tạo được trang Quản trị', error);
    }
});
