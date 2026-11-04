// Local PostgreSQL without Docker (Windows/macOS/Linux): `pnpm --filter @omnibot/api db:local`.
// Data lives in apps/api/.pgdata (git-ignored). Matches DATABASE_URL=postgresql://omnibot:omnibot@localhost:5433/omnibot
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const port = Number(process.env.PGPORT ?? 5433);
const databaseDir = fileURLToPath(new URL('../.pgdata', import.meta.url));
const fresh = !existsSync(databaseDir);
const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'omnibot',
  password: 'omnibot',
  port,
  persistent: true,
  onLog: () => {},
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-c', 'io_method=sync'],
});

if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('omnibot');
console.log(`PostgreSQL đang chạy: postgresql://omnibot:omnibot@localhost:${port}/omnibot  (Ctrl+C để dừng)`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
