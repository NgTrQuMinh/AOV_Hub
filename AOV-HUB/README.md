# AOV HUB

Website tra cứu **Tướng – Trang bị – Build đề xuất** của game Arena of Valor, kèm khu vực **Community Feed** để người dùng đăng bài, thích và bình luận.

> Đây là **đồ án môn học**. Toàn bộ dữ liệu là JSON tĩnh, mọi thao tác "lưu" đều mô phỏng bằng LocalStorage của trình duyệt.

---

## 1. Mục tiêu

- Tra cứu danh sách tướng: lọc theo vai trò, độ khó, tìm theo tên (có bỏ dấu tiếng Việt).
- Xem chi tiết tướng: chỉ số, bộ kỹ năng, build trang bị đề xuất.
- Tra cứu trang bị: lọc theo loại, sắp xếp theo giá, xem chỉ số và nội tại.
- So sánh chỉ số 2 tướng bất kỳ.
- Lưu Tướng/Trang bị yêu thích và lịch sử tra cứu ngay trên trình duyệt.
- Tài khoản: đăng ký, đăng nhập, giữ phiên, đăng xuất, trang cá nhân có bảo vệ.
- Cộng đồng: đăng bài, xoá bài của mình, thích, bình luận.

---

## 2. Công nghệ

| Hạng mục | Sử dụng |
|---|---|
| Giao diện | HTML5 semantic, CSS3 thuần (CSS variables, Flexbox, Grid) |
| Xử lý | Vanilla JavaScript (ES6+), `fetch`, `async/await` |
| Dữ liệu | File JSON tĩnh trong `data/` |
| Lưu trạng thái | `localStorage` |

**Không sử dụng:** React, Vue, Angular, Bootstrap, Tailwind, backend, database, API thật, thanh toán, đăng nhập Google, Firebase.

---

## 3. Cấu trúc thư mục

```
AOV-HUB/
├── index.html                    # Trang chủ: banner, điều hướng nhanh, Tướng/Trang bị nổi bật, bài viết mới
├── README.md
├── .gitignore
│
├── pages/
│   ├── heroes.html               # Danh sách Tướng            — TV2
│   ├── hero-detail.html          # Chi tiết Tướng             — TV2
│   ├── builds.html               # Build đề xuất              — TV2
│   ├── items.html                # Danh sách Trang bị         — TV3
│   ├── item-detail.html          # Chi tiết Trang bị          — TV3
│   ├── feed.html                 # Community Feed             — TV3 (UI) + TV4 (logic)
│   ├── compare.html              # So sánh 2 Tướng            — TV4
│   ├── favorite.html             # Yêu thích + Lịch sử        — TV4
│   ├── 404.html                  # Trang không tìm thấy       — TV4
│   ├── register.html             # Đăng ký                    — TV1
│   ├── login.html                # Đăng nhập                  — TV1
│   └── profile.html              # Trang cá nhân (có Guard)   — TV1
│
├── partials/                     # Mảnh HTML dùng chung, nạp bằng js/layout.js — TV1
│   ├── header.html
│   └── footer.html
│
├── css/
│   ├── reset.css                 # Reset cơ bản                         — TV1
│   ├── variables.css             # CSS variables: màu, font, spacing    — TV1
│   ├── common.css                # Header/Footer/Button/Card/Grid…      — TV1
│   ├── home.css                  # Trang chủ                            — TV1
│   ├── auth.css                  # Đăng ký / Đăng nhập / Profile        — TV1
│   ├── hero.css                  # Trang Tướng                          — TV2
│   ├── build.css                 # Trang Build đề xuất                  — TV2
│   ├── item.css                  # Trang Trang bị                       — TV3
│   ├── feed.css                  # Community Feed                       — TV3
│   ├── compare.css               # Trang So sánh                        — TV4
│   └── favorite.css              # Trang Yêu thích                      — TV4
│
├── js/
│   ├── loadData.js               # loadData(path) + DATA_PATH — đọc JSON dùng chung  — TV1
│   ├── components.js             # renderHeroCard / renderItemCard / escapeHtml…     — TV1
│   ├── layout.js                 # Nạp header & footer, menu mobile, ô tìm kiếm      — TV1
│   ├── home.js                   # Trang chủ: Tướng & Trang bị nổi bật               — TV1
│   ├── auth.js                   # Đăng ký / Đăng nhập / Session / Logout / Guard    — TV1
│   ├── hero.js                   # Danh sách + Chi tiết Tướng                        — TV2
│   ├── build.js                  # Trang Build đề xuất                               — TV2
│   ├── item.js                   # Danh sách + Chi tiết Trang bị                     — TV3
│   ├── feed.js                   # Post / Like / Comment + LocalStorage              — TV4
│   ├── storage.js                # Favorites / History / Compare                     — TV4
│   ├── favorite.js               # Nút yêu thích + trang Yêu thích                   — TV4
│   ├── search.js                 # Bỏ dấu tiếng Việt, matchKeyword, debounce         — TV4
│   └── compare.js                # Logic trang So sánh                               — TV4
│
├── assets/
│   ├── images/
│   │   ├── heroes/               # Ảnh tướng (hiện là ảnh placeholder tự sinh)
│   │   ├── items/                # Ảnh trang bị (placeholder)
│   │   └── banner/               # Ảnh banner trang chủ, logo
│   └── uploads/                  # Chỗ để ảnh thử nghiệm (không commit lên Git)
│
└── data/
    ├── heroes.json               # 16 tướng
    ├── items.json                # 18 trang bị
    ├── builds.json               # 8 build đề xuất
    ├── posts.json                # Bài viết mẫu cho Feed
    └── users.json                # Tài khoản demo
```

