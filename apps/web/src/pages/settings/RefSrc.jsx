// Cài đặt → Ref & Src (ADS-08): links that carry a ref code, so a customer arriving through them is tagged with where
// they came from. Messenger reads ?ref= on m.me links and the ad clicked; the website chat reads ?ref= / utm_* of the
// page the visitor landed on. The source shows on the conversation and on the customer's profile (first source kept).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Link2 } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { PlatformIcon, useToast } from '../../components/ui.jsx';
import { PLATFORM_KEY } from '../../platforms.js';

const CODE = /^[\w.~-]{1,100}$/;

export default function RefSrc() {
  const { shop } = useAuth();
  const [toast, toastNode] = useToast();
  const [ref, setRef] = useState('');
  const [src, setSrc] = useState('');
  const channels = useQuery({ queryKey: ['channels', shop.id], queryFn: () => api(`/shops/${shop.id}/channels`) });
  const code = ref.trim();
  const valid = CODE.test(code) && (!src.trim() || CODE.test(src.trim()));
  const copy = (t) => { navigator.clipboard?.writeText(t); toast('Đã sao chép'); };
  const links = (channels.data ?? []).filter((c) => c.status !== 'DISCONNECTED').flatMap((c) => {
    if (c.platform === 'FACEBOOK') return [{ id: c.id, channel: c, url: `https://m.me/${c.externalId}?ref=${encodeURIComponent(code)}` }];
    if (c.platform === 'WEBCHAT') {
      const q = new URLSearchParams({ utm_source: src.trim() || 'website', utm_campaign: code });
      return (c.allowedOrigins?.length ? c.allowedOrigins : ['https://website-cua-ban.vn']).map((o) => ({ id: `${c.id}-${o}`, channel: c, url: `${o.replace(/\/$/, '')}/?${q}` }));
    }
    return [];
  });

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <h2>Ref & Src</h2>
        <div className="muted small">Tạo link có mã giới thiệu (ref) để biết khách đến từ đâu: bài đăng, KOL, livestream, chiến dịch. Khách bấm link rồi nhắn tin sẽ được gắn ref và nguồn (src) vào hội thoại và hồ sơ khách. Khách bấm quảng cáo Messenger được gắn mã quảng cáo tự động, không cần link.</div>
      </div>
      <div className="card card-pad settings-section">
        <div className="form-grid">
          <label className="field">Mã ref<input className="input" placeholder="vd: livestream-21h" value={ref} onChange={(e) => setRef(e.target.value)} /></label>
          <label className="field">Nguồn cho website (utm_source)<input className="input" placeholder="website" value={src} onChange={(e) => setSrc(e.target.value)} /></label>
        </div>
        {code && !valid && <div className="field-error small">Chỉ dùng chữ không dấu, số và các ký tự . _ ~ - (tối đa 100 ký tự).</div>}
        {channels.isError && <div className="field-error">{channels.error.message}</div>}
        {channels.isSuccess && !links.length && <div className="empty">Chưa có Page Facebook hay khung chat website nào. Kết nối ở mục Kênh chat.</div>}
        {valid && links.map((l) => (
          <div key={l.id} className="row small" data-testid="ref-link">
            <PlatformIcon platform={PLATFORM_KEY[l.channel.platform]} size={14} />
            <span style={{ width: 160 }} className="muted">{l.channel.name}</span>
            <code className="grow" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{l.url}</code>
            <button className="icon-btn" aria-label="Sao chép link" onClick={() => copy(l.url)}><Copy size={14} /></button>
          </div>
        ))}
        <div className="muted small"><Link2 size={12} /> Nguồn mặc định khi khách tự nhắn: facebook, website… Khách bấm quảng cáo: facebook_ads. Gắn chiến dịch quảng cáo theo mã quảng cáo sẽ có khi kết nối tài khoản quảng cáo (Bước 14).</div>
      </div>
      {toastNode}
    </>
  );
}
