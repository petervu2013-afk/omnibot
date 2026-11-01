import { useState } from 'react';
import { ShoppingCart, Package, Users, Search, Plus, Download, Trash2, PackageOpen, Lock, Sparkles } from 'lucide-react';
import { useStore, money, orderTotal, timeAgo, nextOrderId } from '../store.jsx';
import { Modal, PlatformIcon, useToast } from '../components/ui.jsx';
import { setStage } from '../crm.js';
import { Warehouse, Truck, Landmark } from 'lucide-react';
import { SideMenu } from '../components/kit.jsx';
import { navigate } from '../router.js';
import { useAuth } from '../auth.jsx';
import { Combos, Coupons, Suppliers } from './pos/Catalog.jsx';
import { Categories, ProductList } from './pos/Products.jsx';
import { CustomerList } from './pos/Customers.jsx';
import { Warehouses, StockDocs, StockLevels } from './pos/Inventory.jsx';
import { Waybills, CashList, CashBook } from './pos/Finance.jsx';
import { exportForOrder } from '../ops.js';

export const ORDER_STATUS = {
  new: { label: 'Mới', cls: 'blue' },
  confirmed: { label: 'Đã xác nhận', cls: 'orange' },
  shipping: { label: 'Đang giao', cls: 'orange' },
  done: { label: 'Hoàn thành', cls: 'green' },
  cancelled: { label: 'Đã hủy', cls: 'red' },
};
const PAYMENT = { unpaid: 'Chưa thanh toán', cod: 'COD', paid: 'Đã thanh toán' };

const MENU = [
  { key: 'orders', label: 'Đơn hàng', icon: ShoppingCart },
  { key: 'g-products', label: 'Sản phẩm', icon: Package, children: [
    { key: 'products', label: 'Sản phẩm' }, { key: 'categories', label: 'Danh mục' }, { key: 'combos', label: 'Combo' }, { key: 'coupons', label: 'Coupon' }, { key: 'suppliers', label: 'Nhà cung cấp' },
  ] },
  { key: 'customers', label: 'Khách hàng', icon: Users },
  { key: 'g-store', label: 'Kho hàng', icon: Warehouse, children: [
    { key: 'warehouses', label: 'Danh sách' }, { key: 'import', label: 'Nhập kho' }, { key: 'export', label: 'Xuất kho' }, { key: 'transfer', label: 'Chuyển kho' }, { key: 'stock', label: 'Tồn kho' }, { key: 'check', label: 'Kiểm kho' },
  ] },
  { key: 'g-ship', label: 'Vận chuyển', icon: Truck, children: [{ key: 'waybills', label: 'Vận đơn' }] },
  { key: 'g-cash', label: 'Thu chi', icon: Landmark, children: [
    { key: 'receipts', label: 'Biên lai' }, { key: 'expenses', label: 'Phiếu chi' }, { key: 'cashbook', label: 'Sổ quỹ' },
  ] },
];

export default function Orders({ tab = 'orders' }) {
  const { can } = useAuth();
  const canCustomers = can('customer.access');
  const menu = MENU.filter((m) => m.key !== 'customers' || canCustomers);
  const page = tab === 'customers' && !canCustomers ? <div className="empty" data-testid="no-access"><Lock size={32} /><p>Bạn không có quyền xem mục này.</p></div> : {
    orders: <OrderList />, products: <ProductList />, customers: <CustomerList />,
    categories: <Categories />, combos: <Combos />, coupons: <Coupons />, suppliers: <Suppliers />,
    warehouses: <Warehouses />, import: <StockDocs kind="import" />, export: <StockDocs kind="export" />, transfer: <StockDocs kind="transfer" />, stock: <StockLevels />, check: <StockDocs kind="check" />,
    waybills: <Waybills />, receipts: <CashList kind="receipt" />, expenses: <CashList kind="expense" />, cashbook: <CashBook />,
  }[tab] || <OrderList />;
  return (
    <div className="with-sidebar">
      <SideMenu items={menu} active={tab} onSelect={(k) => navigate(`orders/${k}`)} />
      <div className="content">{page}</div>
    </div>
  );
}

