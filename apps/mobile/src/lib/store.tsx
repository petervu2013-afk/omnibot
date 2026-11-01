// In-memory app state for the UI templates: demo session + sample data with the main actions wired up.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import * as mock from '@/data/mock';
import type { Conversation, Order, Task, Notification, Device, OrderStatus } from '@/data/mock';

export const DEMO = { email: 'admin@goviet.vn', password: 'Demo@1234' };

export interface User {
  name: string;
  email: string;
  shop: string;
  role: 'Admin' | 'Manager' | 'Sale' | 'Thủ kho';
}

interface AppState {
  user: User | null;
  notice: string | null;
  biometrics: boolean;
  pushPrefs: Record<string, boolean>;
  conversations: Conversation[];
  tasks: Task[];
  orders: Order[];
  notifications: Notification[];
  devices: Device[];
  signIn: (email: string, password: string) => string | null;
  register: (name: string, email: string, shop: string) => void;
  signOut: (notice?: string) => void;
  setBiometrics: (v: boolean) => void;
  setPushPref: (k: string, v: boolean) => void;
  openConversation: (id: string) => void;
  sendMessage: (id: string, text: string) => void;
  setAi: (id: string, on: boolean) => void;
  completeTask: (id: string, outcome: 'connected' | 'no_answer' | 'done') => void;
  createOrder: (customerId: string, items: { productId: string; qty: number }[]) => string;
  setOrderStatus: (id: string, s: OrderStatus) => void;
  readNotification: (id: string) => void;
  readAll: () => void;
  revokeDevice: (id: string) => void;
}

const Ctx = createContext<AppState | null>(null);
const uid = () => Math.random().toString(36).slice(2, 9);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(0);
  const [biometrics, setBiometrics] = useState(false);
  const [pushPrefs, setPushPrefs] = useState<Record<string, boolean>>({ message: true, lead: true, task: true, order: true, stock: false });
  const [conversations, setConversations] = useState(mock.conversations);
  const [tasks, setTasks] = useState(mock.tasks);
  const [orders, setOrders] = useState(mock.orders);
  const [notifications, setNotifications] = useState(mock.notifications);
  const [devices, setDevices] = useState(mock.devices);

  const value = useMemo<AppState>(
    () => ({
      user,
      notice,
      biometrics,
      pushPrefs,
      conversations,
      tasks,
      orders,
      notifications,
      devices,
      signIn: (email, password) => {
        if (failed >= 5) return 'Tài khoản tạm khóa 15 phút do nhập sai nhiều lần.';
        if (email.trim().toLowerCase() !== DEMO.email || password !== DEMO.password) {
          setFailed(failed + 1);
          return failed + 1 >= 3 ? `Email hoặc mật khẩu không đúng. Còn ${Math.max(0, 5 - failed - 1)} lần thử.` : 'Email hoặc mật khẩu không đúng.';
        }
        setFailed(0);
        setNotice(null);
        setUser({ name: 'Quản trị viên', email: DEMO.email, shop: 'Gỗ Việt', role: 'Admin' });
        return null;
      },
      register: (name, email, shop) => setUser({ name, email, shop, role: 'Admin' }),
      signOut: (msg) => {
        setUser(null);
        setNotice(msg ?? null);
      },
      setBiometrics,
      setPushPref: (k, v) => setPushPrefs((p) => ({ ...p, [k]: v })),
      openConversation: (id) => setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, unread: 0 } : c))),
      sendMessage: (id, text) => setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, aiActive: false, messages: [...c.messages, { id: uid(), from: 'agent', text, at: Date.now() }] } : c))),
      setAi: (id, on) => setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, aiActive: on, handoff: on ? undefined : c.handoff } : c))),
      completeTask: (id, outcome) =>
        setTasks((ts) => {
          const t = ts.find((x) => x.id === id);
          const rest = ts.map((x) => (x.id === id ? { ...x, done: true } : x));
          // Not picked up: schedule a retry in 4 hours, like the CRM process on the web.
          if (t && outcome === 'no_answer') rest.push({ ...t, id: uid(), title: 'Gọi lại (lần trước không nghe máy)', kind: 'Gọi lại', due: Date.now() + 4 * 3600000, done: false });
          return rest;
        }),
      createOrder: (customerId, items) => {
        const id = `DH${1027 + orders.length - mock.orders.length}`;
        setOrders((os) => [{ id, customerId, items, status: 'new', payment: 'unpaid', createdAt: Date.now(), createdBy: 'agent' }, ...os]);
        return id;
      },
      setOrderStatus: (id, s) => setOrders((os) => os.map((o) => (o.id === id ? { ...o, status: s } : o))),
      readNotification: (id) => setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n))),
      readAll: () => setNotifications((ns) => ns.map((n) => ({ ...n, read: true }))),
      revokeDevice: (id) => setDevices((ds) => ds.filter((d) => d.id !== id)),
    }),
    [user, notice, failed, biometrics, pushPrefs, conversations, tasks, orders, notifications, devices],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}

export const customerOf = (id: string) => mock.customers.find((c) => c.id === id)!;
export const productOf = (id: string) => mock.products.find((p) => p.id === id)!;
export const orderTotal = (o: Pick<Order, 'items'>) => o.items.reduce((s, it) => s + (productOf(it.productId)?.price ?? 0) * it.qty, 0);
