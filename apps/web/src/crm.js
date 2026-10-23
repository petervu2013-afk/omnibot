// CRM model and logic: lead stages, ownership, activities (calls, notes...), follow-up cadence,
// risk detection, staff productivity, funnel and bottlenecks. Pure helpers + draft mutations.
import { uid, orderTotal } from './store.jsx';

const HOUR = 3600000;
const DAY = 24 * HOUR;

export const STAGES = [
  { key: 'new', label: 'Lead mới', color: '#64748b' },
  { key: 'contacting', label: 'Đang liên hệ', color: '#0ea5e9' },
  { key: 'consulting', label: 'Đang tư vấn', color: '#6366f1' },
  { key: 'quoted', label: 'Đã báo giá', color: '#f59e0b' },
  { key: 'won', label: 'Chốt đơn', color: '#16a34a' },
  { key: 'nurturing', label: 'Nuôi dưỡng', color: '#a855f7' },
  { key: 'lost', label: 'Thất bại', color: '#ef4444' },
];
export const STAGE = Object.fromEntries(STAGES.map((s) => [s.key, s]));
export const OPEN_STAGES = ['new', 'contacting', 'consulting', 'quoted'];

export const NURTURE_REASONS = {
  budget: 'Hoãn ngân sách',
  timing: 'Chưa đến thời điểm (đang xây/sửa nhà)',
  compare: 'Đang so sánh nơi khác',
  other: 'Lý do khác',
};
export const LOST_REASONS = ['Giá cao', 'Mua nơi khác', 'Không liên lạc được', 'Không có nhu cầu thật', 'Khác'];

export const ACTIVITY_TYPES = {
  call: { label: 'Cuộc gọi', icon: '📞' },
  message: { label: 'Nhắn tin', icon: '💬' },
  note: { label: 'Ghi chú', icon: '📝' },
  meeting: { label: 'Gặp mặt / showroom', icon: '🤝' },
  quote: { label: 'Gửi báo giá', icon: '📄' },
  care: { label: 'Chăm sóc sau bán', icon: '💝' },
  stage: { label: 'Đổi giai đoạn', icon: '➡️' },
  assign: { label: 'Phân công', icon: '👤' },
};
export const CALL_OUTCOMES = {
  connected: 'Nghe máy – đã trao đổi',
  no_answer: 'Không nghe máy',
  busy: 'Máy bận / hẹn gọi lại',
  wrong: 'Sai số',
};

export { DEFAULT_PROCESS } from './seedCrm.js';

// Complementary categories for cross-sell.
export const CROSS_SELL = {
  'Bàn ăn': ['Ghế', 'Kệ & tủ'],
  Sofa: ['Kệ & tủ', 'Bàn ăn'],
  'Kệ & tủ': ['Sofa', 'Ghế'],
  Ghế: ['Bàn ăn'],
  Giường: ['Kệ & tủ'],
};

export const salesStaff = (state) => state.staff.filter((s) => s.role === 'Sale');

// ---------- queries ----------

export function lastTouchAt(state, cust) {
  const acts = state.activities.filter((a) => a.customerId === cust.id && a.type !== 'assign' && a.type !== 'stage');
  const conv = state.conversations.filter((v) => v.customerId === cust.id).flatMap((v) => v.messages.filter((m) => m.from !== 'customer'));
  return Math.max(0, ...acts.map((a) => a.at), ...conv.map((m) => m.at));
}

export function customerValue(state, cust) {
  const spent = state.orders.filter((o) => o.customerId === cust.id && o.status !== 'cancelled').reduce((s, o) => s + orderTotal(o, state.products), 0);
  const interest = state.products.find((p) => p.id === cust.interestProductId);
  return { spent, expected: cust.expectedValue || interest?.price || 0 };
}

export function openTasks(state, customerId) {
  return state.tasks.filter((t) => !t.done && (!customerId || t.customerId === customerId)).sort((a, b) => a.due - b.due);
}

