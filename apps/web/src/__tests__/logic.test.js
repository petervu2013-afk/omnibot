// Unit tests for the pure business logic that later moves to the backend (AI fallback, CRM, auth rules, CSV, analytics).
import { describe, it, expect } from 'vitest';
import { parseTable, mapHeaders, toNumber, normHeader } from '../csv.js';
import { passwordIssues, passwordStrength, isEmail, describeDevice } from '../auth.jsx';
import { e164, splitName, div, kpiStatus } from '../analytics.js';
import { fmtDur, intakeLead, logInteraction, setStage, DEFAULT_PROCESS } from '../crm.js';
import { localReply } from '../ai.js';
import { DEFAULT_AI } from '../store.jsx';

describe('csv', () => {
  it('parses quoted cells, tabs and a leading BOM', () => {
    const t = parseTable('﻿Tên\tGiá\n"Tủ áo, 3 cánh"\t7.900.000');
    expect(t.headers).toEqual(['Tên', 'Giá']);
    expect(t.rows[0]).toEqual(['Tủ áo, 3 cánh', '7.900.000']);
  });
  it('reads Vietnamese money formats', () => {
    expect(toNumber('1.290.000₫')).toBe(1290000);
    expect(toNumber('1,290,000')).toBe(1290000);
    expect(toNumber('12,5')).toBe(12.5);
    expect(toNumber('')).toBe(0);
  });
  it('maps headers without accents', () => {
    expect(normHeader('Số tiền đã chi tiêu (VND)')).toBe('so tien da chi tieu vnd');
    expect(mapHeaders(['Tên sản phẩm', 'Giá'], [['name', /^ten san pham$/], ['price', /^gia$/]])).toEqual(['name', 'price']);
  });
});

describe('auth rules (AUTH-01, AUTH-03)', () => {
  it('rejects weak passwords', () => {
    expect(passwordIssues('abc')).toContain('Ít nhất 8 ký tự');
    expect(passwordIssues('abcdefgh')).toContain('Có cả chữ và số');
    expect(passwordIssues('12345678abc').length).toBeGreaterThan(0);
    expect(passwordIssues('GoViet2026')).toEqual([]);
  });
  it('does not allow the email name inside the password', () => {
    expect(passwordIssues('tranthuha2026', 'tranthuha@shop.vn')).toContain('Không chứa tên email');
  });
  it('scores strength and validates emails', () => {
    expect(passwordStrength('Ab1!efghijkl')).toBe(4);
    expect(passwordStrength('abc')).toBe(0);
    expect(isEmail('ban@congty.vn')).toBe(true);
    expect(isEmail('ban@congty')).toBe(false);
  });
  it('names the device from the user agent', () => {
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36')).toBe('Chrome trên Windows');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari trên iOS');
  });
});

describe('analytics helpers', () => {
  it('normalises phone numbers to E.164', () => {
    expect(e164('0938123456')).toBe('+84938123456');
    expect(e164('84938123456')).toBe('+84938123456');
    expect(e164('+84 938 123 456')).toBe('+84938123456');
  });
  it('splits Vietnamese names into last/first', () => {
    expect(splitName('Nguyễn Văn Minh')).toEqual({ ln: 'Nguyễn', fn: 'Văn Minh' });
  });
  it('grades KPIs in the right direction', () => {
    const kpi = { cpm: 60000, frequencyMax: 3, roas: 3 };
    expect(kpiStatus('cpm', 50000, kpi)).toBe('good');
    expect(kpiStatus('roas', 2, kpi)).toBe('bad');
    expect(kpiStatus('frequency', 3.5, kpi)).toBe('bad');
    expect(div(1, 0)).toBe(0);
  });
});

const PRODUCTS = [
  { id: 'p1', sku: 'BA', name: 'Bàn ăn gỗ sồi 1m6', category: 'Bàn ăn', price: 6500000, stock: 12, description: 'Gỗ sồi Mỹ, kèm 4 ghế.' },
  { id: 'p4', sku: 'SF', name: 'Sofa văng da 2m2', category: 'Sofa', price: 9800000, stock: 7, description: 'Da PU, 3 chỗ.' },
  { id: 'p8', sku: 'GN', name: 'Giường ngủ gỗ sồi 1m6', category: 'Giường', price: 8900000, stock: 0, description: 'Giường 1m6x2m.' },
];

