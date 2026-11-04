// In-process event bus between the inbox service and the socket gateways. With several API instances this moves to
// Redis pub/sub (socket.io Redis adapter), Step 16.
import { EventEmitter } from 'node:events';
import { Injectable } from '@nestjs/common';

export interface ConversationSummary {
  id: string;
  shopId: string;
  channelId: string;
  identityId: string;
  externalUserId: string;
  assigneeId: string | null;
}

export interface MessageView {
  id: string;
  conversationId: string;
  sender: string;
  senderMemberId: string | null;
  text: string | null;
  attachments: unknown;
  createdAt: Date;
}

export interface InboxEventMap {
  message: [{ conversation: ConversationSummary; message: MessageView }];
  conversation: [{ conversation: ConversationSummary; change: Record<string, unknown> }];
  typing: [{ conversation: ConversationSummary; from: 'customer' | 'agent'; memberId?: string }];
}

@Injectable()
export class InboxEvents extends EventEmitter<InboxEventMap> {}
