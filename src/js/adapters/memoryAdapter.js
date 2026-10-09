/**
 * adapters/memoryAdapter.js - In-memory adapter
 * CRUD đơn giản trên DB.state. Giữ API async để sẵn sàng swap sang apiAdapter.
 */
import { getDB } from '../core/db.js';
import { deepClone, normalizeId } from '../core/utils.js';

const COLLECTION_MAP = {
  users: 'users',
  posts: 'posts',
  comments: 'comments',
  likes: 'likes',
  heroes: 'heroes',
  items: 'items',
  builds: 'builds',
};

function getState() {
  return getDB().state;
}

function ensureCollection(name) {
  const key = COLLECTION_MAP[name];
  if (!key) throw new Error(`Collection không hợp lệ: ${name}`);
  return key;
}

export const memoryAdapter = {
  async getAll(name) {
    const key = ensureCollection(name);
    const val = getState()[key];
    if (Array.isArray(val)) return deepClone(val);
    if (val && typeof val === 'object') return deepClone(val);
    return deepClone(val);
  },

  async getById(name, id) {
    const key = ensureCollection(name);
    const val = getState()[key];
    if (Array.isArray(val)) {
      const target = val.find((item) => normalizeId(item && item.id) === normalizeId(id));
      return target ? deepClone(target) : null;
    }
    return null;
  },

  async create(name, item) {
    const key = ensureCollection(name);
    const val = getState()[key];
    if (Array.isArray(val)) {
      const copy = deepClone(item);
      val.push(copy);
      return deepClone(copy);
    }
    // likes là object
    if (key === 'likes' && val && typeof val === 'object') {
      const id = normalizeId(item && item.postId);
      if (id) {
        val[id] = Array.isArray(item.users) ? [...item.users] : [];
        return deepClone({ postId: id, users: val[id] });
      }
    }
    return deepClone(item);
  },

  async update(name, id, updates) {
    const key = ensureCollection(name);
    const val = getState()[key];
    if (Array.isArray(val)) {
      const idx = val.findIndex((item) => normalizeId(item && item.id) === normalizeId(id));
      if (idx === -1) return null;
      val[idx] = { ...val[idx], ...updates };
      return deepClone(val[idx]);
    }
    if (key === 'likes' && val && typeof val === 'object') {
      const pid = normalizeId(id);
      if (pid) {
        val[pid] = { ...(val[pid] || {}), ...(updates || {}) };
        return deepClone({ postId: pid, ...val[pid] });
      }
    }
    return null;
  },

  async remove(name, id) {
    const key = ensureCollection(name);
    const val = getState()[key];
    if (Array.isArray(val)) {
      const before = val.length;
      const filtered = val.filter((item) => normalizeId(item && item.id) !== normalizeId(id));
      getState()[key] = filtered;
      return filtered.length < before;
    }
    if (key === 'likes' && val && typeof val === 'object') {
      const pid = normalizeId(id);
      if (pid && Object.prototype.hasOwnProperty.call(val, pid)) {
        delete val[pid];
        return true;
      }
    }
    return false;
  },

  async replaceAll(name, items) {
    const key = ensureCollection(name);
    const val = getState()[key];
    if (Array.isArray(val)) {
      getState()[key] = Array.isArray(items) ? deepClone(items) : [];
      return getState()[key];
    }
    if (key === 'likes' && val && typeof val === 'object') {
      const next = items && typeof items === 'object' ? items : {};
      getState()[key] = deepClone(next);
      return getState()[key];
    }
    getState()[key] = items;
    return items;
  },

  async seed(name, items) {
    return this.replaceAll(name, items);
  },

  async reset() {
    // resetDB handled by core/db
  },
};
