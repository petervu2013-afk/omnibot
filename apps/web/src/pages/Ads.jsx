import { useMemo, useState } from 'react';
import {
  BarChart3, Gauge, Lightbulb, Wallet, Megaphone, Send, Users, Upload, Sparkles, Loader2, Download, Link2, Plus, ArrowUpRight, ArrowDownRight, Copy,
} from 'lucide-react';
import { useStore, uid, money, compact, AD_PLATFORMS, PLATFORMS, startOfDay } from '../store.jsx';
import {
  campaignStats, sumStats, dailySpendRevenue, ruleInsights, lastDays, SEGMENTS, segmentCustomers, e164, splitName, sha256, inRange,
} from '../analytics.js';
import { aiHealth } from '../ai.js';
import { parseTable, mapHeaders, toNumber, downloadCsv } from '../csv.js';
import { LineChart, Legend } from '../components/charts.jsx';
import { Modal, Switch, useToast, PlatformIcon } from '../components/ui.jsx';
import AdsOverview from '../components/AdsOverview.jsx';
import { AdAccounts, CampaignManager } from '../components/AdsManager.jsx';
import Broadcast from '../components/Broadcast.jsx';

const TABS = [
  { key: 'accounts', label: 'Tài khoản', icon: Wallet, own: true },
  { key: 'campaigns', label: 'Chiến dịch', icon: Megaphone, own: true },
  { key: 'broadcast', label: 'Gửi tin hàng loạt', icon: Send, own: true },
  { key: 'overview', label: 'Tổng quan kết nối & KPI', icon: Gauge },
  { key: 'perf', label: 'Hiệu quả chiến dịch', icon: BarChart3 },
  { key: 'insights', label: 'Gợi ý tối ưu', icon: Lightbulb },
  { key: 'audiences', label: 'Tệp khách & chuyển đổi', icon: Users },
  { key: 'import', label: 'Nhập dữ liệu & theo dõi', icon: Upload, own: true },
];
const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const roasClass = (r) => (r >= 3 ? 'metric-good' : r > 0 && r < 1.5 ? 'metric-bad' : '');

