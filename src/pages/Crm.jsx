import { useState } from 'react';
import { KanbanSquare, ListChecks, Sprout, Gem, Workflow, Search, Phone, PhoneOff, MessageSquare, Download, Plus, Trash2, Sparkles } from 'lucide-react';
import { useStore, money, compact, uid } from '../store.jsx';
import {
  STAGES, STAGE, NURTURE_REASONS, OPEN_STAGES, customerValue, lastTouchAt, riskList, logInteraction, setStage, ltvStats, upsellFor, fmtDur, addActivity,
} from '../crm.js';
import { e164 } from '../analytics.js';
import { downloadCsv } from '../csv.js';
import { Avatar, productEmoji, useToast } from '../components/ui.jsx';
import Customer360 from '../components/Customer360.jsx';
import { navigate } from '../router.js';

const TABS = [
  { key: 'pipeline', label: 'Pipeline bán hàng', icon: KanbanSquare },
  { key: 'tasks', label: 'Bám đuổi & việc cần làm', icon: ListChecks },
  { key: 'nurture', label: 'Phễu nuôi dưỡng', icon: Sprout },
  { key: 'ltv', label: 'Khách cũ & LTV', icon: Gem },
  { key: 'process', label: 'Quy trình chuẩn', icon: Workflow },
];

