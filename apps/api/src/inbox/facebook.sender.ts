// Sends agent replies to Messenger with the Page token stored (encrypted) on the channel.
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CryptoService } from '../core/crypto.service.js';
import { PrismaService } from '../core/prisma.service.js';
import { sendText } from './facebook.js';
import type { ConversationSummary, MessageView } from './inbox.events.js';
import { InboxService } from './inbox.service.js';

@Injectable()
export class FacebookSender implements OnModuleInit {
  /** Replaced in tests; production calls graph.facebook.com. */
  fetcher: typeof fetch = fetch;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly inbox: InboxService,
  ) {}

  onModuleInit() {
    this.inbox.registerSender('FACEBOOK', { send: (c, m) => this.send(c, m) });
  }

  private async send(conversation: ConversationSummary, message: MessageView) {
    const channel = await this.prisma.db.channel.findFirst({ where: { shopId: conversation.shopId, id: conversation.channelId }, select: { accessTokenEnc: true } });
    if (!channel?.accessTokenEnc) throw new Error('kênh chưa có Page access token');
    await sendText(this.crypto.decrypt(channel.accessTokenEnc), conversation.externalUserId, message.text ?? '', this.fetcher);
  }
}
