import { describe, expect, it } from 'vitest';
import { burnPasswordCheck, hashPassword, PASSWORD_MAX, passwordIssues, verifyPassword } from './password.js';

describe('passwordIssues', () => {
  it('accepts a reasonable password, including Vietnamese letters', () => {
    expect(passwordIssues('Gỗ-Việt-2026')).toEqual([]);
    expect(passwordIssues('đẹptrai99')).toEqual([]);
  });

  it('requires 8+ characters with letters and digits', () => {
    expect(passwordIssues('ab1')).toContain('Ít nhất 8 ký tự');
    expect(passwordIssues('abcdefgh')).toContain('Có cả chữ và số');
    expect(passwordIssues('12345679')).toContain('Có cả chữ và số');
  });

  it('rejects common passwords case-insensitively', () => {
    expect(passwordIssues('Password123')).toContain('Không dùng mật khẩu phổ biến');
    expect(passwordIssues('matkhau123')).toContain('Không dùng mật khẩu phổ biến');
  });

  it('rejects passwords containing the email name', () => {
    expect(passwordIssues('minhanh2026', 'minhanh@goviet.vn')).toContain('Không chứa tên email');
    expect(passwordIssues('abc2026xyz', 'abc@goviet.vn')).toEqual([]); // names of 3 chars or less are ignored
  });

  it('caps the length to bound hashing cost', () => {
    expect(passwordIssues('a1'.repeat(65))).toContain(`Tối đa ${PASSWORD_MAX} ký tự`);
  });
});

describe('Argon2id hashing', () => {
  it('hashes with argon2id and verifies only the right password', async () => {
    const h = await hashPassword('Gỗ-Việt-2026');
    expect(h).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(await verifyPassword(h, 'Gỗ-Việt-2026')).toBe(true);
    expect(await verifyPassword(h, 'gỗ-việt-2026')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('Same-pass-1')).not.toBe(await hashPassword('Same-pass-1'));
  });

  it('never throws on empty, malformed or oversized input', async () => {
    expect(await verifyPassword('', 'x')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
    expect(await verifyPassword(await hashPassword('Abc12345x'), 'x'.repeat(PASSWORD_MAX + 1))).toBe(false);
    await expect(burnPasswordCheck('anything')).resolves.toBeUndefined();
  });
});
