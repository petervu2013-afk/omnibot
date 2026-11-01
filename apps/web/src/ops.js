// Warehouse / finance mutations shared by the POS screens (call inside store.update).
export const DOC_KINDS = {
  import: { label: 'Phiếu nhập', prefix: 'PN' },
  export: { label: 'Phiếu xuất', prefix: 'PX' },
  transfer: { label: 'Phiếu chuyển kho', prefix: 'PC' },
  check: { label: 'Phiếu kiểm', prefix: 'PK' },
};

export function nextCode(list, prefix) {
  const n = Math.max(0, ...list.filter((x) => x.code?.startsWith(prefix)).map((x) => Number(x.code.slice(prefix.length)) || 0)) + 1;
  return `${prefix}${String(n).padStart(5, '0')}`;
}

function level(d, productId, warehouseId) {
  let l = d.stockLevels.find((x) => x.productId === productId && x.warehouseId === warehouseId);
  if (!l) { l = { productId, warehouseId, qty: 0, updatedAt: Date.now() }; d.stockLevels.push(l); }
  return l;
}

// Product.stock is always the sum across warehouses.
export function syncProductStock(d, productId) {
  const p = d.products.find((x) => x.id === productId);
  if (p) p.stock = d.stockLevels.filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0);
}

// Apply a stock document once (status draft -> done).
export function completeStockDoc(d, docId) {
  const doc = d.stockDocs.find((x) => x.id === docId);
  if (!doc || doc.status === 'done') return;
  doc.items.forEach((it) => {
    if (doc.kind === 'import') level(d, it.productId, doc.warehouseId).qty += it.qty;
    if (doc.kind === 'export') level(d, it.productId, doc.warehouseId).qty -= it.qty;
    if (doc.kind === 'transfer') { level(d, it.productId, doc.warehouseId).qty -= it.qty; level(d, it.productId, doc.toWarehouseId).qty += it.qty; }
    if (doc.kind === 'check') level(d, it.productId, doc.warehouseId).qty = it.counted;
    d.stockLevels.filter((l) => l.productId === it.productId).forEach((l) => { l.updatedAt = Date.now(); });
    syncProductStock(d, it.productId);
  });
  doc.status = 'done';
  doc.updatedAt = Date.now();
}

export const docValue = (doc, products) => doc.items.reduce((s, it) => s + (it.cost ?? products.find((p) => p.id === it.productId)?.price ?? 0) * (it.qty || 0), 0);

export const PAY_METHODS = { cash: 'Tiền mặt', bank: 'Chuyển khoản', cod: 'COD', card: 'Thẻ' };

// Auto stock-out when an order is created (setting "Tự động xuất kho"), from the default warehouse.
export function exportForOrder(d, order) {
  if (!d.settings?.inventory?.autoExport || !d.stockDocs) return;
  const wh = d.warehouses.find((w) => w.isDefault) || d.warehouses[0];
  if (!wh) return;
  const doc = { id: `${order.id}-px`, code: nextCode(d.stockDocs, 'PX'), kind: 'export', warehouseId: wh.id, orderId: order.id, items: order.items.map((it) => ({ productId: it.productId, qty: it.qty })), createdBy: 's1', createdAt: Date.now(), updatedAt: Date.now(), note: `Tự động xuất kho đơn #${order.id}`, status: 'draft' };
  d.stockDocs.push(doc);
  completeStockDoc(d, doc.id);
}
