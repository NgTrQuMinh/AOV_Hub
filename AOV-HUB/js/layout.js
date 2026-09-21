/**
 * layout.js - Nạp Header/Footer dùng chung + xử lý menu
 * Phụ trách: Người 1 (TV1) — Task 8, 9
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
        headerSlot.classList.add('site-header');

        const response = await fetch('/partials/header.html');
        headerSlot.innerHTML = await response.text();

        highlightActiveNav();
        initMobileMenu();
        initHeaderSearch();

        // Cập nhật khu vực Account (đăng nhập/đăng ký hoặc username/profile/đăng xuất)
        // updateAccountUI() được định nghĩa ở js/auth.js — TV1
        if (typeof updateAccountUI === 'function') {
            updateAccountUI();
        }
    }

    if (footerSlot) {
        footerSlot.classList.add('site-footer');

        const response = await fetch('/partials/footer.html');
        footerSlot.innerHTML = await response.text();

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

    // Bấm vào 1 mục menu thì đóng menu trên mobile
    nav.addEventListener('click', (event) => {
        if (event.target.closest('.site-nav__link')) {
            toggle.checked = false;
            nav.classList.remove('is-open');
        }
    });
}

/**
 * Ô tìm kiếm trên Header: mặc định tìm Tướng, nếu đang ở trang Trang bị thì tìm Trang bị.
 */
function initHeaderSearch() {
    const form = document.querySelector('.header-search');
    if (!form) return;

    const currentPage = document.body.dataset.page;

    if (currentPage === 'items') {
        form.setAttribute('action', '/pages/items.html');
    } else if (currentPage === 'builds') {
        form.setAttribute('action', '/pages/builds.html');
    }
}

function setFooterYear() {
    const yearEl = document.getElementById('footer-year');

    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }
}

document.addEventListener('DOMContentLoaded', includeLayout);
