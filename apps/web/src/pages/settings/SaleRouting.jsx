// Cài đặt → Sale (AUTH-15, AUTH-16): what Sales may see, how new conversations are handed out, and each Sale's
// shifts and "receives leads" switch. Admin sets the rules; Admin and Manager set shifts.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Modal, Switch, useToast } from '../../components/ui.jsx';

const SCOPES = [['ALL', 'Tất cả'], ['OWN', 'Chỉ khách, đơn, hội thoại của mình'], ['OWN_UNASSIGNED', 'Của mình + chưa có người phụ trách']];
const MODES = [
  ['MANUAL', 'Tắt chế độ xoay vòng (Quản lý phân bằng tay)'],
  ['FIRST_VIEW', 'Phân cho Sale bấm xem đầu tiên'],
  ['ROUND_ROBIN_ONLINE', 'Chia đều cho Sale đang online trên Livechat'],
  ['ROUND_ROBIN_ALL', 'Chia đều cho tất cả Sale (kể cả offline)'],
];
export const DAYS = [[1, 'Thứ 2'], [2, 'Thứ 3'], [3, 'Thứ 4'], [4, 'Thứ 5'], [5, 'Thứ 6'], [6, 'Thứ 7'], [0, 'Chủ nhật']];

function Radio({ name, value, options, onChange, disabled }) {
  return <div className="radio-list">{options.map(([k, l]) => <label key={k}><input type="radio" name={name} checked={value === k} disabled={disabled} onChange={() => onChange(k)} /> {l}</label>)}</div>;
}

export default function SaleRouting() {
  const { shop, can } = useAuth();
  const qc = useQueryClient();
  const [toast, toastNode] = useToast();
  const rules = useQuery({ queryKey: ['shop', shop.id], queryFn: () => api(`/shops/${shop.id}`) });
  const members = useQuery({ queryKey: ['members', shop.id], queryFn: () => api(`/shops/${shop.id}/members`), refetchInterval: 30_000 });
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  useEffect(() => { if (rules.data) setForm({ saleDataScope: rules.data.saleDataScope, assignMode: rules.data.assignMode }); }, [rules.data]);
  const editable = can('shop.manage');
  const saveRules = useMutation({
    mutationFn: () => api(`/shops/${shop.id}`, { method: 'PATCH', body: form }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shop', shop.id] }); toast('Đã lưu cách chia hội thoại'); },
    onError: (err) => toast(err.message),
  });
  const leads = useMutation({
    mutationFn: ({ id, on }) => api(`/shops/${shop.id}/members/${id}/shifts`, { method: 'PUT', body: { receivesLeads: on } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', shop.id] }),
    onError: (err) => toast(err.message),
  });
  if (rules.isError || members.isError) return <div className="card card-pad field-error">{(rules.error ?? members.error).message}</div>;
  if (!form || !members.data) return <div className="card card-pad muted">Đang tải…</div>;
  const sales = members.data.filter((m) => m.role === 'SALE' && m.status === 'ACTIVE');

  return (
    <>
      <div className="card card-pad settings-section">
        <div><h3>Phân quyền Sale</h3><div className="muted small">Sale xem được dữ liệu nào và hội thoại mới được chia cho ai.</div></div>
        <div className="row wrap" style={{ alignItems: 'flex-start', gap: 16 }}>
          <b className="small" style={{ width: 200 }}>Sale xem được</b>
          <Radio name="scope" value={form.saleDataScope} options={SCOPES} disabled={!editable} onChange={(x) => setForm({ ...form, saleDataScope: x })} />
        </div>
        <div className="row wrap" style={{ alignItems: 'flex-start', gap: 16 }}>
          <b className="small" style={{ width: 200 }}>Chia hội thoại mới</b>
          <Radio name="mode" value={form.assignMode} options={MODES} disabled={!editable} onChange={(x) => setForm({ ...form, assignMode: x })} />
        </div>
        {form.assignMode === 'FIRST_VIEW' && form.saleDataScope === 'OWN' && <div className="field-error small">Sale chỉ xem "của mình" thì không thấy hội thoại chưa chia để bấm nhận. Hãy chọn "Của mình + chưa có người phụ trách".</div>}
        <div className="muted small">Khách cũ quay lại được chia cho Sale đang phụ trách họ, nếu Sale đó đang nhận lead và trong ca. Sale tắt "Nhận lead", ngoài ca hoặc bị khóa không được chia.</div>
        {editable ? <div><button className="btn primary" disabled={saveRules.isPending} onClick={() => saveRules.mutate()}>Lưu</button></div> : <div className="muted small">Chỉ Admin đổi được quy tắc này. Quản lý chỉnh được ca và nhận lead bên dưới.</div>}
      </div>

      <div className="card card-pad settings-section" style={{ marginTop: 16 }}>
        <div><h3>Ca làm việc & nhận lead</h3><div className="muted small">Giờ theo múi giờ của cửa hàng. Sale chưa đặt ca được coi là luôn trong ca.</div></div>
        {!sales.length && <div className="empty">Chưa có Sale nào. Mời nhân viên ở mục Nhân viên.</div>}
        {sales.map((m) => (
          <div key={m.id} className="row" data-testid="sale-row" style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
            <span title={m.isOnline ? 'Đang online trên Livechat' : 'Offline'} style={{ width: 9, height: 9, borderRadius: 9, background: m.isOnline ? 'var(--green, #16a34a)' : '#cbd5e1' }} />
            <div className="grow">
              <b>{m.fullName}</b>
              <div className="muted small">{m.isOnline ? 'Online' : 'Offline'} · {m.shiftCount ? `${m.shiftCount} ca/tuần · ${m.onShift ? 'đang trong ca' : 'ngoài ca'}` : 'chưa đặt ca'}</div>
            </div>
            <label className="row small" style={{ gap: 6 }}>Nhận lead <Switch on={m.receivesLeads} onChange={(on) => leads.mutate({ id: m.id, on })} /></label>
            <button className="btn sm" onClick={() => setEditing(m)}><CalendarClock size={13} /> Ca làm việc</button>
          </div>
        ))}
      </div>
      {editing && <ShiftEditor member={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['members', shop.id] }); toast('Đã lưu ca làm việc'); }} />}
      {toastNode}
    </>
  );
}

