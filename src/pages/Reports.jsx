import { useState } from 'react';
import {
  Users, UserPlus, Phone, Percent, MessageSquare, Clock, ShoppingCart, DollarSign, LayoutDashboard, Sparkles, Bot, UserCog, Timer, Wallet,
} from 'lucide-react';
import { useStore, money, orderTotal } from '../store.jsx';
import { PlatformIcon, productEmoji } from '../components/ui.jsx';
import { LineChart, BarChart, Legend } from '../components/charts.jsx';
import { aiUsage, lastDays, inRange } from '../analytics.js';
import { Tags, Megaphone, Coins, Warehouse } from 'lucide-react';
import { SideMenu } from '../components/kit.jsx';
import { navigate } from '../router.js';
import { CustomerReport, OrderReport, StaffReport, TagReport, InteractionReport, AdsReport, CreditReport, StockReport } from './reports/More.jsx';

const USD_VND = 26000;
const SERIES = [
  { key: 'conversations', label: 'Hội thoại', color: '#0b66ff' },
  { key: 'phones', label: 'SĐT', color: '#10b981' },
  { key: 'orders', label: 'Đơn hàng', color: '#f97316' },
];
const pct = (v) => `${Math.round(v * 100)}%`;

const REPORTS = [
  { key: 'overview', label: 'Tổng quan', title: 'Tổng quan báo cáo', icon: LayoutDashboard },
  { key: 'customers', label: 'Khách hàng', title: 'Báo cáo khách hàng', icon: Users },
  { key: 'orders', label: 'Đơn hàng', title: 'Báo cáo đơn hàng', icon: ShoppingCart },
  { key: 'staff', label: 'Nhân viên', title: 'Báo cáo nhân viên', icon: UserCog },
  { key: 'tags', label: 'Thẻ hội thoại', title: 'Báo cáo thẻ hội thoại', icon: Tags },
  { key: 'interactions', label: 'Tương tác', title: 'Báo cáo tương tác', icon: MessageSquare },
  { key: 'ads', label: 'Quảng cáo', title: 'Báo cáo quảng cáo', icon: Megaphone },
  { key: 'ai', label: 'Hiệu quả AI', title: 'Hiệu quả sử dụng AI', icon: Sparkles },
  { key: 'credit', label: 'Credit', title: 'Báo cáo Credits AI', icon: Coins },
  { key: 'stock', label: 'Kho hàng', title: 'Báo cáo kho hàng', icon: Warehouse },
];

export default function Reports({ tab = 'overview' }) {
  const [rangeDays, setRangeDays] = useState(14);
  const range = lastDays(rangeDays);
  const cur = REPORTS.find((r) => r.key === tab) || REPORTS[0];
  const Page = { overview: Overview, ai: AiReport, customers: CustomerReport, orders: OrderReport, staff: StaffReport, tags: TagReport, interactions: InteractionReport, ads: AdsReport, credit: CreditReport, stock: StockReport }[cur.key];
  return (
    <div className="with-sidebar">
      <SideMenu title="Báo cáo hệ thống" items={REPORTS} active={cur.key} onSelect={(k) => navigate(`reports/${k}`)} />
      <div className="content">
        <div className="row wrap" style={{ marginBottom: 16 }}>
          <h2 className="grow">{cur.title}</h2>
          <select className="select" style={{ width: 140 }} value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
            <option value={7}>7 ngày</option><option value={14}>14 ngày</option><option value={28}>28 ngày</option>
          </select>
        </div>
        <Page range={range} />
      </div>
    </div>
  );
}

