import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PrismaService } from '../core/prisma.service.js';
import { RedisService } from '../core/redis.service.js';
import { Public } from '../common/public.decorator.js';

type Probe = 'ok' | 'down';
const TIMEOUT_MS = 2000;

async function probe(check: () => Promise<void>): Promise<Probe> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
  });
  try {
    await Promise.race([check(), timeout]);
    return 'ok';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

/** Liveness + readiness for Docker/nginx/uptime monitors. Not rate-limited, not under /v1. */
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const [db, redis] = await Promise.all([probe(() => this.prisma.ping()), probe(() => this.redis.ping())]);
    const ok = db === 'ok' && redis === 'ok';
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'error', db, redis, uptime: Math.round(process.uptime()) };
  }
}
