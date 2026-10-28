// Prepares a blank database for the e2e suite and applies all migrations with `prisma migrate deploy`
// (Step 1 gate: migrations must run on an empty DB).
//   - CI: DATABASE_URL / REDIS_URL point at service containers.
//   - Local without Docker: an embedded PostgreSQL in a temp dir and a fake Redis (see support/fake-redis.ts).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import type { GlobalSetupContext } from 'vitest/node';
import { startFakeRedis } from './support/fake-redis.js';

declare module 'vitest' {
  export interface ProvidedContext {
    DATABASE_URL: string;
    REDIS_URL: string;
    REDIS_KIND: 'real' | 'fake';
  }
}

const apiDir = fileURLToPath(new URL('..', import.meta.url));

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

export default async function setup({ provide }: GlobalSetupContext) {
  const cleanups: (() => Promise<void>)[] = [];

  let databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    const port = await freePort();
    const dir = mkdtempSync(join(tmpdir(), 'omnibot-pg-'));
    const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'omnibot', password: 'omnibot', port, persistent: false, onLog: () => {}, initdbFlags: ['--encoding=UTF8', '--locale=C'] });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('omnibot_e2e');
    databaseUrl = `postgresql://omnibot:omnibot@127.0.0.1:${port}/omnibot_e2e`;
    cleanups.push(async () => {
      await pg.stop();
      // Windows releases the data files a moment after postgres exits.
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      } catch {
        console.warn(`[e2e] Không xóa được thư mục tạm ${dir} – có thể xóa tay.`);
      }
    });
  }

  execFileSync(process.execPath, [join(apiDir, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  let redisUrl = process.env.REDIS_URL;
  let redisKind: 'real' | 'fake' = 'real';
  if (!redisUrl) {
    const fake = await startFakeRedis();
    redisUrl = fake.url;
    redisKind = 'fake';
    cleanups.push(fake.close);
    console.warn('[e2e] REDIS_URL chưa đặt → dùng Redis giả lập (chỉ trả lời PING). CI chạy với Redis thật.');
  }

  provide('DATABASE_URL', databaseUrl);
  provide('REDIS_URL', redisUrl);
  provide('REDIS_KIND', redisKind);

  return async () => {
    for (const fn of cleanups.reverse()) await fn();
  };
}
