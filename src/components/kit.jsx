// Reusable page building blocks: grouped sidebar, data table with toolbar + pagination, form modal, stat cards.
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, Download, ChevronLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Modal } from './ui.jsx';
import { downloadCsv } from '../csv.js';

// items: [{ key, label, icon, children?: [{ key, label }] }]
export function SideMenu({ title, items, active, onSelect }) {
  const [open, setOpen] = useState(() => Object.fromEntries(items.filter((i) => i.children?.some((c) => c.key === active)).map((i) => [i.key, true])));
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {title && !collapsed && <div className="sidebar-title">{title}</div>}
      {items.map((it) => {
        const Icon = it.icon;
        if (!it.children) {
          return <button key={it.key} title={it.label} className={`side-item ${active === it.key ? 'active' : ''}`} onClick={() => onSelect(it.key)}>{Icon && <Icon size={16} />} {!collapsed && it.label}</button>;
        }
        const isOpen = open[it.key] || it.children.some((c) => c.key === active);
        return (
          <div key={it.key}>
            <button title={it.label} className={`side-item ${it.children.some((c) => c.key === active) ? 'parent-active' : ''}`} onClick={() => (collapsed ? onSelect(it.children[0].key) : setOpen({ ...open, [it.key]: !isOpen }))}>
              {Icon && <Icon size={16} />} {!collapsed && <span className="grow">{it.label}</span>} {!collapsed && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
            </button>
            {isOpen && !collapsed && it.children.map((c) => (
              <button key={c.key} className={`side-item sub ${active === c.key ? 'active' : ''}`} onClick={() => onSelect(c.key)}>{c.label}</button>
            ))}
          </div>
        );
      })}
      <button className="side-item collapse-btn" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} /> Thu gọn</>}</button>
    </aside>
  );
}

// columns: [{ key, label, render?(row), csv?(row), align? }]
export function DataTable({ title, columns, rows, search, tabs, actions, filters, empty = 'Không có dữ liệu để hiển thị!', onRowClick, footer, exportName, pageSizes = [20, 50, 100] }) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(tabs?.[0]?.key);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSizes[0]);
  const filtered = useMemo(() => {
    let list = rows;
    const t = tabs?.find((x) => x.key === tab);
    if (t?.filter) list = list.filter(t.filter);
    if (q && search) list = list.filter((r) => search(r).toLowerCase().includes(q.toLowerCase()));
    return list;
  }, [rows, tab, q, tabs, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, pages - 1);
  const slice = filtered.slice(cur * size, cur * size + size);
  const cell = (c, r) => (c.render ? c.render(r) : r[c.key]);
  const exportCsv = () => downloadCsv(`${exportName || 'export'}.csv`, [columns.filter((c) => c.label).map((c) => c.label), ...filtered.map((r) => columns.filter((c) => c.label).map((c) => (c.csv ? c.csv(r) : typeof cell(c, r) === 'object' ? '' : cell(c, r))))]);

  return (
    <div className="card">
      <div className="row wrap" style={{ padding: 14, borderBottom: '1px solid var(--border)', gap: 8 }}>
        {tabs && (
          <select className="select" style={{ width: 160 }} value={tab} onChange={(e) => { setTab(e.target.value); setPage(0); }}>
            {tabs.map((t) => <option key={t.key} value={t.key}>{t.label} ({t.filter ? rows.filter(t.filter).length : rows.length})</option>)}
          </select>
        )}
        {search && <div className="search" style={{ width: 240 }}><Search size={14} /><input className="input" placeholder="Tìm kiếm" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></div>}
        {filters}
        <div className="grow" />
        {title && <b className="muted small">{title}</b>}
        {exportName && <button className="btn sm" onClick={exportCsv}><Download size={13} /> Export</button>}
        {actions}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead><tr>{columns.map((c) => <th key={c.key} style={{ textAlign: c.align }}>{c.label}</th>)}</tr></thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={r.id || i} style={onRowClick ? { cursor: 'pointer' } : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => <td key={c.key} style={{ textAlign: c.align }}>{cell(c, r)}</td>)}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot>{footer(filtered)}</tfoot>}
        </table>
        {filtered.length === 0 && <div className="empty">{empty}</div>}
      </div>
      <div className="row wrap" style={{ padding: '10px 14px', gap: 8 }}>
        <span className="muted small grow">{filtered.length ? cur * size + 1 : 0} - {Math.min(filtered.length, cur * size + size)} trên tổng {filtered.length}</span>
        <button className="btn sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}><ChevronLeft size={13} /></button>
        <span className="small">{cur + 1}/{pages}</span>
        <button className="btn sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}><ChevronRight size={13} /></button>
        <select className="select" style={{ width: 80 }} value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}>{pageSizes.map((s) => <option key={s}>{s}</option>)}</select>
        <span className="muted small">Kết quả trên 1 trang</span>
      </div>
    </div>
  );
}

// fields: [{ key, label, type: text|number|select|textarea|date|checkbox, options?: [[value,label]], required?, full? }]
export function FormModal({ title, fields, initial = {}, onSave, onClose, wide, children, saveLabel = 'Lưu' }) {
  const [v, setV] = useState(() => Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? (f.type === 'checkbox' ? false : f.type === 'number' ? 0 : f.options?.[0]?.[0] ?? '')])));
  const missing = fields.some((f) => f.required && (v[f.key] === '' || v[f.key] == null));
  const input = (f) => {
    const set = (val) => setV({ ...v, [f.key]: val });
    if (f.type === 'select') return <select className="select" value={v[f.key]} onChange={(e) => set(e.target.value)}>{f.options.map(([val, label]) => <option key={val} value={val}>{label}</option>)}</select>;
    if (f.type === 'textarea') return <textarea className="textarea" value={v[f.key]} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} />;
    if (f.type === 'checkbox') return <input type="checkbox" checked={!!v[f.key]} onChange={(e) => set(e.target.checked)} style={{ width: 18, height: 18 }} />;
    if (f.type === 'number') return <input className="input" type="number" value={v[f.key]} onChange={(e) => set(Number(e.target.value))} />;
    if (f.type === 'date') return <input className="input" type="date" value={v[f.key]} onChange={(e) => set(e.target.value)} />;
    return <input className="input" value={v[f.key]} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />;
  };
  return (
    <Modal title={title} wide={wide} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" disabled={missing} onClick={() => onSave(v)}>{saveLabel}</button></>}>
      <div className="form-grid">
        {fields.map((f) => <label key={f.key} className="field" style={f.full || f.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>{f.label}{f.required && ' *'}{input(f)}</label>)}
      </div>
      {children?.(v, setV)}
    </Modal>
  );
}

export function StatCards({ items }) {
  return (
    <div className="kpi-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${items.length > 4 ? 170 : 200}px, 1fr))`, marginBottom: 16 }}>
      {items.map((k) => (
        <div className="card kpi" key={k.label} style={{ flexDirection: 'column', gap: 4 }}>
          <span className="muted small">{k.label}</span>
          <b className={k.cls}>{k.value}</b>
          {k.sub && <span className="muted small">{k.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export const Status = ({ tone = '', children }) => <span className={`badge ${tone}`}>{children}</span>;
export const fmtDate = (ts) => (ts ? new Date(ts).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDay = (ts) => (ts ? new Date(ts).toLocaleDateString('vi-VN') : '—');
