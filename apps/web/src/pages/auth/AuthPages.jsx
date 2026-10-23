import { useEffect, useRef, useState } from 'react';
import { Bot, Eye, EyeOff, Mail, Lock, User, Store, Phone, CheckCircle2, AlertTriangle, ArrowLeft, Sparkles, ShieldCheck, MessageSquare, BarChart3, Inbox } from 'lucide-react';
import { useAuth, passwordIssues, passwordStrength, isEmail, DEMO_ACCOUNT, MAX_FAILED } from '../../auth.jsx';
import { navigate } from '../../router.js';

const FIELDS = ['Nội thất', 'Thời trang', 'F&B', 'Làm đẹp', 'Bất động sản', 'Giáo dục', 'Khác'];

function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth-page">
      <aside className="auth-brand">
        <div className="brand" style={{ fontSize: 24 }}><Bot size={30} /> OmniBot</div>
        <h1>Chatbot AI & CRM cho bán hàng đa kênh</h1>
        <ul>
          <li><Sparkles size={18} /> AI trả lời khách 24/7, tự thu SĐT và chốt đơn</li>
          <li><MessageSquare size={18} /> Facebook, Zalo, TikTok, website trong một hộp thư</li>
          <li><BarChart3 size={18} /> Đo quảng cáo tới tận đơn hàng và doanh thu</li>
          <li><ShieldCheck size={18} /> Phân quyền theo vai trò, bảo mật đăng nhập</li>
        </ul>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-mobile-brand brand"><Bot size={24} /> OmniBot</div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
          {children}
        </div>
        {footer && <div className="auth-footer">{footer}</div>}
        <div className="auth-legal small muted"><a href="#/legal/terms">Điều khoản sử dụng</a> · <a href="#/legal/privacy">Chính sách quyền riêng tư</a></div>
      </main>
    </div>
  );
}

function Field({ icon: Icon, label, error, hint, children }) {
  return (
    <label className="field auth-field">
      {label}
      <div className={`auth-input ${error ? 'invalid' : ''}`}>{Icon && <Icon size={16} />}{children}</div>
      {error ? <span className="field-error">{error}</span> : hint ? <span className="muted small">{hint}</span> : null}
    </label>
  );
}

function PasswordInput({ value, onChange, placeholder = 'Mật khẩu', autoComplete = 'current-password', autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} autoFocus={autoFocus} />
      <button type="button" className="icon-btn" title={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShow(!show)} tabIndex={-1}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
    </>
  );
}

function StrengthMeter({ password, email }) {
  const s = passwordStrength(password);
  const issues = passwordIssues(password, email);
  const labels = ['Rất yếu', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh'];
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];
  if (!password) return <span className="muted small">Ít nhất 8 ký tự, có cả chữ và số.</span>;
  return (
    <div>
      <div className="strength"><i style={{ width: `${(s + 1) * 20}%`, background: colors[s] }} /></div>
      <span className="small" style={{ color: colors[s] }}>{labels[s]}</span>
      {issues.length > 0 && <span className="small field-error"> · Cần: {issues.join(', ').toLowerCase()}</span>}
    </div>
  );
}

function Alert({ tone = 'error', children }) {
  return <div className={`auth-alert ${tone}`}>{tone === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}<span>{children}</span></div>;
}

// Until an email service exists, "sent" emails are shown here so the links can be clicked.
export function DemoMailbox({ email, purposes }) {
  const { outbox } = useAuth();
  const mails = outbox(email).filter((m) => !purposes || purposes.includes(m.purpose)).slice(0, 3);
  if (!mails.length) return null;
  return (
    <div className="demo-mail">
      <div className="row small" style={{ gap: 6 }}><Inbox size={14} /> <b>Hộp thư demo</b> <span className="muted">– bản demo chưa gửi email thật</span></div>
      {mails.map((m) => (
        <div key={m.id} className="demo-mail-item">
          <div className="small"><b>{m.subject}</b></div>
          <div className="muted small">Tới {m.to} · {new Date(m.at).toLocaleTimeString('vi-VN')}</div>
          {m.link && <a className="btn sm primary" href={m.link} style={{ marginTop: 6 }}>Mở liên kết trong email</a>}
        </div>
      ))}
    </div>
  );
}


