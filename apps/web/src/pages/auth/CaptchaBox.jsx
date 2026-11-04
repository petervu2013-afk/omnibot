// CAPTCHA shown from the 3rd failed login. With VITE_TURNSTILE_SITE_KEY it renders Cloudflare Turnstile and passes
// the token up (the API verifies it). Without a key (development) a plain checkbox stands in; the API accepts that
// only when it has no TURNSTILE_SECRET_KEY, which production refuses.
import { useEffect, useRef, useState } from 'react';

const SITE_KEY = import.meta.env?.VITE_TURNSTILE_SITE_KEY;
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT;
    el.async = true;
    el.onload = resolve;
    el.onerror = reject;
    document.head.appendChild(el);
  });
}

export function CaptchaBox({ onToken }) {
  const box = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!SITE_KEY) return undefined;
    let widget;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !box.current) return;
      widget = window.turnstile.render(box.current, { sitekey: SITE_KEY, callback: onToken, 'expired-callback': () => onToken(''), 'error-callback': () => onToken('') });
    }).catch(() => setFailed(true));
    return () => { cancelled = true; if (widget !== undefined) window.turnstile?.remove(widget); };
  }, [onToken]);

  if (!SITE_KEY) {
    return <label className="captcha-box"><input type="checkbox" onChange={(e) => onToken(e.target.checked ? 'dev-captcha' : '')} /> Tôi không phải là người máy <span className="muted small">(bản phát triển)</span></label>;
  }
  return failed ? <div className="field-error">Không tải được ô xác nhận. Vui lòng tải lại trang.</div> : <div ref={box} />;
}
