// Derived metrics for campaign, AI-usage and audience reports. All functions are pure over the store state.
import { orderTotal, startOfDay } from './store.jsx';

const DAY = 86400000;
export const inRange = (ts, range) => ts >= range.from && ts < range.to;
export const lastDays = (n) => { const to = startOfDay(Date.now()) + DAY; return { from: to - n * DAY, to, days: n }; };
export const div = (a, b) => (b ? a / b : 0);
export const REACH_DEDUPE = 0.65; // share of summed daily reach that is unique people over the period (estimate)

// Grade a metric against its KPI target: 'good' | 'bad' | null (no target).
export function kpiStatus(key, value, kpi) {
  if (!value) return null;
  const lowerIsBetter = ['cpm', 'costPerConv', 'costPerLead', 'cpa'];
  if (key === 'frequency') return value <= kpi.frequencyMax ? 'good' : 'bad';
  if (kpi[key] == null) return null;
  return lowerIsBetter.includes(key) ? (value <= kpi[key] ? 'good' : 'bad') : value >= kpi[key] ? 'good' : 'bad';
}

const firstAt = (conv) => conv.messages[0]?.at || 0;
const liveOrder = (o) => o.status !== 'cancelled';

export function campaignStats(state, range) {
  const custById = Object.fromEntries(state.customers.map((u) => [u.id, u]));
  return state.campaigns.map((c) => {
    const m = state.adMetrics.filter((x) => x.campaignId === c.id && inRange(x.date, range));
    const spend = m.reduce((s, x) => s + x.spend, 0);
    const impressions = m.reduce((s, x) => s + x.impressions, 0);
    const clicks = m.reduce((s, x) => s + x.clicks, 0);
    const platformConversions = m.reduce((s, x) => s + (x.platformConversions || 0), 0);
    // Daily reach overlaps across days; without the platform's deduplicated period reach we estimate it.
    const dailyReach = m.reduce((s, x) => s + (x.reach || Math.round(x.impressions / 1.3)), 0);
    const reach = m.length > 1 ? Math.round(dailyReach * REACH_DEDUPE) : dailyReach;
    const convs = state.conversations.filter((v) => v.campaignId === c.id && inRange(firstAt(v), range));
    const leads = convs.filter((v) => custById[v.customerId]?.phone).length;
    const orders = state.orders.filter((o) => o.campaignId === c.id && inRange(o.createdAt, range) && liveOrder(o));
    const revenue = orders.reduce((s, o) => s + orderTotal(o, state.products), 0);
    const automated = convs.filter((v) => !v.messages.some((msg) => msg.from === 'agent')).length;
    return {
      ...c,
      spend, impressions, clicks, platformConversions, reach,
      conversations: convs.length, leads, orders: orders.length, revenue,
      frequency: div(impressions, reach), costPerReach: div(spend, reach) * 1000,
      ctr: div(clicks, impressions), cpc: div(spend, clicks), cpm: div(spend, impressions) * 1000,
      costPerConv: div(spend, convs.length), costPerLead: div(spend, leads), cpa: div(spend, orders.length),
      roas: div(revenue, spend), leadRate: div(leads, convs.length), closeRate: div(orders.length, leads),
      trackingGap: platformConversions ? 1 - div(convs.length, platformConversions) : 0,
      automationRate: div(automated, convs.length),
    };
  });
}

export function sumStats(rows) {
  const t = rows.reduce((a, r) => {
    ['spend', 'impressions', 'reach', 'clicks', 'platformConversions', 'conversations', 'leads', 'orders', 'revenue'].forEach((k) => { a[k] = (a[k] || 0) + (r[k] || 0); });
    return a;
  }, {});
  return {
    ...t,
    frequency: div(t.impressions, t.reach), costPerReach: div(t.spend, t.reach) * 1000,
    ctr: div(t.clicks, t.impressions), cpc: div(t.spend, t.clicks), cpm: div(t.spend, t.impressions) * 1000,
    costPerConv: div(t.spend, t.conversations), costPerLead: div(t.spend, t.leads), cpa: div(t.spend, t.orders),
    roas: div(t.revenue, t.spend), leadRate: div(t.leads, t.conversations), closeRate: div(t.orders, t.leads),
  };
}

