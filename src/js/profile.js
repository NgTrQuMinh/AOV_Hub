/**
 * profile.js - Trang Profile (pages/profile.html)
 * Phụ trách: Trần Anh Thư
 *
 * Tách từ đoạn <script> inline trong profile.html (L19 / STT 13).
 * Hiển thị thông tin tài khoản đang đăng nhập, thống kê nhanh và danh sách
 * bài viết của chính người đó.
 *
 * Dùng lại:
 *   auth.js       - getCurrentUser(), findUser(), formatDateTime(), logout()
 *   storage.js    - getFavorites(), getHistory()
 *   feed.js       - getPostsByUser(), seedPostsFromJson(), renderPostCard(), feedHeroes
 *   heroData.js   - loadHeroes()
 *   components.js - renderNotFound()
 *
 * LƯU Ý: feed.js gọi lại renderProfilePosts() sau khi người dùng xoá / sửa bài viết,
 * nên renderProfileStats() và renderProfilePosts() phải là hàm toàn cục (khai báo
 * bằng function, không bọc trong IIFE và không dùng type="module").
 *
 * Trang được bảo vệ bởi requireAuth() nạp sớm trong profile.html, nên khi tới đây
 * chắc chắn đã có người đăng nhập.
 */

/* Tên người đang đăng nhập; dùng cho cả phần thông tin lẫn thống kê. */
const currentUsername = getCurrentUser();

/* ---------- Thông tin tài khoản + nút đăng xuất ---------- */

function renderProfileHeader() {
    document.getElementById('profile-username').textContent = currentUsername || '';

    const userRecord = findUser(currentUsername);
    if (userRecord && userRecord.joinedAt) {
        document.getElementById('profile-joined').textContent =
            'Tham gia: ' + formatDateTime(userRecord.joinedAt);
    }

    document.getElementById('profile-logout').addEventListener('click', logout);
}

/* ---------- Thống kê nhanh (lấy từ LocalStorage: storage.js + feed.js) ---------- */

function renderProfileStats() {
    document.getElementById('profile-stats').innerHTML = `
        <li><strong>${getFavorites('hero').length}</strong><span>Tướng yêu thích</span></li>
        <li><strong>${getFavorites('item').length}</strong><span>Trang bị yêu thích</span></li>
        <li><strong>${getPostsByUser(currentUsername).length}</strong><span>Bài viết</span></li>
        <li><strong>${getHistory().length}</strong><span>Lượt tra cứu gần đây</span></li>
    `;
}

/* ---------- Danh sách bài viết của người dùng ---------- */

/**
 * Vẽ danh sách bài viết của người đang đăng nhập.
 * feed.js gọi lại hàm này (qua typeof) sau khi xoá bài viết nên phải là hàm toàn cục.
 */
async function renderProfilePosts() {
    const container = document.getElementById('profile-posts');

    await seedPostsFromJson();
    feedHeroes = await loadHeroes();

    const myPosts = getPostsByUser(currentUsername);

    container.innerHTML = myPosts.length
        ? myPosts.map(renderPostCard).join('')
        : renderNotFound('Bạn chưa có bài viết nào. Hãy sang trang Cộng đồng để đăng bài.');

    renderProfileStats();
}

document.addEventListener('DOMContentLoaded', () => {
    renderProfileHeader();
    renderProfileStats();
    renderProfilePosts();
});
