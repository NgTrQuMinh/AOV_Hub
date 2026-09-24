/**
 * config.js - Cấu hình đường dẫn gốc (BASE_PATH) dùng chung
 *
 * PHẢI được nạp đầu tiên trong mọi trang, trước các file JS khác.
 * BASE_PATH tự tính từ vị trí file này nên đúng ở mọi nơi chạy:
 *   http://localhost:5500/               -> "/"
 *   http://localhost/backup/             -> "/backup/"
 *   https://user.github.io/aov-hub/      -> "/aov-hub/"
 */
// document.currentScript = thẻ <script> đang chạy (chính là config.js)
// new URL('../', src) = lùi ra khỏi thư mục js/ để về thư mục gốc dự án
// .pathname = lấy phần đường dẫn (bỏ domain), luôn kết thúc bằng "/"
const BASE_PATH = new URL('../', document.currentScript.src).pathname;
