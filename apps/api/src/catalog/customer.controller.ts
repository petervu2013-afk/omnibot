// /v1/shops/:shopId/customers – customers in PostgreSQL. Every read and write goes through dataScope, so a Sale can
// only reach customers allowed by the shop's setting (AUTH-09); anything else answers 404, as if it did not exist.
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { apiError } from '../common/api-error.js';
import { parse } from '../common/validation.js';
import { PrismaService } from '../core/prisma.service.js';
import { Audit, type AuditedRequest } from '../shop/audit.interceptor.js';
import { dataScope, inScope } from '../shop/data-scope.js';
import { currentMember, type MemberContext, Permission, type ShopRequest } from '../shop/permission.guard.js';
import { IdentityService } from './identity.service.js';

const STAGES = ['NEW', 'CONTACTING', 'CONSULTING', 'QUOTED', 'WON', 'NURTURING', 'LOST'] as const;

export { normalizePhone } from './contact.js';

const body = {
  name: z.string().trim().min(1, 'Nhập tên khách hàng').max(200),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.email('Email không hợp lệ').max(254).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  stage: z.enum(STAGES).optional(),
  expectedValue: z.number().int().min(0).nullable().optional(),
};
const createSchema = z.strictObject(body);
const updateSchema = z.strictObject(body).partial();
const assignSchema = z.strictObject({ ownerId: z.string().max(60).nullable() });
const mergeSchema = z.strictObject({ intoId: z.string().min(1).max(60) });
const dismissSchema = z.strictObject({ aId: z.string().min(1).max(60), bId: z.string().min(1).max(60) });
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  stage: z.enum(STAGES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(60).optional(),
});

const missing = () => apiError(404, 'CUSTOMER_NOT_FOUND', 'Không tìm thấy khách hàng.');

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tags: string[];
  stage: string;
  ownerId: string | null;
  expectedValue: unknown;
  firstSeenAt: Date;
  createdAt: Date;
}
const auditView = (c: CustomerRow) => ({ name: c.name, stage: c.stage, ownerId: c.ownerId });

