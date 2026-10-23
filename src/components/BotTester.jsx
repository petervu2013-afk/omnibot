import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Send, Bot, Sparkles } from 'lucide-react';
import { botReply } from '../bot.js';
import { aiReply } from '../ai.js';
import { useStore } from '../store.jsx';
import { ProductCards, EngineTag } from './ui.jsx';

// Phone-like simulator for trying a bot config without a real channel.
export default function BotTester({ bot, title = 'Test bot', channelId }) {
  const { state } = useStore();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState(null);
  const bodyRef = useRef(null);
  const isAi = bot.mode === 'ai';

  const start = () => {
    setOrder(null);
    setMessages(bot.enabled && !isAi ? [{ from: 'bot', text: bot.welcome, buttons: bot.quickReplies }] : []);
  };
  useEffect(start, [bot.welcome, bot.enabled, bot.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight); }, [messages, busy]);

  const send = async (value) => {
    const v = (value ?? text).trim();
    if (!v || busy) return;
    setText('');
    const history = [...messages, { from: 'customer', text: v, at: Date.now() }];
    setMessages(history);
    if (!bot.enabled) return;
    if (!isAi) {
      const reply = botReply(bot, v);
      if (reply) setMessages([...history, { from: 'bot', ...reply }]);
      return;
    }
    setBusy(true);
    try {
      const conv = { channelId: channelId || state.channels[0]?.id, customerId: '__tester', messages: history };
      const { data, meta } = await aiReply({ state, conv });
      setMessages([...history, { from: 'ai', text: data.reply, productIds: data.product_ids, buttons: data.quick_replies, intent: data.intent, meta }]);
      if (data.order?.ready) setOrder(data.order);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="phone">
      <div className="phone-head">
        {isAi ? <Sparkles size={20} /> : <Bot size={20} />}
        <div className="grow"><b>{title}</b><div className="small" style={{ opacity: .8 }}>{!bot.enabled ? 'Bot đang tắt' : isAi ? 'AI tư vấn theo danh mục' : 'Kịch bản từ khóa'}</div></div>
        <button className="icon-btn" title="Bắt đầu lại" onClick={start}><RotateCcw size={16} /></button>
      </div>
      <div className="phone-body" ref={bodyRef}>
        {isAi && !messages.length && <div className="empty small">Nhắn thử như một khách hàng, ví dụ: "bàn ăn cho 6 người giá bao nhiêu", rồi "mình lấy 1 cái", gửi SĐT và địa chỉ.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.from === 'customer' ? 'out' : 'in'}`}>
            <div className="bubble">{m.text}</div>
            {m.productIds?.length > 0 && <ProductCards ids={m.productIds} products={state.products} />}
            {m.buttons?.length > 0 && (
              <div className="msg-buttons">{m.buttons.map((b) => <span key={b} onClick={() => send(b)}>{b}</span>)}</div>
            )}
            {m.meta && <span className="meta"><EngineTag meta={m.meta} /></span>}
          </div>
        ))}
        {busy && <div className="typing" style={{ alignSelf: 'flex-start' }}>AI đang soạn <i /><i /><i /></div>}
        {order && <div className="ai-banner on small">✅ AI sẽ tạo đơn: {order.items.map((i) => `${state.products.find((p) => p.id === i.product_id)?.name} x${i.qty}`).join(', ')}</div>}
        {!bot.enabled && <div className="empty small">Bot đang tắt – tin nhắn sẽ chuyển cho nhân viên.</div>}
      </div>
      <form className="phone-foot" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhập tin nhắn thử..." />
        <button className="btn primary" type="submit" disabled={busy}><Send size={15} /></button>
      </form>
    </div>
  );
}