function Overview({ range }) {
  const { state } = useStore();
  const [channelId, setChannelId] = useState('all');
  const firstAt = (v) => v.messages[0]?.at || 0;
  const convs = state.conversations.filter((v) => (channelId === 'all' || v.channelId === channelId) && inRange(firstAt(v), range));
  const orders = state.orders.filter((o) => (channelId === 'all' || o.channelId === channelId) && inRange(o.createdAt, range) && o.status !== 'cancelled');
  const custIds = new Set(convs.map((v) => v.customerId));
  const customers = state.customers.filter((u) => custIds.has(u.id));
  const withPhone = customers.filter((u) => u.phone).length;
  const revenue = orders.reduce((s, o) => s + orderTotal(o, state.products), 0);
  const fromAds = convs.filter((v) => v.campaignId).length;

  const kpis = [
    { label: 'Khách mới', value: customers.length, icon: UserPlus, color: '#a855f7' },
    { label: 'SĐT thu được', value: withPhone, icon: Phone, color: '#0ea5e9' },
    { label: 'Tỉ lệ SĐT', value: pct(withPhone / (customers.length || 1)), icon: Percent, color: '#10b981' },
    { label: 'Hội thoại', value: convs.length, icon: MessageSquare, color: '#f97316' },
    { label: 'Từ quảng cáo', value: pct(fromAds / (convs.length || 1)), icon: Users, color: '#0b66ff' },
    { label: 'Đơn hàng', value: orders.length, icon: ShoppingCart, color: '#10b981' },
    { label: 'Doanh thu', value: money(revenue), icon: DollarSign, color: '#d97706' },
    { label: 'Giá trị đơn TB', value: money(revenue / (orders.length || 1)), icon: Wallet, color: '#64748b' },
  ];

  const keys = Array.from({ length: range.days }, (_, i) => range.from + i * 86400000);
  const bucket = (ts) => keys.findIndex((k) => ts >= k && ts < k + 86400000);
  const daily = Object.fromEntries(SERIES.map((s) => [s.key, Array(range.days).fill(0)]));
  convs.forEach((v) => {
    const i = bucket(firstAt(v)); if (i >= 0) daily.conversations[i]++;
    if (state.customers.find((u) => u.id === v.customerId)?.phone && i >= 0) daily.phones[i]++;
  });
  orders.forEach((o) => { const i = bucket(o.createdAt); if (i >= 0) daily.orders[i]++; });
  const hourly = Array(24).fill(0);
  convs.forEach((v) => v.messages.filter((m) => m.from === 'customer').forEach((m) => { hourly[new Date(m.at).getHours()]++; }));

  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <select className="select" style={{ width: 220 }} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          <option value="all">Tất cả kênh</option>
          {state.channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="kpi-grid">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <div className="card kpi" key={label}><div><span className="muted small">{label}</span><b>{value}</b></div><Icon size={22} color={color} /></div>
        ))}
      </div>
      <div className="chart-grid">
        <div className="card card-pad">
          <div className="row between wrap" style={{ marginBottom: 12 }}><h3>Thống kê ngày</h3><Legend items={SERIES} /></div>
          <LineChart series={SERIES.map((s) => ({ ...s, data: daily[s.key] }))} labels={keys.map((k) => `${new Date(k).getDate()}/${new Date(k).getMonth() + 1}`)} />
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 12 }}>Tin nhắn khách theo giờ</h3>
          <BarChart data={hourly} labels={hourly.map((_, i) => `${i}h`)} format={(v) => `${v} tin`} />
          <div className="muted small">AI trả lời 24/7 – kể cả các khung giờ ngoài ca làm việc.</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}><h3>Thống kê theo kênh</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Kênh</th><th>Hội thoại</th><th>Khách có SĐT</th><th>Đơn hàng</th><th>Doanh thu</th></tr></thead>
            <tbody>
              {state.channels.map((c) => {
                const cv = convs.filter((v) => v.channelId === c.id);
                const co = state.orders.filter((o) => o.channelId === c.id && inRange(o.createdAt, range) && o.status !== 'cancelled');
                const phones = cv.filter((v) => state.customers.find((u) => u.id === v.customerId)?.phone).length;
                return (
                  <tr key={c.id}>
                    <td><span className="row"><PlatformIcon platform={c.platform} /> {c.name}</span></td>
                    <td>{cv.length}</td><td>{phones}</td><td>{co.length}</td>
                    <td><b>{money(co.reduce((s, o) => s + orderTotal(o, state.products), 0))}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function AiReport({ range }) {
  const { state } = useStore();
  const u = aiUsage(state, range);
  const costVnd = u.costUsd * USD_VND;
  const kpis = [
    { label: 'Hội thoại AI tự xử lý 100%', value: `${pct(u.automationRate)}`, sub: `${u.automated}/${u.conversations} hội thoại`, icon: Bot, color: '#0b66ff' },
    { label: 'Tin nhắn AI đã trả lời', value: u.aiMessages.toLocaleString('vi-VN'), sub: `Nhân viên: ${u.agentMessages}`, icon: Sparkles, color: '#7c3aed' },
    { label: 'Phản hồi đầu tiên TB', value: `${(u.avgFirstResponse / 1000).toFixed(1)}s`, sub: `AI soạn TB ${(u.avgLatency / 1000).toFixed(1)}s/tin`, icon: Timer, color: '#0ea5e9' },
    { label: 'Chuyển nhân viên', value: pct(u.handoffRate), sub: `${u.handoffs} hội thoại`, icon: UserCog, color: '#f97316' },
    { label: 'SĐT do AI thu thập', value: u.leadsByAi, sub: 'trong hội thoại AI tự xử lý', icon: Phone, color: '#10b981' },
    { label: 'Đơn AI tự chốt', value: u.aiOrders, sub: `${pct(u.aiOrders / (u.totalOrders || 1))} tổng số đơn`, icon: ShoppingCart, color: '#16a34a' },
    { label: 'Doanh thu từ AI', value: money(u.aiRevenue), sub: 'đơn do AI tạo', icon: DollarSign, color: '#d97706' },
    { label: 'Chi phí AI', value: money(costVnd), sub: `$${u.costUsd.toFixed(2)} · ${money(costVnd / (u.aiOrders || 1))}/đơn`, icon: Wallet, color: '#64748b' },
  ];
  const labels = u.keys.map((k) => `${new Date(k).getDate()}/${new Date(k).getMonth() + 1}`);
  const maxMention = u.productMentions[0]?.[1] || 1;

  return (
    <>
      <div className="kpi-grid">
        {kpis.map(({ label, value, sub, icon: Icon, color }) => (
          <div className="card kpi" key={label}>
            <div><span className="muted small">{label}</span><b>{value}</b><span className="muted small">{sub}</span></div>
            <Icon size={22} color={color} />
          </div>
        ))}
      </div>
      <div className="chart-grid">
        <div className="card card-pad">
          <div className="row between wrap" style={{ marginBottom: 12 }}>
            <h3>Tin nhắn AI và nhân viên theo ngày</h3>
            <Legend items={[{ label: 'AI', color: '#7c3aed' }, { label: 'Nhân viên', color: '#f97316' }]} />
          </div>
          <LineChart series={[{ key: 'ai', label: 'AI', color: '#7c3aed', data: u.series.ai }, { key: 'agent', label: 'Nhân viên', color: '#f97316', data: u.series.agent }]} labels={labels} />
          <div className="muted small">Ước tính tiết kiệm: {Math.round(u.aiMessages * 1.5 / 60)} giờ công nhân viên (≈1,5 phút/tin).</div>
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 12 }}>Lý do chuyển nhân viên</h3>
          {u.handoffReasons.length === 0 && <div className="muted small">Chưa có.</div>}
          {u.handoffReasons.map(([reason, n]) => (
            <div key={reason} className="row between small" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}><span>{reason}</span><b>{n}</b></div>
          ))}
          <div className="muted small" style={{ marginTop: 10 }}>Bổ sung các nội dung này vào "Kiến thức shop" để AI tự trả lời được lần sau.</div>
        </div>
      </div>
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Sản phẩm AI gợi ý nhiều nhất</h3>
        <div className="funnel">
          {u.productMentions.slice(0, 8).map(([id, n]) => {
            const p = state.products.find((x) => x.id === id);
            if (!p) return null;
            return (
              <div className="funnel-row" key={id}>
                <span className="small">{productEmoji(p)} {p.name}</span>
                <div className="funnel-bar" style={{ width: `${(n / maxMention) * 100}%`, background: '#7c3aed' }} />
                <span className="small muted">{n} lần {p.stock <= 0 && <b style={{ color: 'var(--red)' }}>· hết hàng</b>}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="muted small" style={{ marginTop: 10 }}>
        <Clock size={12} /> Tin trả lời bởi Claude: {u.claudeMessages}/{u.aiMessages}. Chi phí tính theo token thực tế từ server; tin "AI nội bộ" không tốn phí. Lịch sử có sẵn khi mới cài là dữ liệu mẫu để minh họa báo cáo.
      </div>
    </>
  );
}
