// CH-04 Webchat: namespace /webchat for website visitors (widget served at GET /webchat/widget.js). A visitor is
// identified by a signed token the server issues, so nobody can read another visitor's conversation by guessing ids.
// Only origins listed on the channel may connect.
import { createHmac, randomUUID } from 'node:crypto';
import { Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type OnGatewayConnection, type OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { safeEqual } from '../auth/tokens.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../core/prisma.service.js';
import { InboxEvents, type MessageView } from './inbox.events.js';
import { type Attribution, InboxService } from './inbox.service.js';

const MAX_TEXT = 2000;
const BURST = { messages: 10, perMs: 10_000 };

interface VisitorData {
  shopId: string;
  channelId: string;
  visitorId: string;
  sent: number[];
  attribution?: Attribution;
}

/** ?ref= / utm_* sent by the widget: short codes only, anything else is dropped. */
function attributionOf(raw: unknown): Attribution | undefined {
  const a = (raw ?? {}) as { ref?: unknown; src?: unknown };
  const code = (v: unknown) => (typeof v === 'string' && /^[\w.~%+-]{1,100}$/.test(v) ? v : undefined);
  const ref = code(a.ref);
  const src = code(a.src)?.toLowerCase();
  return ref || src ? { ...(ref ? { ref } : {}), src: src ?? 'website' } : undefined;
}

export const visitorRoom = (channelId: string, visitorId: string) => `visitor:${channelId}:${visitorId}`;

@WebSocketGateway({ namespace: '/webchat', cors: { origin: true } })
export class WebchatGateway implements OnGatewayInit, OnGatewayConnection, OnModuleInit {
  @WebSocketServer() private server!: Namespace;
  private readonly logger = new Logger(WebchatGateway.name);
  private readonly secret: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly events: InboxEvents,
  ) {
    this.secret = `webchat:${config.get('JWT_REFRESH_SECRET', { infer: true })}`;
  }

  private sign(visitorId: string) {
    return `${visitorId}.${createHmac('sha256', this.secret).update(visitorId).digest('base64url')}`;
  }

  private verify(token: unknown): string | null {
    if (typeof token !== 'string') return null;
    const [id, mac] = token.split('.');
    return id && mac && safeEqual(this.sign(id), token) ? id : null;
  }

  afterInit(server: Namespace) {
    server.use(async (socket, next) => {
      try {
        const { siteKey, visitorToken, attribution } = socket.handshake.auth as { siteKey?: string; visitorToken?: string; attribution?: unknown };
        const channel = typeof siteKey === 'string' ? await this.prisma.system.channel.findUnique({ where: { platform_externalId: { platform: 'WEBCHAT', externalId: siteKey } } }) : null;
        if (!channel || channel.status !== 'CONNECTED') return next(new Error('SITE_NOT_FOUND'));
        const allowed = ((channel.botConfig as { allowedOrigins?: string[] })?.allowedOrigins ?? []).map((o) => o.replace(/\/$/, ''));
        const origin = socket.handshake.headers.origin;
        if (allowed.length && (!origin || !allowed.includes(origin))) return next(new Error('ORIGIN_NOT_ALLOWED'));
        const visitorId = this.verify(visitorToken) ?? randomUUID();
        socket.data = { shopId: channel.shopId, channelId: channel.id, visitorId, sent: [], attribution: attributionOf(attribution) } satisfies VisitorData;
        next();
      } catch (err) {
        next(err as Error);
      }
    });
  }

  async handleConnection(socket: Socket) {
    const data = socket.data as VisitorData | undefined;
    if (!data) return;
    await socket.join(visitorRoom(data.channelId, data.visitorId));
    const history = await this.inbox.visitorHistory(data.shopId, data.channelId, data.visitorId);
    socket.emit('session', { visitorToken: this.sign(data.visitorId), history: history.map((m) => this.publicMessage(m)) });

    socket.on('message', async (payload: { clientId?: unknown; text?: unknown; name?: unknown; email?: unknown; phone?: unknown }, ack?: (r: unknown) => void) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
      const clientId = typeof payload?.clientId === 'string' && /^[\w-]{6,64}$/.test(payload.clientId) ? payload.clientId : null;
      if (!text || text.length > MAX_TEXT || !clientId) return reply({ ok: false, error: 'INVALID_MESSAGE' });
      const now = Date.now();
      data.sent = data.sent.filter((t) => now - t < BURST.perMs);
      if (data.sent.length >= BURST.messages) return reply({ ok: false, error: 'TOO_FAST' });
      data.sent.push(now);
      const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
      try {
        const result = await this.inbox.receiveInbound({
          shopId: data.shopId,
          channelId: data.channelId,
          platform: 'WEBCHAT',
          externalUserId: data.visitorId,
          externalMessageId: clientId,
          text,
          displayName: str(payload.name, 100),
          profile: { email: str(payload.email, 254), phone: str(payload.phone, 20) },
          attribution: data.attribution ?? { src: 'website' },
        });
        reply({ ok: true, duplicate: result === null, message: result?.message });
      } catch (err) {
        this.logger.error(`Webchat nhận tin thất bại: ${(err as Error).message}`);
        reply({ ok: false, error: 'SERVER_ERROR' });
      }
    });

    socket.on('typing', async () => {
      const identity = await this.prisma.db.customerIdentity.findFirst({ where: { shopId: data.shopId, channelId: data.channelId, externalUserId: data.visitorId } });
      const conv = identity ? await this.prisma.db.conversation.findFirst({ where: { shopId: data.shopId, identityId: identity.id, status: 'open' } }) : null;
      if (conv)
        this.events.emit('typing', {
          conversation: { id: conv.id, shopId: conv.shopId, channelId: conv.channelId, identityId: conv.identityId, assigneeId: conv.assigneeId, externalUserId: data.visitorId },
          from: 'customer',
        });
    });
  }

  onModuleInit() {
    // Agent replies and "seen" go back to the visitor's room.
    this.inbox.registerSender('WEBCHAT', {
      send: async () => {
        /* delivery happens on the 'message' event below, once the message is stored */
      },
    });
    this.events.on('message', ({ conversation, message }) => {
      if (message.sender !== 'CUSTOMER') this.toVisitor(conversation.channelId, conversation.externalUserId, 'message', this.publicMessage(message));
    });
    this.events.on('conversation', ({ conversation, change }) => {
      if (change.seenAt) this.toVisitor(conversation.channelId, conversation.externalUserId, 'seen', { at: change.seenAt });
    });
    this.events.on('typing', ({ conversation, from }) => {
      if (from === 'agent') void this.typingToVisitor(conversation.shopId, conversation.identityId, conversation.channelId);
    });
  }

  private async typingToVisitor(shopId: string, identityId: string, channelId: string) {
    const identity = await this.prisma.db.customerIdentity.findFirst({ where: { shopId, id: identityId }, select: { externalUserId: true } });
    if (identity) this.toVisitor(channelId, identity.externalUserId, 'typing', {});
  }

  private toVisitor(channelId: string, visitorId: string, event: string, payload: unknown) {
    if (visitorId) this.server.to(visitorRoom(channelId, visitorId)).emit(event, payload);
  }

  /** What a visitor may see of a message: no internal member ids. */
  private publicMessage(m: MessageView) {
    return { id: m.id, from: m.sender === 'CUSTOMER' ? 'me' : 'shop', text: m.text, createdAt: m.createdAt };
  }
}
