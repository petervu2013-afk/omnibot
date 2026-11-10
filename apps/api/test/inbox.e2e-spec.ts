// Step 5A gate: inbound pipeline with dedupe, realtime for staff under the Sale data scope, the website chat end to
// end (visitor ↔ agent in under 2 s), and the Facebook webhook (signature, parsing, duplicates) with sample payloads.
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/core/prisma.service.js';
import { FacebookSender } from '../src/inbox/facebook.sender.js';
import { LiveGateway } from '../src/inbox/live.gateway.js';
import { createTestApp } from './support/app.js';

const PASSWORD = 'Go-Viet-2026-an-toan';
const APP_SECRET = 'meta-app-secret-for-tests-0123456789';
const VERIFY_TOKEN = 'meta-verify-token-for-tests';
const STAFF_ORIGIN = 'http://localhost:5173';
const SITE = 'https://shop-ban-ghe.example.vn';
const run = Date.now().toString(36);
let seq = 0;

/** Resolves with the next `event` on the socket, or rejects after `ms`. */
function next<T = unknown>(socket: Socket, event: string, ms = 2_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, on);
      reject(new Error(`no "${event}" within ${ms} ms`));
    }, ms);
    const on = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, on);
  });
}

/** Resolves true if `event` arrives within `ms`, false otherwise. */
const arrives = (socket: Socket, event: string, ms = 600) =>
  next(socket, event, ms).then(
    () => true,
    () => false,
  );

