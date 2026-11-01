// Auth state of the web app, backed by the OmniBot API (AUTH-01…06, 10, 13). Actions return { ok, ... } or
// { error, code, ... } so pages can show the API's message. Tokens are handled in api.js, never in localStorage.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, publicApi, refreshSession, setAccessToken, setSessionLostHandler } from './api.js';

export const MAX_FAILED = 5;
export const DELETE_AFTER_DAYS = 30;
const ACTIVE_SHOP_KEY = 'omnibot-active-shop'; // only which shop is open, never a credential
const CHECK_EVERY_MS = 30000;

export function passwordIssues(pw, email = '') {
  const issues = [];
  if (pw.length < 8) issues.push('Ít nhất 8 ký tự');
  if (!/\p{L}/u.test(pw) || !/\d/.test(pw)) issues.push('Có cả chữ và số');
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

function readActiveShop() {
  try { return localStorage.getItem(ACTIVE_SHOP_KEY); } catch { return null; }
}
function writeActiveShop(id) {
  try { localStorage.setItem(ACTIVE_SHOP_KEY, id); } catch { /* storage unavailable */ }
}

/** Runs an API call and turns failures into { error, code, details } for the page to display. */
async function attempt(fn) {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof ApiError) {
      const message = err.code === 'VALIDATION_FAILED' && Array.isArray(err.details) ? err.details.map((d) => d.message).join(', ') : err.message;
      return { error: message, code: err.code, details: err.details };
    }
    throw err;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [shops, setShops] = useState([]);
  const [activeShopId, setActiveShopId] = useState(readActiveShop);
  const [notice, setNotice] = useState(null); // message shown on the login page after a forced logout
  const [offline, setOffline] = useState(false);
  const channel = useRef(null);

  const adopt = useCallback((data) => {
    setUser(data.user);
    setShops(data.shops);
    setOffline(false);
  }, []);

  const clear = useCallback((message) => {
    setAccessToken(null);
    setUser(null);
    setShops([]);
    setNotice(message ?? null);
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      adopt(await refreshSession());
    } catch (err) {
      if (err.status === 0) setOffline(true);
      clear(null);
    }
    setReady(true);
  }, [adopt, clear]);

  // Restore the session from the refresh cookie on load; follow login/logout in other tabs of this browser.
  useEffect(() => {
    setSessionLostHandler((message) => clear(message));
    bootstrap();
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel('omnibot-auth');
    channel.current = ch;
    ch.onmessage = (e) => {
      if (e.data === 'logout') clear('Bạn đã đăng xuất.');
      if (e.data === 'login') bootstrap();
    };
    return () => ch.close();
  }, [bootstrap, clear]);

  const signedIn = !!user;
  // A device signed out elsewhere, or a role change, shows up here within 30 seconds.
  useEffect(() => {
    if (!signedIn) return undefined;
    const check = () => { api('/auth/me').then(adopt).catch(() => { /* api.js handles a lost session; other errors retry next tick */ }); };
    const timer = setInterval(check, CHECK_EVERY_MS);
    window.addEventListener('focus', check);
    return () => { clearInterval(timer); window.removeEventListener('focus', check); };
  }, [signedIn, adopt]);

  const announce = (message) => channel.current?.postMessage(message);
  const client = () => ({ platform: 'WEB', deviceName: describeDevice() });

  const login = ({ email, password, captcha }) => attempt(async () => {
    const issued = await publicApi('/auth/login', { method: 'POST', body: { email, password, captcha: captcha || undefined, ...client() } });
    setAccessToken(issued.accessToken);
    adopt(issued);
    setNotice(null);
    announce('login');
    return { pendingDeletion: !!issued.user.deletionRequestedAt };
  });

  const register = ({ fullName, email, password, shopName, field, phone }) => attempt(async () => {
    const issued = await publicApi('/auth/register', { method: 'POST', body: { fullName, email, password, shopName, field, phone: phone || undefined, acceptTerms: true, ...client() } });
    setAccessToken(issued.accessToken);
    adopt(issued);
    announce('login');
  });

  const logout = async () => {
    await publicApi('/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    clear('Bạn đã đăng xuất.');
    announce('logout');
  };

  const logoutAll = () => attempt(async () => {
    await api('/auth/logout-all', { method: 'POST' });
    clear('Đã đăng xuất khỏi mọi thiết bị.');
    announce('logout');
  });

  const reload = async () => adopt(await api('/auth/me'));
  const updateProfile = (data) => attempt(async () => adopt(await api('/auth/me', { method: 'PATCH', body: data })));
  const verifyEmail = (token) => attempt(async () => {
    await publicApi('/auth/verify-email', { method: 'POST', body: { token } });
    if (user) await reload();
  });
  const resendVerification = () => attempt(() => publicApi('/auth/resend-verification', { method: 'POST', body: { email: user.email } }));
  const requestReset = (email) => attempt(() => publicApi('/auth/forgot-password', { method: 'POST', body: { email } }));
  const resetPassword = (token, password) => attempt(async () => {
    await publicApi('/auth/reset-password', { method: 'POST', body: { token, password } });
    clear(null);
    announce('logout');
  });
  const changePassword = (currentPassword, newPassword) => attempt(() => api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }));
  const revokeOthers = () => attempt(() => api('/auth/logout-others', { method: 'POST' }));
  const requestDeletion = (password) => attempt(async () => {
    await api('/auth/delete-account', { method: 'POST', body: { password } });
    clear(`Đã ghi nhận yêu cầu xóa tài khoản. Dữ liệu sẽ bị xóa vĩnh viễn sau ${DELETE_AFTER_DAYS} ngày; đăng nhập lại trong thời gian này để hủy yêu cầu.`);
    announce('logout');
  });
  const cancelDeletion = () => attempt(async () => adopt(await api('/auth/cancel-deletion', { method: 'POST' })));

  const previewInvite = (token) => attempt(() => publicApi('/invitations/preview', { method: 'POST', body: { token } }));
  const acceptInvite = (input) => attempt(() => publicApi('/invitations/accept', { method: 'POST', body: input }));

  const shop = useMemo(() => shops.find((s) => s.id === activeShopId) ?? shops[0] ?? null, [shops, activeShopId]);
  const switchShop = (id) => { writeActiveShop(id); setActiveShopId(id); };
  const can = useCallback((permission) => !!shop?.permissions.includes(permission), [shop]);

  const value = {
    ready, offline, retry: bootstrap, user, shops, shop, switchShop, can, reload, notice, setNotice,
    login, register, logout, logoutAll, requestReset, resetPassword, verifyEmail, resendVerification,
    updateProfile, changePassword, revokeOthers, requestDeletion, cancelDeletion, previewInvite, acceptInvite,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
