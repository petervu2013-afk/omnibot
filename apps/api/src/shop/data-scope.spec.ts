import { describe, expect, it } from 'vitest';
import { dataScope, inScope } from './data-scope.js';

// inScope (realtime events) must agree with dataScope (database queries) for every role, setting and owner.
const roles = ['ADMIN', 'MANAGER', 'SALE', 'WAREHOUSE'] as const;
const scopes = ['ALL', 'OWN', 'OWN_UNASSIGNED'] as const;
const owners = ['me', 'someone-else', null];

/** Evaluates the Prisma where-fragment from dataScope against one row. */
function matches(where: Record<string, unknown>, row: { id: string; assigneeId: string | null }): boolean {
  if ('OR' in where) return (where.OR as Record<string, unknown>[]).some((w) => matches(w, row));
  if ('id' in where) return ((where.id as { in: string[] }).in ?? []).includes(row.id);
  if ('assigneeId' in where) return row.assigneeId === where.assigneeId;
  return true;
}

describe('inScope', () => {
  for (const role of roles)
    for (const saleDataScope of scopes)
      for (const owner of owners)
        it(`${role}/${saleDataScope}, owner=${owner}`, () => {
          const member = { id: 'me', role, saleDataScope };
          expect(inScope(member, owner)).toBe(matches(dataScope(member, 'conversation'), { id: 'row', assigneeId: owner }));
        });
});
