/**
 * loadData.js - Đọc dữ liệu JSON dùng chung
 * Phụ trách: Người 1
 *
 * Dùng chung cho mọi trang cần đọc data/heroes.json, data/items.json, data/builds.json.
 * Dùng đường dẫn tuyệt đối từ gốc site (bắt đầu bằng "/") để hoạt động đúng
 * dù trang nằm ở "/index.html" hay "/pages/heroes.html".
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
