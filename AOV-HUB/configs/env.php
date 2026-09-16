<?php

define('BASE_URL',          'http://localhost/AOV-HUB/');

define('PATH_ROOT',         __DIR__ . '/../');

define('PATH_VIEW',         PATH_ROOT . 'views/');
define('PATH_VIEW_MAIN',    PATH_ROOT . 'views/main.php');

define('PATH_CONTROLLER',   PATH_ROOT . 'controllers/');
define('PATH_MODEL',        PATH_ROOT . 'models/');

define('BASE_ASSETS',           BASE_URL . 'assets/');
define('BASE_ASSETS_UPLOADS',   BASE_URL . 'assets/uploads/');
define('PATH_ASSETS_UPLOADS',   PATH_ROOT . 'assets/uploads/');

// ===== Dữ liệu JSON (AOV HUB không dùng CSDL) =====
define('PATH_DATA',     PATH_ROOT . 'data/');
define('FILE_HEROES',   PATH_DATA . 'heroes.json');
define('FILE_ITEMS',    PATH_DATA . 'items.json');
define('FILE_BUILDS',   PATH_DATA . 'builds.json');

// ===== Danh mục dùng chung =====
define('HERO_ROLES',    ['Đấu sĩ', 'Đỡ đòn', 'Pháp sư', 'Sát thủ', 'Xạ thủ', 'Hỗ trợ']);
define('ITEM_TYPES',    ['Công', 'Phép', 'Thủ', 'Giày', 'Phù hiệu']);
define('DIFFICULTY',    [1 => 'Dễ', 2 => 'Trung bình', 3 => 'Khó']);

// ===== Key LocalStorage (dùng chung với assets/js/storage.js) =====
define('KEY_FAVORITES', 'aov_favorites');
define('KEY_HISTORY',   'aov_history');
define('KEY_COMPARE',   'aov_compare');

// ===== Cấu hình CSDL: giữ lại từ base, dự án AOV HUB CHƯA dùng =====
define('DB_HOST',     'localhost');
define('DB_PORT',     '3306');
define('DB_USERNAME', 'root');
define('DB_PASSWORD', '');
define('DB_NAME',     '');
define('DB_OPTIONS', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