function ShiftEditor({ member, onClose, onSaved }) {
  const { shop } = useAuth();
  const path = `/shops/${shop.id}/members/${member.id}/shifts`;
  const current = useQuery({ queryKey: ['shifts', shop.id, member.id], queryFn: () => api(path) });
  const [shifts, setShifts] = useState(null);
  useEffect(() => { if (current.data) setShifts(current.data.shifts); }, [current.data]);
  const save = useMutation({ mutationFn: () => api(path, { method: 'PUT', body: { shifts } }), onSuccess: onSaved });
  const set = (i, k, v) => setShifts(shifts.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const weekdays = () => setShifts([1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startTime: '08:00', endTime: '17:30' })));
  return (
    <Modal title={`Ca làm việc – ${member.fullName}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={!shifts || save.isPending} onClick={() => save.mutate()}>Lưu</button></>}>
      {!shifts ? <div className="muted">Đang tải…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DAYS.map(([day, label]) => {
            const rows = shifts.map((s, i) => [s, i]).filter(([s]) => s.dayOfWeek === day);
            return (
              <div key={day} className="row" style={{ alignItems: 'flex-start' }} data-testid={`shift-day-${day}`}>
                <b className="small" style={{ width: 80, paddingTop: 8 }}>{label}</b>
                <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {rows.map(([s, i]) => (
                    <div key={i} className="row">
                      <input className="input" type="time" aria-label={`${label} từ`} value={s.startTime} onChange={(e) => set(i, 'startTime', e.target.value)} />
                      <span>–</span>
                      <input className="input" type="time" aria-label={`${label} đến`} value={s.endTime === '24:00' ? '23:59' : s.endTime} onChange={(e) => set(i, 'endTime', e.target.value === '23:59' ? '24:00' : e.target.value)} />
                      <button className="icon-btn" aria-label="Xóa ca" onClick={() => setShifts(shifts.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {!rows.length && <span className="muted small" style={{ paddingTop: 8 }}>Nghỉ</span>}
                </div>
                <button className="btn sm" aria-label={`Thêm ca ${label}`} onClick={() => setShifts([...shifts, { dayOfWeek: day, startTime: '08:00', endTime: '17:30' }])}><Plus size={13} /></button>
              </div>
            );
          })}
          <div className="row">
            <button className="btn sm" onClick={weekdays}>Thứ 2–6, 8:00–17:30</button>
            <button className="btn sm" onClick={() => setShifts([])}>Xóa hết (luôn trong ca)</button>
          </div>
          {save.isError && <div className="field-error">{save.error.message}</div>}
        </div>
      )}
    </Modal>
  );
}
