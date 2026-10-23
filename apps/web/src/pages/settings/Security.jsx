// Tài khoản & bảo mật: profile, email verification, password change, signed-in devices, login history, 2FA, account deletion.
import { useState } from 'react';
import { Monitor, Smartphone, LogOut, ShieldCheck, KeyRound, Trash2, MailCheck, MailWarning, UserRound } from 'lucide-react';
import { useAuth, passwordIssues, passwordStrength, DELETE_AFTER_DAYS, VERIFY_GRACE_DAYS } from '../../auth.jsx';
import { DataTable, Status, fmtDate } from '../../components/kit.jsx';
import { Modal, useToast } from '../../components/ui.jsx';
import { DemoMailbox } from '../auth/AuthPages.jsx';

const ago = (ts) => {
  const s = (Date.now() - ts) / 1000;
  if (s < 90) return 'Đang hoạt động';
  if (s < 3600) return `${Math.round(s / 60)} phút trước`;
  if (s < 86400) return `${Math.round(s / 3600)} giờ trước`;
  return `${Math.round(s / 86400)} ngày trước`;
};
const PLATFORM = { WEB: 'Web', ANDROID: 'Android', IOS: 'iOS' };

function Card({ icon: Icon, title, desc, children, danger }) {
  return (
    <div className="card card-pad settings-section" style={danger ? { border: '1px solid #fecaca' } : undefined}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Icon size={20} color={danger ? 'var(--red)' : 'var(--primary)'} />
        <div><h3 style={danger ? { color: 'var(--red)' } : undefined}>{title}</h3>{desc && <div className="muted small" style={{ marginTop: 3 }}>{desc}</div>}</div>
      </div>
      {children}
    </div>
  );
}

