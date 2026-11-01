// Sample data for the mobile UI templates. Replaced by the OmniBot API in Step 17 (see docs/IMPLEMENTATION_PLAN.md).
export type Platform = 'facebook' | 'zalo' | 'instagram' | 'tiktok' | 'website';
export type Sender = 'customer' | 'ai' | 'agent';
export interface Message {
  id: string;
  from: Sender;
  text: string;
  at: number;
  productIds?: string[];
}
export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  tags: string[];
  stage: string;
  owner: string;
  expectedValue: number;
  source?: string;
}
export interface Conversation {
  id: string;
  customerId: string;
  channel: Platform;
  channelName: string;
  unread: number;
  aiActive: boolean;
  handoff?: string;
  messages: Message[];
}
export interface Task {
  id: string;
  customerId: string;
  title: string;
  type: 'call' | 'message';
  kind: string;
  due: number;
  done: boolean;
}
export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  price: number;
  stock: { main: number; showroom: number };
}
export type OrderStatus = 'new' | 'confirmed' | 'shipping' | 'done' | 'cancelled';
export interface Order {
  id: string;
  customerId: string;
  items: { productId: string; qty: number }[];
  status: OrderStatus;
  payment: 'cod' | 'paid' | 'unpaid';
  createdAt: number;
  createdBy: 'ai' | 'agent';
  shipping?: { carrier: string; code: string };
}
export interface Notification {
  id: string;
  kind: 'message' | 'lead' | 'task' | 'order' | 'stock';
  title: string;
  body: string;
  at: number;
  read: boolean;
  link?: string;
}
export interface Device {
  id: string;
  name: string;
  platform: 'web' | 'android' | 'ios';
  lastActive: number;
  current?: boolean;
}

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.now();

export const PLATFORM_LABEL: Record<Platform, { label: string; color: string; icon: string }> = {
  facebook: { label: 'Facebook', color: '#1877f2', icon: 'logo-facebook' },
  zalo: { label: 'Zalo OA', color: '#0068ff', icon: 'chatbubble-ellipses' },
  instagram: { label: 'Instagram', color: '#e1306c', icon: 'logo-instagram' },
  tiktok: { label: 'TikTok', color: '#111827', icon: 'logo-tiktok' },
  website: { label: 'Website', color: '#16a34a', icon: 'globe-outline' },
};

export const products: Product[] = [
  { id: 'p1', sku: 'BA-SOI-16', barcode: '8930000000011', name: 'Bàn ăn gỗ sồi 1m6', category: 'Bàn ăn', price: 6500000, stock: { main: 8, showroom: 4 } },
  { id: 'p2', sku: 'BA-OC-18', barcode: '8930000000028', name: 'Bàn ăn gỗ óc chó 1m8', category: 'Bàn ăn', price: 15900000, stock: { main: 2, showroom: 1 } },
  { id: 'p3', sku: 'SF-L-28', barcode: '8930000000035', name: 'Sofa góc L 2m8', category: 'Sofa', price: 14900000, stock: { main: 3, showroom: 1 } },
  { id: 'p4', sku: 'SF-V-22', barcode: '8930000000042', name: 'Sofa văng da 2m2', category: 'Sofa', price: 9800000, stock: { main: 5, showroom: 2 } },
  { id: 'p5', sku: 'KS-OC-80', barcode: '8930000000059', name: 'Kệ sách gỗ óc chó', category: 'Kệ & tủ', price: 3200000, stock: { main: 14, showroom: 6 } },
  { id: 'p6', sku: 'TV-SOI-18', barcode: '8930000000066', name: 'Kệ tivi gỗ sồi 1m8', category: 'Kệ & tủ', price: 4500000, stock: { main: 6, showroom: 3 } },
  { id: 'p7', sku: 'GH-CF-01', barcode: '8930000000073', name: 'Ghế cafe gỗ tràm', category: 'Ghế', price: 650000, stock: { main: 45, showroom: 15 } },
  { id: 'p8', sku: 'GN-SOI-16', barcode: '8930000000080', name: 'Giường ngủ gỗ sồi 1m6', category: 'Giường', price: 8900000, stock: { main: 0, showroom: 0 } },
];

