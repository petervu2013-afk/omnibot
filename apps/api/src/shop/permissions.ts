// Permission matrix: docs/PROJECT_SPEC.md section 3.2 as code. permissions.spec.ts compares it with the document.
// "Own data" rows (Sale, Warehouse) grant the permission here; the row filter comes from data-scope.ts.
import type { Role } from '../generated/prisma/client.js';

const ALL: Role[] = ['ADMIN', 'MANAGER', 'SALE', 'WAREHOUSE'];
const MANAGERS: Role[] = ['ADMIN', 'MANAGER'];
const ADMIN: Role[] = ['ADMIN'];

export const PERMISSIONS = {
  'shop.view': ALL,
  'shop.manage': ADMIN,
  'dashboard.view': ALL,
  'chat.reply': ['ADMIN', 'MANAGER', 'SALE'],
  'bot.manage': MANAGERS,
  'customer.access': ['ADMIN', 'MANAGER', 'SALE'],
  'lead.assign': MANAGERS,
  'order.view': ALL,
  'order.write': ['ADMIN', 'MANAGER', 'SALE'],
  'order.cancel': MANAGERS,
  'product.view': ALL,
  'product.manage': MANAGERS,
  'coupon.apply': ['ADMIN', 'MANAGER', 'SALE'],
  'coupon.manage': MANAGERS,
  'stock.manage': ['ADMIN', 'MANAGER', 'WAREHOUSE'],
  'shipment.create': ALL,
  'finance.manage': MANAGERS,
  'marketing.manage': MANAGERS,
  'report.view': ALL,
  'staff.view': MANAGERS,
  'shift.manage': MANAGERS,
  'staff.invite': MANAGERS,
  'staff.manage': ADMIN,
  'integration.manage': ADMIN,
  'audit.view': MANAGERS,
  'audit.export': ADMIN,
  // Only the shop owner (Shop.ownerId), not every Admin: delete the shop, transfer ownership.
  'shop.owner': ADMIN,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function roleHas(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