// Plays a scripted conversation through the local AI engine, carrying lead data like the app does.
function chat(lines) {
  const customer = { phone: '', address: '' };
  const messages = [];
  let last;
  for (const text of lines) {
    messages.push({ from: 'customer', text });
    last = localReply({ ai: DEFAULT_AI, products: PRODUCTS, customer, messages, campaign: null });
    messages.push({ from: 'ai', text: last.reply, productIds: last.product_ids, intent: last.intent });
    if (last.lead.phone) customer.phone = last.lead.phone;
    if (last.lead.address) customer.address = last.lead.address;
  }
  return last;
}

describe('AI fallback engine (BOT-01)', () => {
  it('closes an order after phone and address', () => {
    const r = chat(['mình lấy bàn ăn gỗ sồi', '0938123456', '12 Võ Văn Ngân, Thủ Đức, TP.HCM']);
    expect(r.order.ready).toBe(true);
    expect(r.order.items).toEqual([{ product_id: 'p1', qty: 1 }]);
    expect(r.lead).toMatchObject({ phone: '0938123456', address: '12 Võ Văn Ngân, Thủ Đức, TP.HCM' });
  });
  it('keeps the quantity and the referenced product across messages', () => {
    const r = chat(['sofa da giá bao nhiêu', 'lấy cái đó 2 cái', '0912345678 - 45 Lê Lợi, Q.1, TP.HCM']);
    expect(r.order.items).toEqual([{ product_id: 'p4', qty: 2 }]);
  });
  it('does not treat "không"/"Lê Lợi" as complaints and hands real complaints to staff', () => {
    expect(chat(['giường gỗ sồi còn không']).handoff).toBe(false);
    expect(chat(['hàng bị lỗi, tôi muốn hoàn tiền']).handoff).toBe(true);
  });
  it('never sells an out-of-stock product', () => {
    const r = chat(['mua giường']);
    expect(r.order.ready).toBe(false);
    expect(r.reply).toMatch(/hết hàng/);
  });
});

function draft() {
  return {
    process: structuredClone(DEFAULT_PROCESS),
    staff: [{ id: 's2', name: 'A', role: 'Sale' }, { id: 's3', name: 'B', role: 'Sale' }, { id: 's5', name: 'C', role: 'CSKH' }],
    customers: [{ id: 'c1', name: 'Khách', phone: '0900000001', tags: [], stage: 'new', firstSeen: Date.now() }],
    activities: [],
    tasks: [],
  };
}

describe('CRM process (CRM-02)', () => {
  it('assigns a new lead and schedules the cadence with the first call inside the SLA', () => {
    const d = draft();
    intakeLead(d, 'c1');
    expect(d.customers[0].ownerId).toBeTruthy();
    expect(d.tasks).toHaveLength(DEFAULT_PROCESS.cadence.length);
    expect(d.tasks[0].due - Date.now()).toBeLessThanOrEqual(DEFAULT_PROCESS.slaMinutes * 60000 + 1000);
  });
  it('schedules a retry when the customer does not pick up, and advances the stage on a connected call', () => {
    const d = draft();
    intakeLead(d, 'c1');
    logInteraction(d, { customerId: 'c1', type: 'call', outcome: 'no_answer', staffId: 's2' });
    expect(d.tasks.some((t) => t.kind === 'retry' && !t.done)).toBe(true);
    logInteraction(d, { customerId: 'c1', type: 'call', outcome: 'connected', staffId: 's2' });
    expect(d.customers[0].stage).toBe('consulting');
  });
  it('closes sales tasks and books after-sales care when the deal is won', () => {
    const d = draft();
    intakeLead(d, 'c1');
    setStage(d, 'c1', 'won');
    expect(d.tasks.filter((t) => !t.done && t.kind !== 'care')).toHaveLength(0);
    expect(d.tasks.filter((t) => t.kind === 'care')).toHaveLength(DEFAULT_PROCESS.careAfterDays.length);
  });
  it('formats durations', () => {
    expect(fmtDur(5 * 60000)).toBe('5 phút');
    expect(fmtDur(3 * 3600000)).toBe('3 giờ');
    expect(fmtDur(2 * 86400000)).toBe('2 ngày');
  });
});
