import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { CryptoService } from './crypto.service.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [PrismaService, RedisService, CryptoService, AuditService],
  exports: [PrismaService, RedisService, CryptoService, AuditService],
})
export class CoreModule {}
