import { useState } from 'react';
import { ShoppingCart, Package, Users, Search, Plus, Download, Trash2, PackageOpen, ScanSearch, Sparkles } from 'lucide-react';
import { useStore, uid, money, orderTotal, timeAgo, nextOrderId } from '../store.jsx';
import { Modal, PlatformIcon, Avatar, useToast, productEmoji } from '../components/ui.jsx';
import CatalogScanModal from '../components/CatalogScanModal.jsx';
import { setStage } from '../crm.js';
import { Warehouse, Truck, Landmark } from 'lucide-react';
import { SideMenu } from '../components/kit.jsx';
import { navigate } from '../router.js';
import { Categories, Combos, Coupons, Suppliers } from './pos/Catalog.jsx';
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
  const page = {
    orders: <OrderList />, products: <ProductList />, customers: <CustomerList />,
    categories: <Categories />, combos: <Combos />, coupons: <Coupons />, suppliers: <Suppliers />,
    warehouses: <Warehouses />, import: <StockDocs kind="import" />, export: <StockDocs kind="export" />, transfer: <StockDocs kind="transfer" />, stock: <StockLevels />, check: <StockDocs kind="check" />,
    waybills: <Waybills />, receipts: <CashList kind="receipt" />, expenses: <CashList kind="expense" />, cashbook: <CashBook />,
  }[tab] || <OrderList />;
  return (
    <div className="with-sidebar">
      <SideMenu items={MENU} active={tab} onSelect={(k) => navigate(`orders/${k}`)} />
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

function ProductList() {
  const { state, update } = useStore();
  const [draft, setDraft] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [toast, toastNode] = useToast();
  const save = () => {
    update((d) => {
      const existing = d.products.find((p) => p.id === draft.id);
      if (existing) Object.assign(existing, draft); else d.products.push({ ...draft, id: uid() });
    });
    setDraft(null);
  };
  // How often the AI recommended each product, from product cards attached to AI replies.
  const mentions = {};
  state.conversations.forEach((v) => v.messages.forEach((m) => m.from === 'ai' && m.productIds?.forEach((id) => { mentions[id] = (mentions[id] || 0) + 1; })));
  const missingDesc = state.products.filter((p) => !p.description).length;

  return (
    <div className="card">
      <div className="row wrap" style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
        <h3 className="grow">Danh mục sản phẩm ({state.products.length})</h3>
        <button className="btn" onClick={() => setScanOpen(true)}><ScanSearch size={15} /> Quét danh mục</button>
        <button className="btn primary" onClick={() => setDraft({ sku: '', name: '', category: '', price: 0, stock: 0, description: '' })}><Plus size={15} /> Thêm sản phẩm</button>
      </div>
      <div className="muted small" style={{ padding: '10px 14px', background: '#f8fafc' }}>
        <Sparkles size={12} /> AI đọc toàn bộ danh mục (tên, giá, tồn kho, mô tả) để tư vấn và chốt đơn. Mô tả càng chi tiết, AI trả lời càng chính xác.
        {missingDesc > 0 && <b style={{ color: 'var(--orange)' }}> {missingDesc} sản phẩm chưa có mô tả.</b>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Giá bán</th><th>Tồn kho</th><th>AI gợi ý</th><th /></tr></thead>
          <tbody>
            {state.products.map((p) => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setDraft({ ...p })}>
                <td>
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 22 }}>{productEmoji(p)}</span>
                    <div><b>{p.name}</b><div className="muted small">{p.sku}</div><div className="small" style={{ maxWidth: 380 }}>{p.description || <i className="muted">Chưa có mô tả</i>}</div></div>
                  </div>
                </td>
                <td>{p.category}</td>
                <td>{money(p.price)}</td>
                <td><span className={`badge ${p.stock <= 0 ? 'red' : p.stock < 5 ? 'orange' : 'green'}`}>{p.stock <= 0 ? 'Hết' : p.stock}</span></td>
                <td>{mentions[p.id] || 0} lần</td>
                <td><button className="icon-btn" onClick={(e) => { e.stopPropagation(); update((d) => { d.products = d.products.filter((x) => x.id !== p.id); }); }}><Trash2 size={15} color="var(--muted)" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft && (
        <Modal title={draft.id ? 'Sửa sản phẩm' : 'Thêm sản phẩm'} onClose={() => setDraft(null)} footer={<><button className="btn" onClick={() => setDraft(null)}>Hủy</button><button className="btn primary" onClick={save} disabled={!draft.name}>Lưu</button></>}>
          <div className="form-grid">
            <label className="field">Mã SKU<input className="input" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} /></label>
            <label className="field">Tên sản phẩm<input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="field">Danh mục<input className="input" list="categories" value={draft.category || ''} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></label>
            <label className="field">Giá bán<input className="input" type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} /></label>
            <label className="field">Tồn kho<input className="input" type="number" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: Number(e.target.value) })} /></label>
          </div>
          <datalist id="categories">{[...new Set(state.products.map((p) => p.category).filter(Boolean))].map((c) => <option key={c} value={c} />)}</datalist>
          <label className="field">Mô tả cho AI (chất liệu, kích thước, điểm nổi bật)<textarea className="textarea" value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        </Modal>
      )}
      {scanOpen && <CatalogScanModal onClose={() => setScanOpen(false)} onImported={(n) => { setScanOpen(false); toast(`Đã nhập ${n} sản phẩm vào danh mục`); }} />}
      {toastNode}
    </div>
  );
}

function CustomerList() {
  const { state } = useStore();
  return (
    <div className="card">
      <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}><h3>Khách hàng ({state.customers.length})</h3></div>
      <table className="table">
        <thead><tr><th>Khách hàng</th><th>SĐT</th><th>Nhãn</th><th>Số đơn</th><th>Tổng chi tiêu</th></tr></thead>
        <tbody>
          {state.customers.map((c) => {
            const orders = state.orders.filter((o) => o.customerId === c.id);
            return (
              <tr key={c.id}>
                <td><div className="row"><Avatar name={c.name} size="sm" /> {c.name}</div></td>
                <td>{c.phone || <span className="muted">—</span>}</td>
                <td><div className="chips">{c.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div></td>
                <td>{orders.length}</td>
                <td>{money(orders.reduce((s, o) => s + orderTotal(o, state.products), 0))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
