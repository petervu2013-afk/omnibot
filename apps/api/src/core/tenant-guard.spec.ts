import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertTenantScoped, TENANT_MODELS, TenantScopeError } from './tenant-guard.js';

describe('TENANT_MODELS', () => {
  it('lists exactly the models with a required shopId column in schema.prisma', () => {
    const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    const fromSchema = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].filter(([, , body]) => /^\s+shopId\s+String(\s|$)/m.test(body!)).map(([, name]) => name!);
    expect(fromSchema.length).toBeGreaterThan(20);
    expect([...TENANT_MODELS].sort()).toEqual(fromSchema.sort());
  });
});

describe('assertTenantScoped', () => {
  const ok = (model: string, op: string, args: unknown) => expect(() => assertTenantScoped(model, op, args)).not.toThrow();
  const blocked = (model: string, op: string, args: unknown) => expect(() => assertTenantScoped(model, op, args)).toThrow(TenantScopeError);

  it('ignores models that are not shop-owned', () => {
    ok('User', 'findMany', {});
    ok('Shop', 'findUnique', { where: { id: 's1' } });
    assertTenantScoped(undefined, '$queryRaw', {});
  });

  it('requires shopId on reads, updates, deletes and aggregates', () => {
    for (const op of ['findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany']) {
      blocked('Customer', op, {});
      blocked('Customer', op, { where: { id: 'c1' } });
      blocked('Customer', op, { where: { shopId: undefined } });
      blocked('Customer', op, { where: { shopId: null } });
      ok('Customer', op, { where: { shopId: 's1', id: 'c1' } });
    }
  });

  it('accepts filter objects and compound unique keys on shopId', () => {
    ok('Customer', 'findMany', { where: { shopId: { in: ['s1', 's2'] } } });
    ok('Product', 'findUnique', { where: { shopId_sku: { shopId: 's1', sku: 'BA-01' } } });
    blocked('Product', 'findUnique', { where: { shopId_sku: { sku: 'BA-01' } } });
  });

  it('does not accept shopId hidden inside OR/AND (must be top-level)', () => {
    blocked('Order', 'findMany', { where: { OR: [{ shopId: 's1' }, { id: 'x' }] } });
  });

  it('requires shopId on creates', () => {
    blocked('Customer', 'create', { data: { name: 'A' } });
    ok('Customer', 'create', { data: { name: 'A', shopId: 's1' } });
    ok('Channel', 'create', { data: { name: 'Fanpage', shop: { connect: { id: 's1' } } } });
    blocked('Customer', 'createMany', { data: [{ shopId: 's1', name: 'A' }, { name: 'B' }] });
    ok('Customer', 'createManyAndReturn', { data: [{ shopId: 's1', name: 'A' }] });
  });

  it('requires both where and create to be scoped on upsert', () => {
    blocked('Customer', 'upsert', { where: { id: 'c1' }, create: { shopId: 's1' }, update: {} });
    blocked('Customer', 'upsert', { where: { shopId: 's1', id: 'c1' }, create: { name: 'A' }, update: {} });
    ok('Customer', 'upsert', { where: { shopId: 's1', id: 'c1' }, create: { shopId: 's1', name: 'A' }, update: {} });
  });

  it('explains what was blocked', () => {
    expect(() => assertTenantScoped('Order', 'findMany', {})).toThrow('Truy vấn Order.findMany thiếu điều kiện shopId');
  });
});
