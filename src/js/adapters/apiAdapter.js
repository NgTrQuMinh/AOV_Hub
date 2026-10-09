/**
 * adapters/apiAdapter.js - API adapter stub (sẵn sàng nâng cấp)
 * Giữ interface giống memoryAdapter. MODE='api' sẽ dùng delay 300ms ở Service.
 */
export const apiAdapter = {
  async getAll(name) {
    throw new Error('apiAdapter.getAll not implemented yet');
  },
  async getById(name, id) {
    throw new Error('apiAdapter.getById not implemented yet');
  },
  async create(name, item) {
    throw new Error('apiAdapter.create not implemented yet');
  },
  async update(name, id, updates) {
    throw new Error('apiAdapter.update not implemented yet');
  },
  async remove(name, id) {
    throw new Error('apiAdapter.remove not implemented yet');
  },
  async replaceAll(name, items) {
    throw new Error('apiAdapter.replaceAll not implemented yet');
  },
  async seed(name, items) {
    throw new Error('apiAdapter.seed not implemented yet');
  },
  async reset() {
    // no-op
  },
};
