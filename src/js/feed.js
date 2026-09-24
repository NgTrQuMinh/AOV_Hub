/* ============================================
   FEED.JS — Render khối "Feed mới nhất" trang chủ.
   - Đọc mock data src/data/feed.json.
   - Mọi trang có slot #feed-list rồi gọi
     renderFeedList(slot) để render dùng chung.
   ============================================ */

import posts from '../data/feed.json';

/** Render các bài viết mới nhất vào list đã cho. */
export function renderFeedList(list) {
  if (!list) return;
  list.innerHTML = posts.posts.map(feedItem).join('');
}

/* ---------- Template một mục feed ---------- */
function feedItem(post) {
  return `
    <article class="feed-item">
      <a href="feed.html" class="feed-item__media">
        <span class="feed-item__thumb" style="background:${post.color};color:${post.color}">
          ${post.emoji}
        </span>
        <span class="badge badge--static" style="background:${post.color};color:#fff">${post.tag}</span>
      </a>
      <div class="feed-item__body">
        <h3 class="feed-item__title"><a href="feed.html">${post.title}</a></h3>
        <div class="feed-item__meta">
          <span class="feed-item__author" aria-label="Tác giả ${post.author}">
            <span class="feed-item__avatar" aria-hidden="true">${post.avatar}</span>
            ${post.author}
          </span>
          <time class="feed-item__date" datetime="${post.date}">${formatDate(post.date)}</time>
        </div>
        <p class="feed-item__excerpt">${post.excerpt}</p>
        <div class="feed-item__stats" aria-label="Số lượt tương tác">
          <span class="feed-item__stat" title="Lượt xem">👁 ${post.views}</span>
          <span class="feed-item__stat" title="Thích">❤ ${post.likes}</span>
          <span class="feed-item__stat" title="Bình luận">💬 ${post.comments}</span>
        </div>
      </div>
    </article>
  `;
}

/* ---------- Format ngày "18/12/2025" ---------- */
function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
