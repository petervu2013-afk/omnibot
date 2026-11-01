// AES-256-GCM encryption for secrets stored in the database (channel tokens, ads tokens, 2FA secrets → *Enc columns).
// Payload format: v1.<iv>.<authTag>.<ciphertext>, each part base64url. The version prefix leaves room for key rotation.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

const VERSION = 'v1';
const IV_BYTES = 12;

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY phải dài 32 byte');
  return key;
}

export function encrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function decrypt(key: Buffer, payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new DecryptionError('Dữ liệu mã hóa sai định dạng');
  const [iv, tag, data] = parts.slice(1).map((p) => Buffer.from(p, 'base64url')) as [Buffer, Buffer, Buffer];
  if (iv.length !== IV_BYTES || tag.length !== 16) throw new DecryptionError('Dữ liệu mã hóa sai định dạng');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new DecryptionError('Giải mã thất bại: sai khóa hoặc dữ liệu đã bị sửa');
  }
}

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.key = parseKey(config.get('ENCRYPTION_KEY', { infer: true }));
  }

  encrypt(plaintext: string): string {
    return encrypt(this.key, plaintext);
  }

  decrypt(payload: string): string {
    return decrypt(this.key, payload);
  }
}
