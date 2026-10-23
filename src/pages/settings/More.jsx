// Shop settings sections: sale permissions, reply templates, plan, schedule, payment, triggers,
// history, ref & src, shipping fees, inventory and loyalty points.
import { useState } from 'react';
import { Plus, Trash2, CheckCircle2, Link2, Copy } from 'lucide-react';
import { useStore, uid, money, AD_PLATFORMS, PLATFORMS } from '../../store.jsx';
import { DataTable, FormModal, Status, fmtDate } from '../../components/kit.jsx';
import { Switch, PlatformIcon, useToast } from '../../components/ui.jsx';

function Section({ title, desc, children, onSave }) {
  const [toast, toastNode] = useToast();
  return (
    <div className="card card-pad settings-section">
      <div><h3>{title}</h3>{desc && <div className="muted small" style={{ marginTop: 4 }}>{desc}</div>}</div>
      {children}
      {onSave && <div><button className="btn primary" onClick={() => { onSave(); toast('Đã lưu thiết lập'); }}>Lưu</button></div>}
      {toastNode}
    </div>
  );
}

function useDraft(path) {
  const { state, update } = useStore();
  const [v, setV] = useState(() => structuredClone(state.settings[path]));
  const save = () => update((d) => { d.settings[path] = v; d.systemLogs.push({ id: uid(), staffId: 's1', action: `Cập nhật cài đặt: ${path}`, at: Date.now() }); });
  return [v, setV, save];
}

function Radio({ value, options, onChange }) {
  return <div className="radio-list">{options.map(([k, l]) => <label key={k}><input type="radio" checked={value === k} onChange={() => onChange(k)} /> {l}</label>)}</div>;
}

export function SaleSettings() {
  const { state } = useStore();
  const [v, setV, save] = useDraft('sale');
  const scope = (key, label, noun) => (
    <div className="row wrap" style={{ alignItems: 'flex-start', gap: 16 }}>
      <b className="small" style={{ width: 200 }}>{label}</b>
      <Radio value={v[key]} onChange={(x) => setV({ ...v, [key]: x })} options={[['all', 'Tất cả'], ['mine', `${noun} của mình`], ['mine_unassigned', `${noun} của mình + chưa có người phụ trách`]]} />
    </div>
  );
  return (
    <Section title="Phân quyền sale" desc="Quy định phạm vi truy cập dữ liệu và cách chia hội thoại cho bộ phận Sale." onSave={save}>
      {scope('orders', 'Sale xem được đơn hàng', 'Đơn')}
      {scope('customers', 'Sale xem được khách hàng', 'Khách')}
      {scope('conversations', 'Sale xem được hội thoại', 'Hội thoại')}
      <div className="row wrap" style={{ alignItems: 'flex-start', gap: 16 }}>
        <b className="small" style={{ width: 200 }}>Chia hội thoại cho nhân viên</b>
        <Radio value={v.assignMode} onChange={(x) => setV({ ...v, assignMode: x })} options={[['manual', 'Tắt chế độ xoay vòng (phân bằng tay)'], ['first_view', 'Phân cho người bấm xem đầu tiên'], ['rr_online', 'Chia đều cho nhân viên đang online trên Livechat'], ['rr_all', 'Chia đều cho tất cả sale (kể cả offline)']]} />
      </div>
      <div>
        <b className="small">Nhân viên nhận lead</b>
        {state.staff.filter((s) => s.role === 'Sale').map((s) => (
          <div key={s.id} className="row" style={{ padding: '6px 0' }}>
            <span className="grow">{s.name}</span>
            <Switch on={v.receiving[s.id] !== false} onChange={(on) => setV({ ...v, receiving: { ...v.receiving, [s.id]: on } })} />
          </div>
        ))}
      </div>
    </Section>
  );
}

