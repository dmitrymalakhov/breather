import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/browser', timeout: 30000, workers: 1, use: { baseURL: 'http://127.0.0.1:4319', browserName: 'chromium', channel: 'chrome', headless: true, launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } }, webServer: [
  { command: 'node --import tsx tests/browser/demo-server.ts', url: 'http://127.0.0.1:4319', reuseExistingServer: false, timeout: 15000 },
  { command: 'node --import tsx tests/browser/live-server.ts', url: 'http://127.0.0.1:4318', reuseExistingServer: false, timeout: 15000 },
] });
