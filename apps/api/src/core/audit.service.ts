import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface AuditEntry {
  action: string; // auth.login, auth.login_failed, auth.password_reset, …
  actorId?: string | null;
  shopId?: string | null;
  entityType?: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  data?: Prisma.InputJsonValue; // stored in AuditLog.after; never put passwords or tokens here
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Append-only. A failed audit write is logged but never breaks the user's request. */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.system.auditLog.create({
        data: {
          action: entry.action,
          actorId: entry.actorId ?? null,
          shopId: entry.shopId ?? null,
          entityType: entry.entityType,
          entityId: entry.entityId,
          before: entry.before,
          after: entry.data,
          ip: entry.ip,
          userAgent: entry.userAgent?.slice(0, 500),
        },
      });
    } catch (err) {
      this.logger.error(`Không ghi được audit log ${entry.action}: ${(err as Error).message}`);
    }
  }
}
