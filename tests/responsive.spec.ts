import { test, expect, Page } from '@playwright/test';

/**
 * Test trình duyệt thật cho đáp ứng (responsive) của AOV HUB.
 *
 * Với mỗi trang x mỗi kích thước màn hình, kiểm tra:
 *   1. Trang KHÔNG tràn ngang (documentElement.scrollWidth <= innerWidth).
 *   2. Phần nội dung chính được nạp (dựa theo selector "ready" của từng trang).
 *
 * Cùng với đó là 2 test cho menu mobile (nút mở menu chỉ hiện ở màn nhỏ).
 *
 * Chạy: npm run test:e2e  (tự khởi động Vite dev server)
 * Cài trình duyệt lần đầu: npm run test:e2e:install
 */

type Account = 'user' | 'admin';

interface PageSpec {
    name: string;
    url: string;
    ready: string;
    account?: Account;
}

const VIEWPORTS = [
    { name: 'mobile-360', width: 360, height: 640 },
    { name: 'mobile-480', width: 480, height: 800 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'laptop-1024', width: 1024, height: 768 },
    { name: 'desktop-1280', width: 1280, height: 800 },
];

const PAGES: PageSpec[] = [
    { name: 'home', url: '/index.html', ready: '#site-header .site-nav' },
    { name: 'heroes', url: '/src/pages/heroes.html', ready: '#hero-list .hero-card__link' },
    { name: 'hero-detail', url: '/src/pages/hero-detail.html?id=1', ready: '.hero-detail-header h1' },
    { name: 'items', url: '/src/pages/items.html', ready: '#item-list .item-card' },
    { name: 'item-detail', url: '/src/pages/item-detail.html?id=101', ready: '.item-detail__name' },
    { name: 'builds', url: '/src/pages/builds.html', ready: '#build-list .build-card' },
    { name: 'search', url: '/src/pages/search.html?keyword=Valhein', ready: '#search-results .search-group__title' },
    { name: 'feed', url: '/src/pages/feed.html', ready: '#feed-list .post-card' },
    { name: 'post-detail', url: '/src/pages/post-detail.html?id=9001', ready: '#post-detail .post-detail__title' },
    { name: 'compare', url: '/src/pages/compare.html', ready: '#compare-select' },
    { name: 'favorite', url: '/src/pages/favorite.html', ready: '#favorite-list' },
    { name: 'login', url: '/src/pages/login.html', ready: '#login-form' },
    { name: 'register', url: '/src/pages/register.html', ready: '#register-form' },
    { name: '404', url: '/src/pages/404.html', ready: '#not-found-content' },
    { name: 'profile', url: '/src/pages/profile.html', ready: '#profile-username', account: 'user' },
    { name: 'admin', url: '/src/pages/admin.html', ready: '#admin-list', account: 'admin' },
];

async function seedAccount(page: Page, account: Account) {
    const username = account === 'admin' ? 'admin' : 'demo';
    await page.addInitScript((name) => {
        window.localStorage.setItem('aov_current_user', name);
    }, username);
}

for (const viewport of VIEWPORTS) {
    test.describe(`viewport ${viewport.name} (${viewport.width}px)`, () => {
        test.use({ viewport: { width: viewport.width, height: viewport.height } });

        for (const spec of PAGES) {
            test(`${spec.name} không tràn ngang`, async ({ page }) => {
                if (spec.account) await seedAccount(page, spec.account);

                await page.goto(spec.url, { waitUntil: 'load' });
                await page.waitForSelector(spec.ready, { state: 'attached', timeout: 15_000 });
                await page.evaluate(() => (document.fonts ? document.fonts.ready : undefined));

                const { scrollWidth, innerWidth } = await page.evaluate(() => ({
                    scrollWidth: document.documentElement.scrollWidth,
                    innerWidth: window.innerWidth,
                }));
                expect(
                    scrollWidth,
                    `${spec.name} @ ${viewport.width}px: scrollWidth=${scrollWidth} > innerWidth=${innerWidth}`
                ).toBeLessThanOrEqual(innerWidth + 2);
            });
        }
    });
}

test.describe('menu mobile', () => {
    test('hiện nút mở menu và mở được ở 360px', async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 640 });
        await page.goto('/index.html', { waitUntil: 'load' });
        await page.waitForSelector('#site-header .nav-toggle__btn', { state: 'visible' });

        await expect(page.locator('#site-header .nav-toggle__btn')).toBeVisible();
        await page.click('button.nav-toggle__btn');
        await expect(page.locator('.site-nav')).toHaveClass(/is-open/);
        await expect(page.locator('#site-header .nav-toggle__btn')).toHaveAttribute('aria-expanded', 'true');
    });

    test('menu nằm ngang, không cần nút ở 1280px', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/index.html', { waitUntil: 'load' });
        await page.waitForSelector('#site-header .site-nav', { state: 'visible' });
        await expect(page.locator('#site-header .nav-toggle__btn')).toBeHidden();
    });
});
