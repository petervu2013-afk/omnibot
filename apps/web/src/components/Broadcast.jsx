import { useMemo, useState } from 'react';
import { Plus, Send, AlertTriangle, MessageCircle, Facebook } from 'lucide-react';
import { useStore, uid } from '../store.jsx';
import { STAGES, STAGE, addActivity } from '../crm.js';
import { DataTable, Status, StatCards, fmtDate } from './kit.jsx';
import { Modal, useToast } from './ui.jsx';

const DAY = 86400000;
export const BROADCAST_CHANNELS = {
  messenger: { label: 'Messenger', color: '#1877f2', note: 'Chỉ gửi tin quảng bá cho khách đã nhắn với Page trong 24 giờ. Ngoài 24 giờ phải dùng thẻ tin nhắn (cập nhật đơn hàng, sự kiện...) hoặc tin nhắn tài trợ.' },
  zalo: { label: 'Zalo OA (tin tư vấn)', color: '#0068ff', note: 'Gửi cho người đã quan tâm OA, trong 7 ngày kể từ lần tương tác cuối (theo chính sách Zalo OA).' },
  zns: { label: 'Zalo ZNS (theo SĐT)', color: '#0ea5e9', note: 'Gửi theo số điện thoại bằng mẫu ZNS đã được Zalo duyệt; tính phí theo tin. Không dùng cho nội dung quảng cáo.' },
};
const STATUS = { draft: ['Nháp', ''], scheduled: ['Đã lên lịch', 'orange'], sending: ['Đang gửi', 'blue'], sent: ['Đã gửi', 'green'] };

// Who a broadcast reaches, respecting each channel's messaging window.
export function audienceFor(state, { channel, stages = [], tags = [], campaignId = '', within = true }, now = Date.now()) {
  const platformOf = (convs) => convs.map((v) => state.channels.find((c) => c.id === v.channelId)?.platform);
  return state.customers.filter((c) => {
    if (stages.length && !stages.includes(c.stage)) return false;
    if (tags.length && !tags.some((t) => c.tags.includes(t))) return false;
    if (campaignId && c.campaignId !== campaignId) return false;
    const convs = state.conversations.filter((v) => v.customerId === c.id);
    const lastIn = Math.max(0, ...convs.flatMap((v) => v.messages.filter((m) => m.from === 'customer').map((m) => m.at)));
    if (channel === 'zns') return !!c.phone;
    const plats = platformOf(convs);
    if (channel === 'messenger' && !plats.some((p) => p === 'facebook' || p === 'instagram')) return false;
    if (channel === 'zalo' && !plats.includes('zalo')) return false;
    if (within) return now - lastIn < (channel === 'messenger' ? DAY : 7 * DAY);
    return true;
  });
}

export default function Broadcast() {
  const { state } = useStore();
  const [creating, setCreating] = useState(false);
  const list = state.broadcasts || [];
  const sent = list.filter((b) => b.status === 'sent');
  const tot = (k) => sent.reduce((s, b) => s + b.stats[k], 0);
  return (
    <>
      <StatCards items={[
        { label: 'Chiến dịch đã gửi', value: sent.length },
        { label: 'Tin đã gửi', value: tot('sent').toLocaleString('vi-VN'), sub: `${tot('failed')} lỗi` },
        { label: 'Tỉ lệ đã xem', value: `${Math.round((tot('read') / (tot('sent') || 1)) * 100)}%` },
        { label: 'Tỉ lệ phản hồi', value: `${Math.round((tot('replied') / (tot('sent') || 1)) * 100)}%` },
      ]} />
      <DataTable
        rows={[...list].sort((a, b) => b.scheduledAt - a.scheduledAt)}
        search={(r) => r.name}
        exportName="gui-tin-hang-loat"
        tabs={[{ key: 'all', label: 'Tất cả' }, ...Object.entries(STATUS).map(([k, [l]]) => ({ key: k, label: l, filter: (r) => r.status === k }))]}
        actions={<button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> Tạo chiến dịch gửi tin</button>}
        columns={[
          { key: 'name', label: 'Chiến dịch', render: (r) => <div><b>{r.name}</b><div className="muted small">{r.message.slice(0, 70)}…</div></div>, csv: (r) => r.name },
          { key: 'channel', label: 'Kênh', render: (r) => <span className="badge" style={{ background: BROADCAST_CHANNELS[r.channel].color + '18', color: BROADCAST_CHANNELS[r.channel].color }}>{BROADCAST_CHANNELS[r.channel].label}</span>, csv: (r) => BROADCAST_CHANNELS[r.channel].label },
          { key: 'aud', label: 'Tệp nhận', render: (r) => <span className="small">{r.audience.stages.map((s) => STAGE[s]?.label).join(', ') || 'Tất cả'}</span>, csv: (r) => r.audience.stages.join(' ') },
          { key: 'target', label: 'Số người', align: 'right', render: (r) => r.stats.target },
          { key: 'sent', label: 'Đã gửi', align: 'right', render: (r) => r.stats.sent },
          { key: 'read', label: 'Đã xem', align: 'right', render: (r) => (r.stats.sent ? `${Math.round((r.stats.read / r.stats.sent) * 100)}%` : '—') },
          { key: 'replied', label: 'Phản hồi', align: 'right', render: (r) => r.stats.replied },
          { key: 'status', label: 'Trạng thái', render: (r) => <Status tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Status>, csv: (r) => STATUS[r.status][0] },
          { key: 'at', label: 'Thời gian gửi', render: (r) => fmtDate(r.scheduledAt), csv: (r) => fmtDate(r.scheduledAt) },
        ]}
      />
      {creating && <BroadcastWizard onClose={() => setCreating(false)} />}
    </>
  );
}

