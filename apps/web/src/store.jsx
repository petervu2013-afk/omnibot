import { createContext, useContext, useEffect, useRef, useState } from 'react';

import { seedCrm, DEFAULT_PROCESS } from './seedCrm.js';
import { seedOps, DEFAULT_SETTINGS } from './seedOps.js';

const STORAGE_KEY = 'omnibot-state-v7';

export const PLATFORMS = {
  facebook: { label: 'Facebook', color: '#1877f2' },
  instagram: { label: 'Instagram', color: '#e1306c' },
  zalo: { label: 'Zalo OA', color: '#0068ff' },
  website: { label: 'Website', color: '#16a34a' },
  tiktok: { label: 'TikTok', color: '#111827' },
};

export const AD_PLATFORMS = {
  facebook: { label: 'Facebook Ads', color: '#1877f2' },
  google: { label: 'Google Ads', color: '#ea4335' },
  tiktok: { label: 'TikTok Ads', color: '#111827' },
};

export const uid = () => Math.random().toString(36).slice(2, 10);

const DAY = 86400000;
const now = Date.now();
const minutes = (m) => now - m * 60 * 1000;
const days = (d) => now - d * DAY;
export const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

function defaultBot(name) {
  return {
    enabled: true,
    mode: 'ai', // 'ai' = AI trả lời theo danh mục sản phẩm, 'rules' = kịch bản từ khóa
    welcome: `Xin chào! Cảm ơn bạn đã nhắn tin cho ${name}. Mình có thể giúp gì cho bạn?`,
    quickReplies: ['Xem bảng giá', 'Đặt lịch hẹn', 'Gặp nhân viên'],
    fallback: 'Cảm ơn bạn, nhân viên sẽ phản hồi trong ít phút nữa nhé!',
    askPhone: true,
    rules: [
      { id: uid(), keywords: ['giá', 'bảng giá', 'bao nhiêu'], reply: 'Bạn quan tâm sản phẩm nào ạ? Shop gửi báo giá chi tiết ngay.', buttons: ['Bàn ăn', 'Sofa', 'Kệ sách'] },
      { id: uid(), keywords: ['địa chỉ', 'ở đâu', 'cửa hàng'], reply: 'Showroom ở 123 Nguyễn Trãi, Q.1, TP.HCM. Mở cửa 8h–21h hằng ngày.', buttons: [] },
      { id: uid(), keywords: ['đặt lịch', 'lịch hẹn', 'booking'], reply: 'Bạn muốn đặt lịch vào ngày giờ nào ạ? Vui lòng để lại SĐT để bên mình xác nhận.', buttons: ['Sáng mai', 'Chiều mai'] },
      { id: uid(), keywords: ['nhân viên', 'tư vấn'], reply: 'Mình đã chuyển cuộc trò chuyện cho nhân viên, bạn đợi chút nhé!', buttons: [] },
    ],
  };
}

export const DEFAULT_AI = {
  persona: 'em',
  tone: 'thân thiện, nhiệt tình, chuyên nghiệp',
  autoOrder: true,
  handoffOnComplaint: true,
  effort: 'low',
  knowledge: [
    'Giao hàng toàn quốc. Miễn phí giao + lắp đặt nội thành TP.HCM cho đơn từ 5 triệu; tỉnh khác phí 300-800k tùy kích thước.',
    'Thời gian giao: nội thành 1-2 ngày, tỉnh 3-7 ngày.',
    'Bảo hành khung gỗ 5 năm, bảo hành bọc nệm 1 năm. Đổi trả trong 7 ngày nếu lỗi do sản xuất.',
    'Thanh toán: COD, chuyển khoản (STK 0123456789 - Ngân hàng ABC - CTY GO VIET), trả góp 0% qua thẻ tín dụng cho đơn từ 10 triệu.',
    'Showroom: 123 Nguyễn Trãi, Q.1, TP.HCM, mở cửa 8h-21h.',
  ].join('\n'),
};

