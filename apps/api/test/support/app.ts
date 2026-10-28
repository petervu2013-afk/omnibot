import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';

/**
 * Boots the real AppModule with the production HTTP pipeline. Environment is fixed when AppModule is first
 * imported, so a test file that needs different settings passes `overrides` (vitest isolates each file).
 */
export async function createTestApp(overrides: Record<string, string> = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: inject('DATABASE_URL'),
    REDIS_URL: inject('REDIS_URL'),
    JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
    JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    ...overrides,
  });
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/app.setup.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}
