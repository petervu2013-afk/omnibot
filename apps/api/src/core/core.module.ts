import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [PrismaService, RedisService, CryptoService],
  exports: [PrismaService, RedisService, CryptoService],
})
export class CoreModule {}
