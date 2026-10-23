import { useState } from 'react';
import { Plus, CalendarClock, CheckCircle2, Trash2, Send } from 'lucide-react';
import { useStore, uid } from '../store.jsx';
import { Modal, PlatformIcon, useToast } from '../components/ui.jsx';

const toLocalInput = (ts) => {
  const d = new Date(ts);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export default function Posts() {
  const { state, update } = useStore();
  const [open, setOpen] = useState(false);
  const [toast, toastNode] = useToast();
  const posts = [...state.posts].sort((a, b) => b.scheduledAt - a.scheduledAt);

  if (!posts.length) {
    return (
      <div className="page">
        <div className="card post-hero">
          <h3>Đặt lịch đăng bài lên nhiều kênh cùng lúc</h3>
          <CalendarClock size={80} color="var(--primary)" strokeWidth={1.2} />
          <button className="btn green" onClick={() => setOpen(true)}><Plus size={15} /> Tạo bài viết</button>
        </div>
        {open && <PostModal onClose={() => setOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 960, margin: '0 auto' }}>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h2>Bài viết</h2>
        <button className="btn green" onClick={() => setOpen(true)}><Plus size={15} /> Tạo bài viết</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {posts.map((p) => (
          <div key={p.id} className="card card-pad row" style={{ alignItems: 'flex-start' }}>
            <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{p.content}</div>
              <div className="row wrap small muted">
                {p.status === 'published'
                  ? <span className="badge green"><CheckCircle2 size={12} /> Đã đăng</span>
                  : <span className="badge blue"><CalendarClock size={12} /> Lên lịch</span>}
                {new Date(p.scheduledAt).toLocaleString('vi-VN')}
                {p.channelIds.map((id) => {
                  const ch = state.channels.find((c) => c.id === id);
                  return ch && <span key={id} className="row" style={{ gap: 4 }}><PlatformIcon platform={ch.platform} /> {ch.name}</span>;
                })}
              </div>
            </div>
            {p.status !== 'published' && (
              <button className="btn sm" onClick={() => { update((d) => { const x = d.posts.find((y) => y.id === p.id); x.status = 'published'; x.scheduledAt = Date.now(); }); toast('Đã đăng bài'); }}><Send size={13} /> Đăng ngay</button>
            )}
            <button className="icon-btn" onClick={() => update((d) => { d.posts = d.posts.filter((x) => x.id !== p.id); })}><Trash2 size={15} color="var(--muted)" /></button>
          </div>
        ))}
      </div>
      {open && <PostModal onClose={() => setOpen(false)} onSaved={() => toast('Đã lên lịch bài viết')} />}
      {toastNode}
    </div>
  );
}

function PostModal({ onClose, onSaved }) {
  const { state, update } = useStore();
  const [content, setContent] = useState('');
  const [channelIds, setChannelIds] = useState(state.channels.map((c) => c.id));
  const [when, setWhen] = useState(toLocalInput(Date.now() + 3600 * 1000));

  const toggle = (id) => setChannelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const save = () => {
    update((d) => { d.posts.push({ id: uid(), content, channelIds, scheduledAt: new Date(when).getTime(), status: 'scheduled' }); });
    onSaved?.();
    onClose();
  };

  return (
    <Modal title="Tạo bài viết" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" onClick={save} disabled={!content.trim() || !channelIds.length}>Lên lịch</button></>}>
      <label className="field">Nội dung<textarea className="textarea" style={{ minHeight: 140 }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Bạn muốn chia sẻ gì?" /></label>
      <div className="field">Đăng lên kênh
        <div className="channel-pick">
          {state.channels.map((c) => (
            <label key={c.id} className={channelIds.includes(c.id) ? 'on' : ''}>
              <input type="checkbox" hidden checked={channelIds.includes(c.id)} onChange={() => toggle(c.id)} />
              <PlatformIcon platform={c.platform} /> {c.name}
            </label>
          ))}
        </div>
      </div>
      <label className="field">Thời gian đăng<input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
    </Modal>
  );
}