export default function Security() {
  const auth = useAuth();
  const { user, client } = auth;
  const [toast, toastNode] = useToast();
  const [profile, setProfile] = useState({ fullName: user.fullName, phone: user.phone || '' });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '', signOutOthers: true });
  const [pwError, setPwError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const sessions = auth.mySessions();
  const daysLeft = Math.max(0, Math.ceil((user.createdAt + VERIFY_GRACE_DAYS * 86400000 - Date.now()) / 86400000));

  const changePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (pw.next !== pw.confirm) return setPwError('Mật khẩu nhập lại không khớp.');
    const r = await auth.changePassword(pw.current, pw.next, pw.signOutOthers);
    if (r.error) return setPwError(r.error);
    setPw({ current: '', next: '', confirm: '', signOutOthers: true });
    toast(`Đã đổi mật khẩu${r.revoked ? `, đăng xuất ${r.revoked} thiết bị khác` : ''}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2>Tài khoản & bảo mật</h2>

      {user.deletionRequestedAt && (
        <div className="auth-alert error" style={{ alignItems: 'center' }}>
          <Trash2 size={16} />
          <span className="grow">Tài khoản đang chờ xóa – dữ liệu sẽ bị xóa vào {new Date(user.deletionRequestedAt + DELETE_AFTER_DAYS * 86400000).toLocaleDateString('vi-VN')}.</span>
          <button className="btn sm primary" onClick={() => { auth.cancelDeletion(); toast('Đã hủy yêu cầu xóa tài khoản'); }}>Hủy yêu cầu xóa</button>
        </div>
      )}

      <Card icon={UserRound} title="Hồ sơ cá nhân">
        <div className="form-grid">
          <label className="field">Họ và tên<input className="input" value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} /></label>
          <label className="field">Số điện thoại<input className="input" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label>
          <label className="field">Email đăng nhập<input className="input" value={user.email} disabled /></label>
          <div className="field">Trạng thái email
            {user.emailVerifiedAt
              ? <span className="row small" style={{ gap: 6, color: 'var(--green)' }}><MailCheck size={16} /> Đã xác minh {new Date(user.emailVerifiedAt).toLocaleDateString('vi-VN')}</span>
              : <span className="row small wrap" style={{ gap: 6, color: '#b45309' }}><MailWarning size={16} /> Chưa xác minh (còn {daysLeft} ngày) <button className="btn sm" onClick={() => { auth.resendVerification(); toast('Đã gửi lại email xác minh'); }}>Gửi lại</button></span>}
          </div>
        </div>
        {!user.emailVerifiedAt && <DemoMailbox email={user.email} purposes={['verify']} />}
        <div className="row small muted" style={{ gap: 6 }}>Vai trò: <Status tone="blue">{user.role === 'ADMIN' ? 'Admin (chủ shop)' : user.role}</Status> · Cửa hàng: <b>{user.shopName}</b></div>
        <div><button className="btn primary" disabled={!profile.fullName.trim()} onClick={() => { auth.updateProfile(profile); toast('Đã lưu hồ sơ'); }}>Lưu hồ sơ</button></div>
      </Card>

      <Card icon={KeyRound} title="Đổi mật khẩu" desc={`Lần đổi gần nhất: ${fmtDate(user.passwordChangedAt)}`}>
        <form onSubmit={changePassword} className="form-grid" noValidate>
          <label className="field" style={{ gridColumn: '1 / -1' }}>Mật khẩu hiện tại<input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
          <label className="field">Mật khẩu mới<input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            {pw.next && <span className="small" style={{ color: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'][passwordStrength(pw.next)] }}>{passwordIssues(pw.next, user.email).join(', ') || 'Mật khẩu đạt yêu cầu'}</span>}
          </label>
          <label className="field">Nhập lại mật khẩu mới<input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
          <label className="row small" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={pw.signOutOthers} onChange={(e) => setPw({ ...pw, signOutOthers: e.target.checked })} /> Đăng xuất khỏi tất cả thiết bị khác</label>
          {pwError && <div className="field-error" style={{ gridColumn: '1 / -1' }}>{pwError}</div>}
          <div><button className="btn primary" disabled={!pw.current || !pw.next}>Đổi mật khẩu</button></div>
        </form>
      </Card>

      <Card icon={Monitor} title={`Thiết bị đang đăng nhập (${sessions.length})`} desc="Nếu thấy thiết bị lạ, hãy đăng xuất thiết bị đó và đổi mật khẩu ngay.">
        <div className="device-list">
          {sessions.map((s) => {
            const current = s.id === client.sessionId;
            const Icon = s.platform === 'WEB' ? Monitor : Smartphone;
            return (
              <div key={s.id} className={`device-row ${current ? 'current' : ''}`}>
                <Icon size={22} />
                <div className="grow">
                  <div><b>{s.deviceName}</b> {current && <Status tone="green">Thiết bị này</Status>}</div>
                  <div className="muted small">{PLATFORM[s.platform]} · IP {s.ip} · Đăng nhập {fmtDate(s.createdAt)} · {current ? 'Đang hoạt động' : ago(s.lastUsedAt)} · Hết hạn {new Date(s.expiresAt).toLocaleDateString('vi-VN')}</div>
                </div>
                <button className="btn sm" onClick={() => { auth.revokeSession(s.id); if (!current) toast('Đã đăng xuất thiết bị'); }}><LogOut size={13} /> {current ? 'Đăng xuất' : 'Đăng xuất thiết bị'}</button>
              </div>
            );
          })}
        </div>
        <div className="row wrap">
          <button className="btn" disabled={sessions.length < 2} onClick={() => { const n = auth.revokeOthers(); toast(`Đã đăng xuất ${n} thiết bị khác`); }}>Đăng xuất tất cả thiết bị khác</button>
          <button className="btn danger" onClick={() => confirm('Đăng xuất khỏi mọi thiết bị, kể cả máy này?') && auth.logoutAll()}>Đăng xuất mọi thiết bị</button>
        </div>
        <div className="muted small">Phiên web: mã truy cập hết hạn sau 15 phút và được làm mới tự động; mã làm mới đổi sau mỗi lần dùng. Thiết bị bị đăng xuất sẽ mất quyền truy cập ngay ở lần kiểm tra kế tiếp (≤ 30 giây).</div>
      </Card>

      <Card icon={ShieldCheck} title="Xác thực 2 lớp (2FA)" desc="Mã 6 số từ ứng dụng Google Authenticator khi đăng nhập. Sẽ bắt buộc với Admin.">
        <div className="row"><Status>Chưa bật</Status><button className="btn sm" disabled title="Có trong Sprint 4 – cần backend">Bật 2FA (sắp có)</button></div>
      </Card>

      <DataTable
        title="Lịch sử đăng nhập"
        rows={auth.loginLog()}
        pageSizes={[10, 20, 50]}
        exportName="lich-su-dang-nhap"
        columns={[
          { key: 'at', label: 'Thời gian', render: (r) => fmtDate(r.at), csv: (r) => fmtDate(r.at) },
          { key: 'ok', label: 'Kết quả', render: (r) => (r.ok ? <Status tone="green">Thành công</Status> : <Status tone="red">Thất bại</Status>), csv: (r) => (r.ok ? 'Thành công' : 'Thất bại') },
          { key: 'reason', label: 'Ghi chú', render: (r) => r.reason || '—' },
          { key: 'device', label: 'Thiết bị' },
        ]}
      />

      <Card icon={Trash2} title="Xóa tài khoản" desc={`Xóa tài khoản và dữ liệu cá nhân của bạn. Có ${DELETE_AFTER_DAYS} ngày để đổi ý (đăng nhập lại để hủy). Chủ shop cần chuyển quyền hoặc xóa cửa hàng trước khi xóa vĩnh viễn.`} danger>
        <div><button className="btn danger" onClick={() => setDeleting(true)} disabled={!!user.deletionRequestedAt}><Trash2 size={14} /> Yêu cầu xóa tài khoản</button></div>
      </Card>

      {deleting && <DeleteModal onClose={() => setDeleting(false)} />}
      {toastNode}
    </div>
  );
}

function DeleteModal({ onClose }) {
  const { requestDeletion, user } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    const r = await requestDeletion(password);
    if (r.error) setError(r.error);
  };
  return (
    <Modal title="Xóa tài khoản" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn" style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }} disabled={!password || confirmText !== 'XOA'} onClick={submit}>Xóa tài khoản</button></>}>
      <div className="auth-alert error"><Trash2 size={16} /><span>Tài khoản <b>{user.email}</b> sẽ bị đăng xuất khỏi mọi thiết bị và xóa vĩnh viễn sau {DELETE_AFTER_DAYS} ngày.</span></div>
      <label className="field">Nhập mật khẩu để xác nhận<input className="input" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} autoComplete="current-password" /></label>
      <label className="field">Gõ <code>XOA</code> để xác nhận<input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></label>
      {error && <div className="field-error">{error}</div>}
    </Modal>
  );
}
