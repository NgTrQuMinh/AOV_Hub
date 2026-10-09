/**
 * core/constants.js - Constants dùng chung (tránh magic string)
 */
export const ROLE = {
  ADMIN: 'admin',
  USER: 'user',
};

export const COLLECTIONS = {
  USERS: 'users',
  POSTS: 'posts',
  COMMENTS: 'comments',
  LIKES: 'likes',
  HEROES: 'heroes',
  ITEMS: 'items',
  BUILDS: 'builds',
};

export const STORAGE_KEYS = {
  CURRENT_USER: 'aov_current_user',
  SESSION_USER: 'aov_session',
  FAVORITES: 'aov_favorites',
  HISTORY: 'aov_history',
  COMPARE: 'aov_compare',
  MOD_SETTINGS: 'aov_mod_settings',
  POSTS_SEEDED: 'aov_posts_seeded',
};

export const DATASTORE_DRAFT_PREFIX = 'aov_draft_';
export const HISTORY_LIMIT = 10;
export const COMPARE_LIMIT = 2;
export const PASSWORD_HASH_ITERATIONS = 100000;
export const PASSWORD_HASH_BYTES = 32;
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 64;
export const VALID_USERNAME = /^[\p{L}\p{N}_.-]{3,30}$/u;
