import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.js';
import { tenantGuardExtension } from './tenant-guard.js';

function createClients(connectionString: string) {
  const system = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  return { system, db: system.$extends(tenantGuardExtension) };
}

export type TenantDb = ReturnType<typeof createClients>['db'];

@Injectable()
export class PrismaService implements OnModuleDestroy {
  /** Tenant-guarded client: use this in every feature module. */
  readonly db: TenantDb;
  /**
   * Unguarded client for platform-level work that legitimately spans shops (auth lookups by email, background
   * jobs, migrations of data). Every new use needs a reviewer's sign-off (see docs/adr/0002-backend-foundation.md).
   */
  readonly system: PrismaClient;

  constructor(config: ConfigService<Env, true>) {
    // The connection is opened lazily on first query, so the API still starts (and /health reports it) if the DB is down.
    const clients = createClients(config.get('DATABASE_URL', { infer: true }));
    this.system = clients.system;
    this.db = clients.db;
  }

  async ping(): Promise<void> {
    await this.system.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy() {
    await this.system.$disconnect();
  }
}
