// Step 5A gate in a real browser: a shop connects its website chat, a visitor writes from the website, staff answer
// from Livechat, both sides see each other's messages live (under 2 seconds). Access tokens live 5 s in this stack,
// so the realtime socket also has to survive token renewal.
import { expect, test } from '@playwright/test';

const API = 'http://127.0.0.1:3100/v1';
const ORIGIN = 'http://localhost:5199';
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

test('website visitor ↔ Livechat agent, live both ways', async ({ browser, page }) => {
  const address = `livechat.${run}@example.vn`;
  const owner = await call('POST', '/auth/register', { fullName: 'Chủ Livechat', email: address, password: PASSWORD, shopName: 'Nội thất Gỗ Việt', acceptTerms: true, platform: 'ANDROID' });

  // Staff: sign in, connect the website chat in settings.
  await page.goto('/#/login');
  await page.getByPlaceholder('ban@congty.vn').fill(address);
  await page.getByPlaceholder('Mật khẩu').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.locator('.topnav')).toBeVisible();
  await page.goto('/#/settings/channels');
  await page.getByRole('button', { name: 'Chat trên website' }).click();
  await page.locator('.modal textarea').fill(ORIGIN);
  await page.getByRole('button', { name: 'Tạo kênh' }).click();
  const code = await page.getByTestId('embed-code').textContent();
  expect(code).toContain('/v1/webchat/widget.js');
  const siteKey = code.match(/data-site-key="(wc_[\w-]+)"/)[1];

  await page.goto('/#/livechat');
  await expect(page.getByText('Chưa kết nối kênh nào')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0); // realtime connected

  // Visitor: a separate browser context, like a customer on the shop's website.
  const visitorContext = await browser.newContext();
  const site = await visitorContext.newPage();
  await site.goto(`/webchat-demo.html?key=${siteKey}`);
  const widget = site.locator('[data-omnibot]');
  await widget.getByRole('button', { name: 'Mở chat' }).click();
  await expect(widget.getByText('Xin chào! Cửa hàng có thể giúp gì cho bạn?')).toBeVisible();
  await widget.getByLabel('Tin nhắn').fill('Bàn ăn 6 ghế giá bao nhiêu shop?');
  let t = Date.now();
  await widget.getByLabel('Tin nhắn').press('Enter');

  // Staff sees the new conversation and message without reloading.
  const item = page.getByTestId('conversation-list').getByText('Bàn ăn 6 ghế giá bao nhiêu shop?');
  await expect(item).toBeVisible({ timeout: 2_000 });
  expect(Date.now() - t).toBeLessThan(2_000);
  await expect(widget.getByText('Đã gửi')).toBeVisible();

  // Wait past the 5 s access-token lifetime: replying must still work (REST refresh) and stay live (socket).
  await page.waitForTimeout(6_000);
  await item.click();
  await expect(page.getByTestId('messages').getByText('Bàn ăn 6 ghế giá bao nhiêu shop?')).toBeVisible();
  await expect(widget.getByText('Đã xem')).toBeVisible({ timeout: 2_000 });
  await page.getByLabel('Nội dung tin nhắn').fill('Dạ bộ bàn 6 ghế gỗ sồi giá 12.500.000đ ạ');
  t = Date.now();
  await page.getByLabel('Nội dung tin nhắn').press('Enter');
  await expect(widget.getByText('Dạ bộ bàn 6 ghế gỗ sồi giá 12.500.000đ ạ')).toBeVisible({ timeout: 2_000 });
  expect(Date.now() - t).toBeLessThan(2_000);

  // Visitor answers again; it lands in the open thread live.
  await widget.getByLabel('Tin nhắn').fill('Ok shop, giao Bình Dương được không?');
  await widget.getByLabel('Tin nhắn').press('Enter');
  await expect(page.getByTestId('messages').getByText('Ok shop, giao Bình Dương được không?')).toBeVisible({ timeout: 2_000 });

  // Reloading the website keeps the conversation (signed visitor token in localStorage).
  await site.reload();
  await widget.getByRole('button', { name: 'Mở chat' }).click();
  await expect(widget.getByText('Dạ bộ bàn 6 ghế gỗ sồi giá 12.500.000đ ạ')).toBeVisible();

  // Once the shop allows only another website, this one can no longer use the chat box.
  const { accessToken } = await call('POST', '/auth/refresh', { refreshToken: owner.refreshToken });
  const [channel] = await call('GET', `/shops/${owner.shops[0].id}/channels`, undefined, accessToken);
  await call('PATCH', `/shops/${owner.shops[0].id}/channels/${channel.id}`, { allowedOrigins: ['https://shop-khac.example.vn'] }, accessToken);
  await site.reload();
  await widget.getByRole('button', { name: 'Mở chat' }).click();
  await expect(widget.getByText('Website này chưa được phép dùng khung chat.')).toBeVisible();
  await visitorContext.close();
});
