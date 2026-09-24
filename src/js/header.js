/* ============================================
   HEADER.JS — Header DÙNG CHUNG cho toàn site
   + Điều khiển menu (hamburger) di động.
   - Nạp /header.html qua fetch rồi chèn vào slot.
   - Mọi trang chỉ cần một thẻ <header id="site-header">
     và gọi renderHeader(slot). Đảm bảo trang khác
     dùng chung mà không phải viết lại Header.
   ============================================ */

/** Nạp Header từ /header.html rồi chèn + khởi tạo hành vi. */
export async function renderHeader(slot) {
  if (!slot) return;

  // 1. Chèn trước bản tĩnh (không JS vẫn có menu cơ bản), fetch rồi thay thế.
  slot.innerHTML = headerTemplate();
  try {
    const res = await fetch('/header.html');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    slot.innerHTML = await res.text();
  } catch {
    /* Giữ bản tĩnh khi không fetch được nội dung */
  }

  const header = slot.querySelector('.site-header');
  if (header) {
    highlightActive(header);
    initMenu(header);
    initScrolledShadow(header);
  }
}

/* ---------- Template Header tĩnh (fallback) ---------- */
function headerTemplate() {
  return `
    <header class="site-header" id="site-header">
      <div class="container site-header__inner">
        <a href="index.html" class="site-header__brand" aria-label="AOV HUB về trang chủ">
          <span class="site-header__logo" aria-hidden="true">A</span>
          <span class="site-header__name">AOV<strong>HUB</strong></span>
        </a>

        <nav class="site-header__nav" id="site-menu" aria-label="Điều hướng chính">
          <ul class="site-header__menu">
            <li><a href="index.html" class="nav-link">Trang chủ</a></li>
            <li><a href="heroes.html" class="nav-link">Tướng</a></li>
            <li><a href="items.html" class="nav-link">Trang bị</a></li>
            <li><a href="feed.html" class="nav-link">Feed</a></li>
            <li><a href="builds.html" class="nav-link">Build đồ mẫu</a></li>
          </ul>
        </nav>

        <a href="login.html" class="btn btn--primary site-header__auth">Đăng nhập / Đăng ký</a>

        <button class="site-header__toggle" type="button"
                aria-label="Mở menu" aria-expanded="false" aria-controls="site-menu">
          <span class="site-header__burger" aria-hidden="true"></span>
        </button>
      </div>
    </header>
  `;
}

/* ---------- Tô highlight cho link của trang hiện tại ---------- */
function highlightActive(header) {
  const current = (location.pathname.split('/').pop() || 'index.html');
  header.querySelectorAll('.nav-link').forEach((link) => {
    const target = link.getAttribute('href');
    if (target === current || (current === 'index.html' && target === 'index.html')) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  });
}

/* ---------- Hamburger: mở/đóng menu ---------- */
function initMenu(header) {
  const toggle = header.querySelector('.site-header__toggle');
  const menu = header.querySelector('.site-header__nav');
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    menu.classList.toggle('is-open', open);
    toggle.classList.toggle('is-active', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu');
  };

  toggle.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));

  // Đóng menu khi bấm vào một link bên trong
  menu.querySelectorAll('a').forEach((link) =>
    link.addEventListener('click', () => setOpen(false))
  );

  // Đóng menu khi bấm ra ngoài header
  document.addEventListener('click', (e) => {
    if (!header.contains(e.target)) setOpen(false);
  });

  // Đóng menu khi bấm phím Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
}

/* ---------- Đổ bóng header khi cuộn xuống ---------- */
function initScrolledShadow(header) {
  const apply = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', apply, { passive: true });
  apply();
}