export function LoginPage() {
  const { login, notice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [captcha, setCaptcha] = useState(false);
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isEmail(email)) return setError('Email không hợp lệ.');
    if (!password) return setError('Vui lòng nhập mật khẩu.');
    setBusy(true);
    const r = await login({ email, password, remember, captcha });
    setBusy(false);
    if (r.error) { setError(r.error); setNeedCaptcha(!!r.needCaptcha); setCaptcha(false); }
    // On success App redirects (to the pending-deletion notice, the "next" page, or Home).
  };

  return (
    <AuthLayout title="Đăng nhập" subtitle="Chào mừng bạn quay lại OmniBot" footer={<>Chưa có tài khoản? <a href="#/register">Đăng ký miễn phí</a></>}>
      {notice && <Alert tone="info">{notice}</Alert>}
      <form onSubmit={submit} className="auth-form" noValidate>
        <Field icon={Mail} label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@congty.vn" autoComplete="username" autoFocus /></Field>
        <Field icon={Lock} label={<span className="row between">Mật khẩu <a href="#/forgot" className="small">Quên mật khẩu?</a></span>}><PasswordInput value={password} onChange={setPassword} /></Field>
        <label className="row small"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Ghi nhớ đăng nhập 30 ngày (bỏ chọn: tự đăng xuất sau 24 giờ)</label>
        {needCaptcha && (
          <label className="captcha-box"><input type="checkbox" checked={captcha} onChange={(e) => setCaptcha(e.target.checked)} /> Tôi không phải là người máy <span className="muted small">(demo – thay bằng reCAPTCHA/Turnstile)</span></label>
        )}
        {error && <Alert>{error}</Alert>}
        <button className="btn primary auth-submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
      <div className="demo-hint small">
        Tài khoản demo: <code>{DEMO_ACCOUNT.email}</code> / <code>{DEMO_ACCOUNT.password}</code>
        <button type="button" className="btn sm" onClick={() => { setEmail(DEMO_ACCOUNT.email); setPassword(DEMO_ACCOUNT.password); }}>Điền sẵn</button>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>Nhập sai {MAX_FAILED} lần liên tiếp, tài khoản sẽ bị khóa tạm 15 phút.</p>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const [f, setF] = useState({ fullName: '', email: '', phone: '', shopName: '', field: 'Nội thất', password: '', confirm: '', agree: false });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const errors = {
    fullName: !f.fullName.trim() && 'Nhập họ tên',
    email: !isEmail(f.email) && 'Email không hợp lệ',
    phone: f.phone && !/^(0|\+84)\d{9}$/.test(f.phone.replace(/\s/g, '')) && 'Số điện thoại không hợp lệ',
    shopName: !f.shopName.trim() && 'Nhập tên cửa hàng',
    password: passwordIssues(f.password, f.email).length > 0 && 'Mật khẩu chưa đạt yêu cầu',
    confirm: f.confirm !== f.password && 'Mật khẩu nhập lại không khớp',
    agree: !f.agree && 'Bạn cần đồng ý điều khoản',
  };
  const show = (k) => touched && errors[k];

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    setError('');
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    const r = await register({ ...f, phone: f.phone.replace(/\s/g, '') });
    setBusy(false);
    if (r.error) return setError(r.error);
    navigate('home');
  };

  return (
    <AuthLayout title="Tạo tài khoản chủ shop" subtitle="Dùng thử miễn phí. Nhân viên sẽ được bạn mời vào sau." footer={<>Đã có tài khoản? <a href="#/login">Đăng nhập</a></>}>
      <form onSubmit={submit} className="auth-form" noValidate>
        <div className="auth-grid">
          <Field icon={User} label="Họ và tên" error={show('fullName')}><input value={f.fullName} onChange={set('fullName')} placeholder="Nguyễn Văn A" autoComplete="name" autoFocus /></Field>
          <Field icon={Phone} label="Số điện thoại (không bắt buộc)" error={show('phone')}><input value={f.phone} onChange={set('phone')} placeholder="0901234567" autoComplete="tel" /></Field>
        </div>
        <Field icon={Mail} label="Email" error={show('email')} hint="Dùng để đăng nhập và nhận link xác minh"><input type="email" value={f.email} onChange={set('email')} placeholder="ban@congty.vn" autoComplete="email" /></Field>
        <div className="auth-grid">
          <Field icon={Store} label="Tên cửa hàng" error={show('shopName')}><input value={f.shopName} onChange={set('shopName')} placeholder="VD: Nội thất Gỗ Việt" /></Field>
          <label className="field auth-field">Lĩnh vực<select className="select" value={f.field} onChange={set('field')}>{FIELDS.map((x) => <option key={x}>{x}</option>)}</select></label>
        </div>
        <Field icon={Lock} label="Mật khẩu" error={show('password')}><PasswordInput value={f.password} onChange={(v) => setF({ ...f, password: v })} autoComplete="new-password" /></Field>
        <StrengthMeter password={f.password} email={f.email} />
        <Field icon={Lock} label="Nhập lại mật khẩu" error={show('confirm')}><PasswordInput value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} placeholder="Nhập lại mật khẩu" autoComplete="new-password" /></Field>
        <label className="row small" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" checked={f.agree} onChange={set('agree')} style={{ marginTop: 3 }} />
          <span>Tôi đồng ý với <a href="#/legal/terms" target="_blank" rel="noreferrer">Điều khoản sử dụng</a> và <a href="#/legal/privacy" target="_blank" rel="noreferrer">Chính sách quyền riêng tư</a>, bao gồm việc OmniBot xử lý dữ liệu khách hàng của cửa hàng theo Nghị định 13/2023/NĐ-CP.</span>
        </label>
        {show('agree') && <span className="field-error">{errors.agree}</span>}
        {error && <Alert>{error}</Alert>}
        <button className="btn primary auth-submit" disabled={busy}>{busy ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}</button>
      </form>
    </AuthLayout>
  );
}