describe('Inbox (Step 5A)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let url: string;
  const sockets: Socket[] = [];
  const api = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  let shopId: string;
  let owner: { token: string; memberId: string };
  let sale: { token: string; memberId: string; userId: string };
  let warehouse: { token: string };
  let outsider: { token: string; shopId: string };

  async function register(tag: string) {
    const res = await api()
      .post('/v1/auth/register')
      .send({ fullName: `Người ${tag}`, email: `${tag}.${run}.${++seq}@example.vn`, password: PASSWORD, shopName: `Shop ${tag}`, acceptTerms: true, platform: 'ANDROID' })
      .expect(201);
    return { token: res.body.accessToken as string, userId: res.body.user.id as string, shopId: res.body.shops[0].id as string };
  }
  async function member(role: 'SALE' | 'WAREHOUSE', tag: string) {
    const u = await register(tag);
    const m = await prisma.system.shopMember.create({ data: { shopId, userId: u.userId, role, status: 'ACTIVE' } });
    return { token: u.token, userId: u.userId, memberId: m.id };
  }

  function connect(ns: '/live' | '/webchat', auth: Record<string, unknown>, origin: string) {
    const s = io(`${url}${ns}`, { auth, transports: ['websocket'], extraHeaders: { origin }, reconnection: false, forceNew: true });
    sockets.push(s);
    return s;
  }
  async function staff(token: string, shop = shopId) {
    const s = connect('/live', { token, shopId: shop }, STAFF_ORIGIN);
    await new Promise<void>((resolve, reject) => {
      s.once('connect', resolve);
      s.once('connect_error', reject);
    });
    return s;
  }
  /** Connects a website visitor and returns the socket with its first `session` payload. */
  async function visitor(siteKey: string, visitorToken?: string, origin = SITE) {
    const s = connect('/webchat', { siteKey, visitorToken }, origin);
    const session = await next<{ visitorToken: string; history: { from: string; text: string }[] }>(s, 'session');
    return { s, session };
  }
  const refused = (s: Socket) => next<Error>(s, 'connect_error').then((e) => e.message);
  const say = (s: Socket, text: string, clientId = `c-${run}-${++seq}`) =>
    s.timeout(2_000).emitWithAck('message', { clientId, text }) as Promise<{ ok: boolean; duplicate?: boolean; error?: string; message?: { conversationId: string } }>;

  beforeAll(async () => {
    app = await createTestApp({ META_APP_SECRET: APP_SECRET, META_VERIFY_TOKEN: VERIFY_TOKEN });
    await app.listen(0, '127.0.0.1');
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    const o = await register('owner');
    shopId = o.shopId;
    owner = { token: o.token, memberId: (await prisma.system.shopMember.findFirstOrThrow({ where: { shopId, userId: o.userId } })).id };
    sale = await member('SALE', 'sale');
    warehouse = await member('WAREHOUSE', 'kho');
    const out = await register('outsider');
    outsider = { token: out.token, shopId: out.shopId };
    // Sale sees only conversations assigned to them; assignment by hand, so the scope tests decide who gets what
    // (automatic assignment is covered in routing.e2e-spec.ts).
    await prisma.system.shop.update({ where: { id: shopId }, data: { saleDataScope: 'OWN', assignMode: 'MANUAL' } });
  });
  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });
  afterAll(async () => {
    await app?.close();
  });

  async function webchat(origins: string[] = [SITE]) {
    const res = await api().post(`/v1/shops/${shopId}/channels/webchat`).set(bearer(owner.token)).send({ name: 'Website', allowedOrigins: origins }).expect(201);
    return res.body as { id: string; externalId: string };
  }

  describe('website chat', () => {
    it('serves the embeddable widget to other websites', async () => {
      const res = await api().get('/v1/webchat/widget.js').expect(200);
      expect(res.headers['content-type']).toContain('application/javascript');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(() => new Function(res.text)).not.toThrow();
    });

    it('only the configured website may open the chat; an unknown site key is refused', async () => {
      const ch = await webchat();
      expect(await refused(connect('/webchat', { siteKey: ch.externalId }, 'https://trang-gia-mao.example'))).toBe('ORIGIN_NOT_ALLOWED');
      expect(await refused(connect('/webchat', { siteKey: 'wc_khong_ton_tai' }, SITE))).toBe('SITE_NOT_FOUND');
      const { session } = await visitor(ch.externalId);
      expect(session.history).toEqual([]);
    });

    it('visitor ↔ agent round trip in under 2 seconds, with history, seen and typing', async () => {
      const ch = await webchat();
      const agent = await staff(owner.token);
      const { s: guest, session } = await visitor(ch.externalId);

      let t = Date.now();
      const inbound = next<{ conversationId: string; message: { text: string; sender: string } }>(agent, 'message');
      const echoed = arrives(guest, 'message', 500); // the widget already shows its own message
      const ack = await say(guest, 'Ghế gỗ sồi còn hàng không shop?');
      const got = await inbound;
      expect(Date.now() - t).toBeLessThan(2_000);
      expect(ack.ok).toBe(true);
      expect(got.message).toMatchObject({ text: 'Ghế gỗ sồi còn hàng không shop?', sender: 'CUSTOMER' });
      const convId = got.conversationId;
      expect(await echoed).toBe(false);

      const list = await api().get(`/v1/shops/${shopId}/conversations`).set(bearer(owner.token)).expect(200);
      const row = list.body.items.find((c: { id: string }) => c.id === convId);
      expect(row).toMatchObject({ unreadCount: 1, channel: { platform: 'WEBCHAT' }, lastMessage: { sender: 'CUSTOMER' } });

      const typing = next(agent, 'typing');
      guest.emit('typing');
      expect(await typing).toEqual({ conversationId: convId });
      const agentTyping = next(guest, 'typing');
      agent.emit('typing', { conversationId: convId });
      await agentTyping;

      t = Date.now();
      const reply = next<{ from: string; text: string; senderMemberId?: string }>(guest, 'message');
      await api().post(`/v1/shops/${shopId}/conversations/${convId}/messages`).set(bearer(owner.token)).send({ text: 'Dạ còn ạ' }).expect(201);
      const shown = await reply;
      expect(Date.now() - t).toBeLessThan(2_000);
      expect(shown).toMatchObject({ from: 'shop', text: 'Dạ còn ạ' });
      expect(shown).not.toHaveProperty('senderMemberId'); // staff ids never reach the website

      const seen = next(guest, 'seen');
      await api().post(`/v1/shops/${shopId}/conversations/${convId}/read`).set(bearer(owner.token)).expect(204);
      await seen;
      const detail = await api().get(`/v1/shops/${shopId}/conversations/${convId}`).set(bearer(owner.token)).expect(200);
      expect(detail.body).toMatchObject({ unreadCount: 0, botActive: false });

      // Coming back with the issued token restores the conversation; a forged token starts a new visitor.
      guest.disconnect();
      const back = await visitor(ch.externalId, session.visitorToken);
      expect(back.session.history.map((m) => [m.from, m.text])).toEqual([
        ['me', 'Ghế gỗ sồi còn hàng không shop?'],
        ['shop', 'Dạ còn ạ'],
      ]);
      expect(JSON.stringify(back.session.history)).not.toContain(owner.memberId);
      const forged = `${session.visitorToken.split('.')[0]}.AAAA`;
      expect((await visitor(ch.externalId, forged)).session.history).toEqual([]);
    });

    it('a resent message (same clientId) is stored once; bad input and bursts are refused', async () => {
      const ch = await webchat();
      const { s } = await visitor(ch.externalId);
      const first = await say(s, 'Xin giá sofa', 'resend-1');
      const again = await say(s, 'Xin giá sofa', 'resend-1');
      expect(first).toMatchObject({ ok: true, duplicate: false });
      expect(again).toMatchObject({ ok: true, duplicate: true });
      const convId = first.message!.conversationId;
      expect(await prisma.system.message.count({ where: { conversationId: convId } })).toBe(1);

      expect(await s.timeout(2_000).emitWithAck('message', { clientId: 'x', text: 'ngắn' })).toMatchObject({ ok: false, error: 'INVALID_MESSAGE' });
      expect(await say(s, 'a'.repeat(2001))).toMatchObject({ ok: false, error: 'INVALID_MESSAGE' });
      const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => say(s, `tin ${i}`)));
      expect(burst.filter((r) => r.error === 'TOO_FAST').length).toBeGreaterThan(0);
    });

    it('a disconnected channel stops the website chat and agent replies', async () => {
      const ch = await webchat();
      const { s } = await visitor(ch.externalId);
      const convId = (await say(s, 'Alo shop'))!.message!.conversationId;
      await api().delete(`/v1/shops/${shopId}/channels/${ch.id}`).set(bearer(owner.token)).expect(204);
      expect(await refused(connect('/webchat', { siteKey: ch.externalId }, SITE))).toBe('SITE_NOT_FOUND');
      const res = await api().post(`/v1/shops/${shopId}/conversations/${convId}/messages`).set(bearer(owner.token)).send({ text: 'Dạ' }).expect(409);
      expect(res.body.error.code).toBe('CHANNEL_DISCONNECTED');
      // History stays readable.
      await api().get(`/v1/shops/${shopId}/conversations/${convId}/messages`).set(bearer(owner.token)).expect(200);
    });
  });

  describe('data scope and access', () => {
    it('refuses sockets without a valid token, from other shops, without chat permission or from unknown origins', async () => {
      expect(await refused(connect('/live', { shopId }, STAFF_ORIGIN))).toBe('UNAUTHORIZED');
      expect(await refused(connect('/live', { token: 'abc.def.ghi', shopId }, STAFF_ORIGIN))).toBe('UNAUTHORIZED');
      expect(await refused(connect('/live', { token: outsider.token, shopId }, STAFF_ORIGIN))).toBe('FORBIDDEN');
      expect(await refused(connect('/live', { token: warehouse.token, shopId }, STAFF_ORIGIN))).toBe('FORBIDDEN');
      expect(await refused(connect('/live', { token: owner.token, shopId }, 'https://evil.example'))).toBe('ORIGIN_NOT_ALLOWED');
      await staff(outsider.token, outsider.shopId); // their own shop is fine
    });

    it('a Sale with scope OWN gets neither events nor REST access for conversations not assigned to them', async () => {
      const ch = await webchat();
      const boss = await staff(owner.token);
      const seller = await staff(sale.token);
      const { s: guest } = await visitor(ch.externalId);

      const bossGets = next<{ conversationId: string }>(boss, 'message');
      const sellerGets = arrives(seller, 'message');
      await say(guest, 'Tư vấn giúp mình bàn ăn');
      const convId = (await bossGets).conversationId;
      expect(await sellerGets).toBe(false);

      await api().get(`/v1/shops/${shopId}/conversations/${convId}`).set(bearer(sale.token)).expect(404);
      await api().post(`/v1/shops/${shopId}/conversations/${convId}/messages`).set(bearer(sale.token)).send({ text: 'x' }).expect(404);
      const mine = await api().get(`/v1/shops/${shopId}/conversations`).set(bearer(sale.token)).expect(200);
      expect(mine.body.items.map((c: { id: string }) => c.id)).not.toContain(convId);

      // Sale cannot assign; a Manager/Admin can, and from then on the Sale sees it live.
      await api().post(`/v1/shops/${shopId}/conversations/${convId}/assign`).set(bearer(sale.token)).send({ assigneeId: sale.memberId }).expect(403);
      const announced = next<{ conversationId: string }>(seller, 'conversation');
      await api().post(`/v1/shops/${shopId}/conversations/${convId}/assign`).set(bearer(owner.token)).send({ assigneeId: sale.memberId }).expect(201);
      expect((await announced).conversationId).toBe(convId);
      const live = next<{ message: { text: string } }>(seller, 'message');
      await say(guest, 'Mình cần 6 ghế');
      expect((await live).message.text).toBe('Mình cần 6 ghế');
      await api().post(`/v1/shops/${shopId}/conversations/${convId}/messages`).set(bearer(sale.token)).send({ text: 'Dạ có ạ' }).expect(201);

      const log = await prisma.system.auditLog.findFirst({ where: { shopId, action: 'conversation.assign', entityId: convId } });
      expect(log?.after).toMatchObject({ assigneeId: sale.memberId });
      await api().post(`/v1/shops/${shopId}/conversations/${convId}/assign`).set(bearer(owner.token)).send({ assigneeId: 'khong-co' }).expect(404);
    });

    it('a disabled member is cut off on the next recheck', async () => {
      const extra = await member('SALE', 'tam');
      const s = await staff(extra.token);
      await prisma.system.shopMember.update({ where: { id: extra.memberId }, data: { status: 'DISABLED' } });
      const revoked = next(s, 'revoked');
      const gone = next(s, 'disconnect');
      await (app.get(LiveGateway) as unknown as { recheck(): Promise<void> }).recheck();
      await revoked;
      await gone;
    });
  });

  describe('Facebook Messenger webhook', () => {
    const PAGE = `1${Date.now()}`.slice(0, 15);
    const sign = (body: string, secret = APP_SECRET) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    const payload = (mid: string, extra: Record<string, unknown> = {}, page = PAGE) =>
      JSON.stringify({
        object: 'page',
        entry: [{ id: page, time: Date.now(), messaging: [{ sender: { id: 'PSID-777' }, recipient: { id: page }, timestamp: Date.now(), message: { mid, text: 'Shop ơi', ...extra } }] }],
      });
    const post = (body: string, signature?: string) => {
      const r = api().post('/v1/webhooks/facebook').set('Content-Type', 'application/json');
      return (signature ? r.set('X-Hub-Signature-256', signature) : r).send(body);
    };
    let channelId: string;
    const sent: { url: string; body: unknown }[] = [];
    let fail = false;

    beforeAll(async () => {
      const res = await api()
        .post(`/v1/shops/${shopId}/channels/facebook`)
        .set(bearer(owner.token))
        .send({ pageId: PAGE, name: 'Page Nội thất', pageAccessToken: 'EAAB-page-token-for-tests-123456' })
        .expect(201);
      channelId = res.body.id;
      app.get(FacebookSender).fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
        sent.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return fail ? new Response(JSON.stringify({ error: { message: '(#10) outside the allowed window' } }), { status: 400 }) : new Response('{"message_id":"m_1"}', { status: 200 });
      }) as typeof fetch;
    });

    it('answers the subscription handshake only with the right verify token', async () => {
      const ok = await api().get('/v1/webhooks/facebook').query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': '12345' }).expect(200);
      expect(ok.text).toBe('12345');
      await api().get('/v1/webhooks/facebook').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'sai', 'hub.challenge': '1' }).expect(403);
    });

    it('rejects unsigned or wrongly signed bodies and stores nothing', async () => {
      const body = payload('mid.unsigned');
      await post(body).expect(401);
      await post(body, sign(body, 'other-secret-xxxxxxxxxxxxxxxx')).expect(401);
      await post(body, sign(`${body} `)).expect(401); // signature over different bytes
      expect(await prisma.system.message.count({ where: { externalId: { contains: 'mid.unsigned' } } })).toBe(0);
    });

    it('stores a signed message once, skips echoes and pages that are not connected, and replies through the Send API', async () => {
      const agent = await staff(owner.token);
      const body = payload('mid.$abc123');
      const live = next<{ conversationId: string; message: { text: string } }>(agent, 'message');
      await post(body, sign(body)).expect(200);
      const { conversationId } = await live;
      await post(body, sign(body)).expect(200); // Meta retries deliveries
      expect(await prisma.system.message.count({ where: { conversationId } })).toBe(1);
      // Parallel deliveries of one message (and of a brand-new sender) race past the first check: still stored once.
      const racing = JSON.stringify({ object: 'page', entry: [{ id: PAGE, messaging: [{ sender: { id: 'PSID-race' }, message: { mid: 'mid.race', text: 'Đua' } }] }] });
      const results = await Promise.all(Array.from({ length: 4 }, () => post(racing, sign(racing))));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
      expect(await prisma.system.message.count({ where: { externalId: `FACEBOOK:${channelId}:mid.race` } })).toBe(1);
      expect(await prisma.system.customerIdentity.count({ where: { channelId, externalUserId: 'PSID-race' } })).toBe(1);

      const echo = payload('mid.echo', { is_echo: true });
      await post(echo, sign(echo)).expect(200);
      const stranger = payload('mid.other-page', {}, '999999999999');
      await post(stranger, sign(stranger)).expect(200);
      expect(await prisma.system.message.count({ where: { externalId: { in: [`FACEBOOK:${channelId}:mid.echo`] } } })).toBe(0);

      await api().post(`/v1/shops/${shopId}/conversations/${conversationId}/messages`).set(bearer(owner.token)).send({ text: 'Dạ shop chào bạn' }).expect(201);
      expect(sent.at(-1)!.body).toEqual({ recipient: { id: 'PSID-777' }, messaging_type: 'RESPONSE', message: { text: 'Dạ shop chào bạn' } });
      expect(sent.at(-1)!.url).toContain('access_token=EAAB-page-token-for-tests-123456');

      fail = true;
      const res = await api().post(`/v1/shops/${shopId}/conversations/${conversationId}/messages`).set(bearer(owner.token)).send({ text: 'Tin bị từ chối' }).expect(502);
      fail = false;
      expect(res.body.error.code).toBe('CHANNEL_SEND_FAILED');
      expect(await prisma.system.message.count({ where: { conversationId, text: 'Tin bị từ chối' } })).toBe(0);
    });

    it('never returns the page token, stores it encrypted, and one Page belongs to one shop', async () => {
      const list = await api().get(`/v1/shops/${shopId}/channels`).set(bearer(owner.token)).expect(200);
      expect(JSON.stringify(list.body)).not.toContain('EAAB-page-token');
      const row = await prisma.system.channel.findUniqueOrThrow({ where: { id: channelId } });
      expect(row.accessTokenEnc).toBeTruthy();
      expect(row.accessTokenEnc).not.toContain('EAAB');
      const taken = await api()
        .post(`/v1/shops/${outsider.shopId}/channels/facebook`)
        .set(bearer(outsider.token))
        .send({ pageId: PAGE, name: 'Chiếm Page', pageAccessToken: 'EAAB-another-token-000000000' })
        .expect(409);
      expect(taken.body.error.code).toBe('CHANNEL_TAKEN');
    });
  });
});
