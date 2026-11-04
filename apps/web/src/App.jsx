import { useEffect, useState } from 'react';
import {
  Store, LayoutGrid, Gauge, Contact, Megaphone, MessageSquare, FileText, ShoppingCart, CalendarDays, BarChart3, Settings, Bell, ChevronDown, Bot,
} from 'lucide-react';
import { useStore } from './store.jsx';
import { Avatar } from './components/ui.jsx';
import { navigate } from './router.js';
import { useAuth } from './auth.jsx';
import { allowed, PAGE_PERMISSION, ROLE_LABEL } from './access.js';
import { LoginPage, RegisterPage, ForgotPage, ResetPage, VerifyPage, InvitePage, LegalPage } from './pages/auth/AuthPages.jsx';
import { ShieldCheck, LogOut, MailWarning, Lock, FlaskConical } from 'lucide-react';
import Home from './pages/Home.jsx';
import Dashboard from './pages/Dashboard.jsx';
import BotBuilder from './pages/BotBuilder.jsx';
import Livechat from './pages/Livechat.jsx';
import Crm from './pages/Crm.jsx';
import Posts from './pages/Posts.jsx';
import Orders from './pages/Orders.jsx';
import Booking from './pages/Booking.jsx';
import Reports from './pages/Reports.jsx';
import SettingsPage from './pages/Settings.jsx';
import Ads from './pages/Ads.jsx';

const NAV = [
  { path: 'home', label: 'Dashboard', icon: Gauge },
  { path: 'dashboard', label: 'Kênh & Bot', icon: LayoutGrid },
  { path: 'ads', label: 'Quảng cáo', icon: Megaphone },
  { path: 'livechat', label: 'Livechat', icon: MessageSquare },
  { path: 'crm', label: 'Khách hàng', icon: Contact },
  { path: 'posts', label: 'Bài viết', icon: FileText },
  { path: 'orders', label: 'Đơn hàng', icon: ShoppingCart },
  { path: 'booking', label: 'Lịch hẹn', icon: CalendarDays },
  { path: 'reports', label: 'Báo cáo', icon: BarChart3 },
  { path: 'settings', label: 'Cài đặt', icon: Settings },
];

function useHashRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '') || 'home';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

const PUBLIC = ['login', 'register', 'forgot', 'reset', 'verify', 'invite', 'legal'];

export default function App() {
  const route = useHashRoute();
  const { ready, user, offline, retry } = useAuth();
  const [section, param] = route.split('?')[0].split('/');

  if (!ready) return <div className="empty">Đang tải…</div>;
  if (!user && offline && !PUBLIC.includes(section)) return <div className="empty"><p>Không kết nối được máy chủ OmniBot.</p><button className="btn primary" onClick={retry}>Thử lại</button></div>;
  if (PUBLIC.includes(section)) {
    if (user && ['login', 'register', 'forgot'].includes(section)) {
      const next = new URLSearchParams(route.split('?')[1] || '').get('next');
      navigate(user.deletionRequestedAt ? 'settings/security' : next && !PUBLIC.includes(next.split(/[/?]/)[0]) ? next : 'home');
      return null;
    }
    if (section === 'login') return <LoginPage />;
    if (section === 'register') return <RegisterPage />;
    if (section === 'forgot') return <ForgotPage />;
    if (section === 'reset') return <ResetPage />;
    if (section === 'verify') return <VerifyPage />;
    if (section === 'invite') return <InvitePage />;
    return <LegalPage doc={param} />;
  }
  if (!user) { navigate(`login?next=${encodeURIComponent(route)}`); return null; }
  return <Shell route={route} section={section} param={param} />;
}

function NoAccess({ home }) {
  return <div className="empty" data-testid="no-access"><Lock size={32} /><p>Bạn không có quyền xem trang này.</p><button className="btn primary" onClick={() => navigate(home)}>Về trang chính</button></div>;
}
function NoShop() {
  return <div className="empty"><p>Bạn chưa thuộc cửa hàng nào đang hoạt động. Hãy nhờ quản trị viên mời lại.</p></div>;
}
function Empty() {
  return <div className="empty"><p>Chọn một mục trên thanh menu để bắt đầu.</p></div>;
}

