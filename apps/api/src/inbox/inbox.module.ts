// Step 5: conversations, realtime for staff (/live), the website chat (/webchat) and platform webhooks.
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ShopModule } from '../shop/shop.module.js';
import { FacebookSender } from './facebook.sender.js';
import { InboxController } from './inbox.controller.js';
import { InboxEvents } from './inbox.events.js';
import { InboxService } from './inbox.service.js';
import { LiveGateway } from './live.gateway.js';
import { RoutingService } from './routing.service.js';
import { WebchatGateway } from './webchat.gateway.js';
import { WebhookController } from './webhook.controller.js';
import { WidgetController } from './widget.controller.js';

@Module({
  imports: [AuthModule, ShopModule, CatalogModule],
  controllers: [InboxController, WebhookController, WidgetController],
  providers: [InboxEvents, InboxService, RoutingService, LiveGateway, WebchatGateway, FacebookSender],
  exports: [InboxService, InboxEvents, RoutingService],
})
export class InboxModule {}
