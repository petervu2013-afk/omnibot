// Sample operations data: catalog extras, warehouses & stock documents, waybills, cash book,
// broadcasts, triggers and shop settings. Pure (no store imports) so store.jsx can call it.
const DAY = 86400000;

export const DEFAULT_SETTINGS = {
  sale: { orders: 'mine_unassigned', customers: 'mine_unassigned', conversations: 'mine_unassigned', assignMode: 'rr_online', receiving: {} },
  schedule: { days: [1, 2, 3, 4, 5, 6], from: '08:00', to: '21:00' },
  payment: {
    checkoutConnected: false,
    smsBanking: true,
    methods: { cod: true, bank: true, vietqr: true, card: false },
    bankAccounts: [{ bank: 'Ngân hàng ABC', number: '0123456789', holder: 'CTY GO VIET' }],
  },
  shipping: { addressType: 'new', rules: { alwaysFree: false, freeOver: 5000000, hnHcm: 0, province: 300000, min: 0 }, carriers: { ghn: true, ghtk: true, viettel: false, self: true } },
  inventory: { autoExport: true, allowNegative: false, lowStock: 5 },
  points: { enabled: true, earnPer: 100000, pointValue: 1000, minRedeem: 50 },
  plan: { name: 'BUSINESS', expires: null, quotas: [['Page / kênh', 10], ['Khách hàng', 50000], ['Nhân viên', 10], ['Dung lượng (GB)', 20], ['Credits AI / tháng', 20000], ['Tin nhắn hàng loạt / tháng', 100000]] },
};

