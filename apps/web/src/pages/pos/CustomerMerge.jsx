// ID-01 on the web: a profile's channels, conversations, orders and merge history; merge suggestions to review;
// manual merge and undo (Admin, Manager).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMerge, MessageSquare, Search, Undo2, X } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Modal, PlatformIcon } from '../../components/ui.jsx';
import { navigate } from '../../router.js';
import { useDebounced } from '../../useDebounced.js';
import { PLATFORM_KEY, PLATFORM_LABEL } from '../../platforms.js';

const money = (n) => `${Number(n).toLocaleString('vi-VN')}đ`;
const date = (d) => new Date(d).toLocaleDateString('vi-VN');
const MATCHED = { phone: 'trùng SĐT', email: 'trùng email', manual: 'gộp tay' };
const ChannelTag = ({ channel }) => channel && <span className="tag" title={channel.name}><PlatformIcon platform={PLATFORM_KEY[channel.platform]} size={11} /> {PLATFORM_LABEL[channel.platform]}</span>;

/** Shown inside the customer edit window. `onChanged` refreshes the list; `onGone` closes the window. */
export function CustomerProfile({ customerId, onChanged, onGone, toast }) {
  const { shop, can } = useAuth();
  const qc = useQueryClient();
  const base = `/shops/${shop.id}/customers`;
  const profile = useQuery({ queryKey: ['customer-profile', shop.id, customerId], queryFn: () => api(`${base}/${customerId}/profile`) });
  const [picking, setPicking] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['customer-profile', shop.id] }); qc.invalidateQueries({ queryKey: ['merge-suggestions', shop.id] }); onChanged(); };
  const undo = useMutation({
    mutationFn: (mergeId) => api(`${base}/merges/${mergeId}/undo`, { method: 'POST' }),
    onSuccess: () => { toast('Đã tách lại hồ sơ'); refresh(); },
    onError: (err) => toast(err.message),
  });
  const p = profile.data;
  if (profile.isError) return <div className="field-error">{profile.error.message}</div>;
  if (!p) return <div className="muted small">Đang tải hồ sơ…</div>;

  return (
    <div data-testid="customer-profile" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
      <div className="row wrap" style={{ gap: 6 }}>
        <b className="small">Kênh liên hệ:</b>
        {p.identities.length ? p.identities.map((i) => <ChannelTag key={i.id} channel={i.channel} />) : <span className="muted small">Chưa nhắn qua kênh nào</span>}
      </div>
      {p.source?.src && <div className="small" data-testid="customer-source"><b>Nguồn đầu tiên:</b> {p.source.src}{p.source.ref ? <> · ref <code>{p.source.ref}</code></> : null}</div>}
      <div className="row wrap small" style={{ gap: 14 }}>
        <span><MessageSquare size={13} /> {p.conversations.length} hội thoại</span>
        <span>{p.orders.count} đơn · {money(p.orders.total)}</span>
        {p.conversations.length > 0 && <button className="btn sm" onClick={() => navigate('livechat')}>Mở Livechat</button>}
      </div>
      {p.merges.length > 0 && (
        <div>
          <b className="small">Đã gộp vào hồ sơ này</b>
          {p.merges.map((m) => (
            <div key={m.id} className="row small" data-testid="merge-row" style={{ padding: '4px 0' }}>
              <GitMerge size={13} className="muted" />
              <span className="grow">{m.fromName ?? 'Hồ sơ'} · {MATCHED[m.matchedBy] ?? m.matchedBy}{m.auto ? ' (tự động)' : ''} · {date(m.createdAt)}</span>
              {can('customer.merge') && <button className="btn sm" disabled={undo.isPending} onClick={() => confirm(`Tách "${m.fromName}" ra thành hồ sơ riêng? Hội thoại, đơn và thông tin đã chuyển sang sẽ trở lại hồ sơ đó.`) && undo.mutate(m.id)}><Undo2 size={13} /> Tách lại</button>}
            </div>
          ))}
        </div>
      )}
      {can('customer.merge') && !picking && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPicking(true)}><GitMerge size={13} /> Gộp vào hồ sơ khác…</button>}
      {picking && <MergeTarget fromId={customerId} onCancel={() => setPicking(false)} onMerged={(into) => { toast(`Đã gộp vào hồ sơ ${into.name}`); refresh(); onGone(into); }} toast={toast} />}
    </div>
  );
}

