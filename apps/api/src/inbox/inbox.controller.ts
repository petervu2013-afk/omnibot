// /v1/shops/:shopId/channels and /conversations – staff side of the inbox. Conversations follow the Sale data scope
// on assigneeId, like customers.
import { randomBytes } from 'node:crypto';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { apiError } from '../common/api-error.js';
import { parse } from '../common/validation.js';
import { CryptoService } from '../core/crypto.service.js';
import { PrismaService } from '../core/prisma.service.js';
import { Audit, type AuditedRequest } from '../shop/audit.interceptor.js';
import { currentMember, Permission, type ShopRequest } from '../shop/permission.guard.js';
import { InboxService } from './inbox.service.js';

const origins = z.array(z.url({ protocol: /^https?$/, message: 'Địa chỉ website không hợp lệ' }).max(200)).max(20);
const webchatSchema = z.strictObject({ name: z.string().trim().min(1, 'Nhập tên kênh').max(100), allowedOrigins: origins.default([]) });
const updateChannelSchema = z.strictObject({ name: z.string().trim().min(1).max(100).optional(), allowedOrigins: origins.optional() });
const facebookSchema = z.strictObject({ pageId: z.string().regex(/^\d{5,25}$/, 'Page ID không hợp lệ'), name: z.string().trim().min(1).max(100), pageAccessToken: z.string().min(20).max(1000) });
const listSchema = z.object({
  filter: z.enum(['all', 'unread', 'handoff', 'mine']).default('all'),
  status: z.enum(['open', 'closed']).default('open'),
  channelId: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(60).optional(),
});
const messagesSchema = z.object({ before: z.string().max(60).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });
const sendSchema = z.strictObject({ text: z.string().trim().min(1, 'Nhập nội dung').max(2000) });
const patchSchema = z.strictObject({ botActive: z.boolean().optional(), status: z.enum(['open', 'closed']).optional() });
const assignSchema = z.strictObject({ assigneeId: z.string().max(60).nullable() });

const view = (c: { id: string; platform: string; externalId: string; name: string; status: string; botConfig: unknown; tokenExpiresAt: Date | null; createdAt: Date }) => ({
  id: c.id,
  platform: c.platform,
  name: c.name,
  status: c.status,
  // The webchat site key is public (it is in the website's HTML); page ids are public too. Tokens never leave.
  externalId: c.externalId,
  allowedOrigins: (c.botConfig as { allowedOrigins?: string[] })?.allowedOrigins ?? [],
  tokenExpiresAt: c.tokenExpiresAt,
  createdAt: c.createdAt,
});

