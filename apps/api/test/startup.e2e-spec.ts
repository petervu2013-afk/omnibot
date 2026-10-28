// Runs the built server (dist/main.js) as a real process: a broken environment must stop startup with a clear message.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const main = fileURLToPath(new URL('../dist/main.js', import.meta.url));
// Empty working dir so no .env file is picked up.
const cwd = mkdtempSync(join(tmpdir(), 'omnibot-start-'));
const baseEnv = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' };

function start(env: Record<string, string>) {
  return spawnSync(process.execPath, [main], { cwd, env: { ...baseEnv, ...env }, encoding: 'utf8', timeout: 20_000 });
}

describe.runIf(existsSync(main))('API startup with invalid environment', () => {
  it('exits with code 1 and lists every missing variable', () => {
    const res = start({ NODE_ENV: 'production' });
    expect(res.status).toBe(1);
    for (const name of ['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY']) {
      expect(res.stderr).toContain(`${name}: thiếu biến bắt buộc`);
    }
  });

  it('refuses .env.example placeholders in production', () => {
    const res = start({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/db',
      REDIS_URL: 'redis://127.0.0.1:1',
      JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-chars',
      JWT_REFRESH_SECRET: 'change-me-refresh-secret-at-least-32-chars',
      ENCRYPTION_KEY: 'A'.repeat(43) + '=',
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('ENCRYPTION_KEY: đang dùng khóa mẫu trong .env.example');
  });
});

describe.skipIf(existsSync(main))('API startup', () => {
  it.fails('needs `pnpm --filter @omnibot/api build` first (test:e2e does it)', () => {
    expect(existsSync(main)).toBe(true);
  });
});
