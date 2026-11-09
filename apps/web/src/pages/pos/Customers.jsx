// Đơn hàng → Khách hàng: stored in the database. The API returns only what this person may see (Sale data scope).
import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMerge, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, Modal, useToast } from '../../components/ui.jsx';
import { useDebounced } from '../../useDebounced.js';
import { CustomerProfile, MergeSuggestions } from './CustomerMerge.jsx';

export const STAGES = { NEW: 'Lead mới', CONTACTING: 'Đang liên hệ', CONSULTING: 'Đang tư vấn', QUOTED: 'Đã báo giá', WON: 'Chốt đơn', NURTURING: 'Nuôi dưỡng', LOST: 'Thất bại' };

export function CustomerList() {
  const { shop, can } = useAuth();
  const qc = useQueryClient();
  const [toast, toastNode] = useToast();
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim());
  const [stage, setStage] = useState('');
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const base = `/shops/${shop.id}/customers`;
  const list = useInfiniteQuery({
    queryKey: ['customers', shop.id, term, stage],
    initialPageParam: null,
    queryFn: ({ pageParam }) => api(`${base}?${new URLSearchParams({ limit: '50', ...(term ? { q: term } : {}), ...(stage ? { stage } : {}), ...(pageParam ? { cursor: pageParam } : {}) })}`),
    getNextPageParam: (last) => last.nextCursor,
  });
  const assignable = can('lead.assign') && can('staff.view');
  const members = useQuery({ queryKey: ['members', shop.id], queryFn: () => api(`/shops/${shop.id}/members`), enabled: assignable });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['customers', shop.id] });

  const save = useMutation({
    mutationFn: ({ id, name, phone, email, address, tags, stage: s }) => {
      const body = { name, phone: phone || null, email: email || null, address: address || null, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), ...(id ? { stage: s } : {}) };
      return id ? api(`${base}/${id}`, { method: 'PATCH', body }) : api(base, { method: 'POST', body });
    },
    // A phone/email another profile has merges the two (ID-01): the answer is the profile that was kept.
    onSuccess: (res) => { setDraft(null); toast(res?.merged?.length ? `Đã lưu và gộp với hồ sơ cùng SĐT/email: ${res.name}` : 'Đã lưu khách hàng'); refresh(); },
    onError: (err) => setError(err.code === 'VALIDATION_FAILED' ? err.details.map((d) => d.message).join(', ') : err.message),
  });
  const assign = useMutation({ mutationFn: ({ id, ownerId }) => api(`${base}/${id}/assign`, { method: 'POST', body: { ownerId: ownerId || null } }), onSuccess: refresh, onError: (err) => { toast(err.message); refresh(); } });
  const remove = useMutation({ mutationFn: (id) => api(`${base}/${id}`, { method: 'DELETE' }), onSuccess: () => { toast('Đã xóa khách hàng'); refresh(); }, onError: (err) => toast(err.message) });
  const open = (c) => { setError(''); setDraft({ name: '', stage: 'NEW', ...c, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', tags: (c.tags ?? []).join(', ') }); };

  return (
    <div className="card">
      <div className="row wrap" style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
        <h3 className="grow">Khách hàng</h3>
        <div className="search"><Search size={15} /><input className="input" placeholder="Tìm tên, SĐT, email" aria-label="Tìm khách hàng" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select" style={{ width: 150 }} aria-label="Lọc giai đoạn" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">Mọi giai đoạn</option>
          {Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {can('customer.merge') && <button className="btn" onClick={() => setSuggesting(true)}><GitMerge size={15} /> Đề xuất gộp</button>}
        <button className="btn primary" onClick={() => open({})}><Plus size={15} /> Thêm khách hàng</button>
      </div>
      {list.isError && <div className="field-error" style={{ padding: 14 }}>{list.error.message}</div>}
      {list.isPending && <div className="muted" style={{ padding: 14 }}>Đang tải…</div>}
      {list.isSuccess && rows.length === 0 && <div className="empty" style={{ padding: 40 }}>{term || stage ? 'Không tìm thấy khách hàng.' : 'Chưa có khách hàng nào.'}</div>}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Khách hàng</th><th>SĐT</th><th>Giai đoạn</th><th>Nhãn</th><th>Phụ trách</th>{can('customer.delete') && <th />}</tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} data-testid="customer-row" style={{ cursor: 'pointer' }} onClick={() => open(c)}>
                  <td><div className="row"><Avatar name={c.name} size="sm" /> {c.name}</div></td>
                  <td>{c.phone || <span className="muted">—</span>}</td>
                  <td><span className="badge blue">{STAGES[c.stage]}</span></td>
                  <td><div className="chips">{c.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div></td>
                  <td onClick={assignable ? (e) => e.stopPropagation() : undefined}>
                    {assignable ? (
                      <select className="select" style={{ width: 160 }} aria-label={`Phụ trách của ${c.name}`} value={c.ownerId ?? ''} onChange={(e) => assign.mutate({ id: c.id, ownerId: e.target.value })}>
                        <option value="">Chưa phân</option>
                        {members.data?.filter((m) => m.status === 'ACTIVE').map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                      </select>
                    ) : c.ownerName || <span className="muted">Chưa phân</span>}
                  </td>
                  {can('customer.delete') && <td><button className="icon-btn" title="Xóa" onClick={(e) => { e.stopPropagation(); if (confirm(`Xóa khách hàng ${c.name}?`)) remove.mutate(c.id); }}><Trash2 size={15} color="var(--muted)" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.hasNextPage && <div style={{ padding: 14, textAlign: 'center' }}><button className="btn" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>Tải thêm</button></div>}
      {draft && (
        <Modal title={draft.id ? 'Sửa khách hàng' : 'Thêm khách hàng'} onClose={() => setDraft(null)} footer={<><button className="btn" onClick={() => setDraft(null)}>Hủy</button><button className="btn primary" disabled={save.isPending || !draft.name.trim()} onClick={() => { setError(''); save.mutate(draft); }}>Lưu</button></>}>
          <div className="form-grid">
            <label className="field">Họ tên<input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="field">Số điện thoại<input className="input" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
            <label className="field">Email<input className="input" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
            {draft.id && <label className="field">Giai đoạn<select className="select" value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value })}>{Object.entries(STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
          </div>
          <label className="field">Địa chỉ<input className="input" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></label>
          <label className="field">Nhãn (cách nhau bằng dấu phẩy)<input className="input" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></label>
          {error && <div className="field-error">{error}</div>}
          {draft.id && <CustomerProfile customerId={draft.id} toast={toast} onChanged={refresh} onGone={() => setDraft(null)} />}
        </Modal>
      )}
      {suggesting && <MergeSuggestions toast={toast} onChanged={refresh} onClose={() => setSuggesting(false)} />}
      {toastNode}
    </div>
  );
}
