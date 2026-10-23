import { useState } from 'react';
import { Store, Users, MessageSquareText, Plug, Trash2, Plus, RotateCcw } from 'lucide-react';
import { useStore, uid } from '../store.jsx';
import { Avatar, useToast } from '../components/ui.jsx';
import Security from './settings/Security.jsx';
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
  const page = {
    info: <ShopInfo />, security: <Security />, staff: <Staff />, sale: <SaleSettings />, replies: <ReplyTemplates />, plan: <PlanSettings />, schedule: <ScheduleSettings />,
    payment: <PaymentSettings />, trigger: <Triggers />, history: <SystemHistory />, refsrc: <RefSrc />, shipping: <ShippingSettings />,
    inventory: <InventorySettings />, points: <PointsSettings />, integrations: <Integrations />,
  }[tab] || <ShopInfo />;
  return (
    <div className="with-sidebar">
      <SideMenu title="Cài đặt shop" items={TABS} active={TABS.some((t) => t.key === tab) ? tab : 'info'} onSelect={(k) => navigate(`settings/${k}`)} />
      <div className="content">
        <div style={{ maxWidth: 980, margin: '0 auto' }}>{page}</div>
      </div>
    </div>
  );
}

function ShopInfo() {
  const { state, update, reset } = useStore();
  const [form, setForm] = useState(state.shop);
  const [toast, toastNode] = useToast();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <>
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h3>Thông tin chung</h3>
        <div className="form-grid">
          <label className="field">Tên shop<input className="input" value={form.name} onChange={set('name')} /></label>
          <label className="field">Lĩnh vực
            <select className="select" value={form.field} onChange={set('field')}>
              {['Nội thất', 'Thời trang', 'F&B', 'Làm đẹp', 'Bất động sản', 'Giáo dục', 'Khác'].map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className="field">Email<input className="input" type="email" value={form.email} onChange={set('email')} /></label>
          <label className="field">Hotline<input className="input" value={form.hotline} onChange={set('hotline')} /></label>
          <label className="field">Tiền tệ<select className="select" value={form.currency} onChange={set('currency')}><option>VND</option><option>USD</option></select></label>
          <label className="field">Múi giờ<select className="select" value={form.timezone} onChange={set('timezone')}><option>Asia/Ho_Chi_Minh</option><option>Asia/Bangkok</option></select></label>
          <label className="field">Ngôn ngữ<select className="select" value={form.language} onChange={set('language')}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label>
          <label className="row small" style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" checked={form.emailNotify} onChange={set('emailNotify')} /> Nhận email thông báo</label>
        </div>
        <div><button className="btn primary" onClick={() => { update((d) => { d.shop = form; }); toast('Đã lưu thiết lập'); }}>Lưu thiết lập</button></div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <button className="btn ghost muted" onClick={() => confirm('Khôi phục toàn bộ dữ liệu mẫu? Dữ liệu hiện tại sẽ mất.') && reset()}><RotateCcw size={14} /> Khôi phục dữ liệu mẫu</button>
      </div>
      {toastNode}
    </>
  );
}

function Staff() {
  const { state, update } = useStore();
  const [form, setForm] = useState({ name: '', email: '', role: 'Sale' });
  const add = () => { update((d) => { d.staff.push({ ...form, id: uid() }); }); setForm({ name: '', email: '', role: 'Sale' }); };
  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3>Nhân viên ({state.staff.length})</h3>
      {state.staff.map((s) => (
        <div key={s.id} className="row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
          <Avatar name={s.name} size="sm" />
          <div className="grow"><b>{s.name}</b><div className="muted small">{s.email}</div></div>
          {s.role === 'Sale' && (
            <label className="row small muted" title="Mục tiêu doanh số tháng">Mục tiêu/tháng
              <input className="input" type="number" step="1000000" style={{ width: 130 }} value={s.monthlyTarget || 0} onChange={(e) => update((d) => { d.staff.find((x) => x.id === s.id).monthlyTarget = Number(e.target.value); })} />
            </label>
          )}
          <span className="badge blue">{s.role}</span>
          {s.role !== 'Chủ shop' && <button className="icon-btn" onClick={() => update((d) => { d.staff = d.staff.filter((x) => x.id !== s.id); })}><Trash2 size={15} color="var(--muted)" /></button>}
        </div>
      ))}
      <div className="row wrap">
        <input className="input grow" style={{ width: 160 }} placeholder="Họ tên" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input grow" style={{ width: 180 }} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <select className="select" style={{ width: 120 }} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>Sale</option><option>CSKH</option><option>Quản lý</option></select>
        <button className="btn primary" onClick={add} disabled={!form.name}><Plus size={14} /> Thêm</button>
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
