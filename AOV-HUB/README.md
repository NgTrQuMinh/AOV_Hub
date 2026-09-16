# AOV HUB

Website tra cứu tướng, trang bị và build đề xuất của game Arena of Valor.
Xây dựng theo mô hình **MVC**, kế thừa nguyên cấu trúc base của môn học.

- Công nghệ: PHP (MVC thuần) + HTML/CSS/JavaScript, dữ liệu **JSON**, LocalStorage
- Nhóm 4 thành viên — 4 tuần

## 1. Cấu trúc

```
AOV-HUB/
├── index.php                   # Điểm vào duy nhất: session + autoload + nạp config + router
│
├── configs/
│   ├── env.php                 # BASE_URL, PATH_*, FILE_HEROES/ITEMS/BUILDS, danh mục, key LocalStorage
│   └── helper.php              # debug, upload_file (từ base) + read_json, remove_accents, format_price...
│
├── routes/
│   └── index.php               # match($action) -> Controller tương ứng
│
├── models/                     # M — chỉ lo dữ liệu, không in HTML
│   ├── BaseModel.php           # (giữ nguyên từ base, PDO — dành cho Phase 3)
│   ├── JsonModel.php           # lớp cha đọc JSON: all / find / search / filter / findMany
│   ├── HeroModel.php
│   ├── ItemModel.php
│   └── BuildModel.php
│
├── controllers/                # C — nhận request, gọi Model, chọn View
│   ├── HomeController.php
│   ├── HeroController.php      # index() + detail()
│   ├── ItemController.php      # index() + detail()
│   ├── BuildController.php
│   ├── CompareController.php
│   ├── FavoriteController.php
│   └── ErrorController.php
│
├── views/                      # V — chỉ hiển thị
│   ├── main.php                # layout chung, nạp $view vào giữa
│   ├── layouts/                # header.php, footer.php
│   ├── components/             # hero-card, item-card, filter-bar, not-found, pagination
│   ├── home/index.php
│   ├── heroes/                 # index.php, detail.php
│   ├── items/                  # index.php, detail.php
│   ├── builds/show.php
│   ├── compare/index.php
│   ├── favorites/index.php
│   └── errors/404.php
│
├── assets/
│   ├── css/                    # common, home, hero, item, compare, favorite
│   ├── js/                     # main, storage, favorite, compare, search
│   ├── images/{heroes,items,banner}/
│   └── uploads/
│
└── data/                       # dữ liệu gốc
    ├── heroes.json
    ├── items.json
    └── builds.json
```

## 2. Luồng xử lý

```
Trình duyệt: index.php?action=hero-detail&id=1
        │
        ▼
index.php ─ autoload ─ configs ─► routes/index.php
                                       │
                                       ▼
                             HeroController::detail()
                                  │           │
                                  ▼           ▼
                            HeroModel     $title / $view
                          (đọc JSON)          │
                                              ▼
                                    views/main.php
                                  └─► views/heroes/detail.php
```

## 3. Bảng route

| URL | Controller::method | View | Người |
|---|---|---|---|
| `index.php` | `HomeController::index` | `home/index` | 1 |
| `index.php?action=heroes` | `HeroController::index` | `heroes/index` | 2 |
| `index.php?action=hero-detail&id=` | `HeroController::detail` | `heroes/detail` | 2 |
| `index.php?action=items` | `ItemController::index` | `items/index` | 3 |
| `index.php?action=item-detail&id=` | `ItemController::detail` | `items/detail` | 3 |
| `index.php?action=build&hero_id=` | `BuildController::showByHero` | `builds/show` | 3 |
| `index.php?action=compare` | `CompareController::index` | `compare/index` | 4 |
| `index.php?action=favorite` | `FavoriteController::index` | `favorites/index` | 4 |
| route sai | `ErrorController::notFound` | `errors/404` | 4 |

## 4. Quy ước trong Controller

```php
$title = 'Danh sách tướng';   // tiêu đề trang
$css   = 'hero';              // nạp assets/css/hero.css
$js    = 'search';            // nạp assets/js/search.js
$view  = 'heroes/index';      // view con
require_once PATH_VIEW_MAIN;
```

## 5. Chạy dự án

1. Copy thư mục `AOV-HUB` vào `htdocs` (XAMPP) hoặc `www` (Laragon)
2. Bật Apache
3. Mở `http://localhost/AOV-HUB/`

Không cần tạo database. `DB_*` trong `env.php` giữ lại từ base để dành cho Phase 3.

## 6. Phân công

| Thành viên | Phụ trách |
|---|---|
| Người 1 | UI/UX, `views/layouts`, `views/components`, `home/`, `assets/css/common.css` + `home.css` |
| Người 2 | `data/heroes.json`, `HeroModel`, `HeroController`, `views/heroes/`, `hero.css` |
| Người 3 | `data/items.json`, `data/builds.json`, `ItemModel`, `BuildModel`, `ItemController`, `BuildController`, `views/items/`, `views/builds/`, `item.css` |
| Người 4 | `configs/`, `routes/`, `JsonModel`, `ErrorController`, `CompareController`, `FavoriteController`, `assets/js/`, integration test |
