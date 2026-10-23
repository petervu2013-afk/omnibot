// Report sub-pages: customers, orders, staff, conversation tags, interactions, ads, AI credits, warehouse.
import { useState } from 'react';
import { useStore, money, orderTotal } from '../../store.jsx';
import { campaignStats, inRange, div } from '../../analytics.js';
import { staffStats, fmtDur } from '../../crm.js';
import { LineChart, BarChart, Legend } from '../../components/charts.jsx';
import { DataTable, StatCards, fmtDay } from '../../components/kit.jsx';
import { PlatformIcon } from '../../components/ui.jsx';

const DAY = 86400000;
const pct = (v) => `${((v || 0) * 100).toFixed(1)}%`;
const daysOf = (range) => Array.from({ length: range.days }, (_, i) => range.from + i * DAY);
const label = (k) => `${new Date(k).getDate()}/${new Date(k).getMonth() + 1}`;
const firstAt = (v) => v.messages[0]?.at || 0;
const live = (o) => o.status !== 'cancelled';

function PageFilter({ value, onChange }) {
  const { state } = useStore();
  return (
    <select className="select" style={{ width: 220, marginBottom: 14 }} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="all">Tất cả page / kênh</option>
      {state.channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

function Card({ title, right, children }) {
  return <div className="card card-pad" style={{ marginBottom: 16 }}><div className="row between wrap" style={{ marginBottom: 10 }}><h3>{title}</h3>{right}</div>{children}</div>;
}

export function CustomerReport({ range }) {
  const { state } = useStore();
  const [page, setPage] = useState('all');
  const convs = state.conversations.filter((v) => inRange(firstAt(v), range) && (page === 'all' || v.channelId === page));
  const custs = convs.map((v) => state.customers.find((c) => c.id === v.customerId)).filter(Boolean);
  const keys = daysOf(range);
  const perDay = (f) => keys.map((k) => custs.filter((c, i) => firstAt(convs[i]) >= k && firstAt(convs[i]) < k + DAY && f(c)).length);
  const refs = {};
  custs.forEach((c) => {
    const ref = c.campaignId || 'organic';
    const r = (refs[ref] ||= { contact: 0, order: 0, revenue: 0 });
    r.contact += 1;
    const os = state.orders.filter((o) => o.customerId === c.id && live(o) && inRange(o.createdAt, range));
    r.order += os.length ? 1 : 0;
    r.revenue += os.reduce((s, o) => s + orderTotal(o, state.products), 0);
  });
  const refRows = Object.entries(refs).map(([ref, r], i) => ({ id: ref, stt: i + 1, ref, name: state.campaigns.find((c) => c.id === ref)?.name || 'Tự nhiên (không qua quảng cáo)', ...r, cr: div(r.order, r.contact) }));
  const tot = refRows.reduce((a, r) => ({ contact: a.contact + r.contact, order: a.order + r.order, revenue: a.revenue + r.revenue }), { contact: 0, order: 0, revenue: 0 });
  return (
    <>
      <PageFilter value={page} onChange={setPage} />
      <StatCards items={[{ label: 'Khách mới', value: custs.length }, { label: 'Có SĐT', value: custs.filter((c) => c.phone).length }, { label: 'Tỉ lệ SĐT', value: pct(div(custs.filter((c) => c.phone).length, custs.length)) }]} />
      <div className="chart-grid">
        <Card title="Khách mới và SĐT theo ngày" right={<Legend items={[{ label: 'Khách mới', color: '#0b66ff' }, { label: 'SĐT', color: '#10b981' }]} />}>
          <LineChart labels={keys.map(label)} series={[{ key: 'n', label: 'Khách mới', color: '#0b66ff', data: perDay(() => true) }, { key: 'p', label: 'SĐT', color: '#10b981', data: perDay((c) => c.phone) }]} />
        </Card>
        <Card title="Tổng khách hàng / Page">
          {state.channels.map((ch) => {
            const n = convs.filter((v) => v.channelId === ch.id).length;
            return <div key={ch.id} className="bar-row"><span className="row" style={{ gap: 4 }}><PlatformIcon platform={ch.platform} />{ch.name}</span><div className="progress"><i style={{ width: `${div(n, convs.length) * 100}%` }} /></div><span>{n} khách</span></div>;
          })}
        </Card>
      </div>
      <StatCards items={[{ label: 'Tổng contact', value: tot.contact }, { label: 'Tổng order', value: tot.order }, { label: 'CR trung bình', value: pct(div(tot.order, tot.contact)) }, { label: 'Tổng doanh thu', value: money(tot.revenue) }]} />
      <DataTable
        title="Hiệu quả theo Ref"
        rows={refRows.sort((a, b) => b.revenue - a.revenue)}
        exportName="hieu-qua-ref"
        columns={[
          { key: 'stt', label: 'STT' }, { key: 'name', label: 'Ref', render: (r) => <div><b>{r.name}</b><div className="muted small">ref={r.ref}</div></div>, csv: (r) => r.ref },
          { key: 'contact', label: 'Contact', align: 'right' }, { key: 'order', label: 'Order', align: 'right' },
          { key: 'cr', label: 'Tỉ lệ chuyển đổi', align: 'right', render: (r) => pct(r.cr) }, { key: 'revenue', label: 'Doanh thu', align: 'right', render: (r) => money(r.revenue) },
        ]}
        footer={() => <tr><td /><td>Tổng cộng</td><td style={{ textAlign: 'right' }}>{tot.contact}</td><td style={{ textAlign: 'right' }}>{tot.order}</td><td style={{ textAlign: 'right' }}>{pct(div(tot.order, tot.contact))}</td><td style={{ textAlign: 'right' }}>{money(tot.revenue)}</td></tr>}
      />
      <div className="muted small" style={{ marginTop: 8 }}>Ref được gắn tự động từ tham số ref/utm_campaign của link quảng cáo (xem Cài đặt → Ref & Src).</div>
    </>
  );
}

export function OrderReport({ range }) {
  const { state } = useStore();
  const [page, setPage] = useState('all');
  const orders = state.orders.filter((o) => inRange(o.createdAt, range) && (page === 'all' || o.channelId === page));
  const returned = new Set(state.waybills.filter((w) => w.status === 'returned' || w.status === 'returning').map((w) => w.orderId));
  const stat = (list) => {
    const valid = list.filter(live);
    const success = list.filter((o) => o.status === 'done');
    const paid = list.filter((o) => o.payment === 'paid' && live(o));
    return { valid: valid.length, success: success.length, paid: paid.length, cancelled: list.filter((o) => o.status === 'cancelled').length, returned: list.filter((o) => returned.has(o.id)).length, collected: paid.reduce((s, o) => s + orderTotal(o, state.products), 0), revenue: valid.reduce((s, o) => s + orderTotal(o, state.products), 0) };
  };
  const t = stat(orders);
  const keys = daysOf(range);
  const rows = state.channels.map((c, i) => ({ id: c.id, stt: i + 1, name: c.name, platform: c.platform, ...stat(orders.filter((o) => o.channelId === c.id)) })).filter((r) => r.valid + r.cancelled);
  return (
    <>
      <PageFilter value={page} onChange={setPage} />
      <StatCards items={[{ label: 'Hợp lệ', value: t.valid }, { label: 'Thành công', value: t.success, cls: 'metric-good' }, { label: 'Đã thanh toán', value: t.paid }, { label: 'Hủy', value: t.cancelled, cls: t.cancelled ? 'metric-bad' : '' }, { label: 'Hoàn', value: t.returned }, { label: 'Doanh thu', value: money(t.revenue) }]} />
      <Card title="Biểu đồ đơn hàng" right={<Legend items={[{ label: 'Hợp lệ', color: '#0b66ff' }, { label: 'Thành công', color: '#16a34a' }, { label: 'Hủy', color: '#ef4444' }]} />}>
        <LineChart labels={keys.map(label)} series={[
          { key: 'v', label: 'Hợp lệ', color: '#0b66ff', data: keys.map((k) => orders.filter((o) => live(o) && o.createdAt >= k && o.createdAt < k + DAY).length) },
          { key: 's', label: 'Thành công', color: '#16a34a', data: keys.map((k) => orders.filter((o) => o.status === 'done' && o.createdAt >= k && o.createdAt < k + DAY).length) },
          { key: 'c', label: 'Hủy', color: '#ef4444', data: keys.map((k) => orders.filter((o) => o.status === 'cancelled' && o.createdAt >= k && o.createdAt < k + DAY).length) },
        ]} />
      </Card>
      <DataTable
        title="Đơn hàng theo page"
        rows={rows.sort((a, b) => b.collected - a.collected)}
        exportName="don-hang-theo-page"
        columns={[
          { key: 'stt', label: 'STT' }, { key: 'name', label: 'Tên page', render: (r) => <span className="row" style={{ gap: 4 }}><PlatformIcon platform={r.platform} /> {r.name}</span>, csv: (r) => r.name },
          { key: 'valid', label: 'Hợp lệ', align: 'right' }, { key: 'success', label: 'Thành công', align: 'right' }, { key: 'sr1', label: 'SR1', align: 'right', render: (r) => pct(div(r.success, r.valid)) },
          { key: 'returned', label: 'Hoàn', align: 'right' }, { key: 'cancelled', label: 'Hủy', align: 'right' }, { key: 'dr', label: 'DR', align: 'right', render: (r) => pct(div(r.cancelled, r.valid + r.cancelled)) },
          { key: 'paid', label: 'Đã TT', align: 'right' }, { key: 'sr2', label: 'SR2', align: 'right', render: (r) => pct(div(r.paid, r.valid)) },
          { key: 'collected', label: 'Đã thu', align: 'right', render: (r) => money(r.collected) },
        ]}
      />
      <div className="muted small" style={{ marginTop: 8 }}>SR1 = thành công ÷ hợp lệ · DR = hủy ÷ tổng · SR2 = đã thanh toán ÷ hợp lệ.</div>
    </>
  );
}

export function StaffReport({ range }) {
  const { state } = useStore();
  const stats = staffStats(state, range).filter((s) => s.staff.role === 'Sale');
  const fastest = [...stats].filter((s) => s.avgFirstContact != null).sort((a, b) => a.avgFirstContact - b.avgFirstContact).slice(0, 5);
  const max = Math.max(1, ...stats.map((s) => s.leads));
  return (
    <>
      <div className="chart-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card title="Top 5 nhân viên phản hồi nhanh nhất">
          {fastest.map((s, i) => <div key={s.staff.id} className="bar-row"><span>{i + 1}. {s.staff.name}</span><div className="progress"><i style={{ width: `${Math.max(5, 100 - (s.avgFirstContact / (fastest.at(-1).avgFirstContact || 1)) * 80)}%`, background: 'var(--green)' }} /></div><span>{fmtDur(s.avgFirstContact)}</span></div>)}
        </Card>
        <Card title="Tỉ lệ phản hồi theo nhân viên">
          {stats.map((s) => <div key={s.staff.id} className="bar-row"><span>{s.staff.name}</span><div className="progress"><i style={{ width: `${s.contactedRate * 100}%` }} /></div><span>{pct(s.contactedRate)} ({s.leads}/{max})</span></div>)}
        </Card>
      </div>
      <DataTable
        title="Danh sách nhân viên"
        rows={stats.map((s, i) => ({ id: s.staff.id, stt: i + 1, ...s }))}
        exportName="bao-cao-nhan-vien"
        columns={[
          { key: 'stt', label: 'STT' }, { key: 'name', label: 'Họ tên', render: (r) => <b>{r.staff.name}</b>, csv: (r) => r.staff.name },
          { key: 'comments', label: 'Bình luận', align: 'right', render: () => 0 },
          { key: 'leads', label: 'Tin nhắn (được giao)', align: 'right' },
          { key: 'responded', label: 'Phản hồi', align: 'right', render: (r) => Math.round(r.leads * r.contactedRate) },
          { key: 'time', label: 'Thời gian TB', align: 'right', render: (r) => (r.avgFirstContact != null ? fmtDur(r.avgFirstContact) : '—') },
          { key: 'calls', label: 'Cuộc gọi', align: 'right' }, { key: 'won', label: 'Chốt', align: 'right' }, { key: 'revenue', label: 'Doanh số', align: 'right', render: (r) => money(r.revenue) },
        ]}
      />
      <div className="muted small" style={{ marginTop: 8 }}>Tin nhắn: số hội thoại được giao · Phản hồi: số hội thoại đã liên hệ · Thời gian: bình quân bao lâu thì khách được phản hồi lần đầu.</div>
    </>
  );
}

export function TagReport({ range }) {
  const { state } = useStore();
  const custs = state.customers.filter((c) => inRange(c.firstSeen, range) || c.tags.length);
  const counts = {};
  custs.forEach((c) => c.tags.forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([tag, n], i) => ({ id: tag, stt: i + 1, tag, added: n, removed: 0, total: n }));
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <>
      <div className="chart-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card title="Top 5 thẻ được dùng nhiều nhất">
          {rows.slice(0, 5).map((r) => <div key={r.tag} className="bar-row"><span className="tag">{r.tag}</span><div className="progress"><i style={{ width: `${div(r.total, rows[0]?.total) * 100}%`, background: '#6366f1' }} /></div><span>{r.total}</span></div>)}
        </Card>
        <Card title="Tỉ lệ sử dụng thẻ" right={<span className="muted small">Tổng số {total}</span>}>
          <BarChart data={rows.slice(0, 8).map((r) => r.total)} labels={rows.slice(0, 8).map((r) => r.tag.slice(0, 8))} labelEvery={1} color="#6366f1" format={(v) => `${v} khách`} />
        </Card>
      </div>
      <DataTable
        title="Thẻ hội thoại theo thời gian (+ gắn, − hủy)"
        rows={rows}
        exportName="the-hoi-thoai"
        columns={[{ key: 'stt', label: 'STT' }, { key: 'tag', label: 'Thẻ hội thoại', render: (r) => <span className="tag">{r.tag}</span>, csv: (r) => r.tag }, { key: 'added', label: 'Gắn', align: 'right' }, { key: 'removed', label: 'Hủy', align: 'right' }, { key: 'total', label: 'Tổng cộng', align: 'right' }]}
      />
    </>
  );
}

export function InteractionReport({ range }) {
  const { state } = useStore();
  const active = state.conversations.filter((v) => v.messages.some((m) => m.from === 'customer' && inRange(m.at, range)));
  const custOf = (v) => state.customers.find((c) => c.id === v.customerId);
  const isNew = (c) => c && inRange(c.firstSeen, range);
  const ordersBy = (pred) => state.orders.filter((o) => live(o) && inRange(o.createdAt, range) && pred(state.customers.find((c) => c.id === o.customerId)));
  const newC = active.filter((v) => isNew(custOf(v))).length;
  const oldC = active.length - newC;
  const newO = ordersBy((c) => isNew(c)).length;
  const oldO = ordersBy((c) => c && !isNew(c)).length;
  const row = (list, ordersList) => {
    const nc = list.filter((v) => isNew(custOf(v))).length;
    const oc = list.length - nc;
    const no = ordersList.filter((o) => isNew(state.customers.find((c) => c.id === o.customerId))).length;
    const oo = ordersList.length - no;
    return { oc, nc, tc: list.length, oo, sr1: div(oo, oc), no, sr2: div(no, nc), to: ordersList.length, sr: div(ordersList.length, list.length) };
  };
  const cols = (first) => [first, { key: 'oc', label: 'Khách cũ', align: 'right' }, { key: 'nc', label: 'Khách mới', align: 'right' }, { key: 'tc', label: 'Tổng KH', align: 'right' }, { key: 'oo', label: 'Đơn khách cũ', align: 'right' }, { key: 'sr1', label: 'SR1', align: 'right', render: (r) => pct(r.sr1) }, { key: 'no', label: 'Đơn khách mới', align: 'right' }, { key: 'sr2', label: 'SR2', align: 'right', render: (r) => pct(r.sr2) }, { key: 'to', label: 'Tổng đơn', align: 'right' }, { key: 'sr', label: 'SR', align: 'right', render: (r) => pct(r.sr) }];
  const byStaff = state.staff.filter((s) => s.role === 'Sale').map((s, i) => {
    const list = active.filter((v) => custOf(v)?.ownerId === s.id);
    return { id: s.id, stt: i + 1, name: s.name, ...row(list, state.orders.filter((o) => live(o) && inRange(o.createdAt, range) && state.customers.find((c) => c.id === o.customerId)?.ownerId === s.id)) };
  });
  const byDay = daysOf(range).reverse().map((k) => {
    const list = active.filter((v) => v.messages.some((m) => m.from === 'customer' && m.at >= k && m.at < k + DAY));
    return { id: k, day: label(k), ...row(list, state.orders.filter((o) => live(o) && o.createdAt >= k && o.createdAt < k + DAY)) };
  });
  return (
    <>
      <StatCards items={[{ label: 'Khách hàng tương tác', value: active.length, sub: `Khách mới ${newC} · Khách cũ ${oldC}` }, { label: 'Đơn hàng', value: newO + oldO, sub: `Khách mới ${newO} · Khách cũ ${oldO}` }]} />
      <div style={{ marginBottom: 16 }}><DataTable title="Tương tác bằng tin nhắn theo nhân viên" rows={byStaff} exportName="tuong-tac-nhan-vien" columns={cols({ key: 'name', label: 'Họ tên', render: (r) => <b>{r.name}</b>, csv: (r) => r.name })} /></div>
      <DataTable title="Tương tác bằng tin nhắn theo ngày" rows={byDay} exportName="tuong-tac-ngay" columns={cols({ key: 'day', label: 'Ngày' })} />
    </>
  );
}

export function AdsReport({ range }) {
  const { state } = useStore();
  const camps = campaignStats(state, range);
  const keys = daysOf(range);
  const day = (k) => {
    const spend = state.adMetrics.filter((m) => m.date >= k && m.date < k + DAY).reduce((s, m) => s + m.spend, 0);
    const convs = state.conversations.filter((v) => v.campaignId && firstAt(v) >= k && firstAt(v) < k + DAY);
    const leads = convs.filter((v) => state.customers.find((c) => c.id === v.customerId)?.phone).length;
    const os = state.orders.filter((o) => o.campaignId && live(o) && o.createdAt >= k && o.createdAt < k + DAY);
    const revenue = os.reduce((s, o) => s + orderTotal(o, state.products), 0);
    return { id: k, day: label(k), spend, msgs: convs.length, leads, pl: div(leads, convs.length), orders: os.length, sr: div(os.length, leads), revenue, roas: div(revenue, spend), cpl: div(spend, leads), cpa: div(spend, os.length) };
  };
  const days = keys.map(day);
  const t = days.reduce((a, d) => ({ spend: a.spend + d.spend, msgs: a.msgs + d.msgs, leads: a.leads + d.leads, orders: a.orders + d.orders, revenue: a.revenue + d.revenue }), { spend: 0, msgs: 0, leads: 0, orders: 0, revenue: 0 });
  const cols = (first) => [first, { key: 'spend', label: 'Ngân sách', align: 'right', render: (r) => money(r.spend) }, { key: 'msgs', label: 'Tin nhắn', align: 'right' }, { key: 'leads', label: 'SĐT', align: 'right' }, { key: 'pl', label: '%SĐT', align: 'right', render: (r) => pct(r.pl) }, { key: 'orders', label: 'Đơn hàng', align: 'right' }, { key: 'sr', label: 'SR', align: 'right', render: (r) => pct(r.sr) }, { key: 'revenue', label: 'Doanh thu', align: 'right', render: (r) => money(r.revenue) }, { key: 'roas', label: 'ROAS', align: 'right', render: (r) => r.roas.toFixed(2) }, { key: 'cpl', label: 'CPL', align: 'right', render: (r) => money(r.cpl) }, { key: 'cpa', label: 'CPA', align: 'right', render: (r) => money(r.cpa) }];
  return (
    <>
      <StatCards items={[{ label: 'Chi tiêu', value: money(t.spend) }, { label: 'Tin nhắn', value: t.msgs }, { label: 'SĐT', value: t.leads }, { label: 'Đơn hàng', value: t.orders }, { label: 'Doanh thu', value: money(t.revenue) }, { label: 'ROAS', value: div(t.revenue, t.spend).toFixed(2) }]} />
      <div className="chart-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card title="Chi phí quảng cáo theo ngày"><BarChart data={days.map((d) => d.spend)} labels={days.map((d) => d.day)} format={money} color="#ef4444" /></Card>
        <Card title="Kết quả theo ngày" right={<Legend items={[{ label: 'Tin nhắn', color: '#0b66ff' }, { label: 'SĐT', color: '#10b981' }, { label: 'Đơn', color: '#f97316' }]} />}>
          <LineChart labels={days.map((d) => d.day)} series={[{ key: 'm', label: 'Tin nhắn', color: '#0b66ff', data: days.map((d) => d.msgs) }, { key: 'l', label: 'SĐT', color: '#10b981', data: days.map((d) => d.leads) }, { key: 'o', label: 'Đơn', color: '#f97316', data: days.map((d) => d.orders) }]} />
        </Card>
      </div>
      <div style={{ marginBottom: 16 }}><DataTable title="Kết quả theo ngày" rows={[...days].reverse()} exportName="qc-theo-ngay" columns={cols({ key: 'day', label: 'Ngày' })} /></div>
      <DataTable title="Kết quả theo ads" rows={camps.map((c) => ({ id: c.id, name: c.name, spend: c.spend, msgs: c.conversations, leads: c.leads, pl: c.leadRate, orders: c.orders, sr: c.closeRate, revenue: c.revenue, roas: c.roas, cpl: c.costPerLead, cpa: c.cpa }))} exportName="qc-theo-ads" columns={cols({ key: 'name', label: 'Ads ID / chiến dịch', render: (r) => <div><b>{r.name}</b><div className="muted small">{r.id}</div></div>, csv: (r) => r.name })} />
      <div className="muted small" style={{ marginTop: 8 }}>Đơn hàng: không bao gồm đơn xóa; đơn hủy có doanh thu = 0.</div>
    </>
  );
}

export function CreditReport({ range }) {
  const { state } = useStore();
  // 1 credit = 0,001 USD chi phí AI thực tế; tin AI nội bộ không tốn credit.
  const msgs = state.conversations.flatMap((v) => v.messages).filter((m) => m.from === 'ai' && inRange(m.at, range));
  const creditOf = (m) => (m.meta?.engine === 'local' ? 0 : Math.max(1, Math.round((m.meta?.costUsd || 0) * 1000)));
  const used = msgs.reduce((s, m) => s + creditOf(m), 0);
  const quota = state.settings.plan.quotas.find(([k]) => k.startsWith('Credits'))?.[1] || 0;
  const keys = daysOf(range);
  const perDay = keys.map((k) => msgs.filter((m) => m.at >= k && m.at < k + DAY).reduce((s, m) => s + creditOf(m), 0));
  return (
    <>
      <StatCards items={[{ label: 'Tổng Credits đã dùng', value: used.toLocaleString('vi-VN') }, { label: 'Số lượng yêu cầu AI', value: msgs.length }, { label: 'Credits trung bình / yêu cầu', value: div(used, msgs.length).toFixed(1) }, { label: 'Hạn mức tháng còn lại', value: (quota - used).toLocaleString('vi-VN'), sub: `/ ${quota.toLocaleString('vi-VN')}` }]} />
      <Card title="Lưu lượng sử dụng theo ngày"><BarChart data={perDay} labels={keys.map(label)} color="#7c3aed" format={(v) => `${v} credits`} /></Card>
      <div className="muted small">1 credit = 0,001 USD chi phí AI thực tế (theo token Claude). Tin trả lời bằng AI nội bộ không tính credit.</div>
    </>
  );
}

export function StockReport({ range }) {
  const { state } = useStore();
  const [wh, setWh] = useState('all');
  const docs = state.stockDocs.filter((d) => d.status === 'done' && inRange(d.createdAt, range) && (wh === 'all' || d.warehouseId === wh || d.toWarehouseId === wh));
  const qty = (d) => d.items.reduce((s, it) => s + (it.qty || 0), 0);
  const keys = daysOf(range);
  const sumKind = (kind, k) => docs.filter((d) => d.kind === kind && d.createdAt >= k && d.createdAt < k + DAY).reduce((s, d) => s + qty(d), 0);
  const recent = (kind) => docs.filter((d) => d.kind === kind).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const List = ({ kind }) => (
    <table className="table"><thead><tr><th>Phiếu</th><th>Phương thức</th><th>Số lượng</th><th>Ngày</th></tr></thead>
      <tbody>{recent(kind).map((d) => <tr key={d.id}><td>{d.code}</td><td className="small">{d.orderId ? `Bán hàng #${d.orderId}` : d.note}</td><td>{qty(d)}</td><td>{fmtDay(d.createdAt)}</td></tr>)}</tbody></table>
  );
  return (
    <>
      <select className="select" style={{ width: 220, marginBottom: 14 }} value={wh} onChange={(e) => setWh(e.target.value)}><option value="all">Tất cả kho</option>{state.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
      <StatCards items={[{ label: 'Nhập kho', value: docs.filter((d) => d.kind === 'import').reduce((s, d) => s + qty(d), 0) }, { label: 'Xuất kho', value: docs.filter((d) => d.kind === 'export').reduce((s, d) => s + qty(d), 0) }, { label: 'Chuyển kho', value: docs.filter((d) => d.kind === 'transfer').length }, { label: 'Tổng tồn hiện tại', value: state.products.reduce((s, p) => s + p.stock, 0) }]} />
      <Card title="Biểu đồ xuất / nhập kho" right={<Legend items={[{ label: 'Nhập', color: '#16a34a' }, { label: 'Xuất', color: '#ef4444' }]} />}>
        <LineChart labels={keys.map(label)} series={[{ key: 'i', label: 'Nhập', color: '#16a34a', data: keys.map((k) => sumKind('import', k)) }, { key: 'e', label: 'Xuất', color: '#ef4444', data: keys.map((k) => sumKind('export', k)) }]} />
      </Card>
      <div className="chart-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card title="Xuất gần nhất" right={<a href="#/orders/export" className="small">Xem tất cả</a>}><List kind="export" /></Card>
        <Card title="Nhập gần nhất" right={<a href="#/orders/import" className="small">Thêm mới</a>}><List kind="import" /></Card>
      </div>
    </>
  );
}

