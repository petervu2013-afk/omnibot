import { useState } from 'react';
import { ChevronLeft, ChevronRight, Bell, Trash2 } from 'lucide-react';
import { useStore, uid } from '../store.jsx';
import { Modal, Switch } from '../components/ui.jsx';

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7h – 21h
const SLOT = 48; // px per hour, matches .cal-slot height
const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function startOfWeek(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export default function Booking() {
  const { state, update } = useStore();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [draft, setDraft] = useState(null);
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000));
  const todayStr = new Date().toDateString();
  const shift = (n) => setWeekStart(new Date(weekStart.getTime() + n * 7 * 86400000));

  const save = () => {
    update((d) => {
      const existing = d.bookings.find((b) => b.id === draft.id);
      if (existing) Object.assign(existing, draft); else d.bookings.push({ ...draft, id: uid() });
    });
    setDraft(null);
  };

  return (
    <div className="page">
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <span className="muted">Tạo lịch hẹn & tự động nhắc lịch qua tin nhắn</span>
        <div className="grow" />
        <button className="btn"><Bell size={15} /> Reminder: 1 giờ trước</button>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn" onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
        <button className="btn" onClick={() => shift(1)}><ChevronRight size={16} /></button>
        <button className="btn" onClick={() => setWeekStart(startOfWeek(new Date()))}>Hôm nay</button>
        <h2 className="grow" style={{ textAlign: 'center' }}>
          {days[0].toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} – {days[6].toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </h2>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div className="calendar" style={{ minWidth: 760 }}>
          <div className="cal-head" style={{ borderLeft: 0 }} />
          {days.map((d) => (
            <div key={d} className={`cal-head ${d.toDateString() === todayStr ? 'today' : ''}`}>{DAY_NAMES[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}</div>
          ))}
          <div>{HOURS.map((h) => <div key={h} className="cal-time">{h}:00</div>)}</div>
          {days.map((d) => {
            const dayStart = d.getTime();
            const events = state.bookings.filter((b) => b.start >= dayStart && b.start < dayStart + 86400000);
            return (
              <div key={d} className={`cal-col ${d.toDateString() === todayStr ? 'today' : ''}`}>
                {HOURS.map((h) => (
                  <div key={h} className="cal-slot" onClick={() => setDraft({ title: '', customerId: '', start: dayStart + h * 3600000, duration: 60, remind: true })} />
                ))}
                {events.map((ev) => {
                  const startH = (ev.start - dayStart) / 3600000;
                  return (
                    <div key={ev.id} className="cal-event" style={{ top: (startH - HOURS[0]) * SLOT, height: Math.max(22, (ev.duration / 60) * SLOT - 2) }} onClick={() => setDraft({ ...ev })}>
                      <b>{new Date(ev.start).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</b> {ev.title}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {draft && (
        <Modal
          title={draft.id ? 'Sửa lịch hẹn' : 'Tạo lịch hẹn'}
          onClose={() => setDraft(null)}
          footer={<>
            {draft.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => { update((d) => { d.bookings = d.bookings.filter((b) => b.id !== draft.id); }); setDraft(null); }}><Trash2 size={14} /> Xóa</button>}
            <button className="btn" onClick={() => setDraft(null)}>Hủy</button>
            <button className="btn primary" onClick={save} disabled={!draft.title}>Lưu</button>
          </>}
        >
          <label className="field">Tiêu đề<input className="input" autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
          <label className="field">Khách hàng
            <select className="select" value={draft.customerId} onChange={(e) => setDraft({ ...draft, customerId: e.target.value })}>
              <option value="">— Không chọn —</option>
              {state.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="form-grid">
            <label className="field">Bắt đầu
              <input className="input" type="datetime-local" value={new Date(draft.start - new Date(draft.start).getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(e) => setDraft({ ...draft, start: new Date(e.target.value).getTime() })} />
            </label>
            <label className="field">Thời lượng (phút)
              <input className="input" type="number" step="15" min="15" value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: Number(e.target.value) })} />
            </label>
          </div>
          <div className="row small"><Switch on={draft.remind} onChange={(v) => setDraft({ ...draft, remind: v })} /> Gửi tin nhắn nhắc lịch cho khách</div>
        </Modal>
      )}
    </div>
  );
}
