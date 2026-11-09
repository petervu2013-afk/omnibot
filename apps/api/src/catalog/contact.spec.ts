import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizePhone } from './contact.js';

describe('normalizePhone', () => {
  const same = '+84938123456';
  it.each([
    ['0938123456', same],
    ['0938 123 456', same],
    ['0938.123.456', same],
    ['0938-123-456', same],
    ['(0938) 123 456', same],
    ['+84938123456', same],
    ['+84 938 123 456', same],
    ['+84-938-123-456', same],
    ['+84 (0) 938 123 456', same],
    ['+840938123456', same],
    ['84938123456', same],
    ['84 938 123 456', same],
    ['0084938123456', same],
    ['00 84 938 123 456', same],
    ['  0938123456  ', same],
    ['01688123456', '+84388123456'], // pre-2018 Viettel 0168 → 038
    ['+84 1688 123 456', '+84388123456'],
    ['01218123456', '+84798123456'], // MobiFone 0121 → 079
    ['01998123456', '+84598123456'],
    ['024 3825 1234', '+842438251234'], // Hà Nội landline
    ['028 3823 4567', '+842838234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '12345', '0938', '093812345678901', 'abc0938123456', '0938-12a-456', '+1 415 555 0100', '938123456', '01308123456', '+84', '0000000000'])('rejects %j', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it.each([
    ['An.Nguyen@Gmail.com', 'an.nguyen@gmail.com'],
    ['  khach@shop.vn ', 'khach@shop.vn'],
    ['KHACH+zalo@Example.COM.VN', 'khach+zalo@example.com.vn'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
  it.each(['', 'khach', 'khach@', '@shop.vn', 'khach@shop', 'khach @shop.vn'])('rejects %j', (input) => {
    expect(normalizeEmail(input)).toBeNull();
  });
});
