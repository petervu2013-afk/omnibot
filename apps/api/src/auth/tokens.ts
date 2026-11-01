import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256-bit random token, base64url (refresh tokens, email verification and password reset links). */
export const randomToken = () => randomBytes(32).toString('base64url');

/**
 * Tokens are stored as HMAC-SHA256 with a server secret: a leaked database alone cannot be used to
 * recognise or forge valid tokens.
 */
export const hashToken = (secret: string, token: string) => createHmac('sha256', secret).update(token).digest('base64url');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
