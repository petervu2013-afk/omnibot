// SET-03: read-only audit log of one shop. There is deliberately no update/delete route, and database triggers
// (migration audit_log_immutable) refuse UPDATE/DELETE/TRUNCATE for every client.
import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { parse } from '../common/validation.js';
import { PrismaService } from '../core/prisma.service.js';
import { Permission } from './permission.guard.js';

const EXPORT_LIMIT = 10_000;
const BOM = String.fromCharCode(0xfeff);

const filterSchema = z.object({
  action: z.string().max(100).optional(),
  actorId: z.string().max(100).optional(),
  entityType: z.string().max(100).optional(),
  entityId: z.string().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
const listSchema = filterSchema.extend({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().max(100).optional() });

/** Quotes a CSV cell and neutralises spreadsheet formulas (a value starting with = + - @ would run in Excel). */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : typeof value === 'object' && !(value instanceof Date) ? JSON.stringify(value) : value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

@Controller('shops/:shopId/audit-logs')
export class AuditLogController {
  constructor(private readonly prisma: PrismaService) {}

  // AuditLog.shopId is nullable (platform events), so the tenant guard does not cover it: always filter here.
  private where(shopId: string, f: z.infer<typeof filterSchema>) {
    return {
      shopId,
      action: f.action,
      actorId: f.actorId,
      entityType: f.entityType,
      entityId: f.entityId,
      ...(f.from || f.to ? { createdAt: { gte: f.from, lte: f.to } } : {}),
    };
  }

  private async withActors<T extends { actorId: string | null }>(rows: T[]) {
    const ids = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
    const users = await this.prisma.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({ ...r, actor: r.actorId ? (byId.get(r.actorId) ?? null) : null }));
  }

  @Permission('audit.view')
  @Get()
  async list(@Param('shopId') shopId: string, @Query() query: unknown) {
    const { limit, cursor, ...filter } = parse(listSchema, query);
    const rows = await this.prisma.db.auditLog.findMany({
      where: this.where(shopId, filter),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    return { items: await this.withActors(page), nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null };
  }

  @Permission('audit.export')
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-log.csv"')
  async export(@Param('shopId') shopId: string, @Query() query: unknown) {
    const rows = await this.prisma.db.auditLog.findMany({ where: this.where(shopId, parse(filterSchema, query)), orderBy: { createdAt: 'desc' }, take: EXPORT_LIMIT });
    const items = await this.withActors(rows);
    const header = ['Thời gian', 'Người thực hiện', 'Email', 'Thao tác', 'Đối tượng', 'Mã đối tượng', 'Trước', 'Sau', 'IP'];
    const lines = items.map((r) => [r.createdAt, r.actor?.fullName, r.actor?.email, r.action, r.entityType, r.entityId, r.before, r.after, r.ip].map(csvCell).join(','));
    // BOM so Excel opens Vietnamese text correctly.
    return `${BOM}${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
  }
}
