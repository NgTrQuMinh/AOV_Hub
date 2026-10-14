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
        try {
            const response = await fetch(BASE_PATH + 'partials/header.html');
            // Thay {{BASE}} trong partial bằng đường dẫn gốc thật của dự án
            headerSlot.innerHTML = (await response.text()).replaceAll('{{BASE}}', BASE_PATH);
            highlightActiveNav();
            initMobileMenu();
            // Khu vực tài khoản (Đăng nhập/Đăng ký hoặc username + Đăng xuất) do auth.js lo.
            if (typeof updateAccountUI === 'function') updateAccountUI();
        } catch (error) {
            console.warn('Không nạp được header:', error);
        }
    }

    if (footerSlot) {
        try {
            const response = await fetch(BASE_PATH + 'partials/footer.html');
            // Thay {{BASE}} trong partial bằng đường dẫn gốc thật của dự án
            footerSlot.innerHTML = (await response.text()).replaceAll('{{BASE}}', BASE_PATH);
            setFooterYear();
        } catch (error) {
            console.warn('Không nạp được footer:', error);
        }
    }
}

function highlightActiveNav() {
    const currentPage = document.body.dataset.page || 'home';

    document.querySelectorAll('.site-nav__link').forEach((link) => {
        const isActive = link.dataset.page === currentPage;
        link.classList.toggle('is-active', isActive);
        if (isActive) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    });
}

function initMobileMenu() {
    const toggle = document.querySelector('.nav-toggle__btn');
    const nav = document.querySelector('.site-nav');

    if (!toggle || !nav) return;

    const setOpen = (isOpen) => {
        nav.classList.toggle('is-open', isOpen);
        toggle.setAttribute('aria-expanded', String(isOpen));
    };

    toggle.addEventListener('click', () => {
        setOpen(!nav.classList.contains('is-open'));
    });

    // Đóng menu khi bấm 1 mục điều hướng (chuẩn bị chuyển trang).
    nav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => setOpen(false));
    });

    // Đóng menu khi bấm ra ngoài hoặc nhấn Escape (trả tiêu điểm về nút).
    document.addEventListener('click', (event) => {
        if (nav.classList.contains('is-open')
            && !nav.contains(event.target) && !toggle.contains(event.target)) {
            setOpen(false);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && nav.classList.contains('is-open')) {
            setOpen(false);
            toggle.focus();
        }
    });
}

function setFooterYear() {
    const yearEl = document.getElementById('footer-year');

    if (yearEl) {
        yearEl.textContent = new Date().getFullYear();
    }
}

document.addEventListener('DOMContentLoaded', includeLayout);