export default function Ads({ tab: initialTab }) {
  const [tab, setTab] = useState(TABS.some((t) => t.key === initialTab) ? initialTab : 'accounts');
  const [rangeDays, setRangeDays] = useState(14);
  const [platform, setPlatform] = useState('all');
  const { state } = useStore();
  const range = lastDays(rangeDays);
  const rows = useMemo(() => campaignStats(state, range).filter((r) => platform === 'all' || r.platform === platform),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, rangeDays, platform]);
  const total = sumStats(rows);

  return (
    <div className="with-sidebar">
      <aside className="sidebar">
        <div className="sidebar-title">Quảng cáo</div>
        {TABS.slice(0, 3).map(({ key, label, icon: Icon }) => (
          <button key={key} className={`side-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}><Icon size={16} /> {label}</button>
        ))}
        <div className="sidebar-title" style={{ marginTop: 10 }}>Báo cáo & tối ưu</div>
        {TABS.slice(3).map(({ key, label, icon: Icon }) => (
          <button key={key} className={`side-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}><Icon size={16} /> {label}</button>
        ))}
      </aside>
      <div className="content">
        <div className="row wrap" style={{ marginBottom: 16 }}>
          <h2 className="grow">{TABS.find((t) => t.key === tab).label}</h2>
          {!TABS.find((t) => t.key === tab).own && (
            <>
              <select className="select" style={{ width: 160 }} value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="all">Tất cả nền tảng</option>
                {Object.entries(AD_PLATFORMS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </select>
              <select className="select" style={{ width: 130 }} value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
                <option value={7}>7 ngày</option><option value={14}>14 ngày</option><option value={28}>28 ngày</option>
              </select>
            </>
          )}
        </div>
        {tab === 'accounts' && <AdAccounts />}
        {tab === 'campaigns' && <CampaignManager />}
        {tab === 'broadcast' && <Broadcast />}
        {tab === 'overview' && <AdsOverview rows={rows} total={total} range={range} />}
        {tab === 'perf' && <Performance rows={rows} total={total} range={range} />}
        {tab === 'insights' && <Insights rows={rows} total={total} rangeDays={rangeDays} />}
        {tab === 'audiences' && <Audiences range={range} />}
        {tab === 'import' && <ImportData />}
      </div>
    </div>
  );
}

function Performance({ rows, total, range }) {
  const { state } = useStore();
  const [sort, setSort] = useState('spend');
  const daily = dailySpendRevenue(state, range, rows.map((r) => r.id));
  const labels = daily.keys.map((k) => `${new Date(k).getDate()}/${new Date(k).getMonth() + 1}`);
  const byPlatform = Object.keys(AD_PLATFORMS).map((k) => ({ key: k, ...sumStats(rows.filter((r) => r.platform === k)) })).filter((p) => p.spend > 0);
  const sorted = [...rows].sort((a, b) => b[sort] - a[sort]);

  const kpis = [
    { label: 'Chi tiêu', value: money(total.spend) },
    { label: 'Tiếp cận (ước tính)', value: compact(total.reach) + ' người' },
    { label: 'Tần suất', value: total.frequency.toFixed(2) + ' lần/người' },
    { label: 'CPM', value: money(total.cpm) },
    { label: 'Doanh thu từ quảng cáo', value: money(total.revenue) },
    { label: 'ROAS', value: total.roas.toFixed(2), cls: roasClass(total.roas) },
    { label: 'Chi phí / đơn (CPA)', value: money(total.cpa) },
    { label: 'Chi phí / hội thoại', value: money(total.costPerConv) },
    { label: 'Chi phí / SĐT', value: money(total.costPerLead) },
    { label: 'Tỉ lệ ra SĐT', value: pct(total.leadRate, 0) },
    { label: 'Tỉ lệ chốt (SĐT → đơn)', value: pct(total.closeRate, 0) },
  ];
  const funnel = [
    ['Hiển thị', total.impressions], ['Click', total.clicks], ['Hội thoại', total.conversations], ['Có SĐT', total.leads], ['Đơn hàng', total.orders],
  ];

  return (
    <>
      <div className="kpi-grid">
        {kpis.map((k) => <div className="card kpi" key={k.label}><div><span className="muted small">{k.label}</span><b className={k.cls}>{k.value}</b></div></div>)}
      </div>
      <div className="chart-grid">
        <div className="card card-pad">
          <div className="row between wrap" style={{ marginBottom: 12 }}>
            <h3>Chi tiêu và doanh thu theo ngày</h3>
            <Legend items={[{ label: 'Chi tiêu', color: '#ef4444' }, { label: 'Doanh thu', color: '#10b981' }]} />
          </div>
          <LineChart labels={labels} format={compact} series={[{ key: 's', label: 'Chi tiêu', color: '#ef4444', data: daily.spend }, { key: 'r', label: 'Doanh thu', color: '#10b981', data: daily.revenue }]} />
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 12 }}>Phễu chuyển đổi</h3>
          <div className="funnel">
            {funnel.map(([label, v], i) => (
              <div className="funnel-row" key={label} style={{ gridTemplateColumns: '80px 1fr 70px' }}>
                <span className="small">{label}</span>
                <div className="funnel-bar" style={{ width: `${Math.max(2, Math.pow(v / (funnel[0][1] || 1), 0.25) * 100)}%`, opacity: 1 - i * 0.12 }} />
                <span className="small"><b>{compact(v)}</b>{i > 0 && <div className="muted">{pct(v / (funnel[i - 1][1] || 1))}</div>}</span>
              </div>
            ))}
          </div>
          <div className="muted small" style={{ marginTop: 8 }}>Hiển thị & click lấy từ nền tảng quảng cáo; hội thoại, SĐT, đơn lấy từ dữ liệu chat thực tế.</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}><h3>So sánh nền tảng</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Nền tảng</th><th>Chi tiêu</th><th>CPM</th><th>CTR</th><th>Chi phí/hội thoại</th><th>Chi phí/SĐT</th><th>CPA</th><th>Doanh thu</th><th>ROAS</th></tr></thead>
            <tbody>
              {byPlatform.map((p) => (
                <tr key={p.key}>
                  <td><b style={{ color: AD_PLATFORMS[p.key].color }}>{AD_PLATFORMS[p.key].label}</b></td>
                  <td>{money(p.spend)}</td><td>{money(p.cpm)}</td><td>{pct(p.ctr, 2)}</td><td>{money(p.costPerConv)}</td><td>{p.leads ? money(p.costPerLead) : "—"}</td><td>{p.orders ? money(p.cpa) : "—"}</td><td>{money(p.revenue)}</td>
                  <td className={roasClass(p.roas)}>{p.roas.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row between wrap" style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <h3>Chi tiết chiến dịch</h3>
          <div className="row small">Sắp xếp
            <select className="select" style={{ width: 150 }} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="spend">Chi tiêu</option><option value="revenue">Doanh thu</option><option value="roas">ROAS</option><option value="leads">Số SĐT</option><option value="orders">Số đơn</option>
            </select>
            <button className="btn sm" onClick={() => downloadCsv('bao-cao-chien-dich.csv', [
              ['Chiến dịch', 'Nền tảng', 'Chi tiêu', 'Hiển thị', 'Click', 'CTR', 'Hội thoại', 'SĐT', 'Đơn', 'Doanh thu', 'Chi phí/hội thoại', 'Chi phí/SĐT', 'CPA', 'ROAS'],
              ...sorted.map((r) => [r.name, AD_PLATFORMS[r.platform].label, r.spend, r.impressions, r.clicks, (r.ctr * 100).toFixed(2), r.conversations, r.leads, r.orders, r.revenue, Math.round(r.costPerConv), Math.round(r.costPerLead), Math.round(r.cpa), r.roas.toFixed(2)]),
            ])}><Download size={13} /> CSV</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Chiến dịch</th><th>Kênh quảng cáo</th><th>Chi tiêu</th><th>Tiếp cận</th><th>Tần suất</th><th>CTR</th><th>Hội thoại</th><th>SĐT</th><th>Đơn</th><th>Doanh thu</th><th>Chi phí/SĐT</th><th>CPA</th><th>ROAS</th><th>AI tự xử lý</th></tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td style={{ minWidth: 200 }}><b>{r.name}</b><div className="muted small">{r.focus}</div></td>
                  <td style={{ minWidth: 220 }} className="small">
                    <div className="row" style={{ gap: 4 }}><PlatformIcon platform={state.channels.find((c) => c.id === r.channelId)?.platform} /> <b>{state.channels.find((c) => c.id === r.channelId)?.name || '—'}</b></div>
                    <div className="muted">{AD_PLATFORMS[r.platform].label}{r.placement ? ` · ${r.placement}` : ''}</div>
                    {r.audience && <div className="muted">🎯 {r.audience}</div>}
                  </td>
                  <td>{money(r.spend)}</td><td>{compact(r.reach)}</td><td className={r.frequency > state.kpiTargets.frequencyMax ? 'metric-bad' : ''}>{r.frequency.toFixed(2)}</td><td>{pct(r.ctr, 2)}</td>
                  <td>{r.conversations}</td>
                  <td>{r.leads} <span className="muted small">({pct(r.leadRate, 0)})</span></td>
                  <td>{r.orders}</td><td>{money(r.revenue)}</td><td>{r.leads ? money(r.costPerLead) : "—"}</td><td>{r.orders ? money(r.cpa) : "—"}</td>
                  <td className={roasClass(r.roas)}>{r.roas >= 3 ? <ArrowUpRight size={13} /> : r.roas > 0 && r.roas < 1.5 ? <ArrowDownRight size={13} /> : null}{r.roas.toFixed(2)}</td>
                  <td>{pct(r.automationRate, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && <div className="empty">Chưa có dữ liệu chiến dịch. Vào "Nhập dữ liệu" để thêm.</div>}
        </div>
      </div>
    </>
  );
}

function Insights({ rows, total, rangeDays }) {
  const rules = ruleInsights(rows, total);
  const [ai, setAi] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const name = (id) => rows.find((r) => r.id === id)?.name;

  const runAi = async () => {
    setLoading(true); setError('');
    try {
      const h = await aiHealth(true);
      if (!h.ai) throw new Error('Cần chạy server AI với ANTHROPIC_API_KEY để phân tích bằng Claude. Gợi ý theo quy tắc vẫn hiển thị bên dưới.');
      const campaigns = rows.map((r) => ({
        id: r.id, name: r.name, platform: r.platform, objective: r.objective, focus: r.focus, spend: r.spend, impressions: r.impressions, clicks: r.clicks,
        ctr: +(r.ctr * 100).toFixed(2), conversations: r.conversations, leads: r.leads, orders: r.orders, revenue: r.revenue,
        cost_per_lead: Math.round(r.costPerLead), cpa: Math.round(r.cpa), roas: +r.roas.toFixed(2), platform_reported_conversions: r.platformConversions,
      }));
      const res = await fetch('/api/ai/campaign-insights', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ campaigns, period: `${rangeDays} ngày gần nhất` }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setAi(body.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row between wrap">
          <h3><Sparkles size={16} color="#7c3aed" /> Phân tích bằng AI</h3>
          <button className="btn primary" onClick={runAi} disabled={loading}>{loading ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} Phân tích {rows.length} chiến dịch</button>
        </div>
        {error && <div className="ai-banner off">{error}</div>}
        {ai && (
          <>
            <div>{ai.summary}</div>
            {ai.actions.map((a, i) => (
              <div key={i} className={`insight ${a.priority}`}>
                <b>{a.action}</b>
                {a.campaign_id && <span className="small muted">{name(a.campaign_id) || a.campaign_id}</span>}
                <span className="small">{a.reason}</span>
              </div>
            ))}
            {ai.audience_tips.length > 0 && <div><b className="small">Gợi ý tệp khách hàng</b><ul className="small">{ai.audience_tips.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}
          </>
        )}
        {!ai && !error && <div className="muted small">Claude đọc số liệu chi tiêu, hội thoại, SĐT, đơn hàng và doanh thu thật của từng chiến dịch để đề xuất tăng/giảm ngân sách, đổi nội dung, đổi tệp.</div>}
      </div>

      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3>Gợi ý theo quy tắc ({rules.length})</h3>
        {rules.length === 0 && <div className="muted small">Các chiến dịch đang ổn định.</div>}
        {rules.map((a, i) => (
          <div key={i} className={`insight ${a.priority}`}>
            <b>{a.action}</b>
            <span className="small muted">{name(a.campaign_id)}</span>
            <span className="small">{a.reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const EXPORT_FORMATS = {
  meta: { label: 'Facebook / Meta Custom Audience', file: 'meta-custom-audience' },
  google: { label: 'Google Ads Customer Match', file: 'google-customer-match' },
  tiktok: { label: 'TikTok Custom Audience', file: 'tiktok-audience' },
};

function Audiences({ range }) {
  const { state } = useStore();
  const [format, setFormat] = useState('meta');
  const [hash, setHash] = useState(true);
  const [campaignId, setCampaignId] = useState('');
  const [toast, toastNode] = useToast();

  const exportSegment = async (key) => {
    const list = segmentCustomers(state, key, campaignId || null);
    if (!list.length) return toast('Tệp trống');
    const h = async (v) => (hash && v ? sha256(v.trim().toLowerCase()) : v);
    let rows;
    if (format === 'meta') {
      rows = [['phone', 'fn', 'ln', 'country', 'value']];
      for (const u of list) { const n = splitName(u.name); rows.push([await h(e164(u.phone).replace('+', '')), await h(n.fn), await h(n.ln), await h('vn'), u.spent]); }
    } else if (format === 'google') {
      rows = [['Phone', 'First Name', 'Last Name', 'Country']];
      for (const u of list) { const n = splitName(u.name); rows.push([await h(e164(u.phone)), await h(n.fn), await h(n.ln), 'VN']); }
    } else {
      rows = [['phone']];
      for (const u of list) rows.push([hash ? await sha256(e164(u.phone)) : e164(u.phone)]);
    }
    downloadCsv(`${EXPORT_FORMATS[format].file}-${key}.csv`, rows);
    toast(`Đã xuất ${list.length} khách`);
  };

  const exportConversions = () => {
    const orders = state.orders.filter((o) => o.status === 'done' && inRange(o.createdAt, range));
    const rows = [['Phone Number', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency', 'Order ID', 'Campaign']];
    orders.forEach((o) => {
      const u = state.customers.find((x) => x.id === o.customerId);
      if (!u?.phone) return;
      const value = o.items.reduce((s, it) => s + (state.products.find((p) => p.id === it.productId)?.price || 0) * it.qty, 0);
      const t = new Date(o.createdAt);
      const time = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:00+07:00`;
      rows.push([e164(u.phone), 'Purchase', time, value, 'VND', o.id, state.campaigns.find((c) => c.id === o.campaignId)?.name || '']);
    });
    downloadCsv('offline-conversions.csv', rows);
    toast(`Đã xuất ${rows.length - 1} chuyển đổi`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card card-pad row wrap" style={{ gap: 16 }}>
        <label className="field" style={{ minWidth: 260 }}>Định dạng xuất
          <select className="select" value={format} onChange={(e) => setFormat(e.target.value)}>
            {Object.entries(EXPORT_FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 240 }}>Lọc theo chiến dịch nguồn
          <select className="select" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">Tất cả</option>
            {state.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="row small" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}><Switch on={hash} onChange={setHash} /> Mã hóa SHA-256 (khuyến nghị)</div>
      </div>

      <div className="seg-grid">
        {Object.entries(SEGMENTS).map(([key, s]) => {
          const n = segmentCustomers(state, key, campaignId || null).length;
          return (
            <div className="card card-pad" key={key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row between"><b>{s.label}</b><span className="badge blue">{n} khách</span></div>
              <span className="muted small grow">{s.desc}</span>
              <button className="btn" onClick={() => exportSegment(key)} disabled={!n}><Download size={14} /> Tải tệp CSV</button>
            </div>
          );
        })}
      </div>

      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3>Chuyển đổi offline (đơn đã hoàn thành)</h3>
        <span className="muted small">Gửi đơn hàng thật ngược về Google Ads (Offline conversion / Enhanced conversions for leads) hoặc Meta (Offline events) để thuật toán tối ưu theo người mua thật thay vì người chỉ nhắn tin.</span>
        <div><button className="btn primary" onClick={exportConversions}><Download size={14} /> Xuất chuyển đổi {range.days} ngày</button></div>
      </div>
      {toastNode}
    </div>
  );
}

const METRIC_HEADERS = [
  ['date', /^(ngay|date|day|reporting starts|bat dau bao cao|ngay bat dau)$/],
  ['campaign', /^(ten chien dich|chien dich|campaign|campaign name)$/],
  ['spend', /^(so tien da chi tieu.*|amount spent.*|cost|chi phi|spend|chi tieu)$/],
  ['impressions', /^(luot hien thi|impressions|impr|hien thi)$/],
  ['clicks', /^(luot click.*|clicks|link clicks|click|so lan nhap)$/],
  ['conversions', /^(ket qua|results|conversions|chuyen doi|luot bat dau cuoc tro chuyen.*|messaging conversations started)$/],
];

function parseDate(s) {
  const str = String(s || '').trim();
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return startOfDay(new Date(+m[1], +m[2] - 1, +m[3]).getTime());
  m = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return startOfDay(new Date(+m[3], +m[2] - 1, +m[1]).getTime());
  return null;
}

function ImportData() {
  const { state, update } = useStore();
  const [platform, setPlatform] = useState('facebook');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [toast, toastNode] = useToast();

  const parse = () => {
    setError('');
    const table = parseTable(text);
    const map = mapHeaders(table.headers, METRIC_HEADERS);
    if (!map.includes('campaign') || !map.includes('spend') || !map.includes('date')) {
      setError('Cần các cột: Ngày, Tên chiến dịch, Số tiền đã chi tiêu (và nên có Lượt hiển thị, Lượt click, Kết quả). Hãy xuất báo cáo theo ngày ("Breakdown: Day").');
      return;
    }
    const rows = table.rows.map((cells) => {
      const r = {};
      map.forEach((h, i) => { if (h) r[h] = cells[i]; });
      return { date: parseDate(r.date), campaign: r.campaign, spend: toNumber(r.spend), impressions: toNumber(r.impressions), clicks: toNumber(r.clicks), conversions: toNumber(r.conversions) };
    }).filter((r) => r.date && r.campaign);
    if (!rows.length) { setError('Không đọc được dòng dữ liệu nào (kiểm tra định dạng ngày: YYYY-MM-DD hoặc DD/MM/YYYY).'); return; }
    setPreview(rows);
  };

  const doImport = () => {
    update((d) => {
      preview.forEach((r) => {
        let c = d.campaigns.find((x) => x.name === r.campaign && x.platform === platform);
        if (!c) {
          c = { id: uid(), platform, name: r.campaign, objective: 'messages', channelId: d.channels[0]?.id, focus: '', status: 'active', budget: 0, productIds: [] };
          d.campaigns.push(c);
        }
        const existing = d.adMetrics.find((m) => m.campaignId === c.id && m.date === r.date);
        const data = { spend: r.spend, impressions: r.impressions, clicks: r.clicks, platformConversions: r.conversions };
        if (existing) Object.assign(existing, data); else d.adMetrics.push({ campaignId: c.id, date: r.date, ...data });
      });
    });
    toast(`Đã nhập ${preview.length} dòng số liệu`);
    setPreview(null); setText('');
  };

  const trackingLink = (c) => {
    const ch = state.channels.find((x) => x.id === c.channelId);
    if (!ch) return '';
    if (ch.platform === 'facebook') return `https://m.me/<page-id>?ref=${c.id}`;
    if (ch.platform === 'website') return `https://goviet.vn/?utm_source=${c.platform}&utm_medium=cpc&utm_campaign=${c.id}`;
    if (ch.platform === 'zalo') return `https://zalo.me/<oa-id>?src=${c.id}`;
    return `ref=${c.id}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3>Nhập số liệu từ trình quản lý quảng cáo</h3>
        <span className="muted small">Xuất báo cáo theo ngày từ Meta Ads Manager, Google Ads hoặc TikTok Ads Manager (CSV/Excel), sao chép toàn bộ bảng và dán vào đây. Chiến dịch mới sẽ được tạo tự động theo tên.</span>
        <div className="row wrap">
          {Object.entries(AD_PLATFORMS).map(([k, p]) => (
            <label key={k} className={`btn ${platform === k ? 'outline-primary' : ''}`}><input type="radio" hidden checked={platform === k} onChange={() => setPlatform(k)} />{p.label}</label>
          ))}
        </div>
        {!preview ? (
          <>
            <textarea className="textarea" style={{ minHeight: 160, fontFamily: 'monospace', fontSize: 12.5 }} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={'Ngày,Tên chiến dịch,Số tiền đã chi tiêu (VND),Lượt hiển thị,Lượt click,Kết quả\n2026-10-20,FB | Tin nhắn | Bàn ăn gỗ sồi,612000,13400,240,21'} />
            {error && <div className="ai-banner off">{error}</div>}
            <div><button className="btn primary" onClick={parse} disabled={!text.trim()}>Đọc dữ liệu</button></div>
          </>
        ) : (
          <>
            <div style={{ overflowX: 'auto', maxHeight: 280 }}>
              <table className="table">
                <thead><tr><th>Ngày</th><th>Chiến dịch</th><th>Chi tiêu</th><th>Hiển thị</th><th>Click</th><th>Kết quả</th></tr></thead>
                <tbody>{preview.map((r, i) => <tr key={i}><td>{new Date(r.date).toLocaleDateString('vi-VN')}</td><td>{r.campaign}</td><td>{money(r.spend)}</td><td>{r.impressions}</td><td>{r.clicks}</td><td>{r.conversions}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="row"><button className="btn" onClick={() => setPreview(null)}>Sửa lại</button><button className="btn primary" onClick={doImport}>Nhập {preview.length} dòng</button></div>
          </>
        )}
      </div>

      <div className="card">
        <div className="row between wrap" style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <h3>Chiến dịch & mã theo dõi</h3>
          <button className="btn primary sm" onClick={() => setNewOpen(true)}><Plus size={14} /> Thêm chiến dịch</button>
        </div>
        <div className="muted small" style={{ padding: '10px 14px', background: '#f8fafc' }}>
          <Link2 size={12} /> Gắn mã theo dõi vào link quảng cáo để mỗi hội thoại, SĐT và đơn hàng được ghi nhận đúng chiến dịch (Click-to-Messenger dùng tham số <code>ref</code>, website dùng <code>utm_campaign</code>).
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Chiến dịch</th><th>Nền tảng</th><th>Kênh nhận tin</th><th>Đang chạy</th><th>Link theo dõi</th></tr></thead>
            <tbody>
              {state.campaigns.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b><div className="muted small">{c.focus}</div></td>
                  <td>{AD_PLATFORMS[c.platform].label}</td>
                  <td>{state.channels.find((x) => x.id === c.channelId)?.name || '—'}</td>
                  <td><Switch on={c.status === 'active'} onChange={(v) => update((d) => { d.campaigns.find((x) => x.id === c.id).status = v ? 'active' : 'paused'; })} /></td>
                  <td>
                    <div className="row small" style={{ gap: 4 }}>
                      <code style={{ fontSize: 11.5 }}>{trackingLink(c)}</code>
                      <button className="icon-btn" title="Sao chép" onClick={() => { navigator.clipboard?.writeText(trackingLink(c)); toast('Đã sao chép link'); }}><Copy size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {newOpen && <NewCampaignModal onClose={() => setNewOpen(false)} />}
      {toastNode}
    </div>
  );
}

function NewCampaignModal({ onClose }) {
  const { state, update } = useStore();
  const [form, setForm] = useState({ name: '', platform: 'facebook', channelId: state.channels[0]?.id, objective: 'messages', productIds: [] });
  const save = () => {
    const focus = [...new Set(form.productIds.map((id) => state.products.find((p) => p.id === id)?.category))].join(', ');
    update((d) => { d.campaigns.push({ id: uid(), ...form, focus, status: 'active', budget: 0 }); });
    onClose();
  };
  return (
    <Modal title="Thêm chiến dịch" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" onClick={save} disabled={!form.name}>Lưu</button></>}>
      <label className="field">Tên chiến dịch (trùng tên trong trình quản lý quảng cáo)<input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <div className="form-grid">
        <label className="field">Nền tảng
          <select className="select" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>{Object.entries(AD_PLATFORMS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}</select>
        </label>
        <label className="field">Kênh nhận tin nhắn
          <select className="select" value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })}>{state.channels.map((c) => <option key={c.id} value={c.id}>{c.name} ({PLATFORMS[c.platform].label})</option>)}</select>
        </label>
      </div>
      <div className="field">Sản phẩm quảng cáo (AI sẽ ưu tiên tư vấn khi khách đến từ chiến dịch này)
        <div className="channel-pick">
          {state.products.map((p) => (
            <label key={p.id} className={form.productIds.includes(p.id) ? 'on' : ''}>
              <input type="checkbox" hidden checked={form.productIds.includes(p.id)} onChange={() => setForm({ ...form, productIds: form.productIds.includes(p.id) ? form.productIds.filter((x) => x !== p.id) : [...form.productIds, p.id] })} />
              {p.name}
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
