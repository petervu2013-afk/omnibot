import { useEffect, useState } from 'react';
import { X, Facebook, Instagram, Globe, MessageCircle, Music2 } from 'lucide-react';
import { PLATFORMS } from '../store.jsx';

const AVATAR_COLORS = ['#0b66ff', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777'];

export function Avatar({ name = '?', size = '' }) {
  const initials = name.split(' ').filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase();
  const color = AVATAR_COLORS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return <div className={`avatar ${size}`} style={{ background: color }}>{initials}</div>;
}

const PLATFORM_ICONS = { facebook: Facebook, instagram: Instagram, website: Globe, zalo: MessageCircle, tiktok: Music2 };

export function PlatformIcon({ platform, size = 14, color }) {
  const Icon = PLATFORM_ICONS[platform] || Globe;
  return <Icon size={size} color={color || PLATFORMS[platform]?.color} />;
}

export function PlatformBadge({ platform }) {
  const p = PLATFORMS[platform];
  return (
    <span className="badge" style={{ background: p.color + '18', color: p.color }}>
      <PlatformIcon platform={platform} size={12} /> {p.label}
    </span>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Switch({ on, onChange }) {
  return <button type="button" className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} />;
}

export function ChipsInput({ values, onChange, placeholder = 'Thêm + Enter' }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div className="chips">
      {values.map((v) => (
        <span className="chip" key={v}>
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))}><X size={13} /></button>
        </span>
      ))}
      <input
        className="chip-input"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add}
      />
    </div>
  );
}

const CATEGORY_EMOJI = { 'Bàn ăn': '🍽️', Sofa: '🛋️', 'Kệ & tủ': '🗄️', Ghế: '🪑', Giường: '🛏️' };
export const productEmoji = (p) => CATEGORY_EMOJI[p?.category] || '📦';

// Product cards the AI attaches to a reply (rendered like a Messenger carousel).
export function ProductCards({ ids = [], products }) {
  const list = ids.map((id) => products.find((p) => p.id === id)).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="product-cards">
      {list.map((p) => (
        <div className="product-card" key={p.id}>
          <div className="product-thumb">{productEmoji(p)}</div>
          <div className="product-info">
            <b>{p.name}</b>
            <span className="price">{p.price.toLocaleString('vi-VN')}đ</span>
            <span className={`small ${p.stock > 0 ? 'muted' : 'out'}`}>{p.stock > 0 ? `Còn ${p.stock}` : 'Hết hàng'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EngineTag({ meta }) {
  if (!meta) return null;
  const secs = meta.latencyMs ? ` · ${(meta.latencyMs / 1000).toFixed(1)}s` : '';
  const label = { claude: '✨ AI Claude', local: '⚙️ AI nội bộ', sample: '✨ AI (dữ liệu mẫu)' }[meta.engine] || '✨ AI';
  return <span>{label}{secs}</span>;
}

let toastTimer;
export function useToast() {
  const [msg, setMsg] = useState(null);
  const show = (m) => { setMsg(m); clearTimeout(toastTimer); toastTimer = setTimeout(() => setMsg(null), 2200); };
  const node = msg ? <div className="toast">{msg}</div> : null;
  return [show, node];
}
