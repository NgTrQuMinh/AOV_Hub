# AOV HUB

Website tra cứu tướng, trang bị và build đề xuất của game Arena of Valor.

- Công nghệ: **HTML5 + CSS3 + Vanilla JavaScript**, dữ liệu **JSON tĩnh**
- Lưu tạm (yêu thích / lịch sử / so sánh) bằng **LocalStorage**; thao tác quản trị **Tướng** ghi thẳng vào `src/data/heroes.json` qua API nhỏ của Vite dev server
- Không dùng: React/Vue/Angular, framework CSS, database, API thật (chỉ có endpoint `/api/heroes` chạy trong `npm run dev`)
- Nhóm 4 thành viên

## 1. Cấu trúc

```
AOV-HUB/
├── index.html                  # Trang chủ
│
├── pages/
│   ├── heroes.html              # Danh sách Tướng        — Người 2
│   ├── hero-detail.html         # Chi tiết Tướng         — Người 2
│   ├── items.html               # Danh sách Trang bị     — Người 3
│   ├── item-detail.html         # Chi tiết Trang bị      — Người 3
│   ├── compare.html             # So sánh Tướng          — Người 4
│   ├── favorite.html            # Yêu thích / Lịch sử    — Người 4
│   └── 404.html                 # Trang không tìm thấy   — Người 4
│
├── partials/                    # Mảnh HTML dùng chung, nạp bằng js/layout.js — Người 1
│   ├── header.html
│   └── footer.html
│
├── css/
│   ├── reset.css                 # Reset cơ bản           — Người 1
│   ├── variables.css             # CSS variables dùng chung — Người 1
│   ├── common.css                # Header/Footer/Card/Button/Grid dùng chung — Người 1
│   ├── home.css                  # Trang chủ              — Người 1
│   ├── hero.css                  # Trang Tướng            — Người 2
│   ├── item.css                  # Trang Trang bị         — Người 3
│   ├── compare.css               # Trang So sánh          — Người 4
│   └── favorite.css              # Trang Yêu thích        — Người 4
│
├── js/
│   ├── loadData.js               # Đọc JSON dùng chung (fetch)     — Người 1
│   ├── components.js             # renderHeroCard/renderItemCard/renderNotFound — Người 1
│   ├── layout.js                 # Nạp header/footer, menu mobile  — Người 1
│   ├── home.js                   # Trang chủ: Tướng/Trang bị nổi bật — Người 1
│   ├── storage.js                # LocalStorage: favorites/history/compare — Người 4
│   ├── favorite.js               # Nút yêu thích trên card/detail  — Người 4
│   ├── search.js                 # Tìm kiếm phía client            — Người 4
│   ├── compare.js                # Logic trang So sánh             — Người 4
│   ├── hero.js                   # Danh sách/Chi tiết Tướng        — Người 2
│   └── item.js                   # Danh sách/Chi tiết Trang bị     — Người 3
│
├── assets/
│   ├── images/{heroes,items,banner}/
│   └── uploads/
│
└── data/                         # Dữ liệu gốc
    ├── heroes.json
    ├── items.json
    └── builds.json
```

## 2. LocalStorage key

```
aov_favorites   # { hero: [id, ...], item: [id, ...] }
aov_history     # [id, ...] tối đa 10 mục tra cứu gần nhất
aov_compare     # [id, id] tối đa 2 tướng đang so sánh
```

Không tự ý đổi tên các key trên khi thêm tính năng mới — các file `storage.js`, `favorite.js`, `compare.js` đều phụ thuộc vào key cố định này.

## 3. Quy ước dùng chung

- Mọi trang đều có sẵn 2 khối rỗng để nạp layout dùng chung:
  ```html
  <header id="site-header"></header>
  ...
  <footer id="site-footer"></footer>
  ```
  và khai báo `<body data-page="...">` để menu tự highlight đúng trang (`home`, `heroes`, `items`, `compare`, `favorite`).
- Đọc dữ liệu JSON luôn qua `loadData(path)` (dùng `BASE_PATH + 'data/heroes.json'`, `BASE_PATH` khai báo trong `js/config.js`), không gọi `fetch()` trực tiếp trong từng trang.
- Card Tướng/Trang bị luôn dùng `renderHeroCard(hero)` / `renderItemCard(item)` trong `js/components.js` — không viết lại HTML card ở nơi khác để tránh lệch giao diện.
- Rỗng dữ liệu/không tìm thấy → dùng `renderNotFound(message)`.

## 4. Chạy dự án

Vì có dùng `fetch()` để đọc file JSON, **phải chạy qua một local server**, không mở trực tiếp file `index.html` (giao thức `file://` sẽ bị trình duyệt chặn CORS khi fetch JSON):

- Chạy bằng Vite (khuyến nghị vì có kèm API ghi file cho trang Quản lý tướng):
  ```bash
  npm install
  npm run dev
  ```
  rồi mở địa chỉ Vite in ra (thường là `http://localhost:5173/`).
- Hoặc Live Server / `npx http-server .` / `python -m http.server 5500` — các trang vẫn xem được, nhưng trang **Quản lý tướng sẽ không lưu được** vì thiếu API `/api/heroes` (API này do `vite.config.js` cung cấp).

## 5. Chạy test

Bộ test mô phỏng trình duyệt tối giản (`tools/mini-dom.cjs`) chạy được trong Node, không cần cài thêm thư viện:

- Chạy toàn bộ test (`tools/run-tests.cjs`, lệnh `tools/test-*.cjs`):
  ```bash
  npm test
  ```
- Chạy một test đơn lẻ:
  ```bash
  node tools/test-auth.cjs
  ```
- Audit (thông tin phụ trợ cho báo cáo, không tính vào pass/fail của test):
  ```bash
  node tools/audit-data.cjs
  node tools/audit-pages.cjs
  node tools/audit-links.cjs
  ```
- Các test chạy trong LocalStorage ảo (copy trong `mini-dom`), không sửa file dữ liệu JSON trong repo. Muốn chạy trên mọi thư mục đều được: mọi đường dẫn test/audit đều xoay quanh gốc repo qua `__dirname`.

## 6. Phân công

| Thành viên | Phụ trách |
|---|---|
| Người 1 | `reset.css`, `variables.css`, `common.css`, `home.css`, `partials/`, `js/loadData.js`, `js/components.js`, `js/layout.js`, `js/home.js`, `index.html` |
| Người 2 | `data/heroes.json`, `js/hero.js`, `css/hero.css`, `pages/heroes.html`, `pages/hero-detail.html` |
| Người 3 | `data/items.json`, `data/builds.json`, `js/item.js`, `css/item.css`, `pages/items.html`, `pages/item-detail.html` |
| Người 4 | `js/storage.js`, `js/favorite.js`, `js/search.js`, `js/compare.js`, `css/compare.css`, `css/favorite.css`, `pages/compare.html`, `pages/favorite.html`, `pages/404.html` |
