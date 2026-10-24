import { test, expect, Page } from '@playwright/test';

/**
 * Kiểm tra khối "Build khác của tướng này" trên trình duyệt thật:
 * seed 2 build cộng đồng cùng tướng với build id=1, 1 build của tướng khác,
 * rồi kiểm tra hiển thị, link và tràn ngang ở các kích thước màn hình.
 */

const COMMUNITY_BUILDS = [
    {
        id: 9001,
        heroId: 1,
        name: 'Build cộng đồng A',
        lane: 'Đường Rồng',
        playstyle: 'Build thử nghiệm cùng tướng.',
        items: [101, 102, 103],
        skillOrder: '1-2-3',
        source: 'community',
        author: 'demo',
        createdAt: '2026-10-20T00:00:00.000Z',
    },
    {
        id: 9002,
        heroId: 1,
        name: 'Build cộng đồng B',
        lane: 'Rừng',
        playstyle: 'Một hướng lên đồ khác.',
        items: [101, 102],
        skillOrder: '2-1-3',
        source: 'community',
        author: 'demo',
        createdAt: '2026-10-21T00:00:00.000Z',
    },
    {
        id: 9003,
        heroId: 2,
        name: 'Build của tướng khác',
        lane: 'Đường Giữa',
        playstyle: 'Không được xuất hiện.',
        items: [101],
        source: 'community',
        author: 'demo',
        createdAt: '2026-10-22T00:00:00.000Z',
    },
];

async function seedCommunityBuilds(page: Page) {
    await page.addInitScript((rows) => {
        window.localStorage.setItem('aov_build_submissions', JSON.stringify(rows));
    }, COMMUNITY_BUILDS);
}

for (const width of [360, 768, 1280]) {
    test(`build khác của tướng không tràn ngang @ ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await seedCommunityBuilds(page);
        await page.goto('/src/pages/build-detail.html?id=1', { waitUntil: 'load' });

        const section = page.locator('.build-detail__related-section');
        await expect(section).toBeVisible();
        await expect(section.locator('.related-build')).toHaveCount(2);

        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
    });
}

test('build khác của tướng chỉ gồm cùng heroId và mở đúng build', async ({ page }) => {
    await seedCommunityBuilds(page);
    await page.goto('/src/pages/build-detail.html?id=1', { waitUntil: 'load' });

    const section = page.locator('.build-detail__related-section');
    await expect(section).toBeVisible();
    await expect(section).toContainText('Build cộng đồng A');
    await expect(section).toContainText('Build cộng đồng B');
    await expect(section).not.toContainText('Build của tướng khác');

    const hrefs = await section.locator('.related-build__link').evaluateAll(
        (links) => links.map((link) => link.getAttribute('href')),
    );
    expect(hrefs.some((href) => href.endsWith('build-detail.html?id=1'))).toBe(false);
    expect(hrefs.some((href) => href.endsWith('build-detail.html?id=9001'))).toBe(true);
    expect(hrefs.some((href) => href.endsWith('build-detail.html?id=9002'))).toBe(true);
    expect(hrefs.some((href) => href.endsWith('build-detail.html?id=9003'))).toBe(false);

    await section.locator('.related-build__link').filter({ hasText: 'Build cộng đồng A' }).click();
    await page.waitForURL(/build-detail\.html\?id=9001$/);
    await expect(page.locator('.build-detail__name')).toHaveText('Build cộng đồng A');
});
