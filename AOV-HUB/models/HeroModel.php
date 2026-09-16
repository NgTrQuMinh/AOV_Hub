<?php

/**
 * HeroModel — Dữ liệu tướng (data/heroes.json)
 * Phụ trách: Người 2
 */
class HeroModel extends JsonModel
{
    // TODO: parent::__construct(FILE_HEROES)
    public function __construct() {}

    // TODO: lọc tướng theo vai trò
    public function getByRole($role) {}

    // TODO: lọc tướng theo độ khó (1/2/3)
    public function getByDifficulty($level) {}

    // TODO: lấy N tướng nổi bật cho trang chủ
    public function getFeatured($limit = 8) {}

    // TODO: lấy mảng id trang bị đề xuất của 1 tướng
    public function getRecommendedBuild($heroId) {}
}
