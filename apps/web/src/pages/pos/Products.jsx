// Đơn hàng → Sản phẩm, Danh mục: stored in the database through the API. Staff without product.manage only read.
// Stock is not shown here yet: warehouses move to the database in Step 9.
import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ScanSearch, Search, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import CatalogScanModal from '../../components/CatalogScanModal.jsx';
import { Modal, productEmoji, useToast } from '../../components/ui.jsx';
import { money } from '../../store.jsx';
import { useDebounced } from '../../useDebounced.js';

const EMPTY = { sku: '', name: '', categoryId: '', price: 0, description: '', active: true };

function useCategories(shopId) {
  return useQuery({ queryKey: ['categories', shopId], queryFn: () => api(`/shops/${shopId}/categories`) });
}

export function ProductList() {
  const { shop, can } = useAuth();
  const qc = useQueryClient();
  const [toast, toastNode] = useToast();
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim());
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const base = `/shops/${shop.id}/products`;
  const manage = can('product.manage');
  const categories = useCategories(shop.id);
  const list = useInfiniteQuery({
    queryKey: ['products', shop.id, term],
    initialPageParam: null,
    queryFn: ({ pageParam }) => api(`${base}?${new URLSearchParams({ limit: '50', ...(term ? { q: term } : {}), ...(pageParam ? { cursor: pageParam } : {}) })}`),
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const refresh = () => { qc.invalidateQueries({ queryKey: ['products', shop.id] }); qc.invalidateQueries({ queryKey: ['categories', shop.id] }); };

  const save = useMutation({
    mutationFn: ({ id, sku, name, categoryId, price, description, active }) => {
      const body = { sku, name, categoryId: categoryId || null, price: Number(price), description: description || null, active };
      return id ? api(`${base}/${id}`, { method: 'PATCH', body }) : api(base, { method: 'POST', body });
    },
    onSuccess: () => { setDraft(null); toast('Đã lưu sản phẩm'); refresh(); },
    onError: (err) => setError(err.code === 'VALIDATION_FAILED' ? err.details.map((d) => d.message).join(', ') : err.message),
  });
  const remove = useMutation({ mutationFn: (id) => api(`${base}/${id}`, { method: 'DELETE' }), onSuccess: () => { toast('Đã xóa sản phẩm'); refresh(); }, onError: (err) => toast(err.message) });
  const categoryName = (id) => (categories.isPending ? '' : categories.data?.find((c) => c.id === id)?.name ?? '—');
  const open = (p) => { setError(''); setDraft({ ...EMPTY, ...p, categoryId: p.categoryId ?? '', description: p.description ?? '' }); };
  const missingDesc = rows.filter((p) => !p.description).length;

  return (
    <div className="card">
      <div className="row wrap" style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
        <h3 className="grow">Danh mục sản phẩm</h3>
        <div className="search"><Search size={15} /><input className="input" placeholder="Tìm tên, SKU, mã vạch" aria-label="Tìm sản phẩm" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {manage && <button className="btn" onClick={() => setScanOpen(true)}><ScanSearch size={15} /> Quét danh mục</button>}
        {manage && <button className="btn primary" onClick={() => open({})}><Plus size={15} /> Thêm sản phẩm</button>}
      </div>
      <div className="muted small" style={{ padding: '10px 14px', background: '#f8fafc' }}>
        <Sparkles size={12} /> Mô tả càng chi tiết, AI càng tư vấn đúng (AI dùng danh mục này từ Bước 7).
        {missingDesc > 0 && <b style={{ color: 'var(--orange)' }}> {missingDesc} sản phẩm chưa có mô tả.</b>}
      </div>
      {list.isError && <div className="field-error" style={{ padding: 14 }}>{list.error.message}</div>}
      {list.isPending && <div className="muted" style={{ padding: 14 }}>Đang tải…</div>}
      {list.isSuccess && rows.length === 0 && <div className="empty" style={{ padding: 40 }}>{term ? 'Không tìm thấy sản phẩm.' : 'Chưa có sản phẩm nào.'}</div>}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Giá bán</th><th>Trạng thái</th>{manage && <th />}</tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} data-testid="product-row" style={manage ? { cursor: 'pointer' } : undefined} onClick={manage ? () => open(p) : undefined}>
                  <td>
                    <div className="row" style={{ alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 22 }}>{productEmoji({ ...p, category: categoryName(p.categoryId) })}</span>
                      <div><b>{p.name}</b><div className="muted small">{p.sku}</div><div className="small" style={{ maxWidth: 380 }}>{p.description || <i className="muted">Chưa có mô tả</i>}</div></div>
                    </div>
                  </td>
                  <td>{categoryName(p.categoryId)}</td>
                  <td>{money(p.price)}</td>
                  <td><span className={`badge ${p.active ? 'green' : 'orange'}`}>{p.active ? 'Đang bán' : 'Ngừng bán'}</span></td>
                  {manage && <td><button className="icon-btn" title="Xóa" onClick={(e) => { e.stopPropagation(); if (confirm(`Xóa ${p.name}?`)) remove.mutate(p.id); }}><Trash2 size={15} color="var(--muted)" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.hasNextPage && <div style={{ padding: 14, textAlign: 'center' }}><button className="btn" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>Tải thêm</button></div>}
      {draft && (
        <Modal
          title={draft.id ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}
          onClose={() => setDraft(null)}
          footer={<><button className="btn" onClick={() => setDraft(null)}>Hủy</button><button className="btn primary" onClick={() => { setError(''); save.mutate(draft); }} disabled={save.isPending || !draft.name.trim() || !draft.sku.trim()}>Lưu</button></>}
        >
          <div className="form-grid">
            <label className="field">Mã SKU<input className="input" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} /></label>
            <label className="field">Tên sản phẩm<input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="field">Danh mục
              <select className="select" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                <option value="">— Không có —</option>
                {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field">Giá bán<input className="input" type="number" min="0" step="1000" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} /></label>
          </div>
          <label className="field">Mô tả cho AI (chất liệu, kích thước, điểm nổi bật)<textarea className="textarea" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <label className="row small"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Đang bán</label>
          {error && <div className="field-error">{error}</div>}
        </Modal>
      )}
      {scanOpen && (
        <CatalogScanModal
          existing={rows}
          onImportRows={async (items) => {
            await api(`${base}/import`, { method: 'POST', body: { items: items.map((r) => ({ sku: r.sku || undefined, name: r.name, category: r.category || undefined, price: r.price ? Math.round(r.price) : undefined, description: r.description || undefined })) } });
            refresh();
          }}
          onClose={() => setScanOpen(false)}
          onImported={(n) => { setScanOpen(false); toast(`Đã nhập ${n} sản phẩm vào danh mục`); }}
        />
      )}
      {toastNode}
    </div>
  );
}

