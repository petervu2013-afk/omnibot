// /v1/shops/* and /v1/invitations/* – contract in docs/openapi.yaml.
// Every route under /shops/:shopId must have @Permission and every change @Audit (enforced by rbac.e2e-spec.ts).
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { apiError } from '../common/api-error.js';
import { AuditService } from '../core/audit.service.js';
import { AuthThrottle } from '../common/auth-throttle.decorator.js';
import { Public } from '../common/public.decorator.js';
import { parse } from '../common/validation.js';
import { PASSWORD_MAX } from '../auth/password.js';
import { Audit, type AuditedRequest } from './audit.interceptor.js';
import { currentMember, Permission } from './permission.guard.js';
import { ShopService } from './shop.service.js';
import { shiftsSchema } from './shifts.js';

const password = z.string().min(1, 'Nhập mật khẩu').max(PASSWORD_MAX);
const name = z.string().trim().min(2, 'Nhập tên cửa hàng').max(100);
const staffRole = z.enum(['ADMIN', 'MANAGER', 'SALE', 'WAREHOUSE']);

const createShopSchema = z.object({ name, field: z.string().trim().max(60).optional(), hotline: z.string().trim().max(20).optional() });
const updateShopSchema = z.strictObject({
  name: name.optional(),
  field: z.string().trim().max(60).nullable().optional(),
  hotline: z.string().trim().max(20).nullable().optional(),
  timezone: z.string().trim().max(60).optional(),
  saleDataScope: z.enum(['ALL', 'OWN', 'OWN_UNASSIGNED']).optional(),
  assignMode: z.enum(['MANUAL', 'FIRST_VIEW', 'ROUND_ROBIN_ONLINE', 'ROUND_ROBIN_ALL']).optional(),
});
const transferSchema = z.object({ memberId: z.string().min(1), password });
const confirmSchema = z.object({ password });
const updateMemberSchema = z.strictObject({
  role: staffRole.optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  receivesLeads: z.boolean().optional(),
  monthlyTarget: z.number().int().min(0).nullable().optional(),
});
// An invitation never grants Admin directly (hồ sơ 3.1); promote the member afterwards if needed.
const inviteSchema = z.object({ email: z.email('Email không hợp lệ').max(254), role: z.enum(['MANAGER', 'SALE', 'WAREHOUSE']) });
const tokenSchema = z.object({ token: z.string().min(20).max(200) });
const acceptSchema = z.object({ token: z.string().min(20).max(200), password, fullName: z.string().trim().min(2).max(100).optional() });

function userId(req: AuthedRequest): string {
  if (!req.auth) throw apiError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập.');
  return req.auth.userId;
}

@Controller('shops')
export class ShopController {
  constructor(private readonly shops: ShopService) {}

