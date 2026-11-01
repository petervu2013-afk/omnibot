import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/app.js';

describe('rate limit on /v1/auth', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp({ AUTH_RATE_LIMIT_PER_MINUTE: '3' });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('allows AUTH_RATE_LIMIT_PER_MINUTE login attempts per IP, then 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push(
        (
          await request(app.getHttpServer())
            .post('/v1/auth/login')
            .send({ email: `ip-limit-${i}@example.vn`, password: 'Sai-mat-khau-1' })
        ).status,
      );
    }
    expect(statuses).toEqual([401, 401, 401, 429]);
  });

  it('keeps the general limit for other routes', async () => {
    await request(app.getHttpServer()).get('/v1').expect(200);
  });
});