export const TEMPLATES = [
  { id: 't1', name: 'Đặt trà sữa tự động', category: 'F&B', emoji: '🧋', gradient: 'linear-gradient(135deg,#fde68a,#f59e0b)' },
  { id: 't2', name: 'Phụ kiện phong thủy', category: 'Bán lẻ', emoji: '📿', gradient: 'linear-gradient(135deg,#334155,#0f172a)' },
  { id: 't3', name: 'Minigame tặng quà', category: 'Marketing', emoji: '🎁', gradient: 'linear-gradient(135deg,#fecdd3,#fb7185)' },
  { id: 't4', name: 'Vòng quay may mắn', category: 'Marketing', emoji: '🎡', gradient: 'linear-gradient(135deg,#bfdbfe,#6366f1)' },
  { id: 't5', name: 'Spa – Thẩm mỹ viện', category: 'Làm đẹp', emoji: '💆', gradient: 'linear-gradient(135deg,#bbf7d0,#10b981)' },
  { id: 't6', name: 'Nha khoa', category: 'Y tế', emoji: '🦷', gradient: 'linear-gradient(135deg,#a5f3fc,#0ea5e9)' },
  { id: 't7', name: 'Thiết kế nội thất', category: 'Dịch vụ', emoji: '🛋️', gradient: 'linear-gradient(135deg,#e7e5e4,#a8a29e)' },
  { id: 't8', name: 'Cửa hàng giày dép', category: 'Bán lẻ', emoji: '👟', gradient: 'linear-gradient(135deg,#fed7aa,#ea580c)' },
  { id: 't9', name: 'Nhà hàng', category: 'F&B', emoji: '🍣', gradient: 'linear-gradient(135deg,#fecaca,#dc2626)' },
  { id: 't10', name: 'Cửa hàng quần áo', category: 'Bán lẻ', emoji: '👗', gradient: 'linear-gradient(135deg,#f5d0fe,#c026d3)' },
  { id: 't11', name: 'Sự kiện – Khóa học', category: 'Giáo dục', emoji: '🎤', gradient: 'linear-gradient(135deg,#c7d2fe,#4338ca)' },
  { id: 't12', name: 'Bất động sản', category: 'Dịch vụ', emoji: '🏙️', gradient: 'linear-gradient(135deg,#99f6e4,#0d9488)' },
];

const PRODUCTS = [
  { id: 'p1', sku: 'BA-SOI-16', name: 'Bàn ăn gỗ sồi 1m6', category: 'Bàn ăn', price: 6500000, stock: 12, description: 'Gỗ sồi Mỹ nguyên khối, mặt 160x80cm, kèm 4 ghế. Phù hợp gia đình 4-6 người.' },
  { id: 'p2', sku: 'BA-OC-18', name: 'Bàn ăn gỗ óc chó 1m8', category: 'Bàn ăn', price: 15900000, stock: 3, description: 'Gỗ óc chó mặt liền tấm 180x90cm, chân sắt sơn tĩnh điện, phong cách hiện đại.' },
  { id: 'p3', sku: 'SF-L-28', name: 'Sofa góc L 2m8', category: 'Sofa', price: 14900000, stock: 4, description: 'Khung gỗ dầu, nệm D40, bọc vải bố chống thấm, màu xám/kem. Kích thước 280x180cm.' },
  { id: 'p4', sku: 'SF-V-22', name: 'Sofa văng da 2m2', category: 'Sofa', price: 9800000, stock: 7, description: 'Da PU cao cấp, khung gỗ tự nhiên, 3 chỗ ngồi, màu nâu bò.' },
  { id: 'p5', sku: 'KS-OC-80', name: 'Kệ sách gỗ óc chó', category: 'Kệ & tủ', price: 3200000, stock: 20, description: 'Kệ 5 tầng 80x180cm, gỗ óc chó tự nhiên, chịu lực 30kg/tầng.' },
  { id: 'p6', sku: 'TV-SOI-18', name: 'Kệ tivi gỗ sồi 1m8', category: 'Kệ & tủ', price: 4500000, stock: 9, description: 'Kệ tivi 180cm, 2 hộc kéo ray giảm chấn, hợp tivi 55-75 inch.' },
  { id: 'p7', sku: 'GH-CF-01', name: 'Ghế cafe gỗ tràm', category: 'Ghế', price: 650000, stock: 60, description: 'Ghế gỗ tràm sơn PU, cao 78cm, phù hợp quán cafe và bàn ăn nhỏ.' },
  { id: 'p8', sku: 'GN-SOI-16', name: 'Giường ngủ gỗ sồi 1m6', category: 'Giường', price: 8900000, stock: 0, description: 'Giường 1m6x2m gỗ sồi, đầu giường bọc nệm, có 2 hộc kéo dưới gầm.' },
];

