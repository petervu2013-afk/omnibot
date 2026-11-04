// CH-05 core: every channel feeds receiveInbound(); agents reply through sendAgentMessage(), which hands the text to
// the channel's sender. Duplicate webhook deliveries are dropped by the unique Message.externalId.
import { Injectable, Logger } from '@nestjs/common';
import { apiError } from '../common/api-error.js';
import { PrismaService } from '../core/prisma.service.js';
import type { ChannelPlatform } from '../generated/prisma/client.js';
import type { MemberContext } from '../shop/permission.guard.js';
import { dataScope } from '../shop/data-scope.js';
import { type ConversationSummary, InboxEvents, type MessageView } from './inbox.events.js';

export interface InboundMessage {
  channelId: string;
  shopId: string;
  platform: ChannelPlatform;
  externalUserId: string; // PSID, Zalo user id, webchat visitor id…
  displayName?: string;
  externalMessageId: string; // platform message id (mid) – used to drop duplicates
  text?: string;
  attachments?: { type: string; url: string }[];
  at?: Date;
  profile?: { email?: string; phone?: string };
}

/** Delivers an agent message to the customer on the channel. Throws when the platform refuses it. */
export interface ChannelSender {
  send(conversation: ConversationSummary, message: MessageView): Promise<void>;
}

const isUnique = (err: unknown) => (err as { code?: string })?.code === 'P2002';
const PREVIEW = 120;

