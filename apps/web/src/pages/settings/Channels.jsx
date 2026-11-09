// Cài đặt → Kênh chat: website chat box (works now) and Facebook Page (manual token until the Meta app exists).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Unplug } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Modal, PlatformIcon, useToast } from '../../components/ui.jsx';
import { PLATFORM_KEY, PLATFORM_LABEL } from '../Livechat.jsx';

const API_ORIGIN = import.meta.env?.VITE_API_URL || window.location.origin;
export const embedCode = (siteKey) => `<script src="${API_ORIGIN}/v1/webchat/widget.js" data-site-key="${siteKey}" async></script>`;
const STATUS = { CONNECTED: ['green', 'Đang hoạt động'], TOKEN_EXPIRED: ['orange', 'Token hết hạn'], DISCONNECTED: ['', 'Đã ngắt'] };
const lines = (v) => v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
const errorText = (err) => (err.code === 'VALIDATION_FAILED' ? err.details.map((d) => d.message).join(', ') : err.message);

export default function Channels() {
  const { shop, can } = useAuth();
  const qc = useQueryClient();
  const [toast, toastNode] = useToast();
  const [form, setForm] = useState(null); // { kind: 'webchat' | 'facebook', ... }
  const [error, setError] = useState('');
  const base = `/shops/${shop.id}/channels`;
  const channels = useQuery({ queryKey: ['channels', shop.id], queryFn: () => api(base) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['channels', shop.id] });
  const manage = can('integration.manage');

  const create = useMutation({
    mutationFn: ({ kind, name, origins, pageId, pageAccessToken }) =>
      kind === 'webchat'
        ? api(`${base}/webchat`, { method: 'POST', body: { name, allowedOrigins: lines(origins) } })
        : api(`${base}/facebook`, { method: 'POST', body: { name, pageId: pageId.trim(), pageAccessToken: pageAccessToken.trim() } }),
    onSuccess: () => { setForm(null); toast('Đã kết nối kênh'); refresh(); },
    onError: (err) => setError(errorText(err)),
  });
  const update = useMutation({
    mutationFn: ({ id, origins }) => api(`${base}/${id}`, { method: 'PATCH', body: { allowedOrigins: lines(origins) } }),
    onSuccess: () => { setForm(null); toast('Đã lưu'); refresh(); },
    onError: (err) => setError(errorText(err)),
  });
  const disconnect = useMutation({ mutationFn: (id) => api(`${base}/${id}`, { method: 'DELETE' }), onSuccess: () => { toast('Đã ngắt kết nối'); refresh(); }, onError: (err) => toast(err.message) });
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast('Đã chép mã nhúng'), () => toast('Không chép được, hãy bôi đen và chép tay'));
  const open = (f) => { setError(''); setForm(f); };

  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row wrap">
        <h3 className="grow">Kênh chat</h3>
        {manage && <button className="btn primary" onClick={() => open({ kind: 'webchat', name: 'Chat trên website', origins: '' })}><Plus size={15} /> Chat trên website</button>}
        {manage && <button className="btn" onClick={() => open({ kind: 'facebook', name: '', pageId: '', pageAccessToken: '' })}><PlatformIcon platform="facebook" /> Facebook Page</button>}
      </div>
      <div className="muted small">Tin nhắn từ các kênh dưới đây về chung hộp thư Livechat. Zalo OA, Instagram và TikTok Shop sẽ có khi đăng ký xong tài khoản nhà phát triển.</div>
      {channels.isError && <div className="field-error">{channels.error.message}</div>}
      {channels.isSuccess && channels.data.length === 0 && <div className="empty">Chưa kết nối kênh nào.</div>}
      {channels.data?.map((c) => {
        const [color, label] = STATUS[c.status] ?? ['', c.status];
        return (
          <div key={c.id} data-testid="channel-row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="row">
              <PlatformIcon platform={PLATFORM_KEY[c.platform]} size={18} />
              <div className="grow"><b>{c.name}</b><div className="muted small">{PLATFORM_LABEL[c.platform]}{c.platform === 'FACEBOOK' ? ` · Page ID ${c.externalId}` : ''}</div></div>
              <span className={`badge ${color}`}>{label}</span>
              {manage && c.platform === 'WEBCHAT' && c.status !== 'DISCONNECTED' && <button className="btn sm" onClick={() => open({ kind: 'origins', id: c.id, origins: c.allowedOrigins.join('\n') })}>Website được phép</button>}
              {manage && c.status !== 'DISCONNECTED' && <button className="btn sm" title="Ngắt kết nối" onClick={() => window.confirm(`Ngắt kết nối "${c.name}"? Hội thoại cũ vẫn được giữ.`) && disconnect.mutate(c.id)}><Unplug size={13} /> Ngắt</button>}
            </div>
            {c.platform === 'WEBCHAT' && c.status !== 'DISCONNECTED' && (
              <>
                <div className="muted small">Dán đoạn mã này trước thẻ <code>&lt;/body&gt;</code> của website (với WordPress: dán vào phần chân trang của giao diện):</div>
                <div className="row">
                  <code className="grow" data-testid="embed-code" style={{ fontSize: 12, background: '#f8fafc', padding: 8, borderRadius: 6, overflowX: 'auto', whiteSpace: 'nowrap' }}>{embedCode(c.externalId)}</code>
                  <button className="btn sm" onClick={() => copy(embedCode(c.externalId))}><Copy size={13} /> Chép</button>
                </div>
                <div className="muted small">{c.allowedOrigins.length ? `Chỉ nhận chat từ: ${c.allowedOrigins.join(', ')}` : 'Chưa giới hạn website — nên khai báo website của bạn để nơi khác không gắn được khung chat này.'}</div>
              </>
            )}
          </div>
        );
      })}

      {form?.kind === 'webchat' && (
        <Modal title="Thêm chat trên website" onClose={() => setForm(null)} footer={<button className="btn primary" disabled={create.isPending} onClick={() => create.mutate(form)}>Tạo kênh</button>}>
          <label className="field"><span>Tên kênh</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>Website được phép (mỗi dòng một địa chỉ, ví dụ https://shopcuaban.vn)</span><textarea className="textarea" value={form.origins} onChange={(e) => setForm({ ...form, origins: e.target.value })} /></label>
          {error && <div className="field-error">{error}</div>}
        </Modal>
      )}
      {form?.kind === 'origins' && (
        <Modal title="Website được phép" onClose={() => setForm(null)} footer={<button className="btn primary" disabled={update.isPending} onClick={() => update.mutate(form)}>Lưu</button>}>
          <label className="field"><span>Mỗi dòng một địa chỉ. Để trống: website nào cũng gắn được.</span><textarea className="textarea" value={form.origins} onChange={(e) => setForm({ ...form, origins: e.target.value })} /></label>
          {error && <div className="field-error">{error}</div>}
        </Modal>
      )}
      {form?.kind === 'facebook' && (
        <Modal title="Kết nối Facebook Page" onClose={() => setForm(null)} footer={<button className="btn primary" disabled={create.isPending} onClick={() => create.mutate(form)}>Kết nối</button>}>
          <div className="muted small">Tạm thời nhập tay Page ID và Page access token lấy từ Meta for Developers. Nút “Đăng nhập Facebook” sẽ có khi app Meta được duyệt. Token được mã hóa khi lưu.</div>
          <label className="field"><span>Tên Page</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>Page ID</span><input className="input" inputMode="numeric" value={form.pageId} onChange={(e) => setForm({ ...form, pageId: e.target.value })} /></label>
          <label className="field"><span>Page access token</span><input className="input" type="password" autoComplete="off" value={form.pageAccessToken} onChange={(e) => setForm({ ...form, pageAccessToken: e.target.value })} /></label>
          {error && <div className="field-error">{error}</div>}
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
