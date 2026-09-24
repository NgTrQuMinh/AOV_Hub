/* ============================================
   HEROES.JS — Render lưới "Tướng nổi bật" trang chủ.
   - Đọc mock data src/data/heroes.json.
   - Mọi trang có một slot #heroes-grid rồi gọi
     renderHeroesGrid(slot) để render dùng chung.
   ============================================ */

import heroes from '../data/heroes.json';

/** Render toàn bộ tướng vào grid đã cho. */
export function renderHeroesGrid(grid) {
  if (!grid) return;
  grid.innerHTML = heroes.heroes.map(heroCard).join('');
}

/* ---------- Template một card tướng ---------- */
function heroCard(hero) {
  return `
    <article class="hero-card" style="--hero-color:${hero.color}" tabindex="0">
      <div class="hero-card__media">
        <span class="hero-card__art" style="background:${hero.color}">${hero.emoji}</span>
        <span class="hero-card__price">${hero.price}</span>
      </div>
      <div class="hero-card__body">
        <h3 class="hero-card__name">${hero.name}</h3>
        <div class="hero-card__meta">
          <span class="badge ${roleClass(hero.role)}">${hero.role}</span>
          <span class="hero-card__lane">${hero.lane}</span>
        </div>
        <p class="hero-card__tag">${hero.tag}</p>
        <p class="hero-card__desc">${hero.desc}</p>
        <div class="hero-card__foot">
          <span class="hero-card__stars" aria-label="Độ khó ${hero.difficulty}/5" role="img">${stars(hero.difficulty)}</span>
          <a href="heroes.html" class="link-arrow">Xem tướng <span aria-hidden="true">→</span></a>
        </div>
      </div>
    </article>
  `;
}

/* ---------- Class badge theo vai trò ---------- */
function roleClass(role) {
  const map = {
    'Sát thủ': 'badge--assassin',
    'Đấu sĩ': 'badge--warrior',
    'Pháp sư': 'badge--mage',
    'Xạ thủ': 'badge--marksman',
    'Trợ thủ': 'badge--support',
    'Đỡ đòn': 'badge--tank',
  };
  return map[role] || 'badge--neutral';
}

/* ---------- Chuỗi sao ★ theo độ khó ---------- */
function stars(n) {
  const filled = Math.max(0, Math.min(5, n));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}
