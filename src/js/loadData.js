/**
 * loadData.js - Đọc dữ liệu JSON dùng chung
 * Phụ trách: Người 1 (TV1)
 *
 * Dùng chung cho mọi trang cần đọc data/heroes.json, data/items.json,
 * data/builds.json, data/posts.json, data/users.json.
 *
 * Dùng đường dẫn tuyệt đối từ gốc site (bắt đầu bằng "/") để hoạt động đúng
 * dù trang nằm ở "/index.html" hay "/pages/heroes.html".
 *
 * Lưu ý: phải chạy qua server (Live Server / http-server / XAMPP...),
 * mở trực tiếp file HTML (file://) sẽ khiến fetch() bị chặn bởi trình duyệt.
 */

/* Bộ nhớ tạm trong 1 lần load trang: tránh fetch lại cùng 1 file nhiều lần
   (ví dụ trang chi tiết tướng đọc heroes.json + builds.json + items.json). */
const dataCache = {};

async function loadData(path) {
    if (dataCache[path]) {
        return dataCache[path];
    }

    try {
        const response = await fetch(path);

        if (!response.ok) {
            throw new Error(`Không tải được dữ liệu: ${path} (HTTP ${response.status})`);
        }

        const data = await response.json();
        dataCache[path] = data;
        return data;
    } catch (error) {
        console.error(error);
        return [];
    }
}

/* Đường dẫn dữ liệu dùng chung — khai báo 1 chỗ để không gõ sai chuỗi ở nhiều file */
const DATA_PATH = {
    heroes: '/data/heroes.json',
    items: '/data/items.json',
    builds: '/data/builds.json',
    posts: '/data/posts.json',
    users: '/data/users.json',
};