export const customers: Customer[] = [
  {
    id: 'c1',
    name: 'Nguyễn Minh Anh',
    phone: '0938123456',
    address: '12 Võ Văn Ngân, Thủ Đức, TP.HCM',
    tags: ['Khách mới'],
    stage: 'consulting',
    owner: 'Ngọc Trâm',
    expectedValue: 6500000,
    source: 'FB | Tin nhắn | Bàn ăn gỗ sồi',
  },
  { id: 'c2', name: 'Trần Hoàng Long', phone: '0909111222', address: '', tags: ['Quan tâm sofa'], stage: 'new', owner: 'Minh Quân', expectedValue: 14900000, source: 'FB | Tin nhắn | Sofa góc' },
  { id: 'c3', name: 'Lê Thu Hà', phone: '0987654321', address: '45 Lê Lợi, Q.1, TP.HCM', tags: ['VIP'], stage: 'won', owner: 'Ngọc Trâm', expectedValue: 4500000 },
  {
    id: 'c4',
    name: 'Bùi Ngọc Mai',
    phone: '0912888999',
    address: '8 Phan Xích Long, Phú Nhuận',
    tags: ['Hoãn ngân sách'],
    stage: 'quoted',
    owner: 'Hải Yến',
    expectedValue: 9800000,
    source: 'TT | Video | Ghế cafe giá xưởng',
  },
  { id: 'c5', name: 'Đặng Gia Huy', phone: '0977222333', address: '', tags: ['Có SĐT'], stage: 'contacting', owner: 'Ngọc Trâm', expectedValue: 3200000, source: 'GG | Search | Nội thất gỗ HCM' },
];

export const conversations: Conversation[] = [
  {
    id: 'v1',
    customerId: 'c1',
    channel: 'facebook',
    channelName: 'Nội Thất Gỗ Việt',
    unread: 2,
    aiActive: true,
    messages: [
      { id: 'm1', from: 'customer', text: 'Shop ơi bàn ăn gỗ sồi giá bao nhiêu ạ?', at: now - 14 * MIN },
      {
        id: 'm2',
        from: 'ai',
        text: 'Dạ bàn ăn gỗ sồi 1m6 giá 6.500.000đ, gỗ sồi Mỹ, kèm 4 ghế, hợp gia đình 4–6 người ạ. Nhà mình mấy người để em tư vấn kích thước ạ?',
        at: now - 14 * MIN + 3000,
        productIds: ['p1'],
      },
      { id: 'm3', from: 'customer', text: 'Nhà mình 5 người. Có giao Thủ Đức không shop?', at: now - 3 * MIN },
    ],
  },
  {
    id: 'v2',
    customerId: 'c2',
    channel: 'facebook',
    channelName: 'Nội Thất Gỗ Việt',
    unread: 1,
    aiActive: false,
    handoff: 'Khách muốn xem mẫu vải thực tế',
    messages: [
      { id: 'm4', from: 'customer', text: 'Sofa góc L còn màu xám không?', at: now - 95 * MIN },
      { id: 'm5', from: 'ai', text: 'Dạ sofa góc L 2m8 còn màu xám ạ, giá 14.900.000đ.', at: now - 95 * MIN + 2500, productIds: ['p3'] },
      { id: 'm6', from: 'customer', text: 'Cho anh xem mẫu vải thật được không, gặp nhân viên giúp anh', at: now - 90 * MIN },
    ],
  },
  {
    id: 'v3',
    customerId: 'c3',
    channel: 'zalo',
    channelName: 'Gỗ Việt Official',
    unread: 0,
    aiActive: true,
    messages: [
      { id: 'm7', from: 'customer', text: 'Cho mình hỏi kệ tivi gỗ sồi còn không', at: now - 45 * MIN },
      { id: 'm8', from: 'ai', text: 'Dạ kệ tivi gỗ sồi 1m8 còn hàng ạ, giá 4.500.000đ. Chị muốn em lên đơn giao về 45 Lê Lợi như lần trước không ạ?', at: now - 45 * MIN + 2000, productIds: ['p6'] },
    ],
  },
  {
    id: 'v4',
    customerId: 'c4',
    channel: 'tiktok',
    channelName: 'Gỗ Việt Xưởng',
    unread: 0,
    aiActive: true,
    messages: [
      { id: 'm9', from: 'customer', text: 'Ghế cafe giá sỉ bao nhiêu shop', at: now - 5 * HOUR },
      { id: 'm10', from: 'ai', text: 'Dạ ghế cafe gỗ tràm 650.000đ/chiếc, từ 10 chiếc bên em giảm 5% ạ.', at: now - 5 * HOUR + 2000, productIds: ['p7'] },
    ],
  },
  {
    id: 'v5',
    customerId: 'c5',
    channel: 'website',
    channelName: 'goviet.vn',
    unread: 0,
    aiActive: true,
    messages: [
      { id: 'm11', from: 'customer', text: 'Kệ sách óc chó có mấy tầng?', at: now - DAY },
      { id: 'm12', from: 'ai', text: 'Dạ kệ sách gỗ óc chó 5 tầng, 80x180cm, chịu lực 30kg/tầng ạ.', at: now - DAY + 2000, productIds: ['p5'] },
    ],
  },
];

