import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/app.js';

describe('rate limit', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp({ RATE_LIMIT_PER_MINUTE: '3' });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('blocks the 4th request in a minute with RATE_LIMITED', async () => {
    for (let i = 0; i < 3; i++) await request(app.getHttpServer()).get('/v1').expect(200);
    const res = await request(app.getHttpServer()).get('/v1').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('never throttles /health (monitors poll it)', async () => {
    for (let i = 0; i < 6; i++) expect([200, 503]).toContain((await request(app.getHttpServer()).get('/health')).status);
  });
});