> Ảnh trong `assets/images/heroes` và `assets/images/items` hiện là **ảnh placeholder tự sinh** để giao diện không bị vỡ. Khi có ảnh thật, chỉ cần thay file và **giữ nguyên tên** đúng như trường `image` trong JSON, không phải sửa code.

---

## 4. Cách chạy dự án

Dự án dùng `fetch()` để đọc file JSON nên **bắt buộc chạy qua local server**. Mở thẳng `index.html` bằng double-click (`file://`) sẽ bị trình duyệt chặn và trang sẽ trống dữ liệu.

**Cách 1 – VS Code Live Server (khuyên dùng):**
1. Cài extension **Live Server**.
2. Mở thư mục `AOV-HUB/` bằng VS Code.
3. Chuột phải `index.html` → *Open with Live Server*.

**Cách 2 – Terminal:** đứng tại thư mục `AOV-HUB/` rồi chạy một trong hai lệnh
```bash
python -m http.server 5500
# hoặc
npx http-server . -p 5500
```
Sau đó mở `http://localhost:5500/`.

Tài khoản demo có sẵn: **demo / 123456**

---

## 5. Các module chính

| Module | Trang | File JS chính |
|---|---|---|
| Nền tảng UI | Toàn site | `layout.js`, `components.js`, `loadData.js` |
| Trang chủ | `index.html` | `home.js` |
| Tướng | `heroes.html`, `hero-detail.html` | `hero.js` |
| Build | `builds.html` | `build.js` |
| Trang bị | `items.html`, `item-detail.html` | `item.js` |
| So sánh | `compare.html` | `compare.js` |
| Yêu thích & Lịch sử | `favorite.html` | `favorite.js`, `storage.js` |
| Cộng đồng | `feed.html` | `feed.js` |
| Tài khoản | `register.html`, `login.html`, `profile.html` | `auth.js` |

---

## 6. LocalStorage

| Key | Kiểu dữ liệu | Quản lý bởi |
|---|---|---|
| `aov_current_user` | `"username"` — user đang đăng nhập | `auth.js` (TV1) |
| `aov_users` | `[{ username, password, displayName, joinedAt }]` — tài khoản mô phỏng | `auth.js` (TV1) |
| `aov_favorites` | `{ hero: [id…], item: [id…] }` | `storage.js` (TV4) |
| `aov_history` | `[{ type, id, at }]` — tối đa 10 mục gần nhất | `storage.js` (TV4) |
| `aov_compare` | `[heroId, heroId]` — tối đa 2 tướng | `storage.js` (TV4) |
| `aov_posts` | `[{ id, author, title, content, heroId, createdAt }]` | `feed.js` (TV4) |
| `aov_comments` | `[{ id, postId, author, content, createdAt }]` | `feed.js` (TV4) |
| `aov_likes` | `{ "<postId>": [username…] }` | `feed.js` (TV4) |

⚠️ **Không tự ý đổi tên key.** Nhiều module đọc chung các key này; đổi tên sẽ làm mất dữ liệu đang lưu trên máy người dùng và làm hỏng module khác.

