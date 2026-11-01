import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useStore, uid, money } from '../../store.jsx';
import { DataTable, FormModal, Status, fmtDay } from '../../components/kit.jsx';
import { Switch } from '../../components/ui.jsx';

const Header = ({ title, desc }) => <div style={{ marginBottom: 14 }}><h2>{title}</h2>{desc && <div className="muted small">{desc}</div>}</div>;
const RowActions = ({ onEdit, onDelete }) => (
  <div className="row" style={{ gap: 2 }}>
    <button className="icon-btn" title="Sửa" onClick={(e) => { e.stopPropagation(); onEdit(); }}><Pencil size={14} /></button>
    <button className="icon-btn" title="Xóa" onClick={(e) => { e.stopPropagation(); if (confirm('Xóa mục này?')) onDelete(); }}><Trash2 size={14} color="var(--red)" /></button>
  </div>
);

// Generic CRUD screen over one state collection.
function CrudPage({ title, desc, collection, fields, columns, search, tabs, newLabel, toRecord = (v) => v, toForm = (r) => r }) {
  const { state, update } = useStore();
  const [edit, setEdit] = useState(null);
  const rows = state[collection] || [];
  const save = (v) => {
    update((d) => {
      d[collection] = d[collection] || [];
      if (edit.id) Object.assign(d[collection].find((x) => x.id === edit.id), toRecord(v, d));
      else d[collection].push({ id: uid(), ...toRecord(v, d) });
    });
    setEdit(null);
  };
  return (
    <>
      <Header title={title} desc={desc} />
      <DataTable
        rows={rows}
        search={search}
        tabs={tabs}
        exportName={collection}
        onRowClick={(r) => setEdit(r)}
        actions={<button className="btn primary" onClick={() => setEdit({})}><Plus size={15} /> {newLabel}</button>}
        columns={[...columns, { key: '_a', label: '', render: (r) => <RowActions onEdit={() => setEdit(r)} onDelete={() => update((d) => { d[collection] = d[collection].filter((x) => x.id !== r.id); })} /> }]}
      />
      {edit && <FormModal title={edit.id ? `Sửa ${newLabel.toLowerCase()}` : newLabel} fields={fields} initial={edit.id ? toForm(edit) : {}} onClose={() => setEdit(null)} onSave={save} />}
    </>
  );
}

export function Categories() {
  const { state } = useStore();
  const count = (name) => state.products.filter((p) => p.category === name).length;
  return (
    <CrudPage
      title="Danh mục" desc="Nhóm sản phẩm để AI tư vấn, lọc báo cáo và đồng bộ lên Facebook Shop." collection="categories" newLabel="Thêm danh mục"
      search={(r) => r.name}
      fields={[{ key: 'name', label: 'Tên danh mục', required: true }, { key: 'description', label: 'Mô tả', type: 'textarea' }, { key: 'active', label: 'Hiển thị', type: 'checkbox' }]}
      columns={[
        { key: 'name', label: 'Tên danh mục', render: (r) => <b>{r.name}</b> },
        { key: 'count', label: 'Số sản phẩm', render: (r) => count(r.name), csv: (r) => count(r.name) },
        { key: 'description', label: 'Mô tả' },
        { key: 'active', label: 'Trạng thái', render: (r) => (r.active ? <Status tone="green">Hiển thị</Status> : <Status>Ẩn</Status>), csv: (r) => (r.active ? 'Hiển thị' : 'Ẩn') },
      ]}
    />
  );
}

export function Combos() {
  const { state, update } = useStore();
  const name = (id) => state.products.find((p) => p.id === id)?.name;
  const retail = (c) => c.items.reduce((s, it) => s + (state.products.find((p) => p.id === it.productId)?.price || 0) * it.qty, 0);
  return (
    <CrudPage
      title="Combo" desc="Gói sản phẩm bán kèm với giá ưu đãi – AI sẽ gợi ý combo khi khách hỏi sản phẩm trong gói." collection="combos" newLabel="Tạo combo"
      search={(r) => r.name}
      tabs={[{ key: 'all', label: 'Tất cả' }, { key: 'on', label: 'Đang bán', filter: (r) => r.active }, { key: 'off', label: 'Ngừng bán', filter: (r) => !r.active }]}
      fields={[
        { key: 'name', label: 'Tên combo', required: true, full: true },
        { key: 'p1', label: 'Sản phẩm 1', type: 'select', options: state.products.map((p) => [p.id, p.name]) },
        { key: 'q1', label: 'Số lượng', type: 'number' },
        { key: 'p2', label: 'Sản phẩm 2', type: 'select', options: [['', '—'], ...state.products.map((p) => [p.id, p.name])] },
        { key: 'q2', label: 'Số lượng', type: 'number' },
        { key: 'price', label: 'Giá combo (đ)', type: 'number', required: true },
        { key: 'active', label: 'Đang bán', type: 'checkbox' },
      ]}
      toForm={(r) => ({ ...r, p1: r.items[0]?.productId, q1: r.items[0]?.qty, p2: r.items[1]?.productId || '', q2: r.items[1]?.qty || 0 })}
      toRecord={(v) => ({ name: v.name, price: v.price, active: v.active, items: [{ productId: v.p1, qty: v.q1 || 1 }, ...(v.p2 ? [{ productId: v.p2, qty: v.q2 || 1 }] : [])] })}
      columns={[
        { key: 'name', label: 'Combo', render: (r) => <b>{r.name}</b> },
        { key: 'items', label: 'Gồm', render: (r) => <span className="small">{r.items.map((it) => `${name(it.productId)} ×${it.qty}`).join(' + ')}</span>, csv: (r) => r.items.map((it) => `${name(it.productId)} x${it.qty}`).join(' + ') },
        { key: 'retail', label: 'Giá lẻ', render: (r) => <s className="muted">{money(retail(r))}</s>, csv: (r) => retail(r) },
        { key: 'price', label: 'Giá combo', render: (r) => <b>{money(r.price)}</b> },
        { key: 'save', label: 'Tiết kiệm', render: (r) => `${Math.round((1 - r.price / (retail(r) || 1)) * 100)}%` },
        { key: 'active', label: 'Mở bán', render: (r) => <span onClick={(e) => e.stopPropagation()}><Switch on={r.active} onChange={(v) => update((d) => { d.combos.find((x) => x.id === r.id).active = v; })} /></span>, csv: (r) => (r.active ? 'Có' : 'Không') },
      ]}
    />
  );
}

