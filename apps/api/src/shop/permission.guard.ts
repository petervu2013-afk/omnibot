// @Permission('order.cancel') on a route under /shops/:shopId checks, on every request, that the caller is an
// active member of that shop with a role holding the permission. Non-members get 404 so shop ids cannot be probed.
// The active shop is the URL's shopId: switching shops needs no new login (AUTH-10).
import { applyDecorators, type CanActivate, type ExecutionContext, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { apiError } from '../common/api-error.js';
import { PrismaService } from '../core/prisma.service.js';
import type { DataScope, Role } from '../generated/prisma/client.js';
import { type Permission as PermissionKey, roleHas } from './permissions.js';

export const PERMISSION_KEY = 'omnibot:permission';

export interface MemberContext {
  id: string;
  shopId: string;
  userId: string;
  role: Role;
  isOwner: boolean;
  saleDataScope: DataScope;
}
export type ShopRequest = AuthedRequest & { member?: MemberContext };

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<PermissionKey>(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest<ShopRequest>();
    const shopId = req.params.shopId;
    const userId = req.auth?.userId;
    // Fail closed: a misconfigured route must not become reachable.
    if (!permission || typeof shopId !== 'string' || !userId) throw apiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.');

    const member = await this.prisma.db.shopMember.findUnique({
      where: { shopId_userId: { shopId, userId } },
      include: { shop: { select: { ownerId: true, deletedAt: true, saleDataScope: true } }, user: { select: { status: true } } },
    });
    if (!member || member.status !== 'ACTIVE' || member.shop.deletedAt) throw apiError(404, 'SHOP_NOT_FOUND', 'Không tìm thấy cửa hàng.');
    if (member.user.status !== 'ACTIVE') throw apiError(403, 'ACCOUNT_PENDING_DELETION', 'Tài khoản đang chờ xóa. Hãy hủy yêu cầu xóa để tiếp tục sử dụng.');

    const isOwner = member.shop.ownerId === userId;
    if (!roleHas(member.role, permission) || (permission === 'shop.owner' && !isOwner)) {
      throw apiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.');
    }
    req.member = { id: member.id, shopId, userId, role: member.role, isOwner, saleDataScope: member.shop.saleDataScope };
    return true;
  }
}

export const Permission = (permission: PermissionKey) => applyDecorators(SetMetadata(PERMISSION_KEY, permission), UseGuards(PermissionGuard));

export function currentMember(req: ShopRequest): MemberContext {
  if (!req.member) throw apiError(403, 'PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.');
  return req.member;
}
