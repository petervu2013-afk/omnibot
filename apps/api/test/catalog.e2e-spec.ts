// Step 4B: products, categories and customers in PostgreSQL. Role × route is covered by rbac.e2e-spec.ts.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizePhone } from '../src/catalog/customer.controller.js';
import { PrismaService } from '../src/core/prisma.service.js';
import { createTestApp } from './support/app.js';

const PASSWORD = 'Go-Viet-2026-an-toan';
const run = Date.now().toString(36);
let seq = 0;

describe('catalog and customers', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let shop: string;
  let owner: string;
  let outsiderShop: string;
  let outsider: string;
  let sale: { token: string; memberId: string };
  let sale2: { token: string; memberId: string };
  let managerToken: string;
  let warehouse: string;

  async function register(tag: string) {
    const res = await api()
      .post('/v1/auth/register')
      .send({ fullName: `Người ${tag}`, email: `${tag}.${run}.${++seq}@example.vn`, password: PASSWORD, shopName: `Shop ${tag}`, acceptTerms: true, platform: 'ANDROID' })
      .expect(201);
    return { token: res.body.accessToken as string, userId: res.body.user.id as string, shopId: res.body.shops[0].id as string };
  }
  async function add(role: 'MANAGER' | 'SALE' | 'WAREHOUSE', tag: string) {
    const u = await register(tag);
    const m = await prisma.system.shopMember.create({ data: { shopId: shop, userId: u.userId, role, status: 'ACTIVE' } });
    return { token: u.token, memberId: m.id };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const o = await register('chu');
    owner = o.token;
    shop = o.shopId;
    const x = await register('ngoai');
    outsider = x.token;
    outsiderShop = x.shopId;
    sale = await add('SALE', 'sale');
    sale2 = await add('SALE', 'salehai');
    managerToken = (await add('MANAGER', 'quanly')).token;
    warehouse = (await add('WAREHOUSE', 'kho')).token;
  });
  afterAll(async () => {
    await app?.close();
  });

  const base = () => `/v1/shops/${shop}`;
  const product = (over: Record<string, unknown> = {}) => ({ sku: `SKU-${++seq}`, name: `Bàn gỗ sồi ${seq}`, price: 6500000, ...over });

  describe('categories and products', () => {
    it('creates, reads back with Vietnamese text and money as numbers, updates and deletes', async () => {
      const cat = await api().post(`${base()}/categories`).set(bearer(owner)).send({ name: 'Bàn ăn gỗ', description: 'Gỗ tự nhiên' }).expect(201);
      const p = await api()
        .post(`${base()}/products`)
        .set(bearer(owner))
        .send(product({ categoryId: cat.body.id, costPrice: 4000000, description: 'Gỗ sồi Mỹ' }))
        .expect(201);
      expect(p.body).toMatchObject({ price: 6500000, costPrice: 4000000, categoryId: cat.body.id });
      const got = await api().get(`${base()}/products/${p.body.id}`).set(bearer(sale.token)).expect(200);
      expect(got.body.description).toBe('Gỗ sồi Mỹ');
      const up = await api().patch(`${base()}/products/${p.body.id}`).set(bearer(managerToken)).send({ price: 7000000, active: false }).expect(200);
      expect(up.body).toMatchObject({ price: 7000000, active: false });
      const cats = await api().get(`${base()}/categories`).set(bearer(warehouse)).expect(200);
      expect(cats.body.find((c: { id: string }) => c.id === cat.body.id).productCount).toBe(1);
      await api().delete(`${base()}/categories/${cat.body.id}`).set(bearer(owner)).expect(204);
      expect((await api().get(`${base()}/products/${p.body.id}`).set(bearer(owner))).body.categoryId).toBeNull();
      await api().delete(`${base()}/products/${p.body.id}`).set(bearer(owner)).expect(204);
      await api().get(`${base()}/products/${p.body.id}`).set(bearer(owner)).expect(404);
    });

    it('validates input; SKU is unique per shop, not globally', async () => {
      const sku = `TRUNG-${run}`;
      await api().post(`${base()}/products`).set(bearer(owner)).send(product({ sku })).expect(201);
      const dup = await api().post(`${base()}/products`).set(bearer(owner)).send(product({ sku })).expect(409);
      expect(dup.body.error.code).toBe('SKU_TAKEN');
      await api().post(`/v1/shops/${outsiderShop}/products`).set(bearer(outsider)).send(product({ sku })).expect(201);
      await api()
        .post(`${base()}/products`)
        .set(bearer(owner))
        .send(product({ price: -1 }))
        .expect(400);
      await api()
        .post(`${base()}/products`)
        .set(bearer(owner))
        .send(product({ price: 1.5 }))
        .expect(400);
      await api()
        .post(`${base()}/products`)
        .set(bearer(owner))
        .send(product({ shopId: outsiderShop }))
        .expect(400);
      await api()
        .post(`${base()}/products`)
        .set(bearer(owner))
        .send(product({ categoryId: 'khong-co' }))
        .expect(404);
    });

    it('searches case-insensitively with Vietnamese, and pages with a cursor', async () => {
      await api()
        .post(`${base()}/products`)
        .set(bearer(owner))
        .send(product({ name: 'Sofa Góc Chữ L đặc biệt' }))
        .expect(201);
      const found = await api().get(`${base()}/products`).query({ q: 'góc chữ l' }).set(bearer(owner)).expect(200);
      expect(found.body.items.map((p: { name: string }) => p.name)).toEqual(['Sofa Góc Chữ L đặc biệt']);
      const first = await api().get(`${base()}/products`).query({ limit: 1 }).set(bearer(owner)).expect(200);
      expect(first.body.items).toHaveLength(1);
      const next = await api().get(`${base()}/products`).query({ limit: 1, cursor: first.body.nextCursor }).set(bearer(owner)).expect(200);
      expect(next.body.items[0].id).not.toBe(first.body.items[0].id);
    });

    it('imports a scanned list: updates matches, creates the rest and missing categories', async () => {
      const sku = `IMP-${run}`;
      const existing = await api().post(`${base()}/products`).set(bearer(owner)).send(product({ sku })).expect(201);
      const res = await api()
        .post(`${base()}/products/import`)
        .set(bearer(owner))
        .send({
          items: [
            { sku, name: 'Tên đã cập nhật', price: 100000 },
            { name: `Kệ mới ${run}`, category: `Kệ ${run}`, price: 200000 },
          ],
        })
        .expect(201);
      expect(res.body).toEqual({ created: 1, updated: 1 });
      expect((await api().get(`${base()}/products/${existing.body.id}`).set(bearer(owner))).body).toMatchObject({ name: 'Tên đã cập nhật', price: 100000 });
      const cats = await api().get(`${base()}/categories`).set(bearer(owner));
      expect(cats.body.some((c: { name: string }) => c.name === `Kệ ${run}`)).toBe(true);
    });

    it('a product already on an order cannot be deleted', async () => {
      const p = await api().post(`${base()}/products`).set(bearer(owner)).send(product()).expect(201);
      const c = await prisma.db.customer.create({ data: { shopId: shop, name: 'Khách đơn' } });
      const order = await prisma.db.order.create({ data: { shopId: shop, code: `DH-${run}`, customerId: c.id, createdBySource: 'web_shop', subtotal: 1, total: 1 } as never });
      await prisma.system.orderItem.create({ data: { orderId: order.id, productId: p.body.id, qty: 1, price: 1 } });
      const res = await api().delete(`${base()}/products/${p.body.id}`).set(bearer(owner)).expect(409);
      expect(res.body.error.code).toBe('PRODUCT_IN_USE');
      expect((await api().delete(`${base()}/customers/${c.id}`).set(bearer(owner))).body.error.code).toBe('CUSTOMER_IN_USE');
    });

    it('cannot reach another shop rows through own shop', async () => {
      const theirs = await api().post(`/v1/shops/${outsiderShop}/products`).set(bearer(outsider)).send(product()).expect(201);
      const theirCat = await api().post(`/v1/shops/${outsiderShop}/categories`).set(bearer(outsider)).send({ name: 'Của họ' }).expect(201);
      await api().get(`${base()}/products/${theirs.body.id}`).set(bearer(owner)).expect(404);
      await api().patch(`${base()}/products/${theirs.body.id}`).set(bearer(owner)).send({ price: 1 }).expect(404);
      await api().delete(`${base()}/products/${theirs.body.id}`).set(bearer(owner)).expect(404);
      await api().delete(`${base()}/categories/${theirCat.body.id}`).set(bearer(owner)).expect(404);
      await api()
        .post(`${base()}/products`)
        .set(bearer(owner))
        .send(product({ categoryId: theirCat.body.id }))
        .expect(404);
      const mine = await api().get(`${base()}/products`).query({ limit: 200 }).set(bearer(owner));
      expect(mine.body.items.map((p: { id: string }) => p.id)).not.toContain(theirs.body.id);
    });

    it('writes before and after to the audit log', async () => {
      const p = await api()
        .post(`${base()}/products`)
        .set(bearer(owner))
        .send(product({ price: 100 }))
        .expect(201);
      await api().patch(`${base()}/products/${p.body.id}`).set(bearer(owner)).send({ price: 200 }).expect(200);
      const log = await api().get(`${base()}/audit-logs`).query({ action: 'product.update', entityId: p.body.id }).set(bearer(owner)).expect(200);
      expect(log.body.items[0]).toMatchObject({ before: { price: 100 }, after: { price: 200 } });
    });
  });

  describe('customers', () => {
    it('normalises phone numbers', () => {
      expect(normalizePhone('0938 123 456')).toBe('+84938123456');
      expect(normalizePhone('+84938123456')).toBe('+84938123456');
      expect(normalizePhone('84938123456')).toBe('+84938123456');
      expect(normalizePhone('12345')).toBeNull();
    });

    const phone = () => `09${String(++seq).padStart(2, '0')}${String(Date.now()).slice(-6)}`;

    it('Sale owns what they add; another format of the same phone is a duplicate', async () => {
      const p = phone();
      const res = await api()
        .post(`${base()}/customers`)
        .set(bearer(sale.token))
        .send({ name: 'Nguyễn Minh Anh', phone: p, tags: ['Khách mới'] })
        .expect(201);
      expect(res.body).toMatchObject({ ownerId: sale.memberId, stage: 'NEW', tags: ['Khách mới'] });
      expect(res.body.ownerName).toContain('Người sale');
      const dup = await api()
        .post(`${base()}/customers`)
        .set(bearer(owner))
        .send({ name: 'Trùng', phone: `+84${p.slice(1)}` })
        .expect(409);
      expect(dup.body.error.code).toBe('CUSTOMER_EXISTS');
      await api().post(`${base()}/customers`).set(bearer(owner)).send({ name: 'Sai số', phone: '123' }).expect(400);
    });

    it('a client cannot set the owner or shop through create or update', async () => {
      await api().post(`${base()}/customers`).set(bearer(sale.token)).send({ name: 'X', ownerId: 'ai-do' }).expect(400);
      const c = await api().post(`${base()}/customers`).set(bearer(sale.token)).send({ name: 'Y' }).expect(201);
      await api().patch(`${base()}/customers/${c.body.id}`).set(bearer(sale.token)).send({ ownerId: sale2.memberId }).expect(400);
      await api().patch(`${base()}/customers/${c.body.id}`).set(bearer(sale.token)).send({ shopId: outsiderShop }).expect(400);
    });

    it('applies the Sale data scope on list, read, update and delete, in all three modes', async () => {
      const tag = `tam-${run}`;
      const mk = async (name: string, ownerId: string | null) => prisma.db.customer.create({ data: { shopId: shop, name: `${name} ${tag}`, ownerId } });
      const mine = await mk('Của tôi', sale.memberId);
      const other = await mk('Của người khác', sale2.memberId);
      const free = await mk('Chưa phân', null);
      const names = async () => {
        const res = await api().get(`${base()}/customers`).query({ q: tag }).set(bearer(sale.token)).expect(200);
        return res.body.items.map((c: { id: string }) => c.id).sort();
      };
      const setScope = (saleDataScope: string) => api().patch(base()).set(bearer(owner)).send({ saleDataScope }).expect(200);

      await setScope('OWN');
      expect(await names()).toEqual([mine.id]);
      await api().get(`${base()}/customers/${free.id}`).set(bearer(sale.token)).expect(404);
      await api().get(`${base()}/customers/${other.id}`).set(bearer(sale.token)).expect(404);

      await setScope('OWN_UNASSIGNED');
      expect(await names()).toEqual([mine.id, free.id].sort());
      await api().get(`${base()}/customers/${free.id}`).set(bearer(sale.token)).expect(200);
      await api().get(`${base()}/customers/${other.id}`).set(bearer(sale.token)).expect(404);
      await api().patch(`${base()}/customers/${other.id}`).set(bearer(sale.token)).send({ name: 'hacked' }).expect(404);
      expect((await prisma.db.customer.findFirstOrThrow({ where: { shopId: shop, id: other.id } })).name).not.toBe('hacked');

      await setScope('ALL');
      expect(await names()).toEqual([mine.id, other.id, free.id].sort());
      await setScope('OWN_UNASSIGNED');

      const asOwner = await api().get(`${base()}/customers`).query({ q: tag }).set(bearer(managerToken)).expect(200);
      expect(asOwner.body.items).toHaveLength(3);
    });

    it('assigning is for managers and only to active members of this shop', async () => {
      const c = await api().post(`${base()}/customers`).set(bearer(owner)).send({ name: 'Cần phân' }).expect(201);
      await api().get(`${base()}/customers/${c.body.id}`).set(bearer(owner)).expect(200);
      await api().post(`${base()}/customers/${c.body.id}/assign`).set(bearer(sale.token)).send({ ownerId: sale.memberId }).expect(403);
      const assigned = await api().post(`${base()}/customers/${c.body.id}/assign`).set(bearer(managerToken)).send({ ownerId: sale2.memberId }).expect(201);
      expect(assigned.body.ownerName).toContain('Người salehai');
      const foreign = await prisma.system.shopMember.findFirstOrThrow({ where: { shopId: outsiderShop } });
      await api().post(`${base()}/customers/${c.body.id}/assign`).set(bearer(owner)).send({ ownerId: foreign.id }).expect(404);
      await api().post(`${base()}/customers/${c.body.id}/assign`).set(bearer(owner)).send({ ownerId: null }).expect(201);
    });

    it('stage changes are timed; delete is for managers; history stays out of the log', async () => {
      const name = `Xóa dữ liệu ${run}`;
      const c = await api().post(`${base()}/customers`).set(bearer(owner)).send({ name }).expect(201);
      const before = await prisma.db.customer.findFirstOrThrow({ where: { shopId: shop, id: c.body.id } });
      await api().patch(`${base()}/customers/${c.body.id}`).set(bearer(owner)).send({ stage: 'QUOTED' }).expect(200);
      const after = await prisma.db.customer.findFirstOrThrow({ where: { shopId: shop, id: c.body.id } });
      expect(after.stageChangedAt.getTime()).toBeGreaterThan(before.stageChangedAt.getTime());
      await api().delete(`${base()}/customers/${c.body.id}`).set(bearer(managerToken)).expect(204);
      const log = await api().get(`${base()}/audit-logs`).query({ action: 'customer.delete', entityId: c.body.id }).set(bearer(owner)).expect(200);
      expect(JSON.stringify(log.body.items[0].before)).not.toContain(name);
    });

    it('other shop customers are unreachable; Warehouse has no access', async () => {
      const theirs = await api().post(`/v1/shops/${outsiderShop}/customers`).set(bearer(outsider)).send({ name: 'Khách shop khác' }).expect(201);
      await api().get(`${base()}/customers/${theirs.body.id}`).set(bearer(owner)).expect(404);
      await api().delete(`${base()}/customers/${theirs.body.id}`).set(bearer(owner)).expect(404);
      await api().get(`/v1/shops/${outsiderShop}/customers`).set(bearer(owner)).expect(404);
      await api().get(`${base()}/customers`).set(bearer(warehouse)).expect(403);
    });
  });
});