const CAMPAIGNS = [
  { id: 'cp1', adAccountId: 'aa1', placement: 'Facebook + Instagram Feed → Messenger', audience: 'Nữ 25-45, HCM, quan tâm nội thất', platform: 'facebook', name: 'FB | Tin nhắn | Bàn ăn gỗ sồi', objective: 'messages', channelId: 'c1', focus: 'Bàn ăn', status: 'active', budget: 120000, productIds: ['p1', 'p2', 'p7'] },
  { id: 'cp2', adAccountId: 'aa1', placement: 'Facebook Feed, Reels → Messenger', audience: '28-50, HCM + Bình Dương, mới cưới/mua nhà', platform: 'facebook', name: 'FB | Tin nhắn | Sofa góc', objective: 'messages', channelId: 'c1', focus: 'Sofa', status: 'active', budget: 150000, productIds: ['p3', 'p4'] },
  { id: 'cp3', adAccountId: 'aa1', placement: 'Facebook + Instagram → Messenger', audience: 'Người đã nhắn tin 30 ngày (loại trừ người đã mua)', platform: 'facebook', name: 'FB | Retarget | Người đã nhắn tin', objective: 'conversions', channelId: 'c1', focus: 'Bàn ăn, Sofa', status: 'active', budget: 60000, productIds: ['p1', 'p3', 'p5'] },
  { id: 'cp4', adAccountId: 'aa2', placement: 'Google Search → website goviet.vn', audience: 'Từ khóa: bàn ăn gỗ, kệ tivi gỗ, nội thất gỗ HCM', platform: 'google', name: 'GG | Search | Nội thất gỗ HCM', objective: 'leads', channelId: 'c4', focus: 'Kệ & tủ, Bàn ăn', status: 'active', budget: 120000, productIds: ['p5', 'p6', 'p1'] },
  { id: 'cp5', adAccountId: 'aa2', placement: 'Performance Max (Search, YouTube, Display)', audience: 'Tín hiệu: khách đã mua + người truy cập web', platform: 'google', name: 'GG | PMax | Kệ tivi', objective: 'conversions', channelId: 'c4', focus: 'Kệ & tủ', status: 'active', budget: 80000, productIds: ['p6', 'p5'] },
  { id: 'cp6', adAccountId: 'aa3', placement: 'TikTok For You → tin nhắn TikTok', audience: '22-40, chủ quán cafe, toàn quốc', platform: 'tiktok', name: 'TT | Video | Ghế cafe giá xưởng', objective: 'messages', channelId: 'c5', focus: 'Ghế', status: 'active', budget: 90000, productIds: ['p7'] },
];

export const AD_ACCOUNTS = [
  { id: 'aa1', platform: 'facebook', name: 'Gỗ Việt Business Manager', accountId: 'act_••••4821', channelIds: ['c1', 'c3'], status: 'connected', lastSync: Date.now() - 12 * 60000 },
  { id: 'aa2', platform: 'google', name: 'Gỗ Việt – Google Ads', accountId: '•••-•••-7790', channelIds: ['c4'], status: 'connected', lastSync: Date.now() - 25 * 60000 },
  { id: 'aa3', platform: 'tiktok', name: 'Gỗ Việt Xưởng – TikTok Ads', accountId: '••••3315', channelIds: ['c5'], status: 'connected', lastSync: Date.now() - 40 * 60000 },
];

// KPI targets used to grade campaigns (editable in the ads overview).
export const DEFAULT_KPI = { cpm: 60000, frequencyMax: 3, ctr: 0.012, costPerConv: 60000, costPerLead: 150000, cpa: 1500000, roas: 3 };

