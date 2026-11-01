import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Inbox, MessageCircle, Phone, MapPin, Tag, ShoppingCart, CalendarDays, Bot, Send, Smile, Zap,
  ArrowLeft, UserRound, ListFilter, Megaphone, UserCog, Sparkles, StickyNote, Theater,
} from 'lucide-react';
import { useStore, uid, timeAgo, money, orderTotal, PLATFORMS, AD_PLATFORMS } from '../store.jsx';
import { useAutoReply } from '../autoReply.js';
import { aiHealth } from '../ai.js';
import { Avatar, PlatformIcon, Switch, ChipsInput, ProductCards, EngineTag, useToast } from '../components/ui.jsx';
import { OrderModal } from './Orders.jsx';

const SAMPLE_INCOMING = [
  'Shop ơi bàn ăn gỗ sồi giá bao nhiêu?', 'Sofa da còn màu nâu không shop', 'Có kệ tivi cho tivi 65 inch không?',
  'Ghế cafe giá sỉ bao nhiêu shop', 'Giao hàng về Bình Dương mất bao lâu?', 'Mình thấy quảng cáo, tư vấn giúp mình bàn ăn cho 6 người',
  'Giường gỗ sồi còn hàng không?', 'Hi shop', 'Bảo hành sofa bao lâu vậy?',
];
const RANDOM_NAMES = ['Đặng Gia Huy', 'Bùi Ngọc Mai', 'Hoàng Đức Thịnh', 'Ngô Phương Linh', 'Đỗ Khánh Vy', 'Lý Quốc Bảo'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export default function Livechat() {
  const { state, update, typing } = useStore();
  const { receive } = useAutoReply();
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [view, setView] = useState('all'); // all | unread | ai | handoff
  const [health, setHealth] = useState(null);
  const [toast, toastNode] = useToast();

  useEffect(() => { aiHealth(true).then(setHealth); }, []);

  const customerOf = (v) => state.customers.find((u) => u.id === v.customerId) || { name: 'Khách', tags: [] };
  const channelOf = (v) => state.channels.find((c) => c.id === v.channelId);

  const list = useMemo(() => state.conversations
    .filter((v) => channelFilter === 'all' || v.channelId === channelFilter)
    .filter((v) => view === 'all' || (view === 'unread' ? v.unread > 0 : view === 'ai' ? v.botActive : v.handoff && !v.botActive))
    .filter((v) => customerOf(v).name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (b.messages.at(-1)?.at || 0) - (a.messages.at(-1)?.at || 0))
    .slice(0, 150),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [state.conversations, state.customers, query, channelFilter, view]);

  const active = state.conversations.find((v) => v.id === activeId);
  const handoffCount = state.conversations.filter((v) => v.handoff && !v.botActive && v.status !== 'done').length;

  const open = (id) => {
    setActiveId(id);
    update((d) => { d.conversations.find((v) => v.id === id).unread = 0; });
  };

  // Demo helper: a new customer (sometimes from an ad) messages a random channel; the AI answers on its own.
  const simulateIncoming = async () => {
    if (!state.channels.length) return toast('Chưa có kênh nào được kết nối');
    const text = pick(SAMPLE_INCOMING);
    const campaign = Math.random() < 0.6 ? pick(state.campaigns) : null;
    const ch = campaign ? state.channels.find((c) => c.id === campaign.channelId) || pick(state.channels) : pick(state.channels);
    const custId = uid();
    const convId = uid();
    update((d) => {
      d.customers.push({ id: custId, name: pick(RANDOM_NAMES), phone: '', tags: ['Khách mới'], note: '', address: '', campaignId: campaign?.id || null, firstSeen: Date.now() });
      d.conversations.push({ id: convId, channelId: ch.id, customerId: custId, unread: 1, botActive: true, campaignId: campaign?.id || null, status: 'open', messages: [] });
    });
    toast(`Tin nhắn mới từ ${ch.name}${campaign ? ' (quảng cáo)' : ''}`);
    const outcome = await receive(convId, text);
    if (outcome?.handoff) toast('AI đã chuyển một hội thoại cho nhân viên');
  };

  return (
    <div className={`livechat ${active ? 'has-active' : ''}`}>
      <div className="lc-rail">
        <button className={`icon-btn ${view === 'all' ? 'active' : ''}`} title="Tất cả hội thoại" onClick={() => setView('all')}><Inbox size={18} /></button>
        <button className={`icon-btn ${view === 'unread' ? 'active' : ''}`} title="Chưa đọc" onClick={() => setView('unread')}><MessageCircle size={18} /></button>
        <button className={`icon-btn ${view === 'ai' ? 'active' : ''}`} title="AI đang tự động xử lý" onClick={() => setView('ai')}><Bot size={18} /></button>
        <button className={`icon-btn ${view === 'handoff' ? 'active' : ''}`} title="Cần nhân viên" onClick={() => setView('handoff')}>
          <UserCog size={18} />{handoffCount > 0 && <span className="dot">{handoffCount}</span>}
        </button>
      </div>

      <div className="lc-list">
        <div className="lc-list-head">
          {health && (
            <div className={`ai-banner ${health.ai ? 'on' : 'off'}`}>
              <Sparkles size={15} />
              <span className="grow">{health.ai ? 'AI Claude đang tự động trả lời' : health.ok ? 'Chưa có API key – dùng AI nội bộ theo danh mục' : 'Chưa chạy server AI – dùng AI nội bộ'}</span>
            </div>
          )}
          <div className="row">
            <div className="search grow"><Search size={14} /><input className="input" placeholder="Tìm tên khách..." value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            <button className="btn sm" title="Giả lập khách nhắn tin" onClick={simulateIncoming}><Plus size={15} /></button>
          </div>
          <div className="row">
            <ListFilter size={14} className="muted" />
            <select className="select" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
              <option value="all">Tất cả kênh</option>
              {state.channels.map((c) => <option key={c.id} value={c.id}>{c.name} ({PLATFORMS[c.platform].label})</option>)}
            </select>
          </div>
          <div className="muted small">{list.length} hội thoại · bấm <b>+</b> để giả lập khách nhắn tin</div>
        </div>
        <div className="lc-items">
          {list.length === 0 && <div className="empty small">Không có hội thoại</div>}
          {list.map((v) => {
            const cust = customerOf(v);
            const ch = channelOf(v);
            const last = v.messages.at(-1);
            const camp = state.campaigns.find((c) => c.id === v.campaignId);
            return (
              <div key={v.id} className={`lc-item ${v.id === activeId ? 'active' : ''} ${v.unread ? 'unread' : ''}`} onClick={() => open(v.id)}>
                <Avatar name={cust.name} />
                {ch && <span className="platform-dot" style={{ background: '#fff' }}><PlatformIcon platform={ch.platform} size={10} /></span>}
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row between"><b style={{ fontSize: 13.5 }}>{cust.name}</b><span className="muted small">{last ? timeAgo(last.at) : ''}</span></div>
                  <div className="row between" style={{ gap: 6 }}>
                    <div className="preview">
                      {typing[v.id] ? <i>AI đang trả lời…</i> : <>{last?.from === 'ai' ? '✨ ' : last?.from === 'bot' ? '🤖 ' : last?.from === 'agent' ? 'Bạn: ' : ''}{last?.text}</>}
                    </div>
                    {v.unread > 0 && <span className="unread-count">{v.unread}</span>}
                  </div>
                  <div className="row small" style={{ marginTop: 3, gap: 6 }}>
                    {v.handoff && !v.botActive && <span className="badge orange">Cần nhân viên</span>}
                    {v.botActive && <span className="badge blue">AI</span>}
                    {camp && <span className="badge" title={camp.name}><Megaphone size={10} /> {AD_PLATFORMS[camp.platform].label}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {active ? (
        <Thread key={active.id} conv={active} customer={customerOf(active)} channel={channelOf(active)} onBack={() => setActiveId(null)} toast={toast} />
      ) : (
        <div className="lc-empty">
          <div className="bubble-icon"><MessageCircle size={34} /></div>
          <h3>Chào mừng bạn đến với Livechat</h3>
          <div className="muted">Chọn một hội thoại từ danh sách bên trái để bắt đầu.</div>
        </div>
      )}
      {toastNode}
    </div>
  );
}

function Thread({ conv, customer, channel, onBack, toast }) {
  const { state, update, typing } = useStore();
  const { receive, respond } = useAutoReply();
  const [text, setText] = useState('');
  const [roleplay, setRoleplay] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const bodyRef = useRef(null);
  const isTyping = !!typing[conv.id];
  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight); }, [conv.messages.length, isTyping]);

  const setConv = (fn) => update((d) => fn(d.conversations.find((v) => v.id === conv.id)));
  const setCustomer = (fn) => update((d) => fn(d.customers.find((u) => u.id === customer.id)));
  const campaign = state.campaigns.find((c) => c.id === conv.campaignId);

  const send = async () => {
    const v = text.trim();
    if (!v) return;
    setText('');
    if (roleplay) {
      const outcome = await receive(conv.id, v);
      if (outcome?.orderId) toast(`AI đã tự tạo đơn #${outcome.orderId}`);
      if (outcome?.handoff) toast('AI chuyển hội thoại cho nhân viên');
      return;
    }
    // A human reply takes over the conversation from the AI.
    setConv((c) => { c.messages.push({ id: uid(), from: 'agent', text: v, at: Date.now() }); c.botActive = false; });
  };
  const toggleAi = (on) => {
    setConv((c) => { c.botActive = on; if (on) c.handoff = false; });
    if (on && conv.messages.at(-1)?.from === 'customer') setTimeout(() => respond(conv.id), 0);
  };
  const onChange = (e) => {
    const v = e.target.value;
    const saved = !roleplay && state.savedReplies.find((s) => v.trim() === s.shortcut);
    setText(saved ? saved.text : v);
  };
  const suggestions = !roleplay && text.startsWith('/') ? state.savedReplies.filter((s) => s.shortcut.startsWith(text.trim())) : [];
  const orders = state.orders.filter((o) => o.customerId === customer.id);

  return (
    <>
      <div className="lc-thread">
        <div className="lc-thread-head">
          <button className="icon-btn" onClick={onBack} title="Quay lại"><ArrowLeft size={18} /></button>
          <Avatar name={customer.name} size="sm" />
          <div className="grow" style={{ minWidth: 0 }}>
            <b>{customer.name}</b>
            <div className="muted small row" style={{ gap: 4 }}>
              {channel && <PlatformIcon platform={channel.platform} size={12} />} {channel?.name}
              {campaign && <> · <Megaphone size={11} /> {campaign.name}</>}
            </div>
          </div>
          <div className="row small"><Switch on={conv.botActive} onChange={toggleAi} /> AI tự động</div>
        </div>
        {conv.handoff && !conv.botActive && (
          <div className="ai-banner off" style={{ borderRadius: 0 }}><UserCog size={15} /> AI đã chuyển cho nhân viên: {conv.handoffReason || 'cần hỗ trợ'}</div>
        )}
        <div className="lc-messages" ref={bodyRef}>
          {conv.messages.map((m) => (
            <div key={m.id} className={`msg ${m.from === 'customer' ? 'in' : 'out'} ${m.from === 'bot' ? 'bot' : ''} ${m.from === 'ai' ? 'ai' : ''}`}>
              <div className="bubble">{m.text}</div>
              {m.productIds?.length > 0 && <ProductCards ids={m.productIds} products={state.products} />}
              {m.buttons?.length > 0 && <div className="msg-buttons">{m.buttons.map((b) => <span key={b}>{b}</span>)}</div>}
              <span className="meta">
                {m.from === 'ai' ? <><EngineTag meta={m.meta} /> · </> : m.from === 'bot' ? '🤖 Kịch bản · ' : m.from === 'agent' ? 'Nhân viên · ' : ''}
                {new Date(m.at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
              </span>
            </div>
          ))}
          {typing[conv.id] && <div className="typing">AI đang soạn <i /><i /><i /></div>}
        </div>
        <div className="lc-composer">
          {suggestions.length > 0 && (
            <div className="saved-suggest">
              {suggestions.map((s) => <button key={s.id} className="btn sm" onClick={() => setText(s.text)}><Zap size={12} /> {s.shortcut}</button>)}
            </div>
          )}
          {roleplay && <div className="roleplay">Chế độ thử: bạn đang nhắn với vai <b>khách hàng</b> – AI sẽ tự trả lời, thu SĐT và chốt đơn.</div>}
          <textarea
            value={text}
            onChange={onChange}
            placeholder={roleplay ? 'Nhập tin nhắn của khách hàng…' : 'Nhập tin nhắn... (Enter để gửi, gõ / để dùng tin nhắn mẫu)'}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <div className="row">
            <button className={`btn sm ${roleplay ? 'outline-primary' : ''}`} title="Nhập vai khách hàng để thử AI" onClick={() => setRoleplay(!roleplay)}><Theater size={14} /> Nhập vai khách</button>
            <button className="icon-btn" title="Emoji" onClick={() => setText((t) => t + '😊')}><Smile size={17} color="var(--muted)" /></button>
            {!roleplay && <button className="icon-btn" title="Tin nhắn mẫu" onClick={() => setText('/')}><Zap size={17} color="var(--muted)" /></button>}
            <div className="grow" />
            <button className="btn primary" onClick={send} disabled={!text.trim() || typing[conv.id]}><Send size={15} /> Gửi</button>
          </div>
        </div>
      </div>

      <aside className="lc-info">
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Avatar name={customer.name} size="lg" />
          <h3>{customer.name}</h3>
          <div className="chips" style={{ justifyContent: 'center' }}>{customer.tags.map((t) => <span className="tag" key={t}>{t}</span>)}</div>
        </div>
        {campaign && (
          <div className="card-pad" style={{ background: '#f8fafc', borderRadius: 8, padding: 10 }}>
            <div className="muted small">Nguồn quảng cáo</div>
            <b className="small">{campaign.name}</b>
          </div>
        )}
        <label className="field"><span className="row" style={{ gap: 6 }}><UserRound size={14} /> Họ tên</span>
          <input className="input" value={customer.name} onChange={(e) => setCustomer((u) => { u.name = e.target.value; })} />
        </label>
        <label className="field"><span className="row" style={{ gap: 6 }}><Phone size={14} /> Số điện thoại</span>
          <input className="input" value={customer.phone} placeholder="AI sẽ tự thu thập" onChange={(e) => setCustomer((u) => { u.phone = e.target.value; })} />
        </label>
        <label className="field"><span className="row" style={{ gap: 6 }}><MapPin size={14} /> Địa chỉ</span>
          <input className="input" value={customer.address || ''} placeholder="AI sẽ tự thu thập" onChange={(e) => setCustomer((u) => { u.address = e.target.value; })} />
        </label>
        <div className="field"><span className="row" style={{ gap: 6, fontWeight: 600, fontSize: 13 }}><Tag size={14} /> Nhãn</span>
          <ChipsInput values={customer.tags} placeholder="Nhãn + Enter" onChange={(v) => setCustomer((u) => { u.tags = v; })} />
        </div>
        <label className="field"><span className="row" style={{ gap: 6 }}><StickyNote size={14} /> Ghi chú</span>
          <textarea className="textarea" value={customer.note} onChange={(e) => setCustomer((u) => { u.note = e.target.value; })} />
        </label>
        <div className="row">
          <button className="btn primary grow" style={{ justifyContent: 'center' }} onClick={() => setOrderOpen(true)}><ShoppingCart size={15} /> Tạo đơn</button>
          <button className="btn grow" style={{ justifyContent: 'center' }} onClick={() => {
            const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(9, 0, 0, 0);
            update((d) => { d.bookings.push({ id: uid(), title: `Hẹn – ${customer.name}`, customerId: customer.id, start: start.getTime(), duration: 60, remind: true }); });
            toast('Đã tạo lịch hẹn 9:00 ngày mai');
          }}><CalendarDays size={15} /> Đặt lịch</button>
        </div>
        <div>
          <b className="small">Đơn hàng ({orders.length})</b>
          {orders.map((o) => (
            <div key={o.id} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span>#{o.id} {o.createdBy === 'ai' && <span className="badge blue">AI</span>}</span><span>{money(orderTotal(o, state.products))}</span>
            </div>
          ))}
        </div>
      </aside>
      {orderOpen && <OrderModal customerId={customer.id} channelId={conv.channelId} campaignId={conv.campaignId} conversationId={conv.id} onClose={() => setOrderOpen(false)} onSaved={(id) => { setOrderOpen(false); toast(`Đã tạo đơn #${id}`); }} />}
    </>
  );
}
