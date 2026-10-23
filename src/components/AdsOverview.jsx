import { useState } from 'react';
import { CheckCircle2, RefreshCw, Target, Info, Pencil } from 'lucide-react';
import { useStore, money, compact, AD_PLATFORMS, PLATFORMS } from '../store.jsx';
import { sumStats, kpiStatus, REACH_DEDUPE } from '../analytics.js';
import { PlatformIcon, Modal, useToast } from './ui.jsx';
import { fmtDur } from '../crm.js';

const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;

// Reach & efficiency KPIs: what each one means and how to read it.
const REACH_KPIS = [
  { key: 'reach', label: 'Tiếp cận', fmt: (v) => `${compact(v)} người`, help: 'Số người khác nhau đã thấy quảng cáo. Đo độ phủ thị trường mục tiêu.' },
  { key: 'impressions', label: 'Lượt hiển thị', fmt: compact, help: 'Tổng số lần quảng cáo hiển thị (1 người có thể thấy nhiều lần).' },
  { key: 'frequency', label: 'Tần suất', fmt: (v) => `${v.toFixed(2)} lần`, target: (k) => `≤ ${k.frequencyMax}`, help: 'Hiển thị ÷ tiếp cận. Quá cao (> 3) là tệp đã bão hòa, khách chán quảng cáo → đổi nội dung hoặc mở rộng tệp.' },
  { key: 'cpm', label: 'CPM', fmt: money, target: (k) => `≤ ${money(k.cpm)}`, help: 'Chi phí cho 1.000 lượt hiển thị. Đo giá thầu và mức cạnh tranh của tệp.' },
  { key: 'costPerReach', label: 'Chi phí / 1.000 người', fmt: money, help: 'Chi phí để tiếp cận 1.000 người khác nhau.' },
  { key: 'ctr', label: 'CTR', fmt: (v) => pct(v, 2), target: (k) => `≥ ${pct(k.ctr, 1)}`, help: 'Tỉ lệ click ÷ hiển thị. Đo độ hấp dẫn của nội dung quảng cáo.' },
  { key: 'costPerConv', label: 'Chi phí / hội thoại', fmt: money, target: (k) => `≤ ${money(k.costPerConv)}`, help: 'Chi phí để có 1 khách nhắn tin (hội thoại thật trong hệ thống).' },
  { key: 'costPerLead', label: 'Chi phí / SĐT', fmt: money, target: (k) => `≤ ${money(k.costPerLead)}`, help: 'Chi phí để có 1 khách để lại số điện thoại.' },
  { key: 'cpa', label: 'Chi phí / đơn', fmt: money, target: (k) => `≤ ${money(k.cpa)}`, help: 'Chi phí quảng cáo cho mỗi đơn hàng thật.' },
  { key: 'roas', label: 'ROAS', fmt: (v) => v.toFixed(2), target: (k) => `≥ ${k.roas}`, help: 'Doanh thu ÷ chi phí quảng cáo.' },
];

