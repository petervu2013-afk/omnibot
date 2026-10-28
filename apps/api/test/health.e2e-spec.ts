import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/app.js';

describe('HTTP pipeline (DB + Redis up)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('GET /health reports db and redis ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok', redis: 'ok' });
  });

  it('adds a request id, or keeps a safe one sent by the caller', async () => {
    const generated = await request(app.getHttpServer()).get('/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const kept = await request(app.getHttpServer()).get('/health').set('X-Request-Id', 'nginx-req-0001');
    expect(kept.headers['x-request-id']).toBe('nginx-req-0001');
    const unsafe = await request(app.getHttpServer()).get('/health').set('X-Request-Id', '<script>');
    expect(unsafe.headers['x-request-id']).not.toBe('<script>');
  });

  it('serves the API under /v1 with security headers', async () => {
    const res = await request(app.getHttpServer()).get('/v1').expect(200);
    expect(res.body.name).toBe('OmniBot API');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns the standard error body for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/v1/khong-ton-tai').set('X-Request-Id', 'req-404-test').expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy đường dẫn hoặc dữ liệu yêu cầu.' }, requestId: 'req-404-test' });
  });

  it('allows configured CORS origins only', async () => {
    const allowed = await request(app.getHttpServer()).get('/v1').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await request(app.getHttpServer()).get('/v1').set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects bodies over 1 MB', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ x: 'a'.repeat(1_100_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