export function ReplyTemplates() {
  const { state, update } = useStore();
  const [edit, setEdit] = useState(null);
  const staff = (id) => state.staff.find((s) => s.id === id)?.name || 'Quản trị viên';
  return (
    <>
      <div style={{ marginBottom: 12 }}><h2>Tin nhắn mẫu</h2><div className="muted small">Tin nhắn trả lời nhanh trong Livechat: gõ từ khóa (VD: /ship) để chèn. Có thể kèm ảnh/video.</div></div>
      <DataTable
        rows={state.savedReplies}
        search={(r) => `${r.shortcut} ${r.text} ${r.name || ''}`}
        exportName="tin-nhan-mau"
        onRowClick={setEdit}
        actions={<button className="btn primary" onClick={() => setEdit({})}><Plus size={15} /> Thêm mới</button>}
        columns={[
          { key: 'shortcut', label: 'Từ khóa', render: (r) => <code>{r.shortcut}</code> },
          { key: 'name', label: 'Tên hiển thị', render: (r) => r.name || r.shortcut.replace('/', '') },
          { key: 'image', label: 'Ảnh', render: (r) => (r.image ? <img src={r.image} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} /> : '—'), csv: (r) => r.image || '' },
          { key: 'text', label: 'Nội dung', render: (r) => <span className="small">{r.text}</span> },
          { key: 'by', label: 'Người tạo', render: (r) => staff(r.createdBy), csv: (r) => staff(r.createdBy) },
          { key: 'apply', label: 'Áp dụng', render: (r) => (r.channels?.length ? r.channels.map((id) => state.channels.find((c) => c.id === id)?.name).join(', ') : 'Tất cả kênh'), csv: (r) => (r.channels || []).join(' ') },
          { key: '_d', label: '', render: (r) => <button className="icon-btn" onClick={(e) => { e.stopPropagation(); update((d) => { d.savedReplies = d.savedReplies.filter((x) => x.id !== r.id); }); }}><Trash2 size={14} color="var(--red)" /></button> },
        ]}
      />
      {edit && (
        <FormModal
          title={edit.id ? 'Sửa tin nhắn mẫu' : 'Thêm tin nhắn mẫu'}
          initial={{ ...edit, channel: edit.channels?.[0] || '' }}
          onClose={() => setEdit(null)}
          fields={[
            { key: 'shortcut', label: 'Từ khóa (bắt đầu bằng /)', required: true }, { key: 'name', label: 'Tên hiển thị' },
            { key: 'image', label: 'Link ảnh/video (tùy chọn)', full: true }, { key: 'text', label: 'Nội dung', type: 'textarea', required: true },
            { key: 'channel', label: 'Áp dụng cho kênh', type: 'select', options: [['', 'Tất cả kênh'], ...state.channels.map((c) => [c.id, c.name])] },
          ]}
          onSave={(v) => {
            const rec = { shortcut: v.shortcut.startsWith('/') ? v.shortcut : `/${v.shortcut}`, name: v.name, image: v.image, text: v.text, channels: v.channel ? [v.channel] : [] };
            update((d) => { if (edit.id) Object.assign(d.savedReplies.find((x) => x.id === edit.id), rec); else d.savedReplies.push({ id: uid(), createdBy: 's1', ...rec }); });
            setEdit(null);
          }}
        />
      )}
    </>
  );
}

export function PlanSettings() {
  const { state } = useStore();
  const p = state.settings.plan;
  const usage = { 'Page / kênh': state.channels.length, 'Khách hàng': state.customers.length, 'Nhân viên': state.staff.length, 'Dung lượng (GB)': 0.4, 'Credits AI / tháng': state.conversations.flatMap((v) => v.messages).filter((m) => m.from === 'ai' && m.meta?.engine !== 'local').length * 6, 'Tin nhắn hàng loạt / tháng': (state.broadcasts || []).reduce((s, b) => s + b.stats.sent, 0) };
  return (
    <Section title="Gói dịch vụ đang dùng">
      <div className="row wrap" style={{ gap: 16 }}>
        <span className="badge blue" style={{ fontSize: 14, padding: '6px 14px' }}>{p.name}</span>
        <span className="small">Thời hạn: <b>{p.expires ? fmtDate(p.expires) : 'Không giới hạn'}</b></span>
        <Status tone="green">Hoạt động</Status>
        <div className="grow" /><button className="btn primary">Nâng cấp</button>
      </div>
      <table className="table">
        <thead><tr><th>STT</th><th>Dịch vụ</th><th>Hạn mức</th><th>Đã dùng</th><th>Còn lại</th><th /></tr></thead>
        <tbody>{p.quotas.map(([name, q], i) => { const u = usage[name] || 0; return <tr key={name}><td>{i + 1}</td><td>{name}</td><td>{q.toLocaleString('vi-VN')}</td><td>{u.toLocaleString('vi-VN')}<div className="progress" style={{ marginTop: 4 }}><i style={{ width: `${Math.min(100, (u / q) * 100)}%`, background: u / q > 0.8 ? 'var(--red)' : 'var(--primary)' }} /></div></td><td>{(q - u).toLocaleString('vi-VN')}</td><td><button className="btn sm">Mua thêm</button></td></tr>; })}</tbody>
      </table>
      <div className="muted small">Thanh toán gói và mua thêm hạn mức sẽ hoạt động khi có backend (cổng thanh toán).</div>
    </Section>
  );
}