export function ForgotPage() {
  const { requestReset } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!isEmail(email)) return setError('Email không hợp lệ.');
    requestReset(email);
    setSent(true);
  };
  return (
    <AuthLayout title="Quên mật khẩu" subtitle="Nhập email đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu." footer={<a href="#/login" className="row" style={{ gap: 4, justifyContent: 'center' }}><ArrowLeft size={14} /> Quay lại đăng nhập</a>}>
      {sent ? (
        <>
          {/* Same message whether or not the email exists, so accounts can't be discovered. */}
          <Alert tone="info">Nếu <b>{email}</b> đã đăng ký, bạn sẽ nhận được email có liên kết đặt lại mật khẩu. Liên kết có hiệu lực 30 phút và chỉ dùng được một lần.</Alert>
          <DemoMailbox email={email} purposes={['reset']} />
          <button className="btn auth-submit" onClick={() => setSent(false)}>Gửi lại</button>
        </>
      ) : (
        <form onSubmit={submit} className="auth-form" noValidate>
          <Field icon={Mail} label="Email" error={error}><input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} placeholder="ban@congty.vn" autoFocus /></Field>
          <button className="btn primary auth-submit">Gửi liên kết đặt lại</button>
        </form>
      )}
    </AuthLayout>
  );
}

const tokenFromHash = () => new URLSearchParams(window.location.hash.split('?')[1] || '').get('token') || '';

export function ResetPage() {
  const { checkToken, resetPassword, db } = useAuth();
  const token = tokenFromHash();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const linkError = db ? checkToken(token, 'PASSWORD_RESET') : null;
  const email = db?.users.find((u) => u.id === db.tokens.find((t) => t.token === token)?.userId)?.email || '';

  const submit = async (e) => {
    e.preventDefault();
    if (pw !== confirm) return setError('Mật khẩu nhập lại không khớp.');
    const r = await resetPassword(token, pw);
    if (r.error) return setError(r.error);
    setDone(true);
  };

  return (
    <AuthLayout title="Đặt lại mật khẩu" footer={<a href="#/login">Quay lại đăng nhập</a>}>
      {done ? (
        <>
          <Alert tone="info">Đã đổi mật khẩu. Vì lý do bảo mật, bạn đã được đăng xuất khỏi mọi thiết bị.</Alert>
          <button className="btn primary auth-submit" onClick={() => navigate('login')}>Đăng nhập</button>
        </>
      ) : linkError && !done ? (
        <>
          <Alert>{linkError}</Alert>
          <button className="btn primary auth-submit" onClick={() => navigate('forgot')}>Gửi liên kết mới</button>
        </>
      ) : (
        <form onSubmit={submit} className="auth-form" noValidate>
          <p className="muted small">Đặt mật khẩu mới cho <b>{email}</b></p>
          <Field icon={Lock} label="Mật khẩu mới"><PasswordInput value={pw} onChange={setPw} autoComplete="new-password" autoFocus /></Field>
          <StrengthMeter password={pw} email={email} />
          <Field icon={Lock} label="Nhập lại mật khẩu mới"><PasswordInput value={confirm} onChange={setConfirm} placeholder="Nhập lại mật khẩu" autoComplete="new-password" /></Field>
          {error && <Alert>{error}</Alert>}
          <button className="btn primary auth-submit" disabled={passwordIssues(pw, email).length > 0}>Đổi mật khẩu</button>
        </form>
      )}
    </AuthLayout>
  );
}

