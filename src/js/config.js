/**
 * config.js - Cấu hình đường dẫn gốc (BASE_PATH) dùng chung
 *
 * PHẢI được nạp đầu tiên trong mọi trang, trước các file JS khác.
 *
 * Cấu trúc Vite:
 *   public/  -> phục vụ ở gốc "/"   (css/, partials/, assets/)
 *   src/     -> phục vụ ở "/src/"   (pages/, js/, data/)
 * Vì vậy BASE_PATH luôn là gốc của server dev ("/"), và các nơi dùng nó
 * tự nối thêm "src/pages/", "src/data/" khi cần.
 *   BASE_PATH + 'assets/images/...'  -> /assets/images/...   (public)
 *   BASE_PATH + 'partials/...'       -> /partials/...        (public)
 *   BASE_PATH + 'src/pages/...'      -> /src/pages/...       (src)
 *   BASE_PATH + 'src/data/...'       -> /src/data/...        (src)
 */
const BASE_PATH = '/';
