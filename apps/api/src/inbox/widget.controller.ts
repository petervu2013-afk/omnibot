// GET /v1/webchat/widget.js – the chat box shops embed on their website:
//   <script src="https://api.omnibot.vn/v1/webchat/widget.js" data-site-key="wc_..." async></script>
// Optional data-title / data-color style it; data-name / data-email / data-phone attach a logged-in customer.
import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/public.decorator.js';
import { WIDGET_JS } from './widget-script.js';

@Public()
@SkipThrottle()
@Controller('webchat')
export class WidgetController {
  @Get('widget.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  // Loaded by other websites: Helmet's default same-origin policy would block it.
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  widget() {
    return WIDGET_JS;
  }
}
