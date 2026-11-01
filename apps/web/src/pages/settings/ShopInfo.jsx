// Cài đặt → Thông tin: the shop record in the database. Only Admin can edit; other roles read it.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useToast } from '../../components/ui.jsx';
import { useStore } from '../../store.jsx';

const FIELDS = ['Nội thất', 'Thời trang', 'F&B', 'Làm đẹp', 'Bất động sản', 'Giáo dục', 'Khác'];

export default function ShopInfo() {
  const { shop, can, reload } = useAuth();
  const { reset } = useStore();
  const qc = useQueryClient();
  const [toast, toastNode] = useToast();
  const query = useQuery({ queryKey: ['shop', shop.id], queryFn: () => api(`/shops/${shop.id}`) });
  const [form, setForm] = useState(null);
  useEffect(() => { if (query.data) setForm({ name: query.data.name, field: query.data.field ?? '', hotline: query.data.hotline ?? '', timezone: query.data.timezone }); }, [query.data]);
  const save = useMutation({
    mutationFn: () => api(`/shops/${shop.id}`, { method: 'PATCH', body: { name: form.name, field: form.field || null, hotline: form.hotline || null, timezone: form.timezone } }),
    onSuccess: async () => { await reload(); qc.invalidateQueries({ queryKey: ['shop', shop.id] }); toast('Đã lưu thiết lập'); },
    onError: (err) => toast(err.message),
  });
  const editable = can('shop.manage');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  if (query.isError) return <div className="card card-pad field-error">{query.error.message}</div>;
  if (!form) return <div className="card card-pad muted">Đang tải…</div>;

  return (
    <>
      <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h3>Thông tin chung</h3>
        <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            <label className="field">Tên shop<input className="input" value={form.name} onChange={set('name')} /></label>
            <label className="field">Lĩnh vực
              <select className="select" value={form.field} onChange={set('field')}>
                <option value="">—</option>
                {FIELDS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
            <label className="field">Hotline<input className="input" value={form.hotline} onChange={set('hotline')} /></label>
            <label className="field">Múi giờ<select className="select" value={form.timezone} onChange={set('timezone')}><option>Asia/Ho_Chi_Minh</option><option>Asia/Bangkok</option></select></label>
          </div>
        </fieldset>
        {editable ? <div><button className="btn primary" disabled={save.isPending || form.name.trim().length < 2} onClick={() => save.mutate()}>Lưu thiết lập</button></div> : <div className="muted small">Chỉ Admin được sửa thông tin cửa hàng.</div>}
      </div>
      {import.meta.env.DEV && (
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button className="btn ghost muted" onClick={() => confirm('Khôi phục dữ liệu mẫu trên trình duyệt này?') && reset()}><RotateCcw size={14} /> Khôi phục dữ liệu mẫu</button>
        </div>
      )}
      {toastNode}
    </>
  );
}
