import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditLogController } from './audit-log.controller.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { PermissionGuard } from './permission.guard.js';
import { InvitationController, ShopController } from './shop.controller.js';
import { ShopService } from './shop.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ShopController, InvitationController, AuditLogController],
  providers: [ShopService, PermissionGuard, AuditInterceptor],
  exports: [PermissionGuard, AuditInterceptor],
})
export class ShopModule {}
