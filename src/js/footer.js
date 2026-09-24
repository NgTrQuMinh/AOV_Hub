/* ============================================
   FOOTER.JS — Footer DÙNG CHUNG cho toàn site.
   - Nạp /footer.html qua fetch rồi chèn vào slot.
   - Mọi trang chỉ cần một thẻ <footer id="site-footer">
     rồi gọi renderFooter(slot).
   ============================================ */

/** Nạp Footer từ /footer.html rồi chèn vào slot. */
export async function renderFooter(slot) {
  if (!slot) return;

  slot.innerHTML = footerTemplate();
  try {
    const res = await fetch('/footer.html');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    slot.innerHTML = await res.text();
  } catch {
    /* Giữ bản tĩnh khi không fetch được nội dung */
  }
}

/* ---------- Template Footer tĩnh (fallback) ---------- */
function footerTemplate() {
  return `
    <footer class="site-footer">
      <div class="container site-footer__grid">
        <div class="site-footer__brand">
          <a href="index.html" class="site-footer__logo-wrap" aria-label="AOV HUB về trang chủ">
            <span class="site-footer__logo" aria-hidden="true">A</span>
            <span class="site-footer__name">AOV<strong>HUB</strong></span>
          </a>
          <p class="site-footer__slogan">
            Cổng thông tin tra cứu tướng, trang bị và cộng đồng
            Liên Quân Mobile — nơi game thủ Việt tìm thấy điều cần thiết.
          </p>
        </div>

        <nav class="site-footer__col" aria-label="Liên kết nhanh">
          <h2 class="site-footer__heading">Liên kết nhanh</h2>
          <ul>
            <li><a href="index.html">Trang chủ</a></li>
            <li><a href="heroes.html">Tra cứu tướng</a></li>
            <li><a href="items.html">Trang bị</a></li>
            <li><a href="feed.html">Feed</a></li>
            <li><a href="builds.html">Build đồ mẫu</a></li>
          </ul>
        </nav>

        <nav class="site-footer__col" aria-label="Thông tin nhóm">
          <h2 class="site-footer__heading">Về dự án</h2>
          <ul>
            <li><a href="about.html">Giới thiệu</a></li>
            <li><a href="login.html">Đăng nhập / Đăng ký</a></li>
            <li><a href="contact.html">Liên hệ</a></li>
          </ul>
        </nav>

        <div class="site-footer__col">
          <h2 class="site-footer__heading">Nhóm dự án</h2>
          <ul class="site-footer__team">
            <li><span>🎧</span> Trần Anh Thư — Thiết kế / Frontend</li>
            <li><span>💻</span> Nguyễn Tuấn Anh — Frontend / Dữ liệu</li>
            <li><span>🎨</span> Minh Quân — UI / Nội dung</li>
          </ul>
          <p class="site-footer__year">© 2026 AOV HUB. Dành cho mục đích học tập.</p>
        </div>
      </div>
    </footer>
  `;
}