export function Categories() {
  const { shop, can } = useAuth();
  const qc = useQueryClient();
  const [toast, toastNode] = useToast();
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const base = `/shops/${shop.id}/categories`;
  const manage = can('product.manage');
  const list = useCategories(shop.id);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['categories', shop.id] }); qc.invalidateQueries({ queryKey: ['products', shop.id] }); };
  const save = useMutation({
    mutationFn: ({ id, name, description, active }) => {
      const body = { name, description: description || null, active };
      return id ? api(`${base}/${id}`, { method: 'PATCH', body }) : api(base, { method: 'POST', body });
    },
    onSuccess: () => { setDraft(null); refresh(); },
    onError: (err) => setError(err.message),
  });
  const remove = useMutation({ mutationFn: (id) => api(`${base}/${id}`, { method: 'DELETE' }), onSuccess: refresh, onError: (err) => toast(err.message) });

  return (
    <div className="card">
      <div className="row wrap" style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
        <div className="grow"><h3>Danh mục</h3><div className="muted small">Nhóm sản phẩm để AI tư vấn và lọc báo cáo.</div></div>
        {manage && <button className="btn primary" onClick={() => { setError(''); setDraft({ name: '', description: '', active: true }); }}><Plus size={15} /> Thêm danh mục</button>}
      </div>
      {list.isError && <div className="field-error" style={{ padding: 14 }}>{list.error.message}</div>}
      {list.isPending && <div className="muted" style={{ padding: 14 }}>Đang tải…</div>}
      {list.data?.length === 0 && <div className="empty" style={{ padding: 40 }}>Chưa có danh mục nào.</div>}
      {list.data?.length > 0 && (
        <table className="table">
          <thead><tr><th>Tên danh mục</th><th>Số sản phẩm</th><th>Mô tả</th><th>Trạng thái</th>{manage && <th />}</tr></thead>
          <tbody>
            {list.data.map((c) => (
              <tr key={c.id} data-testid="category-row" style={manage ? { cursor: 'pointer' } : undefined} onClick={manage ? () => { setError(''); setDraft({ ...c, description: c.description ?? '' }); } : undefined}>
                <td><b>{c.name}</b></td>
                <td>{c.productCount}</td>
                <td>{c.description}</td>
                <td><span className={`badge ${c.active ? 'green' : 'orange'}`}>{c.active ? 'Hiển thị' : 'Ẩn'}</span></td>
                {manage && <td><button className="icon-btn" title="Xóa" onClick={(e) => { e.stopPropagation(); if (confirm(`Xóa danh mục ${c.name}? Sản phẩm vẫn được giữ lại.`)) remove.mutate(c.id); }}><Trash2 size={15} color="var(--muted)" /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {draft && (
        <Modal title={draft.id ? 'Sửa danh mục' : 'Thêm danh mục'} onClose={() => setDraft(null)} footer={<><button className="btn" onClick={() => setDraft(null)}>Hủy</button><button className="btn primary" disabled={save.isPending || !draft.name.trim()} onClick={() => { setError(''); save.mutate(draft); }}>Lưu</button></>}>
          <label className="field">Tên danh mục<input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="field">Mô tả<textarea className="textarea" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <label className="row small"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Hiển thị</label>
          {error && <div className="field-error">{error}</div>}
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
