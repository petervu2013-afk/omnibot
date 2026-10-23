// Frontend auth layer (demo). Mirrors the backend contract in docs/PROJECT_SPEC.md (AUTH-01…06, 13, 17):
// access token 15 min, refresh token rotated on every use, session revoke, lockout after 5 failed logins,
// email verification and password reset links. Data lives in localStorage until the NestJS API exists;
// passwords are SHA-256 + salt here only for the demo – the backend uses Argon2id.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const DB_KEY = 'omnibot-auth-v1';
const CLIENT_KEY = 'omnibot-auth-client';
const MIN = 60000;
const DAY = 24 * 60 * MIN;
export const ACCESS_TTL = 15 * MIN;
export const REFRESH_TTL = 30 * DAY;
export const MAX_FAILED = 5;
export const LOCK_TIME = 15 * MIN;
export const CAPTCHA_AFTER = 3;
export const VERIFY_GRACE_DAYS = 7;
export const DELETE_AFTER_DAYS = 30;

const rand = (n = 24) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const hashPassword = (password, salt) => sha256(`${salt}:${password}`);

export function passwordIssues(pw, email = '') {
  const issues = [];
  if (pw.length < 8) issues.push('Ít nhất 8 ký tự');
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) issues.push('Có cả chữ và số');
  if (/^(12345678|password|matkhau|11111111|abc12345)/i.test(pw)) issues.push('Không dùng mật khẩu phổ biến');
  if (email && pw.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length > 3) issues.push('Không chứa tên email');
  return issues;
}
export function passwordStrength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  return Math.min(4, s); // 0..4
}
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

export function describeDevice(ua = navigator.userAgent) {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Trình duyệt';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Không rõ';
  return `${browser} trên ${os}`;
}

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return null;
}
function saveDb(db) { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* storage unavailable */ } }

// Seed one verified demo owner account so the app can be opened right away.
export const DEMO_ACCOUNT = { email: 'admin@goviet.vn', password: 'Demo@1234' };
async function seedDb() {
  const salt = rand(8);
  const now = Date.now();
  const db = {
    users: [{ id: 'usr_demo', email: DEMO_ACCOUNT.email, salt, passwordHash: await hashPassword(DEMO_ACCOUNT.password, salt), fullName: 'Quản trị viên', phone: '0900000000', shopName: 'Gỗ Việt', field: 'Nội thất', role: 'ADMIN', emailVerifiedAt: now - 40 * DAY, failedLoginCount: 0, lockedUntil: null, createdAt: now - 40 * DAY, deletionRequestedAt: null, passwordChangedAt: now - 40 * DAY }],
    sessions: [
      // An older device so the device list has something to revoke.
      { id: 'ses_seed', userId: 'usr_demo', familyId: rand(8), refreshTokenHash: await sha256(rand()), platform: 'ANDROID', deviceName: 'OmniBot app trên Android', ip: '113.161.x.x', createdAt: now - 6 * DAY, lastUsedAt: now - 3 * 3600000, expiresAt: now + 24 * DAY, revokedAt: null },
    ],
    tokens: [],
    outbox: [],
    loginLog: [{ id: rand(6), email: DEMO_ACCOUNT.email, userId: 'usr_demo', ok: true, reason: null, device: 'OmniBot app trên Android', at: now - 6 * DAY }],
  };
  saveDb(db);
  return db;
}

