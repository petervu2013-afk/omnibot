// Public webhooks from chat platforms. Each one proves it comes from the platform (signature) before anything is
// stored; duplicates are dropped by message id. Bodies are handled inline for now – a BullMQ queue takes over in 5B.
import { Body, Controller, Get, HttpCode, Logger, Post, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { apiError } from '../common/api-error.js';
import { Public } from '../common/public.decorator.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../core/prisma.service.js';
import { parseWebhook, validSignature } from './facebook.js';
import { InboxService } from './inbox.service.js';

@Public()
@SkipThrottle()
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly appSecret?: string;
  private readonly verifyToken?: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
  ) {
    this.appSecret = config.get('META_APP_SECRET', { infer: true });
    this.verifyToken = config.get('META_VERIFY_TOKEN', { infer: true });
  }

  private requireMeta() {
    if (!this.appSecret || !this.verifyToken) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy.');
  }

  /** Subscription handshake when the webhook is registered in the Meta app. */
  @Get('facebook')
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    this.requireMeta();
    if (mode !== 'subscribe' || token !== this.verifyToken) throw apiError(403, 'FORBIDDEN', 'Sai mã xác minh.');
    return challenge;
  }

  @Post('facebook')
  @HttpCode(200)
  async facebook(@Req() req: Request & { rawBody?: Buffer }, @Body() body: unknown) {
    this.requireMeta();
    if (!validSignature(this.appSecret!, req.rawBody, req.get('x-hub-signature-256'))) throw apiError(401, 'BAD_SIGNATURE', 'Chữ ký không hợp lệ.');
    let stored = 0;
    for (const m of parseWebhook(body)) {
      // Messages for a Page that is not connected (or was disconnected) are ignored.
      const channel = await this.prisma.system.channel.findUnique({ where: { platform_externalId: { platform: 'FACEBOOK', externalId: m.pageId } } });
      if (!channel || channel.status === 'DISCONNECTED') continue;
      const result = await this.inbox.receiveInbound({
        shopId: channel.shopId,
        channelId: channel.id,
        platform: 'FACEBOOK',
        externalUserId: m.senderId,
        externalMessageId: m.mid,
        text: m.text,
        attachments: m.attachments,
        at: m.at,
      });
      if (result) stored++;
    }
    if (stored) this.logger.log(`Facebook: lưu ${stored} tin mới`);
    return 'EVENT_RECEIVED';
  }
}
