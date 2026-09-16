<?php

/**
 * Điều hướng — Phụ trách: Người 4
 * URL dạng: index.php?action=heroes&id=1
 */

$action = $_GET['action'] ?? '/';

match ($action) {
    // Trang chủ — Người 1
    '/'             => (new HomeController)->index(),

    // Tướng — Người 2
    'heroes'        => (new HeroController)->index(),
    'hero-detail'   => (new HeroController)->detail(),

    // Trang bị — Người 3
    'items'         => (new ItemController)->index(),
    'item-detail'   => (new ItemController)->detail(),

    // Build đề xuất — Người 3
    'build'         => (new BuildController)->showByHero(),

    // So sánh — Người 4
    'compare'       => (new CompareController)->index(),

    // Yêu thích / Lịch sử — Người 4
    'favorite'      => (new FavoriteController)->index(),

    // Không khớp route nào
    default         => (new ErrorController)->notFound(),
};
