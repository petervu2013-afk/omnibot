import { useEffect, useState } from 'react';
import { AlertTriangle, Activity, Users, Megaphone, Handshake, HeartHandshake, Siren, Route } from 'lucide-react';
import { useStore, money, compact } from '../store.jsx';
import { lastDays, campaignStats, sumStats } from '../analytics.js';
import { businessFunnel, staffStats, riskList, bottlenecks, ltvStats, STAGE, fmtDur } from '../crm.js';
import { Avatar } from '../components/ui.jsx';
import Customer360 from '../components/Customer360.jsx';
import { navigate } from '../router.js';

const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const RANGES = [[1, 'Hôm nay'], [7, '7 ngày'], [30, '30 ngày']];

// Operations dashboard: Marketing -> Sales -> Customer care, staff productivity, early warnings, bottlenecks.
export default function Home() {
  const { state } = useStore();
  const [days, setDays] = useState(7);
  const [now, setNow] = useState(Date.now());
  const [openId, setOpenId] = useState(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { setNow(Date.now()); }, [state]);

  const range = lastDays(days);
  const funnel = businessFunnel(state, range);
  const ads = sumStats(campaignStats(state, range));
  const staff = staffStats(state, range);
  const risks = riskList(state, now);
  const bn = bottlenecks(state, now);
  const ltv = ltvStats(state, now);
  const target = staff.reduce((s, x) => s + x.target, 0);
  const newLeads = state.customers.filter((c) => c.phone && (c.phoneAt || c.firstSeen) >= range.from).length;
  const uncontacted = state.customers.filter((c) => c.phone && c.stage === 'new').length;
  const overdue = state.tasks.filter((t) => !t.done && t.due < now).length;
  const dueToday = state.tasks.filter((t) => !t.done && t.due >= now && t.due < now + 86400000).length;

  const kpis = [
    { label: 'Doanh thu', value: money(funnel.revenue), sub: target ? <><div className="progress"><i style={{ width: `${Math.min(100, (funnel.revenue / target) * 100)}%` }} /></div>{pct(funnel.revenue / target)} mục tiêu {compact(target)}</> : null },
    { label: 'Đơn hàng', value: funnel.orders, sub: `Giá trị TB ${compact(funnel.revenue / (funnel.orders || 1))}` },
    { label: 'Lead mới (có SĐT)', value: newLeads, sub: `${pct(newLeads / (funnel.steps[0].value || 1))} hội thoại` },
    { label: 'Lead chưa liên hệ', value: uncontacted, sub: `SLA ${state.process.slaMinutes} phút`, warn: uncontacted > 0 },
    { label: 'Việc quá hạn', value: overdue, sub: `${dueToday} việc đến hạn 24h tới`, warn: overdue > 0 },
    { label: 'Chi phí quảng cáo', value: money(ads.spend), sub: `ROAS ${ads.roas.toFixed(2)} · ${compact(ads.reach)} người tiếp cận` },
  ];

  return (
    <div className="page">
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <h2 className="grow">Dashboard điều hành</h2>
        <span className="muted small row" style={{ gap: 6 }}><span className="live-dot" /> Cập nhật realtime · {new Date(now).toLocaleTimeString('vi-VN')}</span>
        <div className="segmented">{RANGES.map(([n, l]) => <button key={n} className={days === n ? 'active' : ''} onClick={() => setDays(n)}>{l}</button>)}</div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {kpis.map((k) => (
          <div key={k.label} className="card kpi" style={{ flexDirection: 'column', gap: 4, borderTop: k.warn ? '3px solid var(--red)' : undefined }}>
            <span className="muted small">{k.label}</span>
            <b className={k.warn ? 'metric-bad' : ''} style={{ marginTop: 0 }}>{k.value}</b>
            {k.sub && <span className="muted small" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{k.sub}</span>}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <h3><Route size={16} color="var(--primary)" /> Dòng chảy dữ liệu: Marketing → Bán hàng → Chăm sóc khách hàng</h3>
        </div>
        <div className="flow">
          <div className="flow-col">
            <h4 style={{ color: '#1877f2' }}><Megaphone size={14} /> Marketing</h4>
            <FlowMetric label="Chi phí quảng cáo" value={money(ads.spend)} />
            <FlowMetric label="Tiếp cận" value={`${compact(ads.reach)} người`} />
            <FlowMetric label="Click" value={compact(ads.clicks)} hint={`CTR ${(ads.ctr * 100).toFixed(2)}%`} />
            <FlowMetric label="Hội thoại (mọi nguồn)" value={funnel.steps[0].value} hint={`${money(ads.costPerConv)}/hội thoại QC`} />
            <button className="btn sm" onClick={() => navigate('ads')}>Chi tiết quảng cáo</button>
          </div>
          <div className="flow-col">
            <h4 style={{ color: '#16a34a' }}><Handshake size={14} /> Bán hàng</h4>
            {funnel.steps.slice(1).map((s, i) => {
              const prev = funnel.steps[i].value;
              return <FlowMetric key={s.key} label={s.label} value={s.value} hint={`${pct(s.value / (prev || 1))} bước trước`} bar={s.value / (funnel.steps[0].value || 1)} />;
            })}
            <FlowMetric label="Doanh thu" value={money(funnel.revenue)} />
            <button className="btn sm" onClick={() => navigate('crm')}>Mở pipeline</button>
          </div>
          <div className="flow-col">
            <h4 style={{ color: '#a855f7' }}><HeartHandshake size={14} /> Chăm sóc khách hàng</h4>
            <FlowMetric label="Cuộc chăm sóc sau bán" value={funnel.careActs} />
            <FlowMetric label="Khách mua lặp lại" value={`${funnel.repeat}/${funnel.totalBuyers}`} hint={pct(funnel.repeat / (funnel.totalBuyers || 1))} />
            <FlowMetric label="Khách cần gọi chăm sóc" value={ltv.dueCare} />
            <FlowMetric label="Đang nuôi dưỡng" value={funnel.nurturing} />
            <FlowMetric label="Tiềm năng bán thêm" value={money(ltv.upsellPotential)} />
            <button className="btn sm" onClick={() => navigate('crm/ltv')}>Khách cũ & LTV</button>
          </div>
        </div>
      </div>

      <div className="chart-grid" style={{ gridTemplateColumns: '3fr 2fr' }}>
        <div className="card card-pad">
          <div className="row between" style={{ marginBottom: 8 }}>
            <h3><Siren size={16} color="var(--red)" /> Cảnh báo sớm – thương vụ có nguy cơ ({risks.length})</h3>
            <button className="btn sm" onClick={() => navigate('crm/tasks')}>Tất cả việc</button>
          </div>
          {risks.length === 0 && <div className="muted small">Không có thương vụ nào cần can thiệp.</div>}
          {risks.slice(0, 7).map((r) => (
            <div key={r.customer.id} className="risk-row">
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <b>{r.customer.name}</b>
                  <span className="badge" style={{ background: STAGE[r.customer.stage].color + '22', color: STAGE[r.customer.stage].color }}>{STAGE[r.customer.stage].label}</span>
                  {r.expected > 0 && <span className="small muted">{money(r.expected)}</span>}
                </div>
                <div className="small" style={{ color: '#b91c1c' }}>{r.reasons.join(' · ')}</div>
                <div className="muted small">Phụ trách: {state.staff.find((s) => s.id === r.ownerId)?.name || 'chưa phân'}</div>
              </div>
              <button className="btn sm primary" onClick={() => setOpenId(r.customer.id)}>Xử lý</button>
            </div>
          ))}
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 8 }}><AlertTriangle size={16} color="var(--orange)" /> Điểm nghẽn quy trình</h3>
          {bn.issues.length === 0 && <div className="muted small">Quy trình đang thông suốt.</div>}
          {bn.issues.map((x, i) => (
            <div key={i} className={`insight ${x.level}`} style={{ marginBottom: 8 }}><b className="small">{x.text}</b><span className="small muted">{x.hint}</span></div>
          ))}
          <table className="table" style={{ marginTop: 6 }}>
            <thead><tr><th>Giai đoạn</th><th>Lead</th><th>TB nằm</th><th>Kẹt</th></tr></thead>
            <tbody>
              {bn.rows.map((r) => (
                <tr key={r.key}><td>{r.label}</td><td>{r.count}</td><td>{r.avgDays.toFixed(1)} ngày</td><td className={r.stale ? 'metric-bad' : ''}>{r.stale}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row between" style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <h3><Users size={16} color="var(--primary)" /> Năng suất nhân sự</h3>
          <span className="muted small"><Activity size={12} /> {RANGES.find(([n]) => n === days)[1]}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Nhân sự</th><th>Cuộc gọi</th><th>Phút gọi</th><th>Chăm sóc</th><th>Lead nhận</th><th>Đã liên hệ</th><th>Gọi lần đầu sau</th><th>Chốt / tỉ lệ</th><th>Doanh số</th><th>Tiến độ mục tiêu</th><th>Quá hạn</th></tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.staff.id}>
                  <td><div className="row"><Avatar name={s.staff.name} size="sm" /><div><b>{s.staff.name}</b><div className="muted small">{s.staff.role}</div></div></div></td>
                  <td>{s.calls} <span className="muted small">({s.connectedCalls} nghe)</span></td>
                  <td>{s.talkMinutes}</td>
                  <td>{s.careActs}</td>
                  <td>{s.leads}</td>
                  <td className={s.leads && s.contactedRate < 0.8 ? 'metric-bad' : ''}>{s.leads ? pct(s.contactedRate) : '—'}</td>
                  <td className={s.avgFirstContact > state.process.slaMinutes * 60000 ? 'metric-bad' : 'metric-good'}>{s.avgFirstContact != null ? fmtDur(s.avgFirstContact) : '—'}</td>
                  <td>{s.staff.role === 'Sale' ? `${s.won} / ${pct(s.conversion)}` : '—'}</td>
                  <td>{s.staff.role === 'Sale' ? money(s.revenue) : '—'}</td>
                  <td style={{ minWidth: 140 }}>{s.target ? <><div className="progress"><i style={{ width: `${Math.min(100, s.progress * 100)}%`, background: s.progress >= 1 ? 'var(--green)' : s.progress < 0.5 ? 'var(--red)' : 'var(--primary)' }} /></div><span className="small muted">{pct(s.progress)} / {compact(s.target)}</span></> : '—'}</td>
                  <td className={s.overdue ? 'metric-bad' : ''}>{s.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {openId && <Customer360 customerId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function FlowMetric({ label, value, hint, bar }) {
  return (
    <div>
      <div className="flow-metric"><span className="muted">{label}</span><b>{value}</b></div>
      {bar != null && <div className="progress" style={{ height: 5, marginTop: 3 }}><i style={{ width: `${Math.max(2, bar * 100)}%`, background: '#16a34a' }} /></div>}
      {hint && <div className="muted small" style={{ textAlign: 'right' }}>{hint}</div>}
    </div>
  );
}