export function messageView(m: { id: string; conversationId: string; sender: string; senderMemberId: string | null; text: string | null; attachments: unknown; createdAt: Date }): MessageView {
  return { id: m.id, conversationId: m.conversationId, sender: m.sender, senderMemberId: m.senderMemberId, text: m.text, attachments: m.attachments ?? null, createdAt: m.createdAt };
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);
  private readonly senders = new Map<ChannelPlatform, ChannelSender>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: InboxEvents,
  ) {}

  registerSender(platform: ChannelPlatform, sender: ChannelSender) {
    this.senders.set(platform, sender);
  }

  private summary(c: { id: string; shopId: string; channelId: string; identityId: string; assigneeId: string | null }, externalUserId: string): ConversationSummary {
    return { id: c.id, shopId: c.shopId, channelId: c.channelId, identityId: c.identityId, assigneeId: c.assigneeId, externalUserId };
  }

  /** Identity for this platform user, creating the customer the first time they write. Safe under concurrent calls. */
  private async identityFor(input: InboundMessage) {
    const { shopId, channelId, externalUserId } = input;
    const existing = await this.prisma.db.customerIdentity.findFirst({ where: { shopId, channelId, externalUserId } });
    if (existing) return existing;
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: { shopId, name: input.displayName?.trim() || 'Khách mới', email: input.profile?.email, emailNormalized: input.profile?.email?.toLowerCase(), phone: input.profile?.phone },
        });
        return tx.customerIdentity.create({ data: { shopId, channelId, externalUserId, customerId: customer.id, displayName: input.displayName } });
      });
    } catch (err) {
      if (!isUnique(err)) throw err;
      return this.prisma.db.customerIdentity.findFirstOrThrow({ where: { shopId, channelId, externalUserId } });
    }
  }

  private async openConversation(shopId: string, channelId: string, identity: { id: string; customerId: string }) {
    const open = await this.prisma.db.conversation.findFirst({ where: { shopId, identityId: identity.id, status: 'open' }, orderBy: { createdAt: 'desc' } });
    return open ?? this.prisma.db.conversation.create({ data: { shopId, channelId, customerId: identity.customerId, identityId: identity.id } });
  }

  /** Returns null for a duplicate delivery. */
  async receiveInbound(input: InboundMessage): Promise<{ conversation: ConversationSummary; message: MessageView } | null> {
    const externalId = `${input.platform}:${input.channelId}:${input.externalMessageId}`;
    if (await this.prisma.db.message.findUnique({ where: { externalId }, select: { id: true } })) return null;
    const identity = await this.identityFor(input);
    const conv = await this.openConversation(input.shopId, input.channelId, identity);
    const at = input.at ?? new Date();
    let created;
    try {
      created = await this.prisma.db.message.create({
        data: { conversationId: conv.id, sender: 'CUSTOMER', text: input.text?.slice(0, 5000), attachments: input.attachments?.length ? input.attachments : undefined, externalId, createdAt: at },
      });
    } catch (err) {
      if (isUnique(err)) return null; // the same delivery raced in parallel
      throw err;
    }
    const updated = await this.prisma.db.conversation.update({
      where: { shopId: input.shopId, id: conv.id },
      data: { unreadCount: { increment: 1 }, lastCustomerMessageAt: at, lastMessageAt: at },
    });
    const result = { conversation: this.summary(updated, input.externalUserId), message: messageView(created) };
    this.events.emit('message', result);
    return result;
  }

  // ---------- agent side (all scoped by the member's data scope) ----------

  private where(member: MemberContext, extra: Record<string, unknown> = {}) {
    return { shopId: member.shopId, ...dataScope(member, 'conversation'), ...extra };
  }

  async find(member: MemberContext, id: string) {
    const conv = await this.prisma.db.conversation.findFirst({ where: this.where(member, { id }) });
    if (!conv) throw apiError(404, 'CONVERSATION_NOT_FOUND', 'Không tìm thấy hội thoại.');
    return conv;
  }

  private async externalUserOf(shopId: string, identityId: string) {
    const identity = await this.prisma.db.customerIdentity.findFirstOrThrow({ where: { shopId, id: identityId }, select: { externalUserId: true } });
    return identity.externalUserId;
  }

  async list(member: MemberContext, q: { filter?: 'all' | 'unread' | 'handoff' | 'mine'; channelId?: string; status?: 'open' | 'closed'; limit: number; cursor?: string }) {
    const extra: Record<string, unknown> = { status: q.status ?? 'open', channelId: q.channelId };
    if (q.filter === 'unread') extra.unreadCount = { gt: 0 };
    if (q.filter === 'handoff') Object.assign(extra, { handoff: true, botActive: false });
    if (q.filter === 'mine') extra.assigneeId = member.id;
    const rows = await this.prisma.db.conversation.findMany({
      where: this.where(member, extra),
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    return { items: await this.decorate(member.shopId, page), nextCursor: rows.length > q.limit ? (page.at(-1)?.id ?? null) : null };
  }

  /** Adds customer, channel, assignee and last message to conversation rows (no relations in the schema). */
  private async decorate(shopId: string, rows: { id: string; channelId: string; customerId: string; assigneeId: string | null }[]) {
    if (!rows.length) return [];
    const [customers, channels, members, lasts] = await Promise.all([
      this.prisma.db.customer.findMany({ where: { shopId, id: { in: rows.map((r) => r.customerId) } }, select: { id: true, name: true, phone: true, tags: true, stage: true } }),
      this.prisma.db.channel.findMany({ where: { shopId, id: { in: rows.map((r) => r.channelId) } }, select: { id: true, name: true, platform: true } }),
      this.prisma.db.shopMember.findMany({ where: { shopId, id: { in: rows.map((r) => r.assigneeId).filter((x): x is string => !!x) } }, select: { id: true, user: { select: { fullName: true } } } }),
      Promise.all(
        rows.map((r) =>
          this.prisma.db.message.findFirst({ where: { conversationId: r.id }, orderBy: { createdAt: 'desc' }, select: { text: true, sender: true, createdAt: true, attachments: true } }),
        ),
      ),
    ]);
    const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
    const cs = byId(customers);
    const ch = byId(channels);
    const ms = byId(members);
    return rows.map((r, i) => {
      const last = lasts[i];
      return {
        ...r,
        customer: cs.get(r.customerId) ?? null,
        channel: ch.get(r.channelId) ?? null,
        assigneeName: r.assigneeId ? (ms.get(r.assigneeId)?.user.fullName ?? null) : null,
        lastMessage: last ? { sender: last.sender, text: last.text?.slice(0, PREVIEW) ?? (last.attachments ? '[Tệp đính kèm]' : ''), createdAt: last.createdAt } : null,
      };
    });
  }

  async detail(member: MemberContext, id: string) {
    const conv = await this.find(member, id);
    return (await this.decorate(member.shopId, [conv]))[0];
  }

  async messages(member: MemberContext, id: string, before?: string, limit = 50) {
    await this.find(member, id);
    const anchor = before ? await this.prisma.db.message.findFirst({ where: { id: before, conversationId: id }, select: { createdAt: true } }) : null;
    const rows = await this.prisma.db.message.findMany({
      where: { conversationId: id, ...(anchor ? { createdAt: { lt: anchor.createdAt } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse().map(messageView);
  }

  async sendAgentMessage(member: MemberContext, id: string, text: string) {
    const conv = await this.find(member, id);
    const channel = await this.prisma.db.channel.findFirst({ where: { shopId: member.shopId, id: conv.channelId }, select: { platform: true, status: true } });
    if (!channel || channel.status === 'DISCONNECTED') throw apiError(409, 'CHANNEL_DISCONNECTED', 'Kênh này đã ngắt kết nối, không gửi được tin.');
    const sender = this.senders.get(channel.platform);
    if (!sender) throw apiError(501, 'CHANNEL_SEND_UNAVAILABLE', 'Chưa gửi được tin qua kênh này.');
    const summary = this.summary(conv, await this.externalUserOf(member.shopId, conv.identityId));
    const draft: MessageView = { id: '', conversationId: id, sender: 'AGENT', senderMemberId: member.id, text, attachments: null, createdAt: new Date() };
    try {
      await sender.send(summary, draft);
    } catch (err) {
      this.logger.warn(`Gửi tin qua ${channel.platform} thất bại: ${(err as Error).message}`);
      throw apiError(502, 'CHANNEL_SEND_FAILED', 'Nền tảng từ chối tin nhắn. Vui lòng thử lại.');
    }
    const created = await this.prisma.db.message.create({ data: { conversationId: id, sender: 'AGENT', senderMemberId: member.id, text } });
    // A human answering takes over from the bot (BOT-01 hands control back explicitly).
    const updated = await this.prisma.db.conversation.update({ where: { shopId: member.shopId, id }, data: { lastMessageAt: created.createdAt, unreadCount: 0, botActive: false } });
    const result = { conversation: { ...summary, assigneeId: updated.assigneeId }, message: messageView(created) };
    this.events.emit('message', result);
    return result.message;
  }

  async markRead(member: MemberContext, id: string) {
    const conv = await this.find(member, id);
    await this.prisma.db.conversation.update({ where: { shopId: member.shopId, id }, data: { unreadCount: 0 } });
    this.events.emit('conversation', { conversation: this.summary(conv, await this.externalUserOf(member.shopId, conv.identityId)), change: { unreadCount: 0, seenAt: new Date() } });
  }

  async update(member: MemberContext, id: string, data: { botActive?: boolean; status?: 'open' | 'closed'; assigneeId?: string | null }) {
    const before = await this.find(member, id);
    if (data.assigneeId) {
      const ok = await this.prisma.db.shopMember.findFirst({ where: { shopId: member.shopId, id: data.assigneeId, status: 'ACTIVE' }, select: { id: true } });
      if (!ok) throw apiError(404, 'MEMBER_NOT_FOUND', 'Không tìm thấy nhân viên.');
    }
    const updated = await this.prisma.db.conversation.update({ where: { shopId: member.shopId, id }, data: { ...data, ...(data.botActive === true ? { handoff: false, handoffReason: null } : {}) } });
    const summary = this.summary(updated, await this.externalUserOf(member.shopId, updated.identityId));
    this.events.emit('conversation', { conversation: { ...summary, assigneeId: before.assigneeId }, change: data });
    // Newly visible to the new assignee: announce under the new owner too.
    if (data.assigneeId !== undefined && data.assigneeId !== before.assigneeId) this.events.emit('conversation', { conversation: summary, change: data });
    return {
      before: { botActive: before.botActive, status: before.status, assigneeId: before.assigneeId },
      after: { botActive: updated.botActive, status: updated.status, assigneeId: updated.assigneeId },
    };
  }

  /** Conversation of a webchat visitor, for history on reconnect. */
  async visitorHistory(shopId: string, channelId: string, externalUserId: string) {
    const identity = await this.prisma.db.customerIdentity.findFirst({ where: { shopId, channelId, externalUserId } });
    if (!identity) return [];
    const conv = await this.prisma.db.conversation.findFirst({ where: { shopId, identityId: identity.id, status: 'open' }, orderBy: { createdAt: 'desc' } });
    if (!conv) return [];
    const rows = await this.prisma.db.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.reverse().map(messageView);
  }
}
