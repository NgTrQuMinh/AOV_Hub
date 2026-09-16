<?php

/**
 * ItemController — Module trang bị
 * Phụ trách: Người 3
 */
class ItemController
{
    // Danh sách trang bị + tìm kiếm + lọc  (index.php?action=items)
    public function index()
    {
        // TODO: nhận $_GET['keyword'], $_GET['type'] -> ItemModel -> $view = 'items/index';
    }

    // Chi tiết trang bị  (index.php?action=item-detail&id=101)
    public function detail()
    {
        // TODO: find($id); không có -> ErrorController::notFound(); $view = 'items/detail';
    }
}