// Per-campaign behaviour used to synthesise history. Some campaigns are deliberately weak so reports have something to optimise.
const CAMPAIGN_PROFILE = {
  cp1: { freq: 1.25, cpm: 45000, ctr: 0.018, convRate: 0.09, phoneRate: 0.55, orderRate: 0.16 },
  cp2: { freq: 1.3, cpm: 60000, ctr: 0.011, convRate: 0.06, phoneRate: 0.35, orderRate: 0.06 },
  cp3: { freq: 2.1, cpm: 80000, ctr: 0.025, convRate: 0.08, phoneRate: 0.7, orderRate: 0.12 },
  cp4: { freq: 1.1, cpm: 120000, ctr: 0.06, convRate: 0.035, phoneRate: 0.75, orderRate: 0.15 },
  cp5: { freq: 1.45, cpm: 50000, ctr: 0.009, convRate: 0.04, phoneRate: 0.6, orderRate: 0.15 },
  cp6: { freq: 1.15, cpm: 20000, ctr: 0.012, convRate: 0.15, phoneRate: 0.18, orderRate: 0.25 },
};

const FIRST = ['Minh', 'Thu', 'Hoàng', 'Ngọc', 'Quốc', 'Thanh', 'Gia', 'Phương', 'Đức', 'Khánh', 'Bảo', 'Hải', 'Lan', 'Tuấn', 'Mai', 'Yến', 'Trung', 'Vy'];
const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Lý'];
const MID = ['Văn', 'Thị', 'Minh', 'Ngọc', 'Gia', 'Hữu', 'Thanh', 'Quang'];
const DISTRICTS = ['Q.7, TP.HCM', 'Thủ Đức, TP.HCM', 'Q.Bình Thạnh, TP.HCM', 'Q.Gò Vấp, TP.HCM', 'Biên Hòa, Đồng Nai', 'Thuận An, Bình Dương', 'Cầu Giấy, Hà Nội'];

function rng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

