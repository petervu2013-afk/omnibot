// Shops, members and invitations (AUTH-07, 09, 10). Tenant tables go through the guarded client; only invitation
// lookups by token span shops (the shop is not known yet) and use the system client.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hashPassword, passwordIssues, verifyPassword } from '../auth/password.js';
import { LoginAttemptsService } from '../auth/login-attempts.service.js';
import { hashToken, normalizeEmail, randomToken } from '../auth/tokens.js';
import { slugify } from '../auth/auth.service.js';
import { apiError } from '../common/api-error.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../core/prisma.service.js';
import type { Prisma, Role } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { templates } from '../mail/templates.js';
import type { MemberContext } from './permission.guard.js';
import { onShift, type Shift } from './shifts.js';

const INVITE_TTL_MS = 7 * 86_400_000;

const notFound = () => apiError(404, 'MEMBER_NOT_FOUND', 'Không tìm thấy nhân viên.');
const invalidInvite = () => apiError(400, 'INVITE_INVALID', 'Lời mời không hợp lệ, đã dùng hoặc đã hết hạn. Hãy đề nghị quản trị viên gửi lại.');

function publicShop(s: {
  id: string;
  name: string;
  slug: string;
  field: string | null;
  hotline: string | null;
  timezone: string;
  currency: string;
  ownerId: string;
  saleDataScope: string;
  assignMode: string;
}) {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    field: s.field,
    hotline: s.hotline,
    timezone: s.timezone,
    currency: s.currency,
    ownerId: s.ownerId,
    saleDataScope: s.saleDataScope,
    assignMode: s.assignMode,
  };
}