export function dailySpendRevenue(state, range, campaignIds) {
  const keys = Array.from({ length: range.days }, (_, i) => range.from + i * DAY);
  const ids = new Set(campaignIds);
  const spend = keys.map((k) => state.adMetrics.filter((x) => ids.has(x.campaignId) && x.date >= k && x.date < k + DAY).reduce((s, x) => s + x.spend, 0));
  const revenue = keys.map((k) => state.orders.filter((o) => ids.has(o.campaignId) && liveOrder(o) && o.createdAt >= k && o.createdAt < k + DAY).reduce((s, o) => s + orderTotal(o, state.products), 0));
  return { keys, spend, revenue };
}

// Rule-based optimisation hints, used when the AI server is unavailable (and as a baseline next to AI insights).
export function ruleInsights(rows, total) {
  const out = [];
  const avgCpa = total.cpa;
  rows.filter((r) => r.spend > 0).forEach((r) => {
    if (r.orders === 0 && r.spend > 1500000) out.push({ campaign_id: r.id, priority: 'high', action: 'Tạm dừng hoặc làm lại nội dung quảng cáo', reason: `Đã chi ${fmt(r.spend)} nhưng chưa ra đơn nào.` });
    else if (r.roas > 0 && r.roas < 1.5) out.push({ campaign_id: r.id, priority: 'high', action: 'Giảm 30-50% ngân sách, thu hẹp tệp hoặc đổi sản phẩm chủ lực', reason: `ROAS chỉ ${r.roas.toFixed(2)} (mỗi 1đ quảng cáo thu về ${r.roas.toFixed(2)}đ doanh thu), CPA ${fmt(r.cpa)} cao hơn trung bình ${fmt(avgCpa)}.` });
    else if (r.roas >= 4 && r.orders >= 3) out.push({ campaign_id: r.id, priority: 'medium', action: 'Tăng ngân sách 20-30% mỗi 2-3 ngày', reason: `ROAS ${r.roas.toFixed(1)}, CPA ${fmt(r.cpa)} – đang có lãi tốt, còn dư địa mở rộng.` });
    if (r.conversations >= 10 && r.leadRate < 0.3) out.push({ campaign_id: r.id, priority: 'medium', action: 'Cải thiện tỉ lệ xin SĐT: đổi ưu đãi trong lời chào AI, nhắm lại tệp', reason: `Chỉ ${(r.leadRate * 100).toFixed(0)}% hội thoại để lại SĐT – khách tò mò nhiều nhưng ít ý định mua.` });
    if (r.impressions > 50000 && r.ctr < 0.01) out.push({ campaign_id: r.id, priority: 'low', action: 'Thay creative (ảnh/video, tiêu đề)', reason: `CTR ${(r.ctr * 100).toFixed(2)}% dưới 1%, chi phí mỗi click ${fmt(r.cpc)}.` });
    if (r.platformConversions >= 10 && r.trackingGap > 0.4) out.push({ campaign_id: r.id, priority: 'low', action: 'Kiểm tra lại đo lường: nền tảng báo nhiều chuyển đổi hơn số hội thoại thật', reason: `Nền tảng báo ${r.platformConversions} chuyển đổi, CRM ghi nhận ${r.conversations} hội thoại (lệch ${(r.trackingGap * 100).toFixed(0)}%).` });
    if (r.leads >= 8 && r.closeRate < 0.2) out.push({ campaign_id: r.id, priority: 'medium', action: 'Gọi lại khách có SĐT chưa mua, chạy retarget tệp này', reason: `${r.leads} khách để lại SĐT nhưng chỉ ${r.orders} đơn (${(r.closeRate * 100).toFixed(0)}%).` });
  });
  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.priority] - order[b.priority]);
}
const fmt = (n) => Math.round(n || 0).toLocaleString('vi-VN') + 'đ';