function generateHistory(rand) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const metrics = [];
  const customers = [];
  const conversations = [];
  const orders = [];
  let orderNo = 1000;
  const today = startOfDay(now);

  for (let d = 27; d >= 1; d--) {
    const date = today - d * DAY;
    for (const c of CAMPAIGNS) {
      const p = CAMPAIGN_PROFILE[c.id];
      const noise = () => 0.75 + rand() * 0.5;
      const spend = Math.round((c.budget * noise()) / 1000) * 1000;
      const impressions = Math.round((spend / p.cpm) * 1000);
      const clicks = Math.round(impressions * p.ctr * noise());
      const reportedConv = Math.round(clicks * p.convRate * noise());
      const reach = Math.round(impressions / (p.freq + rand() * 0.3));
      metrics.push({ campaignId: c.id, date, spend, impressions, reach, clicks, platformConversions: reportedConv });

      // CRM side: only part of reported conversations reach the inbox as real chats.
      const chats = Math.round(reportedConv * (0.5 + rand() * 0.3));
      for (let i = 0; i < chats; i++) {
        const at = date + (8 + rand() * 14) * 3600000;
        const name = `${pick(LAST)} ${pick(MID)} ${pick(FIRST)}`;
        const hasPhone = rand() < p.phoneRate;
        const phone = hasPhone ? '09' + String(Math.floor(rand() * 1e8)).padStart(8, '0') : '';
        const cust = { id: uid(), name, phone, tags: hasPhone ? ['Có SĐT'] : [], note: '', address: hasPhone && rand() < 0.7 ? `${Math.ceil(rand() * 200)} ${pick(['Lê Lợi', 'Nguyễn Huệ', 'Phạm Văn Đồng', 'Võ Văn Ngân'])}, ${pick(DISTRICTS)}` : '', campaignId: c.id, firstSeen: at };
        customers.push(cust);
        const productId = pick(c.productIds);
        const product = PRODUCTS.find((x) => x.id === productId);
        const automated = rand() < 0.82;
        const handoff = !automated && rand() < 0.6;
        const msgs = [
          { id: uid(), from: 'customer', text: pick([`Shop ơi ${product.name.toLowerCase()} giá bao nhiêu?`, `Cho mình xem mẫu ${product.category.toLowerCase()}`, 'Mình thấy quảng cáo, tư vấn giúp mình', `${product.name} còn hàng không ạ?`]), at },
          { id: uid(), from: 'ai', text: `Dạ ${product.name} giá ${product.price.toLocaleString('vi-VN')}đ ạ. ${product.description} Anh/chị cần em tư vấn thêm kích thước hay báo giá giao hàng không ạ?`, at: at + 3000 + rand() * 4000, productIds: [product.id], meta: { engine: 'sample', latencyMs: Math.round(1800 + rand() * 2500), costUsd: 0.004 + rand() * 0.006 } },
        ];
        if (hasPhone) {
          msgs.push({ id: uid(), from: 'customer', text: `Sđt mình ${phone}`, at: at + 120000 });
          msgs.push({ id: uid(), from: 'ai', text: 'Em cảm ơn anh/chị, em đã ghi nhận số điện thoại. Anh/chị muốn đặt mấy sản phẩm và giao về địa chỉ nào ạ?', at: at + 125000, meta: { engine: 'sample', latencyMs: Math.round(1500 + rand() * 2000), costUsd: 0.003 + rand() * 0.005 } });
        }
        if (handoff) msgs.push({ id: uid(), from: 'agent', text: 'Dạ em là nhân viên shop, em hỗ trợ anh/chị tiếp nhé.', at: at + 600000 });
        const conv = { id: uid(), channelId: c.channelId, customerId: cust.id, unread: 0, botActive: !handoff, campaignId: c.id, handoff, handoffReason: handoff ? pick(['Khách hỏi chính sách bảo hành đặc biệt', 'Khách yêu cầu gặp nhân viên', 'Khách phàn nàn giao hàng chậm']) : null, messages: msgs, status: 'done' };
        conversations.push(conv);

        if (hasPhone && rand() < p.orderRate) {
          const qty = product.category === 'Ghế' ? 2 + Math.floor(rand() * 6) : 1;
          const orderAt = at + 3600000 * (1 + rand() * 30);
          const st = orderAt < now - 3 * DAY ? (rand() < 0.88 ? 'done' : 'cancelled') : pick(['new', 'confirmed', 'shipping']);
          orders.push({ id: 'DH' + ++orderNo, customerId: cust.id, channelId: c.channelId, campaignId: c.id, conversationId: conv.id, items: [{ productId: product.id, qty }], status: st, payment: st === 'done' ? 'paid' : 'cod', createdAt: Math.min(orderAt, now - 60000), note: '', createdBy: automated ? 'ai' : 'agent' });
          if (automated) msgs.push({ id: uid(), from: 'ai', text: `Em đã lên đơn ${product.name} x${qty} cho anh/chị. Bên em sẽ gọi xác nhận trước khi giao ạ!`, at: at + 300000, meta: { engine: 'sample', latencyMs: 2100, costUsd: 0.006 } });
          cust.tags = ['Đã mua'];
        }
        msgs.sort((a, b) => a.at - b.at);
      }
    }
  }
  return { metrics, customers, conversations, orders, nextOrderNo: orderNo };
}