function OrderList() {
  const { state, update } = useStore();
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [toast, toastNode] = useToast();

  const customer = (id) => state.customers.find((u) => u.id === id);
  const orders = state.orders
    .filter((o) => status === 'all' || o.status === status)
    .filter((o) => `${o.id} ${customer(o.customerId)?.name} ${customer(o.customerId)?.phone}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);

  const exportCsv = () => {
    const rows = [['Mã đơn', 'Khách hàng', 'SĐT', 'Trạng thái', 'Thanh toán', 'Tổng tiền', 'Ngày tạo']];
    orders.forEach((o) => {
      const c = customer(o.customerId);
      rows.push([o.id, c?.name, c?.phone, ORDER_STATUS[o.status].label, PAYMENT[o.payment], orderTotal(o, state.products), new Date(o.createdAt).toLocaleString('vi-VN')]);
    });
    const csv = '\uFEFF' + rows.map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'don-hang.csv';
    a.click();
  };

  return (
    <div className="card">
      <div className="row wrap" style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
        <select className="select" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Tất cả</option>
          {Object.entries(ORDER_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
        <div className="search" style={{ width: 260 }}><Search size={14} /><input className="input" placeholder="Mã đơn, tên, SĐT..." value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="grow" />
        <button className="btn" onClick={exportCsv}><Download size={15} /> Export</button>
        <button className="btn primary" onClick={() => setOpen(true)}><Plus size={15} /> Tạo đơn</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead><tr><th>Mã đơn</th><th>Khách hàng</th><th>Sản phẩm</th><th>Trạng thái</th><th>Thanh toán</th><th>Nguồn</th><th>Tổng tiền</th><th>Ngày tạo</th><th /></tr></thead>
          <tbody>
            {orders.map((o) => {
              const c = customer(o.customerId);
              const ch = state.channels.find((x) => x.id === o.channelId);
              return (
                <tr key={o.id}>
                  <td><b>#{o.id}</b>{o.createdBy === 'ai' && <div><span className="badge blue"><Sparkles size={10} /> AI chốt</span></div>}</td>
                  <td>{c?.name}<div className="muted small">{c?.phone}</div></td>
                  <td className="small">{o.items.map((it) => `${state.products.find((p) => p.id === it.productId)?.name} ×${it.qty}`).join(', ')}</td>
                  <td>
                    <select className="select" style={{ padding: '4px 6px', width: 130 }} value={o.status} onChange={(e) => update((d) => { d.orders.find((x) => x.id === o.id).status = e.target.value; })}>
                      {Object.entries(ORDER_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                    </select>
                  </td>
                  <td><span className={`badge ${o.payment === 'paid' ? 'green' : o.payment === 'cod' ? 'orange' : ''}`}>{PAYMENT[o.payment]}</span></td>
                  <td>{ch ? <span className="row small" style={{ gap: 4 }}><PlatformIcon platform={ch.platform} /> {ch.name}</span> : '—'}</td>
                  <td><b>{money(orderTotal(o, state.products))}</b></td>
                  <td className="muted small">{timeAgo(o.createdAt)} trước</td>
                  <td><button className="icon-btn" onClick={() => confirm(`Xóa đơn #${o.id}?`) && update((d) => { d.orders = d.orders.filter((x) => x.id !== o.id); })}><Trash2 size={15} color="var(--muted)" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {orders.length === 0 && <div className="empty"><PackageOpen size={36} /><div>Không tìm thấy đơn hàng nào phù hợp</div></div>}
      </div>
      <div className="muted small" style={{ padding: 14 }}>{orders.length} đơn hàng</div>
      {open && <OrderModal onClose={() => setOpen(false)} onSaved={(id) => { setOpen(false); toast(`Đã tạo đơn #${id}`); }} />}
      {toastNode}
    </div>
  );
}

export function OrderModal({ customerId, channelId, campaignId, conversationId, onClose, onSaved }) {
  const { state, update } = useStore();
  const [custId, setCustId] = useState(customerId || state.customers[0]?.id);
  const [items, setItems] = useState([{ productId: state.products[0]?.id, qty: 1 }]);
  const [payment, setPayment] = useState('cod');
  const [note, setNote] = useState('');
  const total = orderTotal({ items }, state.products);

  const save = () => {
    const id = nextOrderId(state.orders);
    update((d) => {
      d.orders.push({
        id, customerId: custId, channelId: channelId || null, campaignId: campaignId || d.customers.find((u) => u.id === custId)?.campaignId || null,
        conversationId: conversationId || null, items: items.filter((i) => i.productId && i.qty > 0), status: 'new', payment, createdAt: Date.now(), note, createdBy: 'agent',
      });
      exportForOrder(d, d.orders.at(-1));
      setStage(d, custId, 'won', { reason: `Đơn #${id}` });
    });
    onSaved(id);
  };

  return (
    <Modal title="Tạo đơn hàng" onClose={onClose} footer={<><span className="grow"><b>Tổng: {money(total)}</b></span><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" onClick={save} disabled={!custId || total <= 0}>Lưu đơn</button></>}>
      <label className="field">Khách hàng
        <select className="select" value={custId} onChange={(e) => setCustId(e.target.value)} disabled={!!customerId}>
          {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone && `– ${c.phone}`}</option>)}
        </select>
      </label>
      <div className="field">Sản phẩm
        {items.map((it, i) => (
          <div className="row" key={i}>
            <select className="select grow" value={it.productId} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))}>
              {state.products.map((p) => <option key={p.id} value={p.id}>{p.name} – {money(p.price)} (tồn {p.stock})</option>)}
            </select>
            <input className="input" type="number" min="1" style={{ width: 80 }} value={it.qty} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
            <button className="icon-btn" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          </div>
        ))}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setItems([...items, { productId: state.products[0]?.id, qty: 1 }])}><Plus size={13} /> Thêm sản phẩm</button>
      </div>
      <label className="field">Thanh toán
        <select className="select" value={payment} onChange={(e) => setPayment(e.target.value)}>
          {Object.entries(PAYMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="field">Ghi chú<textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></label>
    </Modal>
  );
}

