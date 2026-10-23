// AI auto-reply: calls the OmniBot server (Claude), falls back to a local catalog-matching engine
// so conversations stay fully automated even when the AI server is unavailable.
import { uid, nextOrderId } from './store.jsx';
import { intakeLead, setStage } from './crm.js';
import { exportForOrder } from './ops.js';

let health = null;
export async function aiHealth(force = false) {
  if (health && !force) return health;
  try {
    const r = await fetch('/api/health');
    health = r.ok ? await r.json() : { ok: false, ai: false };
  } catch {
    health = { ok: false, ai: false };
  }
  return health;
}

const normalize = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const PHONE_RE = /(?:\+84|0)\d{9}\b/;
const STOP = new Set(['shop', 'cho', 'minh', 'toi', 'em', 'anh', 'chi', 'ban', 'gia', 'bao', 'nhieu', 'con', 'khong', 'hang', 'xem', 'mau', 'nao', 'the', 'voi', 'can', 'muon', 'oi', 'a', 'nhe', 'co', 'ko', 'lay', 'mua', 'dat', 'go']);
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

function scoreProducts(text, products) {
  const words = normalize(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w));
  if (!words.length) return [];
  const tokens = (s) => new Set(normalize(s).split(/[^a-z0-9]+/).filter(Boolean));
  return products
    .map((p) => {
      const name = tokens(`${p.name} ${p.category}`);
      const hay = tokens(`${p.sku} ${p.description}`);
      const score = words.reduce((s, w) => s + (name.has(w) ? 3 : hay.has(w) ? 1 : 0), 0);
      return { p, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score || a.p.price - b.p.price)
    .filter((x, _, all) => x.score >= all[0].score * 0.6) // drop weak matches when one product clearly fits
    .map((x) => x.p);
}

// "Showroom: 123 ABC." -> "showroom: 123 ABC" so it reads naturally after "Dạ ".
const soft = (line) => line.charAt(0).toLowerCase() + line.slice(1).replace(/[.\s]+$/, '');

function knowledgeLine(knowledge, keys) {
  return (knowledge || '').split('\n').find((l) => keys.some((k) => normalize(l).includes(k)));
}

// Rule-of-thumb sales assistant over the catalog. Same output shape as the server's ReplySchema.
export function localReply({ ai, products, customer, messages, campaign }) {
  const last = messages.filter((m) => m.from === 'customer').at(-1)?.text || '';
  const t = normalize(last);
  const allCustomer = messages.filter((m) => m.from === 'customer').map((m) => m.text).join('\n');
  const phone = allCustomer.match(PHONE_RE)?.[0] || customer.phone || null;
  const inOrderFlow = [...messages].reverse().find((m) => m.from !== 'customer')?.intent === 'order';
  // An address is only taken from the latest message, as the answer to our "where to deliver?" question.
  const lastNoPhone = last.replace(PHONE_RE, '').trim();
  const looksLikeAddress = /\d/.test(lastNoPhone) && /(duong|phuong|quan|q\.?\s?\d|tp|thanh pho|huyen|xa|tinh|,)/.test(normalize(lastNoPhone));
  const address = customer.address || (inOrderFlow && looksLikeAddress ? lastNoPhone.replace(/^[\s\-–,:.]+/, '').replace(/^(giao|ship|gửi|gui)\s*(về|ve|tới|toi|đến|den)?\s*/i, '') : null);
  const lastSuggested = [...messages].reverse().find((m) => m.productIds?.length)?.productIds || [];
  const p = (a) => ({ ...a, lead: { name: null, phone, address }, order: a.order || { ready: false, items: [], note: null }, handoff: a.handoff || false, handoff_reason: a.handoff_reason || null, quick_replies: a.quick_replies || [], product_ids: a.product_ids || [] });

  if (/\b(khieu nai|bi loi|bi hong|hu hong|te qua|that vong|hoan tien|boi thuong|lua dao)\b/.test(t) || /\b(gap|noi chuyen voi) (nhan vien|nguoi)/.test(t)) {
    return p({ intent: 'complaint', reply: 'Dạ em rất xin lỗi anh/chị. Em đã chuyển ngay cho nhân viên phụ trách, anh/chị đợi em vài phút nhé!', handoff: true, handoff_reason: 'Khách phàn nàn hoặc muốn gặp nhân viên' });
  }

  let matched = scoreProducts(last, products);
  const buy = /\b(mua|dat hang|dat mua|chot|lay (cai|mau|bo|\d)|len don|order|ship cho|giao cho)\b/.test(t)
    || (matched.length > 0 && /\b(lay|chon|dat|lay luon)\b/.test(t));
  if (!matched.length && (buy || inOrderFlow || /\b(cai do|mau do|cai nay|mau nay|san pham do)\b/.test(t))) {
    matched = lastSuggested.map((id) => products.find((x) => x.id === id)).filter(Boolean);
  }

  if (buy || (inOrderFlow && lastSuggested.length)) {
    const product = matched[0];
    if (!product) return p({ intent: 'order', reply: 'Dạ anh/chị muốn đặt sản phẩm nào ạ? Em gửi lại vài mẫu bán chạy nhé.', product_ids: products.filter((x) => x.stock > 0).slice(0, 3).map((x) => x.id) });
    if (product.stock <= 0) {
      const alt = products.filter((x) => x.category === product.category && x.stock > 0 && x.id !== product.id);
      return p({ intent: 'order', reply: `Dạ ${product.name} hiện đang hết hàng ạ.${alt.length ? ` Anh/chị tham khảo ${alt[0].name} giá ${vnd(alt[0].price)} nhé?` : ' Em sẽ báo anh/chị ngay khi có hàng ạ.'}`, product_ids: alt.slice(0, 2).map((x) => x.id) });
    }
    const all = normalize(allCustomer);
    const qtyPhrase = all.match(/\b\d{1,2}\s*(cai|chiec|bo)\b/g)?.at(-1);
    const qty = Number(qtyPhrase?.match(/\d+/)[0] || all.match(/\b(?:x|sl|so luong|lay|mua|dat)\s*(\d{1,2})\b/)?.[1] || 1);
    const items = [{ product_id: product.id, qty }];
    if (!phone) return p({ intent: 'order', reply: `Dạ em lên đơn ${product.name} x${qty}, tổng ${vnd(product.price * qty)} ạ. Anh/chị cho em xin số điện thoại để bên em xác nhận đơn nhé!`, product_ids: [product.id], order: { ready: false, items, note: null } });
    if (!address) return p({ intent: 'order', reply: 'Dạ em cảm ơn ạ. Anh/chị cho em xin địa chỉ nhận hàng (số nhà, đường, quận/huyện, tỉnh) nhé!', product_ids: [product.id], order: { ready: false, items, note: null } });
    return p({ intent: 'order', reply: `Em đã lên đơn ${product.name} x${qty}, tổng ${vnd(product.price * qty)}, giao về ${address}. Bên em sẽ gọi số ${phone} để xác nhận trước khi giao ạ. Cảm ơn anh/chị đã ủng hộ Gỗ Việt! 🎉`, product_ids: [product.id], order: { ready: Boolean(ai.autoOrder), items, note: 'Đơn tạo tự động bởi AI' } });
  }

  if (PHONE_RE.test(last)) {
    return p({ intent: 'other', reply: 'Dạ em đã lưu số điện thoại ạ. Anh/chị đang quan tâm mẫu nào để em báo giá và tư vấn chi tiết ạ?', quick_replies: [...new Set(products.map((x) => x.category))].slice(0, 3) });
  }

  if (/\b(bao hanh|doi tra)\b/.test(t)) {
    const line = knowledgeLine(ai.knowledge, ['bao hanh', 'doi tra']);
    if (line) return p({ intent: 'other', reply: `Dạ ${soft(line)} ạ.` });
    return p({ intent: 'other', reply: 'Dạ em sẽ nhờ nhân viên kiểm tra chính sách này và phản hồi anh/chị ngay ạ.', handoff: true, handoff_reason: 'Hỏi chính sách chưa có trong dữ liệu' });
  }
  if (/\b(giao|ship|van chuyen|phi ship|bao lau)\b/.test(t)) {
    const line = knowledgeLine(ai.knowledge, ['giao']);
    return p({ intent: 'shipping', reply: `Dạ ${line ? soft(line) : 'shop giao hàng toàn quốc'} ạ. Anh/chị ở khu vực nào để em báo chính xác ạ?` });
  }
  if (/\b(dia chi|showroom|o dau|cua hang)\b/.test(t)) {
    const line = knowledgeLine(ai.knowledge, ['showroom', 'dia chi']);
    return p({ intent: 'other', reply: `Dạ ${line ? soft(line) : 'anh/chị vui lòng liên hệ hotline để được hướng dẫn'} ạ. Anh/chị có muốn em đặt lịch xem trực tiếp không ạ?`, quick_replies: ['Đặt lịch xem'] });
  }
  if (/\b(thanh toan|tra gop|chuyen khoan|stk)\b/.test(t)) {
    const line = knowledgeLine(ai.knowledge, ['thanh toan']);
    return p({ intent: 'other', reply: `Dạ ${line ? soft(line) : 'shop nhận COD và chuyển khoản'} ạ.` });
  }

  if (matched.length) {
    const top = matched.slice(0, 3);
    const lines = top.map((x) => `• ${x.name}: ${vnd(x.price)}${x.stock <= 0 ? ' (tạm hết)' : ''}`).join('\n');
    const first = top[0];
    return p({
      intent: /(gia|bao nhieu)/.test(t) ? 'price' : 'product_question',
      reply: top.length === 1
        ? first.stock <= 0
          ? `Dạ ${first.name} (${vnd(first.price)}) hiện đang tạm hết hàng ạ. Em có thể báo anh/chị ngay khi có hàng, hoặc anh/chị tham khảo mẫu khác bên em nhé?`
          : `Dạ ${first.name} giá ${vnd(first.price)}, còn ${first.stock} sản phẩm ạ. ${first.description} Anh/chị muốn em lên đơn hay tư vấn thêm ạ?`
        : `Dạ bên em có các mẫu phù hợp:\n${lines}\nAnh/chị quan tâm mẫu nào để em tư vấn chi tiết ạ?`,
      product_ids: top.map((x) => x.id),
      quick_replies: top.length === 1 ? ['Đặt mua', 'Phí giao hàng'] : top.map((x) => x.name).slice(0, 3),
    });
  }

  const isFirst = messages.filter((m) => m.from !== 'customer').length === 0;
  const featured = campaign ? products.filter((x) => campaign.productIds?.includes(x.id)) : products.filter((x) => x.stock > 0).slice(0, 3);
  return p({
    intent: isFirst ? 'greeting' : 'other',
    reply: isFirst
      ? `Dạ em chào anh/chị! Em là trợ lý tư vấn của shop. ${featured.length ? `Bên em đang có ${featured.slice(0, 3).map((x) => x.name).join(', ')}.` : ''} Anh/chị đang tìm sản phẩm gì ạ?`
      : 'Dạ anh/chị mô tả thêm nhu cầu (loại sản phẩm, kích thước, ngân sách) để em gợi ý mẫu phù hợp nhất nhé!',
    product_ids: featured.slice(0, 3).map((x) => x.id),
    quick_replies: [...new Set(products.map((x) => x.category))].slice(0, 3),
  });
}

// Ask the AI for the next reply in a conversation. Returns { data, meta } where meta.engine is 'claude' or 'local'.
export async function aiReply({ state, conv }) {
  const channel = state.channels.find((c) => c.id === conv.channelId);
  const customer = state.customers.find((u) => u.id === conv.customerId) || {};
  const campaign = state.campaigns.find((c) => c.id === conv.campaignId);
  const messages = conv.messages.map(({ from, text, productIds, intent }) => ({ from, text, productIds, intent }));
  const payload = { shop: state.shop, ai: state.ai, products: state.products, customer, messages, campaign, channelName: channel?.name };
  const started = performance.now();

  const h = await aiHealth();
  if (h.ai) {
    try {
      const r = await fetch('/api/ai/reply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await r.json();
      if (r.ok) return { data: body.data, meta: { ...body.meta, engine: 'claude' } };
      console.warn('AI server error, using local engine:', body.error);
    } catch (e) {
      console.warn('AI server unreachable, using local engine:', e);
    }
  }
  await new Promise((res) => setTimeout(res, 500 + Math.random() * 600)); // natural typing delay
  return { data: localReply(payload), meta: { engine: 'local', latencyMs: Math.round(performance.now() - started), costUsd: 0 } };
}

// Apply an AI result to the store draft: post the reply, capture lead info, create the order, hand off.
export function applyAiResult(d, convId, { data, meta }) {
  const conv = d.conversations.find((v) => v.id === convId);
  if (!conv) return null;
  const cust = d.customers.find((u) => u.id === conv.customerId);
  conv.messages.push({ id: uid(), from: 'ai', text: data.reply, at: Date.now(), productIds: data.product_ids, buttons: data.quick_replies, intent: data.intent, meta });

  if (cust) {
    if (data.lead?.phone && !cust.phone) { cust.phone = data.lead.phone; if (!cust.tags.includes('Có SĐT')) cust.tags.push('Có SĐT'); }
    if (data.lead?.address && !cust.address) cust.address = data.lead.address;
    if (data.lead?.name && cust.name.startsWith('Khách')) cust.name = data.lead.name;
    if (data.product_ids?.[0] && !cust.interestProductId) {
      cust.interestProductId = data.product_ids[0];
      cust.expectedValue = d.products.find((p) => p.id === data.product_ids[0])?.price || 0;
    }
    intakeLead(d, cust.id); // no-op until there is a phone number, or if already assigned
  }

  let orderId = null;
  const alreadyOrdered = d.orders.some((o) => o.conversationId === convId && Date.now() - o.createdAt < 10 * 60000);
  if (data.order?.ready && data.order.items.length && d.ai.autoOrder && !alreadyOrdered) {
    orderId = nextOrderId(d.orders);
    d.orders.push({
      id: orderId, customerId: conv.customerId, channelId: conv.channelId, campaignId: conv.campaignId || null, conversationId: convId,
      items: data.order.items.map((i) => ({ productId: i.product_id, qty: i.qty })), status: 'new', payment: 'cod',
      createdAt: Date.now(), note: [data.order.note, cust?.address && `Giao: ${cust.address}`].filter(Boolean).join(' · '), createdBy: 'ai',
    });
    exportForOrder(d, d.orders.at(-1));
    if (cust) {
      cust.tags = [...new Set([...cust.tags.filter((t) => t !== 'Khách mới'), 'Đã mua'])];
      setStage(d, cust.id, 'won', { reason: `AI chốt đơn #${orderId}` });
    }
  }

  if (data.handoff) {
    conv.botActive = false;
    conv.handoff = true;
    conv.handoffReason = data.handoff_reason;
    conv.unread += 1;
    if (cust && !cust.tags.includes('Cần nhân viên')) cust.tags.push('Cần nhân viên');
    if (cust?.ownerId) d.tasks.push({ id: uid(), customerId: cust.id, staffId: cust.ownerId, type: 'message', kind: 'manual', due: Date.now() + d.process.slaMinutes * 60000, title: `Phản hồi khách AI chuyển: ${data.handoff_reason || 'cần nhân viên'}`, done: false });
  }
  return { orderId, handoff: data.handoff };
}
