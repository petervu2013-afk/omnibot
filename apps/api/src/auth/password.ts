// Password policy (same rules as the web app, apps/web/src/auth.jsx) and Argon2id hashing.
import { hash, verify } from '@node-rs/argon2';

// OWASP Argon2id option: 64 MiB memory, 3 iterations, 1 lane (~60–120 ms on a small VPS).
const ARGON2 = { memoryCost: 65_536, timeCost: 3, parallelism: 1 } as const;
export const PASSWORD_MAX = 128; // caps hashing cost per request

// Most common passwords (global + Vietnamese) – rejected regardless of other rules.
const COMMON = new Set([
  '12345678', '123456789', '1234567890', '11111111', '00000000', '88888888', '66666666', '12341234', '87654321',
  'password', 'password1', 'password123', 'passw0rd', 'qwerty123', 'qwertyuiop', 'abc12345', 'abcd1234', 'a1234567',
  'iloveyou', 'admin123', 'admin1234', 'welcome1', 'matkhau', 'matkhau123', 'matkhau1', 'anhyeuem', 'anhyeuem1',
  'emyeuanh', 'vietnam1', 'vietnam123', 'omnibot1', 'omnibot123', 'zxcvbnm1', 'asdfghjk1',
]); // prettier-ignore

export function passwordIssues(password: string, email = ''): string[] {
  const issues: string[] = [];
  if (password.length < 8) issues.push('Ít nhất 8 ký tự');
  if (password.length > PASSWORD_MAX) issues.push(`Tối đa ${PASSWORD_MAX} ký tự`);
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) issues.push('Có cả chữ và số');
  if (COMMON.has(password.toLowerCase())) issues.push('Không dùng mật khẩu phổ biến');
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length > 3 && password.toLowerCase().includes(local)) issues.push('Không chứa tên email');
  return issues;
}

export const hashPassword = (password: string) => hash(password, ARGON2);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (!passwordHash || password.length > PASSWORD_MAX) return false;
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Verified against when the email does not exist, so both cases take the same time (no account enumeration by timing).
let dummy: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hash('omnibot-timing-equaliser-1', ARGON2);
  await verifyPassword(await dummy, password.slice(0, PASSWORD_MAX));
}