export default function AdsOverview({ rows, total }) {
  const { state, update } = useStore();
  const [editKpi, setEditKpi] = useState(false);
  const [toast, toastNode] = useToast();
  const kpi = state.kpiTargets;

  const channelRows = state.channels.map((ch) => ({ ch, ...sumStats(rows.filter((r) => r.channelId === ch.id)), campaigns: rows.filter((r) => r.channelId === ch.id) }))
    .filter((r) => r.campaigns.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="seg-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {state.adAccounts.map((acc) => {
          const accRows = rows.filter((r) => r.adAccountId === acc.id || (!r.adAccountId && r.platform === acc.platform));
          const t = sumStats(accRows);
          const active = accRows.filter((r) => r.status === 'active').length;
          return (
            <div className="card card-pad" key={acc.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: `3px solid ${AD_PLATFORMS[acc.platform].color}` }}>
              <div className="row between">
                <b style={{ color: AD_PLATFORMS[acc.platform].color }}>{AD_PLATFORMS[acc.platform].label}</b>
                <span className="badge green"><CheckCircle2 size={11} /> Đã kết nối (demo)</span>
              </div>
              <div><b>{acc.name}</b><div className="muted small">ID {acc.accountId} · đồng bộ {fmtDur(Date.now() - acc.lastSync)} trước</div></div>
              <div className="small"><span className="muted">Đang quảng cáo cho kênh:</span>
                {acc.channelIds.map((id) => {
                  const ch = state.channels.find((c) => c.id === id);
                  return ch && <div key={id} className="row" style={{ gap: 6, marginTop: 4 }}><PlatformIcon platform={ch.platform} /> {ch.name} <span className="muted">({PLATFORMS[ch.platform].label})</span></div>;
                })}
              </div>
              <div className="channel-stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div><b>{active}</b><span className="muted small">Chiến dịch chạy</span></div>
                <div><b>{compact(t.spend)}</b><span className="muted small">Chi tiêu</span></div>
                <div><b>{compact(t.reach)}</b><span className="muted small">Tiếp cận</span></div>
                <div><b className={t.roas >= kpi.roas ? 'metric-good' : t.roas ? 'metric-bad' : ''}>{t.roas.toFixed(1)}</b><span className="muted small">ROAS</span></div>
              </div>
              <button className="btn sm" onClick={() => { update((d) => { d.adAccounts.find((a) => a.id === acc.id).lastSync = Date.now(); }); toast('Đã đồng bộ (dữ liệu demo – kết nối API thật để lấy số liệu mới)'); }}><RefreshCw size={13} /> Đồng bộ</button>
            </div>
          );
        })}
      </div>

      <div className="card card-pad">
        <div className="row between wrap" style={{ marginBottom: 12 }}>
          <h3><Target size={16} color="var(--primary)" /> KPI tiếp cận & hiệu quả</h3>
          <button className="btn sm" onClick={() => setEditKpi(true)}><Pencil size={13} /> Đặt mục tiêu KPI</button>
        </div>
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
          {REACH_KPIS.map((k) => {
            const v = total[k.key] || 0;
            const status = kpiStatus(k.key, v, kpi);
            return (
              <div key={k.key} className="kpi" style={{ border: '1px solid var(--border)', borderRadius: 8, flexDirection: 'column', gap: 4 }} title={k.help}>
                <div className="row between" style={{ width: '100%' }}>
                  <span className="muted small">{k.label}</span>
                  {status && <span className={`badge ${status === 'good' ? 'green' : 'red'}`}>{status === 'good' ? 'Đạt' : 'Chưa đạt'}</span>}
                </div>
                <b className={status === 'bad' ? 'metric-bad' : ''}>{k.fmt(v)}</b>
                {k.target && <span className="muted small">Mục tiêu {k.target(kpi)}</span>}
              </div>
            );
          })}
        </div>
        <div className="muted small" style={{ marginTop: 10 }}>
          <Info size={12} /> Rê chuột lên từng chỉ số để xem ý nghĩa. Tiếp cận theo kỳ là ước tính ({Math.round(REACH_DEDUPE * 100)}% tổng tiếp cận theo ngày) vì một người có thể thấy quảng cáo nhiều ngày; khi kết nối API thật sẽ dùng số tiếp cận đã khử trùng lặp của nền tảng.
        </div>
      </div>

      <div className="card">
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}><h3>Hiệu quả theo kênh đang quảng cáo</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Kênh nhận khách</th><th>Chiến dịch</th><th>Chi tiêu</th><th>Tiếp cận</th><th>Tần suất</th><th>CTR</th><th>Hội thoại</th><th>SĐT</th><th>Đơn</th><th>Doanh thu</th><th>ROAS</th></tr></thead>
            <tbody>
              {channelRows.map((r) => (
                <tr key={r.ch.id}>
                  <td><div className="row"><PlatformIcon platform={r.ch.platform} /> <b>{r.ch.name}</b></div><div className="muted small">{PLATFORMS[r.ch.platform].label}</div></td>
                  <td className="small">{r.campaigns.map((c) => <div key={c.id}>{c.name}</div>)}</td>
                  <td>{money(r.spend)}</td><td>{compact(r.reach)}</td>
                  <td className={r.frequency > kpi.frequencyMax ? 'metric-bad' : ''}>{r.frequency.toFixed(2)}</td>
                  <td>{pct(r.ctr, 2)}</td><td>{r.conversations}</td><td>{r.leads}</td><td>{r.orders}</td><td>{money(r.revenue)}</td>
                  <td className={r.roas >= kpi.roas ? 'metric-good' : r.roas ? 'metric-bad' : ''}>{r.roas.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editKpi && <KpiModal onClose={() => setEditKpi(false)} />}
      {toastNode}
    </div>
  );
}

function KpiModal({ onClose }) {
  const { state, update } = useStore();
  const [f, setF] = useState(state.kpiTargets);
  const field = (key, label, step = 1000) => (
    <label className="field">{label}<input className="input" type="number" step={step} value={f[key]} onChange={(e) => setF({ ...f, [key]: Number(e.target.value) })} /></label>
  );
  return (
    <Modal title="Mục tiêu KPI quảng cáo" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Hủy</button><button className="btn primary" onClick={() => { update((d) => { d.kpiTargets = f; }); onClose(); }}>Lưu</button></>}>
      <div className="form-grid">
        {field('cpm', 'CPM tối đa (đ)')}
        {field('frequencyMax', 'Tần suất tối đa', 0.1)}
        {field('ctr', 'CTR tối thiểu (0.012 = 1,2%)', 0.001)}
        {field('costPerConv', 'Chi phí / hội thoại tối đa (đ)')}
        {field('costPerLead', 'Chi phí / SĐT tối đa (đ)')}
        {field('cpa', 'Chi phí / đơn tối đa (đ)', 10000)}
        {field('roas', 'ROAS tối thiểu', 0.1)}
      </div>
    </Modal>
  );
}
