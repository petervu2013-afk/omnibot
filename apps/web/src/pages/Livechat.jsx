// Livechat: one inbox for every connected channel, live over /live. Conversations and messages come from the API,
// filtered by the member's data scope (a Sale sees only what the shop setting allows).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bot, Inbox, ListFilter, MessageCircle, Phone, Search, Send, Settings, Tag, UserCog, UserRound, WifiOff } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, PlatformIcon, Switch, useToast } from '../components/ui.jsx';
import { useLive } from '../live.js';
import { PLATFORM_KEY, PLATFORM_LABEL } from '../platforms.js';
import { navigate } from '../router.js';
import { timeAgo } from '../store.jsx';
import { STAGES } from './pos/Customers.jsx';

const VIEWS = [
  ['all', 'Tất cả hội thoại', Inbox],
  ['unread', 'Chưa đọc', MessageCircle],
  ['mine', 'Giao cho tôi', UserRound],
  ['handoff', 'Cần nhân viên', UserCog],
];
const SENDER_PREFIX = { AGENT: 'Bạn: ', AI: '✨ ', BOT: '🤖 ', SYSTEM: '' };
const time = (d) => new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const addMessage = (list, m) => (!list || list.some((x) => x.id === m.id) ? list : [...list, m]);

export default function Livechat() {
  const { shop } = useAuth();
  const qc = useQueryClient();
  const [toast, toastNode] = useToast();
  const [activeId, setActiveId] = useState(null);
  const [view, setView] = useState('all');
  const [channelId, setChannelId] = useState('');
  const [query, setQuery] = useState('');
  const [typing, setTyping] = useState({});
  const typingTimers = useRef({});
  const base = `/shops/${shop.id}`;

  const channels = useQuery({ queryKey: ['channels', shop.id], queryFn: () => api(`${base}/channels`) });
  const list = useInfiniteQuery({
    queryKey: ['conversations', shop.id, view, channelId],
    initialPageParam: null,
    queryFn: ({ pageParam }) => api(`${base}/conversations?${new URLSearchParams({ filter: view, limit: '30', ...(channelId ? { channelId } : {}), ...(pageParam ? { cursor: pageParam } : {}) })}`),
    getNextPageParam: (last) => last.nextCursor,
  });
  const refreshList = () => qc.invalidateQueries({ queryKey: ['conversations', shop.id] });

  const live = useLive(shop.id, {
    message: ({ conversationId, message }) => {
      qc.setQueryData(['messages', conversationId], (old) => addMessage(old, message));
      setTyping((t) => ({ ...t, [conversationId]: false }));
      refreshList();
    },
    conversation: ({ conversationId }) => {
      refreshList();
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
    typing: ({ conversationId }) => {
      setTyping((t) => ({ ...t, [conversationId]: true }));
      clearTimeout(typingTimers.current[conversationId]);
      typingTimers.current[conversationId] = setTimeout(() => setTyping((t) => ({ ...t, [conversationId]: false })), 4000);
    },
  });
  useEffect(() => () => Object.values(typingTimers.current).forEach(clearTimeout), []);

  const rows = useMemo(() => {
    const all = list.data?.pages.flatMap((p) => p.items) ?? [];
    const q = query.trim().toLowerCase();
    return q ? all.filter((c) => c.customer?.name.toLowerCase().includes(q) || c.customer?.phone?.includes(q)) : all;
  }, [list.data, query]);
  const noChannels = channels.isSuccess && channels.data.length === 0;

  return (
    <div className={`livechat ${activeId ? 'has-active' : ''}`}>
      <div className="lc-rail">
        {VIEWS.map(([key, label, Icon]) => (
          <button key={key} className={`icon-btn ${view === key ? 'active' : ''}`} title={label} aria-label={label} aria-pressed={view === key} onClick={() => setView(key)}><Icon size={18} /></button>
        ))}
      </div>

      <div className="lc-list">
        <div className="lc-list-head">
          {live.state !== 'online' && (
            <div className="ai-banner off" role="status">
              <WifiOff size={15} />
              <span className="grow">{live.state === 'connecting' ? 'Đang kết nối realtime…' : live.state === 'denied' ? 'Bạn không còn quyền nhận tin realtime ở cửa hàng này.' : 'Mất kết nối realtime, đang thử lại…'}</span>
            </div>
          )}
          <div className="search"><Search size={14} /><input className="input" placeholder="Tìm tên, SĐT khách…" aria-label="Tìm hội thoại" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <div className="row">
            <ListFilter size={14} className="muted" />
            <select className="select" aria-label="Lọc kênh" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">Tất cả kênh</option>
              {channels.data?.map((c) => <option key={c.id} value={c.id}>{c.name} ({PLATFORM_LABEL[c.platform]})</option>)}
            </select>
          </div>
          <div className="muted small">{VIEWS.find(([k]) => k === view)[1]} · {rows.length}{list.hasNextPage ? '+' : ''} hội thoại</div>
        </div>
        <div className="lc-items" data-testid="conversation-list">
          {list.isError && <div className="field-error small" style={{ padding: 12 }}>{list.error.message}</div>}
          {list.isPending && <div className="muted small" style={{ padding: 12 }}>Đang tải…</div>}
          {list.isSuccess && rows.length === 0 && (
            <div className="empty small">
              {noChannels ? <>Chưa kết nối kênh nào.<br /><button className="btn sm" style={{ marginTop: 8 }} onClick={() => navigate('settings/channels')}><Settings size={13} /> Kết nối kênh</button></> : 'Không có hội thoại'}
            </div>
          )}
          {rows.map((c) => {
            const name = c.customer?.name ?? 'Khách';
            const key = PLATFORM_KEY[c.channel?.platform];
            return (
              <div key={c.id} role="button" tabIndex={0} className={`lc-item ${c.id === activeId ? 'active' : ''} ${c.unreadCount ? 'unread' : ''}`} onClick={() => setActiveId(c.id)} onKeyDown={(e) => e.key === 'Enter' && setActiveId(c.id)}>
                <Avatar name={name} />
                {key && <span className="platform-dot" style={{ background: '#fff' }}><PlatformIcon platform={key} size={10} /></span>}
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row between"><b style={{ fontSize: 13.5 }}>{name}</b><span className="muted small">{c.lastMessage ? timeAgo(new Date(c.lastMessage.createdAt).getTime()) : ''}</span></div>
                  <div className="row between" style={{ gap: 6 }}>
                    <div className="preview">{typing[c.id] ? <i>Khách đang nhập…</i> : <>{SENDER_PREFIX[c.lastMessage?.sender] ?? ''}{c.lastMessage?.text}</>}</div>
                    {c.unreadCount > 0 && <span className="unread-count">{c.unreadCount}</span>}
                  </div>
                  <div className="row small" style={{ marginTop: 3, gap: 6 }}>
                    {c.handoff && !c.botActive && <span className="badge orange">Cần nhân viên</span>}
                    {c.botActive && <span className="badge blue">Bot</span>}
                    {c.assigneeName && <span className="badge" title="Nhân viên phụ trách">{c.assigneeName}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {list.hasNextPage && <button className="btn sm" style={{ margin: 12 }} disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>Tải thêm</button>}
        </div>
      </div>

      {activeId ? (
        <Thread key={activeId} id={activeId} typing={!!typing[activeId]} onTyping={() => live.emitTyping(activeId)} onBack={() => setActiveId(null)} toast={toast} refreshList={refreshList} />
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

function Thread({ id, typing, onTyping, onBack, toast, refreshList }) {
  const { shop, can } = useAuth();
  const qc = useQueryClient();
  const base = `/shops/${shop.id}/conversations/${id}`;
  const [text, setText] = useState('');
  const [older, setOlder] = useState({ loading: false, done: false });
  const lastTyping = useRef(0);
  const bodyRef = useRef(null);

  const conv = useQuery({ queryKey: ['conversation', id], queryFn: () => api(base) });
  const messages = useQuery({ queryKey: ['messages', id], queryFn: () => api(`${base}/messages?limit=50`), staleTime: Infinity });
  const assignable = can('lead.assign') && can('staff.view');
  const members = useQuery({ queryKey: ['members', shop.id], queryFn: () => api(`/shops/${shop.id}/members`), enabled: assignable });
  const count = messages.data?.length ?? 0;

  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight); }, [count, typing]);
  // Opening the conversation (or a new customer message while it is open) marks it read.
  const unread = conv.data?.unreadCount ?? 0;
  useEffect(() => {
    if (unread > 0 && document.visibilityState === 'visible') api(`${base}/read`, { method: 'POST' }).then(refreshList).catch(() => {});
  }, [unread, count, base]); // eslint-disable-line react-hooks/exhaustive-deps

  const onError = (err) => { toast(err.message); qc.invalidateQueries({ queryKey: ['conversation', id] }); };
  const send = useMutation({
    mutationFn: (body) => api(`${base}/messages`, { method: 'POST', body }),
    onSuccess: (m) => { qc.setQueryData(['messages', id], (old) => addMessage(old, m)); qc.invalidateQueries({ queryKey: ['conversation', id] }); refreshList(); },
    onError: (err, body) => { setText((t) => t || body.text); toast(err.message); },
  });
  const patch = useMutation({ mutationFn: (body) => api(base, { method: 'PATCH', body }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['conversation', id] }); refreshList(); }, onError });
  const assign = useMutation({ mutationFn: (assigneeId) => api(`${base}/assign`, { method: 'POST', body: { assigneeId } }), onSuccess: () => { toast('Đã giao hội thoại'); qc.invalidateQueries({ queryKey: ['conversation', id] }); refreshList(); }, onError });

  const loadOlder = async () => {
    const first = messages.data?.[0];
    if (!first) return;
    setOlder({ loading: true, done: false });
    try {
      const page = await api(`${base}/messages?limit=50&before=${first.id}`);
      qc.setQueryData(['messages', id], (old) => [...page.filter((m) => !old.some((x) => x.id === m.id)), ...old]);
      setOlder({ loading: false, done: page.length < 50 });
    } catch (err) {
      setOlder({ loading: false, done: false });
      toast(err.message);
    }
  };

  const submit = () => {
    const v = text.trim();
    if (!v || send.isPending) return;
    setText('');
    send.mutate({ text: v });
  };
  const onChange = (e) => {
    setText(e.target.value);
    const now = Date.now();
    if (now - lastTyping.current > 2000) { lastTyping.current = now; onTyping(); }
  };

  if (conv.isError) {
    return <div className="lc-empty"><div className="field-error">{conv.error.message}</div><button className="btn sm" onClick={onBack}>Quay lại</button></div>;
  }
  const c = conv.data;
  const customer = c?.customer;
  const closed = c?.status === 'closed';
  const disconnected = channelsDisconnected(qc, shop.id, c?.channelId);

  return (
    <>
      <div className="lc-thread">
        <div className="lc-thread-head">
          <button className="icon-btn" onClick={onBack} title="Quay lại" aria-label="Quay lại"><ArrowLeft size={18} /></button>
          <Avatar name={customer?.name ?? '?'} size="sm" />
          <div className="grow" style={{ minWidth: 0 }}>
            <b data-testid="thread-name">{customer?.name ?? '…'}</b>
            <div className="muted small row" style={{ gap: 4 }}>
              {c?.channel && <PlatformIcon platform={PLATFORM_KEY[c.channel.platform]} size={12} />} {c?.channel?.name}
            </div>
          </div>
          {c && <div className="row small" title="Bot tự động trả lời (kịch bản/AI có ở Bước 6)"><Switch on={c.botActive} onChange={(on) => patch.mutate({ botActive: on })} /> <Bot size={14} /> Bot</div>}
          {c && <button className="btn sm" onClick={() => patch.mutate({ status: closed ? 'open' : 'closed' })}>{closed ? 'Mở lại' : 'Đóng hội thoại'}</button>}
        </div>
        {c?.handoff && !c.botActive && <div className="ai-banner off" style={{ borderRadius: 0 }}><UserCog size={15} /> Bot đã chuyển cho nhân viên: {c.handoffReason || 'cần hỗ trợ'}</div>}
        <div className="lc-messages" ref={bodyRef} data-testid="messages">
          {count >= 50 && !older.done && <button className="btn sm" style={{ alignSelf: 'center' }} disabled={older.loading} onClick={loadOlder}>Tải tin cũ hơn</button>}
          {messages.isPending && <div className="muted small">Đang tải…</div>}
          {messages.data?.map((m) => (
            <div key={m.id} className={`msg ${m.sender === 'CUSTOMER' ? 'in' : 'out'} ${m.sender === 'BOT' ? 'bot' : ''} ${m.sender === 'AI' ? 'ai' : ''}`}>
              <div className="bubble">
                {m.text}
                {Array.isArray(m.attachments) && m.attachments.map((a) => <div key={a.url}><a href={a.url} target="_blank" rel="noopener noreferrer nofollow">[{a.type}]</a></div>)}
              </div>
              <span className="meta">{m.sender === 'AGENT' ? 'Nhân viên · ' : m.sender === 'BOT' ? 'Kịch bản · ' : m.sender === 'AI' ? 'AI · ' : ''}{time(m.createdAt)}</span>
            </div>
          ))}
          {typing && <div className="typing">Khách đang nhập <i /><i /><i /></div>}
        </div>
        <div className="lc-composer">
          {disconnected && <div className="roleplay">Kênh này đã ngắt kết nối — không gửi được tin.</div>}
          <textarea
            value={text}
            onChange={onChange}
            aria-label="Nội dung tin nhắn"
            maxLength={2000}
            placeholder="Nhập tin nhắn… (Enter để gửi, Shift+Enter xuống dòng)"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          />
          <div className="row">
            <div className="grow" />
            <button className="btn primary" onClick={submit} disabled={!text.trim() || send.isPending || disconnected}><Send size={15} /> Gửi</button>
          </div>
        </div>
      </div>

      <aside className="lc-info">
        {customer && (
          <>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Avatar name={customer.name} size="lg" />
              <h3>{customer.name}</h3>
              <span className="badge">{STAGES[customer.stage] ?? customer.stage}</span>
              {customer.tags?.length > 0 && <div className="chips" style={{ justifyContent: 'center' }}>{customer.tags.map((t) => <span className="tag" key={t}><Tag size={10} /> {t}</span>)}</div>}
            </div>
            <div className="row small" style={{ gap: 6 }}><Phone size={14} /> {customer.phone || <span className="muted">Chưa có SĐT</span>}</div>
            <button className="btn sm" onClick={() => navigate('orders/customers')}><UserRound size={13} /> Xem danh sách khách hàng</button>
          </>
        )}
        {c && (
          <label className="field"><span>Nhân viên phụ trách</span>
            {assignable ? (
              <select className="select" aria-label="Giao cho nhân viên" value={c.assigneeId ?? ''} disabled={assign.isPending} onChange={(e) => assign.mutate(e.target.value || null)}>
                <option value="">— Chưa giao —</option>
                {members.data?.filter((m) => m.status === 'ACTIVE').map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
              </select>
            ) : <span className="muted small">{c.assigneeName ?? 'Chưa giao'}</span>}
          </label>
        )}
      </aside>
    </>
  );
}

function channelsDisconnected(qc, shopId, channelId) {
  const channel = qc.getQueryData(['channels', shopId])?.find((ch) => ch.id === channelId);
  return channel?.status === 'DISCONNECTED';
}
