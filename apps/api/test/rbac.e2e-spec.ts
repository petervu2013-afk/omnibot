// Step 3 gate. The role × API table is generated from the real controllers, so a new route is tested automatically,
// and a route without @Permission / @Audit fails here. Also: cross-shop access, data scope, members, audit log.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/core/prisma.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { AuditLogController } from '../src/shop/audit-log.controller.js';
import { AUDIT_KEY } from '../src/shop/audit.interceptor.js';
import { dataScope } from '../src/shop/data-scope.js';
import { PERMISSION_KEY } from '../src/shop/permission.guard.js';
import { type Permission, PERMISSIONS } from '../src/shop/permissions.js';
import { ShopController } from '../src/shop/shop.controller.js';
import { createTestApp } from './support/app.js';

const PASSWORD = 'Go-Viet-2026-an-toan';
const VERBS = ['get', 'post', 'put', 'delete', 'patch'] as const; // index = Nest RequestMethod
const run = Date.now().toString(36);
let seq = 0;

interface Route {
  verb: (typeof VERBS)[number];
  path: string;
  permission?: Permission;
  audit?: string;
}

function shopRoutes(): Route[] {
  return [ShopController, AuditLogController].flatMap((ctrl) => {
    const base = Reflect.getMetadata('path', ctrl) as string;
    return Object.getOwnPropertyNames(ctrl.prototype)
      .map((name) => (ctrl.prototype as unknown as Record<string, object>)[name]!)
      .filter((fn) => Reflect.getMetadata('method', fn) !== undefined)
      .map((fn) => ({
        verb: VERBS[Reflect.getMetadata('method', fn) as number]!,
        path: `/v1/${base}/${(Reflect.getMetadata('path', fn) as string).replace(/^\//, '')}`.replace(/\/$/, ''),
        permission: Reflect.getMetadata(PERMISSION_KEY, fn) as Permission | undefined,
        audit: Reflect.getMetadata(AUDIT_KEY, fn) as string | undefined,
      }))
      .filter((r) => r.path.includes(':shopId'));
  });
}

