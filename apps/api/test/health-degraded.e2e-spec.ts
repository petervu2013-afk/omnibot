import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/app.js';

describe('GET /health when Redis is unreachable', () => {
  let app: INestApplication;
  beforeAll(async () => {
    // Port 1 is never a Redis server: the API must still start and report the outage.
    app = await createTestApp({ REDIS_URL: 'redis://127.0.0.1:1' });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('answers 503 with db ok and redis down', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(res.body).toMatchObject({ status: 'error', db: 'ok', redis: 'down' });
  });
});
