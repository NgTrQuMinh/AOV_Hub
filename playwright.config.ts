import { defineConfig, devices } from '@playwright/test';

/**
 * Cấu hình test trình duyệt thật cho AOV HUB (Excel L21 / N08 / STT 50).
 *
 * - Tự khởi động Vite dev server (npm run dev) trước khi chạy test.
 * - Tái dùng server đang chạy nếu có (reuseExistingServer) để chạy nhanh khi dev.
 * - Mặc định chỉ chạy Chromium; các viewport (mobile/tablet/laptop) được đặt
 *   trong từng test ở tests/responsive.spec.ts.
 */
export default defineConfig({
    testDir: './tests',
    timeout: 30_000,
    expect: { timeout: 5_000 },
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: [['list']],
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'off',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
