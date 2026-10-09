/**
 * services/dataService.js - Facade truy cập dữ liệu (API-First shape)
 * MODE: 'memory' | 'api' (mặc định 'memory' để không phá test/UX)
 */
import { memoryAdapter } from '../adapters/memoryAdapter.js';
import { apiAdapter } from '../adapters/apiAdapter.js';
import { delay } from '../core/utils.js';
import { ok, fail } from '../core/result.js';

const MODE = 'memory'; // chỉ bật 'api' khi có API thật

let adapter = MODE === 'api' ? apiAdapter : memoryAdapter;

export function setDataMode(mode = 'memory') {
  adapter = mode === 'api' ? apiAdapter : memoryAdapter;
}

export function getDataMode() {
  return MODE;
}

async function withDelay(p) {
  if (MODE === 'api') await delay(300);
  return p;
}

export const dataService = {
  async getAll(name) {
    try {
      const data = await adapter.getAll(name);
      return withDelay(Promise.resolve(ok(data)));
    } catch (err) {
      return withDelay(Promise.resolve(fail(err?.message || 'Không đọc được dữ liệu')));
    }
  },

  async getById(name, id) {
    try {
      const data = await adapter.getById(name, id);
      return withDelay(Promise.resolve(data ? ok(data) : fail('Không tìm thấy')));
    } catch (err) {
      return withDelay(Promise.resolve(fail(err?.message || 'Lỗi truy cập dữ liệu')));
    }
  },

  async create(name, item) {
    try {
      const data = await adapter.create(name, item);
      return withDelay(Promise.resolve(ok(data, 'Tạo thành công')));
    } catch (err) {
      return withDelay(Promise.resolve(fail(err?.message || 'Không tạo được')));
    }
  },

  async update(name, id, updates) {
    try {
      const data = await adapter.update(name, id, updates);
      return withDelay(Promise.resolve(data ? ok(data, 'Cập nhật thành công') : fail('Không tìm thấy')));
    } catch (err) {
      return withDelay(Promise.resolve(fail(err?.message || 'Không cập nhật được')));
    }
  },

  async remove(name, id) {
    try {
      const okDel = await adapter.remove(name, id);
      return withDelay(Promise.resolve(okDel ? ok(true, 'Xóa thành công') : fail('Không tìm thấy')));
    } catch (err) {
      return withDelay(Promise.resolve(fail(err?.message || 'Không xóa được')));
    }
  },

  async replaceAll(name, items) {
    try {
      const data = await adapter.replaceAll(name, items);
      return withDelay(Promise.resolve(ok(data)));
    } catch (err) {
      return withDelay(Promise.resolve(fail(err?.message || 'Không ghi được dữ liệu')));
    }
  },

  async seed(name, items) {
    try {
      const data = await adapter.seed(name, items);
      return withDelay(Promise.resolve(ok(data)));
    } catch (err) {
      return withDelay(Promise.resolve(fail(err?.message || 'Không seed được dữ liệu')));
    }
  },
};
