// Tài khoản & bảo mật: profile, email verification, password change, signed-in devices, login history, 2FA, account deletion.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor, Smartphone, LogOut, ShieldCheck, KeyRound, Trash2, MailCheck, MailWarning, UserRound } from 'lucide-react';
import { api } from '../../api.js';
import { ROLE_LABEL } from '../../access.js';
import { useAuth, passwordIssues, passwordStrength, DELETE_AFTER_DAYS } from '../../auth.jsx';
import { DataTable, Status, fmtDate } from '../../components/kit.jsx';
import { Modal, useToast } from '../../components/ui.jsx';

const ago = (value) => {
  const s = (Date.now() - new Date(value)) / 1000;
  if (s < 90) return 'Vừa hoạt động';
  if (s < 3600) return `${Math.round(s / 60)} phút trước`;
  if (s < 86400) return `${Math.round(s / 3600)} giờ trước`;
  return `${Math.round(s / 86400)} ngày trước`;
};
const PLATFORM = { WEB: 'Web', ANDROID: 'Android', IOS: 'iOS' };
const date = (value) => new Date(value).toLocaleDateString('vi-VN');

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
  const { user, shop } = auth;
  const qc = useQueryClient();
  const [toast, toastNode] = useToast();
  const [profile, setProfile] = useState({ fullName: user.fullName, phone: user.phone || '' });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api('/auth/sessions'), refetchInterval: 30000 });
  const history = useQuery({ queryKey: ['login-history'], queryFn: () => api('/auth/login-history') });
  const list = sessions.data ?? [];
  const daysLeft = user.verifyDeadline ? Math.max(0, Math.ceil((new Date(user.verifyDeadline) - Date.now()) / 86400000)) : 0;
  const refreshSessions = () => qc.invalidateQueries({ queryKey: ['sessions'] });
  const revoke = useMutation({
    mutationFn: (id) => api(`/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast('Đã đăng xuất thiết bị'); refreshSessions(); },
    onError: (err) => toast(err.message),
  });

  const saveProfile = async () => {
    const r = await auth.updateProfile({ fullName: profile.fullName.trim(), phone: profile.phone.trim() || null });
    toast(r.error ?? 'Đã lưu hồ sơ');
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (pw.next !== pw.confirm) return setPwError('Mật khẩu nhập lại không khớp.');
    const r = await auth.changePassword(pw.current, pw.next);
    if (r.error) return setPwError(r.error);
    setPw({ current: '', next: '', confirm: '' });
    refreshSessions();
    toast('Đã đổi mật khẩu và đăng xuất các thiết bị khác');
  };

  const others = async () => {
    const r = await auth.revokeOthers();
    toast(r.error ?? `Đã đăng xuất ${r.revoked} thiết bị khác`);
    refreshSessions();
  };

  const cancelDeletion = async () => {
    const r = await auth.cancelDeletion();
    toast(r.error ?? 'Đã hủy yêu cầu xóa tài khoản');
  };

  const resend = async () => {
    const r = await auth.resendVerification();
    toast(r.error ?? 'Đã gửi lại email xác minh');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2>Tài khoản & bảo mật</h2>

      {user.deletionRequestedAt && (
        <div className="auth-alert error" style={{ alignItems: 'center' }}>
          <Trash2 size={16} />
          <span className="grow">Tài khoản đang chờ xóa – dữ liệu sẽ bị xóa vào {date(user.purgeAt)}.</span>
          <button className="btn sm primary" onClick={cancelDeletion}>Hủy yêu cầu xóa</button>
        </div>
      )}

      <Card icon={UserRound} title="Hồ sơ cá nhân">
        <div className="form-grid">
          <label className="field">Họ và tên<input className="input" value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} /></label>
          <label className="field">Số điện thoại<input className="input" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label>
          <label className="field">Email đăng nhập<input className="input" value={user.email} disabled /></label>
          <div className="field">Trạng thái email
            {user.emailVerifiedAt
              ? <span className="row small" style={{ gap: 6, color: 'var(--green)' }}><MailCheck size={16} /> Đã xác minh {date(user.emailVerifiedAt)}</span>
              : <span className="row small wrap" style={{ gap: 6, color: '#b45309' }}><MailWarning size={16} /> Chưa xác minh (còn {daysLeft} ngày) <button className="btn sm" onClick={resend}>Gửi lại</button></span>}
          </div>
        </div>
        {shop && <div className="row small muted" style={{ gap: 6 }}>Vai trò: <Status tone="blue">{ROLE_LABEL[shop.role]}{shop.isOwner ? ' (chủ shop)' : ''}</Status> · Cửa hàng: <b>{shop.name}</b></div>}
        <div><button className="btn primary" disabled={profile.fullName.trim().length < 2} onClick={saveProfile}>Lưu hồ sơ</button></div>
      </Card>

      <Card icon={KeyRound} title="Đổi mật khẩu" desc="Sau khi đổi, các thiết bị khác sẽ bị đăng xuất.">
        <form onSubmit={changePassword} className="form-grid" noValidate>
          <label className="field" style={{ gridColumn: '1 / -1' }}>Mật khẩu hiện tại<input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
          <label className="field">Mật khẩu mới<input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            {pw.next && <span className="small" style={{ color: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'][passwordStrength(pw.next)] }}>{passwordIssues(pw.next, user.email).join(', ') || 'Mật khẩu đạt yêu cầu'}</span>}
          </label>
          <label className="field">Nhập lại mật khẩu mới<input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
          {pwError && <div className="field-error" style={{ gridColumn: '1 / -1' }}>{pwError}</div>}
          <div><button className="btn primary" disabled={!pw.current || !pw.next}>Đổi mật khẩu</button></div>
        </form>
      </Card>

      <Card icon={Monitor} title={`Thiết bị đang đăng nhập (${list.length})`} desc="Nếu thấy thiết bị lạ, hãy đăng xuất thiết bị đó và đổi mật khẩu ngay.">
        <div className="device-list">
          {sessions.isError && <div className="field-error">{sessions.error.message}</div>}
          {list.map((s) => {
            const Icon = s.platform === 'WEB' ? Monitor : Smartphone;
            return (
              <div key={s.id} className={`device-row ${s.current ? 'current' : ''}`} data-testid="device-row">
                <Icon size={22} />
                <div className="grow">
                  <div><b>{s.deviceName || PLATFORM[s.platform]}</b> {s.current && <Status tone="green">Thiết bị này</Status>}</div>
                  <div className="muted small">{PLATFORM[s.platform]} · IP {s.ip || 'không rõ'} · {s.current ? 'Đang hoạt động' : ago(s.lastUsedAt)} · Hết hạn {date(s.expiresAt)}</div>
                </div>
                {s.current
                  ? <button className="btn sm" onClick={() => auth.logout()}><LogOut size={13} /> Đăng xuất</button>
                  : <button className="btn sm" onClick={() => revoke.mutate(s.id)}><LogOut size={13} /> Đăng xuất thiết bị</button>}
              </div>
            );
          })}
        </div>
        <div className="row wrap">
          <button className="btn" disabled={list.length < 2} onClick={others}>Đăng xuất tất cả thiết bị khác</button>
          <button className="btn danger" onClick={() => confirm('Đăng xuất khỏi mọi thiết bị, kể cả máy này?') && auth.logoutAll()}>Đăng xuất mọi thiết bị</button>
        </div>
        <div className="muted small">Thiết bị bị đăng xuất mất quyền truy cập ngay ở yêu cầu kế tiếp; màn hình của thiết bị đó tự chuyển về trang đăng nhập trong vòng 30 giây.</div>
      </Card>

      <Card icon={ShieldCheck} title="Xác thực 2 lớp (2FA)" desc="Mã 6 số từ ứng dụng Google Authenticator khi đăng nhập. Sẽ bắt buộc với Admin.">
        <div className="row"><Status>Chưa bật</Status><button className="btn sm" disabled title="Có ở Bước 16">Bật 2FA (sắp có)</button></div>
      </Card>

      <DataTable
        title="Lịch sử đăng nhập"
        rows={history.data ?? []}
        pageSizes={[10, 20, 50]}
        exportName="lich-su-dang-nhap"
        columns={[
          { key: 'createdAt', label: 'Thời gian', render: (r) => fmtDate(new Date(r.createdAt).getTime()), csv: (r) => fmtDate(new Date(r.createdAt).getTime()) },
          { key: 'ok', label: 'Kết quả', render: (r) => (r.ok ? <Status tone="green">Thành công</Status> : <Status tone="red">Thất bại</Status>), csv: (r) => (r.ok ? 'Thành công' : 'Thất bại') },
          { key: 'ip', label: 'IP' },
          { key: 'userAgent', label: 'Thiết bị' },
        ]}
      />

      <Card icon={Trash2} title="Xóa tài khoản" desc={`Xóa tài khoản và dữ liệu cá nhân của bạn. Có ${DELETE_AFTER_DAYS} ngày để đổi ý (đăng nhập lại để hủy). Chủ shop có nhân viên cần chuyển quyền trước.`} danger>
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
