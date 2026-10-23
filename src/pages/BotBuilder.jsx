import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Sparkles, ListTree, Package } from 'lucide-react';
import { useStore, uid } from '../store.jsx';
import { navigate } from '../router.js';
import { aiHealth } from '../ai.js';
import { ChipsInput, PlatformBadge, Switch } from '../components/ui.jsx';
import BotTester from '../components/BotTester.jsx';

export default function BotBuilder({ channelId }) {
  const { state, update } = useStore();
  const [health, setHealth] = useState(null);
  useEffect(() => { aiHealth(true).then(setHealth); }, []);

  const channel = state.channels.find((c) => c.id === channelId);
  if (!channel) {
    return <div className="page"><div className="card empty">Không tìm thấy kênh. <a href="#/dashboard">Quay lại</a></div></div>;
  }
  const bot = channel.bot;
  const ai = state.ai;
  const setBot = (fn) => update((d) => fn(d.channels.find((c) => c.id === channelId).bot));
  const setAi = (fn) => update((d) => fn(d.ai));

  return (
    <div className="page">
      <div className="row wrap" style={{ marginBottom: 18 }}>
        <button className="btn ghost" onClick={() => navigate('dashboard')}><ArrowLeft size={16} /></button>
        <h2>Cấu hình chatbot</h2>
        <span className="muted">· {channel.name}</span>
        <PlatformBadge platform={channel.platform} />
        <div className="grow" />
        <div className="row small"><Switch on={bot.enabled} onChange={(v) => setBot((b) => { b.enabled = v; })} /> Bật tự động trả lời</div>
      </div>

      <div className="builder">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="mode-pick">
            <button className={bot.mode === 'ai' ? 'on' : ''} onClick={() => setBot((b) => { b.mode = 'ai'; })}>
              <b className="row" style={{ gap: 6 }}><Sparkles size={16} color="var(--primary)" /> AI tự động hoàn toàn</b>
              <span className="muted small">AI đọc danh mục sản phẩm, tư vấn, xin SĐT, chốt đơn và chỉ chuyển nhân viên khi cần.</span>
            </button>
            <button className={bot.mode !== 'ai' ? 'on' : ''} onClick={() => setBot((b) => { b.mode = 'rules'; })}>
              <b className="row" style={{ gap: 6 }}><ListTree size={16} color="var(--primary)" /> Kịch bản từ khóa</b>
              <span className="muted small">Trả lời cố định theo từ khóa bạn cài đặt.</span>
            </button>
          </div>

          {bot.mode === 'ai' ? (
            <>
              {health && (
                <div className={`ai-banner ${health.ai ? 'on' : 'off'}`}>
                  <Sparkles size={15} />
                  {health.ai
                    ? <span>Đang dùng <b>{health.model}</b> qua server AI.</span>
                    : <span>Chưa kết nối Claude ({health.ok ? 'thiếu ANTHROPIC_API_KEY' : 'chưa chạy npm run server'}). Đang dùng <b>AI nội bộ</b>: khớp danh mục theo từ khóa, vẫn tự thu SĐT và chốt đơn.</span>}
                </div>
              )}
              <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="row between">
                  <h3>Dữ liệu AI sử dụng</h3>
                  <button className="btn sm" onClick={() => navigate('orders')}><Package size={14} /> Danh mục ({state.products.length})</button>
                </div>
                <div className="muted small">AI tự đọc toàn bộ danh mục sản phẩm (tên, giá, tồn kho, mô tả) mỗi lần trả lời. Bổ sung kiến thức shop bên dưới: giao hàng, bảo hành, thanh toán, khuyến mãi...</div>
                <label className="field">Kiến thức shop
                  <textarea className="textarea" style={{ minHeight: 150 }} value={ai.knowledge} onChange={(e) => setAi((a) => { a.knowledge = e.target.value; })} />
                </label>
              </div>
              <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h3>Cách AI trò chuyện</h3>
                <div className="form-grid">
                  <label className="field">AI xưng là
                    <select className="select" value={ai.persona} onChange={(e) => setAi((a) => { a.persona = e.target.value; })}>
                      <option value="em">em</option><option value="mình">mình</option><option value="shop">shop</option>
                    </select>
                  </label>
                  <label className="field">Mức suy nghĩ (Claude effort)
                    <select className="select" value={ai.effort} onChange={(e) => setAi((a) => { a.effort = e.target.value; })}>
                      <option value="low">Nhanh – phù hợp chat</option><option value="medium">Cân bằng</option><option value="high">Kỹ – chậm hơn, tốn hơn</option>
                    </select>
                  </label>
                </div>
                <label className="field">Giọng điệu<input className="input" value={ai.tone} onChange={(e) => setAi((a) => { a.tone = e.target.value; })} /></label>
                <div className="row small"><Switch on={ai.autoOrder} onChange={(v) => setAi((a) => { a.autoOrder = v; })} /> Cho phép AI tự tạo đơn khi khách đã xác nhận + có SĐT, địa chỉ</div>
                <div className="row small"><Switch on={ai.handoffOnComplaint} onChange={(v) => setAi((a) => { a.handoffOnComplaint = v; })} /> Chuyển nhân viên khi khách phàn nàn hoặc hỏi ngoài dữ liệu</div>
                <div className="muted small">Cài đặt AI áp dụng cho mọi kênh đang bật chế độ AI.</div>
              </div>
            </>
          ) : (
            <>
              <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h3>Lời chào</h3>
                <textarea className="textarea" value={bot.welcome} onChange={(e) => setBot((b) => { b.welcome = e.target.value; })} />
                <div className="muted small">Nút trả lời nhanh</div>
                <ChipsInput values={bot.quickReplies} onChange={(v) => setBot((b) => { b.quickReplies = v; })} />
              </div>
              <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="row between">
                  <h3>Kịch bản theo từ khóa</h3>
                  <button className="btn primary sm" onClick={() => setBot((b) => { b.rules.push({ id: uid(), keywords: [], reply: '', buttons: [] }); })}>
                    <Plus size={14} /> Thêm kịch bản
                  </button>
                </div>
                {bot.rules.length === 0 && <div className="empty">Chưa có kịch bản nào.</div>}
                {bot.rules.map((r, i) => (
                  <div className="rule" key={r.id}>
                    <div className="row between">
                      <b className="small">Kịch bản #{i + 1}</b>
                      <button className="icon-btn" onClick={() => setBot((b) => { b.rules = b.rules.filter((x) => x.id !== r.id); })}><Trash2 size={15} color="var(--red)" /></button>
                    </div>
                    <div className="muted small">Khi tin nhắn chứa từ khóa</div>
                    <ChipsInput values={r.keywords} placeholder="Từ khóa + Enter" onChange={(v) => setBot((b) => { b.rules.find((x) => x.id === r.id).keywords = v; })} />
                    <div className="muted small">Bot trả lời</div>
                    <textarea className="textarea" style={{ minHeight: 60 }} value={r.reply} onChange={(e) => setBot((b) => { b.rules.find((x) => x.id === r.id).reply = e.target.value; })} />
                    <div className="muted small">Nút gợi ý</div>
                    <ChipsInput values={r.buttons} placeholder="Nút + Enter" onChange={(v) => setBot((b) => { b.rules.find((x) => x.id === r.id).buttons = v; })} />
                  </div>
                ))}
              </div>
              <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h3>Khi không hiểu câu hỏi</h3>
                <textarea className="textarea" style={{ minHeight: 60 }} value={bot.fallback} onChange={(e) => setBot((b) => { b.fallback = e.target.value; })} />
                <div className="row small"><Switch on={bot.askPhone} onChange={(v) => setBot((b) => { b.askPhone = v; })} /> Tự nhận diện số điện thoại và lưu vào hồ sơ khách</div>
              </div>
            </>
          )}
        </div>

        <BotTester bot={bot} title={channel.name} channelId={channel.id} />
      </div>
    </div>
  );
}