@Controller('shops/:shopId')
export class InboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly crypto: CryptoService,
  ) {}

  // ---------- channels ----------

  @Permission('shop.view')
  @Get('channels')
  async channels(@Param('shopId') shopId: string) {
    const rows = await this.prisma.db.channel.findMany({ where: { shopId }, orderBy: { createdAt: 'asc' } });
    return rows.map(view);
  }

  @Permission('integration.manage')
  @Audit('channel.create')
  @Post('channels/webchat')
  async createWebchat(@Param('shopId') shopId: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const { name, allowedOrigins } = parse(webchatSchema, body);
    const row = await this.prisma.db.channel.create({
      data: { shopId, platform: 'WEBCHAT', externalId: `wc_${randomBytes(12).toString('base64url')}`, name, botConfig: { allowedOrigins: allowedOrigins.map((o) => new URL(o).origin) } },
    });
    req.audit = { entityType: 'Channel', entityId: row.id, after: { platform: 'WEBCHAT', name } };
    return view(row);
  }

  /** Manual Page connection with a Page access token (OAuth "Connect with Facebook" arrives with the Meta app, 5B). */
  @Permission('integration.manage')
  @Audit('channel.create')
  @Post('channels/facebook')
  async connectFacebook(@Param('shopId') shopId: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const { pageId, name, pageAccessToken } = parse(facebookSchema, body);
    const taken = await this.prisma.system.channel.findUnique({ where: { platform_externalId: { platform: 'FACEBOOK', externalId: pageId } }, select: { shopId: true } });
    if (taken && taken.shopId !== shopId) throw apiError(409, 'CHANNEL_TAKEN', 'Page này đang được kết nối với cửa hàng khác.');
    const data = { name, accessTokenEnc: this.crypto.encrypt(pageAccessToken), status: 'CONNECTED' as const };
    const row = taken
      ? await this.prisma.db.channel.update({ where: { shopId, platform_externalId: { platform: 'FACEBOOK', externalId: pageId } }, data })
      : await this.prisma.db.channel.create({ data: { ...data, shopId, platform: 'FACEBOOK', externalId: pageId } });
    req.audit = { entityType: 'Channel', entityId: row.id, after: { platform: 'FACEBOOK', name, pageId } };
    return view(row);
  }

  @Permission('integration.manage')
  @Audit('channel.update')
  @Patch('channels/:channelId')
  async updateChannel(@Param('shopId') shopId: string, @Param('channelId') id: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const input = parse(updateChannelSchema, body);
    const before = await this.prisma.db.channel.findFirst({ where: { shopId, id } });
    if (!before) throw apiError(404, 'CHANNEL_NOT_FOUND', 'Không tìm thấy kênh.');
    const botConfig = { ...(before.botConfig as object), ...(input.allowedOrigins ? { allowedOrigins: input.allowedOrigins.map((o) => new URL(o).origin) } : {}) };
    const row = await this.prisma.db.channel.update({ where: { shopId, id }, data: { name: input.name, botConfig } });
    req.audit = { entityType: 'Channel', entityId: id, before: view(before), after: view(row) };
    return view(row);
  }

  /** Disconnects the channel; its conversations stay readable. Stored tokens are erased. */
  @Permission('integration.manage')
  @Audit('channel.disconnect')
  @Delete('channels/:channelId')
  @HttpCode(204)
  async disconnect(@Param('shopId') shopId: string, @Param('channelId') id: string, @Req() req: AuditedRequest) {
    const res = await this.prisma.db.channel.updateMany({ where: { shopId, id }, data: { status: 'DISCONNECTED', accessTokenEnc: null, refreshTokenEnc: null } });
    if (!res.count) throw apiError(404, 'CHANNEL_NOT_FOUND', 'Không tìm thấy kênh.');
    req.audit = { entityType: 'Channel', entityId: id };
  }

  // ---------- conversations ----------

  @Permission('chat.reply')
  @Get('conversations')
  list(@Query() query: unknown, @Req() req: ShopRequest) {
    return this.inbox.list(currentMember(req), parse(listSchema, query));
  }

  @Permission('chat.reply')
  @Get('conversations/:conversationId')
  detail(@Param('conversationId') id: string, @Req() req: ShopRequest) {
    return this.inbox.detail(currentMember(req), id);
  }

  @Permission('chat.reply')
  @Get('conversations/:conversationId/messages')
  messages(@Param('conversationId') id: string, @Query() query: unknown, @Req() req: ShopRequest) {
    const { before, limit } = parse(messagesSchema, query);
    return this.inbox.messages(currentMember(req), id, before, limit);
  }

  @Permission('chat.reply')
  @Post('conversations/:conversationId/messages')
  send(@Param('conversationId') id: string, @Body() body: unknown, @Req() req: ShopRequest) {
    return this.inbox.sendAgentMessage(currentMember(req), id, parse(sendSchema, body).text);
  }

  @Permission('chat.reply')
  @Post('conversations/:conversationId/read')
  @HttpCode(204)
  async read(@Param('conversationId') id: string, @Req() req: ShopRequest) {
    await this.inbox.markRead(currentMember(req), id);
  }

  @Permission('chat.reply')
  @Audit('conversation.update')
  @Patch('conversations/:conversationId')
  async update(@Param('conversationId') id: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const { before, after } = await this.inbox.update(currentMember(req), id, parse(patchSchema, body));
    req.audit = { entityType: 'Conversation', entityId: id, before, after };
    return after;
  }

  @Permission('lead.assign')
  @Audit('conversation.assign')
  @Post('conversations/:conversationId/assign')
  async assign(@Param('conversationId') id: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const { before, after } = await this.inbox.update(currentMember(req), id, parse(assignSchema, body));
    req.audit = { entityType: 'Conversation', entityId: id, before: { assigneeId: before.assigneeId }, after: { assigneeId: after.assigneeId } };
    return after;
  }
}
