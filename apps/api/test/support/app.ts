import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import type { LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';

/**
 * Boots the real AppModule with the production HTTP pipeline. Environment is fixed when AppModule is first
 * imported, so a test file that needs different settings passes `overrides` (vitest isolates each file).
 */
export async function createTestApp(overrides: Record<string, string> = {}, opts: { logger?: LoggerService } = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: inject('DATABASE_URL'),
    REDIS_URL: inject('REDIS_URL'),
    JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
    JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    AUTH_RATE_LIMIT_PER_MINUTE: '1000',
    RATE_LIMIT_PER_MINUTE: '5000',
    ...overrides,
  });
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApp } = await import('../../src/app.setup.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: opts.logger ?? false, bodyParser: false });
  configureApp(app);
  await app.init();
  return app;
}

/** Logger that records every line, to prove secrets never reach the logs. */
export class CapturingLogger implements LoggerService {
  readonly lines: string[] = [];
  private push(level: string, args: unknown[]) {
    this.lines.push(`${level} ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`);
  }
  log(...a: unknown[]) {
    this.push('log', a);
  }
  error(...a: unknown[]) {
    this.push('error', a);
  }
  warn(...a: unknown[]) {
    this.push('warn', a);
  }
  debug(...a: unknown[]) {
    this.push('debug', a);
  }
  verbose(...a: unknown[]) {
    this.push('verbose', a);
  }
  fatal(...a: unknown[]) {
    this.push('fatal', a);
  }
}
