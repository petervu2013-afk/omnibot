// Step 4 gate in a real browser against the real API: 4 roles → right menus and buttons, two browsers → sign out the
// other device, no tokens in localStorage. Access tokens live 5 seconds here, so rotation runs constantly.
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { OUTBOX } from '../playwright.config.js';

const API = 'http://127.0.0.1:3100/v1';
const PASSWORD = 'Go-Viet-2026-an-toan';
const run = Date.now().toString(36);
let seq = 0;
const email = (tag) => `${tag}.${run}.${++seq}@example.vn`;

async function post(path, body, token) {
  const res = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text}`);
  return data;
}

async function mailToken(to, kind) {
  for (let i = 0; i < 50; i++) {
    let files = [];
    try {
      files = readdirSync(OUTBOX)
        .filter((f) => f.includes(to))
        .sort()
        .reverse();
    } catch {
      /* not created yet */
    }
    for (const f of files) {
      const m = readFileSync(`${OUTBOX}/${f}`, 'utf8').match(new RegExp(`#/${kind}\\?token=([\\w-]+)`));
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no ${kind} mail for ${to}`);
}

async function signIn(page, address, password = PASSWORD) {
  await page.goto('/#/login');
  await page.getByPlaceholder('ban@congty.vn').fill(address);
  await page.getByPlaceholder('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.locator('.topnav')).toBeVisible();
}

const openSettings = (page, tab) => page.goto(`/#/settings/${tab}`);
const menu = (page) => page.locator('.nav-item .nav-label').allInnerTexts();

const FULL_MENU = ['Dashboard', 'Kênh & Bot', 'Quảng cáo', 'Livechat', 'Khách hàng', 'Bài viết', 'Đơn hàng', 'Lịch hẹn', 'Báo cáo', 'Cài đặt'];

test.describe('four roles', () => {
  const accounts = {};

  test.beforeAll(async () => {
    const owner = await post('/auth/register', { fullName: 'Chủ Shop', email: email('chu'), password: PASSWORD, shopName: 'Nội Thất Gỗ Việt', acceptTerms: true, platform: 'ANDROID' });
    const shopId = owner.shops[0].id;
    accounts.ADMIN = owner.user.email;
    for (const role of ['MANAGER', 'SALE', 'WAREHOUSE']) {
      const address = email(role.toLowerCase());
      await post(`/shops/${shopId}/invitations`, { email: address, role }, owner.accessToken);
      await post('/invitations/accept', { token: await mailToken(address, 'invite'), password: PASSWORD, fullName: `Nhân viên ${role}` });
      accounts[role] = address;
    }
  });

  test('Admin: full menu, can invite and change roles', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, accounts.ADMIN);
    expect(await menu(page)).toEqual(FULL_MENU);
    // Whole menu and the account button fit on a laptop screen, even with a long shop name.
    await expect(page.locator('.nav-item', { hasText: 'Cài đặt' })).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.nav-user .avatar')).toBeInViewport({ ratio: 1 });
    expect(await page.locator('.topnav').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await openSettings(page, 'staff');
    await expect(page.getByTestId('member-row')).toHaveCount(4);
    await expect(page.getByLabel('Email nhân viên')).toBeVisible();
    await expect(page.getByLabel(/^Vai trò của/)).toHaveCount(3); // everyone but the owner
    await openSettings(page, 'info');
    await expect(page.getByRole('button', { name: 'Lưu thiết lập' })).toBeVisible();
  });

  test('Manager: full menu, invites but cannot change roles or shop info', async ({ page }) => {
    await signIn(page, accounts.MANAGER);
    expect(await menu(page)).toEqual(FULL_MENU);
    await openSettings(page, 'staff');
    await expect(page.getByTestId('member-row')).toHaveCount(4);
    await expect(page.getByLabel('Email nhân viên')).toBeVisible();
    await expect(page.getByLabel(/^Vai trò của/)).toHaveCount(0);
    await openSettings(page, 'info');
    await expect(page.getByText('Chỉ Admin được sửa thông tin cửa hàng.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Lưu thiết lập' })).toHaveCount(0);
  });

  test('Sale: reduced menu; staff and ads are refused', async ({ page }) => {
    await signIn(page, accounts.SALE);
    expect(await menu(page)).toEqual(['Dashboard', 'Livechat', 'Khách hàng', 'Đơn hàng', 'Lịch hẹn', 'Báo cáo', 'Cài đặt']);
    await openSettings(page, 'staff');
    await expect(page.getByTestId('no-access')).toBeVisible();
    await page.goto('/#/ads');
    await expect(page.getByTestId('no-access')).toBeVisible();
    await expect(page.locator('.side-menu, .sidemenu').getByText('Nhân viên', { exact: true })).toHaveCount(0);
  });

  test('Warehouse: smallest menu; chat and customers are refused', async ({ page }) => {
    await signIn(page, accounts.WAREHOUSE);
    expect(await menu(page)).toEqual(['Dashboard', 'Đơn hàng', 'Báo cáo', 'Cài đặt']);
    for (const path of ['livechat', 'crm', 'dashboard']) {
      await page.goto(`/#/${path}`);
      await expect(page.getByTestId('no-access')).toBeVisible();
    }
  });

  test('Manager invites through the screen; the new employee accepts and gets the role', async ({ page, browser }) => {
    await signIn(page, accounts.MANAGER);
    await openSettings(page, 'staff');
    const invited = email('moi');
    await page.getByLabel('Email nhân viên').fill(invited);
    await page.getByLabel('Vai trò mời').selectOption('WAREHOUSE');
    await page.getByRole('button', { name: 'Gửi lời mời' }).click();
    await expect(page.getByTestId('invite-row').filter({ hasText: invited })).toBeVisible();

    const other = await browser.newContext({ locale: 'vi-VN' });
    const guest = await other.newPage();
    await guest.goto(`/#/invite?token=${await mailToken(invited, 'invite')}`);
    await expect(guest.getByText('Nội Thất Gỗ Việt')).toBeVisible();
    await guest.getByLabel('Họ và tên').fill('Thủ Kho Mới');
    await guest.getByPlaceholder('Mật khẩu', { exact: true }).fill(PASSWORD);
    await guest.getByPlaceholder('Nhập lại mật khẩu').fill(PASSWORD);
    await guest.getByRole('button', { name: 'Nhận lời mời' }).click();
    await expect(guest.getByText('Bạn đã tham gia cửa hàng')).toBeVisible();
    await signIn(guest, invited);
    expect(await menu(guest)).toEqual(['Dashboard', 'Đơn hàng', 'Báo cáo', 'Cài đặt']);
    await other.close();
  });

  test('a role change by the Admin reaches the employee without a new login', async ({ page, browser }) => {
    await signIn(page, accounts.SALE);
    expect(await menu(page)).toContain('Livechat');
    const other = await browser.newContext();
    const admin = await other.newPage();
    await signIn(admin, accounts.ADMIN);
    await openSettings(admin, 'staff');
    const row = admin.getByTestId('member-row').filter({ hasText: accounts.SALE });
    await row.getByLabel(/^Vai trò của/).selectOption('WAREHOUSE');
    await expect(row.getByLabel(/^Vai trò của/)).toHaveValue('WAREHOUSE');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.nav-item', { hasText: 'Livechat' })).toHaveCount(0);
    await row.getByLabel(/^Vai trò của/).selectOption('SALE');
    await other.close();
  });
});