// Deals that need intervention now, highest risk first.
export function riskList(state, now = Date.now()) {
  const proc = state.process;
  const out = [];
  const tasksByCust = {};
  state.tasks.forEach((t) => { if (!t.done) (tasksByCust[t.customerId] ||= []).push(t); });
  state.customers.forEach((c) => {
    if (!c.phone || !OPEN_STAGES.includes(c.stage)) return;
    const reasons = [];
    let score = 0;
    const { expected } = customerValue(state, c);
    const acts = state.activities.filter((a) => a.customerId === c.id);
    const humanTouch = acts.some((a) => ['call', 'message', 'meeting', 'quote'].includes(a.type));
    const leadAge = now - (c.phoneAt || c.firstSeen);
    if (!humanTouch && leadAge > proc.slaMinutes * 60000) { reasons.push(`Chưa được liên hệ sau ${fmtDur(leadAge)} (SLA ${proc.slaMinutes} phút)`); score += 40; }
    const overdue = (tasksByCust[c.id] || []).filter((t) => t.due < now);
    if (overdue.length) { reasons.push(`${overdue.length} việc bám đuổi quá hạn ${fmtDur(now - overdue[0].due)}`); score += 25; }
    if (!(tasksByCust[c.id] || []).length) { reasons.push('Chưa có lịch liên hệ tiếp theo'); score += 12; }
    const stageAge = now - (c.stageChangedAt || c.firstSeen);
    const limit = (proc.staleDays[c.stage] || 3) * DAY;
    if (stageAge > limit) { reasons.push(`Kẹt ở "${STAGE[c.stage].label}" ${fmtDur(stageAge)}`); score += 20; }
    const misses = acts.filter((a) => a.type === 'call' && a.outcome === 'no_answer').length;
    if (misses >= 3) { reasons.push(`${misses} lần gọi không nghe máy`); score += 15; }
    const conv = state.conversations.find((v) => v.customerId === c.id && v.handoff && !v.botActive);
    if (conv && !conv.messages.some((m) => m.from === 'agent' && m.at > (conv.messages.find((x) => x.from === 'customer')?.at || 0))) { reasons.push('Khách cần nhân viên nhưng chưa ai phản hồi'); score += 30; }
    if (!reasons.length) return;
    if (c.stage === 'quoted') score += 15;
    score += Math.min(30, expected / 1000000); // bigger deals weigh more
    out.push({ customer: c, reasons, score, expected, ownerId: c.ownerId });
  });
  return out.sort((a, b) => b.score - a.score);
}

export function staffStats(state, range) {
  const inR = (ts) => ts >= range.from && ts < range.to;
  const monthDays = 30;
  return state.staff.filter((s) => s.role === 'Sale' || s.role === 'CSKH').map((s) => {
    const acts = state.activities.filter((a) => a.staffId === s.id && inR(a.at));
    const calls = acts.filter((a) => a.type === 'call');
    const leads = state.customers.filter((c) => c.ownerId === s.id && c.phone && inR(c.phoneAt || c.firstSeen));
    const contacted = leads.filter((c) => state.activities.some((a) => a.customerId === c.id && a.staffId === s.id && ['call', 'message', 'meeting'].includes(a.type)));
    const firstContact = contacted.map((c) => {
      const first = state.activities.filter((a) => a.customerId === c.id && ['call', 'message'].includes(a.type)).sort((a, b) => a.at - b.at)[0];
      return first ? first.at - (c.phoneAt || c.firstSeen) : null;
    }).filter((x) => x != null && x >= 0);
    const ownedIds = new Set(state.customers.filter((c) => c.ownerId === s.id).map((c) => c.id));
    const orders = state.orders.filter((o) => ownedIds.has(o.customerId) && inR(o.createdAt) && o.status !== 'cancelled');
    const revenue = orders.reduce((sum, o) => sum + orderTotal(o, state.products), 0);
    const won = leads.filter((c) => c.stage === 'won').length;
    const overdue = state.tasks.filter((t) => !t.done && t.staffId === s.id && t.due < Date.now()).length;
    const target = (s.monthlyTarget || 0) * ((range.to - range.from) / DAY / monthDays);
    return {
      staff: s,
      calls: calls.length,
      connectedCalls: calls.filter((a) => a.outcome === 'connected').length,
      talkMinutes: Math.round(calls.reduce((t, a) => t + (a.duration || 0), 0) / 60),
      careActs: acts.filter((a) => ['care', 'message', 'note', 'meeting', 'quote'].includes(a.type)).length,
      leads: leads.length,
      contactedRate: leads.length ? contacted.length / leads.length : 0,
      avgFirstContact: firstContact.length ? firstContact.reduce((a, b) => a + b, 0) / firstContact.length : null,
      won,
      conversion: leads.length ? won / leads.length : 0,
      orders: orders.length,
      revenue,
      target,
      progress: target ? revenue / target : 0,
      overdue,
    };
  });
}

