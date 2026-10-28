import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.js';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private lastErrorLog = 0;
  readonly client: Redis;

  constructor(config: ConfigService<Env, true>) {
    this.client = new Redis(config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    // Without a listener ioredis prints every reconnect failure; log at most once a minute instead.
    this.client.on('error', (err: Error & { code?: string }) => {
      if (Date.now() - this.lastErrorLog < 60_000) return;
      this.lastErrorLog = Date.now();
      this.logger.warn(`Không kết nối được Redis: ${err.message || err.code || err.name}`);
    });
  }

  async ping(): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
    const reply = await this.client.ping();
    if (reply !== 'PONG') throw new Error(`Redis trả lời bất thường: ${reply}`);
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
