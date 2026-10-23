import { useState } from 'react';
import { Plus, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { useStore, uid, money } from '../../store.jsx';
import { DataTable, FormModal, Status, StatCards, fmtDate } from '../../components/kit.jsx';
import { Modal, productEmoji, useToast } from '../../components/ui.jsx';
import { DOC_KINDS, nextCode, completeStockDoc, docValue } from '../../ops.js';

const DOC_STATUS = { draft: ['Nháp', 'orange'], done: ['Hoàn tất', 'green'], cancelled: ['Đã hủy', 'red'] };

export function Warehouses() {
  const { state, update } = useStore();
  const [edit, setEdit] = useState(null);
  const fields = [
    { key: 'code', label: 'Mã kho', required: true }, { key: 'name', label: 'Tên kho', required: true },
    { key: 'address', label: 'Địa chỉ', full: true }, { key: 'ward', label: 'Phường/xã' }, { key: 'district', label: 'Quận/huyện' }, { key: 'province', label: 'Tỉnh thành' },
    { key: 'manager', label: 'Người quản lý' }, { key: 'phone', label: 'Số điện thoại' }, { key: 'isDefault', label: 'Kho mặc định (xuất bán)', type: 'checkbox' },
  ];
  return (
    <>
      <h2 style={{ marginBottom: 14 }}>Kho</h2>
      <DataTable
        rows={state.warehouses}
        search={(r) => `${r.code} ${r.name}`}
        exportName="kho"
        onRowClick={setEdit}
        actions={<button className="btn primary" onClick={() => setEdit({})}><Plus size={15} /> Thêm kho</button>}
        columns={[
          { key: 'code', label: 'Mã kho' }, { key: 'name', label: 'Tên kho', render: (r) => <b>{r.name}</b> }, { key: 'address', label: 'Địa chỉ' },
          { key: 'ward', label: 'Phường/xã' }, { key: 'district', label: 'Quận/huyện' }, { key: 'province', label: 'Tỉnh thành' },
          { key: 'manager', label: 'Người quản lý' }, { key: 'phone', label: 'Số điện thoại' },
          { key: 'isDefault', label: 'Mặc định', render: (r) => (r.isDefault ? <Status tone="blue">Mặc định</Status> : ''), csv: (r) => (r.isDefault ? 'Có' : '') },
        ]}
      />
      {edit && (
        <FormModal title={edit.id ? 'Sửa kho' : 'Thêm kho'} fields={fields} initial={edit} onClose={() => setEdit(null)} onSave={(v) => {
          update((d) => {
            if (v.isDefault) d.warehouses.forEach((w) => { w.isDefault = false; });
            if (edit.id) Object.assign(d.warehouses.find((w) => w.id === edit.id), v); else d.warehouses.push({ id: uid(), ...v });
          });
          setEdit(null);
        }} />
      )}
    </>
  );
}

export function StockDocs({ kind }) {
  const { state, update } = useStore();
  const [creating, setCreating] = useState(false);
  const [toast, toastNode] = useToast();
  const wh = (id) => state.warehouses.find((w) => w.id === id)?.name || '—';
  const staff = (id) => state.staff.find((s) => s.id === id)?.name || '—';
  const docs = state.stockDocs.filter((x) => x.kind === kind).sort((a, b) => b.createdAt - a.createdAt);
  const act = (doc, action) => {
    update((d) => { if (action === 'done') completeStockDoc(d, doc.id); else { const x = d.stockDocs.find((y) => y.id === doc.id); x.status = 'cancelled'; x.updatedAt = Date.now(); } });
    toast(action === 'done' ? 'Đã hoàn tất phiếu, tồn kho đã được cập nhật' : 'Đã hủy phiếu');
  };
  const qtyOf = (r) => r.items.reduce((s, it) => s + (it.qty || 0), 0);
  const cols = [
    { key: 'code', label: 'Mã phiếu', render: (r) => <b>{r.code}</b> },
    ...(kind === 'transfer'
      ? [{ key: 'status', label: 'Trạng thái', render: (r) => <Status tone={DOC_STATUS[r.status][1]}>{DOC_STATUS[r.status][0]}</Status>, csv: (r) => DOC_STATUS[r.status][0] }, { key: 'from', label: 'Kho gốc', render: (r) => wh(r.warehouseId) }, { key: 'to', label: 'Kho nhận', render: (r) => wh(r.toWarehouseId) }]
      : [{ key: 'wh', label: kind === 'check' ? 'Kho kiểm hàng' : 'Kho', render: (r) => wh(r.warehouseId), csv: (r) => wh(r.warehouseId) }]),
    ...(kind === 'import' ? [{ key: 'sup', label: 'Nhà cung cấp', render: (r) => state.suppliers.find((s) => s.id === r.supplierId)?.name || '—' }] : []),
    ...(kind === 'export' ? [{ key: 'order', label: 'Đơn hàng', render: (r) => (r.orderId ? `#${r.orderId}` : 'Xuất khác') }] : []),
    { key: 'by', label: 'Người tạo', render: (r) => staff(r.createdBy), csv: (r) => staff(r.createdBy) },
    ...(kind === 'transfer' ? [{ key: 'qty', label: 'SL hàng chuyển', align: 'right', render: qtyOf, csv: qtyOf }] : []),
    ...(kind === 'import' || kind === 'export' ? [{ key: 'value', label: 'Giá trị', align: 'right', render: (r) => money(docValue(r, state.products)), csv: (r) => docValue(r, state.products) }] : []),
    ...(kind === 'check' ? [{ key: 'diff', label: 'Chênh lệch', align: 'right', render: (r) => { const n = r.items.reduce((s, it) => s + (it.counted - it.system), 0); return <span className={n ? 'metric-bad' : 'metric-good'}>{n > 0 ? '+' : ''}{n}</span>; } }] : []),
    { key: 'createdAt', label: 'Ngày tạo', render: (r) => fmtDate(r.createdAt), csv: (r) => fmtDate(r.createdAt) },
    { key: 'updatedAt', label: 'Cập nhật cuối', render: (r) => fmtDate(r.updatedAt), csv: (r) => fmtDate(r.updatedAt) },
    { key: 'note', label: 'Ghi chú' },
    ...(kind !== 'transfer' ? [{ key: 'status', label: 'Trạng thái', render: (r) => <Status tone={DOC_STATUS[r.status][1]}>{DOC_STATUS[r.status][0]}</Status>, csv: (r) => DOC_STATUS[r.status][0] }] : []),
    { key: '_a', label: '', render: (r) => r.status === 'draft' && (
      <div className="row" style={{ gap: 2 }}>
        <button className="icon-btn" title="Hoàn tất (cập nhật tồn kho)" onClick={() => act(r, 'done')}><CheckCircle2 size={16} color="var(--green)" /></button>
        <button className="icon-btn" title="Hủy phiếu" onClick={() => act(r, 'cancel')}><XCircle size={16} color="var(--red)" /></button>
      </div>
    ) },
  ];
  return (
    <>
      <h2 style={{ marginBottom: 14 }}>{DOC_KINDS[kind].label}</h2>
      <DataTable
        rows={docs}
        search={(r) => `${r.code} ${r.note} ${r.orderId || ''}`}
        tabs={[{ key: 'all', label: 'Tất cả' }, ...Object.entries(DOC_STATUS).map(([k, [l]]) => ({ key: k, label: l, filter: (r) => r.status === k }))]}
        exportName={DOC_KINDS[kind].prefix}
        actions={<button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> Tạo {DOC_KINDS[kind].label.toLowerCase()}</button>}
        columns={cols}
      />
      {creating && <DocModal kind={kind} onClose={() => setCreating(false)} onSaved={(m) => { setCreating(false); toast(m); }} />}
      {toastNode}
    </>
  );
}

function DocModal({ kind, onClose, onSaved }) {
  const { state, update } = useStore();
  const def = state.warehouses.find((w) => w.isDefault)?.id || state.warehouses[0]?.id;
  const [warehouseId, setWh] = useState(def);
  const [toWarehouseId, setTo] = useState(state.warehouses.find((w) => w.id !== def)?.id);
  const [supplierId, setSup] = useState(state.suppliers[0]?.id);
  const [note, setNote] = useState('');
  const stockAt = (pid, whId) => state.stockLevels.find((l) => l.productId === pid && l.warehouseId === whId)?.qty || 0;
  const [items, setItems] = useState(() => (kind === 'check'
    ? state.products.map((p) => ({ productId: p.id, system: stockAt(p.id, def), counted: stockAt(p.id, def) }))
    : [{ productId: state.products[0]?.id, qty: 1, cost: Math.round((state.products[0]?.price || 0) * 0.6) }]));
  const setItem = (i, patch) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = (complete) => {
    update((d) => {
      const doc = { id: uid(), code: nextCode(d.stockDocs, DOC_KINDS[kind].prefix), kind, warehouseId, toWarehouseId: kind === 'transfer' ? toWarehouseId : undefined, supplierId: kind === 'import' ? supplierId : undefined, items: kind === 'check' ? items : items.filter((x) => x.qty > 0), createdBy: 's1', createdAt: Date.now(), updatedAt: Date.now(), note, status: 'draft' };
      d.stockDocs.push(doc);
      if (complete) completeStockDoc(d, doc.id);
    });
    onSaved(complete ? 'Đã lưu và cập nhật tồn kho' : 'Đã lưu nháp');
  };

  return (
    <Modal wide title={`Tạo ${DOC_KINDS[kind].label.toLowerCase()}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn" onClick={() => save(false)}>Lưu nháp</button><button className="btn primary" onClick={() => save(true)} disabled={kind === 'transfer' && warehouseId === toWarehouseId}>Hoàn tất</button></>}>
      <div className="form-grid">
        <label className="field">{kind === 'transfer' ? 'Kho gốc' : 'Kho'}<select className="select" value={warehouseId} onChange={(e) => { setWh(e.target.value); if (kind === 'check') setItems(items.map((x) => ({ ...x, system: stockAt(x.productId, e.target.value), counted: stockAt(x.productId, e.target.value) }))); }}>{state.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        {kind === 'transfer' && <label className="field">Kho nhận<select className="select" value={toWarehouseId} onChange={(e) => setTo(e.target.value)}>{state.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
        {kind === 'import' && <label className="field">Nhà cung cấp<select className="select" value={supplierId} onChange={(e) => setSup(e.target.value)}>{state.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      </div>
      <table className="table">
        <thead><tr><th>Sản phẩm</th>{kind === 'check' ? <><th>Tồn hệ thống</th><th>Thực tế</th><th>Lệch</th></> : <><th>Tồn tại kho</th><th>Số lượng</th>{kind === 'import' && <th>Giá nhập</th>}<th /></>}</tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>{kind === 'check' ? <span>{productEmoji(state.products.find((p) => p.id === it.productId))} {state.products.find((p) => p.id === it.productId)?.name}</span>
                : <select className="select" value={it.productId} onChange={(e) => setItem(i, { productId: e.target.value })}>{state.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}</td>
              {kind === 'check' ? (
                <><td>{it.system}</td><td><input className="input" type="number" style={{ width: 90 }} value={it.counted} onChange={(e) => setItem(i, { counted: Number(e.target.value) })} /></td><td className={it.counted - it.system ? 'metric-bad' : ''}>{it.counted - it.system}</td></>
              ) : (
                <>
                  <td className="muted">{stockAt(it.productId, warehouseId)}</td>
                  <td><input className="input" type="number" min="0" style={{ width: 90 }} value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} /></td>
                  {kind === 'import' && <td><input className="input" type="number" style={{ width: 130 }} value={it.cost} onChange={(e) => setItem(i, { cost: Number(e.target.value) })} /></td>}
                  <td><button className="icon-btn" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {kind !== 'check' && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setItems([...items, { productId: state.products[0]?.id, qty: 1, cost: 0 }])}><Plus size={13} /> Thêm dòng</button>}
      {(kind === 'export' || kind === 'transfer') && items.some((it) => it.qty > stockAt(it.productId, warehouseId)) && !state.settings.inventory.allowNegative && <div className="ai-banner off">Có sản phẩm xuất vượt tồn kho hiện tại.</div>}
      <label className="field">Ghi chú<input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
    </Modal>
  );
}

export function StockLevels() {
  const { state } = useStore();
  const [wh, setWh] = useState('all');
  const low = state.settings.inventory.lowStock;
  const rows = state.stockLevels.filter((l) => wh === 'all' || l.warehouseId === wh).map((l) => ({ ...l, id: `${l.productId}_${l.warehouseId}`, product: state.products.find((p) => p.id === l.productId), warehouse: state.warehouses.find((w) => w.id === l.warehouseId) })).filter((r) => r.product);
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const value = rows.reduce((s, r) => s + r.qty * r.product.price, 0);
  return (
    <>
      <h2 style={{ marginBottom: 14 }}>Tồn kho</h2>
      <StatCards items={[
        { label: 'Tổng tồn kho', value: total.toLocaleString('vi-VN') },
        { label: 'Giá trị tồn (giá bán)', value: money(value) },
        { label: `Sắp hết (≤ ${low})`, value: rows.filter((r) => r.qty > 0 && r.qty <= low).length, cls: 'metric-bad' },
        { label: 'Hết hàng', value: rows.filter((r) => r.qty <= 0).length, cls: 'metric-bad' },
      ]} />
      <DataTable
        rows={rows}
        search={(r) => `${r.product.name} ${r.product.sku}`}
        exportName="ton-kho"
        filters={<select className="select" style={{ width: 200 }} value={wh} onChange={(e) => setWh(e.target.value)}><option value="all">Tất cả kho</option>{state.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}
        tabs={[{ key: 'all', label: 'Tất cả' }, { key: 'low', label: 'Sắp hết', filter: (r) => r.qty > 0 && r.qty <= low }, { key: 'out', label: 'Hết hàng', filter: (r) => r.qty <= 0 }]}
        columns={[
          { key: 'name', label: 'Tên sản phẩm', render: (r) => <span>{productEmoji(r.product)} <b>{r.product.name}</b> <span className="muted small">{r.product.sku}</span></span>, csv: (r) => r.product.name },
          { key: 'wh', label: 'Kho hàng', render: (r) => r.warehouse?.name, csv: (r) => r.warehouse?.name },
          { key: 'qty', label: 'Tồn kho', align: 'right', render: (r) => <span className={`badge ${r.qty <= 0 ? 'red' : r.qty <= low ? 'orange' : 'green'}`}>{r.qty}</span>, csv: (r) => r.qty },
          { key: 'updatedAt', label: 'Ngày cập nhật', render: (r) => fmtDate(r.updatedAt), csv: (r) => fmtDate(r.updatedAt) },
        ]}
        footer={() => <tr><td colSpan={2}>Tổng tồn kho</td><td style={{ textAlign: 'right' }}>{total}</td><td /></tr>}
      />
    </>
  );
}
