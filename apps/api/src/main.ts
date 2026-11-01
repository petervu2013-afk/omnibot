import 'reflect-metadata';
import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureApp } from './app.setup.js';
import { EnvValidationError } from './config/env.js';

const LEVELS: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

function createLogger() {
  const level = (process.env.LOG_LEVEL ?? 'log') as LogLevel;
  const logLevels = LEVELS.slice(0, Math.max(LEVELS.indexOf(level), 0) + 1);
  // JSON lines in production for log collectors; readable colored output locally.
  return new ConsoleLogger({ json: process.env.NODE_ENV === 'production', logLevels });
}

async function bootstrap() {
  const logger = createLogger();
  // Imported here so an invalid environment (validated while the module loads) is reported by the catch below.
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger, bufferLogs: true, bodyParser: false });
  configureApp(app);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`OmniBot API đang chạy tại http://localhost:${port} (health: /health, API: /v1)`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  if (err instanceof EnvValidationError) {
    console.error(err.message);
  } else {
    console.error('Không khởi động được API:', err);
  }
  process.exit(1);
});