  // Personal routes: not tied to one shop, only need login.
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.shops.myShops(userId(req));
  }

  @Post()
  create(@Body() body: unknown, @Req() req: AuthedRequest) {
    return this.shops.createShop(userId(req), parse(createShopSchema, body));
  }

  @Permission('shop.view')
  @Get(':shopId')
  get(@Param('shopId') shopId: string) {
    return this.shops.getShop(shopId);
  }

  @Permission('shop.manage')
  @Audit('shop.update')
  @Patch(':shopId')
  async update(@Param('shopId') shopId: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const { before, after } = await this.shops.updateShop(shopId, parse(updateShopSchema, body));
    req.audit = { entityType: 'Shop', entityId: shopId, before, after };
    return after;
  }

  @Permission('shop.owner')
  @Audit('shop.transfer_owner')
  @Post(':shopId/transfer-owner')
  @HttpCode(204)
  async transfer(@Param('shopId') shopId: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const input = parse(transferSchema, body);
    const { before, after } = await this.shops.transferOwner(currentMember(req), input.memberId, input.password);
    req.audit = { entityType: 'Shop', entityId: shopId, before, after };
  }

  @Permission('shop.owner')
  @Audit('shop.delete')
  @Delete(':shopId')
  @HttpCode(204)
  async remove(@Param('shopId') shopId: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    await this.shops.deleteShop(currentMember(req), parse(confirmSchema, body).password);
    req.audit = { entityType: 'Shop', entityId: shopId };
  }

  // ---------- members ----------

  @Permission('staff.view')
  @Get(':shopId/members')
  members(@Param('shopId') shopId: string) {
    return this.shops.listMembers(shopId);
  }

  @Permission('staff.manage')
  @Audit('member.update')
  @Patch(':shopId/members/:memberId')
  async updateMember(@Param('memberId') memberId: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const { before, after } = await this.shops.updateMember(currentMember(req), memberId, parse(updateMemberSchema, body));
    req.audit = { entityType: 'ShopMember', entityId: memberId, before, after };
    return after;
  }

  /** AUTH-15/16: a member's weekly shifts and whether they receive new conversations (Admin, Manager). */
  @Permission('shift.manage')
  @Get(':shopId/members/:memberId/shifts')
  shifts(@Param('memberId') memberId: string, @Req() req: AuditedRequest) {
    return this.shops.shifts(currentMember(req).shopId, memberId);
  }

  @Permission('shift.manage')
  @Audit('member.shifts')
  @Put(':shopId/members/:memberId/shifts')
  async setShifts(@Param('memberId') memberId: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const input = parse(z.strictObject({ shifts: shiftsSchema.shape.shifts.optional(), receivesLeads: z.boolean().optional() }), body);
    const { before, after } = await this.shops.setShifts(currentMember(req).shopId, memberId, input);
    req.audit = { entityType: 'ShopMember', entityId: memberId, before, after };
    return after;
  }

  @Permission('staff.manage')
  @Audit('member.remove')
  @Delete(':shopId/members/:memberId')
  @HttpCode(204)
  async removeMember(@Param('memberId') memberId: string, @Req() req: AuditedRequest) {
    const removed = await this.shops.removeMember(currentMember(req), memberId);
    req.audit = { entityType: 'ShopMember', entityId: memberId, before: removed };
  }

  // ---------- invitations ----------

  @Permission('staff.view')
  @Get(':shopId/invitations')
  invitations(@Param('shopId') shopId: string) {
    return this.shops.listInvites(shopId);
  }

  @Permission('staff.invite')
  @Audit('member.invite')
  @Post(':shopId/invitations')
  async invite(@Body() body: unknown, @Req() req: AuditedRequest) {
    const created = await this.shops.invite(currentMember(req), parse(inviteSchema, body));
    req.audit = { entityType: 'Invitation', entityId: created.id, after: { email: created.email, role: created.role } };
    return created;
  }

  @Permission('staff.invite')
  @Audit('member.invite_cancel')
  @Delete(':shopId/invitations/:invitationId')
  @HttpCode(204)
  async cancelInvite(@Param('shopId') shopId: string, @Param('invitationId') id: string, @Req() req: AuditedRequest) {
    await this.shops.cancelInvite(shopId, id);
    req.audit = { entityType: 'Invitation', entityId: id };
  }
}

/** Opened from the emailed link, before the invitee has a session. The token travels in the body, never the URL. */
@Public()
@Controller('invitations')
export class InvitationController {
  constructor(
    private readonly shops: ShopService,
    private readonly audit: AuditService,
  ) {}

  @AuthThrottle()
  @Post('preview')
  @HttpCode(200)
  preview(@Body() body: unknown) {
    return this.shops.previewInvite(parse(tokenSchema, body).token);
  }

  @AuthThrottle()
  @Post('accept')
  @HttpCode(200)
  async accept(@Body() body: unknown, @Req() req: AuthedRequest) {
    const { userId: actorId, ...result } = await this.shops.acceptInvite(parse(acceptSchema, body));
    await this.audit.log({
      action: 'member.join',
      actorId,
      shopId: result.shopId,
      entityType: 'User',
      entityId: actorId,
      data: { role: result.role },
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    return result;
  }
}
