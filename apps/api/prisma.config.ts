import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// DATABASE_URL is only needed by migrate/introspect commands; `prisma generate` must work without it (CI, typecheck).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL },
});