export function VerifyPage() {
  const { verifyEmail, ready, user } = useAuth();
  const [result, setResult] = useState(null);
  const ran = useRef(false); // links are single-use: never consume twice (StrictMode runs effects twice in dev)
  useEffect(() => { if (ready && !ran.current) { ran.current = true; setResult(verifyEmail(tokenFromHash())); } }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AuthLayout title="Xác minh email">
      {!result ? <p className="muted">Đang xác minh…</p> : result.ok ? (
        <>
          <Alert tone="info">Email đã được xác minh. Cảm ơn bạn!</Alert>
          <button className="btn primary auth-submit" onClick={() => navigate(user ? 'home' : 'login')}>{user ? 'Vào ứng dụng' : 'Đăng nhập'}</button>
        </>
      ) : (
        <>
          <Alert>{result.error}</Alert>
          <p className="muted small">Đăng nhập rồi bấm "Gửi lại email xác minh" trên thanh thông báo để nhận liên kết mới.</p>
          <button className="btn primary auth-submit" onClick={() => navigate(user ? 'home' : 'login')}>{user ? 'Vào ứng dụng' : 'Đăng nhập'}</button>
        </>
      )}
    </AuthLayout>
  );
}

// Placeholder legal pages: required by the sign-up form and by App Store / Google Play. Final text must come from legal counsel.
export function LegalPage({ doc }) {
  const privacy = doc === 'privacy';
  return (
    <div className="legal-page">
      <a href="#/login" className="row small" style={{ gap: 4 }}><ArrowLeft size={14} /> OmniBot</a>
      <h1>{privacy ? 'Chính sách quyền riêng tư' : 'Điều khoản sử dụng'}</h1>
      <div className="auth-alert error"><AlertTriangle size={16} /><span>Bản nháp khung nội dung – cần bộ phận pháp lý hoàn thiện trước khi phát hành.</span></div>
      {privacy ? (
        <>
          <h3>1. Dữ liệu chúng tôi thu thập</h3><p>Thông tin tài khoản (họ tên, email, số điện thoại), nhật ký đăng nhập và thiết bị; dữ liệu khách hàng do cửa hàng đưa vào hoặc nhận từ các kênh đã kết nối (tin nhắn, SĐT, địa chỉ, đơn hàng).</p>
          <h3>2. Mục đích sử dụng</h3><p>Cung cấp dịch vụ chatbot, CRM, quản lý bán hàng; bảo mật tài khoản; hỗ trợ khách hàng. Không bán dữ liệu cá nhân cho bên thứ ba.</p>
          <h3>3. Lưu trữ & bảo mật</h3><p>Mật khẩu được băm, kết nối mã hóa, phân quyền theo vai trò, nhật ký thao tác.</p>
          <h3>4. Quyền của bạn</h3><p>Xem, sửa, xuất dữ liệu; rút lại sự đồng ý; yêu cầu xóa tài khoản trong mục Tài khoản & bảo mật – dữ liệu bị xóa sau {30} ngày.</p>
          <h3>5. Liên hệ</h3><p>Email hỗ trợ và địa chỉ đơn vị chủ quản sẽ được bổ sung.</p>
        </>
      ) : (
        <>
          <h3>1. Tài khoản</h3><p>Bạn chịu trách nhiệm bảo mật mật khẩu và mọi hoạt động dưới tài khoản của mình.</p>
          <h3>2. Sử dụng hợp lệ</h3><p>Không dùng OmniBot để gửi tin rác, nội dung vi phạm pháp luật hoặc chính sách của Facebook, Zalo, TikTok.</p>
          <h3>3. Dữ liệu của cửa hàng</h3><p>Cửa hàng là bên kiểm soát dữ liệu khách hàng của mình; OmniBot xử lý dữ liệu theo chỉ dẫn của cửa hàng.</p>
          <h3>4. Phí & gói dịch vụ</h3><p>Gói phần mềm được mua trên website.</p>
          <h3>5. Chấm dứt</h3><p>Bạn có thể xóa tài khoản bất cứ lúc nào.</p>
        </>
      )}
    </div>
  );
}