function Shell({ route, section, param }) {
  const { state } = useStore();
  const { user, logout, resendVerification, shop, shops, switchShop, can } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const unread = state.conversations.reduce((s, c) => s + c.unread, 0);
  const verifyDaysLeft = user.verifyDeadline ? Math.max(0, Math.ceil((new Date(user.verifyDeadline) - Date.now()) / 86400000)) : 0;
  const menu = NAV.filter((n) => allowed(can, PAGE_PERMISSION[n.path]));
  const fallback = menu[0]?.path ?? 'settings';

  let page;
  switch (section) {
    case 'dashboard': page = <Dashboard tab="mine" />; break;
    case 'templates': page = <Dashboard tab="templates" />; break;
    case 'bot': page = <BotBuilder channelId={param} />; break;
    case 'livechat': page = <Livechat />; break;
    case 'crm': page = <Crm tab={param} />; break;
    case 'posts': page = <Posts />; break;
    case 'orders': page = <Orders tab={param} />; break;
    case 'booking': page = <Booking />; break;
    case 'reports': page = <Reports tab={param} />; break;
    case 'settings': page = <SettingsPage tab={param} />; break;
    case 'ads': page = <Ads key={route} tab={param} />; break;
    default: page = can('dashboard.view') ? <Home /> : <Empty />;
  }
  // Only the settings shown as real are stored on the server; other sections still run on browser sample data (Step 4B onward).
  const sampleData = section !== 'settings' && !(section === 'orders' && ['products', 'categories', 'customers'].includes(param));
  if (!shop) page = <NoShop />;
  else if (!allowed(can, PAGE_PERMISSION[section === '' ? 'home' : section] ?? null)) page = <NoAccess home={fallback} />;
  const activeNav = ['templates', 'bot'].includes(section) ? 'dashboard' : NAV.some((n) => n.path === section) ? section : 'home';

  return (
    <div className="app">
      <header className="topnav">
        <div className="brand" onClick={() => navigate('home')}>
          <Bot size={24} /> <span>OmniBot</span>
        </div>
        <nav className="nav-items">
          {menu.map(({ path, label, icon: Icon }) => (
            <button key={path} className={`nav-item ${activeNav === path ? 'active' : ''}`} title={label} onClick={() => navigate(path)}>
              <Icon size={16} /> <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="nav-right">
          <button className="icon-btn" title="Thông báo" onClick={() => navigate('livechat')}>
            <Bell size={18} />
            {unread > 0 && <span className="dot">{unread}</span>}
          </button>
          <div className="user-menu">
            <button className="nav-user icon-btn" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}>
              <span>{shop?.name ?? 'Chưa có cửa hàng'}</span> <ChevronDown size={14} />
              <Avatar name={user.fullName} />
            </button>
            {menuOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="menu-pop">
                  <div className="menu-head"><b>{user.fullName}</b><span className="muted small">{user.email}</span>{shop && <span className="badge blue" data-testid="current-role" style={{ alignSelf: 'flex-start' }}>{ROLE_LABEL[shop.role]} · {shop.name}</span>}</div>
                  {shops.length > 1 && shops.filter((s) => s.id !== shop?.id).map((s) => (
                    <button key={s.id} onClick={() => { setMenuOpen(false); switchShop(s.id); }}><Store size={15} /> Chuyển sang {s.name} ({ROLE_LABEL[s.role]})</button>
                  ))}
                  <button onClick={() => { setMenuOpen(false); navigate('settings/security'); }}><ShieldCheck size={15} /> Tài khoản & bảo mật</button>
                  <button onClick={() => { setMenuOpen(false); navigate('settings/info'); }}><Settings size={15} /> Cài đặt cửa hàng</button>
                  <button className="danger" onClick={() => { setMenuOpen(false); logout(); }}><LogOut size={15} /> Đăng xuất</button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      {!user.emailVerifiedAt && (
        <div className="verify-banner">
          <MailWarning size={15} />
          <span className="grow">Email <b>{user.email}</b> chưa được xác minh. Hãy mở liên kết trong email (còn {verifyDaysLeft} ngày sử dụng trước khi bị giới hạn).</span>
          <button className="btn sm" onClick={() => { resendVerification(); setVerifySent(true); }}>{verifySent ? 'Đã gửi lại' : 'Gửi lại email xác minh'}</button>
        </div>
      )}
      {sampleData && shop && <div className="verify-banner" data-testid="sample-banner"><FlaskConical size={15} /><span className="grow">Trang này đang hiển thị <b>dữ liệu mẫu</b> lưu trên trình duyệt, chưa phải dữ liệu thật của cửa hàng.</span></div>}
      <main className="main">{page}</main>
    </div>
  );
}