// Marketing -> Sales -> Care in one funnel.
export function businessFunnel(state, range) {
  const inR = (ts) => ts >= range.from && ts < range.to;
  const m = state.adMetrics.filter((x) => inR(x.date));
  const spend = m.reduce((s, x) => s + x.spend, 0);
  const reach = Math.round(m.reduce((s, x) => s + (x.reach || 0), 0) * 0.65);
  const clicks = m.reduce((s, x) => s + x.clicks, 0);
  const convs = state.conversations.filter((v) => inR(v.messages[0]?.at || 0));
  const custIds = new Set(convs.map((v) => v.customerId));
  const custs = state.customers.filter((c) => custIds.has(c.id));
  const leads = custs.filter((c) => c.phone);
  const contacted = leads.filter((c) => c.stage !== 'new');
  const quoted = leads.filter((c) => ['quoted', 'won'].includes(c.stage) || state.activities.some((a) => a.customerId === c.id && a.type === 'quote'));
  const orders = state.orders.filter((o) => inR(o.createdAt) && o.status !== 'cancelled');
  const revenue = orders.reduce((s, o) => s + orderTotal(o, state.products), 0);
  const buyers = new Set(orders.map((o) => o.customerId));
  const careActs = state.activities.filter((a) => a.type === 'care' && inR(a.at)).length;
  const allBuyers = {};
  state.orders.filter((o) => o.status !== 'cancelled').forEach((o) => { allBuyers[o.customerId] = (allBuyers[o.customerId] || 0) + 1; });
  const repeat = Object.values(allBuyers).filter((n) => n > 1).length;
  return {
    marketing: { spend, reach, clicks },
    steps: [
      { key: 'conv', label: 'Hội thoại', value: convs.length },
      { key: 'lead', label: 'Lead có SĐT', value: leads.length },
      { key: 'contacted', label: 'Đã liên hệ', value: contacted.length },
      { key: 'quoted', label: 'Báo giá', value: quoted.length },
      { key: 'won', label: 'Khách mua', value: buyers.size },
    ],
    revenue, orders: orders.length, careActs, repeat,
    totalBuyers: Object.keys(allBuyers).length,
    nurturing: state.customers.filter((c) => c.stage === 'nurturing').length,
  };
}

// Where deals get stuck: time in stage, stale counts, worst drop-off.
export function bottlenecks(state, now = Date.now()) {
  const proc = state.process;
  const rows = OPEN_STAGES.map((key) => {
    const list = state.customers.filter((c) => c.phone && c.stage === key);
    const ages = list.map((c) => now - (c.stageChangedAt || c.firstSeen));
    const stale = ages.filter((a) => a > (proc.staleDays[key] || 3) * DAY).length;
    return { key, label: STAGE[key].label, count: list.length, avgDays: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length / DAY : 0, stale, value: list.reduce((s, c) => s + customerValue(state, c).expected, 0) };
  });
  const leads = state.customers.filter((c) => c.phone);
  const slaBreaches = leads.filter((c) => {
    const first = state.activities.filter((a) => a.customerId === c.id && ['call', 'message'].includes(a.type)).sort((a, b) => a.at - b.at)[0];
    const start = c.phoneAt || c.firstSeen;
    return first ? first.at - start > proc.slaMinutes * 60000 : now - start > proc.slaMinutes * 60000 && OPEN_STAGES.includes(c.stage);
  }).length;
  const issues = [];
  const worst = [...rows].sort((a, b) => b.stale / (b.count || 1) - a.stale / (a.count || 1))[0];
  if (worst?.stale) issues.push({ level: 'high', text: `${worst.stale}/${worst.count} lead kẹt ở "${worst.label}" quá ${proc.staleDays[worst.key]} ngày`, hint: worst.key === 'quoted' ? 'Gọi chốt lại, gửi ưu đãi có thời hạn.' : worst.key === 'new' || worst.key === 'contacting' ? 'Tăng nhân sự gọi giờ cao điểm hoặc rút ngắn SLA.' : 'Hẹn khách xem showroom, gửi ảnh thực tế.' });
  if (leads.length && slaBreaches / leads.length > 0.2) issues.push({ level: 'high', text: `${Math.round((slaBreaches / leads.length) * 100)}% lead không được gọi trong ${proc.slaMinutes} phút`, hint: 'Lead gọi trong 15 phút đầu thường chốt cao hơn nhiều – bật thông báo, phân lead tự động.' });
  const overdue = state.tasks.filter((t) => !t.done && t.due < now).length;
  if (overdue > 5) issues.push({ level: 'medium', text: `${overdue} việc bám đuổi đang quá hạn`, hint: 'Rà lại khối lượng lead mỗi sale, chia lại lead cho người đang trống.' });
  const handoffs = state.conversations.filter((v) => v.handoff && !v.botActive && v.status !== 'done').length;
  if (handoffs) issues.push({ level: 'medium', text: `${handoffs} hội thoại AI đã chuyển nhưng còn chờ nhân viên`, hint: 'Phân công trực Livechat, bổ sung kiến thức để AI tự xử lý.' });
  return { rows, slaBreaches, issues };
}

