// Query-level tenant isolation: every query on a shop-owned table must carry shopId, otherwise it throws before
// reaching the database. This is the safety net against leaking one shop's data to another; authorization
// (who may act on which shop) is added on top in Step 3.
//
// Rules for a model in TENANT_MODELS:
//   - reads / updates / deletes / count / aggregate / groupBy: `where.shopId` is set (or a compound unique key
//     containing shopId, e.g. where: { shopId_sku: { shopId, sku } })
//   - create: `data.shopId` set or `data.shop.connect`; createMany: every row has shopId
//   - upsert: both `where` and `create` scoped
// Child tables without shopId (Message, OrderItem, …) must be reached through a scoped parent.

/** Models with a required `shopId` column. Kept in sync with prisma/schema.prisma by tenant-guard.spec.ts. */
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  'ShopMember',
  'Invitation',
  'Channel',
  'Customer',
  'CustomerIdentity',
  'CustomerMergeLog',
  'CustomerMergeDismissal',
  'ConsentRecord',
  'Conversation',
  'QuickReply',
  'Activity',
  'Task',
  'Trigger',
  'Category',
  'Product',
  'Combo',
  'Coupon',
  'Supplier',
  'Warehouse',
  'StockDocument',
  'Order',
  'Shipment',
  'Payment',
  'CashTransaction',
  'LoyaltyAccount',
  'AdAccount',
  'ZnsTemplate',
  'Broadcast',
  'Subscription',
]);

export class TenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(`Truy vấn ${model}.${operation} thiếu điều kiện shopId – bị chặn để tránh lộ dữ liệu giữa các shop`);
    this.name = 'TenantScopeError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const present = (v: unknown) => v !== undefined && v !== null;

function whereScoped(where: unknown): boolean {
  if (!isObj(where)) return false;
  if (present(where.shopId)) return true;
  return Object.entries(where).some(([k, v]) => k.includes('shopId') && isObj(v) && present(v.shopId));
}

function dataScoped(data: unknown): boolean {
  if (!isObj(data)) return false;
  return present(data.shopId) || (isObj(data.shop) && isObj(data.shop.connect));
}

export function assertTenantScoped(model: string | undefined, operation: string, args: unknown): void {
  if (!model || !TENANT_MODELS.has(model)) return;
  const a: Obj = isObj(args) ? args : {};
  let ok: boolean;
  switch (operation) {
    case 'create':
      ok = dataScoped(a.data);
      break;
    case 'createMany':
    case 'createManyAndReturn':
      ok = (Array.isArray(a.data) ? a.data : [a.data]).every(dataScoped);
      break;
    case 'upsert':
      ok = whereScoped(a.where) && dataScoped(a.create);
      break;
    default:
      ok = whereScoped(a.where);
  }
  if (!ok) throw new TenantScopeError(model, operation);
}

/** Prisma client extension applying assertTenantScoped to every model operation. */
export const tenantGuardExtension = {
  name: 'tenant-guard',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }: { model?: string; operation: string; args: unknown; query: (args: unknown) => Promise<unknown> }) {
        assertTenantScoped(model, operation, args);
        return query(args);
      },
    },
  },
};