export function aiUsage(state, range) {
  const convs = state.conversations.filter((v) => inRange(firstAt(v), range));
  const custById = Object.fromEntries(state.customers.map((u) => [u.id, u]));
  const aiMsgs = convs.flatMap((v) => v.messages.filter((m) => m.from === 'ai'));
  const agentMsgs = convs.flatMap((v) => v.messages.filter((m) => m.from === 'agent'));
  const automated = convs.filter((v) => v.messages.some((m) => m.from === 'ai') && !v.messages.some((m) => m.from === 'agent'));
  const handoffs = convs.filter((v) => v.handoff);
  const ordersAll = state.orders.filter((o) => inRange(o.createdAt, range) && liveOrder(o));
  const aiOrders = ordersAll.filter((o) => o.createdBy === 'ai');
  const firstResponse = convs.map((v) => {
    const c = v.messages.find((m) => m.from === 'customer');
    const r = v.messages.find((m) => m.from !== 'customer' && m.at >= (c?.at || 0));
    return c && r ? r.at - c.at : null;
  }).filter((x) => x != null);
  const reasons = {};
  handoffs.forEach((v) => { const k = v.handoffReason || 'Khác'; reasons[k] = (reasons[k] || 0) + 1; });
  const mentions = {};
  aiMsgs.forEach((m) => m.productIds?.forEach((id) => { mentions[id] = (mentions[id] || 0) + 1; }));

  const keys = Array.from({ length: range.days }, (_, i) => range.from + i * DAY);
  const series = {
    ai: keys.map((k) => aiMsgs.filter((m) => m.at >= k && m.at < k + DAY).length),
    agent: keys.map((k) => agentMsgs.filter((m) => m.at >= k && m.at < k + DAY).length),
  };

  return {
    conversations: convs.length,
    automated: automated.length,
    automationRate: div(automated.length, convs.length),
    aiMessages: aiMsgs.length,
    agentMessages: agentMsgs.length,
    claudeMessages: aiMsgs.filter((m) => m.meta?.engine === 'claude').length,
    avgLatency: div(aiMsgs.reduce((s, m) => s + (m.meta?.latencyMs || 0), 0), aiMsgs.filter((m) => m.meta?.latencyMs).length),
    avgFirstResponse: div(firstResponse.reduce((a, b) => a + b, 0), firstResponse.length),
    costUsd: aiMsgs.reduce((s, m) => s + (m.meta?.costUsd || 0), 0),
    handoffs: handoffs.length,
    handoffRate: div(handoffs.length, convs.length),
    handoffReasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]),
    leadsByAi: automated.filter((v) => custById[v.customerId]?.phone).length,
    aiOrders: aiOrders.length,
    aiRevenue: aiOrders.reduce((s, o) => s + orderTotal(o, state.products), 0),
    totalOrders: ordersAll.length,
    productMentions: Object.entries(mentions).sort((a, b) => b[1] - a[1]),
    series, keys,
  };
}

// ---------- audiences ----------

export const SEGMENTS = {
  buyers: { label: 'Đã mua hàng', desc: 'Loại trừ khỏi quảng cáo tìm khách mới; làm nguồn Lookalike/Similar audience.' },
  leads: { label: 'Có SĐT nhưng chưa mua', desc: 'Retarget với ưu đãi chốt đơn, gọi lại.' },
  vip: { label: 'Khách VIP (≥ 10 triệu)', desc: 'Nguồn Lookalike chất lượng cao nhất, upsell sản phẩm cao cấp.' },
  all: { label: 'Tất cả khách có SĐT', desc: 'Tệp tổng để loại trừ hoặc làm Lookalike rộng.' },
};

export function segmentCustomers(state, segment, campaignId) {
  const spent = {};
  state.orders.filter(liveOrder).forEach((o) => { spent[o.customerId] = (spent[o.customerId] || 0) + orderTotal(o, state.products); });
  return state.customers.filter((u) => {
    if (!u.phone) return false;
    if (campaignId && u.campaignId !== campaignId) return false;
    if (segment === 'buyers') return spent[u.id] > 0;
    if (segment === 'leads') return !spent[u.id];
    if (segment === 'vip') return spent[u.id] >= 10000000;
    return true;
  }).map((u) => ({ ...u, spent: spent[u.id] || 0 }));
}

export function e164(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('84')) return '+' + d;
  if (d.startsWith('0')) return '+84' + d.slice(1);
  return d ? '+' + d : '';
}

export function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  return { ln: parts[0] || '', fn: parts.slice(1).join(' ') };
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
