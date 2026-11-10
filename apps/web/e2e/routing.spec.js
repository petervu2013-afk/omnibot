// Step 8 in a real browser: the Admin sets round robin, switches one Sale's leads off and gives the other a shift;
// a website visitor arriving from a ref link lands with the working Sale, who sees the source in Livechat.
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { io } from 'socket.io-client';
import { OUTBOX } from '../playwright.config.js';

const API = 'http://127.0.0.1:3100/v1';
const PASSWORD = 'Go-Viet-2026-an-toan';
const run = Date.now().toString(36);
let seq = 0;
const email = (tag) => `${tag}.${run}.${++seq}@example.vn`;

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function mailToken(to) {
  for (let i = 0; i < 50; i++) {
    let files = [];
    try {
      files = readdirSync(OUTBOX).filter((f) => f.includes(to));
    } catch {
      /* not created yet */
    }
    for (const f of files) {
      const m = readFileSync(`${OUTBOX}/${f}`, 'utf8').match(/#\/invite\?token=([\w-]+)/);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no invite mail for ${to}`);
}

async function signIn(page, address) {
  await page.goto('/#/login');
  await page.getByPlaceholder('ban@congty.vn').fill(address);
  await page.getByPlaceholder('Mật khẩu').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.locator('.topnav')).toBeVisible();
}

test('round robin skips a Sale with leads off; the ref link source reaches Livechat', async ({ page, browser }) => {
  const ownerEmail = email('chu');
  const owner = await call('POST', '/auth/register', { fullName: 'Chủ Chia Việc', email: ownerEmail, password: PASSWORD, shopName: 'Shop Chia Việc', acceptTerms: true, platform: 'ANDROID' });
  const shopId = owner.shops[0].id;
  const token = async () => {
    const r = await call('POST', '/auth/refresh', { refreshToken: owner.refreshToken });
    owner.refreshToken = r.refreshToken ?? owner.refreshToken;
    return r.accessToken;
  };
  const sales = [];
  for (const name of ['Sale Trực', 'Sale Nghỉ']) {
    const address = email('sale');
    await call('POST', `/shops/${shopId}/invitations`, { email: address, role: 'SALE' }, await token());
    await call('POST', '/invitations/accept', { token: await mailToken(address), password: PASSWORD, fullName: name });
    sales.push({ name, address });
  }

  await signIn(page, ownerEmail);
  await page.goto('/#/settings/sale');
  await expect(page.getByTestId('sale-row')).toHaveCount(2);
  await page.getByLabel('Chia đều cho tất cả Sale (kể cả offline)').check();
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByText('Đã lưu cách chia hội thoại')).toBeVisible();

  // "Sale Nghỉ" stops receiving leads; "Sale Trực" works today, all day.
  const resting = page.getByTestId('sale-row').filter({ hasText: 'Sale Nghỉ' });
  await resting.locator('.switch, [role="switch"]').first().click();
  const working = page.getByTestId('sale-row').filter({ hasText: 'Sale Trực' });
  await working.getByRole('button', { name: 'Ca làm việc' }).click();
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' });
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(today);
  await page.getByTestId(`shift-day-${day}`).getByRole('button').last().click();
  await page.getByTestId(`shift-day-${day}`).getByLabel(/từ$/).fill('00:00');
  await page.getByTestId(`shift-day-${day}`).getByLabel(/đến$/).fill('23:59');
  await page.locator('.modal').getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(working).toContainText('1 ca/tuần · đang trong ca');
  await expect.poll(async () => (await call('GET', `/shops/${shopId}/members`, null, await token()).catch(() => [])).find?.((m) => m.fullName === 'Sale Nghỉ')?.receivesLeads).toBe(false);

  // The Ref & Src page builds the website link for a ref code.
  const channel = await call('POST', `/shops/${shopId}/channels/webchat`, { name: 'Website', allowedOrigins: ['https://noithat.example.vn'] }, await token());
  await page.goto('/#/settings/refsrc');
  await page.getByPlaceholder('vd: livestream-21h').fill('livestream-21h');
  await page.getByPlaceholder('website').fill('tiktok');
  await expect(page.getByTestId('ref-link')).toContainText('https://noithat.example.vn/?utm_source=tiktok&utm_campaign=livestream-21h');

  // A visitor from that link writes (origin allowed by the channel).
  const socket = io('http://127.0.0.1:3100/webchat', {
    auth: { siteKey: channel.externalId, attribution: { ref: 'livestream-21h', src: 'tiktok' } },
    transports: ['websocket'],
    extraHeaders: { origin: 'https://noithat.example.vn' },
    reconnection: false,
    forceNew: true,
  });
  await new Promise((resolve, reject) => {
    socket.once('session', resolve);
    socket.once('connect_error', reject);
  });
  const ack = await socket.timeout(5_000).emitWithAck('message', { clientId: `c-${run}-1`, text: 'Xem live thấy kệ tivi, còn không shop?', name: 'Khách Live' });
  socket.disconnect();
  expect(ack.ok).toBe(true);

  // The working Sale has it in Livechat, with its source.
  const ctx = await browser.newContext();
  const salePage = await ctx.newPage();
  await signIn(salePage, sales[0].address);
  await salePage.goto('/#/livechat');
  await salePage.getByText('Khách Live').first().click();
  await expect(salePage.getByTestId('conversation-source')).toContainText('tiktok');
  await expect(salePage.getByTestId('conversation-source')).toContainText('livestream-21h');
  await expect(salePage.locator('.lc-info')).toContainText('Sale Trực');
  await ctx.close();
});
