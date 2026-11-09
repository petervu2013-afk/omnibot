// Step 6 in a real browser: the same person writing twice with the same email becomes one profile, staff see both
// conversations and the merge on the profile, can split it again, and can merge a suggested pair.
import { expect, test } from '@playwright/test';
import { io } from 'socket.io-client';

const API = 'http://127.0.0.1:3100/v1';
const PASSWORD = 'Go-Viet-2026-an-toan';
const run = Date.now().toString(36);

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

/** A new website visitor sends one message (with optional name / email) and leaves. */
async function visitorWrites(siteKey, text, profile = {}) {
  const socket = io('http://127.0.0.1:3100/webchat', { auth: { siteKey }, transports: ['websocket'], reconnection: false, forceNew: true });
  await new Promise((resolve, reject) => {
    socket.once('session', resolve);
    socket.once('connect_error', reject);
  });
  const ack = await socket.timeout(5_000).emitWithAck('message', { clientId: `c-${run}-${Math.random().toString(36).slice(2)}`, text, ...profile });
  socket.disconnect();
  if (!ack.ok) throw new Error(`visitor message refused: ${ack.error}`);
}

test('same email twice → one profile; split it again; merge a suggested pair', async ({ page }) => {
  const address = `identity.${run}@example.vn`;
  const owner = await call('POST', '/auth/register', { fullName: 'Chủ Hồ Sơ', email: address, password: PASSWORD, shopName: 'Shop Hồ Sơ', acceptTerms: true, platform: 'ANDROID' });
  const shopId = owner.shops[0].id;
  const token = async () =>
    (
      await call('POST', '/auth/refresh', { refreshToken: owner.refreshToken }).then((r) => {
        owner.refreshToken = r.refreshToken ?? owner.refreshToken;
        return r;
      })
    ).accessToken;
  const channel = await call('POST', `/shops/${shopId}/channels/webchat`, { name: 'Website', allowedOrigins: [] }, await token());

  const email = `thu.${run}@gmail.com`;
  await visitorWrites(channel.externalId, 'Cho mình hỏi giá giường', { name: 'Hoàng Anh Thư', email });
  await visitorWrites(channel.externalId, 'Mình hỏi lại về giường gỗ', { name: 'Anh Thư', email: email.toUpperCase() });

  await page.goto('/#/login');
  await page.getByPlaceholder('ban@congty.vn').fill(address);
  await page.getByPlaceholder('Mật khẩu').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.locator('.topnav')).toBeVisible();
  await page.goto('/#/orders/customers');

  // One profile, both conversations, the automatic merge listed.
  const rows = page.getByTestId('customer-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Hoàng Anh Thư');
  await rows.first().click();
  const profile = page.getByTestId('customer-profile');
  await expect(profile).toContainText('2 hội thoại');
  await expect(profile.getByTestId('merge-row')).toContainText('Anh Thư · trùng email (tự động)');

  // Split it again.
  page.once('dialog', (d) => d.accept());
  await profile.getByRole('button', { name: 'Tách lại' }).click();
  await expect(profile.getByTestId('merge-row')).toHaveCount(0);
  await expect(profile).toContainText('1 hội thoại');
  await page.keyboard.press('Escape');
  await expect(rows).toHaveCount(2);

  // A chat visitor and a profile typed in by staff, same name without accents → suggested; merge it.
  await visitorWrites(channel.externalId, 'Shop còn kệ tivi không', { name: 'Lý Gia Bảo' });
  await call('POST', `/shops/${shopId}/customers`, { name: 'Ly Gia Bao', phone: '0912345678' }, await token());
  await page.reload();
  await expect(rows).toHaveCount(4);
  await page.getByRole('button', { name: 'Đề xuất gộp' }).click();
  const suggestion = page.getByTestId('merge-suggestion').filter({ hasText: 'Lý Gia Bảo' });
  await expect(suggestion).toContainText('Ly Gia Bao');
  // The split pair is not proposed again.
  await expect(page.getByTestId('merge-suggestion').filter({ hasText: 'Anh Thư' })).toHaveCount(0);
  await suggestion.getByRole('button', { name: 'Gộp', exact: true }).click();
  await expect(page.getByText('Không có đề xuất nào.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(rows).toHaveCount(3);
  // The older (chat) profile is kept and gets the phone staff typed on the newer one.
  await expect(rows.filter({ hasText: 'Lý Gia Bảo' })).toContainText('0912345678');
});