// Every touchpoint for one customer, newest first.
export function timeline(state, customerId) {
  const items = [];
  state.conversations.filter((v) => v.customerId === customerId).forEach((v) => {
    const ch = state.channels.find((c) => c.id === v.channelId);
    v.messages.forEach((m) => items.push({ at: m.at, kind: 'message', from: m.from, text: m.text, channel: ch?.name }));
  });
  state.activities.filter((a) => a.customerId === customerId).forEach((a) => items.push({ at: a.at, kind: 'activity', ...a }));
  state.orders.filter((o) => o.customerId === customerId).forEach((o) => items.push({ at: o.createdAt, kind: 'order', order: o }));
  return items.sort((a, b) => b.at - a.at);
}

export function upsellFor(state, cust) {
  const bought = state.orders.filter((o) => o.customerId === cust.id && o.status !== 'cancelled').flatMap((o) => o.items.map((i) => state.products.find((p) => p.id === i.productId))).filter(Boolean);
  if (!bought.length) return [];
  const boughtIds = new Set(bought.map((p) => p.id));
  const cats = new Set(bought.flatMap((p) => CROSS_SELL[p.category] || []));
  const maxPrice = Math.max(...bought.map((p) => p.price));
  return state.products
    .filter((p) => !boughtIds.has(p.id) && p.stock > 0)
    .map((p) => ({ p, type: cats.has(p.category) ? 'cross' : bought.some((b) => b.category === p.category && p.price > b.price) ? 'up' : null }))
    .filter((x) => x.type)
    .sort((a, b) => (a.type === 'cross' ? -1 : 1) - (b.type === 'cross' ? -1 : 1) || Math.abs(a.p.price - maxPrice / 2) - Math.abs(b.p.price - maxPrice / 2))
    .slice(0, 3);
}

export function ltvStats(state, now = Date.now()) {
  const per = {};
  state.orders.filter((o) => o.status !== 'cancelled').forEach((o) => {
    const r = (per[o.customerId] ||= { spent: 0, orders: 0, first: Infinity, last: 0 });
    r.spent += orderTotal(o, state.products); r.orders += 1; r.first = Math.min(r.first, o.createdAt); r.last = Math.max(r.last, o.createdAt);
  });
  const rows = Object.entries(per).map(([id, r]) => ({ customer: state.customers.find((c) => c.id === id), ...r })).filter((r) => r.customer);
  const total = rows.reduce((s, r) => s + r.spent, 0);
  return {
    rows: rows.sort((a, b) => b.spent - a.spent),
    buyers: rows.length,
    repeat: rows.filter((r) => r.orders > 1).length,
    avgLtv: rows.length ? total / rows.length : 0,
    aov: rows.length ? total / rows.reduce((s, r) => s + r.orders, 0) : 0,
    dueCare: rows.filter((r) => !state.activities.some((a) => a.customerId === r.customer.id && a.type === 'care' && a.at > r.last)).length,
    upsellPotential: rows.reduce((s, r) => s + (upsellFor(state, r.customer)[0]?.p.price || 0), 0),
    since: (r) => Math.floor((now - r.last) / DAY),
  };
}

export function fmtDur(ms) {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60000))} phút`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} giờ`;
  return `${Math.round(ms / DAY)} ngày`;
}

// ---------- mutations (call inside store.update) ----------

export function addActivity(d, a) {
  const act = { id: uid(), at: Date.now(), ...a };
  d.activities.push(act);
  return act;
}

