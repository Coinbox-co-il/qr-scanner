import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests', timeout: 30_000, fullyParallel: true,
    forbidOnly: !!process.env.CI, retries: 0, workers: process.env.CI ? 3 : 4,
    reporter: 'list', use: { headless: true },
    projects: [{ name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } }],
});