⚠️ Mật khẩu được lưu **dạng chữ thường, không mã hoá** — chỉ phục vụ mô phỏng đồ án, tuyệt đối không dùng cho sản phẩm thật.

---

## 7. Quy ước dùng chung

- Mọi trang đều có 2 khối rỗng để `layout.js` nạp Header/Footer:
  ```html
  <header id="site-header"></header>
  ...
  <footer id="site-footer"></footer>
  ```
- Mọi trang khai báo `<body data-page="…">` để menu tự highlight:
  `home`, `heroes`, `items`, `builds`, `compare`, `favorite`, `feed`, `login`, `register`, `profile`, `404`.
- Đọc JSON **luôn qua** `loadData(DATA_PATH.heroes)`, không gọi `fetch()` rải rác trong từng trang.
- Card Tướng/Trang bị **luôn dùng** `renderHeroCard(hero)` / `renderItemCard(item)` trong `components.js`.
- Trường hợp không có dữ liệu → `renderNotFound(message)`.
- Dữ liệu do người dùng nhập (bài viết, bình luận) phải đi qua `escapeHtml()` trước khi đưa vào `innerHTML`.
- Thứ tự nạp script trên mỗi trang: `loadData.js` → `components.js` → `auth.js` → `layout.js` → `storage.js` → các file module.

---

## 8. Phân công

| Thành viên | Vai trò | Phụ trách |
|---|---|---|
| **TV1 – Trần Anh Thư** | Nền tảng UI + Account | `reset.css`, `variables.css`, `common.css`, `home.css`, `auth.css`, `partials/`, `loadData.js`, `components.js`, `layout.js`, `home.js`, `auth.js`, `index.html`, `register.html`, `login.html`, `profile.html`, README |
| **TV2** | Heroes + Build | `heroes.json`, `builds.json`, `hero.js`, `build.js`, `hero.css`, `build.css`, `heroes.html`, `hero-detail.html`, `builds.html` |
| **TV3** | Items + giao diện Feed/Post/Comment | `items.json`, `item.js`, `item.css`, `feed.css`, `items.html`, `item-detail.html`, `feed.html` |
| **TV4** | Community logic + LocalStorage + Search | `storage.js`, `favorite.js`, `search.js`, `compare.js`, `feed.js`, `compare.css`, `favorite.css`, `compare.html`, `favorite.html`, `404.html` |

---

## 9. Phạm vi chức năng

**Có làm**
- Tra cứu, tìm kiếm, lọc, phân trang Tướng/Trang bị.
- Chi tiết Tướng (chỉ số, kỹ năng, build), chi tiết Trang bị (chỉ số, nội tại, tướng phù hợp).
- So sánh 2 tướng, yêu thích, lịch sử tra cứu.
- Đăng ký / Đăng nhập / Session / Đăng xuất / Profile / Guard.
- Feed: đăng bài, xoá bài của mình, thích, bình luận, xoá bình luận của mình.
- Responsive từ mobile đến desktop.

**Không làm** (ngoài phạm vi đồ án)
- Backend, database, API thật, đăng nhập mạng xã hội, thanh toán.
- Quên mật khẩu, xác thực email, phân quyền admin, thông báo, theo dõi người dùng.
- Dark/Light mode, upload ảnh thật.

---

## 10. Checklist kiểm thử

**Đăng ký:** username rỗng · password rỗng · password dưới 6 ký tự · password trên 10 ký tự · confirm sai · username trùng · đăng ký thành công.

**Đăng nhập:** sai username · sai password · đăng nhập đúng · reload trang vẫn giữ phiên · Header hiển thị username.

**Đăng xuất:** Header trở lại trạng thái khách · refresh vẫn là khách · dữ liệu yêu thích/bài viết **không bị xoá**.

**Guard:** vào `profile.html` khi chưa đăng nhập → bị đẩy sang Login · đăng nhập xong quay lại đúng trang cũ · đăng xuất rồi vào lại → lại bị chặn.

**Trang chủ:** đọc `heroes.json` · hero card render đúng · link chi tiết chạy · Header/Footer hoạt động · responsive.

**Feed:** khách chỉ xem được · đăng nhập mới đăng bài/bình luận/thích · chỉ xoá được bài và bình luận của chính mình.
