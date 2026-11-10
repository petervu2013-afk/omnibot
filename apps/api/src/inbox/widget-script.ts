// Source of GET /webchat/widget.js. Plain ES2017 that runs on any website, isolated in a shadow root so the host
// page's CSS cannot break it. Kept as a string so the TypeScript build ships it without a copy step.
// (No backticks or template placeholders inside: the whole script is one String.raw literal.)
export const WIDGET_JS = String.raw`(function () {
  'use strict';
  var me = document.currentScript;
  if (!me || window.__omnibotWebchat) return;
  window.__omnibotWebchat = true;
  var siteKey = me.getAttribute('data-site-key');
  if (!siteKey) { console.warn('[OmniBot] thiếu data-site-key'); return; }
  var base = new URL(me.src).origin;
  var title = me.getAttribute('data-title') || 'Chat với cửa hàng';
  var color = me.getAttribute('data-color') || '#2563eb';
  var profile = { name: me.getAttribute('data-name') || undefined, email: me.getAttribute('data-email') || undefined, phone: me.getAttribute('data-phone') || undefined };
  var storeKey = 'omnibot:' + siteKey;
  function load(k) { try { return localStorage.getItem(storeKey + ':' + k); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(storeKey + ':' + k, v); } catch (e) { /* private mode */ } }
  // ADS-08: where the visitor came from (?ref= / utm_*), kept from the landing page for later pages.
  function attribution() {
    var q = new URLSearchParams(location.search), a = {};
    if (q.get('ref')) a.ref = q.get('ref'); else if (q.get('utm_campaign')) a.ref = q.get('utm_campaign');
    if (q.get('utm_source')) a.src = q.get('utm_source');
    if (a.ref || a.src) { save('attr', JSON.stringify(a)); return a; }
    try { return JSON.parse(load('attr') || 'null') || undefined; } catch (e) { return undefined; }
  }

  var host = document.createElement('div');
  host.setAttribute('data-omnibot', '');
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  root.innerHTML =
    '<style>' +
    ':host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
    '.btn{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.2);z-index:2147483646;font-size:24px}' +
    '.badge{position:absolute;top:-2px;right:-2px;min-width:20px;height:20px;border-radius:10px;background:#dc2626;color:#fff;font-size:12px;line-height:20px;text-align:center;padding:0 5px;display:none}' +
    '.panel{position:fixed;right:20px;bottom:88px;width:340px;max-width:calc(100vw - 32px);height:460px;max-height:calc(100vh - 120px);background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.2);display:none;flex-direction:column;overflow:hidden;z-index:2147483647}' +
    '.panel.open{display:flex}' +
    '.head{color:#fff;padding:12px 16px;font-weight:600;font-size:15px;display:flex;justify-content:space-between;align-items:center}' +
    '.head button{background:none;border:0;color:#fff;font-size:20px;cursor:pointer}' +
    '.list{flex:1;overflow-y:auto;padding:12px;background:#f8fafc;display:flex;flex-direction:column;gap:6px}' +
    '.msg{max-width:80%;padding:8px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}' +
    '.me{align-self:flex-end;color:#fff}.shop{align-self:flex-start;background:#e2e8f0;color:#0f172a}' +
    '.pending{opacity:.6}.failed{background:#fecaca!important;color:#7f1d1d!important;cursor:pointer}' +
    '.meta{font-size:11px;color:#64748b;align-self:flex-end;min-height:14px}' +
    '.typing{font-size:12px;color:#64748b;padding:0 12px 4px;min-height:18px;background:#f8fafc}' +
    '.empty{color:#64748b;font-size:13px;text-align:center;margin:auto}' +
    'form{display:flex;border-top:1px solid #e2e8f0}' +
    'textarea{flex:1;border:0;padding:12px;font-size:14px;resize:none;outline:none;height:48px}' +
    'form button{border:0;background:none;padding:0 16px;font-weight:600;cursor:pointer}' +
    '.status{font-size:12px;color:#b45309;background:#fffbeb;padding:4px 12px;display:none}' +
    '</style>' +
    '<button class="btn" aria-label="Mở chat">&#128172;<span class="badge"></span></button>' +
    '<div class="panel" role="dialog" aria-label="Chat"><div class="head"><span class="title"></span><button class="close" aria-label="Đóng">&times;</button></div>' +
    '<div class="status"></div><div class="list" aria-live="polite"></div><div class="typing"></div>' +
    '<form><textarea placeholder="Nhập tin nhắn…" maxlength="2000" aria-label="Tin nhắn"></textarea><button type="submit">Gửi</button></form></div>';
  document.body.appendChild(host);

  function $(sel) { return root.querySelector(sel); }
  var btn = $('.btn'), panel = $('.panel'), list = $('.list'), input = $('textarea'), form = $('form'), badge = $('.badge'), typingEl = $('.typing'), statusEl = $('.status'), meta = null;
  btn.style.background = color; $('.head').style.background = color; $('form button').style.color = color; $('.title').textContent = title;
  var unread = 0, socket = null, typingTimer = null, lastTyping = 0;

  function setUnread(n) { unread = n; badge.textContent = String(n); badge.style.display = n ? 'block' : 'none'; }
  function scroll() { list.scrollTop = list.scrollHeight; }
  function bubble(m, extra) {
    var empty = list.querySelector('.empty'); if (empty) empty.remove();
    var el = document.createElement('div');
    el.className = 'msg ' + (m.from === 'me' ? 'me' : 'shop') + (extra ? ' ' + extra : '');
    if (m.from === 'me') el.style.background = color;
    el.textContent = m.text || '';
    if (m.id) el.setAttribute('data-id', m.id);
    if (meta) list.insertBefore(el, meta); else list.appendChild(el);
    scroll();
    return el;
  }
  function setMeta(text) {
    if (!meta) { meta = document.createElement('div'); meta.className = 'meta'; }
    list.appendChild(meta); meta.textContent = text;
  }
  function status(text) { statusEl.textContent = text || ''; statusEl.style.display = text ? 'block' : 'none'; }
  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  function open() { panel.classList.add('open'); setUnread(0); input.focus(); connect(); scroll(); }
  btn.addEventListener('click', function () { if (panel.classList.contains('open')) panel.classList.remove('open'); else open(); });
  $('.close').addEventListener('click', function () { panel.classList.remove('open'); });

  function send(text, clientId, el) {
    el.classList.add('pending'); el.classList.remove('failed'); el.onclick = null;
    socket.timeout(10000).emit('message', { clientId: clientId, text: text, name: profile.name, email: profile.email, phone: profile.phone }, function (err, res) {
      el.classList.remove('pending');
      if (err || !res || !res.ok) {
        el.classList.add('failed');
        el.title = res && res.error === 'TOO_FAST' ? 'Bạn gửi quá nhanh — bấm để gửi lại' : 'Chưa gửi được — bấm để gửi lại';
        // Same clientId: if the first try did reach the server, the retry is recognised as a duplicate.
        el.onclick = function () { send(text, clientId, el); };
        return;
      }
      setMeta('Đã gửi');
    });
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || !socket) return;
    input.value = '';
    send(text, newId(), bubble({ from: 'me', text: text }));
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.dispatchEvent(new Event('submit', { cancelable: true })); }
  });
  input.addEventListener('input', function () {
    var now = Date.now();
    if (socket && now - lastTyping > 2000) { lastTyping = now; socket.emit('typing'); }
  });

  function connect() {
    if (socket) return;
    function start() {
      socket = window.io(base + '/webchat', { auth: { siteKey: siteKey, visitorToken: load('token') || undefined, attribution: attribution() }, transports: ['websocket', 'polling'] });
      socket.on('connect', function () { status(''); });
      socket.on('disconnect', function () { status('Mất kết nối, đang thử lại…'); });
      socket.on('connect_error', function (err) {
        var code = err && err.message;
        status(code === 'ORIGIN_NOT_ALLOWED' ? 'Website này chưa được phép dùng khung chat.' : code === 'SITE_NOT_FOUND' ? 'Khung chat đã tắt.' : 'Không kết nối được, đang thử lại…');
      });
      socket.on('session', function (s) {
        save('token', s.visitorToken);
        // Reconnects present the token issued now, so the visitor keeps the same conversation.
        socket.auth.visitorToken = s.visitorToken;
        list.innerHTML = ''; meta = null;
        if (!s.history.length) list.innerHTML = '<div class="empty">Xin chào! Cửa hàng có thể giúp gì cho bạn?</div>';
        s.history.forEach(function (m) { bubble(m); });
      });
      socket.on('message', function (m) {
        typingEl.textContent = '';
        if (m.id && list.querySelector('[data-id="' + m.id + '"]')) return;
        bubble(m);
        if (meta) meta.textContent = '';
        if (!panel.classList.contains('open')) setUnread(unread + 1);
      });
      socket.on('seen', function () { setMeta('Đã xem'); });
      socket.on('typing', function () {
        typingEl.textContent = 'Cửa hàng đang nhập…';
        clearTimeout(typingTimer);
        typingTimer = setTimeout(function () { typingEl.textContent = ''; }, 4000);
      });
    }
    if (window.io) return start();
    var s = document.createElement('script');
    s.src = base + '/socket.io/socket.io.min.js';
    s.onload = start;
    s.onerror = function () { status('Không tải được khung chat.'); };
    document.head.appendChild(s);
  }
  // Returning visitors reconnect at once so replies sent while they were away raise the badge.
  if (load('token')) connect();
})();
`;
