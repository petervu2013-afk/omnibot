// HTTP client for the OmniBot API. The access token lives only in this module's memory; the refresh token is an
// HttpOnly cookie the page cannot read, so a script injected into the page cannot steal a long-lived session.
const BASE = import.meta.env?.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessToken = null;
let onSessionLost = () => {};
let refreshing = null;

export const setAccessToken = (token) => { accessToken = token; };
/** For the realtime socket handshake only; never stored anywhere. */
export const getAccessToken = () => accessToken;
export const setSessionLostHandler = (fn) => { onSessionLost = fn; };

async function send(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/v1${path}`, {
      method,
      credentials: 'include',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.');
  }
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? 'Có lỗi xảy ra, vui lòng thử lại.', e?.details);
  }
  return data;
}

// One refresh at a time, across tabs too: the token rotates on every use, so two tabs using the same one at once
// would look like a stolen token and sign the device out.
const withLock = (fn) => (navigator.locks ? navigator.locks.request('omnibot-token-refresh', fn) : fn());

/** Exchanges the refresh cookie for a new access token. Returns { user, shops, ... }; throws ApiError when signed out. */
export function refreshSession() {
  refreshing ??= withLock(async () => {
    const issued = await send('/auth/refresh', { method: 'POST', body: {} });
    accessToken = issued.accessToken;
    return issued;
  }).finally(() => { refreshing = null; });
  return refreshing;
}

/** Authenticated request: refreshes an expired access token once and retries. */
export async function api(path, options) {
  try {
    return await send(path, options);
  } catch (err) {
    if (err.code === 'SESSION_REVOKED') {
      onSessionLost('Phiên đăng nhập đã bị đăng xuất. Vui lòng đăng nhập lại.');
      throw err;
    }
    if (err.status !== 401 || !['TOKEN_INVALID', 'UNAUTHORIZED'].includes(err.code)) throw err;
    try {
      await refreshSession();
    } catch (refreshErr) {
      if (refreshErr.status === 401) onSessionLost('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
      throw refreshErr;
    }
    return send(path, options);
  }
}

/** For public endpoints (login, register…): a 401 there is an answer, not an expired session. */
export const publicApi = (path, options) => send(path, options);
