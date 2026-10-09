/**
 * models/schema.js - Validate đơn giản
 */
import { ROLE } from '../core/constants.js';

export function validateUser(user) {
  if (!user || typeof user !== 'object') return { ok: false, errors: ['user không hợp lệ'] };
  const username = String(user.username || '').trim();
  if (username.length < 3) return { ok: false, errors: ['username tối thiểu 3 ký tự'] };
  const role = user.role === ROLE.ADMIN ? ROLE.ADMIN : ROLE.USER;
  return { ok: true, data: { ...user, username, role } };
}

export function validatePost(post) {
  if (!post || typeof post !== 'object') return { ok: false, errors: ['post không hợp lệ'] };
  const title = String(post.title || '').trim();
  const content = String(post.content || '').trim();
  if (!title) return { ok: false, errors: ['thiếu tiêu đề'] };
  if (!content) return { ok: false, errors: ['thiếu nội dung'] };
  return { ok: true, data: { ...post, title, content } };
}
