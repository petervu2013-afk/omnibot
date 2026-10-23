import { useMemo, useState } from 'react';
import { Plus, RefreshCw, Unplug, Sparkles, Search, Megaphone, Layers, Image } from 'lucide-react';
import { useStore, uid, money, compact, AD_PLATFORMS, PLATFORMS } from '../store.jsx';
import { campaignStats, lastDays, div } from '../analytics.js';
import { DataTable, FormModal, Status, fmtDate } from './kit.jsx';
import { Switch, Modal, PlatformIcon, useToast } from './ui.jsx';

const pct = (v) => `${(v * 100).toFixed(1)}%`;

// ---------- Tài khoản ----------
export function AdAccounts() {
  const { state, update } = useStore();
  const [adding, setAdding] = useState(false);
  const [toast, toastNode] = useToast();
  const rows = state.adAccounts.map((a, i) => {
    const camps = state.campaigns.filter((c) => c.adAccountId === a.id);
    return { ...a, stt: i + 1, camps: camps.length, adsets: camps.length * 2, ads: camps.length * 4 };
  });
  return (
    <>
      <p className="muted small" style={{ marginTop: -8 }}>Kết nối tài khoản quảng cáo để đo hiệu quả từng chiến dịch tới tận hội thoại, SĐT và đơn hàng.</p>
      <DataTable
        rows={rows}
        search={(r) => `${r.name} ${r.accountId}`}
        exportName="tai-khoan-quang-cao"
        actions={<button className="btn primary" onClick={() => setAdding(true)}><Plus size={15} /> Thêm tài khoản</button>}
        columns={[
          { key: 'stt', label: 'STT' },
          { key: 'name', label: 'Tên tài khoản', render: (r) => <div><b>{r.name}</b><div className="muted small row" style={{ gap: 4 }}><span style={{ color: AD_PLATFORMS[r.platform].color }}>{AD_PLATFORMS[r.platform].label}</span> · ID {r.accountId}</div></div>, csv: (r) => r.name },
          { key: 'pages', label: 'Kênh quảng cáo', render: (r) => r.channelIds.map((id) => state.channels.find((c) => c.id === id)).filter(Boolean).map((c) => <div key={c.id} className="row small" style={{ gap: 4 }}><PlatformIcon platform={c.platform} /> {c.name}</div>), csv: (r) => r.channelIds.join(' ') },
          { key: 'camps', label: 'Chiến dịch', align: 'right' },
          { key: 'adsets', label: 'Nhóm quảng cáo', align: 'right' },
          { key: 'ads', label: 'Quảng cáo', align: 'right' },
          { key: 'status', label: 'Trạng thái', render: (r) => r.status === 'connected' ? <Status tone="green">Đã kết nối (demo)</Status> : <Status tone="red">Ngắt kết nối</Status>, csv: (r) => r.status },
          { key: 'lastSync', label: 'Cập nhật lần cuối', render: (r) => fmtDate(r.lastSync), csv: (r) => fmtDate(r.lastSync) },
          { key: 'act', label: 'Hành động', render: (r) => (
            <div className="row" style={{ gap: 4 }}>
              <button className="icon-btn" title="Đồng bộ" onClick={() => { update((d) => { const a = d.adAccounts.find((x) => x.id === r.id); a.lastSync = Date.now(); a.status = 'connected'; }); toast('Đã đồng bộ (demo)'); }}><RefreshCw size={15} /></button>
              <button className="icon-btn" title="Ngắt kết nối" onClick={() => confirm(`Ngắt kết nối ${r.name}?`) && update((d) => { d.adAccounts.find((x) => x.id === r.id).status = 'disconnected'; })}><Unplug size={15} color="var(--red)" /></button>
            </div>
          ) },
        ]}
      />
      {adding && (
        <FormModal
          title="Thêm tài khoản quảng cáo"
          onClose={() => setAdding(false)}
          fields={[
            { key: 'platform', label: 'Nền tảng', type: 'select', options: Object.entries(AD_PLATFORMS).map(([k, p]) => [k, p.label]) },
            { key: 'name', label: 'Tên tài khoản', required: true },
            { key: 'accountId', label: 'ID tài khoản (act_..., 123-456-7890...)', required: true },
            { key: 'channelId', label: 'Kênh nhận khách', type: 'select', options: state.channels.map((c) => [c.id, `${c.name} (${PLATFORMS[c.platform].label})`]) },
          ]}
          onSave={(v) => {
            update((d) => { d.adAccounts.push({ id: uid(), platform: v.platform, name: v.name, accountId: v.accountId, channelIds: [v.channelId], status: 'connected', lastSync: Date.now() }); });
            setAdding(false);
            toast('Đã thêm tài khoản. Khi có backend, bước này sẽ mở đăng nhập Facebook/Google/TikTok (OAuth).');
          }}
        />
      )}
      {toastNode}
    </>
  );
}