@Injectable()
export class ShopService {
  private readonly tokenSecret: string;
  private readonly appUrl: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly attempts: LoginAttemptsService,
  ) {
    this.tokenSecret = config.get('JWT_REFRESH_SECRET', { infer: true });
    this.appUrl = config.get('APP_URL', { infer: true }).replace(/\/$/, '');
  }

  // ---------- shops ----------

  async myShops(userId: string) {
    const members = await this.prisma.system.shopMember.findMany({
      where: { userId, status: 'ACTIVE', shop: { deletedAt: null } },
      include: { shop: true },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => ({ ...publicShop(m.shop), role: m.role, isOwner: m.shop.ownerId === userId }));
  }

  async createShop(userId: string, input: { name: string; field?: string; hotline?: string }) {
    const shop = await this.prisma.system.$transaction(async (tx) => {
      const created = await tx.shop.create({ data: { name: input.name, slug: slugify(input.name), field: input.field, hotline: input.hotline, ownerId: userId } });
      await tx.shopMember.create({ data: { shopId: created.id, userId, role: 'ADMIN', status: 'ACTIVE' } });
      return created;
    });
    return { ...publicShop(shop), role: 'ADMIN' as Role, isOwner: true };
  }

  async getShop(shopId: string) {
    return publicShop(await this.prisma.db.shop.findUniqueOrThrow({ where: { id: shopId } }));
  }

  async updateShop(shopId: string, data: Prisma.ShopUpdateInput) {
    const before = publicShop(await this.prisma.db.shop.findUniqueOrThrow({ where: { id: shopId } }));
    const after = publicShop(await this.prisma.db.shop.update({ where: { id: shopId }, data }));
    return { before, after };
  }

  private async confirmPassword(userId: string, password: string) {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(user.passwordHash, password))) throw apiError(400, 'INVALID_PASSWORD', 'Mật khẩu không đúng.');
  }

  async transferOwner(member: MemberContext, targetMemberId: string, password: string) {
    await this.confirmPassword(member.userId, password);
    const target = await this.prisma.db.shopMember.findFirst({ where: { shopId: member.shopId, id: targetMemberId } });
    if (!target) throw notFound();
    if (target.id === member.id) throw apiError(400, 'ALREADY_OWNER', 'Bạn đang là chủ cửa hàng này.');
    if (target.status !== 'ACTIVE') throw apiError(409, 'MEMBER_NOT_ACTIVE', 'Chỉ chuyển quyền được cho nhân viên đang hoạt động.');
    await this.prisma.db.$transaction(async (tx) => {
      await tx.shopMember.update({ where: { shopId: member.shopId, id: target.id }, data: { role: 'ADMIN' } });
      await tx.shop.update({ where: { id: member.shopId }, data: { ownerId: target.userId } });
    });
    return { before: { ownerId: member.userId }, after: { ownerId: target.userId } };
  }

  async deleteShop(member: MemberContext, password: string) {
    await this.confirmPassword(member.userId, password);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.invitation.deleteMany({ where: { shopId: member.shopId, acceptedAt: null } });
      await tx.shop.update({ where: { id: member.shopId }, data: { deletedAt: new Date() } });
    });
  }

  // ---------- members ----------

  async listMembers(shopId: string) {
    const [rows, shifts] = await Promise.all([
      this.prisma.db.shopMember.findMany({
        where: { shopId },
        include: { user: { select: { email: true, fullName: true, phone: true, avatarUrl: true } }, shop: { select: { ownerId: true, timezone: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.db.workShift.findMany({ where: { shopId } }),
    ]);
    const now = new Date();
    return rows.map(({ shop, user, ...m }) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      status: m.status,
      receivesLeads: m.receivesLeads,
      monthlyTarget: m.monthlyTarget,
      isOnline: m.isOnline,
      lastAssignedAt: m.lastAssignedAt,
      shiftCount: shifts.filter((x) => x.memberId === m.id).length,
      onShift: onShift(
        shifts.filter((x) => x.memberId === m.id),
        shop.timezone,
        now,
      ),
      isOwner: shop.ownerId === m.userId,
      createdAt: m.createdAt,
      ...user,
    }));
  }

  private async editableMember(actor: MemberContext, memberId: string) {
    const target = await this.prisma.db.shopMember.findFirst({ where: { shopId: actor.shopId, id: memberId }, include: { shop: { select: { ownerId: true } } } });
    if (!target) throw notFound();
    if (target.shop.ownerId === target.userId) throw apiError(409, 'OWNER_PROTECTED', 'Không thể thay đổi chủ cửa hàng. Hãy chuyển quyền chủ sở hữu trước.');
    if (target.id === actor.id) throw apiError(409, 'CANNOT_EDIT_SELF', 'Không thể tự thay đổi vai trò hoặc khóa chính mình.');
    return target;
  }

  /** Role and status are read on every request by PermissionGuard, so changes apply immediately. */
  async updateMember(actor: MemberContext, memberId: string, data: { role?: Role; status?: 'ACTIVE' | 'DISABLED'; receivesLeads?: boolean; monthlyTarget?: number | null }) {
    const target = await this.editableMember(actor, memberId);
    const updated = await this.prisma.db.shopMember.update({ where: { shopId: actor.shopId, id: target.id }, data });
    const view = (m: typeof updated) => ({ role: m.role, status: m.status, receivesLeads: m.receivesLeads, monthlyTarget: m.monthlyTarget === null ? null : Number(m.monthlyTarget) });
    return { before: view(target), after: view(updated), memberId: updated.id };
  }

  private async shiftView(shopId: string, memberId: string) {
    const member = await this.prisma.db.shopMember.findFirst({ where: { shopId, id: memberId }, select: { id: true, receivesLeads: true } });
    if (!member) throw notFound();
    const rows = await this.prisma.db.workShift.findMany({ where: { shopId, memberId }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] });
    return { memberId, receivesLeads: member.receivesLeads, shifts: rows.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime })) };
  }

  shifts(shopId: string, memberId: string) {
    return this.shiftView(shopId, memberId);
  }

  /** Replaces the member's whole week of shifts when given, and/or sets the "receives leads" switch. */
  async setShifts(shopId: string, memberId: string, input: { shifts?: Shift[]; receivesLeads?: boolean }) {
    const before = await this.shiftView(shopId, memberId);
    await this.prisma.db.$transaction(async (tx) => {
      if (input.shifts) {
        await tx.workShift.deleteMany({ where: { shopId, memberId } });
        if (input.shifts.length) await tx.workShift.createMany({ data: input.shifts.map((x) => ({ ...x, shopId, memberId })) });
      }
      if (input.receivesLeads !== undefined) await tx.shopMember.update({ where: { shopId, id: memberId }, data: { receivesLeads: input.receivesLeads } });
    });
    return { before, after: await this.shiftView(shopId, memberId) };
  }

  /** Removes a member; their customers and conversations become unassigned. */
  async removeMember(actor: MemberContext, memberId: string) {
    const target = await this.editableMember(actor, memberId);
    const { shopId } = actor;
    await this.prisma.db.$transaction(async (tx) => {
      await tx.customer.updateMany({ where: { shopId, ownerId: target.id }, data: { ownerId: null } });
      await tx.conversation.updateMany({ where: { shopId, assigneeId: target.id }, data: { assigneeId: null } });
      await tx.order.updateMany({ where: { shopId, ownerId: target.id }, data: { ownerId: null } });
      await tx.workShift.deleteMany({ where: { shopId, memberId: target.id } });
      await tx.shopMember.delete({ where: { shopId, id: target.id } });
    });
    return { role: target.role, userId: target.userId };
  }

  // ---------- invitations ----------

  async invite(actor: MemberContext, input: { email: string; role: Role }) {
    const email = normalizeEmail(input.email);
    const { shopId } = actor;
    const already = await this.prisma.db.shopMember.findFirst({ where: { shopId, user: { email } }, select: { id: true } });
    if (already) throw apiError(409, 'ALREADY_MEMBER', 'Người này đã là nhân viên của cửa hàng.');
    const shop = await this.prisma.db.shop.findUniqueOrThrow({ where: { id: shopId }, select: { name: true } });
    const token = randomToken();
    // Inviting the same email again replaces the old link.
    await this.prisma.db.invitation.deleteMany({ where: { shopId, email, acceptedAt: null } });
    const row = await this.prisma.db.invitation.create({
      data: { shopId, email, role: input.role, invitedById: actor.userId, tokenHash: hashToken(this.tokenSecret, token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    });
    this.mail.send(email, templates.invitation(shop.name, input.role, `${this.appUrl}/#/invite?token=${token}`));
    return this.viewInvite(row);
  }

  private viewInvite(i: { id: string; email: string; role: Role; expiresAt: Date; createdAt: Date }) {
    return { id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt, createdAt: i.createdAt };
  }

  async listInvites(shopId: string) {
    const rows = await this.prisma.db.invitation.findMany({ where: { shopId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => this.viewInvite(r));
  }

  async cancelInvite(shopId: string, id: string) {
    const res = await this.prisma.db.invitation.deleteMany({ where: { shopId, id, acceptedAt: null } });
    if (res.count === 0) throw apiError(404, 'INVITE_NOT_FOUND', 'Không tìm thấy lời mời.');
  }

  private async findInvite(token: string) {
    const invite = await this.prisma.system.invitation.findUnique({ where: { tokenHash: hashToken(this.tokenSecret, token) } });
    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) throw invalidInvite();
    const shop = await this.prisma.system.shop.findUnique({ where: { id: invite.shopId }, select: { name: true, deletedAt: true } });
    if (!shop || shop.deletedAt) throw invalidInvite();
    return { invite, shopName: shop.name };
  }

  async previewInvite(token: string) {
    const { invite, shopName } = await this.findInvite(token);
    const user = await this.prisma.system.user.findUnique({ where: { email: invite.email }, select: { id: true } });
    return { shopName, email: invite.email, role: invite.role, hasAccount: user !== null };
  }

  /**
   * The link proves the mailbox. New person: creates the account (email verified). Existing account: the password
   * is also required, counted by the login lockout, because a forwarded link must not add someone to a shop.
   */
  async acceptInvite(input: { token: string; password: string; fullName?: string }) {
    const { invite, shopName } = await this.findInvite(input.token);
    const { email } = invite;
    let user = await this.prisma.system.user.findUnique({ where: { email } });
    let passwordHash: string | undefined;
    if (user) {
      const state = await this.attempts.state(email);
      if (state.lockedMs > 0) throw apiError(423, 'ACCOUNT_LOCKED', 'Tài khoản tạm khóa do nhập sai nhiều lần. Vui lòng thử lại sau.');
      if (!(await verifyPassword(user.passwordHash, input.password))) {
        await this.attempts.recordFailure(email);
        throw apiError(401, 'INVALID_CREDENTIALS', 'Mật khẩu không đúng.');
      }
      if (user.status !== 'ACTIVE') throw apiError(403, 'ACCOUNT_DISABLED', 'Tài khoản không ở trạng thái hoạt động.');
    } else {
      if (!input.fullName) throw apiError(400, 'VALIDATION_FAILED', 'Dữ liệu gửi lên không hợp lệ.', [{ field: 'fullName', message: 'Nhập họ tên' }]);
      const issues = passwordIssues(input.password, email);
      if (issues.length) throw apiError(400, 'WEAK_PASSWORD', `Mật khẩu chưa đạt: ${issues.join(', ')}.`, issues);
      passwordHash = await hashPassword(input.password);
    }
    await this.prisma.system.$transaction(async (tx) => {
      // Claimed atomically: a link accepted twice at once only succeeds once.
      const claimed = await tx.invitation.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
      if (claimed.count === 0) throw invalidInvite();
      user ??= await tx.user.create({ data: { email, fullName: input.fullName!, passwordHash: passwordHash!, emailVerifiedAt: new Date() } });
      await tx.shopMember.upsert({
        where: { shopId_userId: { shopId: invite.shopId, userId: user.id } },
        create: { shopId: invite.shopId, userId: user.id, role: invite.role, status: 'ACTIVE' },
        update: { role: invite.role, status: 'ACTIVE' },
      });
    });
    return { shopId: invite.shopId, shopName, email, role: invite.role, userId: user!.id };
  }
}
