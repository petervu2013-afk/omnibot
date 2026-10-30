// Hourly housekeeping (AUTH-13):
//   - accounts with a deletion request older than 30 days are anonymised (personal data removed, row kept so
//     orders/conversations stay consistent) and their now-empty shops are closed;
//   - expired or revoked sessions and used/expired one-time tokens older than 30 days are deleted.
// Idempotent, so running it on several API instances at once is harmless.
import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { AuditService } from '../core/audit.service.js';
import { PrismaService } from '../core/prisma.service.js';
import { DELETE_AFTER_DAYS } from './auth.service.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;

@Injectable()
export class AccountPurgeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AccountPurgeService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    this.timer = setInterval(() => void this.run().catch((e: Error) => this.logger.error(`Dọn tài khoản thất bại: ${e.message}`)), HOUR);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<{ purged: number }> {
    const due = await this.prisma.system.user.findMany({
      where: { status: 'PENDING_DELETION', deletionRequestedAt: { lte: new Date(now.getTime() - DELETE_AFTER_DAYS * DAY) } },
      select: { id: true },
    });
    for (const { id } of due) {
      await this.prisma.system.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            email: `deleted+${id}@omnibot.invalid`,
            fullName: 'Người dùng đã xóa',
            phone: null,
            avatarUrl: null,
            passwordHash: '',
            twoFactorEnabled: false,
            twoFactorSecretEnc: null,
            status: 'DELETED',
          },
        });
        await tx.session.deleteMany({ where: { userId: id } });
        await tx.verificationToken.deleteMany({ where: { userId: id } });
        await tx.shopMember.updateMany({ where: { userId: id }, data: { status: 'DISABLED' } });
        // Shops owned by this user with no other member are closed with the account.
        await tx.shop.updateMany({ where: { ownerId: id, deletedAt: null, members: { none: { userId: { not: id } } } }, data: { deletedAt: now } });
      });
      await this.audit.log({ action: 'auth.account_purged', actorId: null, entityType: 'User', entityId: id });
    }
    const cutoff = new Date(now.getTime() - 30 * DAY);
    await this.prisma.system.session.deleteMany({ where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] } });
    await this.prisma.system.verificationToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    if (due.length) this.logger.log(`Đã xóa vĩnh viễn ${due.length} tài khoản quá hạn ${DELETE_AFTER_DAYS} ngày`);
    return { purged: due.length };
  }
}
