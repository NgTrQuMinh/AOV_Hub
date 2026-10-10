# AOV HUB

Website tra cứu tướng, trang bị, build đề xuất và cộng đồng bài viết của game Arena of Valor.

- Công nghệ: **HTML5 + CSS3 + Vanilla JavaScript**, dữ liệu **JSON tĩnh**, không framework, không database.
- Đóng gói / dev server: **Vite**. Quản lý tướng ghi thẳng vào `src/data/heroes.json` qua API nội bộ `/api/heroes` do `vite.config.js` cung cấp (chỉ chạy khi `npm run dev` / `npm run preview`).
- Dữ liệu dùng chung (`users`, `posts`, `comments`, `likes`) đi qua `src/js/dataStore.js` (File System Access API + dự phòng LocalStorage/tải file).
- Lưu tạm yêu thích / lịch sử / so sánh / phiên đăng nhập bằng **LocalStorage**.
- Nhóm 4 thành viên.

## 1. Cấu trúc

```
AOV-Hub/
├── index.html                    # Trang chủ
├── vite.config.js                # Vite + API /api/heroes (đọc/ghi heroes.json)
├── package.json                  # npm run dev / build / preview / test
│
├── public/
│   ├── partials/                 # header.html, footer.html (nạp bằng layout.js)
│   ├── css/                      # reset, variables, common, home, hero, item,
│   │   │                         #   build, compare, favorite, feed, auth,
│   │   │                         #   admin, hero-admin
│   └── assets/images/            # ảnh tướng, trang bị, banner...
│
├── src/
│   ├── pages/                    # 404, login, register, profile,
│   │                             #   heroes, hero-detail, items, item-detail,
│   │                             #   builds, compare, favorite, feed,
│   │                             #   post-detail, admin, hero-admin
│   ├── data/                     # heroes.json, items.json, builds.json,
│   │                             #   posts.json, users.json, comments.json, likes.json
│   └── js/
│       ├── config.js             # BASE_PATH / DATA_PATH
│       ├── dataStore.js          # lớp dữ liệu dùng chung (users/posts/comments/likes)
│       ├── loadData.js           # loadData(path) đọc JSON (trả [] khi lỗi)
│       ├── components.js         # renderHeroCard/renderItemCard/renderNotFound
│       ├── layout.js             # nạp header/footer, menu mobile, account UI
│       ├── auth.js               # đăng ký/đăng nhập (PBKDF2-SHA256), guard trang
│       ├── storage.js            # LocalStorage: favorites/history/compare
│       ├── search.js             # chuẩn hoá từ khoá (bỏ dấu, không phân biệt hoa thường)
│       ├── favorite.js           # nút ♥ trên card/chi tiết
│       ├── heroData.js           # lớp dữ liệu tướng (loadHeroes + API admin)
│       ├── home.js               # Trang chủ: Tướng/Trang bị nổi bật
│       ├── hero.js               # Danh sách/Chi tiết Tướng
│       ├── item.js               # Danh sách/Chi tiết Trang bị
│       ├── build.js              # Trang Build đề xuất
│       ├── compare.js            # So sánh Tướng
│       ├── feed.js               # Feed, bài viết, like, comment, kiểm duyệt
│       ├── admin.js              # Quản trị bài viết
│       ├── adminlog.js           # Nhật ký thao tác admin
│       └── hero-admin.js         # Quản lý tướng (CRUD qua /api/heroes)
│
└── tools/                        # mini-dom + bộ test/audit chạy bằng Node
```

> `src/js/core`, `src/js/adapters`, `src/js/services`, `src/js/controllers`, `src/js/models`
> là lớp "clean architecture" đang thử nghiệm, **hiện chưa được trang nào nạp**.

## 2. Chạy dự án

Vì đọc JSON bằng `fetch()`, phải chạy qua local server (mở trực tiếp `index.html` sẽ bị chặn CORS):

```bash
npm install
npm run dev      # mở địa chỉ Vite in ra (thường http://localhost:5173/)
```

Lệnh khác:

```bash
npm run build    # đóng gói
npm run preview  # xem bản build (vẫn có API /api/heroes)
```

Live Server / `python -m http.server` vẫn xem được các trang, nhưng **trang Quản lý tướng sẽ không lưu** vì thiếu API `/api/heroes`.

## 3. Chạy test / audit

Bộ test mô phỏng trình duyệt tối giản (`tools/mini-dom.cjs`) chạy bằng Node, không cần cài thêm thư viện:

```bash
npm test                 # chạy toàn bộ tools/test-*.cjs
node tools/test-auth.cjs # chạy một test đơn lẻ
node tools/audit-data.cjs
node tools/audit-pages.cjs
node tools/audit-links.cjs
```

`audit-result.json` là kết quả audit (`audit-pages.cjs`), đã được `.gitignore`.

## 4. Quy ước dùng chung

- Mọi trang có sẵn `<header id="site-header">` và `<footer id="site-footer">` (nạp bằng `layout.js`), khai báo `<body data-page="...">` để menu tự highlight.
- Đọc dữ liệu công khai qua `loadData(BASE_PATH + 'src/data/⋯.json')` (`BASE_PATH` trong `config.js`), không gọi `fetch()` rải rác.
- Card Tướng/Trang bị luôn dùng `renderHeroCard()` / `renderItemCard()` trong `components.js`.
- Rỗng/không tìm thấy → `renderNotFound(message)`.
- Trang cần đăng nhập dùng `requireAuth()`; trang admin dùng thêm `requireAdmin()` (xem `PROTECTED_PAGES` trong `auth.js`).

## 5. LocalStorage / khoá dữ liệu

```
aov_current_user   # phiên đăng nhập hiện tại
aov_favorites      # { hero: [id, ...], item: [id, ...] }
aov_history        # [id, ...] tối đa 10 mục tra cứu gần nhất
aov_compare        # [id, id] tối đa 2 tướng đang so sánh
aov_admin_log      # nhật ký thao tác admin (tối đa 200 bản ghi)
aov_mod_settings   # cài đặt kiểm duyệt (duyệt trước, từ cấm...)
```

Các key cũ (`aov_users`, `aov_posts`, `aov_comments`, `aov_likes`, `aov_posts_seeded`) chỉ còn để **đọc và gộp một lần** vào `dataStore.js`; sau khi liên kết thư mục `src/data` thì không dùng nữa (`aov_draft_*` là bản nháp trước khi liên kết).

Không tự ý đổi tên các key cố định khi thêm tính năng — `storage.js`, `favorite.js`, `compare.js`, `feed.js` đều phụ thuộc.

> Giới hạn: không có backend. "Dữ liệu dùng chung" thực chất là file JSON trong repo/máy demo; trình duyệt chỉ tự ghi được khi người dùng liên kết thư mục `src/data` (Chrome/Edge). "admin" là quy ước phía trình duyệt, không phải bảo mật thật.
