import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DecryptionError, decrypt, encrypt, parseKey } from './crypto.service.js';

const key = randomBytes(32);

describe('AES-256-GCM helpers', () => {
  it('round-trips text including Vietnamese and emoji', () => {
    const secret = 'EAAG-token-Đặng Gia Huy-🔐';
    expect(decrypt(key, encrypt(key, secret))).toBe(secret);
  });

  it('uses a fresh IV for every encryption', () => {
    expect(encrypt(key, 'same')).not.toBe(encrypt(key, 'same'));
  });

  it('produces the v1.iv.tag.data format', () => {
    expect(encrypt(key, 'x')).toMatch(/^v1\.[\w-]{16}\.[\w-]{22}\.[\w-]+$/);
  });

  it('fails with the wrong key', () => {
    const payload = encrypt(key, 'secret');
    expect(() => decrypt(randomBytes(32), payload)).toThrow(DecryptionError);
  });

  it('detects tampered ciphertext', () => {
    const parts = encrypt(key, 'secret-value').split('.');
    const data = Buffer.from(parts[3]!, 'base64url');
    data[0] = data[0]! ^ 1;
    parts[3] = data.toString('base64url');
    expect(() => decrypt(key, parts.join('.'))).toThrow('sai khóa hoặc dữ liệu đã bị sửa');
  });

  it('rejects malformed payloads', () => {
    for (const bad of ['', 'abc', 'v2.a.b.c', 'v1.a.b']) expect(() => decrypt(key, bad)).toThrow('sai định dạng');
  });

  it('requires a 32-byte key', () => {
    expect(parseKey(key.toString('base64'))).toEqual(key);
    expect(() => parseKey(randomBytes(16).toString('base64'))).toThrow('32 byte');
  });
});
