import { useState } from 'react';
import { Globe, ClipboardPaste, ScanSearch, Loader2 } from 'lucide-react';
import { money } from '../store.jsx';
import { aiHealth } from '../ai.js';
import { Modal } from './ui.jsx';
import { parseTable, mapHeaders, toNumber, normHeader as norm } from '../csv.js';

const HEADER_MAP = [
  ['name', /^(ten|ten san pham|san pham|name|product|title)$/],
  ['sku', /^(sku|ma|ma sp|ma san pham|code)$/],
  ['category', /^(danh muc|loai|nhom|category|type)$/],
  ['price', /^(gia|gia ban|price|don gia)$/],
  ['stock', /^(ton|ton kho|so luong|stock|qty|quantity)$/],
  ['description', /^(mo ta|description|chi tiet|desc)$/],
];

// Offline import for CSV / spreadsheet paste with a header row.
export function parseCsv(text) {
  const table = parseTable(text);
  const headers = mapHeaders(table.headers, HEADER_MAP);
  if (!headers.includes('name')) return [];
  return table.rows.map((cells) => {
    const row = {};
    headers.forEach((h, i) => { if (h) row[h] = cells[i]; });
    return { name: row.name, sku: row.sku || null, category: row.category || null, price: toNumber(row.price), stock: row.stock ? toNumber(row.stock) : null, description: row.description || '' };
  }).filter((p) => p.name);
}

export default function CatalogScanModal({ onClose, onImported, onImportRows, existing }) {
  const [importError, setImportError] = useState('');
  const [tab, setTab] = useState('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [found, setFound] = useState(null);
  const [selected, setSelected] = useState({});

  const scan = async () => {
    setError(''); setFound(null); setLoading(true);
    try {
      const h = await aiHealth(true);
      if (!h.ai) {
        if (tab === 'url') throw new Error('Quét website cần AI. Hãy thêm ANTHROPIC_API_KEY vào file .env và chạy "npm run server".');
        const rows = parseCsv(text);
        if (!rows.length) throw new Error('Không đọc được bảng. Dòng đầu cần có tiêu đề cột, ví dụ: Tên, Giá, Danh mục, Tồn kho, Mô tả.');
        setFound(rows);
        setSelected(Object.fromEntries(rows.map((_, i) => [i, true])));
        return;
      }
      const r = await fetch('/api/ai/scan-catalog', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(tab === 'url' ? { url } : { text }) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Quét thất bại');
      setFound(body.products);
      setSelected(Object.fromEntries(body.products.map((_, i) => [i, true])));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const importSelected = async () => {
    const rows = found.filter((_, i) => selected[i]);
    setImportError('');
    try {
      await onImportRows(rows);
      onImported(rows.length);
    } catch (err) {
      setImportError(err.message);
    }
  };

  const existsCount = found ? found.filter((r) => existing.some((p) => (r.sku && p.sku === r.sku) || norm(p.name) === norm(r.name))).length : 0;

  return (
    <Modal
      wide
      title="Quét danh mục sản phẩm"
      onClose={onClose}
      footer={found
        ? <><span className="grow muted small">{existsCount > 0 && `${existsCount} sản phẩm đã có sẽ được cập nhật`}</span><button className="btn" onClick={() => setFound(null)}>Quét lại</button><button className="btn primary" onClick={importSelected} disabled={!Object.values(selected).some(Boolean)}>Nhập {Object.values(selected).filter(Boolean).length} sản phẩm</button></>
        : <><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" onClick={scan} disabled={loading || (tab === 'url' ? !url.trim() : !text.trim())}>{loading ? <Loader2 size={15} className="spin" /> : <ScanSearch size={15} />} Quét</button></>}
    >
      {!found && (
        <>
          <div className="segmented" style={{ alignSelf: 'flex-start' }}>
            <button className={tab === 'url' ? 'active' : ''} onClick={() => setTab('url')}><Globe size={14} /> Từ website</button>
            <button className={tab === 'text' ? 'active' : ''} onClick={() => setTab('text')}><ClipboardPaste size={14} /> Dán bảng / văn bản</button>
          </div>
          {tab === 'url' ? (
            <label className="field">Link trang danh mục sản phẩm (website, Shopee, Haravan, Sapo...)
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://goviet.vn/collections/ban-an" />
              <span className="muted small">AI tải trang, nhận diện từng sản phẩm, giá và mô tả. Trang tải bằng JavaScript có thể không đọc được – khi đó hãy dùng "Dán bảng".</span>
            </label>
          ) : (
            <label className="field">Dán dữ liệu từ Excel/Google Sheets (có dòng tiêu đề) hoặc văn bản mô tả sản phẩm
              <textarea className="textarea" style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 12.5 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Tên\tGiá\tDanh mục\tTồn kho\tMô tả\nBàn trà gỗ sồi\t2.300.000\tBàn trà\t10\tMặt 100x50cm, gỗ sồi Mỹ'} />
            </label>
          )}
          {(error || importError) && <div className="ai-banner off">{error || importError}</div>}
        </>
      )}
      {found && (
        <div style={{ overflowX: 'auto' }}>
          <div className="muted small" style={{ marginBottom: 8 }}>Tìm thấy {found.length} sản phẩm. Bỏ chọn những dòng không muốn nhập.</div>
          <table className="table">
            <thead><tr><th /><th>Tên</th><th>Danh mục</th><th>Giá</th><th>Tồn</th><th>Mô tả</th></tr></thead>
            <tbody>
              {found.map((r, i) => (
                <tr key={i}>
                  <td><input type="checkbox" checked={!!selected[i]} onChange={(e) => setSelected({ ...selected, [i]: e.target.checked })} /></td>
                  <td><b>{r.name}</b><div className="muted small">{r.sku}</div></td>
                  <td>{r.category}</td><td>{money(r.price)}</td><td>{r.stock ?? '—'}</td>
                  <td className="small" style={{ maxWidth: 280 }}>{r.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
