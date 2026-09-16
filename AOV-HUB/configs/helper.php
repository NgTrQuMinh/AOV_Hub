<?php

/**
 * Helper dùng chung — Phụ trách: Người 4
 * Giữ nguyên debug() và upload_file() từ base, bổ sung helper cho AOV HUB.
 */

if (!function_exists('debug')) {
    function debug($data)
    {
        echo '<pre>';
        print_r($data);
        die;
    }
}

if (!function_exists('upload_file')) {
    function upload_file($folder, $file)
    {
        $targetFile = $folder . '/' . time() . '-' . $file["name"];

        if (move_uploaded_file($file["tmp_name"], PATH_ASSETS_UPLOADS . $targetFile)) {
            return $targetFile;
        }

        throw new Exception('Upload file không thành công!');
    }
}

if (!function_exists('read_json')) {
    // TODO (Người 4): đọc file JSON -> mảng PHP, file lỗi/không tồn tại -> trả về []
    function read_json($file) {}
}

if (!function_exists('remove_accents')) {
    // TODO (Người 4): bỏ dấu tiếng Việt để phục vụ tìm kiếm ("Ngộ Không" -> "ngo khong")
    function remove_accents($str) {}
}

if (!function_exists('format_price')) {
    // TODO (Người 4): 2040 -> 2.040
    function format_price($number) {}
}

if (!function_exists('redirect')) {
    // TODO (Người 4): header Location + die
    function redirect($action = '/') {}
}

if (!function_exists('asset')) {
    // TODO (Người 4): trả về BASE_ASSETS . $path
    function asset($path) {}
}
