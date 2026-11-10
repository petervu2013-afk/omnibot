// AUTH-15/16: who gets a new conversation. The shop's assignMode decides:
//   MANUAL              – nobody; a Manager assigns by hand.
//   FIRST_VIEW          – the first Sale who opens it (claim()).
//   ROUND_ROBIN_ONLINE  – the Sale online on Livechat who waited longest since their last lead.
//   ROUND_ROBIN_ALL     – the same among all Sales, online or not.
// Only active Sales with "receives leads" on and inside one of their shifts are candidates. A returning customer goes
// back to their own Sale when that Sale is a candidate. One assignment at a time per shop (advisory lock), so two
// conversations arriving together never both go to the same "next" Sale.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service.js';
import { onShift } from '../shop/shifts.js';

type Tx = Parameters<Parameters<PrismaService['db']['$transaction']>[0]>[0];

@Injectable()
export class RoutingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sales who may receive a lead now, in round-robin order (longest wait first). */
  private async candidates(tx: Tx, shopId: string, timezone: string, onlineOnly: boolean, at: Date) {
    const members = await tx.shopMember.findMany({
      where: { shopId, role: 'SALE', status: 'ACTIVE', receivesLeads: true, ...(onlineOnly ? { isOnline: true } : {}) },
      select: { id: true, lastAssignedAt: true },
      orderBy: [{ lastAssignedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    });
    if (!members.length) return [];
    const shifts = await tx.workShift.findMany({ where: { shopId, memberId: { in: members.map((m) => m.id) } } });
    return members.filter((m) =>
      onShift(
        shifts.filter((s) => s.memberId === m.id),
        timezone,
        at,
      ),
    );
  }

  private async give(tx: Tx, shopId: string, conversationId: string, customerId: string, memberId: string, at: Date) {
    const { count } = await tx.conversation.updateMany({ where: { shopId, id: conversationId, assigneeId: null }, data: { assigneeId: memberId } });
    if (!count) return false;
    await tx.shopMember.update({ where: { shopId, id: memberId }, data: { lastAssignedAt: at } });
    // The first Sale to get the customer becomes their owner (lead), so the customer and orders follow.
    await tx.customer.updateMany({ where: { shopId, id: customerId, ownerId: null }, data: { ownerId: memberId } });
    return true;
  }

  private lock(tx: Tx, shopId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`assign:${shopId}`}))`;
  }

  /** Assigns an unassigned conversation by the shop's mode. Returns the new assignee, or null when nobody gets it. */
  async autoAssign(shopId: string, conversationId: string, at = new Date()): Promise<string | null> {
    return this.prisma.db.$transaction(async (tx) => {
      await this.lock(tx, shopId);
      const conv = await tx.conversation.findFirst({ where: { shopId, id: conversationId }, select: { assigneeId: true, customerId: true, status: true } });
      if (!conv || conv.assigneeId || conv.status !== 'open') return null;
      const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { assignMode: true, timezone: true } });
      if (!shop || shop.assignMode === 'MANUAL') return null;
      const list = await this.candidates(tx, shopId, shop.timezone, shop.assignMode === 'ROUND_ROBIN_ONLINE', at);
      const customer = await tx.customer.findFirst({ where: { shopId, id: conv.customerId }, select: { ownerId: true } });
      const owner = customer?.ownerId ? list.find((m) => m.id === customer.ownerId) : undefined;
      const pick = owner ?? (shop.assignMode === 'FIRST_VIEW' ? undefined : list[0]);
      if (!pick) return null;
      return (await this.give(tx, shopId, conversationId, conv.customerId, pick.id, at)) ? pick.id : null;
    });
  }

  /** FIRST_VIEW: the Sale opening an unassigned conversation takes it, if they may receive leads now. */
  async claim(shopId: string, memberId: string, conversationId: string, at = new Date()): Promise<boolean> {
    return this.prisma.db.$transaction(async (tx) => {
      await this.lock(tx, shopId);
      const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { assignMode: true, timezone: true } });
      if (shop?.assignMode !== 'FIRST_VIEW') return false;
      if (!(await this.candidates(tx, shopId, shop.timezone, false, at)).some((m) => m.id === memberId)) return false;
      const conv = await tx.conversation.findFirst({ where: { shopId, id: conversationId, assigneeId: null, status: 'open' }, select: { customerId: true } });
      return conv ? this.give(tx, shopId, conversationId, conv.customerId, memberId, at) : false;
    });
  }

  /** Open conversations still waiting for a Sale, oldest first (assigned when someone comes online). */
  waiting(shopId: string, limit = 50) {
    return this.prisma.db.conversation.findMany({ where: { shopId, assigneeId: null, status: 'open' }, orderBy: { createdAt: 'asc' }, take: limit, select: { id: true } });
  }
}
