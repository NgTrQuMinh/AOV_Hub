/**
 * layout.js - Nạp Header/Footer dùng chung + xử lý menu
 * Phụ trách: Người 1
 *
 * Mỗi trang cần có sẵn 2 khối rỗng:
 *   <header id="site-header"></header>
 *   <footer id="site-footer"></footer>
 * và đặt data-page trên <body> để header tự highlight menu đang active, vd:
 *   <body data-page="heroes">
 */
async function includeLayout() {
    const headerSlot = document.getElementById('site-header');
    const footerSlot = document.getElementById('site-footer');

    if (headerSlot) {
        const response = await fetch(BASE_PATH + 'partials/header.html');
        // Thay {{BASE}} trong partial bằng đường dẫn gốc thật của dự án
        headerSlot.innerHTML = (await response.text()).replaceAll('{{BASE}}', BASE_PATH);
        highlightActiveNav();
        initMobileMenu();
    }

    if (footerSlot) {
        const response = await fetch(BASE_PATH + 'partials/footer.html');
        // Thay {{BASE}} trong partial bằng đường dẫn gốc thật của dự án
        footerSlot.innerHTML = (await response.text()).replaceAll('{{BASE}}', BASE_PATH);
        setFooterYear();
    }
}

function highlightActiveNav() {
    const currentPage = document.body.dataset.page || 'home';

    document.querySelectorAll('.site-nav__link').forEach((link) => {
        if (link.dataset.page === currentPage) {
            link.classList.add('is-active');
        }
    });
}

function initMobileMenu() {
    const toggle = document.getElementById('nav-toggle');
    const nav = document.querySelector('.site-nav');

    if (!toggle || !nav) return;

    toggle.addEventListener('change', () => {
        nav.classList.toggle('is-open', toggle.checked);
    });
}

function setFooterYear() {
    const yearEl = document.getElementById('footer-year');

    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }
}

document.addEventListener('DOMContentLoaded', includeLayout);
