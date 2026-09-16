<?php

/**
 * HeroController — Module tướng
 * Phụ trách: Người 2
 */
class HeroController
{
    // Danh sách tướng + tìm kiếm + lọc  (index.php?action=heroes)
    public function index()
    {
        // TODO:
        //  - Nhận $_GET['keyword'], $_GET['role'], $_GET['difficulty']
        //  - Gọi HeroModel: search() / filter() / all()
        //  - Không có kết quả -> truyền cờ để view hiện "Không tìm thấy kết quả"
        //  - $view = 'heroes/index';
    }

    // Chi tiết tướng  (index.php?action=hero-detail&id=1)
    public function detail()
    {
        // TODO:
        //  - $id = $_GET['id'] ?? null
        //  - $hero = (new HeroModel)->find($id)
        //  - Không tìm thấy -> (new ErrorController)->notFound()
        //  - Lấy build đề xuất qua BuildController/ItemModel
        //  - $view = 'heroes/detail';
    }
}
