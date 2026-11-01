// HTTP pipeline shared by main.ts and the e2e tests, so tests exercise exactly what production runs.
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { Env } from './config/env.js';
import { AllExceptionsFilter } from './common/http-exception.filter.js';
import { requestContext } from './common/request-context.js';

export function configureApp(app: NestExpressApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.set('trust proxy', 1); // behind nginx: real client IP for rate limiting and logs
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  return app;
}
