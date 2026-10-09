/**
 * core/result.js - Chuẩn hóa response cho Service layer
 * Áp dụng có chọn lọc: CHỈ dùng cho Services, không ép legacy.
 */
export function ok(data, message = '') {
  return {
    success: true,
    data,
    message: String(message || ''),
  };
}

export function fail(message, data = null) {
  return {
    success: false,
    data,
    message: String(message || 'Thao tác thất bại'),
  };
}
