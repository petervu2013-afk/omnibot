// Step 6 gate (ID-01): one person writing from several channels ends up with one profile and its whole history;
// merges never lose data, never cross shops, and can be undone exactly.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityService } from '../src/catalog/identity.service.js';
import { PrismaService } from '../src/core/prisma.service.js';
import { InboxService } from '../src/inbox/inbox.service.js';
import { createTestApp } from './support/app.js';

const PASSWORD = 'Go-Viet-2026-an-toan';
const run = Date.now().toString(36);
let seq = 0;
const uniq = () => `${run}-${++seq}`;
/** A valid, unique Vietnamese mobile number for each call. */
let phoneSeq = Number(String(Date.now()).slice(-6));
const phone = () => `09${String(++phoneSeq).padStart(8, '0').slice(-8)}`;

describe('Customer identity (Step 6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inbox: InboxService;
  let identity: IdentityService;
  const api = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let shopId: string;
  let owner: string;
  let manager: string;
  let sale: { token: string; memberId: string };
  let other: { token: string; shopId: string };
  let facebook: string;
  let zalo: string;
  let web: string;

  async function register(tag: string) {
    const res = await api()
      .post('/v1/auth/register')
      .send({ fullName: `Người ${tag}`, email: `${tag}.${uniq()}@example.vn`, password: PASSWORD, shopName: `Shop ${tag}`, acceptTerms: true, platform: 'ANDROID' })
      .expect(201);
    return { token: res.body.accessToken as string, userId: res.body.user.id as string, shopId: res.body.shops[0].id as string };
  }
  async function member(role: 'MANAGER' | 'SALE', tag: string) {
    const u = await register(tag);
    const m = await prisma.system.shopMember.create({ data: { shopId, userId: u.userId, role, status: 'ACTIVE' } });
    return { token: u.token, memberId: m.id };
  }
  const channel = async (shop: string, platform: 'FACEBOOK' | 'ZALO_OA' | 'WEBCHAT') =>
    (await prisma.system.channel.create({ data: { shopId: shop, platform, externalId: `${platform}-${uniq()}`, name: platform } })).id;
  /** A customer writing on a channel; returns the profile the message landed on. */
  async function writes(channelId: string, opts: { user?: string; name?: string; phone?: string; email?: string; shop?: string; platform?: 'FACEBOOK' | 'ZALO_OA' | 'WEBCHAT' } = {}) {
    const res = await inbox.receiveInbound({
      shopId: opts.shop ?? shopId,
      channelId,
      platform: opts.platform ?? 'FACEBOOK',
      externalUserId: opts.user ?? `u-${uniq()}`,
      externalMessageId: `m-${uniq()}`,
      text: 'Chào shop',
      displayName: opts.name,
      profile: opts.phone || opts.email ? { phone: opts.phone, email: opts.email } : undefined,
    });
    const conv = await prisma.system.conversation.findUniqueOrThrow({ where: { id: res!.conversation.id } });
    return { customerId: conv.customerId, conversationId: conv.id };
  }
  const customer = (id: string) => prisma.system.customer.findUniqueOrThrow({ where: { id } });
  const createCustomer = async (body: Record<string, unknown>, token = owner) => (await api().post(`/v1/shops/${shopId}/customers`).set(bearer(token)).send(body).expect(201)).body as { id: string };
  const order = (customerId: string, total = 1_500_000) => prisma.system.order.create({ data: { shopId, code: `DH-${uniq()}`, customerId, createdBySource: 'agent', subtotal: total, total } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    inbox = app.get(InboxService);
    identity = app.get(IdentityService);
    const o = await register('owner');
    owner = o.token;
    shopId = o.shopId;
    manager = (await member('MANAGER', 'quanly')).token;
    sale = await member('SALE', 'sale');
    other = await register('other');
    await prisma.system.shop.update({ where: { id: shopId }, data: { saleDataScope: 'OWN' } });
    [facebook, zalo, web] = await Promise.all([channel(shopId, 'FACEBOOK'), channel(shopId, 'ZALO_OA'), channel(shopId, 'WEBCHAT')]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it('the database keeps an accent- and case-free name key', async () => {
    const a = await createCustomer({ name: 'Nguyễn Văn  Ần' });
    const b = await createCustomer({ name: 'ĐẶNG THỊ HỒNG' });
    expect((await customer(a.id)).nameKey).toBe('nguyen van an');
    expect((await customer(b.id)).nameKey).toBe('dang thi hong');
    await api().patch(`/v1/shops/${shopId}/customers/${b.id}`).set(bearer(owner)).send({ name: 'Đặng Thị Hồng Nhung' }).expect(200);
    expect((await customer(b.id)).nameKey).toBe('dang thi hong nhung');
  });

  it('GATE: the same phone from Facebook and Zalo → one profile with all purchases and conversations', async () => {
    const number = phone();
    const fb = await writes(facebook, { name: 'Lê Minh Tâm' });
    // Staff learn the phone in the Facebook chat and save it on the profile; the customer buys.
    await api()
      .patch(`/v1/shops/${shopId}/customers/${fb.customerId}`)
      .set(bearer(owner))
      .send({ phone: number, tags: ['Mua sofa'] })
      .expect(200);
    await order(fb.customerId, 12_500_000);
    await prisma.system.activity.create({ data: { shopId, customerId: fb.customerId, type: 'note', text: 'Thích gỗ sồi' } });

    // Weeks later the same person writes on Zalo, which shares the phone (written differently).
    const za = await writes(zalo, { name: 'Tâm Lê', phone: `+84 ${number.slice(1, 4)} ${number.slice(4)}`, platform: 'ZALO_OA' });
    expect(za.customerId).toBe(fb.customerId);

    const profile = (await api().get(`/v1/shops/${shopId}/customers/${fb.customerId}/profile`).set(bearer(owner)).expect(200)).body;
    expect(profile.identities.map((i: { channel: { platform: string } }) => i.channel.platform).sort()).toEqual(['FACEBOOK', 'ZALO_OA']);
    expect(profile.conversations.map((c: { id: string }) => c.id).sort()).toEqual([fb.conversationId, za.conversationId].sort());
    expect(profile.orders).toEqual({ count: 1, total: 12_500_000 });
    expect(await prisma.system.activity.count({ where: { customerId: fb.customerId } })).toBe(1);
    expect(profile.merges).toEqual([expect.objectContaining({ matchedBy: 'phone', auto: true, fromName: 'Tâm Lê' })]);
    // One profile in the list; the merged one is gone from lists and direct reads.
    const list = (
      await api()
        .get(`/v1/shops/${shopId}/customers?q=${number.slice(-6)}`)
        .set(bearer(owner))
        .expect(200)
    ).body.items;
    expect(list.map((c: { id: string }) => c.id)).toEqual([fb.customerId]);
    const merged = profile.merges[0].fromId;
    await api().get(`/v1/shops/${shopId}/customers/${merged}`).set(bearer(owner)).expect(404);
    // The Livechat list names the customer by the surviving profile.
    const convs = (await api().get(`/v1/shops/${shopId}/conversations`).set(bearer(owner)).expect(200)).body.items;
    expect(convs.find((c: { id: string }) => c.id === za.conversationId).customer.name).toBe('Lê Minh Tâm');
    // A later Zalo message stays on the same profile.
    expect(
      (await writes(zalo, { user: (await prisma.system.customerIdentity.findFirstOrThrow({ where: { channelId: zalo, customerId: fb.customerId } })).externalUserId, platform: 'ZALO_OA' })).customerId,
    ).toBe(fb.customerId);
  });

  it('an email in another case also joins the profiles; the older profile always survives', async () => {
    const older = await writes(web, { name: 'Khách web', platform: 'WEBCHAT' });
    await api()
      .patch(`/v1/shops/${shopId}/customers/${older.customerId}`)
      .set(bearer(owner))
      .send({ email: `Mai.${run}@Gmail.com` })
      .expect(200);
    const newer = await writes(facebook, { name: 'Mai Hoa', email: ` mai.${run}@gmail.COM ` });
    expect(newer.customerId).toBe(older.customerId);
  });

  it('staff saving a known phone merges the two profiles; the response is the surviving profile', async () => {
    const number = phone();
    const first = await createCustomer({ name: 'Phạm Quốc Huy', phone: number, address: '12 Lê Lợi' });
    const second = await writes(facebook, { name: 'Huy Phạm' });
    const res = await api()
      .patch(`/v1/shops/${shopId}/customers/${second.customerId}`)
      .set(bearer(manager))
      .send({ phone: `${number.slice(0, 4)}.${number.slice(4, 7)}.${number.slice(7)}` })
      .expect(200);
    expect(res.body.id).toBe(first.id);
    expect(res.body.merged).toEqual([expect.objectContaining({ fromId: second.customerId, intoId: first.id, matchedBy: 'phone' })]);
    expect(res.body.address).toBe('12 Lê Lợi');
    expect((await prisma.system.conversation.findUniqueOrThrow({ where: { id: second.conversationId } })).customerId).toBe(first.id);
    // Creating a new profile with a phone or email that exists is refused (no silent duplicates).
    const dup = await api()
      .post(`/v1/shops/${shopId}/customers`)
      .set(bearer(owner))
      .send({ name: 'Trùng', phone: `+84${number.slice(1)}` })
      .expect(409);
    expect(dup.body.error.code).toBe('CUSTOMER_EXISTS');
  });

  it('a Sale cannot merge into a profile outside their scope, nor learn whose it is', async () => {
    const number = phone();
    const managed = await createCustomer({ name: 'Khách của quản lý', phone: number });
    const mine = await createCustomer({ name: 'Khách của Sale' }, sale.token);
    const res = await api().patch(`/v1/shops/${shopId}/customers/${mine.id}`).set(bearer(sale.token)).send({ phone: number }).expect(409);
    expect(res.body.error.code).toBe('CUSTOMER_EXISTS');
    expect(JSON.stringify(res.body)).not.toContain(managed.id);
    expect((await customer(mine.id)).phone).toBeNull();
    expect((await customer(managed.id)).mergedIntoId).toBeNull();
  });

  it('merging never crosses shops', async () => {
    const number = phone();
    const here = await createCustomer({ name: 'Cùng số', phone: number });
    const otherChannel = await channel(other.shopId, 'FACEBOOK');
    const there = await writes(otherChannel, { shop: other.shopId, phone: number });
    expect(there.customerId).not.toBe(here.id);
    expect((await customer(here.id)).mergedIntoId).toBeNull();
    const foreign = await api().post(`/v1/shops/${shopId}/customers/${here.id}/merge`).set(bearer(owner)).send({ intoId: there.customerId }).expect(404);
    expect(foreign.body.error.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('undo puts back every moved row and every filled-in field, and the pair is not suggested again', async () => {
    const into = await writes(facebook, { name: 'Võ Thanh Bình' });
    const from = await writes(zalo, { name: 'Vo Thanh Binh', platform: 'ZALO_OA' });
    await api()
      .patch(`/v1/shops/${shopId}/customers/${from.customerId}`)
      .set(bearer(owner))
      .send({ email: `binh.${run}@example.vn`, tags: ['VIP'], stage: 'QUOTED' })
      .expect(200);
    const fromOrder = await order(from.customerId);
    const [fromAcc, intoAcc] = await Promise.all([
      prisma.system.loyaltyAccount.create({ data: { shopId, customerId: from.customerId, points: 120 } }),
      prisma.system.loyaltyAccount.create({ data: { shopId, customerId: into.customerId, points: 30 } }),
    ]);
    await prisma.system.loyaltyTransaction.create({ data: { accountId: fromAcc.id, points: 120, reason: 'order' } });

    // Same name without accents → suggested; a manager merges by hand.
    const suggestions = (await api().get(`/v1/shops/${shopId}/customers/merge-suggestions`).set(bearer(manager)).expect(200)).body;
    const s = suggestions.find((x: { from: { id: string }; into: { id: string } }) => [x.from.id, x.into.id].sort().join() === [from.customerId, into.customerId].sort().join());
    expect(s).toMatchObject({ reason: 'name', into: { id: into.customerId } });
    const merged = (await api().post(`/v1/shops/${shopId}/customers/${from.customerId}/merge`).set(bearer(manager)).send({ intoId: into.customerId }).expect(201)).body;
    expect(merged).toMatchObject({ id: into.customerId, email: `binh.${run}@example.vn`, tags: ['VIP'], stage: 'QUOTED' });
    expect((await prisma.system.loyaltyAccount.findUniqueOrThrow({ where: { id: intoAcc.id } })).points).toBe(150);
    expect((await prisma.system.order.findUniqueOrThrow({ where: { id: fromOrder.id } })).customerId).toBe(into.customerId);
    const logId = merged.merged[0].logId as string;

    // Merging the merged profile again, or into it, is refused.
    expect((await api().post(`/v1/shops/${shopId}/customers/${from.customerId}/merge`).set(bearer(manager)).send({ intoId: into.customerId }).expect(409)).body.error.code).toBe('MERGE_CONFLICT');
    expect((await api().post(`/v1/shops/${shopId}/customers/${into.customerId}/merge`).set(bearer(manager)).send({ intoId: into.customerId }).expect(400)).body.error.code).toBe('MERGE_SAME_CUSTOMER');

    // Edited after the merge: the edit survives the undo.
    await api().patch(`/v1/shops/${shopId}/customers/${into.customerId}`).set(bearer(owner)).send({ stage: 'WON' }).expect(200);
    await api().post(`/v1/shops/${shopId}/customers/merges/${logId}/undo`).set(bearer(manager)).expect(201);
    const [a, b] = await Promise.all([customer(into.customerId), customer(from.customerId)]);
    expect(a).toMatchObject({ email: null, emailNormalized: null, tags: [], stage: 'WON', mergedIntoId: null });
    expect(b).toMatchObject({ email: `binh.${run}@example.vn`, tags: ['VIP'], mergedIntoId: null });
    expect((await prisma.system.conversation.findUniqueOrThrow({ where: { id: from.conversationId } })).customerId).toBe(from.customerId);
    expect((await prisma.system.conversation.findUniqueOrThrow({ where: { id: into.conversationId } })).customerId).toBe(into.customerId);
    expect((await prisma.system.order.findUniqueOrThrow({ where: { id: fromOrder.id } })).customerId).toBe(from.customerId);
    expect(await prisma.system.customerIdentity.count({ where: { customerId: from.customerId } })).toBe(1);
    expect((await prisma.system.loyaltyAccount.findUniqueOrThrow({ where: { id: intoAcc.id } })).points).toBe(30);
    expect((await prisma.system.loyaltyAccount.findUniqueOrThrow({ where: { id: fromAcc.id } })).points).toBe(120);
    expect(await prisma.system.loyaltyTransaction.count({ where: { accountId: fromAcc.id } })).toBe(1);

    expect((await api().post(`/v1/shops/${shopId}/customers/merges/${logId}/undo`).set(bearer(manager)).expect(409)).body.error.code).toBe('MERGE_ALREADY_UNDONE');
    const again = (await api().get(`/v1/shops/${shopId}/customers/merge-suggestions`).set(bearer(manager)).expect(200)).body;
    expect(again.some((x: { from: { id: string }; into: { id: string } }) => [x.from.id, x.into.id].includes(from.customerId) && [x.from.id, x.into.id].includes(into.customerId))).toBe(false);
    const log = await prisma.system.auditLog.findFirst({ where: { shopId, action: 'customer.unmerge', entityId: into.customerId } });
    expect(log).not.toBeNull();
  });

  it('undoing an automatic merge gives the newer profile back its conversation, opened after the merge', async () => {
    const number = phone();
    const first = await writes(facebook, { name: 'Cao Minh Đức', phone: number });
    const second = await writes(zalo, { name: 'Đức Cao', phone: number, platform: 'ZALO_OA' });
    expect(second.customerId).toBe(first.customerId);
    const log = await prisma.system.customerMergeLog.findFirstOrThrow({ where: { shopId, intoId: first.customerId } });
    await api().post(`/v1/shops/${shopId}/customers/merges/${log.id}/undo`).set(bearer(owner)).expect(201);
    expect((await prisma.system.conversation.findUniqueOrThrow({ where: { id: second.conversationId } })).customerId).toBe(log.fromId);
    expect((await prisma.system.conversation.findUniqueOrThrow({ where: { id: first.conversationId } })).customerId).toBe(first.customerId);

    // A third chat with the same phone joins the older profile, but the split pair is never merged back.
    const third = await writes(web, { name: 'Đức', phone: number, platform: 'WEBCHAT' });
    expect(third.customerId).toBe(first.customerId);
    expect((await customer(log.fromId)).mergedIntoId).toBeNull();
    const split = await createCustomer({ name: 'Ai Đó' });
    const patched = await api().patch(`/v1/shops/${shopId}/customers/${split.id}`).set(bearer(owner)).send({ phone: number }).expect(200);
    expect(patched.body.id).toBe(first.customerId);
    expect((await customer(log.fromId)).mergedIntoId).toBeNull();
  });

  it('a chain of merges is undone newest first', async () => {
    const number = phone();
    const x = await createCustomer({ name: 'Chuỗi X' });
    const y = await createCustomer({ name: 'Chuỗi Y', phone: number });
    const z = await createCustomer({ name: 'Chuỗi Z' });
    const first = await identity.merge(shopId, x.id, y.id, { matchedBy: 'manual', auto: false, actorId: null });
    const second = await identity.merge(shopId, y.id, z.id, { matchedBy: 'manual', auto: false, actorId: null });
    expect((await api().post(`/v1/shops/${shopId}/customers/merges/${first.logId}/undo`).set(bearer(owner)).expect(409)).body.error.code).toBe('MERGE_UNDO_BLOCKED');
    await api().post(`/v1/shops/${shopId}/customers/merges/${second.logId}/undo`).set(bearer(owner)).expect(201);
    await api().post(`/v1/shops/${shopId}/customers/merges/${first.logId}/undo`).set(bearer(owner)).expect(201);
    expect((await Promise.all([x.id, y.id, z.id].map(customer))).map((c) => c.mergedIntoId)).toEqual([null, null, null]);
    expect((await customer(z.id)).phone).toBeNull();
    expect((await customer(y.id)).phoneNormalized).toBe(`+84${number.slice(1)}`);
  });

  it('suggestions skip conflicting phones, placeholder names and dismissed pairs', async () => {
    const a = await createCustomer({ name: 'Trịnh Bảo Ngọc', phone: phone() });
    const b = await createCustomer({ name: 'trinh bao ngoc', phone: phone() });
    await writes(web, { platform: 'WEBCHAT' });
    await writes(web, { platform: 'WEBCHAT' }); // two "Khách mới"
    const c = await createCustomer({ name: 'Đỗ Hải Yến' });
    const d = await writes(facebook, { name: 'Do Hai Yen' });
    const list = (await api().get(`/v1/shops/${shopId}/customers/merge-suggestions`).set(bearer(owner)).expect(200)).body as {
      from: { id: string; name: string };
      into: { id: string; name: string };
    }[];
    const ids = (x: (typeof list)[number]) => [x.from.id, x.into.id];
    expect(list.some((x) => ids(x).includes(a.id) && ids(x).includes(b.id))).toBe(false);
    expect(list.some((x) => x.from.name === 'Khách mới' || x.into.name === 'Khách mới')).toBe(false);
    expect(list.some((x) => ids(x).includes(c.id) && ids(x).includes(d.customerId))).toBe(true);
    await api().post(`/v1/shops/${shopId}/customers/merge-suggestions/dismiss`).set(bearer(owner)).send({ aId: d.customerId, bId: c.id }).expect(204);
    const after = (await api().get(`/v1/shops/${shopId}/customers/merge-suggestions`).set(bearer(owner)).expect(200)).body as typeof list;
    expect(after.some((x) => ids(x).includes(c.id) && ids(x).includes(d.customerId))).toBe(false);
    // Sale may not see suggestions or merge (the RBAC matrix covers every route; one direct check here).
    await api().get(`/v1/shops/${shopId}/customers/merge-suggestions`).set(bearer(sale.token)).expect(403);
  });

  it('parallel messages carrying the same phone end with exactly one profile', async () => {
    const number = phone();
    await Promise.all(Array.from({ length: 4 }, (_, i) => writes(i % 2 ? zalo : facebook, { phone: number, name: `Song song ${i}`, platform: i % 2 ? 'ZALO_OA' : 'FACEBOOK' })));
    // A last write settles any merge that lost a race.
    await writes(web, { phone: number, platform: 'WEBCHAT' });
    const alive = await prisma.system.customer.count({ where: { shopId, phoneNormalized: `+84${number.slice(1)}`, mergedIntoId: null } });
    expect(alive).toBe(1);
    const survivor = await prisma.system.customer.findFirstOrThrow({ where: { shopId, phoneNormalized: `+84${number.slice(1)}`, mergedIntoId: null } });
    expect(await prisma.system.customerIdentity.count({ where: { shopId, customerId: survivor.id } })).toBe(5);
  });

  it('the same merge sent twice at once is done once: one log, points counted once', async () => {
    for (let round = 0; round < 5; round++) {
      const from = await createCustomer({ name: `Đôi ${round}` });
      const into = await createCustomer({ name: `Đích ${round}` });
      await prisma.system.loyaltyAccount.create({ data: { shopId, customerId: from.id, points: 100 } });
      await prisma.system.loyaltyAccount.create({ data: { shopId, customerId: into.id, points: 50 } });
      const results = await Promise.allSettled([0, 1].map(() => identity.merge(shopId, from.id, into.id, { matchedBy: 'manual', auto: false, actorId: null })));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await prisma.system.customerMergeLog.count({ where: { shopId, fromId: from.id } })).toBe(1);
      expect((await prisma.system.loyaltyAccount.findFirstOrThrow({ where: { shopId, customerId: into.id } })).points).toBe(150);
    }
  });
});
