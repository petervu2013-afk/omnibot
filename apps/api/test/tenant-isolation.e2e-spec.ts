import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/core/prisma.service.js';
import { TenantScopeError } from '../src/core/tenant-guard.js';
import { createTestApp } from './support/app.js';

describe('tenant guard against PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const run = Date.now().toString(36);
  const shopA = `shopA_${run}`;
  const shopB = `shopB_${run}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.system.shop.createMany({
      data: [
        { id: shopA, name: 'Gỗ Việt', slug: `go-viet-${run}`, ownerId: 'u1' },
        { id: shopB, name: 'Shop khác', slug: `shop-khac-${run}`, ownerId: 'u2' },
      ],
    });
    await prisma.db.customer.create({ data: { shopId: shopA, name: 'Nguyễn Minh Anh', phone: '0938123456' } });
    await prisma.db.customer.create({ data: { shopId: shopB, name: 'Khách của shop B' } });
  });
  afterAll(async () => {
    await prisma?.system.customer.deleteMany({ where: { shopId: { in: [shopA, shopB] } } });
    await prisma?.system.shop.deleteMany({ where: { id: { in: [shopA, shopB] } } });
    await app?.close();
  });

  it('blocks an unscoped query before it reaches the database', async () => {
    await expect(prisma.db.customer.findMany()).rejects.toBeInstanceOf(TenantScopeError);
    await expect(prisma.db.customer.count({ where: { name: 'Khách của shop B' } })).rejects.toThrow('thiếu điều kiện shopId');
    await expect(prisma.db.customer.create({ data: { name: 'Không có shop' } as never })).rejects.toBeInstanceOf(TenantScopeError);
  });

  it('returns only the requesting shop rows', async () => {
    const rows = await prisma.db.customer.findMany({ where: { shopId: shopA } });
    expect(rows.map((r) => r.name)).toEqual(['Nguyễn Minh Anh']);
  });

  it('cannot read or update another shop row by id', async () => {
    const other = await prisma.system.customer.findFirstOrThrow({ where: { shopId: shopB } });
    expect(await prisma.db.customer.findFirst({ where: { shopId: shopA, id: other.id } })).toBeNull();
    const res = await prisma.db.customer.updateMany({ where: { shopId: shopA, id: other.id }, data: { name: 'hacked' } });
    expect(res.count).toBe(0);
    expect((await prisma.system.customer.findUniqueOrThrow({ where: { id: other.id } })).name).toBe('Khách của shop B');
  });
});
