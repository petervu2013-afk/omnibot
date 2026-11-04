// Step 4 gate: products, categories and customers really live in the database, per role and per Sale scope.
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
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

async function inviteToken(to) {
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
  throw new Error(`no invite for ${to}`);
}

async function signIn(page, address) {
  await page.goto('/#/login');
  await page.getByPlaceholder('ban@congty.vn').fill(address);
  await page.getByPlaceholder('Mật khẩu').fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.locator('.topnav')).toBeVisible();
}

test.describe('data in the database', () => {
  let owner;
  let shopId;
  const staff = {};
  // Access tokens live 5 seconds in this stack: get a new one before calling the API directly.
  const ownerToken = async () => {
    const next = await call('POST', '/auth/refresh', { refreshToken: owner.refreshToken });
    owner = { ...owner, ...next };
    return next.accessToken;
  };

  test.beforeAll(async () => {
    owner = await call('POST', '/auth/register', { fullName: 'Chủ Dữ Liệu', email: email('chu'), password: PASSWORD, shopName: 'Shop Dữ Liệu', acceptTerms: true, platform: 'ANDROID' });
    shopId = owner.shops[0].id;
    for (const role of ['SALE', 'WAREHOUSE']) {
      const address = email(role.toLowerCase());
      await call('POST', `/shops/${shopId}/invitations`, { email: address, role }, await ownerToken());
      await call('POST', '/invitations/accept', { token: await inviteToken(address), password: PASSWORD, fullName: `Nhân viên ${role}` });
      staff[role] = address;
    }
  });

  test('Admin adds a category and product; they survive a new browser with empty storage', async ({ page, browser }) => {
    await signIn(page, owner.user.email);
    await page.goto('/#/orders/categories');
    await expect(page.getByTestId('sample-banner')).toHaveCount(0);
    await page.getByRole('button', { name: 'Thêm danh mục' }).click();
    await page.getByLabel('Tên danh mục').fill('Nhóm Nội Thất');
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.getByTestId('category-row').filter({ hasText: 'Nhóm Nội Thất' })).toBeVisible();

    await page.goto('/#/orders/products');
    await expect(page.getByText('Chưa có sản phẩm nào.')).toBeVisible(); // a new shop starts empty, no sample rows
    await page.getByRole('button', { name: 'Thêm sản phẩm' }).click();
    await page.getByLabel('Mã SKU').fill('BA-SOI-16');
    await page.getByLabel('Tên sản phẩm').fill('Bàn ăn gỗ sồi 1m6');
    await page.getByLabel('Danh mục').selectOption({ label: 'Nhóm Nội Thất' });
    await page.getByLabel('Giá bán').fill('6500000');
    await page.getByLabel(/^Mô tả cho AI/).fill('Gỗ sồi Mỹ, 160x80cm');
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    const row = page.getByTestId('product-row').filter({ hasText: 'Bàn ăn gỗ sồi 1m6' });
    await expect(row.locator('td').nth(1)).toHaveText('Nhóm Nội Thất');
    await expect(row).toContainText('6.500.000');

    // Duplicate SKU shows the API's message and keeps the form open.
    await page.getByRole('button', { name: 'Thêm sản phẩm' }).click();
    await page.getByLabel('Mã SKU').fill('BA-SOI-16');
    await page.getByLabel('Tên sản phẩm').fill('Trùng mã');
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await expect(page.getByText('Mã SKU này đã có trong cửa hàng.')).toBeVisible();
    await page.getByRole('button', { name: 'Hủy' }).click();

    const other = await browser.newContext();
    const fresh = await other.newPage();
    await signIn(fresh, owner.user.email);
    await fresh.goto('/#/orders/products');
    await expect(fresh.getByTestId('product-row').filter({ hasText: 'Bàn ăn gỗ sồi 1m6' })).toBeVisible();
    await fresh.getByLabel('Tìm sản phẩm').fill('không có sản phẩm này');
    await expect(fresh.getByText('Không tìm thấy sản phẩm.')).toBeVisible();
    await other.close();
  });

  test('Sale reads products without edit buttons; Warehouse cannot open customers', async ({ page, browser }) => {
    await call('POST', `/shops/${shopId}/products`, { sku: `XEM-${run}`, name: 'Sản phẩm để xem', price: 1000 }, await ownerToken());
    await signIn(page, staff.SALE);
    await page.goto('/#/orders/products');
    await expect(page.getByTestId('product-row').filter({ hasText: 'Sản phẩm để xem' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thêm sản phẩm' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Quét danh mục' })).toHaveCount(0);
    await expect(page.getByTitle('Xóa')).toHaveCount(0);

    const other = await browser.newContext();
    const kho = await other.newPage();
    await signIn(kho, staff.WAREHOUSE);
    await kho.goto('/#/orders/customers');
    await expect(kho.getByTestId('no-access')).toBeVisible();
    await expect(kho.locator('.sidebar').getByText('Khách hàng', { exact: true })).toHaveCount(0);
    await other.close();
  });

  test('Sale sees own + unassigned customers; assigning away removes it from their list', async ({ page, browser }) => {
    const free = await call('POST', `/shops/${shopId}/customers`, { name: `Khách chưa phân ${run}`, phone: '0938000111' }, await ownerToken());
    await signIn(page, staff.SALE);
    await page.goto('/#/orders/customers');
    await expect(page.getByTestId('sample-banner')).toHaveCount(0);
    await page.getByRole('button', { name: 'Thêm khách hàng' }).click();
    await page.getByLabel('Họ tên').fill(`Nguyễn Minh Anh ${run}`);
    await page.getByLabel('Số điện thoại').fill('0938 000 222');
    await page.getByLabel(/^Nhãn/).fill('Khách mới, VIP');
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();
    const mine = page.getByTestId('customer-row').filter({ hasText: `Nguyễn Minh Anh ${run}` });
    await expect(mine).toContainText('Nhân viên SALE');
    await expect(mine).toContainText('VIP');
    await expect(page.getByTestId('customer-row').filter({ hasText: free.name })).toBeVisible();
    await expect(page.getByLabel(/^Phụ trách của/)).toHaveCount(0); // Sale cannot assign
    await expect(page.getByTitle('Xóa')).toHaveCount(0);

    const other = await browser.newContext();
    const admin = await other.newPage();
    await signIn(admin, owner.user.email);
    await admin.goto('/#/orders/customers');
    const adminRow = admin.getByTestId('customer-row').filter({ hasText: free.name });
    await adminRow.getByLabel(/^Phụ trách của/).selectOption({ label: 'Chủ Dữ Liệu' });
    await expect(adminRow.getByLabel(/^Phụ trách của/)).not.toHaveValue('');
    await other.close();

    await page.reload();
    await expect(page.getByTestId('customer-row').filter({ hasText: `Nguyễn Minh Anh ${run}` })).toBeVisible();
    await expect(page.getByTestId('customer-row').filter({ hasText: free.name })).toHaveCount(0);
  });

  test('pages not moved yet still say they show sample data', async ({ page }) => {
    await signIn(page, owner.user.email);
    for (const path of ['orders/orders', 'orders/stock', 'crm', 'home']) {
      await page.goto(`/#/${path}`);
      await expect(page.getByTestId('sample-banner')).toBeVisible();
    }
  });
});
