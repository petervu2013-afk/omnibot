// Sample CRM history for the demo: owners, calls, quotes, care calls, open follow-up tasks, past buyers.
// Kept free of store imports so store.jsx can call it while building the seed.
const HOUR = 3600000;
const DAY = 24 * HOUR;

export const DEFAULT_PROCESS = {
  slaMinutes: 15, // first call after a lead leaves a phone number
  cadence: [
    { day: 0, type: 'call', title: 'Gọi lần 1 – xác nhận nhu cầu, ngân sách' },
    { day: 1, type: 'message', title: 'Gửi ảnh thực tế + báo giá qua Zalo' },
    { day: 3, type: 'call', title: 'Gọi lần 2 – giải đáp, mời xem showroom' },
    { day: 7, type: 'call', title: 'Gọi lần 3 – ưu đãi chốt đơn' },
  ],
  retryHours: 4, // retry when the customer does not pick up
  maxAttempts: 4,
  staleDays: { new: 1, contacting: 2, consulting: 4, quoted: 3 },
  nurtureEveryDays: 14,
  careAfterDays: [3, 30], // after-sales care calls
  assignment: 'round_robin',
};

export const SEED_STAFF = [
  { id: 's1', name: 'Quản trị viên', role: 'Chủ shop', email: 'admin@goviet.vn' },
  { id: 's2', name: 'Ngọc Trâm', role: 'Sale', email: 'tram@goviet.vn', monthlyTarget: 120000000, speed: [5, 25] },
  { id: 's3', name: 'Minh Quân', role: 'Sale', email: 'quan@goviet.vn', monthlyTarget: 120000000, speed: [60, 600] },
  { id: 's4', name: 'Hải Yến', role: 'Sale', email: 'yen@goviet.vn', monthlyTarget: 90000000, speed: [10, 120] },
  { id: 's5', name: 'Thu Trang', role: 'CSKH', email: 'trang@goviet.vn' },
];

const NAMES = ['Phan Thị Hồng', 'Trịnh Văn Đạt', 'Mai Ngọc Hân', 'Châu Minh Khôi', 'Tạ Thu Uyên', 'La Quốc Việt', 'Hà Thanh Tùng', 'Kiều Bảo Ngọc', 'Lâm Gia Hưng', 'Vương Thùy Linh', 'Quách Đức Anh', 'Tôn Nữ Mỹ'];

