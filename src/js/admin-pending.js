/**
 * admin-pending.js - Mục "Bài viết chờ duyệt" trong tab "Chờ duyệt" (task KD03)
 * Trang: src/pages/admin.html?tab=pending (file này do admin-shell.js nạp động)
 *
 * Nhiệm vụ: giúp quản trị viên xử lý hàng đợi duyệt bài viết:
 *   - liệt kê các bài đang ở trạng thái "pending" (getPendingPosts() của feed.js)
 *     với id, tác giả, tiêu đề, chuyên mục, ngày đăng và nội dung;
 *   - "Duyệt"  -> approvePost()  : status chuyển sang "approved", ghi ai duyệt / lúc nào;
 *   - "Từ chối" -> rejectPost()  : status chuyển sang "rejected", lý do KHÔNG bắt buộc
 *     (gửi kèm lý do thì lưu rejectReason);
 *   - sau mỗi thao tác vẽ lại danh sách và gọi refreshAdminBadges() (admin-shell.js)
 *     để số trên mục "Chờ duyệt" ở menu dọc đổi ngay.
 *
 * Cách gắn vào khung (giống hero-admin.js/admin-datacheck.js): file này tự gọi
 * registerAdminSection('pending', 'pending-posts', ...) lúc nạp; admin-shell.js
 * đã khai báo 'admin-pending.js' trong trường scripts của tab 'pending' nên không
 * phải sửa admin-shell.js / admin.html.
 *
 * Phân quyền: đây chỉ là quy ước phía trình duyệt, không phải bảo mật thật. Giao diện
 * chỉ vẽ nút cho admin, nhưng quyền THẬT được kiểm tra lại trong approvePost()/
 * rejectPost() (tầng dữ liệu) — gọi thẳng từ console với user thường cũng trả false.
 *
 * Dùng lại: getPendingPosts()/approvePost()/rejectPost()/getPostCategory() (feed.js),
 * escapeHtml()/formatDateTime() (components.js), refreshAdminBadges() (admin-shell.js).
 */

/**
 * Vẽ một dòng bài viết đang chờ duyệt.
 * Mọi dữ liệu từ aov_posts đều đi qua escapeHtml() trước khi ghép vào innerHTML.
 * Ô lý do từ chối nằm ngay trong dòng (không bắt buộc) để "Từ chối" kèm lý do
 * mà không cần hộp thoại prompt.
 * @param {object} post
 * @returns {string} HTML string
 */
function renderPendingRow(post) {
    const id = escapeHtml(post.id);

    return `
        <tr data-pending-post-id="${id}">
            <td>${escapeHtml(post.id)}</td>
            <td>${escapeHtml(post.author)}</td>
            <td>
                <a href="${BASE_PATH}src/pages/post-detail.html?id=${encodeURIComponent(post.id)}">${escapeHtml(post.title)}</a>
            </td>
            <td>${escapeHtml(getPostCategory(post))}</td>
            <td>${escapeHtml(formatDateTime(post.createdAt))}</td>
            <td class="admin-pending__content">${escapeHtml(post.content)}</td>
            <td>
                <input
                    type="text"
                    class="filter-bar__keyword"
                    data-pending-reason="${id}"
                    placeholder="Lý do từ chối (không bắt buộc)"
                    aria-label="Lý do từ chối bài viết ${id}"
                >
                <button type="button" class="btn btn-primary btn-sm" data-pending-approve="${id}">Duyệt</button>
                <button type="button" class="btn btn-outline btn-sm" data-pending-reject="${id}">Từ chối</button>
            </td>
        </tr>
    `;
}

/**
 * Render danh sách bài chờ duyệt vào container.
 * Không có bài nào thì hiện thông báo rỗng (giống renderNotFound của trang khác).
 * Là renderFn đăng ký với admin-shell.js nên có thể async.
 * @param {Element} container vùng .admin-section__body do shell tạo
 * @returns {Promise<void>}
 */
async function renderPendingSection(container) {
    if (!container) return;

    // Bảo đảm bài mẫu trong posts.json đã nạp vào aov_posts trước khi đọc.
    if (typeof seedPostsFromJson === 'function') {
        await seedPostsFromJson();
    }

    const posts = typeof getPendingPosts === 'function' ? getPendingPosts() : [];

    if (!posts.length) {
        container.innerHTML = '<p class="admin-empty">Không có bài viết nào đang chờ duyệt.</p>';
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Tác giả</th>
                    <th>Tiêu đề</th>
                    <th>Chuyên mục</th>
                    <th>Ngày đăng</th>
                    <th>Nội dung</th>
                    <th>Thao tác</th>
                </tr>
            </thead>
            <tbody>
                ${posts.map(renderPendingRow).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Vẽ lại đúng mục "Bài viết chờ duyệt" sau khi duyệt / từ chối, không vẽ lại cả khung.
 * @returns {Promise<void>}
 */
function refreshPendingSection() {
    const body = typeof document !== 'undefined'
        ? document.querySelector('[data-admin-section="pending-posts"] .admin-section__body')
        : null;

    if (!body) return Promise.resolve();

    return renderPendingSection(body);
}

/**
 * Cập nhật lại số badge trên menu dọc (nếu admin-shell.js đã nạp).
 * @returns {Promise<*>}
 */
function refreshPendingBadge() {
    if (typeof refreshAdminBadges === 'function') return refreshAdminBadges();
    return Promise.resolve();
}

/* ---------- Sự kiện duyệt / từ chối ---------- */

/*
 * Bảng được vẽ động bằng innerHTML nên không gắn sự kiện cho từng nút, mà gắn một
 * lần ở cấp document rồi dò theo data attribute (event delegation), đúng cách admin.js
 * xử lý nút Ẩn/Xoá và feed.js xử lý nút thích/xoá.
 */
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('click', (event) => {
        // Nút "Duyệt"
        const approveBtn = event.target.closest('[data-pending-approve]');
        if (approveBtn) {
            const postId = approveBtn.dataset.pendingApprove;

            // approvePost() kiểm tra lại quyền admin; false nghĩa là không lưu được.
            if (!approvePost(postId)) {
                alert('Không duyệt được bài viết. Bạn không có quyền quản trị.');
                return;
            }

            refreshPendingSection();
            refreshPendingBadge();
            return;
        }

        // Nút "Từ chối"
        const rejectBtn = event.target.closest('[data-pending-reject]');
        if (rejectBtn) {
            const postId = rejectBtn.dataset.pendingReject;
            const row = rejectBtn.closest('[data-pending-post-id]');
            const input = row ? row.querySelector('[data-pending-reason]') : null;
            const reason = input ? input.value : '';

            // rejectPost() kiểm tra lại quyền; lý do rỗng vẫn từ chối được (không lưu lý do).
            if (!rejectPost(postId, reason)) {
                alert('Không từ chối được bài viết. Bạn không có quyền quản trị.');
                return;
            }

            refreshPendingSection();
            refreshPendingBadge();
            return;
        }
    });
}

/* ---------- Đăng ký mục với khung quản trị ---------- */

// admin-shell.js nạp file này khi mở tab 'pending'; file nạp ở nơi khác (test) cũng chạy.
if (typeof registerAdminSection === 'function') {
    registerAdminSection('pending', 'pending-posts', 'Bài viết chờ duyệt', renderPendingSection);
}
