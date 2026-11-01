// /v1/shops/:shopId/customers – customers in PostgreSQL. Every read and write goes through dataScope, so a Sale can
// only reach customers allowed by the shop's setting (AUTH-09); anything else answers 404, as if it did not exist.
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { apiError } from '../common/api-error.js';
import { parse } from '../common/validation.js';
import { PrismaService } from '../core/prisma.service.js';
import { Audit, type AuditedRequest } from '../shop/audit.interceptor.js';
import { dataScope } from '../shop/data-scope.js';
import { currentMember, type MemberContext, Permission, type ShopRequest } from '../shop/permission.guard.js';

const STAGES = ['NEW', 'CONTACTING', 'CONSULTING', 'QUOTED', 'WON', 'NURTURING', 'LOST'] as const;

/** Vietnamese phone → +84…; null when it is not a valid number. Used to find duplicates across formats. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s.()-]/g, '');
  const local = digits.startsWith('+84') ? digits.slice(3) : digits.startsWith('84') && digits.length >= 11 ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : null;
  return local && /^\d{9,10}$/.test(local) ? `+84${local}` : null;
}

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
const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  stage: z.enum(STAGES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(60).optional(),
});

const missing = () => apiError(404, 'CUSTOMER_NOT_FOUND', 'Không tìm thấy khách hàng.');

function contact(input: { phone?: string | null; email?: string | null }) {
  const out: { phone?: string | null; phoneNormalized?: string | null; phoneAt?: Date; email?: string | null; emailNormalized?: string | null } = {};
  if (input.phone !== undefined) {
    const phone = input.phone || null;
    const normalized = phone ? normalizePhone(phone) : null;
    if (phone && !normalized) throw apiError(400, 'VALIDATION_FAILED', 'Dữ liệu gửi lên không hợp lệ.', [{ field: 'phone', message: 'Số điện thoại không hợp lệ' }]);
    Object.assign(out, { phone, phoneNormalized: normalized, ...(phone ? { phoneAt: new Date() } : {}) });
  }
  if (input.email !== undefined) Object.assign(out, { email: input.email || null, emailNormalized: input.email ? input.email.toLowerCase() : null });
  return out;
}

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
  constructor(private readonly prisma: PrismaService) {}

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

  private async assertNoDuplicate(shopId: string, phoneNormalized: string | null | undefined, exceptId?: string) {
    if (!phoneNormalized) return;
    // Checked across the whole shop, not the Sale's scope: the same person must not get two profiles.
    const dup = await this.prisma.db.customer.findFirst({ where: { shopId, phoneNormalized, mergedIntoId: null, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (dup) throw apiError(409, 'CUSTOMER_EXISTS', 'Số điện thoại này đã có hồ sơ khách hàng trong cửa hàng.');
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
    const reach = contact({ phone, email });
    await this.assertNoDuplicate(member.shopId, reach.phoneNormalized);
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
    const reach = contact({ phone, email });
    await this.assertNoDuplicate(member.shopId, reach.phoneNormalized, id);
    const row = await this.prisma.db.customer.update({
      where: { shopId: member.shopId, id },
      data: { ...data, ...reach, ...(data.stage && data.stage !== before.stage ? { stageChangedAt: new Date() } : {}) },
    });
    req.audit = { entityType: 'Customer', entityId: id, before: auditView(before), after: auditView(row) };
    return (await this.withOwners(member.shopId, [row]))[0];
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
