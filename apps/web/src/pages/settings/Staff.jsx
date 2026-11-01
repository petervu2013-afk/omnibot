// Cài đặt → Nhân viên: real members and invitations from the API (AUTH-07). Inviting: Admin, Manager. Changing a
// role, disabling or removing: Admin. The API enforces the same rules.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, Trash2, UserX, UserCheck, X } from 'lucide-react';
import { api } from '../../api.js';
import { ROLE_LABEL } from '../../access.js';
import { useAuth, isEmail } from '../../auth.jsx';
import { Avatar, useToast } from '../../components/ui.jsx';

const INVITE_ROLES = ['MANAGER', 'SALE', 'WAREHOUSE'];
const ALL_ROLES = ['ADMIN', ...INVITE_ROLES];

export default function Staff() {
  const { shop, can, user } = useAuth();
  const qc = useQueryClient();
  const [toast, toastNode] = useToast();
  const [form, setForm] = useState({ email: '', role: 'SALE' });
  const [error, setError] = useState('');
  const base = `/shops/${shop.id}`;
  const members = useQuery({ queryKey: ['members', shop.id], queryFn: () => api(`${base}/members`) });
  const invites = useQuery({ queryKey: ['invitations', shop.id], queryFn: () => api(`${base}/invitations`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['members', shop.id] }); qc.invalidateQueries({ queryKey: ['invitations', shop.id] }); };
  const fail = (err) => toast(err.message);

  const invite = useMutation({
    mutationFn: (body) => api(`${base}/invitations`, { method: 'POST', body }),
    onSuccess: (_, body) => { setForm({ email: '', role: 'SALE' }); toast(`Đã gửi lời mời tới ${body.email}`); refresh(); },
    onError: (err) => setError(err.message),
  });
  const cancel = useMutation({ mutationFn: (id) => api(`${base}/invitations/${id}`, { method: 'DELETE' }), onSuccess: refresh, onError: fail });
  const change = useMutation({ mutationFn: ({ id, ...body }) => api(`${base}/members/${id}`, { method: 'PATCH', body }), onSuccess: refresh, onError: (err) => { fail(err); refresh(); } });
  const remove = useMutation({ mutationFn: (id) => api(`${base}/members/${id}`, { method: 'DELETE' }), onSuccess: refresh, onError: fail });

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!isEmail(form.email)) return setError('Email không hợp lệ.');
    invite.mutate(form);
  };
  const manage = can('staff.manage');

  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3>Nhân viên {members.data ? `(${members.data.length})` : ''}</h3>
      {members.isPending && <div className="muted">Đang tải…</div>}
      {members.isError && <div className="field-error">{members.error.message}</div>}
      {members.data?.map((m) => {
        const locked = m.isOwner || m.userId === user.id;
        return (
          <div key={m.id} className="row wrap" data-testid="member-row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
            <Avatar name={m.fullName} size="sm" />
            <div className="grow"><b>{m.fullName}</b>{m.isOwner && <span className="badge blue" style={{ marginLeft: 6 }}>Chủ shop</span>}<div className="muted small">{m.email}</div></div>
            {m.status === 'DISABLED' && <span className="badge orange">Đã khóa</span>}
            {manage && !locked ? (
              <>
                <select className="select" style={{ width: 120 }} aria-label={`Vai trò của ${m.fullName}`} value={m.role} onChange={(e) => change.mutate({ id: m.id, role: e.target.value })}>
                  {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
                <button className="icon-btn" title={m.status === 'DISABLED' ? 'Mở khóa' : 'Tạm khóa'} onClick={() => change.mutate({ id: m.id, status: m.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED' })}>
                  {m.status === 'DISABLED' ? <UserCheck size={15} /> : <UserX size={15} color="var(--muted)" />}
                </button>
                <button className="icon-btn" title="Xóa nhân viên" onClick={() => confirm(`Xóa ${m.fullName} khỏi cửa hàng? Khách của người này sẽ về trạng thái chưa phân.`) && remove.mutate(m.id)}><Trash2 size={15} color="var(--muted)" /></button>
              </>
            ) : <span className="badge blue">{ROLE_LABEL[m.role]}</span>}
          </div>
        );
      })}

      {invites.data?.length > 0 && <b className="small">Lời mời đang chờ</b>}
      {invites.data?.map((i) => (
        <div key={i.id} className="row" data-testid="invite-row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
          <div className="grow"><span>{i.email}</span><div className="muted small">{ROLE_LABEL[i.role]} · hết hạn {new Date(i.expiresAt).toLocaleDateString('vi-VN')}</div></div>
          {can('staff.invite') && <button className="icon-btn" title="Hủy lời mời" onClick={() => cancel.mutate(i.id)}><X size={15} color="var(--muted)" /></button>}
        </div>
      ))}

      {can('staff.invite') && (
        <form onSubmit={submit} className="row wrap">
          <input className="input grow" style={{ width: 220 }} type="email" placeholder="Email nhân viên" aria-label="Email nhân viên" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setError(''); }} />
          <select className="select" style={{ width: 120 }} aria-label="Vai trò mời" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {INVITE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <button className="btn primary" disabled={invite.isPending}><MailPlus size={14} /> Gửi lời mời</button>
        </form>
      )}
      {error && <div className="field-error">{error}</div>}
      {toastNode}
    </div>
  );
}
