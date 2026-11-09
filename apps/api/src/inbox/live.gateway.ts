// Socket.io namespace /live for staff. A socket authenticates with its access token and a shopId, then receives the
// events of that shop's conversations it may see under its data scope. Membership and session are re-checked every
// 30 seconds, so a revoked session, a disabled member or a role change takes effect on open sockets too.
// A member with at least one open socket is "online on Livechat" (AUTH-16 round robin among online Sales).
import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type OnGatewayConnection, type OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AccessTokenService } from '../auth/access-token.service.js';
import { SessionService } from '../auth/session.service.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../core/prisma.service.js';
import { inScope } from '../shop/data-scope.js';
import type { MemberContext } from '../shop/permission.guard.js';
import { roleHas } from '../shop/permissions.js';
import { type ConversationSummary, InboxEvents } from './inbox.events.js';
import { InboxService } from './inbox.service.js';

const RECHECK_MS = 30_000;

interface LiveData {
  userId: string;
  familyId: string;
  member: MemberContext;
}

@WebSocketGateway({ namespace: '/live', cors: { origin: true, credentials: true } })
export class LiveGateway implements OnGatewayInit, OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() private server!: Namespace;
  private readonly logger = new Logger(LiveGateway.name);
  private readonly allowedOrigins: string[];
  private timer?: NodeJS.Timeout;
  /** Open sockets per member (one API instance; a shared store comes with scaling out, Step 16). */
  private readonly sockets = new Map<string, number>();
  /** Presence writes per member run one after another, so a quick connect + disconnect cannot end up "online". */
  private readonly presenceQueue = new Map<string, Promise<void>>();

  constructor(
    config: ConfigService<Env, true>,
    private readonly tokens: AccessTokenService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly events: InboxEvents,
    private readonly inbox: InboxService,
  ) {
    this.allowedOrigins = config.get('CORS_ORIGINS', { infer: true });
  }

  private async member(userId: string, shopId: string): Promise<MemberContext | null> {
    const m = await this.prisma.db.shopMember.findUnique({
      where: { shopId_userId: { shopId, userId } },
      include: { shop: { select: { ownerId: true, deletedAt: true, saleDataScope: true } } },
    });
    if (!m || m.status !== 'ACTIVE' || m.shop.deletedAt || !roleHas(m.role, 'chat.reply')) return null;
    return { id: m.id, shopId, userId, role: m.role, isOwner: m.shop.ownerId === userId, saleDataScope: m.shop.saleDataScope };
  }

  afterInit(server: Namespace) {
    // Refuse before the connection is established, so a bad socket never joins a room.
    server.use(async (socket, next) => {
      try {
        const origin = socket.handshake.headers.origin;
        if (origin && !this.allowedOrigins.includes(origin)) return next(new Error('ORIGIN_NOT_ALLOWED'));
        const { token, shopId } = socket.handshake.auth as { token?: string; shopId?: string };
        const claims = token ? await this.tokens.verify(token) : null;
        if (!claims || !(await this.sessions.isActive(claims.sub, claims.sid))) return next(new Error('UNAUTHORIZED'));
        const member = typeof shopId === 'string' ? await this.member(claims.sub, shopId) : null;
        if (!member) return next(new Error('FORBIDDEN'));
        socket.data = { userId: claims.sub, familyId: claims.sid, member } satisfies LiveData;
        next();
      } catch (err) {
        next(err as Error);
      }
    });
  }

  handleConnection(socket: Socket) {
    const data = socket.data as LiveData | undefined;
    if (!data) return;
    void socket.join(`shop:${data.member.shopId}`);
    const { id: memberId, shopId } = data.member;
    const open = (this.sockets.get(memberId) ?? 0) + 1;
    this.sockets.set(memberId, open);
    if (open === 1) this.queuePresence(shopId, memberId);
    socket.on('disconnect', () => {
      const left = (this.sockets.get(memberId) ?? 1) - 1;
      if (left > 0) return void this.sockets.set(memberId, left);
      this.sockets.delete(memberId);
      this.queuePresence(shopId, memberId);
    });
    let last = 0;
    socket.on('typing', (payload: { conversationId?: unknown }) => {
      const now = Date.now();
      if (typeof payload?.conversationId !== 'string' || now - last < 2_000) return;
      last = now;
      void this.agentTyping(socket, payload.conversationId);
    });
  }

  private queuePresence(shopId: string, memberId: string) {
    const next = (this.presenceQueue.get(memberId) ?? Promise.resolve()).then(() => this.presence(shopId, memberId, this.sockets.has(memberId)));
    this.presenceQueue.set(memberId, next);
    void next.finally(() => {
      if (this.presenceQueue.get(memberId) === next) this.presenceQueue.delete(memberId);
    });
  }

  /** Saves online/offline, tells the shop's staff, and gives waiting conversations to a Sale who just came online. */
  private async presence(shopId: string, memberId: string, online: boolean) {
    try {
      await this.prisma.db.shopMember.updateMany({ where: { shopId, id: memberId }, data: { isOnline: online } });
      this.server.to(`shop:${shopId}`).emit('presence', { memberId, online });
      if (online) await this.inbox.assignWaiting(shopId);
    } catch (err) {
      this.logger.warn(`Cập nhật trạng thái online thất bại: ${(err as Error).message}`);
    }
  }

  async onModuleInit() {
    // Nobody is connected to a process that just started.
    await this.prisma.system.shopMember.updateMany({ where: { isOnline: true }, data: { isOnline: false } });
    this.events.on('message', ({ conversation, message }) => this.broadcast(conversation, 'message', { conversationId: conversation.id, message }));
    this.events.on('conversation', ({ conversation, change }) => this.broadcast(conversation, 'conversation', { conversationId: conversation.id, change }));
    this.events.on('typing', ({ conversation, from }) => {
      if (from === 'customer') this.broadcast(conversation, 'typing', { conversationId: conversation.id });
    });
    this.timer = setInterval(() => void this.recheck(), RECHECK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private async broadcast(conversation: ConversationSummary, event: string, payload: unknown) {
    // Local sockets only: one API instance for now (a Redis adapter comes with scaling out, Step 16).
    const room = this.server.adapter.rooms.get(`shop:${conversation.shopId}`);
    for (const id of room ?? []) {
      const s = this.server.sockets.get(id);
      if (!s) continue;
      const data = s.data as LiveData;
      if (inScope(data.member, conversation.assigneeId)) s.emit(event, payload);
    }
  }

  private async recheck() {
    for (const s of [...this.server.sockets.values()]) {
      const data = s.data as LiveData;
      const alive = await this.sessions.isActive(data.userId, data.familyId);
      const member = alive ? await this.member(data.userId, data.member.shopId) : null;
      if (!member) {
        s.emit('revoked');
        s.disconnect(true);
      } else {
        data.member = member;
      }
    }
  }

  /** Staff typing indicator, relayed to the webchat visitor. */
  private async agentTyping(socket: Socket, conversationId: string) {
    const data = socket.data as LiveData;
    const conv = await this.inbox.find(data.member, conversationId).catch(() => null);
    if (conv)
      this.events.emit('typing', {
        conversation: { id: conv.id, shopId: conv.shopId, channelId: conv.channelId, identityId: conv.identityId, assigneeId: conv.assigneeId, externalUserId: '' },
        from: 'agent',
        memberId: data.member.id,
      });
  }
}