// Tokens are shared by every tab of this browser; "remember me" only changes the session lifetime (30 days vs 24 hours).
// With the backend, the refresh token moves to an HttpOnly cookie and only the access token stays in memory.
function readClient() {
  try {
    const raw = localStorage.getItem(CLIENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeClient(c, remember) {
  try {
    if (c) localStorage.setItem(CLIENT_KEY, JSON.stringify({ ...c, remember })); else localStorage.removeItem(CLIENT_KEY);
  } catch { /* storage unavailable */ }
}
// Serialise token refresh across tabs so two tabs never rotate the same refresh token at once.
const withRefreshLock = (fn) => (navigator.locks ? navigator.locks.request('omnibot-token-refresh', fn) : fn());

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [db, setDb] = useState(null);
  const [client, setClient] = useState(readClient);
  const [notice, setNotice] = useState(null); // message shown on the login page after a forced logout
  const dbRef = useRef(null);

  useEffect(() => { (async () => { const d = loadDb() || (await seedDb()); dbRef.current = d; setDb(d); })(); }, []);

  const commit = useCallback((fn) => {
    const d = structuredClone(dbRef.current || loadDb());
    const out = fn(d);
    dbRef.current = d;
    saveDb(d);
    setDb(d);
    return out;
  }, []);

  const session = db && client ? db.sessions.find((s) => s.id === client.sessionId) : null;
  const user = session && !session.revokedAt ? db.users.find((u) => u.id === session.userId) : null;

  const forceLogout = useCallback((message) => {
    writeClient(null);
    setClient(null);
    if (message) setNotice(message);
  }, []);

  const startSession = async (d, u, remember) => {
    const refreshToken = rand();
    const now = Date.now();
    const s = { id: 'ses_' + rand(6), userId: u.id, familyId: rand(8), refreshTokenHash: await sha256(refreshToken), platform: 'WEB', deviceName: describeDevice(), ip: '— (cần backend)', createdAt: now, lastUsedAt: now, expiresAt: now + (remember ? REFRESH_TTL : DAY), revokedAt: null };
    d.sessions.push(s);
    const c = { sessionId: s.id, refreshToken, accessToken: rand(16), accessExpiresAt: now + ACCESS_TTL };
    return { s, c };
  };

  const log = (d, entry) => d.loginLog.push({ id: rand(6), at: Date.now(), device: describeDevice(), ...entry });
  const mail = (d, to, purpose, subject, link) => d.outbox.unshift({ id: rand(6), to, purpose, subject, link, at: Date.now() });

  // ---------- AUTH-03 Login ----------
  const login = async ({ email, password, remember, captcha }) => {
    const d = structuredClone(dbRef.current);
    const e = email.trim().toLowerCase();
    const u = d.users.find((x) => x.email === e && !x.deletedAt);
    const now = Date.now();
    if (u?.lockedUntil && u.lockedUntil > now) {
      log(d, { email: e, userId: u.id, ok: false, reason: 'Tài khoản đang bị khóa tạm' });
      commit((x) => Object.assign(x, d));
      return { error: `Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau ${Math.ceil((u.lockedUntil - now) / MIN)} phút hoặc đặt lại mật khẩu.`, locked: true };
    }
    if (u && u.failedLoginCount >= CAPTCHA_AFTER && !captcha) return { error: 'Vui lòng xác nhận bạn không phải người máy.', needCaptcha: true };
    const ok = u && (await hashPassword(password, u.salt)) === u.passwordHash;
    if (!ok) {
      if (u) {
        u.failedLoginCount += 1;
        if (u.failedLoginCount >= MAX_FAILED) { u.lockedUntil = now + LOCK_TIME; u.failedLoginCount = 0; }
      }
      log(d, { email: e, userId: u?.id || null, ok: false, reason: 'Sai email hoặc mật khẩu' });
      commit((x) => Object.assign(x, d));
      // Same message whether the email exists or not, so accounts can't be enumerated.
      const left = u ? (u.lockedUntil > now ? 0 : MAX_FAILED - u.failedLoginCount) : null;
      return { error: u?.lockedUntil > now ? `Sai mật khẩu ${MAX_FAILED} lần. Tài khoản tạm khóa ${LOCK_TIME / MIN} phút.` : 'Email hoặc mật khẩu không đúng.' + (left != null && left <= 2 ? ` Còn ${left} lần thử trước khi bị khóa tạm.` : ''), needCaptcha: u && u.failedLoginCount >= CAPTCHA_AFTER };
    }
    u.failedLoginCount = 0;
    u.lockedUntil = null;
    const newDevice = !d.sessions.some((s) => s.userId === u.id && s.deviceName === describeDevice());
    const { c } = await startSession(d, u, remember);
    log(d, { email: e, userId: u.id, ok: true, reason: newDevice ? 'Thiết bị mới' : null });
    if (newDevice) mail(d, u.email, 'new_device', 'Cảnh báo: đăng nhập từ thiết bị mới', null);
    commit((x) => Object.assign(x, d));
    writeClient(c, remember);
    setClient(c);
    setNotice(null);
    return { ok: true, pendingDeletion: !!u.deletionRequestedAt };
  };

  // ---------- AUTH-01 Register (+ AUTH-02 verification email) ----------
  const register = async ({ fullName, email, password, shopName, field, phone }) => {
    const d = structuredClone(dbRef.current);
    const e = email.trim().toLowerCase();
    if (d.users.some((u) => u.email === e && !u.deletedAt)) return { error: 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng "Quên mật khẩu".' };
    const salt = rand(8);
    const u = { id: 'usr_' + rand(6), email: e, salt, passwordHash: await hashPassword(password, salt), fullName: fullName.trim(), phone: phone.trim(), shopName: shopName.trim(), field, role: 'ADMIN', emailVerifiedAt: null, failedLoginCount: 0, lockedUntil: null, createdAt: Date.now(), deletionRequestedAt: null, passwordChangedAt: Date.now() };
    d.users.push(u);
    const link = issueToken(d, u, 'EMAIL_VERIFY', DAY);
    mail(d, e, 'verify', 'Xác minh email đăng ký OmniBot', link);
    const { c } = await startSession(d, u, true);
    log(d, { email: e, userId: u.id, ok: true, reason: 'Đăng ký mới' });
    commit((x) => Object.assign(x, d));
    writeClient(c, true);
    setClient(c);
    return { ok: true, link };
  };

  function issueToken(d, u, purpose, ttl) {
    d.tokens.forEach((t) => { if (t.userId === u.id && t.purpose === purpose && !t.usedAt) t.usedAt = -1; }); // older links stop working
    const token = rand(16);
    d.tokens.push({ token, userId: u.id, purpose, expiresAt: Date.now() + ttl, usedAt: null });
    return `#/${purpose === 'EMAIL_VERIFY' ? 'verify' : 'reset'}?token=${token}`;
  }

  const resendVerification = () => commit((d) => {
    const u = d.users.find((x) => x.id === user.id);
    const link = issueToken(d, u, 'EMAIL_VERIFY', DAY);
    mail(d, u.email, 'verify', 'Xác minh email đăng ký OmniBot', link);
    return link;
  });

  const checkToken = (token, purpose) => {
    const t = dbRef.current?.tokens.find((x) => x.token === token && x.purpose === purpose);
    if (!t) return 'Liên kết không hợp lệ.';
    if (t.usedAt) return 'Liên kết đã được sử dụng hoặc đã có liên kết mới hơn.';
    if (t.expiresAt < Date.now()) return 'Liên kết đã hết hạn.';
    return null;
  };

  const verifyEmail = (token) => {
    const err = checkToken(token, 'EMAIL_VERIFY');
    if (err) return { error: err };
    commit((d) => {
      const t = d.tokens.find((x) => x.token === token);
      t.usedAt = Date.now();
      d.users.find((u) => u.id === t.userId).emailVerifiedAt = Date.now();
    });
    return { ok: true };
  };

  // ---------- AUTH-06 Forgot / reset password ----------
  const requestReset = (email) => {
    const e = email.trim().toLowerCase();
    return commit((d) => {
      const u = d.users.find((x) => x.email === e && !x.deletedAt);
      if (!u) return null; // caller shows the same message either way
      const link = issueToken(d, u, 'PASSWORD_RESET', 30 * MIN);
      mail(d, e, 'reset', 'Đặt lại mật khẩu OmniBot', link);
      return link;
    });
  };

  const resetPassword = async (token, password) => {
    const err = checkToken(token, 'PASSWORD_RESET');
    if (err) return { error: err };
    const d = structuredClone(dbRef.current);
    const t = d.tokens.find((x) => x.token === token);
    const u = d.users.find((x) => x.id === t.userId);
    const issues = passwordIssues(password, u.email);
    if (issues.length) return { error: issues.join(', ') };
    u.salt = rand(8);
    u.passwordHash = await hashPassword(password, u.salt);
    u.passwordChangedAt = Date.now();
    u.failedLoginCount = 0;
    u.lockedUntil = null;
    t.usedAt = Date.now();
    // Resetting the password signs out every device (spec AUTH-05).
    d.sessions.forEach((s) => { if (s.userId === u.id && !s.revokedAt) { s.revokedAt = Date.now(); s.revokeReason = 'Đặt lại mật khẩu'; } });
    log(d, { email: u.email, userId: u.id, ok: true, reason: 'Đặt lại mật khẩu' });
    commit((x) => Object.assign(x, d));
    forceLogout(null);
    return { ok: true };
  };

  // ---------- Profile & password ----------
  const updateProfile = ({ fullName, phone }) => commit((d) => { const u = d.users.find((x) => x.id === user.id); u.fullName = fullName; u.phone = phone; });

  const changePassword = async (current, next, signOutOthers) => {
    const d = structuredClone(dbRef.current);
    const u = d.users.find((x) => x.id === user.id);
    if ((await hashPassword(current, u.salt)) !== u.passwordHash) return { error: 'Mật khẩu hiện tại không đúng.' };
    if (current === next) return { error: 'Mật khẩu mới phải khác mật khẩu hiện tại.' };
    const issues = passwordIssues(next, u.email);
    if (issues.length) return { error: issues.join(', ') };
    u.salt = rand(8);
    u.passwordHash = await hashPassword(next, u.salt);
    u.passwordChangedAt = Date.now();
    let revoked = 0;
    if (signOutOthers) d.sessions.forEach((s) => { if (s.userId === u.id && s.id !== client.sessionId && !s.revokedAt) { s.revokedAt = Date.now(); s.revokeReason = 'Đổi mật khẩu'; revoked++; } });
    log(d, { email: u.email, userId: u.id, ok: true, reason: 'Đổi mật khẩu' });
    commit((x) => Object.assign(x, d));
    return { ok: true, revoked };
  };

  // ---------- AUTH-05 Sessions ----------
  const mySessions = () => (db && user ? db.sessions.filter((s) => s.userId === user.id && !s.revokedAt && s.expiresAt > Date.now()).sort((a, b) => b.lastUsedAt - a.lastUsedAt) : []);
  const revokeSession = (id, reason = 'Thu hồi thủ công') => {
    commit((d) => { const s = d.sessions.find((x) => x.id === id); if (s) { s.revokedAt = Date.now(); s.revokeReason = reason; } });
    if (id === client?.sessionId) forceLogout('Bạn đã đăng xuất.');
  };
  const revokeOthers = () => commit((d) => {
    let n = 0;
    d.sessions.forEach((s) => { if (s.userId === user.id && s.id !== client.sessionId && !s.revokedAt) { s.revokedAt = Date.now(); s.revokeReason = 'Đăng xuất thiết bị khác'; n++; } });
    return n;
  });
  const logout = () => revokeSession(client.sessionId, 'Đăng xuất');
  const logoutAll = () => { commit((d) => { d.sessions.forEach((s) => { if (s.userId === user.id && !s.revokedAt) { s.revokedAt = Date.now(); s.revokeReason = 'Đăng xuất mọi thiết bị'; } }); }); forceLogout('Đã đăng xuất khỏi mọi thiết bị.'); };

  // ---------- AUTH-13 Account deletion ----------
  const requestDeletion = async (password) => {
    const d = structuredClone(dbRef.current);
    const u = d.users.find((x) => x.id === user.id);
    if ((await hashPassword(password, u.salt)) !== u.passwordHash) return { error: 'Mật khẩu không đúng.' };
    u.deletionRequestedAt = Date.now();
    d.sessions.forEach((s) => { if (s.userId === u.id && !s.revokedAt) { s.revokedAt = Date.now(); s.revokeReason = 'Yêu cầu xóa tài khoản'; } });
    mail(d, u.email, 'deletion', `Đã nhận yêu cầu xóa tài khoản – dữ liệu sẽ bị xóa sau ${DELETE_AFTER_DAYS} ngày`, null);
    log(d, { email: u.email, userId: u.id, ok: true, reason: 'Yêu cầu xóa tài khoản' });
    commit((x) => Object.assign(x, d));
    forceLogout(`Đã ghi nhận yêu cầu xóa tài khoản. Dữ liệu sẽ bị xóa vĩnh viễn sau ${DELETE_AFTER_DAYS} ngày; đăng nhập lại trong thời gian này để hủy yêu cầu.`);
    return { ok: true };
  };
  const cancelDeletion = () => commit((d) => { d.users.find((x) => x.id === user.id).deletionRequestedAt = null; });

  // ---------- Token refresh with rotation + revocation watch ----------
  useEffect(() => {
    if (!db || !client) return undefined;
    const tick = () => withRefreshLock(async () => {
      const d = loadDb() || dbRef.current;
      // Another tab may already have rotated the tokens: adopt the newest pair instead of using a stale copy.
      const cur = readClient();
      if (!cur) return forceLogout('Bạn đã đăng xuất.');
      if (cur.sessionId !== client.sessionId) { setClient(cur); return undefined; } // another tab signed in with a new session
      if (cur.refreshToken !== client.refreshToken) setClient(cur);
      const s = d.sessions.find((x) => x.id === cur.sessionId);
      if (!s || s.revokedAt) return forceLogout(s?.revokeReason ? `Phiên đăng nhập đã bị thu hồi (${s.revokeReason}).` : 'Phiên đăng nhập không còn hiệu lực.');
      if (s.expiresAt < Date.now()) return forceLogout('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
      if (cur.accessExpiresAt - Date.now() > MIN) return undefined;
      // Access token about to expire: exchange the refresh token for a new pair.
      if ((await sha256(cur.refreshToken)) !== s.refreshTokenHash) {
        // An old refresh token was reused: someone may have copied it, revoke the whole family.
        d.sessions.forEach((x) => { if (x.familyId === s.familyId) { x.revokedAt = Date.now(); x.revokeReason = 'Phát hiện dùng lại token cũ'; } });
        dbRef.current = d; saveDb(d); setDb(d);
        return forceLogout('Phát hiện phiên đăng nhập bất thường, đã đăng xuất để bảo vệ tài khoản.');
      }
      const refreshToken = rand();
      s.refreshTokenHash = await sha256(refreshToken);
      s.lastUsedAt = Date.now();
      dbRef.current = d; saveDb(d); setDb(d);
      const c = { ...cur, refreshToken, accessToken: rand(16), accessExpiresAt: Date.now() + ACCESS_TTL };
      writeClient(c, cur.remember);
      setClient(c);
      return undefined;
    });
    tick();
    const t = setInterval(tick, 30000);
    const onStorage = (ev) => {
      if (ev.key === DB_KEY) { const d = loadDb(); if (d) { dbRef.current = d; setDb(d); } }
      if (ev.key === CLIENT_KEY) { const c = readClient(); if (c) setClient(c); else forceLogout('Bạn đã đăng xuất.'); }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', tick);
    return () => { clearInterval(t); window.removeEventListener('storage', onStorage); window.removeEventListener('focus', tick); };
  }, [db && client?.sessionId, client?.accessExpiresAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    ready: !!db, user, session, client, notice, setNotice, db,
    login, register, logout, logoutAll, requestReset, resetPassword, checkToken, verifyEmail, resendVerification,
    updateProfile, changePassword, mySessions, revokeSession, revokeOthers, requestDeletion, cancelDeletion,
    loginLog: () => (db && user ? db.loginLog.filter((l) => l.userId === user.id || l.email === user.email).sort((a, b) => b.at - a.at) : []),
    outbox: (email) => (db ? db.outbox.filter((m) => !email || m.to === email.trim().toLowerCase()) : []),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