// ---------- Chiến dịch ----------
const LEVELS = [
  { key: 'campaign', label: 'Chiến dịch', icon: Megaphone },
  { key: 'adset', label: 'Nhóm quảng cáo', icon: Layers },
  { key: 'ad', label: 'Quảng cáo', icon: Image },
];
const ADSET_SPLIT = [['Tệp chính', 0.6], ['Lookalike 1% khách đã mua', 0.4]];
const AD_SPLIT = [['Video 15s', 0.55], ['Ảnh carousel', 0.45]];
const METRIC_KEYS = ['reach', 'impressions', 'clicks', 'platformConversions', 'spend', 'conversations', 'leads', 'orders', 'revenue'];
const scale = (r, f) => Object.fromEntries(METRIC_KEYS.map((k) => [k, Math.round((r[k] || 0) * f)]));
const derive = (m) => ({ ...m, cpa: div(m.spend, m.platformConversions), leadRate: div(m.leads, m.conversations), sr: div(m.orders, m.leads), roas: div(m.revenue, m.spend), cpl: div(m.spend, m.leads), cpo: div(m.spend, m.orders) });

export function CampaignManager() {
  const { state, update } = useStore();
  const [level, setLevel] = useState('campaign');
  const [account, setAccount] = useState('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [days, setDays] = useState(14);
  const [creating, setCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const toggles = state.adToggles || {};

  const rows = useMemo(() => {
    const base = campaignStats(state, lastDays(days)).filter((c) => (account === 'all' || c.adAccountId === account));
    const list = [];
    base.forEach((c) => {
      const on = c.status === 'active';
      if (level === 'campaign') list.push({ id: c.id, name: c.name, parent: AD_PLATFORMS[c.platform].label, on, kind: 'campaign', ...derive(scale(c, 1)) });
      ADSET_SPLIT.forEach(([n, f], i) => {
        const asId = `${c.id}_as${i}`;
        const asOn = on && toggles[asId] !== false;
        if (level === 'adset') list.push({ id: asId, name: `${n}`, parent: c.name, on: asOn, kind: 'adset', ...derive(scale(c, f)) });
        if (level === 'ad') AD_SPLIT.forEach(([an, af], j) => {
          const adId = `${asId}_ad${j}`;
          list.push({ id: adId, name: an, parent: `${c.name} › ${n}`, on: asOn && toggles[adId] !== false, kind: 'ad', ...derive(scale(c, f * af)) });
        });
      });
    });
    return list.filter((r) => (status === 'all' || (status === 'on') === r.on) && `${r.name} ${r.parent} ${r.id}`.toLowerCase().includes(q.toLowerCase()));
  }, [state, level, account, status, q, days, toggles]);

  const toggle = (r, v) => update((d) => {
    if (r.kind === 'campaign') d.campaigns.find((c) => c.id === r.id).status = v ? 'active' : 'paused';
    else { d.adToggles = d.adToggles || {}; d.adToggles[r.id] = v; }
  });
  const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const t = derive(Object.fromEntries(METRIC_KEYS.map((k) => [k, sum(k)])));

  const cols = [
    { key: 'on', label: 'Tắt/bật', render: (r) => <Switch on={r.on} onChange={(v) => toggle(r, v)} />, csv: (r) => (r.on ? 'Bật' : 'Tắt') },
    { key: 'name', label: LEVELS.find((l) => l.key === level).label, render: (r) => <div style={{ minWidth: 200 }}><b>{r.name}</b><div className="muted small">{r.parent} · {r.id}</div></div>, csv: (r) => r.name },
    { key: 'st', label: 'Trạng thái', render: (r) => r.on ? <Status tone="green">Đang chạy</Status> : <Status>Tạm dừng</Status>, csv: (r) => (r.on ? 'Đang chạy' : 'Tạm dừng') },
    { key: 'reach', label: 'Tiếp cận', align: 'right', render: (r) => compact(r.reach) },
    { key: 'impressions', label: 'Hiển thị', align: 'right', render: (r) => compact(r.impressions) },
    { key: 'clicks', label: 'Bấm', align: 'right' },
    { key: 'platformConversions', label: 'Kết quả', align: 'right' },
    { key: 'spend', label: 'Chi phí', align: 'right', render: (r) => money(r.spend) },
    { key: 'cpa', label: 'CPA', align: 'right', render: (r) => money(r.cpa) },
    { key: 'conversations', label: 'Hội thoại', align: 'right' },
    { key: 'leads', label: 'SĐT', align: 'right' },
    { key: 'leadRate', label: '%SĐT', align: 'right', render: (r) => pct(r.leadRate) },
    { key: 'orders', label: 'Đơn hàng', align: 'right' },
    { key: 'sr', label: 'SR', align: 'right', render: (r) => pct(r.sr) },
    { key: 'revenue', label: 'Doanh số', align: 'right', render: (r) => money(r.revenue) },
    { key: 'roas', label: 'ROAS', align: 'right', render: (r) => <span className={r.roas >= state.kpiTargets.roas ? 'metric-good' : r.roas ? 'metric-bad' : ''}>{r.roas.toFixed(2)}</span> },
    { key: 'cpl', label: 'CPL', align: 'right', render: (r) => money(r.cpl) },
    { key: 'cpo', label: 'CPO', align: 'right', render: (r) => money(r.cpo) },
  ];

  return (
    <>
      <div className="card card-pad row wrap" style={{ marginBottom: 12, gap: 8 }}>
        <select className="select" style={{ width: 220 }} value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="all">Tất cả tài khoản quảng cáo</option>
          {state.adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div className="search" style={{ width: 220 }}><Search size={14} /><input className="input" placeholder="Tìm ID, tên chiến dịch" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Mọi trạng thái</option><option value="on">Đang chạy</option><option value="off">Tạm dừng</option></select>
        <select className="select" style={{ width: 120 }} value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 ngày</option><option value={14}>14 ngày</option><option value={28}>28 ngày</option></select>
        <div className="grow" />
        <button className="btn green" onClick={() => setCreating(true)}><Plus size={15} /> Tạo chiến dịch</button>
        <button className="btn" style={{ background: '#7c3aed', color: '#fff', borderColor: '#7c3aed' }} onClick={() => setAiOpen(true)}><Sparkles size={15} /> Tạo chiến dịch AI</button>
      </div>
      <div className="row between wrap" style={{ marginBottom: 10 }}>
        <div className="pill-tabs">{LEVELS.map(({ key, label, icon: Icon }) => <button key={key} className={level === key ? 'active' : ''} onClick={() => setLevel(key)}><Icon size={14} /> {label}</button>)}</div>
        <span className="muted small">Dữ liệu quảng cáo đồng bộ 1:00 sáng hằng ngày; hội thoại, SĐT, đơn lấy realtime từ hệ thống.</span>
      </div>
      <DataTable
        rows={rows}
        columns={cols}
        exportName={`quang-cao-${level}`}
        footer={() => (
          <tr>
            <td /><td>Tổng {LEVELS.find((l) => l.key === level).label.toLowerCase()} ({rows.length})</td><td />
            <td style={{ textAlign: 'right' }}>{compact(t.reach)}</td><td style={{ textAlign: 'right' }}>{compact(t.impressions)}</td><td style={{ textAlign: 'right' }}>{t.clicks}</td><td style={{ textAlign: 'right' }}>{t.platformConversions}</td>
            <td style={{ textAlign: 'right' }}>{money(t.spend)}</td><td style={{ textAlign: 'right' }}>{money(t.cpa)}</td><td style={{ textAlign: 'right' }}>{t.conversations}</td><td style={{ textAlign: 'right' }}>{t.leads}</td>
            <td style={{ textAlign: 'right' }}>{pct(t.leadRate)}</td><td style={{ textAlign: 'right' }}>{t.orders}</td><td style={{ textAlign: 'right' }}>{pct(t.sr)}</td><td style={{ textAlign: 'right' }}>{money(t.revenue)}</td>
            <td style={{ textAlign: 'right' }}>{t.roas.toFixed(2)}</td><td style={{ textAlign: 'right' }}>{money(t.cpl)}</td><td style={{ textAlign: 'right' }}>{money(t.cpo)}</td>
          </tr>
        )}
      />
      <div className="muted small" style={{ marginTop: 8 }}>CPA = chi phí ÷ kết quả nền tảng báo · %SĐT = SĐT ÷ hội thoại · SR = đơn ÷ SĐT · CPL = chi phí ÷ SĐT · CPO = chi phí ÷ đơn. Nhóm quảng cáo / quảng cáo ở bản demo được chia tỉ lệ từ chiến dịch.</div>
      {creating && <CampaignForm onClose={() => setCreating(false)} />}
      {aiOpen && <AiCampaign onClose={() => setAiOpen(false)} />}
    </>
  );
}

function CampaignForm({ onClose, initial = {} }) {
  const { state, update } = useStore();
  return (
    <FormModal
      title="Tạo chiến dịch"
      wide
      initial={initial}
      onClose={onClose}
      fields={[
        { key: 'name', label: 'Tên chiến dịch', required: true, full: true },
        { key: 'adAccountId', label: 'Tài khoản quảng cáo', type: 'select', options: state.adAccounts.map((a) => [a.id, a.name]) },
        { key: 'channelId', label: 'Kênh nhận tin nhắn', type: 'select', options: state.channels.map((c) => [c.id, c.name]) },
        { key: 'objective', label: 'Mục tiêu', type: 'select', options: [['messages', 'Tin nhắn'], ['leads', 'Thu SĐT (lead form)'], ['conversions', 'Chuyển đổi / mua hàng'], ['traffic', 'Lượt truy cập']] },
        { key: 'budget', label: 'Ngân sách / ngày (đ)', type: 'number', required: true },
        { key: 'placement', label: 'Vị trí hiển thị', placeholder: 'Facebook + Instagram Feed → Messenger' },
        { key: 'audience', label: 'Tệp nhắm', placeholder: 'Nữ 25-45, HCM, quan tâm nội thất' },
        { key: 'productId', label: 'Sản phẩm quảng cáo', type: 'select', options: state.products.map((p) => [p.id, p.name]) },
        { key: 'copy', label: 'Nội dung quảng cáo', type: 'textarea' },
      ]}
      onSave={(v) => {
        const acc = state.adAccounts.find((a) => a.id === v.adAccountId);
        const p = state.products.find((x) => x.id === v.productId);
        update((d) => { d.campaigns.push({ id: uid(), adAccountId: v.adAccountId, platform: acc?.platform || 'facebook', name: v.name, objective: v.objective, channelId: v.channelId, focus: p?.category || '', status: 'paused', budget: v.budget, productIds: p ? [p.id] : [], placement: v.placement, audience: v.audience, copy: v.copy }); });
        onClose();
      }}
    />
  );
}

// Draft a campaign from a product: name, audience, placement and 3 ad copy variants (local template; Claude when backend is live).
function AiCampaign({ onClose }) {
  const { state } = useStore();
  const [productId, setProductId] = useState(state.products[0]?.id);
  const [goal, setGoal] = useState('messages');
  const [budget, setBudget] = useState(150000);
  const [draft, setDraft] = useState(null);
  const p = state.products.find((x) => x.id === productId);
  const gen = () => {
    const price = p.price.toLocaleString('vi-VN');
    setDraft({
      name: `AI | ${goal === 'messages' ? 'Tin nhắn' : 'Chuyển đổi'} | ${p.name}`,
      adAccountId: state.adAccounts[0]?.id,
      channelId: state.channels[0]?.id,
      objective: goal,
      budget,
      productId: p.id,
      placement: 'Facebook + Instagram Feed, Reels → Messenger',
      audience: p.price > 8000000 ? '28-50, HCM/HN, mới mua nhà, thu nhập khá' : '22-45, toàn quốc, quan tâm nội thất & decor',
      copy: [
        `🔥 ${p.name} – chỉ ${price}đ. ${p.description} Inbox ngay để nhận báo giá & ưu đãi giao lắp miễn phí!`,
        `Nhà đẹp bắt đầu từ ${p.category.toLowerCase()} chuẩn gỗ thật. ${p.name}, bảo hành 5 năm. Nhắn tin để xem ảnh thực tế 📸`,
        `Còn ${p.stock} sản phẩm ${p.name} giá xưởng ${price}đ. Trả góp 0%. Bấm "Gửi tin nhắn" để giữ hàng!`,
      ].join('\n\n'),
    });
  };
  if (draft) return <CampaignForm initial={draft} onClose={onClose} />;
  return (
    <Modal title="Tạo chiến dịch bằng AI" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" onClick={gen}><Sparkles size={14} /> Tạo bản nháp</button></>}>
      <label className="field">Sản phẩm muốn quảng cáo<select className="select" value={productId} onChange={(e) => setProductId(e.target.value)}>{state.products.map((x) => <option key={x.id} value={x.id}>{x.name} – {money(x.price)}</option>)}</select></label>
      <label className="field">Mục tiêu<select className="select" value={goal} onChange={(e) => setGoal(e.target.value)}><option value="messages">Nhiều tin nhắn (AI chatbot chốt đơn)</option><option value="conversions">Mua hàng trên website</option></select></label>
      <label className="field">Ngân sách / ngày<input className="input" type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} /></label>
      <div className="muted small">AI đề xuất tên, tệp nhắm, vị trí và 3 mẫu nội dung từ dữ liệu sản phẩm. Bạn chỉnh lại trước khi lưu; chiến dịch lưu ở trạng thái tạm dừng cho tới khi bật.</div>
    </Modal>
  );
}