export function Coupons() {
  const now = Date.now();
  return (
    <CrudPage
      title="Coupon" desc="Mã giảm giá dùng khi tạo đơn, trong tin nhắn hàng loạt và AI chatbot." collection="coupons" newLabel="Tạo mã giảm giá"
      search={(r) => r.code}
      tabs={[{ key: 'all', label: 'Tất cả' }, { key: 'on', label: 'Còn hiệu lực', filter: (r) => r.active && r.expires > now }, { key: 'off', label: 'Hết hạn / tắt', filter: (r) => !r.active || r.expires <= now }]}
      fields={[
        { key: 'code', label: 'Mã', required: true },
        { key: 'type', label: 'Loại', type: 'select', options: [['percent', 'Giảm %'], ['amount', 'Giảm số tiền']] },
        { key: 'value', label: 'Giá trị', type: 'number', required: true },
        { key: 'minOrder', label: 'Đơn tối thiểu (đ)', type: 'number' },
        { key: 'limit', label: 'Số lượt dùng tối đa', type: 'number' },
        { key: 'expiresStr', label: 'Hết hạn', type: 'date', required: true },
        { key: 'active', label: 'Kích hoạt', type: 'checkbox' },
      ]}
      toForm={(r) => ({ ...r, expiresStr: new Date(r.expires).toISOString().slice(0, 10) })}
      toRecord={(v) => ({ code: v.code.toUpperCase().replace(/\s/g, ''), type: v.type, value: v.value, minOrder: v.minOrder, limit: v.limit, expires: new Date(v.expiresStr).getTime() + 86399000, active: v.active, used: v.used || 0 })}
      columns={[
        { key: 'code', label: 'Mã', render: (r) => <code style={{ fontWeight: 700 }}>{r.code}</code> },
        { key: 'value', label: 'Giảm', render: (r) => (r.type === 'percent' ? `${r.value}%` : money(r.value)) },
        { key: 'minOrder', label: 'Đơn tối thiểu', render: (r) => money(r.minOrder) },
        { key: 'used', label: 'Đã dùng', render: (r) => `${r.used || 0}/${r.limit || '∞'}` },
        { key: 'expires', label: 'Hết hạn', render: (r) => fmtDay(r.expires), csv: (r) => fmtDay(r.expires) },
        { key: 'st', label: 'Trạng thái', render: (r) => (r.active && r.expires > now ? <Status tone="green">Hiệu lực</Status> : <Status tone="red">Hết hiệu lực</Status>) },
      ]}
    />
  );
}

export function Suppliers() {
  return (
    <CrudPage
      title="Nhà cung cấp" collection="suppliers" newLabel="Thêm nhà cung cấp"
      search={(r) => `${r.name} ${r.code} ${r.phone}`}
      tabs={[{ key: 'all', label: 'Tất cả' }, { key: 'on', label: 'Đang hợp tác', filter: (r) => r.active }, { key: 'off', label: 'Ngừng', filter: (r) => !r.active }]}
      fields={[
        { key: 'name', label: 'Tên nhà cung cấp', required: true }, { key: 'code', label: 'Mã nhà cung cấp', required: true },
        { key: 'phone', label: 'Số điện thoại' }, { key: 'address', label: 'Địa chỉ' },
        { key: 'description', label: 'Mô tả', type: 'textarea' }, { key: 'active', label: 'Đang hợp tác', type: 'checkbox' },
      ]}
      columns={[
        { key: 'name', label: 'Tên nhà cung cấp', render: (r) => <b>{r.name}</b> },
        { key: 'code', label: 'Mã nhà cung cấp' }, { key: 'phone', label: 'Số điện thoại' }, { key: 'address', label: 'Địa chỉ' }, { key: 'description', label: 'Mô tả' },
        { key: 'active', label: 'Trạng thái', render: (r) => (r.active ? <Status tone="green">Đang hợp tác</Status> : <Status>Ngừng</Status>) },
      ]}
    />
  );
}