export function seedOps({ products, orders, customers, staff, rand, now, uid, orderTotal }) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const code = (prefix, n) => `${prefix}${String(n).padStart(5, '0')}`;

  const categories = [...new Set(products.map((p) => p.category))].map((name, i) => ({ id: 'cat' + i, name, description: '', active: true }));
  const suppliers = [
    { id: 'sp1', code: 'NCC001', name: 'Xưởng gỗ Bình Dương', phone: '0274 3800 123', address: 'KCN Tân Uyên, Bình Dương', description: 'Bàn ăn, kệ gỗ sồi', active: true },
    { id: 'sp2', code: 'NCC002', name: 'Sofa Đông Á', phone: '028 3899 456', address: 'Q.12, TP.HCM', description: 'Khung sofa, nệm', active: true },
    { id: 'sp3', code: 'NCC003', name: 'Gỗ tràm Hưng Phát', phone: '0251 3666 789', address: 'Biên Hòa, Đồng Nai', description: 'Ghế cafe', active: true },
  ];
  const combos = [
    { id: 'cb1', name: 'Combo bàn ăn sồi + 2 ghế cafe', items: [{ productId: 'p1', qty: 1 }, { productId: 'p7', qty: 2 }], price: 7400000, active: true },
    { id: 'cb2', name: 'Combo phòng khách: sofa văng + kệ tivi', items: [{ productId: 'p4', qty: 1 }, { productId: 'p6', qty: 1 }], price: 13500000, active: true },
  ];
  const coupons = [
    { id: 'cp_1', code: 'GOVIET10', type: 'percent', value: 10, minOrder: 5000000, limit: 100, used: 23, expires: now + 30 * DAY, active: true },
    { id: 'cp_2', code: 'FREESHIP', type: 'amount', value: 300000, minOrder: 3000000, limit: 200, used: 61, expires: now + 10 * DAY, active: true },
    { id: 'cp_3', code: 'KHACHCU500', type: 'amount', value: 500000, minOrder: 8000000, limit: 50, used: 4, expires: now - 2 * DAY, active: false },
  ];
  const warehouses = [
    { id: 'wh1', code: 'KHO01', name: 'Kho tổng Thủ Đức', address: '25 Võ Văn Ngân', ward: 'Linh Chiểu', district: 'Thủ Đức', province: 'TP.HCM', manager: 'Lâm Văn Tài', phone: '0901 222 333', isDefault: true },
    { id: 'wh2', code: 'KHO02', name: 'Showroom Q.1', address: '123 Nguyễn Trãi', ward: 'Bến Thành', district: 'Quận 1', province: 'TP.HCM', manager: 'Ngọc Trâm', phone: '0901 444 555', isDefault: false },
  ];
  const stockLevels = products.flatMap((p) => {
    const main = Math.round(p.stock * 0.7);
    return [{ productId: p.id, warehouseId: 'wh1', qty: main, updatedAt: now - rand() * 5 * DAY }, { productId: p.id, warehouseId: 'wh2', qty: p.stock - main, updatedAt: now - rand() * 5 * DAY }];
  });

  const stockDocs = [];
  let n = 1;
  for (let i = 0; i < 6; i++) {
    const p = pick(products);
    const sup = suppliers.find((s) => (p.category === 'Sofa' ? s.id === 'sp2' : p.category === 'Ghế' ? s.id === 'sp3' : s.id === 'sp1'));
    const qty = p.category === 'Ghế' ? 20 : 3 + Math.floor(rand() * 5);
    stockDocs.push({ id: uid(), code: code('PN', n++), kind: 'import', warehouseId: 'wh1', supplierId: sup.id, items: [{ productId: p.id, qty, cost: Math.round(p.price * 0.6) }], createdBy: 's1', createdAt: now - (25 - i * 4) * DAY, updatedAt: now - (25 - i * 4) * DAY, note: 'Nhập hàng định kỳ', status: 'done' });
  }
  orders.filter((o) => ['shipping', 'done'].includes(o.status) && o.createdAt > now - 30 * DAY).slice(0, 12).forEach((o) => {
    stockDocs.push({ id: uid(), code: code('PX', n++), kind: 'export', warehouseId: 'wh1', orderId: o.id, items: o.items.map((it) => ({ productId: it.productId, qty: it.qty })), createdBy: 's1', createdAt: o.createdAt + 3600000, updatedAt: o.createdAt + 3600000, note: `Xuất bán đơn #${o.id}`, status: 'done' });
  });
  stockDocs.push({ id: uid(), code: code('PC', n++), kind: 'transfer', warehouseId: 'wh1', toWarehouseId: 'wh2', items: [{ productId: 'p4', qty: 2 }, { productId: 'p5', qty: 3 }], createdBy: 's1', createdAt: now - 6 * DAY, updatedAt: now - 5 * DAY, note: 'Bổ sung hàng trưng bày', status: 'done' });
  stockDocs.push({ id: uid(), code: code('PK', n++), kind: 'check', warehouseId: 'wh2', items: products.slice(0, 4).map((p) => ({ productId: p.id, qty: 0, system: Math.round(p.stock * 0.3), counted: Math.round(p.stock * 0.3) - (p.id === 'p7' ? 1 : 0) })), createdBy: 's1', createdAt: now - 2 * DAY, updatedAt: now - 2 * DAY, note: 'Kiểm kho cuối tháng', status: 'draft' });

  const carriers = ['GHN', 'GHTK', 'Tự giao'];
  const waybills = orders.filter((o) => ['shipping', 'done'].includes(o.status)).map((o, i) => {
    const cust = customers.find((c) => c.id === o.customerId);
    const carrier = pick(carriers);
    return { id: uid(), orderId: o.id, code: carrier === 'Tự giao' ? `TG${1000 + i}` : `${carrier}${Math.floor(rand() * 9e8 + 1e8)}`, carrier, receiver: cust?.name || '', phone: cust?.phone || '', address: cust?.address || '', fee: carrier === 'Tự giao' ? 0 : Math.round((200 + rand() * 300)) * 1000, cod: o.payment === 'cod' ? orderTotal(o, products) : 0, status: o.status === 'done' ? 'delivered' : 'in_transit', createdAt: o.createdAt + 2 * 3600000 };
  });

  const cashTx = [];
  let r = 1;
  let e = 1;
  orders.filter((o) => o.payment === 'paid' && o.status !== 'cancelled').forEach((o) => {
    cashTx.push({ id: uid(), code: code('PT', r++), kind: 'receipt', amount: orderTotal(o, products), method: pick(['bank', 'bank', 'cash', 'cod']), description: `Thu tiền đơn #${o.id}`, orderId: o.id, paidAt: o.createdAt + DAY, createdBy: 's1', createdAt: o.createdAt + DAY, status: 'done' });
  });
  const expenseItems = [['Chi phí quảng cáo Facebook', 4200000], ['Chi phí quảng cáo Google', 2600000], ['Thuê mặt bằng showroom', 25000000], ['Lương nhân viên', 48000000], ['Phí vận chuyển GHN', 3100000], ['Nhập hàng Xưởng gỗ Bình Dương', 32000000]];
  expenseItems.forEach(([desc, amount], i) => {
    cashTx.push({ id: uid(), code: code('PC', e++), kind: 'expense', amount, method: 'bank', description: desc, paidAt: now - (20 - i * 3) * DAY, createdBy: 's1', createdAt: now - (20 - i * 3) * DAY, status: 'done' });
  });

  const broadcasts = [
    { id: uid(), name: 'Flash sale bàn ăn cuối tuần', channel: 'messenger', audience: { stages: ['consulting', 'quoted'], tags: [], within24h: true }, message: 'Chào {{ten}}, cuối tuần này bàn ăn gỗ sồi giảm 15%, chỉ còn 5.525.000đ. Anh/chị nhắn "GIỮ" để em giữ giá nhé!', scheduledAt: now - 3 * DAY, status: 'sent', stats: { target: 86, sent: 81, read: 63, replied: 17, failed: 5 }, createdBy: 's2' },
    { id: uid(), name: 'Chăm sóc khách hoãn ngân sách – trả góp 0%', channel: 'zalo', audience: { stages: ['nurturing'], tags: [], within24h: false }, message: 'Gỗ Việt gửi {{ten}}: chương trình trả góp 0% trong 6 tháng cho đơn từ 10 triệu. Xem mẫu mới tại goviet.vn', scheduledAt: now + DAY, status: 'scheduled', stats: { target: 30, sent: 0, read: 0, replied: 0, failed: 0 }, createdBy: 's2' },
  ];

  const triggers = [
    { id: uid(), type: 'order', event: 'confirmed', action: 'send_message', message: 'Cảm ơn {{ten}} đã đặt hàng! Đơn #{{ma_don}} đã được xác nhận.', active: true },
    { id: uid(), type: 'shipping', event: 'shipped', action: 'send_message', message: 'Đơn #{{ma_don}} đang được giao, mã vận đơn {{ma_van_don}}.', active: true },
    { id: uid(), type: 'payment', event: 'paid', action: 'add_tag', tag: 'Đã thanh toán', active: true },
  ];

  const systemLogs = [
    { id: uid(), staffId: 's1', action: 'Kết nối Fanpage "Nội Thất Gỗ Việt"', at: now - 40 * DAY },
    { id: uid(), staffId: 's1', action: 'Phân sale: bật chia đều cho người online', at: now - 30 * DAY },
    { id: uid(), staffId: 's1', action: 'Kết nối TikTok "Gỗ Việt Xưởng"', at: now - 30 * DAY },
    { id: uid(), staffId: 's1', action: 'Ngắt kết nối Zalo OA (token hết hạn) – đã kết nối lại', at: now - 12 * DAY },
  ];

  const pointsLedger = customers.filter((c) => c.stage === 'won').slice(0, 20).map((c) => {
    const spent = orders.filter((o) => o.customerId === c.id && o.status !== 'cancelled').reduce((s, o) => s + orderTotal(o, products), 0);
    return { customerId: c.id, points: Math.floor(spent / DEFAULT_SETTINGS.points.earnPer), updatedAt: now - rand() * 10 * DAY };
  });

  return { categories, suppliers, combos, coupons, warehouses, stockLevels, stockDocs, waybills, cashTx, broadcasts, triggers, systemLogs, pointsLedger };
}
