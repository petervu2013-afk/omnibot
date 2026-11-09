// AUTH-09: row filter added to queries on customers, conversations and orders. Admin and Manager see everything;
// Sale follows the shop's setting (all / own / own + unassigned); any other role sees nothing by default.
import type { MemberContext } from './permission.guard.js';

/** Column holding the responsible member on each scoped table. */
export const OWNER_FIELD = { customer: 'ownerId', conversation: 'assigneeId', order: 'ownerId' } as const;
export type ScopedResource = keyof typeof OWNER_FIELD;

const NOTHING = { id: { in: [] as string[] } };

export function dataScope(member: Pick<MemberContext, 'id' | 'role' | 'saleDataScope'>, resource: ScopedResource): Record<string, unknown> {
  const field = OWNER_FIELD[resource];
  if (member.role === 'ADMIN' || member.role === 'MANAGER') return {};
  if (member.role !== 'SALE') return NOTHING;
  if (member.saleDataScope === 'ALL') return {};
  if (member.saleDataScope === 'OWN') return { [field]: member.id };
  return { OR: [{ [field]: member.id }, { [field]: null }] };
}

/** Same rule as dataScope, for a single row already loaded (realtime events are filtered with it). */
export function inScope(member: Pick<MemberContext, 'id' | 'role' | 'saleDataScope'>, ownerId: string | null): boolean {
  if (member.role === 'ADMIN' || member.role === 'MANAGER') return true;
  if (member.role !== 'SALE') return false;
  if (member.saleDataScope === 'ALL') return true;
  if (member.saleDataScope === 'OWN') return ownerId === member.id;
  return ownerId === member.id || ownerId === null;
}