function seed() {
  const rand = rng(20261022);
  const channels = [
    { id: 'c1', name: 'Nội Thất Gỗ Việt', platform: 'facebook', followers: 12500, connectedAt: days(40), bot: defaultBot('Nội Thất Gỗ Việt') },
    { id: 'c2', name: 'Gỗ Việt Official', platform: 'zalo', followers: 3200, connectedAt: days(20), bot: defaultBot('Gỗ Việt') },
    { id: 'c3', name: 'goviet.store', platform: 'instagram', followers: 8100, connectedAt: days(10), bot: defaultBot('Gỗ Việt Store') },
    { id: 'c4', name: 'goviet.vn (chat website)', platform: 'website', followers: 0, connectedAt: days(35), bot: defaultBot('Gỗ Việt') },
    { id: 'c5', name: 'Gỗ Việt Xưởng', platform: 'tiktok', followers: 21000, connectedAt: days(30), bot: defaultBot('Gỗ Việt Xưởng') },
  ];
  const history = generateHistory(rand);
  const live = [
    { id: 'u1', name: 'Nguyễn Minh Anh', phone: '', tags: ['Khách mới'], note: '', address: '', campaignId: 'cp1', firstSeen: minutes(12) },
    { id: 'u2', name: 'Trần Hoàng Long', phone: '0909111222', tags: ['Quan tâm sofa'], note: 'Hỏi sofa góc L màu xám', address: '', campaignId: 'cp2', firstSeen: minutes(95), ownerId: 's3', phoneAt: minutes(88), stage: 'new', stageChangedAt: minutes(88), interestProductId: 'p3', expectedValue: 14900000 },
    { id: 'u3', name: 'Lê Thu Hà', phone: '0987654321', tags: ['VIP'], note: 'Đã mua 2 đơn', address: '45 Lê Lợi, Q.1, TP.HCM', campaignId: null, firstSeen: days(30) },
  ];
  const conversations = [
    { id: 'v1', channelId: 'c1', customerId: 'u1', unread: 1, botActive: true, campaignId: 'cp1', status: 'open', messages: [
      { id: uid(), from: 'customer', text: 'Shop ơi bàn ăn gỗ sồi giá bao nhiêu ạ?', at: minutes(12) },
      { id: uid(), from: 'ai', text: 'Dạ bàn ăn gỗ sồi 1m6 bên em giá 6.500.000đ, gỗ sồi Mỹ nguyên khối, kèm 4 ghế, hợp gia đình 4-6 người ạ. Nhà mình mấy người để em tư vấn kích thước phù hợp ạ?', at: minutes(12) + 3000, productIds: ['p1'], meta: { engine: 'sample', latencyMs: 2600, costUsd: 0.007 } },
      { id: uid(), from: 'customer', text: 'Có giao hàng Hà Nội không shop?', at: minutes(3) },
    ] },
    { id: 'v2', channelId: 'c1', customerId: 'u2', unread: 0, botActive: false, campaignId: 'cp2', status: 'open', handoff: true, handoffReason: 'Khách muốn xem mẫu vải thực tế', messages: [
      { id: uid(), from: 'customer', text: 'Sofa góc L còn màu xám không?', at: minutes(95) },
      { id: uid(), from: 'ai', text: 'Dạ sofa góc L 2m8 còn màu xám ạ, giá 14.900.000đ, bọc vải bố chống thấm. Anh muốn em gửi thêm ảnh thực tế không ạ?', at: minutes(95) + 2500, productIds: ['p3'], meta: { engine: 'sample', latencyMs: 2400, costUsd: 0.006 } },
      { id: uid(), from: 'customer', text: 'Cho anh xem mẫu vải thật được không, gặp nhân viên giúp anh', at: minutes(90) },
      { id: uid(), from: 'agent', text: 'Dạ anh ghé showroom 123 Nguyễn Trãi hoặc em gửi mẫu vải qua tận nhà ạ.', at: minutes(80) },
    ] },
    { id: 'v3', channelId: 'c2', customerId: 'u3', unread: 0, botActive: true, campaignId: null, status: 'open', messages: [
      { id: uid(), from: 'customer', text: 'Cho mình hỏi kệ tivi gỗ sồi còn không', at: minutes(45) },
      { id: uid(), from: 'ai', text: 'Dạ kệ tivi gỗ sồi 1m8 còn 9 chiếc ạ, giá 4.500.000đ, 2 hộc kéo giảm chấn, hợp tivi 55-75 inch. Chị muốn em lên đơn giao về 45 Lê Lợi như lần trước không ạ?', at: minutes(45) + 2000, productIds: ['p6'], meta: { engine: 'sample', latencyMs: 2000, costUsd: 0.005 } },
    ] },
  ];
  const today = startOfDay(now);
  const at = (dayOffset, h) => today + dayOffset * DAY + h * 3600000;
  const customers = [...live, ...history.customers];
  const allConversations = [...conversations, ...history.conversations];
  const orders = [
    { id: 'DH0901', customerId: 'u3', channelId: 'c2', campaignId: null, items: [{ productId: 'p5', qty: 1 }], status: 'done', payment: 'paid', createdAt: days(30), note: '', createdBy: 'agent' },
    ...history.orders,
  ];
  const crm = seedCrm({ customers, orders, conversations: allConversations, products: PRODUCTS, rand, now, uid, orderTotal });
  // A fresh lead nobody has called yet, so the SLA warning is visible in the demo.
  crm.tasks.push({ id: uid(), customerId: 'u2', staffId: 's3', type: 'call', kind: 'cadence', step: 0, due: minutes(73), title: 'Gọi lần 1 – xác nhận nhu cầu, ngân sách', done: false });
  const ops = seedOps({ products: PRODUCTS, orders, customers, rand, now, uid, orderTotal });
  return {
    shop: { name: 'Gỗ Việt', email: 'admin@goviet.vn', hotline: '0900000000', field: 'Nội thất', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', language: 'vi', emailNotify: true },
    ai: { ...DEFAULT_AI },
    staff: crm.staff,
    activities: crm.activities,
    tasks: crm.tasks,
    process: structuredClone(DEFAULT_PROCESS),
    adAccounts: AD_ACCOUNTS,
    kpiTargets: { ...DEFAULT_KPI },
    settings: structuredClone(DEFAULT_SETTINGS),
    ...ops,
    savedReplies: [
      { id: 'q1', shortcut: '/chao', text: 'Dạ em chào anh/chị, em có thể hỗ trợ gì ạ?' },
      { id: 'q2', shortcut: '/ship', text: 'Shop giao toàn quốc, miễn phí nội thành cho đơn từ 5 triệu ạ.' },
      { id: 'q3', shortcut: '/stk', text: 'STK: 0123456789 – Ngân hàng ABC – CTY GO VIET' },
    ],
    channels,
    customers,
    conversations: allConversations,
    products: PRODUCTS,
    orders,
    campaigns: CAMPAIGNS,
    adMetrics: history.metrics,
    bookings: [
      { id: 'b1', title: 'Xem showroom – Trần Hoàng Long', customerId: 'u2', start: at(2, 9), duration: 60, remind: true },
      { id: 'b2', title: 'Khảo sát nhà – Lê Thu Hà', customerId: 'u3', start: at(0, 14), duration: 90, remind: true },
    ],
    posts: [
      { id: 'po1', content: '🔥 Flash sale cuối tuần: giảm 20% toàn bộ bàn ăn gỗ sồi!', channelIds: ['c1', 'c3'], scheduledAt: at(1, 19), status: 'scheduled' },
      { id: 'po2', content: 'Mẫu kệ sách óc chó mới về, inbox để nhận báo giá nhé.', channelIds: ['c1'], scheduledAt: days(2), status: 'published' },
    ],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to seed */ }
  return seed();
}

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, setState] = useState(load);
  const [typing, setTyping] = useState({}); // convId -> true while the AI is composing (not persisted)
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  }, [state]);

  // update(draft => { ...mutate draft... })
  const update = (fn) => setState((prev) => {
    const draft = structuredClone(prev);
    fn(draft);
    stateRef.current = draft;
    return draft;
  });
  const reset = () => setState(seed());
  const getState = () => stateRef.current;

  return <StoreContext.Provider value={{ state, update, reset, getState, typing, setTyping }}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);

export const money = (n) => Math.round(n || 0).toLocaleString('vi-VN') + ' ₫';
export const compact = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + ' tỷ' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' tr' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)));
export const orderTotal = (order, products) =>
  order.items.reduce((s, it) => s + (products.find((p) => p.id === it.productId)?.price || 0) * it.qty, 0);
export const nextOrderId = (orders) => 'DH' + (Math.max(1000, ...orders.map((o) => Number(o.id.replace(/\D/g, '')) || 0)) + 1);

export function timeAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
  return `${Math.floor(diff / 86400)} ngày`;
}

export { defaultBot };
