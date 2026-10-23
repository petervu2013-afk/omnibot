import { useState } from 'react';
import { Phone, MessageSquare, StickyNote, FileText, Handshake, Heart, CalendarClock, Megaphone, ShoppingCart, Gift } from 'lucide-react';
import { useStore, uid, money, orderTotal, AD_PLATFORMS } from '../store.jsx';
import {
  STAGES, STAGE, NURTURE_REASONS, LOST_REASONS, ACTIVITY_TYPES, CALL_OUTCOMES, timeline, customerValue, openTasks, upsellFor, logInteraction, setStage, addActivity, fmtDur,
} from '../crm.js';
import { Modal, Avatar, productEmoji } from './ui.jsx';
import { navigate } from '../router.js';

const ACTIONS = [
  { type: 'call', label: 'Gọi', icon: Phone },
  { type: 'message', label: 'Nhắn', icon: MessageSquare },
  { type: 'quote', label: 'Báo giá', icon: FileText },
  { type: 'meeting', label: 'Gặp mặt', icon: Handshake },
  { type: 'care', label: 'Chăm sóc', icon: Heart },
  { type: 'note', label: 'Ghi chú', icon: StickyNote },
];

// One place with everything about a customer: owner, stage, value, tasks and the full interaction history.
export default function Customer360({ customerId, onClose }) {
  const { state, update } = useStore();
  const c = state.customers.find((x) => x.id === customerId);
  const [action, setAction] = useState(null);
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState('connected');
  const [minutes, setMinutes] = useState(3);
  const [followUp, setFollowUp] = useState('');
  const [stageForm, setStageForm] = useState(null);
  const me = state.staff.find((s) => s.id === c?.ownerId) || state.staff[0];
  if (!c) return null;

  const { spent, expected } = customerValue(state, c);
  const items = timeline(state, c.id);
  const tasks = openTasks(state, c.id);
  const upsell = upsellFor(state, c);
  const campaign = state.campaigns.find((x) => x.id === c.campaignId);
  const conv = state.conversations.find((v) => v.customerId === c.id);

  const save = () => {
    update((d) => {
      logInteraction(d, { customerId: c.id, type: action, outcome: action === 'call' || action === 'care' ? outcome : null, text, staffId: me.id, duration: action === 'call' ? minutes * 60 : 0 });
      if (followUp) d.tasks.push({ id: uid(), customerId: c.id, staffId: c.ownerId || me.id, type: 'call', kind: 'manual', due: new Date(followUp).getTime(), title: text ? `Hẹn: ${text.slice(0, 60)}` : 'Liên hệ lại theo hẹn', done: false });
    });
    setAction(null); setText(''); setFollowUp('');
  };

  const applyStage = () => {
    update((d) => setStage(d, c.id, stageForm.stage, { staffId: me.id, reason: stageForm.reason, nurtureReason: stageForm.nurtureReason }));
    setStageForm(null);
  };

  return (
    <Modal wide title="Hồ sơ khách hàng 360°" onClose={onClose}>
      <div className="row wrap" style={{ alignItems: 'flex-start', gap: 16 }}>
        <Avatar name={c.name} size="lg" />
        <div className="grow" style={{ minWidth: 220 }}>
          <h2>{c.name}</h2>
          <div className="muted small">{c.phone || 'Chưa có SĐT'} {c.address && `· ${c.address}`}</div>
          <div className="chips" style={{ marginTop: 6 }}>{c.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
          {campaign && <div className="small muted" style={{ marginTop: 6 }}><Megaphone size={12} /> Nguồn: {campaign.name} ({AD_PLATFORMS[campaign.platform].label})</div>}
        </div>
        <div className="crm-facts">
          <div><span className="muted small">Giai đoạn</span>
            <select className="select" value={c.stage} onChange={(e) => setStageForm({ stage: e.target.value, reason: '', nurtureReason: 'budget' })} style={{ borderColor: STAGE[c.stage]?.color }}>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div><span className="muted small">Phụ trách</span>
            <select className="select" value={c.ownerId || ''} onChange={(e) => update((d) => { const x = d.customers.find((y) => y.id === c.id); x.ownerId = e.target.value; addActivity(d, { customerId: c.id, type: 'assign', staffId: e.target.value, text: `Chuyển cho ${d.staff.find((s) => s.id === e.target.value)?.name}` }); d.tasks.forEach((t) => { if (t.customerId === c.id && !t.done && t.kind !== 'care') t.staffId = e.target.value; }); })}>
              <option value="">— Chưa phân —</option>
              {state.staff.filter((s) => s.role === 'Sale').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><span className="muted small">Đã mua</span><b>{money(spent)}</b></div>
          <div><span className="muted small">Giá trị cơ hội</span><b>{money(expected)}</b></div>
        </div>
      </div>

      {stageForm && (
        <div className="ai-banner off" style={{ flexWrap: 'wrap' }}>
          Chuyển sang <b>{STAGE[stageForm.stage].label}</b>
          {stageForm.stage === 'nurturing' && (
            <select className="select" style={{ width: 240 }} value={stageForm.nurtureReason} onChange={(e) => setStageForm({ ...stageForm, nurtureReason: e.target.value })}>
              {Object.entries(NURTURE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          {stageForm.stage === 'lost' && (
            <select className="select" style={{ width: 200 }} value={stageForm.reason} onChange={(e) => setStageForm({ ...stageForm, reason: e.target.value })}>
              <option value="">Lý do thất bại…</option>{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          )}
          <button className="btn primary sm" onClick={applyStage} disabled={stageForm.stage === 'lost' && !stageForm.reason}>Xác nhận</button>
          <button className="btn sm" onClick={() => setStageForm(null)}>Hủy</button>
        </div>
      )}

      <div className="crm-360">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            {ACTIONS.map(({ type, label, icon: Icon }) => (
              <button key={type} className={`btn sm ${action === type ? 'outline-primary' : ''}`} onClick={() => setAction(action === type ? null : type)}><Icon size={13} /> {label}</button>
            ))}
            {conv && <button className="btn sm" onClick={() => navigate('livechat')}><MessageSquare size={13} /> Mở Livechat</button>}
          </div>
          {action && (
            <div className="card-pad" style={{ background: '#f8fafc', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(action === 'call' || action === 'care') && (
                <div className="row wrap">
                  <select className="select" style={{ width: 220 }} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                    {Object.entries(CALL_OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {action === 'call' && <label className="row small">Thời lượng <input className="input" type="number" min="0" style={{ width: 70 }} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /> phút</label>}
                </div>
              )}
              <textarea className="textarea" style={{ minHeight: 60 }} placeholder="Nội dung trao đổi, nhu cầu, phản hồi của khách…" value={text} onChange={(e) => setText(e.target.value)} />
              <label className="row small"><CalendarClock size={14} /> Hẹn liên hệ lại <input className="input" type="datetime-local" style={{ width: 220 }} value={followUp} onChange={(e) => setFollowUp(e.target.value)} /></label>
              <div><button className="btn primary sm" onClick={save}>Lưu tương tác ({me.name})</button></div>
            </div>
          )}

          <div className="timeline">
            {items.length === 0 && <div className="muted small">Chưa có tương tác.</div>}
            {items.slice(0, 80).map((it, i) => <TimelineItem key={i} it={it} state={state} />)}
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <b className="small">Việc cần làm ({tasks.length})</b>
            {tasks.length === 0 && <div className="muted small">Không có việc mở.</div>}
            {tasks.map((t) => (
              <div key={t.id} className={`task-row ${t.due < Date.now() ? 'overdue' : ''}`}>
                <div className="grow"><div className="small"><b>{t.title}</b></div><div className="muted small">{state.staff.find((s) => s.id === t.staffId)?.name} · {t.due < Date.now() ? `quá hạn ${fmtDur(Date.now() - t.due)}` : `hạn ${new Date(t.due).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`}</div></div>
                <button className="btn sm" onClick={() => { setAction(t.type === 'message' ? 'message' : t.kind === 'care' ? 'care' : 'call'); }}>Làm</button>
              </div>
            ))}
          </div>
          {upsell.length > 0 && (
            <div>
              <b className="small"><Gift size={13} /> Gợi ý bán thêm</b>
              {upsell.map(({ p, type }) => (
                <div key={p.id} className="row small" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{productEmoji(p)}</span><span className="grow">{p.name}<div className="muted">{type === 'cross' ? 'Bán chéo – sản phẩm đi kèm' : 'Nâng cấp'} · {money(p.price)}</div></span>
                </div>
              ))}
            </div>
          )}
          {c.stage === 'nurturing' && (
            <div className="ai-banner" style={{ background: '#faf5ff', color: '#6b21a8', flexDirection: 'column', alignItems: 'flex-start' }}>
              <b>Đang nuôi dưỡng: {NURTURE_REASONS[c.nurtureReason]}</b>
              <span className="small">Lần chăm sóc tới: {c.nextNurtureAt ? new Date(c.nextNurtureAt).toLocaleDateString('vi-VN') : '—'}</span>
            </div>
          )}
          {c.stage === 'lost' && c.lostReason && <div className="ai-banner off">Thất bại: {c.lostReason}</div>}
        </aside>
      </div>
    </Modal>
  );
}

function TimelineItem({ it, state }) {
  const time = new Date(it.at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' });
  if (it.kind === 'order') {
    return <div className="tl-item"><span className="tl-icon">🛒</span><div><b>Đơn #{it.order.id}</b> · {money(orderTotal(it.order, state.products))} {it.order.createdBy === 'ai' && <span className="badge blue">AI chốt</span>}<div className="muted small">{time}</div></div></div>;
  }
  if (it.kind === 'message') {
    const who = { customer: 'Khách', ai: 'AI', bot: 'Bot', agent: 'Nhân viên' }[it.from];
    return <div className="tl-item"><span className="tl-icon">{it.from === 'customer' ? '🙋' : it.from === 'agent' ? '💬' : '✨'}</span><div><span className="muted small">{who} · {it.channel}</span><div className="small">{it.text}</div><div className="muted small">{time}</div></div></div>;
  }
  const staff = state.staff.find((s) => s.id === it.staffId)?.name;
  return (
    <div className="tl-item">
      <span className="tl-icon">{ACTIVITY_TYPES[it.type]?.icon || '•'}</span>
      <div>
        <b className="small">{ACTIVITY_TYPES[it.type]?.label}</b>{it.outcome && <span className="small"> – {CALL_OUTCOMES[it.outcome]}</span>}{it.duration ? <span className="muted small"> · {Math.round(it.duration / 60)} phút</span> : null}
        {it.text && <div className="small">{it.text}</div>}
        <div className="muted small">{staff && `${staff} · `}{time}</div>
      </div>
    </div>
  );
}