function MergeTarget({ fromId, onCancel, onMerged, toast }) {
  const { shop } = useAuth();
  const base = `/shops/${shop.id}/customers`;
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim());
  const found = useQuery({ queryKey: ['customers', shop.id, 'merge-target', term], queryFn: () => api(`${base}?${new URLSearchParams({ q: term, limit: '8' })}`), enabled: term.length >= 2 });
  const merge = useMutation({ mutationFn: (intoId) => api(`${base}/${fromId}/merge`, { method: 'POST', body: { intoId } }), onSuccess: onMerged, onError: (err) => toast(err.message) });
  const options = found.data?.items.filter((c) => c.id !== fromId) ?? [];
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="row">
        <div className="search grow"><Search size={14} /><input className="input" autoFocus placeholder="Tìm hồ sơ giữ lại (tên, SĐT, email)" aria-label="Tìm hồ sơ để gộp vào" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="icon-btn" aria-label="Hủy gộp" onClick={onCancel}><X size={16} /></button>
      </div>
      {options.map((c) => (
        <div key={c.id} className="row small">
          <span className="grow"><b>{c.name}</b> {c.phone && `· ${c.phone}`} {c.email && `· ${c.email}`}</span>
          <button className="btn sm primary" disabled={merge.isPending} onClick={() => confirm(`Gộp hồ sơ này vào "${c.name}"? Có thể tách lại sau.`) && merge.mutate(c.id)}>Gộp vào đây</button>
        </div>
      ))}
      {term.length >= 2 && found.isSuccess && !options.length && <span className="muted small">Không tìm thấy.</span>}
    </div>
  );
}

/** Pairs that look like the same person (same name, no conflicting phone/email). */
export function MergeSuggestions({ onClose, onChanged, toast }) {
  const { shop } = useAuth();
  const qc = useQueryClient();
  const base = `/shops/${shop.id}/customers`;
  const list = useQuery({ queryKey: ['merge-suggestions', shop.id], queryFn: () => api(`${base}/merge-suggestions`) });
  const done = () => { qc.invalidateQueries({ queryKey: ['merge-suggestions', shop.id] }); onChanged(); };
  const merge = useMutation({ mutationFn: ({ from, into }) => api(`${base}/${from}/merge`, { method: 'POST', body: { intoId: into } }), onSuccess: () => { toast('Đã gộp hồ sơ'); done(); }, onError: (err) => toast(err.message) });
  const dismiss = useMutation({ mutationFn: ({ from, into }) => api(`${base}/merge-suggestions/dismiss`, { method: 'POST', body: { aId: from, bId: into } }), onSuccess: done, onError: (err) => toast(err.message) });
  const Card = ({ c, label }) => (
    <div className="grow" style={{ minWidth: 0 }}>
      <div className="muted small">{label}</div>
      <b>{c.name}</b>
      <div className="small muted">{[c.phone, c.email].filter(Boolean).join(' · ') || 'Chưa có SĐT, email'} · tạo {date(c.createdAt)}</div>
      <div className="chips">{c.channels.map((ch) => <ChannelTag key={ch.id} channel={ch} />)}</div>
    </div>
  );
  return (
    <Modal title="Đề xuất gộp hồ sơ" wide onClose={onClose}>
      <div className="muted small">Các hồ sơ trùng tên (không tính dấu, hoa thường) và không có SĐT/email khác nhau. Hồ sơ trùng SĐT hoặc email đã được gộp tự động.</div>
      {list.isPending && <div className="muted">Đang tải…</div>}
      {list.isError && <div className="field-error">{list.error.message}</div>}
      {list.isSuccess && !list.data.length && <div className="empty">Không có đề xuất nào.</div>}
      {list.data?.map((s) => (
        <div key={`${s.from.id}-${s.into.id}`} data-testid="merge-suggestion" className="row wrap" style={{ borderBottom: '1px solid var(--border)', padding: '10px 0', alignItems: 'flex-start' }}>
          <Card c={s.from} label="Hồ sơ mới hơn" />
          <GitMerge size={18} className="muted" style={{ marginTop: 18 }} />
          <Card c={s.into} label="Giữ lại" />
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm primary" disabled={merge.isPending} onClick={() => merge.mutate({ from: s.from.id, into: s.into.id })}>Gộp</button>
            <button className="btn sm" disabled={dismiss.isPending} onClick={() => dismiss.mutate({ from: s.from.id, into: s.into.id })}>Không phải cùng người</button>
          </div>
        </div>
      ))}
    </Modal>
  );
}
