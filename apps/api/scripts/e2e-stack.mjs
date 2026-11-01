// Backend for the browser tests (apps/web/e2e): PostgreSQL + Redis + the built API on port 3100.
// CI passes DATABASE_URL / REDIS_URL for real services; locally an embedded PostgreSQL and the in-memory fake Redis.
// Emails go to files in E2E_OUTBOX_DIR/.outbox so tests can open the links.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const outboxDir = process.env.E2E_OUTBOX_DIR ?? join(tmpdir(), 'omnibot-e2e-outbox');
rmSync(outboxDir, { recursive: true, force: true });
mkdirSync(outboxDir, { recursive: true });

let databaseUrl = process.env.DATABASE_URL;
let pg;
let databaseDir;
if (!databaseUrl) {
  databaseDir = mkdtempSync(join(tmpdir(), 'omnibot-e2e-pg-'));
  // A free port each run: a leftover process can never block the next one.
  const port = await new Promise((resolve) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const { port: free } = srv.address();
      srv.close(() => resolve(free));
    });
  });
  // PostgreSQL 18 io_worker processes survive the hard stop used on Windows, so run without them.
  pg = new EmbeddedPostgres({
    databaseDir,
    user: 'omnibot',
    password: 'omnibot',
    port,
    persistent: false,
    onLog: () => {},
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-c', 'io_method=sync'],
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('omnibot_web');
  databaseUrl = `postgresql://omnibot:omnibot@127.0.0.1:${port}/omnibot_web`;
}
execFileSync(process.execPath, [join(apiDir, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: apiDir, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });

let redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  const { startFakeRedis } = await import('../test/support/fake-redis.ts');
  redisUrl = (await startFakeRedis()).url;
}

// In this process, so the API always stops together with the stack.
Object.assign(process.env, {
  NODE_ENV: 'development',
  PORT: '3100',
  DATABASE_URL: databaseUrl,
  REDIS_URL: redisUrl,
  MAIL_TRANSPORT: 'file',
  APP_URL: 'http://localhost:5199',
  CORS_ORIGINS: 'http://localhost:5199',
  // Short-lived on purpose: every test keeps exercising refresh-token rotation.
  JWT_ACCESS_TTL: '5s',
  JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  AUTH_RATE_LIMIT_PER_MINUTE: '1000',
  RATE_LIMIT_PER_MINUTE: '10000',
});
process.chdir(outboxDir); // no .env is read from here; mails land in ./.outbox
await import(pathToFileURL(join(apiDir, 'dist/main.js')).href);

async function stop() {
  await pg?.stop().catch(() => {});
  if (databaseDir) rmSync(databaseDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  writeFileSync(join(outboxDir, 'STOPPED'), '');
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// Graceful stop requested by the test runner (see apps/web/e2e/global-teardown.js).
setInterval(() => {
  if (existsSync(join(outboxDir, 'STOP'))) void stop();
}, 200);
