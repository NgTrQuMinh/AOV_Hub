/**
 * loadData.js - Đọc dữ liệu JSON dùng chung
 * Phụ trách: Người 1
 *
 * Dùng chung cho mọi trang cần đọc data/heroes.json, data/items.json, data/builds.json.
 * Truyền đường dẫn dạng BASE_PATH + 'src/data/heroes.json' (BASE_PATH khai báo trong js/config.js)
 * để hoạt động đúng dù trang nằm ở index.html, pages/heroes.html hay thư mục con của server.
 *
 * Lưu ý: phải chạy qua server (Live Server / http-server / XAMPP...),
 * mở trực tiếp file HTML (file://) sẽ khiến fetch() bị chặn bởi trình duyệt.
 */
async function loadData(path) {
    try {
        const response = await fetch(path);

        if (!response.ok) {
            throw new Error(`Không tải được dữ liệu: ${path} (HTTP ${response.status})`);
        }

        return await response.json();
    } catch (error) {
        console.error(error);
        return [];
    }
}