describe('RBAC', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: MailService;
  const api = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  interface Actor {
    token: string;
    userId: string;
    email: string;
    memberId: string;
  }
  let shopId: string;
  let otherShopId: string;
  const actors = {} as Record<'owner' | 'admin' | 'manager' | 'sale' | 'warehouse' | 'outsider', Actor>;

  const newEmail = (tag: string) => `${tag}.${run}.${++seq}@example.vn`;

  async function register(tag: string) {
    const email = newEmail(tag);
    const res = await api()
      .post('/v1/auth/register')
      .send({ fullName: `Người ${tag}`, email, password: PASSWORD, shopName: `Shop ${tag}`, acceptTerms: true, platform: 'ANDROID' })
      .expect(201);
    return { token: res.body.accessToken as string, userId: res.body.user.id as string, email, shopId: res.body.shops[0].id as string };
  }

  async function addMember(shop: string, role: 'ADMIN' | 'MANAGER' | 'SALE' | 'WAREHOUSE', tag: string): Promise<Actor> {
    const u = await register(tag);
    const m = await prisma.system.shopMember.create({ data: { shopId: shop, userId: u.userId, role, status: 'ACTIVE' } });
    return { token: u.token, userId: u.userId, email: u.email, memberId: m.id };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    mail = app.get(MailService);
    const owner = await register('owner');
    shopId = owner.shopId;
    const ownerMember = await prisma.system.shopMember.findFirstOrThrow({ where: { shopId, userId: owner.userId } });
    actors.owner = { token: owner.token, userId: owner.userId, email: owner.email, memberId: ownerMember.id };
    actors.admin = await addMember(shopId, 'ADMIN', 'admin');
    actors.manager = await addMember(shopId, 'MANAGER', 'manager');
    actors.sale = await addMember(shopId, 'SALE', 'sale');
    actors.warehouse = await addMember(shopId, 'WAREHOUSE', 'warehouse');
    const outsider = await register('outsider');
    otherShopId = outsider.shopId;
    const outsiderMember = await prisma.system.shopMember.findFirstOrThrow({ where: { shopId: otherShopId } });
    actors.outsider = { token: outsider.token, userId: outsider.userId, email: outsider.email, memberId: outsiderMember.id };
  });
  afterAll(async () => {
    await app?.close();
  });

  const call = (r: Route, token: string, shop = shopId) => {
    const url = r.path.replace(':shopId', shop).replace(':memberId', 'khong-co').replace(':invitationId', 'khong-co');
    return api()[r.verb](url).set(bearer(token));
  };

  const routes = shopRoutes();

  it('finds the routes, and each has a permission; each change is audited', () => {
    expect(routes.length).toBeGreaterThanOrEqual(11);
    expect(routes.filter((r) => !r.permission).map((r) => r.path)).toEqual([]);
    expect(routes.filter((r) => r.verb !== 'get' && !r.audit).map((r) => r.path)).toEqual([]);
  });

  describe('role × API', () => {
    const roles = { owner: 'ADMIN', admin: 'ADMIN', manager: 'MANAGER', sale: 'SALE', warehouse: 'WAREHOUSE' } as const;
    for (const r of shopRoutes()) {
      for (const [actor, role] of Object.entries(roles) as [keyof typeof roles, (typeof roles)[keyof typeof roles]][]) {
        const allowed = (PERMISSIONS[r.permission!] as readonly string[]).includes(role) && (r.permission !== 'shop.owner' || actor === 'owner');
        it(`${r.verb.toUpperCase()} ${r.path} – ${actor}: ${allowed ? 'được' : '403'}`, async () => {
          // Allowed calls use an empty body and unknown ids, so they stop at 200/400/404 and change nothing.
          const res = await call(r, actors[actor].token);
          if (allowed) {
            expect([200, 400, 404]).toContain(res.status);
            expect(res.body.error?.code).not.toBe('SHOP_NOT_FOUND');
          } else {
            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('PERMISSION_DENIED');
          }
        });
      }
      it(`${r.verb.toUpperCase()} ${r.path} – người ngoài shop: 404, chưa đăng nhập: 401`, async () => {
        const res = await call(r, actors.outsider.token);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('SHOP_NOT_FOUND');
        const url = r.path.replace(':shopId', shopId).replace(':memberId', 'x').replace(':invitationId', 'x');
        await api()[r.verb](url).expect(401);
      });
    }
  });

  describe('cross-shop', () => {
    it('an Admin of shop A cannot touch members or invitations of shop B through A', async () => {
      const victim = await addMember(otherShopId, 'SALE', 'victim');
      await api().patch(`/v1/shops/${shopId}/members/${victim.memberId}`).set(bearer(actors.owner.token)).send({ status: 'DISABLED' }).expect(404);
      await api().delete(`/v1/shops/${shopId}/members/${victim.memberId}`).set(bearer(actors.owner.token)).expect(404);
      const inv = await api()
        .post(`/v1/shops/${otherShopId}/invitations`)
        .set(bearer(actors.outsider.token))
        .send({ email: newEmail('x'), role: 'SALE' })
        .expect(201);
      await api().delete(`/v1/shops/${shopId}/invitations/${inv.body.id}`).set(bearer(actors.owner.token)).expect(404);
      await api().post(`/v1/shops/${shopId}/transfer-owner`).set(bearer(actors.owner.token)).send({ memberId: victim.memberId, password: PASSWORD }).expect(404);
      expect((await prisma.system.shopMember.findUniqueOrThrow({ where: { id: victim.memberId } })).status).toBe('ACTIVE');
    });

    it('lists only the shop own members and audit entries', async () => {
      const members = await api().get(`/v1/shops/${shopId}/members`).set(bearer(actors.owner.token)).expect(200);
      expect(members.body.map((m: { email: string }) => m.email)).not.toContain(actors.outsider.email);
      await api().patch(`/v1/shops/${otherShopId}`).set(bearer(actors.outsider.token)).send({ hotline: '0900000000' }).expect(200);
      const logs = await api().get(`/v1/shops/${shopId}/audit-logs?limit=200`).set(bearer(actors.owner.token)).expect(200);
      expect(logs.body.items.every((x: { shopId: string }) => x.shopId === shopId)).toBe(true);
      const own = await api().get(`/v1/shops/${otherShopId}/audit-logs?action=shop.update`).set(bearer(actors.outsider.token)).expect(200);
      expect(own.body.items.length).toBeGreaterThan(0);
    });

    it('one account works in several shops with different roles, without logging in again', async () => {
      const m = await prisma.system.shopMember.create({ data: { shopId: otherShopId, userId: actors.sale.userId, role: 'MANAGER', status: 'ACTIVE' } });
      const mine = await api().get('/v1/shops').set(bearer(actors.sale.token)).expect(200);
      const roles = Object.fromEntries(mine.body.map((s: { id: string; role: string }) => [s.id, s.role]));
      expect(roles[shopId]).toBe('SALE');
      expect(roles[otherShopId]).toBe('MANAGER');
      await api().get(`/v1/shops/${shopId}/members`).set(bearer(actors.sale.token)).expect(403);
      await api().get(`/v1/shops/${otherShopId}/members`).set(bearer(actors.sale.token)).expect(200);
      await prisma.system.shopMember.delete({ where: { id: m.id } });
    });
  });

  describe('AUTH-09 data scope against PostgreSQL', () => {
    it('Sale sees all / own / own + unassigned according to the shop setting', async () => {
      const { db } = prisma;
      const sale = actors.sale.memberId;
      await db.customer.createMany({
        data: [
          { shopId, name: 'Của sale', ownerId: sale },
          { shopId, name: 'Của manager', ownerId: actors.manager.memberId },
          { shopId, name: 'Chưa phân' },
        ],
      });
      const names = async (scope: 'ALL' | 'OWN' | 'OWN_UNASSIGNED') => {
        await api().patch(`/v1/shops/${shopId}`).set(bearer(actors.owner.token)).send({ saleDataScope: scope }).expect(200);
        const shop = await db.shop.findUniqueOrThrow({ where: { id: shopId } });
        const rows = await db.customer.findMany({ where: { shopId, ...dataScope({ id: sale, role: 'SALE', saleDataScope: shop.saleDataScope }, 'customer') } });
        return rows.map((r) => r.name).sort();
      };
      expect(await names('ALL')).toEqual(['Chưa phân', 'Của manager', 'Của sale']);
      expect(await names('OWN')).toEqual(['Của sale']);
      expect(await names('OWN_UNASSIGNED')).toEqual(['Chưa phân', 'Của sale']);
    });
  });

  describe('AUTH-07 invitations and members', () => {
    const inviteToken = (to: string) => {
      const m = [...mail.outbox].reverse().find((x) => x.to === to && x.text.includes('#/invite?token='));
      return m!.text.match(/token=([\w-]+)/)![1]!;
    };

    it('a new person accepts the invitation, gets the role and can log in; the link works once', async () => {
      const email = newEmail('moi');
      const inv = await api().post(`/v1/shops/${shopId}/invitations`).set(bearer(actors.owner.token)).send({ email, role: 'WAREHOUSE' }).expect(201);
      expect(inv.body.tokenHash).toBeUndefined();
      const token = inviteToken(email);
      const preview = await api().post('/v1/invitations/preview').send({ token }).expect(200);
      expect(preview.body).toMatchObject({ email, role: 'WAREHOUSE', hasAccount: false });
      const noName = await api().post('/v1/invitations/accept').send({ token, password: PASSWORD }).expect(400);
      expect(noName.body.error.code).toBe('VALIDATION_FAILED');
      expect((await api().post('/v1/invitations/accept').send({ token, password: '12345678', fullName: 'Thủ Kho' })).body.error.code).toBe('WEAK_PASSWORD');
      await api().post('/v1/invitations/accept').send({ token, password: PASSWORD, fullName: 'Thủ Kho' }).expect(200);
      const login = await api().post('/v1/auth/login').send({ email, password: PASSWORD, platform: 'ANDROID' }).expect(200);
      expect(login.body.user.emailVerifiedAt).not.toBeNull();
      expect(login.body.shops).toEqual([expect.objectContaining({ id: shopId, role: 'WAREHOUSE' })]);
      expect((await api().post('/v1/invitations/accept').send({ token, password: PASSWORD, fullName: 'Thủ Kho' })).body.error.code).toBe('INVITE_INVALID');
    });

    it('an existing account must confirm its password', async () => {
      const u = await register('cosan');
      await api().post(`/v1/shops/${shopId}/invitations`).set(bearer(actors.owner.token)).send({ email: u.email, role: 'SALE' }).expect(201);
      const token = inviteToken(u.email);
      expect((await api().post('/v1/invitations/preview').send({ token })).body.hasAccount).toBe(true);
      await api().post('/v1/invitations/accept').send({ token, password: 'Sai-mat-khau-1' }).expect(401);
      await api().post('/v1/invitations/accept').send({ token, password: PASSWORD }).expect(200);
      await api().get(`/v1/shops/${shopId}`).set(bearer(u.token)).expect(200);
      const dup = await api().post(`/v1/shops/${shopId}/invitations`).set(bearer(actors.owner.token)).send({ email: u.email, role: 'SALE' }).expect(409);
      expect(dup.body.error.code).toBe('ALREADY_MEMBER');
    });

    it('re-inviting replaces the old link; cancelled and expired links stop working; Admin cannot be invited', async () => {
      const email = newEmail('lai');
      await api().post(`/v1/shops/${shopId}/invitations`).set(bearer(actors.owner.token)).send({ email, role: 'SALE' }).expect(201);
      const first = inviteToken(email);
      const second = await api().post(`/v1/shops/${shopId}/invitations`).set(bearer(actors.owner.token)).send({ email, role: 'MANAGER' }).expect(201);
      await api().post('/v1/invitations/preview').send({ token: first }).expect(400);
      const token = inviteToken(email);
      await prisma.system.invitation.update({ where: { id: second.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await api().post('/v1/invitations/preview').send({ token }).expect(400);
      await prisma.system.invitation.update({ where: { id: second.body.id }, data: { expiresAt: new Date(Date.now() + 60_000) } });
      await api().delete(`/v1/shops/${shopId}/invitations/${second.body.id}`).set(bearer(actors.owner.token)).expect(204);
      await api().post('/v1/invitations/preview').send({ token }).expect(400);
      await api().post(`/v1/shops/${shopId}/invitations`).set(bearer(actors.owner.token)).send({ email, role: 'ADMIN' }).expect(400);
    });

    it('disabling or changing a role applies on the next request; owner and self are protected', async () => {
      const m = await addMember(shopId, 'SALE', 'khoa');
      const owner = bearer(actors.owner.token);
      await api().get(`/v1/shops/${shopId}`).set(bearer(m.token)).expect(200);
      await api().patch(`/v1/shops/${shopId}/members/${m.memberId}`).set(owner).send({ status: 'DISABLED' }).expect(200);
      expect((await api().get(`/v1/shops/${shopId}`).set(bearer(m.token))).body.error.code).toBe('SHOP_NOT_FOUND');
      await api().patch(`/v1/shops/${shopId}/members/${m.memberId}`).set(owner).send({ status: 'ACTIVE', role: 'MANAGER' }).expect(200);
      await api().get(`/v1/shops/${shopId}/members`).set(bearer(m.token)).expect(200);
      const onOwner = await api().patch(`/v1/shops/${shopId}/members/${actors.owner.memberId}`).set(bearer(actors.admin.token)).send({ status: 'DISABLED' }).expect(409);
      expect(onOwner.body.error.code).toBe('OWNER_PROTECTED');
      const onSelf = await api().patch(`/v1/shops/${shopId}/members/${actors.admin.memberId}`).set(bearer(actors.admin.token)).send({ role: 'SALE' }).expect(409);
      expect(onSelf.body.error.code).toBe('CANNOT_EDIT_SELF');
      await api().patch(`/v1/shops/${shopId}/members/${m.memberId}`).set(owner).send({ isOwner: true }).expect(400);
    });

    it('removing a member unassigns their customers', async () => {
      const m = await addMember(shopId, 'SALE', 'xoa');
      const c = await prisma.db.customer.create({ data: { shopId, name: 'Khách của người nghỉ', ownerId: m.memberId } });
      await api().delete(`/v1/shops/${shopId}/members/${m.memberId}`).set(bearer(actors.owner.token)).expect(204);
      expect((await prisma.db.customer.findFirstOrThrow({ where: { shopId, id: c.id } })).ownerId).toBeNull();
      await api().get(`/v1/shops/${shopId}`).set(bearer(m.token)).expect(404);
    });
  });

  describe('ownership', () => {
    it('transfers the shop, after which the old owner may delete their account; the new owner can delete the shop', async () => {
      const a = await register('chu');
      const b = await addMember(a.shopId, 'SALE', 'nhan');
      const blocked = await api().post('/v1/auth/delete-account').set(bearer(a.token)).send({ password: PASSWORD }).expect(409);
      expect(blocked.body.error.code).toBe('OWNER_MUST_TRANSFER');
      await api().post(`/v1/shops/${a.shopId}/transfer-owner`).set(bearer(a.token)).send({ memberId: b.memberId, password: 'Sai-mat-khau-1' }).expect(400);
      await api().post(`/v1/shops/${a.shopId}/transfer-owner`).set(bearer(a.token)).send({ memberId: b.memberId, password: PASSWORD }).expect(204);
      const shop = await api().get(`/v1/shops/${a.shopId}`).set(bearer(b.token)).expect(200);
      expect(shop.body.ownerId).toBe(b.userId);
      const list = await api().get('/v1/shops').set(bearer(b.token)).expect(200);
      expect(list.body.find((s: { id: string }) => s.id === a.shopId)).toMatchObject({ role: 'ADMIN', isOwner: true });
      await api().delete(`/v1/shops/${a.shopId}`).set(bearer(a.token)).send({ password: PASSWORD }).expect(403);
      await api().post('/v1/auth/delete-account').set(bearer(a.token)).send({ password: PASSWORD }).expect(202);
      await api().delete(`/v1/shops/${a.shopId}`).set(bearer(b.token)).send({ password: PASSWORD }).expect(204);
      await api().get(`/v1/shops/${a.shopId}`).set(bearer(b.token)).expect(404);
    });

    it('a user can create a further shop and becomes its Admin', async () => {
      const res = await api().post('/v1/shops').set(bearer(actors.manager.token)).send({ name: 'Chi nhánh mới' }).expect(201);
      expect(res.body).toMatchObject({ role: 'ADMIN', isOwner: true });
      await api().get(`/v1/shops/${res.body.id}/members`).set(bearer(actors.manager.token)).expect(200);
    });
  });

  describe('SET-03 audit log', () => {
    it('records who, what, before and after; failed requests are not logged', async () => {
      const m = await addMember(shopId, 'SALE', 'log');
      await api().patch(`/v1/shops/${shopId}/members/${m.memberId}`).set(bearer(actors.owner.token)).send({ role: 'WAREHOUSE' }).expect(200);
      await api().patch(`/v1/shops/${shopId}/members/khong-co`).set(bearer(actors.owner.token)).send({ role: 'SALE' }).expect(404);
      const logs = await api().get(`/v1/shops/${shopId}/audit-logs?action=member.update&entityId=${m.memberId}`).set(bearer(actors.manager.token)).expect(200);
      expect(logs.body.items).toHaveLength(1);
      expect(logs.body.items[0]).toMatchObject({ actorId: actors.owner.userId, actor: { email: actors.owner.email }, before: { role: 'SALE' }, after: { role: 'WAREHOUSE' } });
      expect(logs.body.items[0].ip).toBeTruthy();
      const failed = await api().get(`/v1/shops/${shopId}/audit-logs?entityId=khong-co`).set(bearer(actors.owner.token)).expect(200);
      expect(failed.body.items).toEqual([]);
    });

    it('pages with a cursor, filters by date and exports CSV', async () => {
      const first = await api().get(`/v1/shops/${shopId}/audit-logs?limit=2`).set(bearer(actors.owner.token)).expect(200);
      expect(first.body.items).toHaveLength(2);
      const next = await api().get(`/v1/shops/${shopId}/audit-logs?limit=2&cursor=${first.body.nextCursor}`).set(bearer(actors.owner.token)).expect(200);
      expect(next.body.items[0].id).not.toBe(first.body.items[0].id);
      const future = await api().get(`/v1/shops/${shopId}/audit-logs?from=2100-01-01`).set(bearer(actors.owner.token)).expect(200);
      expect(future.body.items).toEqual([]);
      const csv = await api().get(`/v1/shops/${shopId}/audit-logs/export`).set(bearer(actors.owner.token)).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('member.update');
    });

    it('has no change API, and the database itself refuses update and delete', async () => {
      const r = await api().patch(`/v1/shops/${shopId}/audit-logs/x`).set(bearer(actors.owner.token)).send({});
      expect(r.status).toBe(404);
      const row = await prisma.system.auditLog.findFirstOrThrow({ where: { shopId } });
      await expect(prisma.system.auditLog.update({ where: { id: row.id }, data: { action: 'hacked' } })).rejects.toThrow(/append-only/);
      await expect(prisma.system.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
      await expect(prisma.system.$executeRawUnsafe('TRUNCATE "AuditLog"')).rejects.toThrow(/append-only/);
    });
  });
});