export function setStage(d, customerId, stage, { staffId = null, reason = null, nurtureReason = null } = {}) {
  const c = d.customers.find((x) => x.id === customerId);
  if (!c || c.stage === stage) return;
  addActivity(d, { customerId, type: 'stage', staffId, text: `${STAGE[c.stage]?.label || '—'} → ${STAGE[stage].label}${reason ? ` (${reason})` : ''}` });
  c.stage = stage;
  c.stageChangedAt = Date.now();
  if (stage === 'nurturing' || stage === 'lost' || stage === 'won') {
    d.tasks.forEach((t) => { if (t.customerId === customerId && !t.done && t.kind !== 'care') { t.done = true; t.cancelled = true; } });
  }
  if (stage === 'nurturing') {
    c.nurtureReason = nurtureReason || 'other';
    c.nextNurtureAt = Date.now() + d.process.nurtureEveryDays * DAY;
    d.tasks.push({ id: uid(), customerId, staffId: c.ownerId, due: c.nextNurtureAt, type: 'message', kind: 'nurture', title: `Chăm sóc định kỳ – ${NURTURE_REASONS[c.nurtureReason]}`, done: false });
  }
  if (stage === 'lost') c.lostReason = reason;
  if (stage === 'won') {
    d.process.careAfterDays.forEach((n) => d.tasks.push({ id: uid(), customerId, staffId: d.staff.find((s) => s.role === 'CSKH')?.id || c.ownerId, due: Date.now() + n * DAY, type: 'call', kind: 'care', title: n <= 7 ? 'Gọi chăm sóc sau giao hàng (CSAT)' : 'Gọi chăm sóc định kỳ + giới thiệu sản phẩm đi kèm', done: false }));
  }
}

function nextOwner(d) {
  const sales = salesStaff(d);
  if (!sales.length) return null;
  d.crmCursor = ((d.crmCursor || 0) + 1) % sales.length;
  return sales[d.crmCursor].id;
}

// New lead with a phone number: assign owner, start the follow-up cadence with the first call due within SLA.
export function intakeLead(d, customerId) {
  const c = d.customers.find((x) => x.id === customerId);
  if (!c || !c.phone || c.ownerId) return;
  c.ownerId = nextOwner(d);
  c.phoneAt = Date.now();
  c.stage = c.stage && c.stage !== 'new' ? c.stage : 'new';
  c.stageChangedAt = c.stageChangedAt || Date.now();
  addActivity(d, { customerId, type: 'assign', staffId: c.ownerId, text: `Tự động phân cho ${d.staff.find((s) => s.id === c.ownerId)?.name}` });
  d.process.cadence.forEach((step, i) => {
    d.tasks.push({
      id: uid(), customerId, staffId: c.ownerId, type: step.type, kind: 'cadence', step: i,
      due: Date.now() + (i === 0 ? d.process.slaMinutes * 60000 : step.day * DAY), title: step.title, done: false,
    });
  });
}

// Log an interaction; completes the matching task and moves the lead forward.
export function logInteraction(d, { customerId, type, outcome = null, text = '', staffId, duration = 0, taskId = null }) {
  const c = d.customers.find((x) => x.id === customerId);
  addActivity(d, { customerId, type, outcome, text, staffId, duration });
  const task = taskId ? d.tasks.find((t) => t.id === taskId) : d.tasks.filter((t) => t.customerId === customerId && !t.done && t.type === type).sort((a, b) => a.due - b.due)[0];
  if (task) { task.done = true; task.doneAt = Date.now(); task.outcome = outcome; }
  if (!c) return;
  if (type === 'call' && outcome === 'no_answer') {
    const attempts = d.activities.filter((a) => a.customerId === customerId && a.type === 'call').length;
    if (attempts < d.process.maxAttempts) d.tasks.push({ id: uid(), customerId, staffId: c.ownerId, type: 'call', kind: 'retry', due: Date.now() + d.process.retryHours * HOUR, title: `Gọi lại lần ${attempts + 1} (lần trước không nghe máy)`, done: false });
  }
  if (c.stage === 'new' && ['call', 'message', 'meeting'].includes(type)) setStage(d, customerId, 'contacting', { staffId });
  if (c.stage === 'contacting' && (outcome === 'connected' || type === 'meeting')) setStage(d, customerId, 'consulting', { staffId });
  if (type === 'quote' && ['new', 'contacting', 'consulting'].includes(c.stage)) setStage(d, customerId, 'quoted', { staffId });
  if (c.stage === 'nurturing' && type !== 'note') c.nextNurtureAt = Date.now() + d.process.nurtureEveryDays * DAY;
}
