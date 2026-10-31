// @Audit('member.update') writes one AuditLog row after the handler succeeds: who, which shop, IP, plus the entity
// and before/after snapshots the handler put in req.audit. Failed requests are not logged as changes.
import { applyDecorators, type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, SetMetadata, UseInterceptors } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mergeMap, type Observable } from 'rxjs';
import { AuditService } from '../core/audit.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ShopRequest } from './permission.guard.js';

export const AUDIT_KEY = 'omnibot:audit';

export interface AuditDetail {
  entityType: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}
export type AuditedRequest = ShopRequest & { audit?: AuditDetail };

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string>(AUDIT_KEY, context.getHandler());
    const req = context.switchToHttp().getRequest<AuditedRequest>();
    return next.handle().pipe(
      // Awaited so the row exists before the client gets its response.
      mergeMap(async (result: unknown) => {
        await this.audit.log({
          action,
          actorId: req.auth?.userId,
          shopId: req.member?.shopId,
          entityType: req.audit?.entityType,
          entityId: req.audit?.entityId,
          before: req.audit?.before,
          data: req.audit?.after,
          ip: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
        });
        return result;
      }),
    );
  }
}

export const Audit = (action: string) => applyDecorators(SetMetadata(AUDIT_KEY, action), UseInterceptors(AuditInterceptor));
