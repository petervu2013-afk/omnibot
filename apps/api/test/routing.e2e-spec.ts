// Step 8 (AUTH-15, AUTH-16, ADS-08): shifts, online status, assigning new conversations by the shop's mode, and
// remembering the ref / ad / utm a customer came from.
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/core/prisma.service.js';
import { InboxService } from '../src/inbox/inbox.service.js';
import { localTime } from '../src/shop/shifts.js';
import { createTestApp } from './support/app.js';

const PASSWORD = 'Go-Viet-2026-an-toan';
const APP_SECRET = 'meta-app-secret-for-routing-tests-0123';
const STAFF_ORIGIN = 'http://localhost:5173';
const run = Date.now().toString(36);
let seq = 0;
const uniq = () => `${run}${++seq}`;
type Mode = 'MANUAL' | 'FIRST_VIEW' | 'ROUND_ROBIN_ONLINE' | 'ROUND_ROBIN_ALL';

function next<T = unknown>(socket: Socket, event: string, ms = 3_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${event}" within ${ms} ms`)), ms);
    socket.once(event, (p: T) => {
      clearTimeout(timer);
      resolve(p);
    });
  });
}
async function until(check: () => Promise<boolean>, ms = 3_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('condition not met in time');
}

describe('Shifts, assignment and ref & src (Step 8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inbox: InboxService;
  let url: string;
  const sockets: Socket[] = [];
  const api = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function register(tag: string) {
    const res = await api()
      .post('/v1/auth/register')
      .send({ fullName: `Người ${tag}`, email: `${tag}.${uniq()}@example.vn`, password: PASSWORD, shopName: `Shop ${tag}`, acceptTerms: true, platform: 'ANDROID' })
      .expect(201);
    return { token: res.body.accessToken as string, userId: res.body.user.id as string, shopId: res.body.shops[0].id as string };
  }
  /** A shop in the given mode with its owner, `saleCount` Sales and a Facebook-like channel. */
  async function shop(mode: Mode, saleCount = 3, scope: 'OWN' | 'OWN_UNASSIGNED' = 'OWN') {
    const o = await register('chu');
    await prisma.system.shop.update({ where: { id: o.shopId }, data: { assignMode: mode, saleDataScope: scope } });
    type Member = { token: string; memberId: string };
    const list: Member[] = [];
    for (let i = 0; i < saleCount; i++) {
      const u = await register(`sale${i}`);
      const m = await prisma.system.shopMember.create({ data: { shopId: o.shopId, userId: u.userId, role: 'SALE', status: 'ACTIVE' } });
      list.push({ token: u.token, memberId: m.id });
    }
    const channel = await prisma.system.channel.create({ data: { shopId: o.shopId, platform: 'FACEBOOK', externalId: `P${uniq()}`, name: 'Page' } });
    // Indexed access is safe: callers only read the Sales they asked for.
    const sales = list as Member[] & Record<0 | 1 | 2 | 3, Member>;
    return { shopId: o.shopId, owner: o.token, sales, channelId: channel.id, pageId: channel.externalId };
  }
  type Shop = Awaited<ReturnType<typeof shop>>;
  /** A new customer writes; returns the conversation row. */
  async function writes(s: Shop, user = `u${uniq()}`, attribution?: { ref?: string; adId?: string; src?: string }) {
    const res = await inbox.receiveInbound({ shopId: s.shopId, channelId: s.channelId, platform: 'FACEBOOK', externalUserId: user, externalMessageId: `m${uniq()}`, text: 'Shop ơi', attribution });
    return prisma.system.conversation.findUniqueOrThrow({ where: { id: res!.conversation.id } });
  }
  async function online(token: string, shopId: string) {
    const s = io(`${url}/live`, { auth: { token, shopId }, transports: ['websocket'], extraHeaders: { origin: STAFF_ORIGIN }, reconnection: false, forceNew: true });
    sockets.push(s);
    await new Promise<void>((resolve, reject) => {
      s.once('connect', resolve);
      s.once('connect_error', reject);
    });
    return s;
  }
  const isOnline = async (memberId: string) => (await prisma.system.shopMember.findUniqueOrThrow({ where: { id: memberId } })).isOnline;
  const count = (ids: (string | null)[]) => ids.reduce<Record<string, number>>((m, id) => ({ ...m, [id ?? 'none']: (m[id ?? 'none'] ?? 0) + 1 }), {});
  /** A shift today in the shop zone, but over hours already past or still to come → off shift now. */
  const offShiftNow = () => {
    const { day, minutes } = localTime('Asia/Ho_Chi_Minh', new Date());
    return minutes < 120 ? { dayOfWeek: day, startTime: '22:00', endTime: '23:00' } : { dayOfWeek: day, startTime: '00:00', endTime: '01:00' };
  };
  const onShiftNow = () => ({ dayOfWeek: localTime('Asia/Ho_Chi_Minh', new Date()).day, startTime: '00:00', endTime: '24:00' });

  beforeAll(async () => {
    app = await createTestApp({ META_APP_SECRET: APP_SECRET, META_VERIFY_TOKEN: 'routing-verify-token' });
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    inbox = app.get(InboxService);
  });
  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('round robin: 100 new conversations for 3 Sales differ by at most 1; each customer gets that Sale as owner', async () => {
    const s = await shop('ROUND_ROBIN_ALL');
    const convs = [];
    for (let i = 0; i < 100; i++) convs.push(await writes(s));
    const per = count(convs.map((c) => c.assigneeId));
    expect(Object.keys(per).sort()).toEqual(s.sales.map((x) => x.memberId).sort());
    expect(Math.max(...Object.values(per)) - Math.min(...Object.values(per))).toBeLessThanOrEqual(1);
    const customers = await prisma.system.customer.findMany({ where: { id: { in: convs.map((c) => c.customerId) } } });
    for (const c of convs) expect(customers.find((x) => x.id === c.customerId)?.ownerId).toBe(c.assigneeId);
  });

  it('off shift, leads switched off, disabled, Warehouse and Manager never get a conversation', async () => {
    const s = await shop('ROUND_ROBIN_ALL', 4);
    const [working, offShift, noLeads, disabled] = s.sales;
    await api()
      .put(`/v1/shops/${s.shopId}/members/${offShift.memberId}/shifts`)
      .set(bearer(s.owner))
      .send({ shifts: [offShiftNow()] })
      .expect(200);
    await api().put(`/v1/shops/${s.shopId}/members/${noLeads.memberId}/shifts`).set(bearer(s.owner)).send({ shifts: [], receivesLeads: false }).expect(200);
    await api()
      .put(`/v1/shops/${s.shopId}/members/${working.memberId}/shifts`)
      .set(bearer(s.owner))
      .send({ shifts: [onShiftNow()] })
      .expect(200);
    await prisma.system.shopMember.update({ where: { id: disabled.memberId }, data: { status: 'DISABLED' } });
    for (const role of ['WAREHOUSE', 'MANAGER'] as const) {
      const u = await register(role);
      await prisma.system.shopMember.create({ data: { shopId: s.shopId, userId: u.userId, role, status: 'ACTIVE' } });
    }
    const convs = [];
    for (let i = 0; i < 6; i++) convs.push(await writes(s));
    expect(count(convs.map((c) => c.assigneeId))).toEqual({ [working.memberId]: 6 });

    const members = (await api().get(`/v1/shops/${s.shopId}/members`).set(bearer(s.owner)).expect(200)).body as { id: string; onShift: boolean; shiftCount: number; receivesLeads: boolean }[];
    expect(members.find((m) => m.id === offShift.memberId)).toMatchObject({ onShift: false, shiftCount: 1 });
    expect(members.find((m) => m.id === working.memberId)).toMatchObject({ onShift: true, shiftCount: 1 });
    expect(members.find((m) => m.id === noLeads.memberId)).toMatchObject({ onShift: true, receivesLeads: false });
  });

  it('online round robin: only Sales on Livechat; a waiting conversation goes to the first Sale who comes online', async () => {
    const s = await shop('ROUND_ROBIN_ONLINE', 2);
    const [a, b] = s.sales;
    const waiting = await writes(s);
    expect(waiting.assigneeId).toBeNull();

    const sa = await online(a.token, s.shopId);
    const got = next<{ conversationId: string; change: { assigneeId: string } }>(sa, 'conversation');
    await until(() => isOnline(a.memberId));
    expect(await got).toMatchObject({ conversationId: waiting.id, change: { assigneeId: a.memberId } });
    for (let i = 0; i < 3; i++) expect((await writes(s)).assigneeId).toBe(a.memberId);

    // Two tabs: closing one keeps the Sale online; closing both takes them offline.
    const sa2 = await online(a.token, s.shopId);
    sa2.disconnect();
    await new Promise((r) => setTimeout(r, 300));
    expect(await isOnline(a.memberId)).toBe(true);
    sa.disconnect();
    await until(async () => !(await isOnline(a.memberId)));
    expect((await writes(s)).assigneeId).toBeNull();
    expect(await isOnline(b.memberId)).toBe(false);
  });

  it('two conversations arriving at the same moment go to two different Sales', async () => {
    for (let round = 0; round < 5; round++) {
      const s = await shop('ROUND_ROBIN_ALL', 2);
      const [x, y] = await Promise.all([writes(s), writes(s)]);
      expect(new Set([x.assigneeId, y.assigneeId])).toEqual(new Set(s.sales.map((m) => m.memberId)));
    }
  });

  it('a returning customer goes back to their own Sale', async () => {
    const s = await shop('ROUND_ROBIN_ALL', 3);
    const first = await writes(s, 'khach-quen');
    await prisma.system.conversation.update({ where: { id: first.id }, data: { status: 'closed' } });
    await writes(s); // the rotation moves on
    expect((await writes(s, 'khach-quen')).assigneeId).toBe(first.assigneeId);
  });

  it('first viewer: no automatic assignment; the first Sale to open it takes it, a Manager opening it does not', async () => {
    const s = await shop('FIRST_VIEW', 2, 'OWN_UNASSIGNED');
    const [a, b] = s.sales;
    const conv = await writes(s);
    expect(conv.assigneeId).toBeNull();
    await api().get(`/v1/shops/${s.shopId}/conversations/${conv.id}`).set(bearer(s.owner)).expect(200);
    expect((await prisma.system.conversation.findUniqueOrThrow({ where: { id: conv.id } })).assigneeId).toBeNull();
    const opened = await api().get(`/v1/shops/${s.shopId}/conversations/${conv.id}`).set(bearer(a.token)).expect(200);
    expect(opened.body.assigneeId).toBe(a.memberId);
    await api().get(`/v1/shops/${s.shopId}/conversations/${conv.id}`).set(bearer(b.token)).expect(404);
    // Both opening a new one at once: exactly one gets it.
    const other = await writes(s);
    const res = await Promise.all([a, b].map((m) => api().get(`/v1/shops/${s.shopId}/conversations/${other.id}`).set(bearer(m.token))));
    expect(res.map((r) => r.status).sort()).toEqual([200, 404].sort((p, q) => p - q));
  });

  it('manual mode leaves every conversation for a Manager to assign', async () => {
    const s = await shop('MANUAL', 2);
    expect((await writes(s)).assigneeId).toBeNull();
  });

  it('shift API: validated, Manager may, Sale may not, other shops 404, audited', async () => {
    const s = await shop('ROUND_ROBIN_ALL', 1);
    const [sale] = s.sales;
    const path = `/v1/shops/${s.shopId}/members/${sale.memberId}/shifts`;
    const bad = await api()
      .put(path)
      .set(bearer(s.owner))
      .send({ shifts: [{ dayOfWeek: 1, startTime: '17:00', endTime: '08:00' }] })
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    await api().put(path).set(bearer(sale.token)).send({ shifts: [] }).expect(403);
    const week = [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startTime: '08:00', endTime: '17:30' }));
    const saved = await api().put(path).set(bearer(s.owner)).send({ shifts: week, receivesLeads: false }).expect(200);
    expect(saved.body).toEqual({ memberId: sale.memberId, receivesLeads: false, shifts: week });
    expect((await api().get(path).set(bearer(s.owner)).expect(200)).body.shifts).toHaveLength(5);
    const other = await shop('MANUAL', 0);
    await api().put(`/v1/shops/${other.shopId}/members/${sale.memberId}/shifts`).set(bearer(other.owner)).send({ shifts: [] }).expect(404);
    const log = await prisma.system.auditLog.findFirst({ where: { shopId: s.shopId, action: 'member.shifts', entityId: sale.memberId } });
    expect(log?.after).toMatchObject({ receivesLeads: false });
  });

  describe('ref & src (ADS-08)', () => {
    const sign = (body: string) => `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`;
    const webhook = (pageId: string, event: Record<string, unknown>) => {
      const body = JSON.stringify({ object: 'page', entry: [{ id: pageId, time: Date.now(), messaging: [{ recipient: { id: pageId }, ...event }] }] });
      return api().post('/v1/webhooks/facebook').set('Content-Type', 'application/json').set('X-Hub-Signature-256', sign(body)).send(body).expect(200);
    };

    it('an ad click carries ref, ad id and campaign onto the conversation and the customer', async () => {
      const s = await shop('MANUAL', 0);
      const account = await prisma.system.adAccount.create({ data: { shopId: s.shopId, platform: 'META', externalId: `act_${uniq()}`, name: 'TK QC', accessTokenEnc: 'x' } });
      const campaign = await prisma.system.adCampaign.create({ data: { adAccountId: account.id, externalId: `c${uniq()}`, name: 'Sofa Tết', status: 'ACTIVE' } });
      const set = await prisma.system.adSet.create({ data: { campaignId: campaign.id, externalId: `s${uniq()}`, name: 'Nhóm 1', status: 'ACTIVE' } });
      const adId = `ad${uniq()}`;
      await prisma.system.ad.create({ data: { adSetId: set.id, externalId: adId, name: 'Video sofa', status: 'ACTIVE' } });
      // The same ad id in another shop's account must not be picked.
      const strange = await shop('MANUAL', 0);
      const acc2 = await prisma.system.adAccount.create({ data: { shopId: strange.shopId, platform: 'META', externalId: `act_${uniq()}`, name: 'Khác', accessTokenEnc: 'x' } });
      const c2 = await prisma.system.adCampaign.create({ data: { adAccountId: acc2.id, externalId: `c${uniq()}`, name: 'Khác', status: 'ACTIVE' } });
      const s2 = await prisma.system.adSet.create({ data: { campaignId: c2.id, externalId: `s${uniq()}`, name: 'Khác', status: 'ACTIVE' } });
      await prisma.system.ad.create({ data: { adSetId: s2.id, externalId: adId, name: 'Khác', status: 'ACTIVE' } });

      const psid = `PSID${uniq()}`;
      await webhook(s.pageId, {
        sender: { id: psid },
        timestamp: Date.now(),
        message: { mid: `mid${uniq()}`, text: 'Giá sofa?', referral: { ref: 'sofa-tet', ad_id: adId, source: 'ADS', type: 'OPEN_THREAD' } },
      });
      const conv = await prisma.system.conversation.findFirstOrThrow({ where: { shopId: s.shopId } });
      expect(conv).toMatchObject({ ref: 'sofa-tet', adId, src: 'facebook_ads', campaignId: campaign.id });
      expect(await prisma.system.customer.findUniqueOrThrow({ where: { id: conv.customerId } })).toMatchObject({ ref: 'sofa-tet', src: 'facebook_ads', campaignId: campaign.id });
    });

    it('opening m.me?ref= without writing leaves a system note; a resend is dropped; first touch stays on the customer', async () => {
      const s = await shop('MANUAL', 0);
      const psid = `PSID${uniq()}`;
      await webhook(s.pageId, { sender: { id: psid }, timestamp: Date.now(), message: { mid: `mid${uniq()}`, text: 'Chào' } });
      const ts = Date.now() + 1;
      const event = { sender: { id: psid }, timestamp: ts, referral: { ref: 'livestream-21h', source: 'SHORTLINK', type: 'OPEN_THREAD' } };
      await webhook(s.pageId, event);
      await webhook(s.pageId, event);
      const conv = await prisma.system.conversation.findFirstOrThrow({ where: { shopId: s.shopId } });
      expect(conv).toMatchObject({ ref: 'livestream-21h', src: 'facebook', unreadCount: 1 });
      const notes = await prisma.system.message.findMany({ where: { conversationId: conv.id, sender: 'SYSTEM' } });
      expect(notes.map((n) => n.text)).toEqual(['Khách mở hội thoại qua link (ref: livestream-21h)']);
      // The customer came organically first: that first source is kept.
      expect(await prisma.system.customer.findUniqueOrThrow({ where: { id: conv.customerId } })).toMatchObject({ src: 'facebook', ref: null });
    });

    it('website chat: utm_source and utm_campaign from the page; junk values are dropped', async () => {
      const s = await shop('MANUAL', 0);
      const site = await prisma.system.channel.create({ data: { shopId: s.shopId, platform: 'WEBCHAT', externalId: `wc_${uniq()}`, name: 'Web', botConfig: { allowedOrigins: [] } } });
      const visit = async (attribution: unknown) => {
        const v = io(`${url}/webchat`, { auth: { siteKey: site.externalId, attribution }, transports: ['websocket'], reconnection: false, forceNew: true });
        sockets.push(v);
        await next(v, 'session');
        const ack = (await v.timeout(3_000).emitWithAck('message', { clientId: `c-${uniq()}`, text: 'Hỏi giá' })) as { ok: boolean; message: { conversationId: string } };
        return prisma.system.conversation.findUniqueOrThrow({ where: { id: ack.message.conversationId } });
      };
      expect(await visit({ ref: 'tet-2027', src: 'Google' })).toMatchObject({ ref: 'tet-2027', src: 'google' });
      expect(await visit({ ref: '<script>alert(1)</script>', src: 'x'.repeat(300) })).toMatchObject({ ref: null, src: 'website' });
      expect(await visit(undefined)).toMatchObject({ ref: null, src: 'website' });
    });
  });
});