export function seedCrm({ customers, orders, conversations, products, rand, now, uid, orderTotal }) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const between = (a, b) => a + rand() * (b - a);
  const sales = SEED_STAFF.filter((s) => s.role === 'Sale');
  const care = SEED_STAFF.find((s) => s.role === 'CSKH');
  const activities = [];
  const tasks = [];
  const act = (a) => { if (a.at <= now) activities.push({ id: uid(), ...a }); };

  // Past buyers (1-6 months ago) so lifetime value, care and upsell have history.
  const pastProducts = products.filter((p) => p.stock > 0);
  NAMES.forEach((name, i) => {
    const id = uid();
    const firstSeen = now - between(60, 200) * DAY;
    const owner = sales[i % sales.length];
    customers.push({ id, name, phone: '09' + String(Math.floor(rand() * 1e8)).padStart(8, '0'), tags: ['Đã mua'], note: '', address: `${Math.ceil(rand() * 150)} Nguyễn Văn Linh, Q.7, TP.HCM`, campaignId: null, firstSeen, ownerId: owner.id, phoneAt: firstSeen, stage: 'won', stageChangedAt: firstSeen + 2 * DAY });
    const nOrders = rand() < 0.35 ? 2 : 1;
    for (let k = 0; k < nOrders; k++) {
      const p = pick(pastProducts);
      const at = firstSeen + (2 + k * between(30, 60)) * DAY;
      if (at > now - 2 * DAY) continue;
      orders.push({ id: 'DH0' + (800 + i * 3 + k), customerId: id, channelId: pick(['c1', 'c2']), campaignId: null, items: [{ productId: p.id, qty: p.category === 'Ghế' ? 4 : 1 }], status: 'done', payment: 'paid', createdAt: at, note: '', createdBy: 'agent' });
      act({ customerId: id, type: 'call', outcome: 'connected', staffId: owner.id, at: at - 6 * HOUR, duration: Math.round(between(120, 420)), text: 'Tư vấn và chốt đơn qua điện thoại' });
      if (rand() < 0.7) act({ customerId: id, type: 'care', staffId: care.id, at: at + 3 * DAY, outcome: 'connected', text: pick(['Khách hài lòng, chấm 5/5', 'Khách hài lòng, góp ý giao hàng hơi trễ', 'Khách hài lòng, hỏi thêm kệ tivi']) });
    }
  });

  // Live leads from conversations: owner, calls, stage according to age and outcome.
  customers.forEach((c, i) => {
    if (c.ownerId || !c.phone) { if (!c.stage) c.stage = 'new'; return; }
    const owner = sales[i % sales.length];
    const conv = conversations.find((v) => v.customerId === c.id);
    const interest = conv?.messages.find((m) => m.productIds?.length)?.productIds[0];
    const product = products.find((p) => p.id === interest);
    c.ownerId = owner.id;
    c.interestProductId = interest || null;
    c.expectedValue = product ? product.price * (product.category === 'Ghế' ? 4 : 1) : 0;
    c.phoneAt = (conv?.messages.find((m) => /\d{9}/.test(m.text))?.at) || c.firstSeen + 2 * 60000;
    act({ customerId: c.id, type: 'assign', staffId: owner.id, at: c.phoneAt + 1000, text: `Tự động phân cho ${owner.name}` });
    const firstCallAt = c.phoneAt + between(owner.speed[0], owner.speed[1]) * 60000;
    const bought = orders.filter((o) => o.customerId === c.id && o.status !== 'cancelled');
    const age = now - c.phoneAt;

    if (bought.length) {
      act({ customerId: c.id, type: 'call', outcome: 'connected', staffId: owner.id, at: firstCallAt, duration: Math.round(between(90, 360)), text: 'Xác nhận đơn, hẹn giao hàng' });
      c.stage = 'won';
      c.stageChangedAt = bought[0].createdAt;
      if (now - bought[0].createdAt > 3 * DAY && rand() < 0.75) act({ customerId: c.id, type: 'care', staffId: care.id, outcome: 'connected', at: bought[0].createdAt + 3 * DAY, text: pick(['Khách hài lòng, chấm 5/5', 'Khách hài lòng, cần thêm ghế', 'Khách góp ý màu hơi khác ảnh']) });
      else tasks.push({ id: uid(), customerId: c.id, staffId: care.id, type: 'call', kind: 'care', due: bought[0].createdAt + 3 * DAY, title: 'Gọi chăm sóc sau giao hàng (CSAT)', done: false });
      return;
    }

    if (age < DAY) {
      // Fresh leads: some not yet called (SLA risk), some with a missed call.
      if (firstCallAt < now && rand() < 0.6) {
        act({ customerId: c.id, type: 'call', outcome: rand() < 0.5 ? 'connected' : 'no_answer', staffId: owner.id, at: firstCallAt, duration: 60 });
        c.stage = 'contacting';
        c.stageChangedAt = firstCallAt;
        tasks.push({ id: uid(), customerId: c.id, staffId: owner.id, type: 'message', kind: 'cadence', step: 1, due: c.phoneAt + DAY, title: 'Gửi ảnh thực tế + báo giá qua Zalo', done: false });
      } else {
        c.stage = 'new';
        c.stageChangedAt = c.phoneAt;
        tasks.push({ id: uid(), customerId: c.id, staffId: owner.id, type: 'call', kind: 'cadence', step: 0, due: c.phoneAt + 15 * 60000, title: 'Gọi lần 1 – xác nhận nhu cầu, ngân sách', done: false });
      }
      return;
    }

    const connected = rand() < 0.72;
    act({ customerId: c.id, type: 'call', outcome: connected ? 'connected' : 'no_answer', staffId: owner.id, at: firstCallAt, duration: connected ? Math.round(between(60, 300)) : 0, text: connected ? 'Khách quan tâm, hỏi kích thước và giao hàng' : '' });
    if (!connected) act({ customerId: c.id, type: 'call', outcome: 'no_answer', staffId: owner.id, at: firstCallAt + 4 * HOUR, duration: 0 });
    const r = rand();
    const stageAt = Math.min(now - HOUR, firstCallAt + between(0.2, Math.min(6, age / DAY)) * DAY);
    if (!connected && r < 0.4) {
      c.stage = 'lost'; c.lostReason = 'Không liên lạc được';
      act({ customerId: c.id, type: 'call', outcome: 'no_answer', staffId: owner.id, at: firstCallAt + DAY, duration: 0 });
    } else if (r < 0.3) {
      c.stage = 'consulting';
      tasks.push({ id: uid(), customerId: c.id, staffId: owner.id, type: 'call', kind: 'cadence', step: 2, due: stageAt + 2 * DAY, title: 'Gọi lần 2 – giải đáp, mời xem showroom', done: false });
    } else if (r < 0.5) {
      c.stage = 'quoted';
      act({ customerId: c.id, type: 'quote', staffId: owner.id, at: stageAt, text: `Gửi báo giá ${product?.name || ''} qua Zalo` });
      tasks.push({ id: uid(), customerId: c.id, staffId: owner.id, type: 'call', kind: 'cadence', step: 3, due: stageAt + 2 * DAY, title: 'Gọi lần 3 – ưu đãi chốt đơn', done: false });
    } else if (r < 0.78) {
      c.stage = 'nurturing';
      c.nurtureReason = pick(['budget', 'budget', 'timing', 'compare']);
      c.nextNurtureAt = stageAt + 14 * DAY;
      act({ customerId: c.id, type: 'note', staffId: owner.id, at: stageAt, text: { budget: 'Khách hoãn mua, chờ ngân sách tháng sau', timing: 'Nhà đang sửa, khoảng 1-2 tháng nữa mới cần', compare: 'Khách đang tham khảo thêm 2 nơi' }[c.nurtureReason] });
      tasks.push({ id: uid(), customerId: c.id, staffId: owner.id, type: 'message', kind: 'nurture', due: c.nextNurtureAt, title: 'Chăm sóc định kỳ – gửi mẫu mới/ưu đãi', done: false });
    } else {
      c.stage = 'lost'; c.lostReason = pick(['Giá cao', 'Mua nơi khác', 'Không có nhu cầu thật']);
    }
    c.stageChangedAt = stageAt;
  });

  return { activities, tasks, staff: SEED_STAFF.map(({ speed, ...s }) => s), orderTotal };
}
