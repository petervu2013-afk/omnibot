import { Store, Users, MessageSquareText, Plug, Lock } from 'lucide-react';
import { allowed, SETTINGS_PERMISSION } from '../access.js';
import { useAuth } from '../auth.jsx';
import Security from './settings/Security.jsx';
import ShopInfo from './settings/ShopInfo.jsx';
import Staff from './settings/Staff.jsx';
import { ShieldCheck, Handshake, Package, CalendarClock, CreditCard, Zap, History, Link2, Truck, Boxes, Award } from 'lucide-react';
import { SideMenu } from '../components/kit.jsx';
import { navigate } from '../router.js';
import {
  SaleSettings, ReplyTemplates, PlanSettings, ScheduleSettings, PaymentSettings, Triggers, SystemHistory, RefSrc, ShippingSettings, InventorySettings, PointsSettings,
} from './settings/More.jsx';

const TABS = [
  { key: 'info', label: 'Thông tin', icon: Store },
  { key: 'security', label: 'Tài khoản & bảo mật', icon: ShieldCheck },
  { key: 'staff', label: 'Nhân viên', icon: Users },
  { key: 'sale', label: 'Sale', icon: Handshake },
  { key: 'replies', label: 'Tin nhắn mẫu', icon: MessageSquareText },
  { key: 'plan', label: 'Gói phần mềm', icon: Package },
  { key: 'schedule', label: 'Lịch làm việc', icon: CalendarClock },
  { key: 'payment', label: 'Thanh toán', icon: CreditCard },
  { key: 'trigger', label: 'Trigger', icon: Zap },
  { key: 'history', label: 'Lịch sử', icon: History },
  { key: 'refsrc', label: 'Ref & Src', icon: Link2 },
  { key: 'shipping', label: 'Vận chuyển', icon: Truck },
  { key: 'inventory', label: 'Tồn kho', icon: Boxes },
  { key: 'points', label: 'Tích điểm', icon: Award },
  { key: 'integrations', label: 'Tích hợp API', icon: Plug },
];

export default function SettingsPage({ tab = 'info' }) {
  const { can, shop } = useAuth();
  const visible = TABS.filter((t) => allowed(can, SETTINGS_PERMISSION[t.key]));
  const current = TABS.some((t) => t.key === tab) ? tab : 'info';
  const page = !shop && current !== 'security' ? null : !allowed(can, SETTINGS_PERMISSION[current]) ? <div className="empty" data-testid="no-access"><Lock size={32} /><p>Bạn không có quyền xem mục này.</p></div> : {
    info: <ShopInfo />, security: <Security />, staff: <Staff />, sale: <SaleSettings />, replies: <ReplyTemplates />, plan: <PlanSettings />, schedule: <ScheduleSettings />,
    payment: <PaymentSettings />, trigger: <Triggers />, history: <SystemHistory />, refsrc: <RefSrc />, shipping: <ShippingSettings />,
    inventory: <InventorySettings />, points: <PointsSettings />, integrations: <Integrations />,
  }[tab] || <ShopInfo />;
  return (
    <div className="with-sidebar">
      <SideMenu title="Cài đặt shop" items={visible} active={current} onSelect={(k) => navigate(`settings/${k}`)} />
      <div className="content">
        <div style={{ maxWidth: 980, margin: '0 auto' }}>{page}</div>
      </div>
    </div>
  );
}


function Integrations() {
  const rows = [
    { name: 'Facebook Messenger', desc: 'Graph API + Webhook nhận tin nhắn Page', status: 'Cần backend' },
    { name: 'Zalo Official Account', desc: 'Zalo OA API v3 – gửi/nhận tin nhắn', status: 'Cần backend' },
    { name: 'Instagram Direct', desc: 'Instagram Messaging API qua Meta app', status: 'Cần backend' },
    { name: 'AI trả lời tự động', desc: 'Claude API trả lời khi không khớp kịch bản', status: 'Tùy chọn' },
    { name: 'Google Calendar', desc: 'Đồng bộ lịch hẹn', status: 'Tùy chọn' },
  ];
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3>Tích hợp API</h3>
      <div className="muted small">Bản hiện tại chạy hoàn toàn trên trình duyệt với dữ liệu giả lập. Để nhận tin nhắn thật, cần thêm máy chủ backend kết nối các API dưới đây.</div>
      {rows.map((r) => (
        <div key={r.name} className="row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
          <Plug size={18} color="var(--primary)" />
          <div className="grow"><b>{r.name}</b><div className="muted small">{r.desc}</div></div>
          <span className="badge orange">{r.status}</span>
        </div>
      ))}
    </div>
  );
}
