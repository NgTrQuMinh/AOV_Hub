<?php

/**
 * JsonModel — Lớp cha cho các Model đọc dữ liệu từ file JSON.
 * Phụ trách: Người 4
 *
 * Vì AOV HUB không dùng CSDL nên các Model kế thừa lớp này thay vì BaseModel.
 * BaseModel (PDO) vẫn giữ lại để dành cho Phase 3 khi có backend.
 */
class JsonModel
{
    protected $file;    // đường dẫn file JSON
    protected $data;    // cache dữ liệu sau khi đọc

    // TODO: nhận đường dẫn file JSON
    public function __construct($file) {}

    // TODO: đọc file JSON (dùng read_json) và cache vào $this->data
    protected function loadData() {}

    // TODO: trả về toàn bộ bản ghi
    public function all() {}

    // TODO: tìm 1 bản ghi theo id, không có -> null
    public function find($id) {}

    // TODO: tìm theo name/alias, bỏ dấu, không phân biệt hoa thường
    public function search($keyword) {}

    // TODO: lọc theo mảng điều kiện, vd ['role' => 'Xạ thủ', 'difficulty' => 2]
    public function filter($conditions = []) {}

    // TODO: lấy nhiều bản ghi theo mảng id (dùng cho build đề xuất)
    public function findMany($ids = []) {}
}