export const tasks: Task[] = [
  { id: 't1', customerId: 'c2', title: 'Gọi lần 1 – xác nhận nhu cầu, ngân sách', type: 'call', kind: 'Lịch bám đuổi', due: now - 75 * MIN, done: false },
  { id: 't2', customerId: 'c4', title: 'Gọi lần 3 – ưu đãi chốt đơn', type: 'call', kind: 'Lịch bám đuổi', due: now - 2 * DAY, done: false },
  { id: 't3', customerId: 'c1', title: 'Gửi ảnh thực tế + báo giá qua Zalo', type: 'message', kind: 'Lịch bám đuổi', due: now + 3 * HOUR, done: false },
  { id: 't4', customerId: 'c3', title: 'Gọi chăm sóc sau giao hàng (CSAT)', type: 'call', kind: 'CSKH sau bán', due: now + 5 * HOUR, done: false },
  { id: 't5', customerId: 'c5', title: 'Gọi lại lần 2 (lần trước không nghe máy)', type: 'call', kind: 'Gọi lại', due: now + 2 * DAY, done: false },
];

export const orders: Order[] = [
  { id: 'DH1026', customerId: 'c1', items: [{ productId: 'p1', qty: 1 }], status: 'new', payment: 'unpaid', createdAt: now - 20 * MIN, createdBy: 'ai' },
  {
    id: 'DH1025',
    customerId: 'c3',
    items: [{ productId: 'p6', qty: 1 }],
    status: 'shipping',
    payment: 'cod',
    createdAt: now - DAY,
    createdBy: 'agent',
    shipping: { carrier: 'GHN', code: 'GHN83920114' },
  },
  { id: 'DH1024', customerId: 'c4', items: [{ productId: 'p7', qty: 10 }], status: 'confirmed', payment: 'paid', createdAt: now - 2 * DAY, createdBy: 'ai' },
  {
    id: 'DH1023',
    customerId: 'c5',
    items: [
      { productId: 'p5', qty: 1 },
      { productId: 'p7', qty: 2 },
    ],
    status: 'done',
    payment: 'paid',
    createdAt: now - 4 * DAY,
    createdBy: 'agent',
    shipping: { carrier: 'GHTK', code: 'S1234567.BO' },
  },
];

export const notifications: Notification[] = [
  { id: 'n1', kind: 'message', title: 'Tin nhắn mới – Nguyễn Minh Anh', body: 'Nhà mình 5 người. Có giao Thủ Đức không shop?', at: now - 3 * MIN, read: false, link: '/chats/v1' },
  { id: 'n2', kind: 'lead', title: 'Lead mới được giao cho bạn', body: 'Trần Hoàng Long – quan tâm Sofa góc L 2m8', at: now - 88 * MIN, read: false, link: '/tasks' },
  { id: 'n3', kind: 'order', title: 'AI vừa chốt đơn #DH1026', body: 'Bàn ăn gỗ sồi 1m6 – 6.500.000 ₫', at: now - 20 * MIN, read: false, link: '/orders/DH1026' },
  { id: 'n4', kind: 'task', title: '2 việc bám đuổi quá hạn', body: 'Gọi Trần Hoàng Long, Bùi Ngọc Mai', at: now - 2 * HOUR, read: true, link: '/tasks' },
  { id: 'n5', kind: 'stock', title: 'Sắp hết hàng', body: 'Bàn ăn gỗ óc chó 1m8 còn 3 sản phẩm', at: now - 6 * HOUR, read: true, link: '/more/inventory' },
];

export const devices: Device[] = [
  { id: 'd1', name: 'Điện thoại này', platform: 'ios', lastActive: now, current: true },
  { id: 'd2', name: 'Chrome trên Windows', platform: 'web', lastActive: now - 20 * MIN },
  { id: 'd3', name: 'OmniBot trên Android', platform: 'android', lastActive: now - 3 * DAY },
];

export const kpis = { revenue: 36700000, target: 76000000, orders: 5, newLeads: 30, uncontacted: 1, overdue: 2, adSpend: 3679000, roas: 9.98, aiAutomation: 0.9 };
export const risks = [
  { customerId: 'c2', reason: 'Chưa được gọi sau 1 giờ (SLA 15 phút)' },
  { customerId: 'c4', reason: 'Kẹt ở "Đã báo giá" 9 ngày · việc quá hạn 2 ngày' },
];
