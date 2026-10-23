import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useStore, uid, money, orderTotal } from '../../store.jsx';
import { DataTable, FormModal, Status, StatCards, fmtDate, fmtDay } from '../../components/kit.jsx';
import { nextCode, PAY_METHODS } from '../../ops.js';

const SHIP_STATUS = { waiting: ['Chờ lấy hàng', 'orange'], in_transit: ['Đang giao', 'blue'], delivered: ['Đã giao', 'green'], returning: ['Đang hoàn', 'red'], returned: ['Đã hoàn', 'red'] };
const CARRIERS = ['GHN', 'GHTK', 'Viettel Post', 'Tự giao'];

export function Waybills() {
  const { state, update } = useStore();
  const [creating, setCreating] = useState(false);
  const withBill = new Set(state.waybills.map((w) => w.orderId));
  const pending = state.orders.filter((o) => !withBill.has(o.id) && ['new', 'confirmed'].includes(o.status));
  const fees = state.waybills.reduce((s, w) => s + w.fee, 0);
  const cod = state.waybills.filter((w) => w.status !== 'delivered').reduce((s, w) => s + w.cod, 0);
  return (
    <>
      <h2 style={{ marginBottom: 14 }}>Vận đơn</h2>
      <StatCards items={[
        { label: 'Đơn chờ tạo vận đơn', value: pending.length, cls: pending.length ? 'metric-bad' : '' },
        { label: 'Đang giao', value: state.waybills.filter((w) => w.status === 'in_transit').length },
        { label: 'Tổng phí vận chuyển', value: money(fees) },
        { label: 'COD chưa đối soát', value: money(cod) },
      ]} />
      <DataTable
        rows={[...state.waybills].sort((a, b) => b.createdAt - a.createdAt)}
        search={(r) => `${r.orderId} ${r.code} ${r.receiver} ${r.phone}`}
        tabs={[{ key: 'all', label: 'Tất cả' }, ...Object.entries(SHIP_STATUS).map(([k, [l]]) => ({ key: k, label: l, filter: (r) => r.status === k }))]}
        exportName="van-don"
        actions={<button className="btn primary" onClick={() => setCreating(true)} disabled={!pending.length}><Plus size={15} /> Tạo vận đơn</button>}
        columns={[
          { key: 'orderId', label: 'Mã đơn', render: (r) => <b>#{r.orderId}</b> },
          { key: 'code', label: 'Mã vận đơn' },
          { key: 'carrier', label: 'Đơn vị vận chuyển' },
          { key: 'createdAt', label: 'Ngày tạo', render: (r) => fmtDate(r.createdAt), csv: (r) => fmtDate(r.createdAt) },
          { key: 'receiver', label: 'Người nhận', render: (r) => <div>{r.receiver}<div className="muted small">{r.address}</div></div>, csv: (r) => r.receiver },
          { key: 'phone', label: 'Số điện thoại' },
          { key: 'fee', label: 'Phí vận chuyển', align: 'right', render: (r) => money(r.fee), csv: (r) => r.fee },
          { key: 'cod', label: 'Thu hộ (COD)', align: 'right', render: (r) => money(r.cod), csv: (r) => r.cod },
          { key: 'status', label: 'Trạng thái', render: (r) => (
            <select className="select" style={{ padding: '4px 6px', width: 140 }} value={r.status} onChange={(e) => update((d) => {
              const w = d.waybills.find((x) => x.id === r.id); w.status = e.target.value;
              const o = d.orders.find((x) => x.id === r.orderId);
              if (o) o.status = e.target.value === 'delivered' ? 'done' : e.target.value === 'returned' ? 'cancelled' : 'shipping';
            })}>{Object.entries(SHIP_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
          ), csv: (r) => SHIP_STATUS[r.status][0] },
        ]}
      />
      {creating && (
        <FormModal
          title="Tạo vận đơn"
          onClose={() => setCreating(false)}
          fields={[
            { key: 'orderId', label: 'Đơn hàng', type: 'select', options: pending.map((o) => [o.id, `#${o.id} – ${state.customers.find((c) => c.id === o.customerId)?.name} – ${money(orderTotal(o, state.products))}`]), full: true },
            { key: 'carrier', label: 'Đơn vị vận chuyển', type: 'select', options: CARRIERS.map((c) => [c, c]) },
            { key: 'fee', label: 'Phí vận chuyển (đ)', type: 'number' },
          ]}
          initial={{ fee: 250000 }}
          onSave={(v) => {
            update((d) => {
              const o = d.orders.find((x) => x.id === v.orderId);
              const c = d.customers.find((x) => x.id === o.customerId);
              d.waybills.push({ id: uid(), orderId: o.id, code: v.carrier === 'Tự giao' ? `TG${Date.now() % 100000}` : `${v.carrier.replace(/\s/g, '').toUpperCase().slice(0, 4)}${Math.floor(Math.random() * 9e8 + 1e8)}`, carrier: v.carrier, receiver: c?.name, phone: c?.phone, address: c?.address, fee: v.fee, cod: o.payment === 'paid' ? 0 : orderTotal(o, d.products), status: 'waiting', createdAt: Date.now() });
              o.status = 'shipping';
            });
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

const CASH_STATUS = { done: ['Hoàn tất', 'green'], pending: ['Chờ duyệt', 'orange'], cancelled: ['Đã hủy', 'red'] };

export function CashList({ kind }) {
  const { state, update } = useStore();
  const [creating, setCreating] = useState(false);
  const isReceipt = kind === 'receipt';
  const rows = state.cashTx.filter((t) => t.kind === kind).sort((a, b) => b.paidAt - a.paidAt);
  return (
    <>
      <h2 style={{ marginBottom: 14 }}>{isReceipt ? 'Biên lai' : 'Phiếu chi'}</h2>
      <DataTable
        rows={rows}
        search={(r) => `${r.code} ${r.description}`}
        tabs={[{ key: 'all', label: 'Tất cả' }, ...Object.entries(CASH_STATUS).map(([k, [l]]) => ({ key: k, label: l, filter: (r) => r.status === k }))]}
        exportName={isReceipt ? 'bien-lai' : 'phieu-chi'}
        actions={<button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} /> Tạo {isReceipt ? 'biên lai' : 'phiếu chi'}</button>}
        columns={[
          { key: 'code', label: 'Mã phiếu', render: (r) => <b>{r.code}</b> },
          { key: 'amount', label: 'Số tiền', align: 'right', render: (r) => <b className={isReceipt ? 'metric-good' : 'metric-bad'}>{money(r.amount)}</b>, csv: (r) => r.amount },
          { key: 'method', label: 'Phương thức thanh toán', render: (r) => PAY_METHODS[r.method], csv: (r) => PAY_METHODS[r.method] },
          { key: 'description', label: 'Mô tả' },
          { key: 'paidAt', label: 'Ngày thanh toán', render: (r) => fmtDay(r.paidAt), csv: (r) => fmtDay(r.paidAt) },
          { key: 'by', label: 'Người tạo', render: (r) => state.staff.find((s) => s.id === r.createdBy)?.name },
          { key: 'createdAt', label: 'Ngày tạo', render: (r) => fmtDate(r.createdAt), csv: (r) => fmtDate(r.createdAt) },
          { key: 'status', label: 'Trạng thái', render: (r) => <Status tone={CASH_STATUS[r.status][1]}>{CASH_STATUS[r.status][0]}</Status>, csv: (r) => CASH_STATUS[r.status][0] },
        ]}
      />
      {creating && (
        <FormModal
          title={isReceipt ? 'Tạo biên lai (phiếu thu)' : 'Tạo phiếu chi'}
          onClose={() => setCreating(false)}
          fields={[
            { key: 'amount', label: 'Số tiền (đ)', type: 'number', required: true },
            { key: 'method', label: 'Phương thức', type: 'select', options: Object.entries(PAY_METHODS) },
            ...(isReceipt ? [{ key: 'orderId', label: 'Thu cho đơn', type: 'select', options: [['', '— Thu khác —'], ...state.orders.filter((o) => o.payment !== 'paid' && o.status !== 'cancelled').map((o) => [o.id, `#${o.id} – ${money(orderTotal(o, state.products))}`])] }] : [{ key: 'category', label: 'Khoản chi', type: 'select', options: ['Quảng cáo', 'Nhập hàng', 'Lương', 'Mặt bằng', 'Vận chuyển', 'Khác'].map((x) => [x, x]) }]),
            { key: 'paidAt', label: 'Ngày thanh toán', type: 'date', required: true },
            { key: 'description', label: 'Mô tả', type: 'textarea' },
          ]}
          initial={{ paidAt: new Date().toISOString().slice(0, 10) }}
          onSave={(v) => {
            update((d) => {
              d.cashTx.push({ id: uid(), code: nextCode(d.cashTx.filter((t) => t.kind === kind), isReceipt ? 'PT' : 'PC'), kind, amount: v.amount, method: v.method, description: v.description || (isReceipt && v.orderId ? `Thu tiền đơn #${v.orderId}` : v.category || ''), orderId: v.orderId || null, paidAt: new Date(v.paidAt).getTime(), createdBy: 's1', createdAt: Date.now(), status: 'done' });
              if (isReceipt && v.orderId) d.orders.find((o) => o.id === v.orderId).payment = 'paid';
            });
            setCreating(false);
          }}
        />
      )}
    </>
  );
}

export function CashBook() {
  const { state } = useStore();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const start = new Date(`${month}-01T00:00:00`).getTime();
  const end = new Date(new Date(start).setMonth(new Date(start).getMonth() + 1)).getTime();
  const sign = (t) => (t.kind === 'receipt' ? 1 : -1);
  const done = state.cashTx.filter((t) => t.status === 'done');
  const opening = done.filter((t) => t.paidAt < start).reduce((s, t) => s + sign(t) * t.amount, 0);
  const inPeriod = done.filter((t) => t.paidAt >= start && t.paidAt < end).sort((a, b) => b.paidAt - a.paidAt);
  const income = inPeriod.filter((t) => t.kind === 'receipt').reduce((s, t) => s + t.amount, 0);
  const expense = inPeriod.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
  return (
    <>
      <div className="row between" style={{ marginBottom: 14 }}>
        <h2>Sổ quỹ</h2>
        <input className="input" type="month" style={{ width: 170 }} value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <StatCards items={[
        { label: 'Số dư đầu kỳ', value: money(opening) },
        { label: 'Tổng thu', value: money(income), cls: 'metric-good' },
        { label: 'Tổng chi', value: money(expense), cls: 'metric-bad' },
        { label: 'Tồn cuối kỳ', value: money(opening + income - expense) },
      ]} />
      <DataTable
        rows={inPeriod}
        search={(r) => `${r.code} ${r.description}`}
        tabs={[{ key: 'all', label: 'Tất cả' }, { key: 'r', label: 'Biên lai', filter: (r) => r.kind === 'receipt' }, { key: 'e', label: 'Phiếu chi', filter: (r) => r.kind === 'expense' }]}
        exportName={`so-quy-${month}`}
        columns={[
          { key: 'code', label: 'Mã phiếu', render: (r) => <b>{r.code}</b> },
          { key: 'description', label: 'Mô tả' },
          { key: 'method', label: 'Phương thức thanh toán', render: (r) => PAY_METHODS[r.method], csv: (r) => PAY_METHODS[r.method] },
          { key: 'amount', label: 'Số tiền', align: 'right', render: (r) => <b className={r.kind === 'receipt' ? 'metric-good' : 'metric-bad'}>{r.kind === 'receipt' ? '+' : '−'}{money(r.amount)}</b>, csv: (r) => sign(r) * r.amount },
          { key: 'paidAt', label: 'Ngày thanh toán', render: (r) => fmtDay(r.paidAt), csv: (r) => fmtDay(r.paidAt) },
          { key: 'createdAt', label: 'Ngày tạo', render: (r) => fmtDate(r.createdAt), csv: (r) => fmtDate(r.createdAt) },
        ]}
      />
    </>
  );
}
