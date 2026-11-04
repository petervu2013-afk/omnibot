import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

export const STACK_DIR = join(tmpdir(), 'omnibot-e2e-outbox');
export const OUTBOX = join(STACK_DIR, '.outbox');
const repo = fileURLToPath(new URL('../..', import.meta.url));

// Uses the installed Google Chrome (developer machines and GitHub runners), so no browser download is needed.
export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.js',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', channel: 'chrome', locale: 'vi-VN', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'node apps/api/scripts/e2e-stack.mjs',
      cwd: repo,
      url: 'http://127.0.0.1:3100/health',
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      reuseExistingServer: false,
      env: { E2E_OUTBOX_DIR: STACK_DIR },
    },
    {
      command: 'node node_modules/vite/bin/vite.js --port 5199 --strictPort',
      url: 'http://localhost:5199',
      timeout: 60_000,
      reuseExistingServer: false,
      env: { API_PROXY: 'http://127.0.0.1:3100' },
    },
  ],
});