@Permission('customer.access')
@Controller('shops/:shopId/customers')
export class CustomerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  private where(member: MemberContext, extra: Record<string, unknown> = {}) {
    // Merged records live on through the profile they were merged into.
    return { shopId: member.shopId, mergedIntoId: null, ...dataScope(member, 'customer'), ...extra };
  }

  private async find(member: MemberContext, id: string) {
    const row = await this.prisma.db.customer.findFirst({ where: this.where(member, { id }) });
    if (!row) throw missing();
    return row;
  }

  private async withOwners(shopId: string, rows: CustomerRow[]) {
    const ids = [...new Set(rows.map((r) => r.ownerId).filter((x): x is string => !!x))];
    const members = await this.prisma.db.shopMember.findMany({ where: { shopId, id: { in: ids } }, select: { id: true, user: { select: { fullName: true } } } });
    const names = new Map(members.map((m) => [m.id, m.user.fullName]));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      tags: r.tags,
      stage: r.stage,
      ownerId: r.ownerId,
      ownerName: r.ownerId ? (names.get(r.ownerId) ?? null) : null,
      expectedValue: r.expectedValue === null ? null : Number(r.expectedValue),
      firstSeenAt: r.firstSeenAt,
      createdAt: r.createdAt,
    }));
  }

  /** Same phone or email as another profile: checked across the whole shop, so one person never gets two profiles. */
  private exists() {
    return apiError(409, 'CUSTOMER_EXISTS', 'Số điện thoại hoặc email này đã có hồ sơ khách hàng trong cửa hàng.');
  }

  @Get()
  async list(@Query() query: unknown, @Req() req: ShopRequest) {
    const member = currentMember(req);
    const { q, stage, limit, cursor } = parse(listSchema, query);
    const digits = q?.replace(/\D/g, '') ?? '';
    const search = q
      ? { AND: [{ OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] }] }
      : {};
    const rows = await this.prisma.db.customer.findMany({
      where: this.where(member, { stage, ...search }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    return { items: await this.withOwners(member.shopId, page), nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null };
  }

  @Permission('customer.merge')
  @Get('merge-suggestions')
  suggestions(@Req() req: ShopRequest) {
    return this.identity.suggestions(currentMember(req).shopId);
  }

  @Permission('customer.merge')
  @Audit('customer.merge_dismiss')
  @Post('merge-suggestions/dismiss')
  @HttpCode(204)
  async dismiss(@Body() input: unknown, @Req() req: AuditedRequest) {
    const member = currentMember(req);
    const { aId, bId } = parse(dismissSchema, input);
    await this.identity.dismiss(member.shopId, aId, bId, member.id);
    req.audit = { entityType: 'Customer', entityId: aId, after: { notSameAs: bId } };
  }

  /** Splits a merge again (any profile, any Sale scope: only Admin and Manager may). */
  @Permission('customer.merge')
  @Audit('customer.unmerge')
  @Post('merges/:mergeId/undo')
  async undo(@Param('mergeId') mergeId: string, @Req() req: AuditedRequest) {
    const member = currentMember(req);
    const result = await this.identity.undo(member.shopId, mergeId, member.id);
    req.audit = { entityType: 'Customer', entityId: result.intoId, after: { unmerged: result.fromId, mergeId } };
    return result;
  }

  @Get(':customerId')
  async get(@Param('customerId') id: string, @Req() req: ShopRequest) {
    const member = currentMember(req);
    return (await this.withOwners(member.shopId, [await this.find(member, id)]))[0];
  }

  @Audit('customer.create')
  @Post()
  async create(@Body() input: unknown, @Req() req: AuditedRequest) {
    const member = currentMember(req);
    const { phone, email, ...data } = parse(createSchema, input);
    const reach = this.identity.contact({ phone, email });
    if ((await this.identity.duplicates(member.shopId, null, reach.phoneNormalized, reach.emailNormalized)).length) throw this.exists();
    // A Sale owns what they add, otherwise it could fall outside their own scope.
    const row = await this.prisma.db.customer.create({ data: { ...data, ...reach, shopId: member.shopId, ownerId: member.role === 'SALE' ? member.id : null } });
    req.audit = { entityType: 'Customer', entityId: row.id, after: auditView(row) };
    return (await this.withOwners(member.shopId, [row]))[0];
  }

  @Audit('customer.update')
  @Patch(':customerId')
  async update(@Param('customerId') id: string, @Body() input: unknown, @Req() req: AuditedRequest) {
    const member = currentMember(req);
    const { phone, email, ...data } = parse(updateSchema, input);
    const before = await this.find(member, id);
    const reach = this.identity.contact({ phone, email });
    // ID-01: a phone/email another profile already has means the same person → the two are merged. Only when the caller
    // may see that other profile; otherwise it stays a conflict, without saying whose it is.
    const dups = await this.identity.duplicates(member.shopId, id, reach.phoneNormalized, reach.emailNormalized);
    if (dups.some((d) => !inScope(member, d.ownerId))) throw this.exists();
    const row = await this.prisma.db.customer.update({
      where: { shopId: member.shopId, id },
      data: { ...data, ...reach, ...(data.stage && data.stage !== before.stage ? { stageChangedAt: new Date() } : {}) },
    });
    req.audit = { entityType: 'Customer', entityId: id, before: auditView(before), after: auditView(row) };
    if (!dups.length) return (await this.withOwners(member.shopId, [row]))[0];
    const { customerId, merges } = await this.identity.autoMerge(member.shopId, id, member.id);
    const survivor = await this.prisma.db.customer.findFirstOrThrow({ where: { shopId: member.shopId, id: customerId } });
    return { ...(await this.withOwners(member.shopId, [survivor]))[0], merged: merges.map((m) => ({ logId: m.logId, fromId: m.fromId, intoId: m.intoId, matchedBy: m.matchedBy })) };
  }

  /** Channels, conversations, orders and merge history of one profile. */
  @Get(':customerId/profile')
  async profile(@Param('customerId') id: string, @Req() req: ShopRequest) {
    const member = currentMember(req);
    await this.find(member, id);
    return this.identity.profile(member.shopId, id);
  }

  /** Manual merge: this profile (and all its history) moves into intoId. */
  @Permission('customer.merge')
  @Audit('customer.merge')
  @Post(':customerId/merge')
  async merge(@Param('customerId') id: string, @Body() input: unknown, @Req() req: AuditedRequest) {
    const member = currentMember(req);
    const { intoId } = parse(mergeSchema, input);
    const result = await this.identity.merge(member.shopId, id, intoId, { matchedBy: 'manual', auto: false, actorId: member.id });
    req.audit = { entityType: 'Customer', entityId: intoId, after: { mergedFrom: id, mergeId: result.logId } };
    const survivor = await this.find(member, intoId);
    return { ...(await this.withOwners(member.shopId, [survivor]))[0], merged: [result] };
  }

  @Permission('lead.assign')
  @Audit('customer.assign')
  @Post(':customerId/assign')
  async assign(@Param('customerId') id: string, @Body() input: unknown, @Req() req: AuditedRequest) {
    const member = currentMember(req);
    const { ownerId } = parse(assignSchema, input);
    const before = await this.find(member, id);
    if (ownerId && !(await this.prisma.db.shopMember.findFirst({ where: { shopId: member.shopId, id: ownerId, status: 'ACTIVE' }, select: { id: true } }))) {
      throw apiError(404, 'MEMBER_NOT_FOUND', 'Không tìm thấy nhân viên.');
    }
    const row = await this.prisma.db.customer.update({ where: { shopId: member.shopId, id }, data: { ownerId } });
    req.audit = { entityType: 'Customer', entityId: id, before: { ownerId: before.ownerId }, after: { ownerId } };
    return (await this.withOwners(member.shopId, [row]))[0];
  }

  /** Erases a profile with no history (personal-data requests). Customers with orders or chats are kept. */
  @Permission('customer.delete')
  @Audit('customer.delete')
  @Delete(':customerId')
  @HttpCode(204)
  async remove(@Param('customerId') id: string, @Req() req: AuditedRequest) {
    const member = currentMember(req);
    const { shopId } = member;
    const before = await this.find(member, id);
    const [orders, conversations] = await Promise.all([this.prisma.db.order.count({ where: { shopId, customerId: id } }), this.prisma.db.conversation.count({ where: { shopId, customerId: id } })]);
    if (orders || conversations) throw apiError(409, 'CUSTOMER_IN_USE', 'Khách hàng đã có đơn hàng hoặc hội thoại nên không xóa được.');
    await this.prisma.db.$transaction(async (tx) => {
      await tx.customerIdentity.deleteMany({ where: { shopId, customerId: id } });
      await tx.customer.delete({ where: { shopId, id } });
    });
    // The name stays out of the permanent log: this may be a personal-data erasure.
    req.audit = { entityType: 'Customer', entityId: id, before: { stage: before.stage } };
  }
}
