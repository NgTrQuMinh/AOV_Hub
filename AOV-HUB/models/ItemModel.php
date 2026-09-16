<?php

/**
 * ItemModel — Dữ liệu trang bị (data/items.json)
 * Phụ trách: Người 3
 */
class ItemModel extends JsonModel
{
    // TODO: parent::__construct(FILE_ITEMS)
    public function __construct() {}

    // TODO: lọc theo loại trang bị (Công / Phép / Thủ / Giày...)
    public function getByType($type) {}

    // TODO: lấy N trang bị nổi bật cho trang chủ
    public function getFeatured($limit = 8) {}
}