export default function Crm({ tab = 'pipeline' }) {
  const [openId, setOpenId] = useState(null);
  const [owner, setOwner] = useState('all');
  const { state } = useStore();
  const current = TABS.find((t) => t.key === tab) || TABS[0];
  return (
    <div className="with-sidebar">
      <aside className="sidebar">
        <div className="sidebar-title">Khách hàng (CRM)</div>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} className={`side-item ${current.key === key ? 'active' : ''}`} onClick={() => navigate(`crm/${key}`)}><Icon size={16} /> {label}</button>
        ))}
      </aside>
      <div className="content">
        <div className="row wrap" style={{ marginBottom: 16 }}>
          <h2 className="grow">{current.label}</h2>
          {current.key !== 'process' && (
            <select className="select" style={{ width: 180 }} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="all">Tất cả nhân sự</option>
              {state.staff.filter((s) => s.role === 'Sale' || s.role === 'CSKH').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
        {current.key === 'pipeline' && <Pipeline owner={owner} open={setOpenId} />}
        {current.key === 'tasks' && <Tasks owner={owner} open={setOpenId} />}
        {current.key === 'nurture' && <Nurture owner={owner} open={setOpenId} />}
        {current.key === 'ltv' && <Ltv owner={owner} open={setOpenId} />}
        {current.key === 'process' && <Process />}
      </div>
      {openId && <Customer360 customerId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

const byOwner = (owner) => (c) => owner === 'all' || c.ownerId === owner;

function Pipeline({ owner, open }) {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const risky = new Set(riskList(state).map((r) => r.customer.id));
  const leads = state.customers.filter((c) => c.phone && byOwner(owner)(c) && `${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="search" style={{ width: 280 }}><Search size={14} /><input className="input" placeholder="Tìm tên, SĐT…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="muted small">Viền đỏ = có nguy cơ (quá hạn, kẹt giai đoạn, chưa liên hệ). Bấm thẻ để mở hồ sơ 360°.</span>
      </div>
      <div className="kanban">
        {STAGES.map((s) => {
          const list = leads.filter((c) => c.stage === s.key).sort((a, b) => (b.stageChangedAt || 0) - (a.stageChangedAt || 0));
          const value = list.reduce((sum, c) => sum + (s.key === 'won' ? customerValue(state, c).spent : customerValue(state, c).expected), 0);
          return (
            <div className="kanban-col" key={s.key}>
              <h4><span style={{ color: s.color }}>● {s.label}</span><span className="muted">{list.length}</span></h4>
              <div className="muted small">{money(value)}</div>
              {list.slice(0, 25).map((c) => {
                const touch = lastTouchAt(state, c);
                return (
                  <div key={c.id} className={`deal ${risky.has(c.id) ? 'risk' : ''}`} onClick={() => open(c.id)}>
                    <b>{c.name}</b>
                    <span className="muted">{c.phone}</span>
                    {s.key !== 'won' && customerValue(state, c).expected > 0 && <span>{money(customerValue(state, c).expected)}</span>}
                    {s.key === 'nurturing' && <span className="badge" style={{ alignSelf: 'flex-start', background: '#f3e8ff', color: '#7e22ce' }}>{NURTURE_REASONS[c.nurtureReason]}</span>}
                    <span className="muted">{state.staff.find((x) => x.id === c.ownerId)?.name || 'Chưa phân'} · {touch ? `chạm ${fmtDur(Date.now() - touch)} trước` : 'chưa liên hệ'}</span>
                  </div>
                );
              })}
              {list.length > 25 && <div className="muted small">+{list.length - 25} khách</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Tasks({ owner, open }) {
  const { state, update } = useStore();
  const [toast, toastNode] = useToast();
  const now = Date.now();
  const tasks = state.tasks.filter((t) => !t.done && (owner === 'all' || t.staffId === owner)).sort((a, b) => a.due - b.due);
  const groups = [
    ['Quá hạn', tasks.filter((t) => t.due < now), 'var(--red)'],
    ['Trong 24 giờ tới', tasks.filter((t) => t.due >= now && t.due < now + 86400000), 'var(--orange)'],
    ['Sắp tới', tasks.filter((t) => t.due >= now + 86400000).slice(0, 30), 'var(--muted)'],
  ];
  const doneToday = state.tasks.filter((t) => t.done && !t.cancelled && t.doneAt > now - 86400000 && (owner === 'all' || t.staffId === owner)).length;
  const act = (t, type, outcome) => {
    update((d) => logInteraction(d, { customerId: t.customerId, type, outcome, staffId: t.staffId, taskId: t.id, duration: outcome === 'connected' ? 180 : 0, text: t.title }));
    toast(outcome === 'no_answer' ? `Đã lên lịch gọi lại sau ${state.process.retryHours} giờ` : 'Đã ghi nhận tương tác');
  };
  const KIND = { cadence: 'Lịch bám đuổi', retry: 'Gọi lại', nurture: 'Nuôi dưỡng', care: 'CSKH sau bán', manual: 'Hẹn riêng', upsell: 'Bán thêm', reactivate: 'Khách quay lại' };

  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div><span className="muted small">Quá hạn</span><b className={groups[0][1].length ? 'metric-bad' : ''}>{groups[0][1].length}</b></div></div>
        <div className="card kpi"><div><span className="muted small">Đến hạn 24h</span><b>{groups[1][1].length}</b></div></div>
        <div className="card kpi"><div><span className="muted small">Hoàn thành 24h qua</span><b>{doneToday}</b></div></div>
        <div className="card kpi"><div><span className="muted small">SLA gọi lead mới</span><b>{state.process.slaMinutes} phút</b></div></div>
      </div>
      {groups.map(([title, list, color]) => (
        <div className="card" key={title} style={{ marginBottom: 14 }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}><h3 style={{ color }}>{title} ({list.length})</h3></div>
          {list.length === 0 && <div className="muted small" style={{ padding: 14 }}>Không có.</div>}
          {list.map((t) => {
            const c = state.customers.find((x) => x.id === t.customerId);
            if (!c) return null;
            return (
              <div key={t.id} className="row wrap" style={{ padding: '10px 14px', borderBottom: '1px solid #f1f2f4' }}>
                <Avatar name={c.name} size="sm" />
                <div className="grow" style={{ minWidth: 200 }}>
                  <div><b style={{ cursor: 'pointer' }} onClick={() => open(c.id)}>{c.name}</b> <span className="muted small">{c.phone}</span> <span className="badge" style={{ background: STAGE[c.stage].color + '22', color: STAGE[c.stage].color }}>{STAGE[c.stage].label}</span></div>
                  <div className="small">{t.title} <span className="badge">{KIND[t.kind] || t.kind}</span></div>
                  <div className="muted small">{state.staff.find((s) => s.id === t.staffId)?.name} · {t.due < now ? `quá hạn ${fmtDur(now - t.due)}` : new Date(t.due).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</div>
                </div>
                {t.type === 'message'
                  ? <button className="btn sm" onClick={() => act(t, 'message', null)}><MessageSquare size={13} /> Đã nhắn</button>
                  : <>
                    <button className="btn sm" onClick={() => act(t, t.kind === 'care' ? 'care' : 'call', 'connected')}><Phone size={13} /> Gọi được</button>
                    <button className="btn sm" onClick={() => act(t, t.kind === 'care' ? 'care' : 'call', 'no_answer')}><PhoneOff size={13} /> Không nghe</button>
                  </>}
                <button className="btn sm primary" onClick={() => open(c.id)}>Hồ sơ</button>
              </div>
            );
          })}
        </div>
      ))}
      {toastNode}
    </>
  );
}

const NURTURE_TEMPLATES = {
  budget: 'Dạ em chào anh/chị, bên em đang có chương trình trả góp 0% và giảm 10% cho khách đã tư vấn trước đó, anh/chị tham khảo nhé ạ!',
  timing: 'Dạ em gửi anh/chị bộ sưu tập mới về tháng này, khi nhà mình hoàn thiện em hỗ trợ khảo sát và giữ giá ưu đãi cho anh/chị ạ.',
  compare: 'Dạ em gửi anh/chị bảng so sánh chất liệu + chính sách bảo hành 5 năm bên em để anh/chị dễ cân nhắc ạ.',
  other: 'Dạ em chào anh/chị, lâu rồi không thấy anh/chị ghé, bên em có vài mẫu mới phù hợp nhu cầu lần trước ạ.',
};

function Nurture({ owner, open }) {
  const { state, update } = useStore();
  const [toast, toastNode] = useToast();
  const now = Date.now();
  const list = state.customers.filter((c) => c.stage === 'nurturing' && byOwner(owner)(c)).sort((a, b) => (a.nextNurtureAt || 0) - (b.nextNurtureAt || 0));
  // Nurtured customers who started a conversation again since being parked: demand has (re)appeared.
  const returned = list.filter((c) => state.conversations.some((v) => v.customerId === c.id && v.messages.some((m) => m.from === 'customer' && m.at > (c.stageChangedAt || 0))));
  const byReason = Object.keys(NURTURE_REASONS).map((k) => [k, list.filter((c) => c.nurtureReason === k)]);
  const value = list.reduce((s, c) => s + customerValue(state, c).expected, 0);

  const sendCare = (c) => {
    update((d) => {
      logInteraction(d, { customerId: c.id, type: 'message', staffId: c.ownerId, text: NURTURE_TEMPLATES[c.nurtureReason] || NURTURE_TEMPLATES.other });
      d.tasks.forEach((t) => { if (t.customerId === c.id && !t.done && t.kind === 'nurture') { t.done = true; t.doneAt = Date.now(); } });
      d.tasks.push({ id: uid(), customerId: c.id, staffId: c.ownerId, type: 'message', kind: 'nurture', due: Date.now() + d.process.nurtureEveryDays * 86400000, title: 'Chăm sóc định kỳ – gửi mẫu mới/ưu đãi', done: false });
    });
    toast(`Đã gửi tin chăm sóc cho ${c.name}, hẹn lần tới sau ${state.process.nurtureEveryDays} ngày`);
  };
  const reactivate = (c) => { update((d) => setStage(d, c.id, 'consulting', { staffId: c.ownerId, reason: 'Khách quay lại có nhu cầu' })); toast(`${c.name} đã chuyển lại sang Đang tư vấn`); };

  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div><span className="muted small">Đang nuôi dưỡng</span><b>{list.length}</b><span className="muted small">{money(value)} giá trị tiềm năng</span></div></div>
        {byReason.filter(([, l]) => l.length).slice(0, 2).map(([k, l]) => <div className="card kpi" key={k}><div><span className="muted small">{NURTURE_REASONS[k]}</span><b>{l.length}</b></div></div>)}
        <div className="card kpi"><div><span className="muted small">Đến lịch chăm sóc</span><b className={list.filter((c) => c.nextNurtureAt <= now).length ? 'metric-bad' : ''}>{list.filter((c) => c.nextNurtureAt <= now).length}</b></div></div>
      </div>
      {returned.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 14, borderLeft: '3px solid var(--green)' }}>
          <h3 style={{ marginBottom: 8 }}><Sparkles size={15} color="var(--green)" /> Đón đầu nhu cầu: {returned.length} khách nuôi dưỡng vừa nhắn tin lại</h3>
          {returned.map((c) => <div key={c.id} className="row" style={{ padding: '6px 0' }}><b className="grow">{c.name}</b><button className="btn sm primary" onClick={() => reactivate(c)}>Chuyển sang tư vấn</button></div>)}
        </div>
      )}
      <div className="card">
        <div className="row between wrap" style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <span className="muted small">Khách hoãn mua được giữ tương tác định kỳ {state.process.nurtureEveryDays} ngày/lần với nội dung theo lý do hoãn. Xuất tệp để chạy quảng cáo bám đuổi.</span>
          <button className="btn sm" onClick={() => downloadCsv('nuoi-duong-retarget.csv', [['phone', 'name', 'reason'], ...list.map((c) => [e164(c.phone), c.name, NURTURE_REASONS[c.nurtureReason]])])}><Download size={13} /> Tệp retarget</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Khách</th><th>Lý do hoãn</th><th>Quan tâm</th><th>Phụ trách</th><th>Lần chạm cuối</th><th>Lịch chăm sóc</th><th /></tr></thead>
            <tbody>
              {list.map((c) => {
                const p = state.products.find((x) => x.id === c.interestProductId);
                const touch = lastTouchAt(state, c);
                return (
                  <tr key={c.id}>
                    <td><b style={{ cursor: 'pointer' }} onClick={() => open(c.id)}>{c.name}</b><div className="muted small">{c.phone}</div></td>
                    <td><span className="badge" style={{ background: '#f3e8ff', color: '#7e22ce' }}>{NURTURE_REASONS[c.nurtureReason]}</span></td>
                    <td className="small">{p ? `${productEmoji(p)} ${p.name}` : '—'}<div className="muted">{money(customerValue(state, c).expected)}</div></td>
                    <td>{state.staff.find((s) => s.id === c.ownerId)?.name}</td>
                    <td className="small">{touch ? `${fmtDur(now - touch)} trước` : '—'}</td>
                    <td className={c.nextNurtureAt <= now ? 'metric-bad' : ''}>{c.nextNurtureAt ? new Date(c.nextNurtureAt).toLocaleDateString('vi-VN') : '—'}</td>
                    <td><div className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => sendCare(c)}><MessageSquare size={13} /> Gửi chăm sóc</button><button className="btn sm" onClick={() => reactivate(c)}>Có nhu cầu</button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <div className="empty">Chưa có khách trong phễu nuôi dưỡng.</div>}
        </div>
      </div>
      {toastNode}
    </>
  );
}

function Ltv({ owner, open }) {
  const { state, update } = useStore();
  const [toast, toastNode] = useToast();
  const s = ltvStats(state);
  const rows = s.rows.filter((r) => byOwner(owner)(r.customer));
  const createOpp = (c, p) => {
    update((d) => {
      const x = d.customers.find((y) => y.id === c.id);
      x.interestProductId = p.id;
      x.expectedValue = p.price;
      setStage(d, c.id, 'consulting', { staffId: x.ownerId, reason: `Cơ hội bán thêm ${p.name}` });
      d.tasks.push({ id: uid(), customerId: c.id, staffId: x.ownerId, type: 'call', kind: 'upsell', due: Date.now() + 86400000, title: `Gọi giới thiệu ${p.name} (khách cũ)`, done: false });
      addActivity(d, { customerId: c.id, type: 'note', staffId: x.ownerId, text: `Tạo cơ hội bán thêm: ${p.name}` });
    });
    toast(`Đã tạo cơ hội bán thêm ${p.name} cho ${c.name}`);
  };
  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div><span className="muted small">Khách đã mua</span><b>{s.buyers}</b></div></div>
        <div className="card kpi"><div><span className="muted small">Tỉ lệ mua lại</span><b>{Math.round((s.repeat / (s.buyers || 1)) * 100)}%</b><span className="muted small">{s.repeat} khách mua ≥ 2 lần</span></div></div>
        <div className="card kpi"><div><span className="muted small">Giá trị vòng đời TB (LTV)</span><b>{money(s.avgLtv)}</b><span className="muted small">Giá trị đơn TB {compact(s.aov)}</span></div></div>
        <div className="card kpi"><div><span className="muted small">Tiềm năng upsell/cross-sell</span><b>{money(s.upsellPotential)}</b><span className="muted small">{s.dueCare} khách chưa được chăm sóc sau mua</span></div></div>
      </div>
      <div className="card">
        <div className="row between wrap" style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <span className="muted small">Khai thác khách cũ: gọi chăm sóc → giới thiệu sản phẩm đi kèm (bán chéo) hoặc bản cao cấp hơn (nâng cấp). Bấm "Tạo cơ hội" để đưa vào pipeline.</span>
          <button className="btn sm" onClick={() => downloadCsv('khach-cu-upsell.csv', [['phone', 'name', 'spent', 'orders', 'suggest'], ...rows.map((r) => [e164(r.customer.phone), r.customer.name, r.spent, r.orders, upsellFor(state, r.customer)[0]?.p.name || ''])])}><Download size={13} /> Xuất tệp</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Khách</th><th>Số đơn</th><th>Tổng chi tiêu</th><th>Mua gần nhất</th><th>Chăm sóc</th><th>Gợi ý bán thêm</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const cared = state.activities.some((a) => a.customerId === r.customer.id && a.type === 'care' && a.at > r.last);
                const sug = upsellFor(state, r.customer);
                return (
                  <tr key={r.customer.id}>
                    <td><b style={{ cursor: 'pointer' }} onClick={() => open(r.customer.id)}>{r.customer.name}</b><div className="muted small">{r.customer.phone}</div></td>
                    <td>{r.orders}</td><td><b>{money(r.spent)}</b></td>
                    <td>{s.since(r)} ngày trước</td>
                    <td>{cared ? <span className="badge green">Đã chăm sóc</span> : <span className="badge orange">Chưa</span>}</td>
                    <td style={{ minWidth: 260 }}>
                      {sug.length === 0 && <span className="muted small">—</span>}
                      {sug.slice(0, 2).map(({ p, type }) => (
                        <div key={p.id} className="row small" style={{ gap: 6, marginBottom: 4 }}>
                          <span>{productEmoji(p)} {p.name}</span><span className="badge">{type === 'cross' ? 'Bán chéo' : 'Nâng cấp'}</span>
                          <button className="btn sm" onClick={() => createOpp(r.customer, p)}><Plus size={12} /> Tạo cơ hội</button>
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {toastNode}
    </>
  );
}

function Process() {
  const { state, update } = useStore();
  const p = state.process;
  const set = (fn) => update((d) => fn(d.process));
  const num = (label, value, onChange, suffix) => (
    <label className="field" key={label}>{label}<div className="row"><input className="input" type="number" min="0" value={value} onChange={(e) => onChange(Number(e.target.value))} />{suffix && <span className="muted small">{suffix}</span>}</div></label>
  );
  const steps = [
    ['1', 'Khách nhắn tin', 'AI trả lời ngay 24/7, tư vấn theo danh mục và xin SĐT.'],
    ['2', 'Có SĐT → tiếp nhận', `Tự động phân cho sale theo vòng xoay, tạo việc gọi trong ${p.slaMinutes} phút.`],
    ['3', 'Bám đuổi theo lịch', p.cadence.map((c) => `N+${c.day}: ${c.title}`).join(' · ')],
    ['4', 'Không nghe máy', `Tự tạo lịch gọi lại sau ${p.retryHours} giờ, tối đa ${p.maxAttempts} lần.`],
    ['5', 'Khách hoãn', `Chuyển phễu nuôi dưỡng, chăm sóc ${p.nurtureEveryDays} ngày/lần theo lý do hoãn.`],
    ['6', 'Chốt đơn', `CSKH gọi sau ${p.careAfterDays.join(' và ')} ngày, gợi ý bán thêm.`],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>
      <div className="card card-pad">
        <h3 style={{ marginBottom: 12 }}>Quy trình tiếp nhận & bám đuổi lead</h3>
        <div className="seg-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {steps.map(([n, t, d]) => (
            <div key={n} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
              <span className="avatar sm" style={{ background: 'var(--primary)' }}>{n}</span>
              <div><b className="small">{t}</b><div className="muted small">{d}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3>Thông số</h3>
        <div className="form-grid">
          {num('SLA gọi lead mới', p.slaMinutes, (v) => set((x) => { x.slaMinutes = v; }), 'phút')}
          {num('Gọi lại khi không nghe máy sau', p.retryHours, (v) => set((x) => { x.retryHours = v; }), 'giờ')}
          {num('Số lần gọi tối đa', p.maxAttempts, (v) => set((x) => { x.maxAttempts = v; }), 'lần')}
          {num('Chu kỳ chăm sóc khách nuôi dưỡng', p.nurtureEveryDays, (v) => set((x) => { x.nurtureEveryDays = v; }), 'ngày')}
          {OPEN_STAGES.map((k) => num(`Cảnh báo kẹt ở "${STAGE[k].label}" sau`, p.staleDays[k], (v) => set((x) => { x.staleDays[k] = v; }), 'ngày'))}
        </div>
        <div className="muted small">Phân lead: vòng xoay đều cho nhân sự có vai trò "Sale" (thêm/bớt nhân sự ở Cài đặt → Nhân viên).</div>
      </div>
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row between"><h3>Lịch bám đuổi chuẩn</h3><button className="btn sm primary" onClick={() => set((x) => { x.cadence.push({ day: (x.cadence.at(-1)?.day || 0) + 7, type: 'call', title: 'Gọi chăm sóc' }); })}><Plus size={13} /> Thêm bước</button></div>
        {p.cadence.map((c, i) => (
          <div key={i} className="row">
            <span className="muted small" style={{ width: 40 }}>N+</span>
            <input className="input" type="number" min="0" style={{ width: 70 }} value={c.day} onChange={(e) => set((x) => { x.cadence[i].day = Number(e.target.value); })} />
            <select className="select" style={{ width: 120 }} value={c.type} onChange={(e) => set((x) => { x.cadence[i].type = e.target.value; })}><option value="call">Gọi</option><option value="message">Nhắn tin</option></select>
            <input className="input grow" value={c.title} onChange={(e) => set((x) => { x.cadence[i].title = e.target.value; })} />
            <button className="icon-btn" onClick={() => set((x) => { x.cadence.splice(i, 1); })}><Trash2 size={15} color="var(--muted)" /></button>
          </div>
        ))}
        <div className="muted small">Áp dụng cho lead mới từ thời điểm lưu. Bước N+0 luôn đến hạn theo SLA.</div>
      </div>
    </div>
  );
}