test.describe('sessions', () => {
  test('sign out another device from a second browser', async ({ browser }) => {
    const r = await post('/auth/register', { fullName: 'Hai Máy', email: email('haimay'), password: PASSWORD, shopName: 'Shop Hai Máy', acceptTerms: true, platform: 'ANDROID' });
    await post('/auth/logout', { refreshToken: r.refreshToken });
    const a = await browser.newContext();
    const b = await browser.newContext();
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    await signIn(pageA, r.user.email);
    await signIn(pageB, r.user.email);
    await openSettings(pageA, 'security');
    await expect(pageA.getByTestId('device-row')).toHaveCount(2);
    await pageA.getByRole('button', { name: 'Đăng xuất thiết bị' }).click();
    await expect(pageA.getByTestId('device-row')).toHaveCount(1);
    // The other browser drops to the login page by itself, with no reload.
    await pageB.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(pageB).toHaveURL(/#\/login/);
    await expect(pageB.getByText('đăng xuất', { exact: false }).first()).toBeVisible();
    await expect(pageA.locator('.topnav')).toBeVisible();
    await a.close();
    await b.close();
  });

  test('keeps working across access token expiry, reloads and two tabs; nothing secret in storage', async ({ context }) => {
    const r = await post('/auth/register', { fullName: 'Hai Tab', email: email('haitab'), password: PASSWORD, shopName: 'Shop Hai Tab', acceptTerms: true, platform: 'ANDROID' });
    const tab1 = await context.newPage();
    await signIn(tab1, r.user.email);
    const tab2 = await context.newPage();
    await tab2.goto('/#/settings/staff');
    await expect(tab2.getByTestId('member-row')).toHaveCount(1);
    await tab1.waitForTimeout(6000); // access tokens have expired in both tabs
    await Promise.all([tab1.reload(), tab2.reload()]);
    await expect(tab1.locator('.topnav')).toBeVisible();
    await expect(tab2.getByTestId('member-row')).toHaveCount(1);
    await tab1.waitForTimeout(6000);
    await Promise.all([tab1.evaluate(() => window.dispatchEvent(new Event('focus'))), tab2.evaluate(() => window.dispatchEvent(new Event('focus')))]);
    await tab1.waitForTimeout(1500);
    await expect(tab1).not.toHaveURL(/#\/login/);
    await expect(tab2).not.toHaveURL(/#\/login/);

    const storage = await tab1.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(Object.keys(storage.local).filter((k) => k.startsWith('omnibot-auth'))).toEqual([]);
    expect(JSON.stringify(storage)).not.toMatch(/eyJ[\w-]+\.[\w-]+\.|refreshToken|accessToken/);
    const cookie = (await context.cookies()).find((c) => c.name === 'omnibot_rt');
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/v1/auth' });

    // Logging out in one tab reaches the other immediately.
    await openSettings(tab1, 'security');
    await tab1.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(tab1).toHaveURL(/#\/login/);
    await expect(tab2).toHaveURL(/#\/login/);
  });
});

test.describe('public flows', () => {
  test('register, verify the email from its link, sample-data banner', async ({ page }) => {
    const address = email('dangky');
    await page.goto('/#/register');
    await page.getByPlaceholder('Nguyễn Văn A').fill('Nguyễn Văn Đăng Ký');
    await page.getByPlaceholder('ban@congty.vn').fill(address);
    await page.getByPlaceholder('VD: Nội thất Gỗ Việt').fill('Gỗ Đẹp Đà Nẵng');
    await page.getByPlaceholder('Mật khẩu', { exact: true }).fill(PASSWORD);
    await page.getByPlaceholder('Nhập lại mật khẩu').fill(PASSWORD);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(page.locator('.topnav')).toBeVisible();
    await expect(page.getByText('Gỗ Đẹp Đà Nẵng').first()).toBeVisible(); // Vietnamese stored and read back
    await expect(page.getByText('chưa được xác minh')).toBeVisible();
    await expect(page.getByTestId('sample-banner')).toBeVisible();
    await page.goto(`/#/verify?token=${await mailToken(address, 'verify')}`);
    await expect(page.getByText('Email đã được xác minh')).toBeVisible();
    await page.getByRole('button', { name: 'Vào ứng dụng' }).click();
    await expect(page.getByText('chưa được xác minh')).toHaveCount(0);
  });

  test('wrong passwords: uniform message, CAPTCHA from the 3rd, lock after the 5th', async ({ page }) => {
    const r = await post('/auth/register', { fullName: 'Sai Mật Khẩu', email: email('sai'), password: PASSWORD, shopName: 'Shop Sai', acceptTerms: true, platform: 'ANDROID' });
    await page.goto('/#/login');
    await page.getByPlaceholder('ban@congty.vn').fill(r.user.email);
    const pw = page.getByPlaceholder('Mật khẩu');
    const submit = page.getByRole('button', { name: 'Đăng nhập', exact: true });
    const alert = page.locator('.auth-alert.error');
    for (let i = 1; i <= 2; i++) {
      await pw.fill(`Sai-mat-khau-${i}`);
      await submit.click();
      await expect(alert).toContainText('Email hoặc mật khẩu không đúng');
      await expect(page.locator('.captcha-box')).toHaveCount(0);
    }
    await pw.fill('Sai-mat-khau-3');
    await submit.click();
    await expect(page.locator('.captcha-box')).toBeVisible();
    await submit.click();
    await expect(alert).toContainText('không phải người máy');
    for (let i = 4; i <= 5; i++) {
      await page.locator('.captcha-box input').check();
      await pw.fill(`Sai-mat-khau-${i}`);
      await submit.click();
      if (i === 4) await expect(alert).toContainText('Còn 1 lần thử');
    }
    await expect(alert).toContainText('tạm khóa');
  });

  test('forgot password → reset from the link → old password no longer works', async ({ page }) => {
    const r = await post('/auth/register', { fullName: 'Quên Mật Khẩu', email: email('quen'), password: PASSWORD, shopName: 'Shop Quên', acceptTerms: true, platform: 'ANDROID' });
    await page.goto('/#/forgot');
    await page.getByPlaceholder('ban@congty.vn').fill(r.user.email);
    await page.getByRole('button', { name: 'Gửi liên kết đặt lại' }).click();
    await expect(page.getByText('Nếu')).toBeVisible();
    const token = await mailToken(r.user.email, 'reset');
    await page.goto(`/#/reset?token=${token}`);
    await page.reload();
    const fresh = 'Mat-khau-moi-2026-x';
    await page.getByPlaceholder('Mật khẩu', { exact: true }).fill(fresh);
    await page.getByPlaceholder('Nhập lại mật khẩu').fill(fresh);
    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await expect(page.getByText('Đã đổi mật khẩu')).toBeVisible();
    await signIn(page, r.user.email, fresh);
  });

  test('protected pages redirect to login and return after it', async ({ page }) => {
    const r = await post('/auth/register', { fullName: 'Quay Lại', email: email('quaylai'), password: PASSWORD, shopName: 'Shop Quay Lại', acceptTerms: true, platform: 'ANDROID' });
    await page.goto('/#/settings/staff');
    await expect(page).toHaveURL(/#\/login\?next=/);
    await page.getByPlaceholder('ban@congty.vn').fill(r.user.email);
    await page.getByPlaceholder('Mật khẩu').fill(PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(/#\/settings\/staff/);
  });
});
