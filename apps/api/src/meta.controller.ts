import { Controller, Get } from '@nestjs/common';
import { Public } from './common/public.decorator.js';

/** GET /v1 – API index; lets clients check the version they talk to. */
@Public()
@Controller()
export class MetaController {
  @Get()
  index() {
    return { name: 'OmniBot API', version: process.env.npm_package_version ?? '0.1.0', docs: '/docs/openapi.yaml' };
  }
}
