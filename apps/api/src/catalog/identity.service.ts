// ID-01 identity resolution. A person who writes from several channels ends up with one customer profile:
//   - same normalized phone or email in the same shop → merged automatically into the older profile;
//   - same name (ignoring accents and case) but no conflicting phone/email → suggested for staff to review.
// Every merge is logged with exactly what moved, so it can be undone.
import { HttpException, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { apiError } from '../common/api-error.js';
import { PrismaService } from '../core/prisma.service.js';
import { normalizeEmail, normalizePhone } from './contact.js';

type CustomerRow = NonNullable<Awaited<ReturnType<PrismaService['system']['customer']['findFirst']>>>;

/** Fields copied from the merged profile when the surviving one has none. Kept together where they belong. */
const FILL_GROUPS: (keyof CustomerRow)[][] = [['phone', 'phoneNormalized', 'phoneAt'], ['email', 'emailNormalized'], ['address'], ['ownerId'], ['campaignId'], ['ref'], ['src'], ['interestProductId']];
/** Placeholder names given to unknown chat visitors: never a reason to suggest a merge. */
const GENERIC_NAMES = ['khach', 'khach moi', 'khach hang', 'guest', 'unknown'];

interface Snapshot {
  identities: string[];
  conversations: string[];
  orders: string[];
  activities: string[];
  tasks: string[];
  consents: string[];
  broadcastRecipients: string[];
  loyalty: { movedAccountId?: string; fromAccountId?: string; intoAccountId?: string; points?: number; transactions?: string[] };
  /** Surviving profile's fields before → after the merge. */
  intoBefore: Record<string, unknown>;
  intoAfter: Record<string, unknown>;
  addedTags: string[];
}

export interface MergeResult {
  logId: string;
  fromId: string;
  intoId: string;
  matchedBy: 'phone' | 'email' | 'manual';
}

const pair = (x: string, y: string) => (x < y ? { aId: x, bId: y } : { aId: y, bId: x });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Normalized phone/email, or a 400 naming the bad field. undefined = not given. */
  contact(input: { phone?: string | null; email?: string | null }) {
    const out: { phone?: string | null; phoneNormalized?: string | null; phoneAt?: Date; email?: string | null; emailNormalized?: string | null } = {};
    const bad = (field: string, message: string) => apiError(400, 'VALIDATION_FAILED', 'Dữ liệu gửi lên không hợp lệ.', [{ field, message }]);
    if (input.phone !== undefined) {
      const phone = input.phone?.trim() || null;
      const normalized = phone ? normalizePhone(phone) : null;
      if (phone && !normalized) throw bad('phone', 'Số điện thoại không hợp lệ');
      Object.assign(out, { phone, phoneNormalized: normalized, ...(phone ? { phoneAt: new Date() } : {}) });
    }
    if (input.email !== undefined) {
      const email = input.email?.trim() || null;
      const normalized = email ? normalizeEmail(email) : null;
      if (email && !normalized) throw bad('email', 'Email không hợp lệ');
      Object.assign(out, { email, emailNormalized: normalized });
    }
    return out;
  }

  /** Other active profiles in the shop sharing this phone or email, oldest first. */
  async duplicates(shopId: string, exceptId: string | null, phoneNormalized?: string | null, emailNormalized?: string | null) {
    const or = [...(phoneNormalized ? [{ phoneNormalized }] : []), ...(emailNormalized ? [{ emailNormalized }] : [])];
    if (!or.length) return [];
    return this.prisma.db.customer.findMany({
      where: { shopId, mergedIntoId: null, OR: or, ...(exceptId ? { id: { not: exceptId } } : {}) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Merges every profile sharing this one's phone or email, the newer into the older. Returns the surviving id and
   * the merges done. Safe to call when there is nothing to merge.
   */
  async autoMerge(shopId: string, customerId: string, actorId: string | null): Promise<{ customerId: string; merges: MergeResult[] }> {
    const merges: MergeResult[] = [];
    let current = customerId;
    for (let i = 0; i < 5; i++) {
      const me = await this.prisma.db.customer.findFirst({ where: { shopId, id: current } });
      if (!me || me.mergedIntoId) return { customerId: me?.mergedIntoId ?? current, merges };
      const dups = await this.duplicates(shopId, me.id, me.phoneNormalized, me.emailNormalized);
      // Pairs staff split again or marked "not the same person" are never merged automatically.
      const dismissed = dups.length ? await this.prisma.db.customerMergeDismissal.findMany({ where: { shopId, OR: [{ aId: me.id }, { bId: me.id }] }, select: { aId: true, bId: true } }) : [];
      const other = dups.find((d) => !dismissed.some((x) => x.aId === d.id || x.bId === d.id));
      if (!other) break;
      const matchedBy = me.phoneNormalized && other.phoneNormalized === me.phoneNormalized ? 'phone' : 'email';
      const older = other.createdAt < me.createdAt || (other.createdAt.getTime() === me.createdAt.getTime() && other.id < me.id);
      const [from, into] = older ? [me.id, other.id] : [other.id, me.id];
      const result = await this.merge(shopId, from, into, { matchedBy, auto: true, actorId }).catch((err: unknown) => {
        // Another request merged one of the two meanwhile: look again.
        if (err instanceof HttpException && (err.getResponse() as { code?: string }).code === 'MERGE_CONFLICT') return null;
        throw err;
      });
      if (result) merges.push(result);
      current = into;
    }
    return { customerId: current, merges };
  }

  /** Sets phone/email a channel gave us (only where the profile has none), then merges duplicates. */
  async attachContact(shopId: string, customerId: string, input: { phone?: string; email?: string }) {
    const customer = await this.prisma.db.customer.findFirst({ where: { shopId, id: customerId } });
    if (!customer) return { customerId, merges: [] };
    const phoneNormalized = input.phone ? normalizePhone(input.phone) : null;
    const emailNormalized = input.email ? normalizeEmail(input.email) : null;
    const data = {
      ...(phoneNormalized && !customer.phoneNormalized ? { phone: input.phone!.trim(), phoneNormalized, phoneAt: new Date() } : {}),
      ...(emailNormalized && !customer.emailNormalized ? { email: input.email!.trim(), emailNormalized } : {}),
    };
    if (!Object.keys(data).length) return { customerId, merges: [] };
    await this.prisma.db.customer.update({ where: { shopId, id: customerId }, data });
    return this.autoMerge(shopId, customerId, null);
  }

  /** Moves everything of `fromId` onto `intoId` in one transaction; `fromId` stays as a pointer for undo. */
  async merge(shopId: string, fromId: string, intoId: string, opts: { matchedBy: 'phone' | 'email' | 'manual'; auto: boolean; actorId: string | null }): Promise<MergeResult> {
    if (fromId === intoId) throw apiError(400, 'MERGE_SAME_CUSTOMER', 'Không thể gộp một hồ sơ với chính nó.');
    return this.prisma.db.$transaction(async (tx) => {
      // One merge or undo at a time per shop, so two requests never move the same rows in different directions.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`merge:${shopId}`}))`;
      const [from, into] = await Promise.all([tx.customer.findFirst({ where: { shopId, id: fromId } }), tx.customer.findFirst({ where: { shopId, id: intoId } })]);
      if (!from || !into) throw apiError(404, 'CUSTOMER_NOT_FOUND', 'Không tìm thấy khách hàng.');
      if (from.mergedIntoId || into.mergedIntoId) throw apiError(409, 'MERGE_CONFLICT', 'Một trong hai hồ sơ đã được gộp vào hồ sơ khác.');

      const move = async (model: 'customerIdentity' | 'conversation' | 'order' | 'activity' | 'task' | 'consentRecord') => {
        const delegate = tx[model] as unknown as {
          findMany(a: object): Promise<{ id: string }[]>;
          updateMany(a: object): Promise<unknown>;
        };
        const ids = (await delegate.findMany({ where: { shopId, customerId: fromId }, select: { id: true } })).map((r) => r.id);
        if (ids.length) await delegate.updateMany({ where: { shopId, id: { in: ids } }, data: { customerId: intoId } });
        return ids;
      };
      const snapshot: Snapshot = {
        identities: await move('customerIdentity'),
        conversations: await move('conversation'),
        orders: await move('order'),
        activities: await move('activity'),
        tasks: await move('task'),
        consents: await move('consentRecord'),
        broadcastRecipients: [],
        loyalty: {},
        intoBefore: {},
        intoAfter: {},
        addedTags: [],
      };

      // Broadcast receipts: one per broadcast and customer; if both got the same broadcast, the old receipt stays put.
      const intoBroadcasts = new Set((await tx.broadcastRecipient.findMany({ where: { customerId: intoId }, select: { broadcastId: true } })).map((r) => r.broadcastId));
      const movable = (await tx.broadcastRecipient.findMany({ where: { customerId: fromId }, select: { id: true, broadcastId: true } })).filter((r) => !intoBroadcasts.has(r.broadcastId));
      if (movable.length) await tx.broadcastRecipient.updateMany({ where: { id: { in: movable.map((r) => r.id) } }, data: { customerId: intoId } });
      snapshot.broadcastRecipients = movable.map((r) => r.id);

      // Loyalty points add up.
      const [fromAcc, intoAcc] = await Promise.all([tx.loyaltyAccount.findFirst({ where: { shopId, customerId: fromId } }), tx.loyaltyAccount.findFirst({ where: { shopId, customerId: intoId } })]);
      if (fromAcc && !intoAcc) {
        await tx.loyaltyAccount.update({ where: { shopId, id: fromAcc.id }, data: { customerId: intoId } });
        snapshot.loyalty = { movedAccountId: fromAcc.id };
      } else if (fromAcc && intoAcc) {
        const txIds = (await tx.loyaltyTransaction.findMany({ where: { accountId: fromAcc.id }, select: { id: true } })).map((r) => r.id);
        if (txIds.length) await tx.loyaltyTransaction.updateMany({ where: { id: { in: txIds } }, data: { accountId: intoAcc.id } });
        await tx.loyaltyAccount.update({ where: { shopId, id: intoAcc.id }, data: { points: { increment: fromAcc.points } } });
        await tx.loyaltyAccount.update({ where: { shopId, id: fromAcc.id }, data: { points: 0 } });
        snapshot.loyalty = { fromAccountId: fromAcc.id, intoAccountId: intoAcc.id, points: fromAcc.points, transactions: txIds };
      }

      // Fill what the surviving profile does not know yet.
      const data: Record<string, unknown> = {};
      for (const group of FILL_GROUPS) {
        if (into[group[0]!] === null && from[group[0]!] !== null) for (const f of group) data[f] = from[f];
      }
      snapshot.addedTags = from.tags.filter((t) => !into.tags.includes(t));
      if (snapshot.addedTags.length) data.tags = [...into.tags, ...snapshot.addedTags];
      if (from.firstSeenAt < into.firstSeenAt) data.firstSeenAt = from.firstSeenAt;
      if (into.stage === 'NEW' && from.stage !== 'NEW') Object.assign(data, { stage: from.stage, stageChangedAt: from.stageChangedAt });
      if (from.marketingOptOut && !into.marketingOptOut) data.marketingOptOut = true; // an opt-out is never lost
      for (const key of Object.keys(data)) {
        snapshot.intoBefore[key] = into[key as keyof CustomerRow];
        snapshot.intoAfter[key] = data[key];
      }
      if (Object.keys(data).length) await tx.customer.update({ where: { shopId, id: intoId }, data });
      await tx.customer.update({ where: { shopId, id: fromId }, data: { mergedIntoId: intoId } });

      const log = await tx.customerMergeLog.create({
        data: { shopId, fromId, intoId, matchedBy: opts.matchedBy, auto: opts.auto, actorId: opts.actorId, snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue },
      });
      return { logId: log.id, fromId, intoId, matchedBy: opts.matchedBy };
    });
  }

  /** Splits a merge again: moved rows go back, filled-in fields are cleared unless edited since. */
  async undo(shopId: string, logId: string, actorId: string | null) {
    return this.prisma.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`merge:${shopId}`}))`;
      const log = await tx.customerMergeLog.findFirst({ where: { shopId, id: logId } });
      if (!log) throw apiError(404, 'MERGE_NOT_FOUND', 'Không tìm thấy lần gộp này.');
      if (log.undoneAt) throw apiError(409, 'MERGE_ALREADY_UNDONE', 'Lần gộp này đã được tách lại.');
      const [from, into] = await Promise.all([tx.customer.findFirst({ where: { shopId, id: log.fromId } }), tx.customer.findFirst({ where: { shopId, id: log.intoId } })]);
      if (!from || !into || from.mergedIntoId !== into.id) throw apiError(409, 'MERGE_UNDO_BLOCKED', 'Không tách được: hồ sơ đã thay đổi sau lần gộp này.');
      if (into.mergedIntoId) throw apiError(409, 'MERGE_UNDO_BLOCKED', 'Hồ sơ đích đã được gộp tiếp vào hồ sơ khác; hãy tách lần gộp sau trước.');
      const s = log.snapshot as unknown as Snapshot;

      const back = async (model: 'customerIdentity' | 'conversation' | 'order' | 'activity' | 'task' | 'consentRecord', ids: string[]) => {
        if (!ids.length) return;
        const delegate = tx[model] as unknown as { updateMany(a: object): Promise<unknown> };
        await delegate.updateMany({ where: { shopId, id: { in: ids }, customerId: into.id }, data: { customerId: from.id } });
      };
      await back('customerIdentity', s.identities);
      await back('conversation', s.conversations);
      // Conversations belong to a channel identity: one opened after the merge (e.g. by the very message that caused
      // it) goes back with its identity too.
      if (s.identities.length) await tx.conversation.updateMany({ where: { shopId, identityId: { in: s.identities }, customerId: into.id }, data: { customerId: from.id } });
      await back('order', s.orders);
      await back('activity', s.activities);
      await back('task', s.tasks);
      await back('consentRecord', s.consents);
      if (s.broadcastRecipients.length) await tx.broadcastRecipient.updateMany({ where: { id: { in: s.broadcastRecipients }, customerId: into.id }, data: { customerId: from.id } });
      if (s.loyalty.movedAccountId) await tx.loyaltyAccount.update({ where: { shopId, id: s.loyalty.movedAccountId }, data: { customerId: from.id } });
      if (s.loyalty.fromAccountId && s.loyalty.intoAccountId) {
        if (s.loyalty.transactions?.length) await tx.loyaltyTransaction.updateMany({ where: { id: { in: s.loyalty.transactions } }, data: { accountId: s.loyalty.fromAccountId } });
        await tx.loyaltyAccount.update({ where: { shopId, id: s.loyalty.intoAccountId }, data: { points: { decrement: s.loyalty.points ?? 0 } } });
        await tx.loyaltyAccount.update({ where: { shopId, id: s.loyalty.fromAccountId }, data: { points: s.loyalty.points ?? 0 } });
      }

      const restore: Record<string, unknown> = {};
      for (const [key, after] of Object.entries(s.intoAfter)) {
        if (key === 'tags') continue;
        const now = into[key as keyof CustomerRow];
        const comparable = now instanceof Date ? now.toISOString() : now;
        const was = s.intoBefore[key];
        if (same(comparable, after instanceof Date ? after.toISOString() : after)) restore[key] = typeof was === 'string' && /^\d{4}-\d\d-\d\dT/.test(was) ? new Date(was) : was;
      }
      if (s.addedTags.length) restore.tags = into.tags.filter((t) => !s.addedTags.includes(t));
      if (Object.keys(restore).length) await tx.customer.update({ where: { shopId, id: into.id }, data: restore });
      await tx.customer.update({ where: { shopId, id: from.id }, data: { mergedIntoId: null } });
      await tx.customerMergeLog.update({ where: { shopId, id: log.id }, data: { undoneAt: new Date(), undoneById: actorId } });
      // Staff said these are two people: do not suggest them again.
      await tx.customerMergeDismissal.upsert({ where: { shopId_aId_bId: { shopId, ...pair(from.id, into.id) } }, create: { shopId, ...pair(from.id, into.id), actorId }, update: {} });
      return { fromId: from.id, intoId: into.id };
    });
  }

  /** Possible duplicates for staff to review: same name (accents/case ignored), no conflicting phone or email. */
  async suggestions(shopId: string, limit = 50) {
    const rows = await this.prisma.system.$queryRaw<{ a_id: string; b_id: string }[]>`
      SELECT a.id AS a_id, b.id AS b_id
      FROM "Customer" a
      JOIN "Customer" b ON b."shopId" = a."shopId" AND b."nameKey" = a."nameKey" AND a.id < b.id
      WHERE a."shopId" = ${shopId}
        AND a."mergedIntoId" IS NULL AND b."mergedIntoId" IS NULL
        AND a."nameKey" IS NOT NULL AND a."nameKey" <> ALL (${GENERIC_NAMES})
        AND NOT (a."phoneNormalized" IS NOT NULL AND b."phoneNormalized" IS NOT NULL AND a."phoneNormalized" <> b."phoneNormalized")
        AND NOT (a."emailNormalized" IS NOT NULL AND b."emailNormalized" IS NOT NULL AND a."emailNormalized" <> b."emailNormalized")
        AND NOT EXISTS (SELECT 1 FROM "CustomerMergeDismissal" d WHERE d."shopId" = a."shopId" AND d."aId" = a.id AND d."bId" = b.id)
      ORDER BY GREATEST(a."createdAt", b."createdAt") DESC
      LIMIT ${limit}`;
    if (!rows.length) return [];
    const ids = [...new Set(rows.flatMap((r) => [r.a_id, r.b_id]))];
    const [customers, identities] = await Promise.all([
      this.prisma.db.customer.findMany({ where: { shopId, id: { in: ids } }, select: { id: true, name: true, phone: true, email: true, createdAt: true } }),
      this.prisma.db.customerIdentity.findMany({ where: { shopId, customerId: { in: ids } }, select: { customerId: true, channelId: true } }),
    ]);
    const channels = await this.prisma.db.channel.findMany({ where: { shopId, id: { in: [...new Set(identities.map((i) => i.channelId))] } }, select: { id: true, platform: true, name: true } });
    const channelOf = new Map(channels.map((c) => [c.id, c]));
    const view = (id: string) => {
      const c = customers.find((x) => x.id === id)!;
      return {
        ...c,
        channels: identities
          .filter((i) => i.customerId === id)
          .map((i) => channelOf.get(i.channelId))
          .filter(Boolean),
      };
    };
    return rows.map((r) => {
      const [a, b] = [view(r.a_id), view(r.b_id)];
      // Suggest keeping the older profile.
      const [from, into] = a.createdAt <= b.createdAt ? [b, a] : [a, b];
      return { from, into, reason: 'name' as const };
    });
  }

  async dismiss(shopId: string, aId: string, bId: string, actorId: string | null) {
    const found = await this.prisma.db.customer.count({ where: { shopId, id: { in: [aId, bId] } } });
    if (found !== 2 || aId === bId) throw apiError(404, 'CUSTOMER_NOT_FOUND', 'Không tìm thấy khách hàng.');
    const key = pair(aId, bId);
    await this.prisma.db.customerMergeDismissal.upsert({ where: { shopId_aId_bId: { shopId, ...key } }, create: { shopId, ...key, actorId }, update: {} });
  }

  /** Channels, conversations, order totals and merge history of one profile (the 360° header). */
  async profile(shopId: string, customerId: string) {
    const [identities, conversations, orders, merges] = await Promise.all([
      this.prisma.db.customerIdentity.findMany({ where: { shopId, customerId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.db.conversation.findMany({
        where: { shopId, customerId },
        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        select: { id: true, channelId: true, status: true, lastMessageAt: true, assigneeId: true },
      }),
      this.prisma.db.order.aggregate({ where: { shopId, customerId }, _count: { _all: true }, _sum: { total: true } }),
      this.prisma.db.customerMergeLog.findMany({ where: { shopId, intoId: customerId, undoneAt: null }, orderBy: { createdAt: 'desc' } }),
    ]);
    const channelIds = [...new Set([...identities.map((i) => i.channelId), ...conversations.map((c) => c.channelId)])];
    const [channels, fromCustomers] = await Promise.all([
      this.prisma.db.channel.findMany({ where: { shopId, id: { in: channelIds } }, select: { id: true, platform: true, name: true } }),
      this.prisma.db.customer.findMany({ where: { shopId, id: { in: merges.map((m) => m.fromId) } }, select: { id: true, name: true } }),
    ]);
    const channelOf = new Map(channels.map((c) => [c.id, c]));
    return {
      identities: identities.map((i) => ({ id: i.id, displayName: i.displayName, channel: channelOf.get(i.channelId) ?? null, createdAt: i.createdAt })),
      conversations: conversations.map((c) => ({ ...c, channel: channelOf.get(c.channelId) ?? null })),
      orders: { count: orders._count._all, total: Number(orders._sum.total ?? 0) },
      merges: merges.map((m) => ({ id: m.id, fromId: m.fromId, fromName: fromCustomers.find((c) => c.id === m.fromId)?.name ?? null, matchedBy: m.matchedBy, auto: m.auto, createdAt: m.createdAt })),
    };
  }
}