function BroadcastWizard({ onClose }) {
  const { state, update } = useStore();
  const [toast, toastNode] = useToast();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: '', channel: 'messenger', stages: ['consulting', 'quoted'], tags: [], campaignId: '', within: true, message: 'Chào {{ten}}, Gỗ Việt đang có ưu đãi giảm 10% cho mẫu anh/chị quan tâm. Nhắn "ƯU ĐÃI" để nhận mã nhé!', when: 'now', at: '' });
  const set = (k, v) => setF({ ...f, [k]: v });
  const audience = useMemo(() => audienceFor(state, f), [state, f]);
  const allTags = [...new Set(state.customers.flatMap((c) => c.tags))];
  const preview = f.message.replace('{{ten}}', audience[0]?.name || 'Anh/chị').replace('{{sdt}}', audience[0]?.phone || '09xx');

  const save = () => {
    const now = Date.now();
    const scheduledAt = f.when === 'now' ? now : new Date(f.at).getTime();
    update((d) => {
      const b = { id: uid(), name: f.name || `Gửi tin ${new Date().toLocaleDateString('vi-VN')}`, channel: f.channel, audience: { stages: f.stages, tags: f.tags, campaignId: f.campaignId, within24h: f.within }, message: f.message, scheduledAt, status: f.when === 'now' ? 'sent' : 'scheduled', stats: { target: audience.length, sent: 0, read: 0, replied: 0, failed: 0 }, createdBy: 's1' };
      if (f.when === 'now') {
        // Demo send: every recipient gets the message in their interaction history.
        const failed = Math.round(audience.length * 0.03);
        b.stats = { target: audience.length, sent: audience.length - failed, read: Math.round((audience.length - failed) * 0.72), replied: Math.round((audience.length - failed) * 0.18), failed };
        audience.slice(failed).forEach((c) => addActivity(d, { customerId: c.id, type: 'message', staffId: 's1', text: `[Gửi hàng loạt – ${BROADCAST_CHANNELS[f.channel].label}] ${f.message.replace('{{ten}}', c.name)}` }));
      }
      d.broadcasts = [...(d.broadcasts || []), b];
    });
    toast(f.when === 'now' ? `Đã gửi tới ${audience.length} khách (demo)` : 'Đã lên lịch gửi');
    setTimeout(onClose, 600);
  };

  const steps = ['Kênh gửi', 'Tệp khách', 'Nội dung', 'Lịch gửi'];
  return (
    <Modal wide title="Tạo chiến dịch gửi tin hàng loạt" onClose={onClose} footer={<>
      {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Quay lại</button>}
      <span className="grow muted small">Sẽ gửi tới <b>{audience.length}</b> khách</span>
      {step < 3 ? <button className="btn primary" onClick={() => setStep(step + 1)} disabled={step === 1 && !audience.length}>Tiếp tục</button>
        : <button className="btn primary" onClick={save} disabled={!audience.length || !f.message.trim() || (f.when === 'later' && !f.at)}><Send size={14} /> {f.when === 'now' ? 'Gửi ngay' : 'Lên lịch'}</button>}
    </>}>
      <div className="wizard-steps">{steps.map((s, i) => <span key={s} className={i <= step ? 'on' : ''}>{i + 1}. {s}</span>)}</div>
      {step === 0 && (
        <>
          <label className="field">Tên chiến dịch<input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="VD: Ưu đãi cuối tuần cho khách đang tư vấn" /></label>
          <div className="radio-list">
            {Object.entries(BROADCAST_CHANNELS).map(([k, c]) => (
              <label key={k} className="card-pad" style={{ border: `2px solid ${f.channel === k ? c.color : 'var(--border)'}`, borderRadius: 10, alignItems: 'flex-start' }}>
                <input type="radio" checked={f.channel === k} onChange={() => set('channel', k)} />
                <div>{k === 'messenger' ? <Facebook size={14} color={c.color} /> : <MessageCircle size={14} color={c.color} />} <b>{c.label}</b><div className="muted small">{c.note}</div></div>
              </label>
            ))}
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <div className="field">Giai đoạn khách hàng
            <div className="channel-pick">{STAGES.map((s) => <label key={s.key} className={f.stages.includes(s.key) ? 'on' : ''}><input type="checkbox" hidden checked={f.stages.includes(s.key)} onChange={() => set('stages', f.stages.includes(s.key) ? f.stages.filter((x) => x !== s.key) : [...f.stages, s.key])} />{s.label}</label>)}</div>
          </div>
          <div className="field">Nhãn khách hàng
            <div className="channel-pick">{allTags.slice(0, 12).map((t) => <label key={t} className={f.tags.includes(t) ? 'on' : ''}><input type="checkbox" hidden checked={f.tags.includes(t)} onChange={() => set('tags', f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t])} />{t}</label>)}</div>
          </div>
          <label className="field">Nguồn quảng cáo<select className="select" value={f.campaignId} onChange={(e) => set('campaignId', e.target.value)}><option value="">Mọi nguồn</option>{state.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          {f.channel !== 'zns' && (
            <label className="row small"><input type="checkbox" checked={f.within} onChange={(e) => set('within', e.target.checked)} /> Chỉ khách trong khung được phép gửi ({f.channel === 'messenger' ? '24 giờ' : '7 ngày'} từ tin nhắn cuối)</label>
          )}
          {!f.within && f.channel !== 'zns' && <div className="ai-banner off"><AlertTriangle size={15} /> Gửi ngoài khung cho phép có thể khiến Page/OA bị hạn chế. Chỉ dùng với thẻ tin nhắn hợp lệ.</div>}
          <div className="muted small">Khớp {audience.length} khách: {audience.slice(0, 6).map((c) => c.name).join(', ')}{audience.length > 6 ? '…' : ''}</div>
        </>
      )}
      {step === 2 && (
        <div className="row wrap" style={{ alignItems: 'flex-start', gap: 16 }}>
          <label className="field grow" style={{ minWidth: 280 }}>Nội dung (biến: {'{{ten}}'}, {'{{sdt}}'})
            <textarea className="textarea" style={{ minHeight: 150 }} value={f.message} onChange={(e) => set('message', e.target.value)} />
            {f.channel === 'zns' && <span className="muted small">ZNS yêu cầu mẫu được Zalo duyệt trước; nội dung ở đây là bản đề xuất mẫu.</span>}
          </label>
          <div className="phone-preview"><div className="muted small" style={{ marginBottom: 6 }}>Xem trước</div><div className="msg in"><div className="bubble">{preview}</div></div></div>
        </div>
      )}
      {step === 3 && (
        <div className="radio-list">
          <label><input type="radio" checked={f.when === 'now'} onChange={() => set('when', 'now')} /> Gửi ngay</label>
          <label><input type="radio" checked={f.when === 'later'} onChange={() => set('when', 'later')} /> Hẹn giờ <input className="input" type="datetime-local" style={{ width: 230 }} value={f.at} onChange={(e) => setF({ ...f, when: 'later', at: e.target.value })} /></label>
          <div className="muted small">Hệ thống gửi giãn cách để tránh bị đánh dấu spam; mỗi tin gửi đi được lưu vào lịch sử tương tác của khách.</div>
        </div>
      )}
      {toastNode}
    </Modal>
  );
}