const WEEK = [[1, 'T2'], [2, 'T3'], [3, 'T4'], [4, 'T5'], [5, 'T6'], [6, 'T7'], [0, 'CN']];
export function ScheduleSettings() {
  const [v, setV, save] = useDraft('schedule');
  return (
    <Section title="Cấu hình lịch làm việc" desc="Khách chỉ đặt được lịch hẹn trong ngày và giờ làm việc dưới đây; AI cũng dùng giờ này để báo khách khi ngoài giờ." onSave={save}>
      <div className="field">Ngày làm việc trong tuần
        <div className="channel-pick">{WEEK.map(([d, l]) => <label key={d} className={v.days.includes(d) ? 'on' : ''}><input type="checkbox" hidden checked={v.days.includes(d)} onChange={() => setV({ ...v, days: v.days.includes(d) ? v.days.filter((x) => x !== d) : [...v.days, d] })} />{l}</label>)}</div>
      </div>
      <div className="row"><label className="field">Từ<input className="input" type="time" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} /></label><label className="field">Đến<input className="input" type="time" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} /></label></div>
    </Section>
  );
}

export function PaymentSettings() {
  const [v, setV, save] = useDraft('payment');
  const m = (k, label) => <label className="row small"><Switch on={v.methods[k]} onChange={(on) => setV({ ...v, methods: { ...v.methods, [k]: on } })} /> {label}</label>;
  return (
    <Section title="Cổng thanh toán" desc="Thiết lập phương thức thanh toán dùng khi tạo đơn, gửi link thanh toán cho khách và đối soát tự động." onSave={save}>
      <div className="card-pad" style={{ background: '#f8fafc', borderRadius: 8 }}>
        <b>1. Thanh toán online</b>
        <div className="row" style={{ marginTop: 8 }}>{v.checkoutConnected ? <Status tone="green"><CheckCircle2 size={11} /> Đã kết nối</Status> : <Status>Chưa kết nối</Status>}<button className="btn sm" onClick={() => setV({ ...v, checkoutConnected: !v.checkoutConnected })}>{v.checkoutConnected ? 'Ngắt kết nối' : 'Kết nối cổng thanh toán'}</button></div>
      </div>
      <div className="card-pad" style={{ background: '#f8fafc', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b>2. Phương thức</b>{m('cod', 'Thanh toán khi nhận hàng (COD)')}{m('bank', 'Chuyển khoản ngân hàng')}{m('vietqr', 'Mã VietQR động theo từng đơn')}{m('card', 'Thẻ quốc tế / ví điện tử')}
        <label className="row small"><Switch on={v.smsBanking} onChange={(on) => setV({ ...v, smsBanking: on })} /> SMS Banking: tự xác nhận "Đã thanh toán" khi tiền về đúng nội dung chuyển khoản</label>
      </div>
      <div className="field">Tài khoản nhận tiền
        {v.bankAccounts.map((b, i) => (
          <div key={i} className="row">
            <input className="input" value={b.bank} onChange={(e) => setV({ ...v, bankAccounts: v.bankAccounts.map((x, j) => (j === i ? { ...x, bank: e.target.value } : x)) })} />
            <input className="input" value={b.number} onChange={(e) => setV({ ...v, bankAccounts: v.bankAccounts.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)) })} />
            <input className="input" value={b.holder} onChange={(e) => setV({ ...v, bankAccounts: v.bankAccounts.map((x, j) => (j === i ? { ...x, holder: e.target.value } : x)) })} />
            <button className="icon-btn" onClick={() => setV({ ...v, bankAccounts: v.bankAccounts.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
          </div>
        ))}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setV({ ...v, bankAccounts: [...v.bankAccounts, { bank: '', number: '', holder: '' }] })}><Plus size={13} /> Thêm tài khoản</button>
      </div>
    </Section>
  );
}

const TRIGGER_EVENTS = {
  order: [['new', 'Mới'], ['contacting', 'Đang liên hệ'], ['confirmed', 'Đã xác nhận'], ['done', 'Thành công'], ['cancelled', 'Đã hủy']],
  payment: [['unpaid', 'Chưa thanh toán'], ['paid', 'Đã thanh toán'], ['refund', 'Hoàn tiền']],
  shipping: [['waiting', 'Chờ giao ship'], ['shipped', 'Đã giao ship'], ['in_transit', 'Đang đi giao'], ['delivered', 'Đã giao khách'], ['returning', 'Đang hoàn hàng'], ['returned', 'Đã hoàn hàng']],
};
const TRIGGER_TYPES = { order: 'Đơn hàng', payment: 'Thanh toán', shipping: 'Vận chuyển' };
const TRIGGER_ACTIONS = { send_message: 'Gửi tin nhắn cho khách', add_tag: 'Gắn nhãn khách', notify: 'Thông báo nhân viên', create_task: 'Tạo việc cho sale' };

export function Triggers() {
  const { state, update } = useStore();
  const [edit, setEdit] = useState(null);
  return (
    <>
      <div style={{ marginBottom: 12 }}><h2>Trigger</h2><div className="muted small">Tự động hành động khi đơn hàng, thanh toán hoặc vận chuyển đổi trạng thái (VD: báo khách mã vận đơn).</div></div>
      <DataTable
        rows={state.triggers}
        tabs={[{ key: 'all', label: 'Tất cả' }, ...Object.entries(TRIGGER_TYPES).map(([k, l]) => ({ key: k, label: l, filter: (r) => r.type === k }))]}
        actions={<button className="btn primary" onClick={() => setEdit({})}><Plus size={15} /> Tạo trigger</button>}
        empty="Không tìm thấy trigger nào"
        columns={[
          { key: 'type', label: 'Loại', render: (r) => TRIGGER_TYPES[r.type] },
          { key: 'event', label: 'Sự kiện', render: (r) => TRIGGER_EVENTS[r.type].find(([k]) => k === r.event)?.[1] || r.event },
          { key: 'action', label: 'Hành động', render: (r) => TRIGGER_ACTIONS[r.action] },
          { key: 'content', label: 'Nội dung', render: (r) => <span className="small">{r.message || r.tag || '—'}</span> },
          { key: 'active', label: 'Bật', render: (r) => <Switch on={r.active} onChange={(v) => update((d) => { d.triggers.find((x) => x.id === r.id).active = v; })} /> },
          { key: '_d', label: '', render: (r) => <button className="icon-btn" onClick={() => update((d) => { d.triggers = d.triggers.filter((x) => x.id !== r.id); })}><Trash2 size={14} color="var(--red)" /></button> },
        ]}
      />
      {edit && (
        <FormModal
          title="Tạo trigger"
          onClose={() => setEdit(null)}
          fields={[
            { key: 'event', label: 'Khi (loại – sự kiện)', type: 'select', full: true, options: Object.entries(TRIGGER_EVENTS).flatMap(([t, evs]) => evs.map(([k, l]) => [`${t}:${k}`, `${TRIGGER_TYPES[t]} – ${l}`])) },
            { key: 'action', label: 'Hành động', type: 'select', options: Object.entries(TRIGGER_ACTIONS) },
            { key: 'message', label: 'Nội dung tin nhắn / tên nhãn (biến: {{ten}}, {{ma_don}}, {{ma_van_don}})', type: 'textarea' },
          ]}
          onSave={(v) => {
            const [t, ev] = v.event.split(':');
            update((d) => { d.triggers.push({ id: uid(), type: t, event: ev, action: v.action, message: v.action === 'add_tag' ? '' : v.message, tag: v.action === 'add_tag' ? v.message : '', active: true }); });
            setEdit(null);
          }}
        />
      )}
    </>
  );
}

export function SystemHistory() {
  const { state } = useStore();
  const rows = [...state.systemLogs, ...state.activities.filter((a) => a.type === 'assign').slice(-60).map((a) => ({ id: a.id, staffId: a.staffId, action: `Phân sale: ${a.text} (khách ${state.customers.find((c) => c.id === a.customerId)?.name || ''})`, at: a.at }))].sort((a, b) => b.at - a.at);
  return (
    <>
      <div style={{ marginBottom: 12 }}><h2>Lịch sử hệ thống</h2><div className="muted small">Lịch sử kết nối / ngắt kết nối kênh, phân sale, thay đổi cài đặt.</div></div>
      <DataTable rows={rows} search={(r) => r.action} exportName="lich-su" pageSizes={[10, 20, 50]} columns={[
        { key: 'user', label: 'User', render: (r) => state.staff.find((s) => s.id === r.staffId)?.name || 'Hệ thống' },
        { key: 'action', label: 'Hành động' },
        { key: 'at', label: 'Thời gian', render: (r) => fmtDate(r.at), csv: (r) => fmtDate(r.at) },
      ]} />
    </>
  );
}

export function RefSrc() {
  const { state } = useStore();
  const [toast, toastNode] = useToast();
  const [tab, setTab] = useState('pages');
  const copy = (t) => { navigator.clipboard?.writeText(t); toast('Đã sao chép'); };
  return (
    <>
      <div style={{ marginBottom: 12 }}><h2>Ref & Src</h2><div className="muted small">Tự động gắn ref (người/chiến dịch giới thiệu) và src (nguồn) vào khách hàng và đơn hàng từ ads_id hoặc page_id, đồng bộ sang CRM và báo cáo.</div></div>
      <div className="pill-tabs" style={{ marginBottom: 12 }}><button className={tab === 'pages' ? 'active' : ''} onClick={() => setTab('pages')}>Pages</button><button className={tab === 'ads' ? 'active' : ''} onClick={() => setTab('ads')}>Quảng cáo</button></div>
      {tab === 'pages' ? (
        <DataTable rows={state.channels.map((c, i) => ({ ...c, stt: i + 1 }))} columns={[
          { key: 'stt', label: 'TT' },
          { key: 'name', label: 'Tên page', render: (r) => <span className="row" style={{ gap: 4 }}><PlatformIcon platform={r.platform} /> {r.name}</span> },
          { key: 'ads', label: 'Ads', render: (r) => state.campaigns.filter((c) => c.channelId === r.id).length },
          { key: 'ref', label: 'Ref', render: () => 'organic' },
          { key: 'src', label: 'Src', render: (r) => PLATFORMS[r.platform].label.toLowerCase() },
          { key: 'up', label: 'Cập nhật cuối', render: (r) => fmtDate(r.connectedAt) },
        ]} />
      ) : (
        <DataTable rows={state.campaigns} columns={[
          { key: 'name', label: 'Chiến dịch', render: (r) => <b>{r.name}</b> },
          { key: 'ref', label: 'Ref', render: (r) => <code>{r.id}</code> },
          { key: 'src', label: 'Src', render: (r) => AD_PLATFORMS[r.platform].label },
          { key: 'link', label: 'Link gắn mã', render: (r) => { const ch = state.channels.find((c) => c.id === r.channelId); const link = ch?.platform === 'website' ? `https://goviet.vn/?utm_source=${r.platform}&utm_campaign=${r.id}` : `https://m.me/<page>?ref=${r.id}`; return <span className="row small" style={{ gap: 4 }}><code style={{ fontSize: 11 }}>{link}</code><button className="icon-btn" onClick={() => copy(link)}><Copy size={13} /></button></span>; } },
        ]} />
      )}
      <div className="muted small" style={{ marginTop: 8 }}><Link2 size={12} /> Báo cáo "Hiệu quả theo Ref" nằm ở Báo cáo → Khách hàng.</div>
      {toastNode}
    </>
  );
}

export function ShippingSettings() {
  const [v, setV, save] = useDraft('shipping');
  const r = v.rules;
  const setR = (k, val) => setV({ ...v, rules: { ...r, [k]: val } });
  const num = (k, label) => <label className="field">{label}<input className="input" type="number" step="10000" value={r[k]} onChange={(e) => setR(k, Number(e.target.value))} /></label>;
  return (
    <Section title="Vận chuyển" desc="Phí ship thu khách được tính theo thứ tự từ trên xuống khi tạo đơn và khi AI báo giá." onSave={save}>
      <div className="row wrap" style={{ alignItems: 'flex-start', gap: 16 }}>
        <b className="small" style={{ width: 160 }}>Loại địa chỉ</b>
        <Radio value={v.addressType} onChange={(x) => setV({ ...v, addressType: x })} options={[['new', 'Địa chỉ mới – Tỉnh/thành, Phường/xã (sau sáp nhập hành chính)'], ['old', 'Địa chỉ cũ – Tỉnh/thành, Quận/huyện, Phường/xã']]} />
      </div>
      <label className="row small"><Switch on={r.alwaysFree} onChange={(x) => setR('alwaysFree', x)} /> Luôn miễn phí ship</label>
      {!r.alwaysFree && <div className="form-grid">{num('freeOver', 'Miễn phí đơn hàng trên (đ)')}{num('hnHcm', 'Đồng giá ship HN & HCM (đ)')}{num('province', 'Đồng giá ship các tỉnh (đ)')}{num('min', 'Phí ship tối thiểu (đ)')}</div>}
      <div className="field">Đơn vị vận chuyển sử dụng
        <div className="row wrap">{[['ghn', 'GHN'], ['ghtk', 'GHTK'], ['viettel', 'Viettel Post'], ['self', 'Tự giao']].map(([k, l]) => <label key={k} className="row small"><Switch on={v.carriers[k]} onChange={(x) => setV({ ...v, carriers: { ...v.carriers, [k]: x } })} /> {l}</label>)}</div>
      </div>
      <div className="muted small">Ví dụ đơn 3.000.000đ giao tỉnh: phí thu khách = {r.alwaysFree ? 0 : money(Math.max(r.min, 3000000 >= r.freeOver ? 0 : r.province))}.</div>
    </Section>
  );
}

export function InventorySettings() {
  const [v, setV, save] = useDraft('inventory');
  return (
    <Section title="Cài đặt xuất kho" desc="Tự động trừ tồn kho khi tạo đơn hàng mới (kể cả đơn do AI chốt), từ kho mặc định." onSave={save}>
      <label className="row small"><Switch on={v.autoExport} onChange={(x) => setV({ ...v, autoExport: x })} /> Tự động xuất kho khi tạo đơn</label>
      <label className="row small"><Switch on={v.allowNegative} onChange={(x) => setV({ ...v, allowNegative: x })} /> Cho phép bán khi tồn kho âm</label>
      <label className="field" style={{ maxWidth: 260 }}>Cảnh báo sắp hết hàng khi tồn ≤<input className="input" type="number" value={v.lowStock} onChange={(e) => setV({ ...v, lowStock: Number(e.target.value) })} /></label>
    </Section>
  );
}

export function PointsSettings() {
  const { state } = useStore();
  const [v, setV, save] = useDraft('points');
  const rows = (state.pointsLedger || []).map((p) => ({ ...p, id: p.customerId, customer: state.customers.find((c) => c.id === p.customerId) })).filter((r) => r.customer).sort((a, b) => b.points - a.points);
  return (
    <>
      <Section title="Tích điểm" desc="Tự động tích điểm cho khách khi đơn hàng thành công. Điểm lưu trong hồ sơ khách, dùng được trong tin nhắn qua biến {{diem}}." onSave={save}>
        <label className="row small"><Switch on={v.enabled} onChange={(x) => setV({ ...v, enabled: x })} /> Bật tích điểm</label>
        <div className="form-grid">
          <label className="field">Số tiền để được 1 điểm (đ)<input className="input" type="number" step="10000" value={v.earnPer} onChange={(e) => setV({ ...v, earnPer: Number(e.target.value) })} /></label>
          <label className="field">Giá trị 1 điểm khi đổi (đ)<input className="input" type="number" step="100" value={v.pointValue} onChange={(e) => setV({ ...v, pointValue: Number(e.target.value) })} /></label>
          <label className="field">Số điểm tối thiểu để đổi<input className="input" type="number" value={v.minRedeem} onChange={(e) => setV({ ...v, minRedeem: Number(e.target.value) })} /></label>
        </div>
        <div className="muted small">VD: đơn 6.500.000đ → {Math.floor(6500000 / (v.earnPer || 1))} điểm ≈ {money(Math.floor(6500000 / (v.earnPer || 1)) * v.pointValue)} giảm giá cho lần mua sau.</div>
      </Section>
      <div style={{ marginTop: 16 }}>
        <DataTable title="Lịch sử tích điểm" rows={rows} search={(r) => r.customer.name} exportName="tich-diem" columns={[
          { key: 'name', label: 'Khách hàng', render: (r) => <b>{r.customer.name}</b>, csv: (r) => r.customer.name },
          { key: 'phone', label: 'SĐT', render: (r) => r.customer.phone, csv: (r) => r.customer.phone },
          { key: 'points', label: 'Điểm', align: 'right' },
          { key: 'value', label: 'Quy đổi', align: 'right', render: (r) => money(r.points * v.pointValue) },
          { key: 'updatedAt', label: 'Cập nhật', render: (r) => fmtDate(r.updatedAt), csv: (r) => fmtDate(r.updatedAt) },
        ]} />
      </div>
    </>
  );
}
