import { useState } from 'react';
import { Bot, LayoutTemplate, Plus, Search, Merge, Settings2, MessageSquare, Trash2, BookOpen, PlayCircle, Copy } from 'lucide-react';
import { useStore, PLATFORMS, TEMPLATES, uid, defaultBot } from '../store.jsx';
import { navigate } from '../router.js';
import { Modal, PlatformBadge, PlatformIcon, Switch, Avatar, useToast } from '../components/ui.jsx';
import BotTester from '../components/BotTester.jsx';

const MAX_CHANNELS = 10;

export default function Dashboard({ tab }) {
  const { state, update } = useStore();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);
  const [testTemplate, setTestTemplate] = useState(null);
  const [copyTemplate, setCopyTemplate] = useState(null);
  const [toast, toastNode] = useToast();

  const channels = state.channels.filter(
    (c) => (filter === 'all' || c.platform === filter) && c.name.toLowerCase().includes(query.toLowerCase()),
  );
  const templates = TEMPLATES.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));

  const statsFor = (ch) => {
    const convs = state.conversations.filter((v) => v.channelId === ch.id);
    return {
      conversations: convs.length,
      unread: convs.reduce((s, v) => s + v.unread, 0),
      orders: state.orders.filter((o) => o.channelId === ch.id).length,
    };
  };

  const applyTemplate = (tpl, channelId) => {
    update((d) => {
      const ch = d.channels.find((c) => c.id === channelId);
      const bot = defaultBot(ch.name);
      bot.welcome = `${tpl.emoji} Chào mừng bạn đến với ${ch.name}! Bot mẫu "${tpl.name}" sẵn sàng hỗ trợ bạn.`;
      ch.bot = bot;
    });
    setCopyTemplate(null);
    toast(`Đã sao chép bot mẫu "${tpl.name}"`);
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div className="segmented">
          <button className={tab === 'mine' ? 'active' : ''} onClick={() => navigate('dashboard')}><Bot size={15} /> Bot của tôi</button>
          <button className={tab === 'templates' ? 'active' : ''} onClick={() => navigate('templates')}><LayoutTemplate size={15} /> Bot mẫu</button>
        </div>
        <div className="grow" />
        {tab === 'mine' && (
          <select className="select" style={{ width: 160 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Tất cả kênh</option>
            {Object.entries(PLATFORMS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        )}
        <div className="search" style={{ width: 240 }}>
          <Search size={15} />
          <input className="input" placeholder="Tìm kiếm" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="grow" />
        <button className="btn green" onClick={() => toast('Đã gộp hộp thư các kênh vào Livechat')}><Merge size={15} /> Gộp kênh</button>
      </div>

      {tab === 'mine' ? (
        <div className="grid-cards">
          <button className="connect-card" onClick={() => setConnectOpen(true)} disabled={state.channels.length >= MAX_CHANNELS}>
            <Plus size={26} /> Kết nối kênh mới ({state.channels.length}/{MAX_CHANNELS})
          </button>
          {channels.map((ch) => {
            const s = statsFor(ch);
            return (
              <div className="card channel-card" key={ch.id}>
                <div className="row">
                  <div style={{ position: 'relative' }}>
                    <Avatar name={ch.name} size="lg" />
                  </div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <h3 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.name}</h3>
                    <div className="row" style={{ marginTop: 6, gap: 6 }}>
                      <PlatformBadge platform={ch.platform} />
                      <span className="muted small">{ch.followers.toLocaleString('vi-VN')} theo dõi</span>
                    </div>
                  </div>
                </div>
                <div className="channel-stats">
                  <div><b>{s.conversations}</b><span className="muted small">Hội thoại</span></div>
                  <div><b style={{ color: s.unread ? 'var(--red)' : undefined }}>{s.unread}</b><span className="muted small">Chưa đọc</span></div>
                  <div><b>{s.orders}</b><span className="muted small">Đơn hàng</span></div>
                </div>
                <div className="row between">
                  <div className="row small">
                    <Switch on={ch.bot.enabled} onChange={(v) => update((d) => { d.channels.find((c) => c.id === ch.id).bot.enabled = v; })} />
                    Chatbot {ch.bot.enabled ? 'đang bật' : 'đang tắt'}
                  </div>
                  <button className="icon-btn" title="Ngắt kết nối" onClick={() => {
                    if (confirm(`Ngắt kết nối "${ch.name}"?`)) update((d) => { d.channels = d.channels.filter((c) => c.id !== ch.id); });
                  }}><Trash2 size={16} color="var(--muted)" /></button>
                </div>
                <div className="row">
                  <button className="btn grow" style={{ justifyContent: 'center' }} onClick={() => navigate('livechat')}><MessageSquare size={15} /> Livechat</button>
                  <button className="btn primary grow" style={{ justifyContent: 'center' }} onClick={() => navigate('bot/' + ch.id)}><Settings2 size={15} /> Cấu hình bot</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="template-grid">
          {templates.map((t) => (
            <div className="card template-card" key={t.id}>
              <div className="template-thumb" style={{ background: t.gradient }}>{t.emoji}</div>
              <div className="template-body">
                <b>{t.name}</b>
                <span className="muted small row" style={{ gap: 4 }}><BookOpen size={13} /> {t.category}</span>
                <div className="template-actions">
                  <button className="btn outline-primary" onClick={() => setTestTemplate(t)}><PlayCircle size={14} /> Test bot</button>
                  <button className="btn primary" onClick={() => setCopyTemplate(t)}><Copy size={14} /> Sao chép</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {connectOpen && <ConnectModal onClose={() => setConnectOpen(false)} onDone={(name) => { setConnectOpen(false); toast(`Đã kết nối "${name}"`); }} />}

      {testTemplate && (
        <Modal title={`Test bot: ${testTemplate.name}`} onClose={() => setTestTemplate(null)}>
          <BotTester title={testTemplate.name} bot={{ ...defaultBot(testTemplate.name), welcome: `${testTemplate.emoji} Xin chào! Đây là bot mẫu "${testTemplate.name}". Hãy thử hỏi "giá", "địa chỉ" hoặc "đặt lịch".` }} />
        </Modal>
      )}

      {copyTemplate && (
        <Modal title={`Sao chép "${copyTemplate.name}" vào kênh`} onClose={() => setCopyTemplate(null)}>
          {state.channels.length === 0 && <div className="muted">Hãy kết nối một kênh trước.</div>}
          {state.channels.map((ch) => (
            <button key={ch.id} className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => applyTemplate(copyTemplate, ch.id)}>
              <PlatformIcon platform={ch.platform} /> {ch.name}
            </button>
          ))}
          <div className="muted small">Lưu ý: cấu hình bot hiện tại của kênh sẽ bị thay thế.</div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}

function ConnectModal({ onClose, onDone }) {
  const { update } = useStore();
  const [platform, setPlatform] = useState('facebook');
  const [name, setName] = useState('');

  const connect = () => {
    const n = name.trim();
    if (!n) return;
    update((d) => {
      d.channels.push({ id: uid(), name: n, platform, followers: 0, connectedAt: Date.now(), bot: defaultBot(n) });
    });
    onDone(n);
  };

  return (
    <Modal
      title="Kết nối kênh mới"
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" onClick={connect} disabled={!name.trim()}>Kết nối</button></>}
    >
      <div className="muted small">Chọn nền tảng. Ở bản demo, kênh được tạo giả lập; khi triển khai thật, bước này sẽ mở OAuth của Facebook/Zalo để chọn Page.</div>
      <div className="channel-pick">
        {Object.entries(PLATFORMS).map(([k, p]) => (
          <label key={k} className={platform === k ? 'on' : ''}>
            <input type="radio" hidden checked={platform === k} onChange={() => setPlatform(k)} />
            <PlatformIcon platform={k} /> {p.label}
          </label>
        ))}
      </div>
      <label className="field">Tên Page / kênh
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && connect()} placeholder="VD: Shop Nội Thất ABC" />
      </label>
    </Modal>
  );
}
