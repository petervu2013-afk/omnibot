import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { csvCell } from './audit-log.controller.js';
import { dataScope } from './data-scope.js';
import { type Permission, PERMISSIONS, roleHas } from './permissions.js';

// Each row of docs/PROJECT_SPEC.md 3.2 → the permissions it stands for. `partial`: what a role with a restricted
// cell ("Xem", "Của mình"…) gets; everything else in the row must be denied to that role.
type Role = 'ADMIN' | 'MANAGER' | 'SALE' | 'WAREHOUSE';
const ROWS: Record<string, { all: Permission[]; partial?: Partial<Record<Role, Permission[]>> }> = {
  'Dashboard điều hành': { all: ['dashboard.view'], partial: { SALE: ['dashboard.view'], WAREHOUSE: ['dashboard.view'] } },
  'Livechat & trả lời khách': { all: ['chat.reply'], partial: { SALE: ['chat.reply'] } },
  'Bật/tắt AI, cấu hình bot, kịch bản': { all: ['bot.manage'] },
  'Khách hàng / CRM': { all: ['customer.access'], partial: { SALE: ['customer.access'] } },
  'Phân lead, đổi người phụ trách': { all: ['lead.assign'] },
  'Tạo đơn / sửa đơn': { all: ['order.view', 'order.write'], partial: { SALE: ['order.view', 'order.write'], WAREHOUSE: ['order.view'] } },
  'Hủy đơn, hoàn tiền': { all: ['order.cancel'] },
  'Sản phẩm, danh mục, combo': { all: ['product.view', 'product.manage'], partial: { SALE: ['product.view'], WAREHOUSE: ['product.view'] } },
  Coupon: { all: ['coupon.apply', 'coupon.manage'], partial: { SALE: ['coupon.apply'] } },
  'Nhập / xuất / chuyển / kiểm kho': { all: ['stock.manage'] },
  'Vận đơn': { all: ['shipment.create'], partial: { SALE: ['shipment.create'] } },
  'Thu chi, sổ quỹ': { all: ['finance.manage'] },
  'Quảng cáo, gửi tin hàng loạt': { all: ['marketing.manage'] },
  'Báo cáo': { all: ['report.view'], partial: { SALE: ['report.view'], WAREHOUSE: ['report.view'] } },
  'Nhân viên, phân quyền, ca làm việc': { all: ['staff.view', 'shift.manage', 'staff.invite', 'staff.manage', 'shop.manage'], partial: { MANAGER: ['staff.view', 'shift.manage', 'staff.invite'] } },
  'Kết nối kênh, tích hợp, thanh toán, gói phần mềm': { all: ['integration.manage'] },
  'Audit log': { all: ['audit.view', 'audit.export'], partial: { MANAGER: ['audit.view'] } },
  'Xóa shop, chuyển quyền chủ shop': { all: ['shop.owner'], partial: { ADMIN: ['shop.owner'] } }, // cell: ✔ (chủ shop); owner check is in PermissionGuard
};
const ROLES: Role[] = ['ADMIN', 'MANAGER', 'SALE', 'WAREHOUSE'];

function specMatrix(): Map<string, string[]> {
  const doc = readFileSync(new URL('../../../../docs/PROJECT_SPEC.md', import.meta.url), 'utf8');
  const section = doc.slice(doc.indexOf('### 3.2 Ma trận quyền'), doc.indexOf('## 4. Bảo mật'));
  const rows = section.split('\n').filter((l) => l.startsWith('|') && !l.startsWith('| Chức năng') && !l.startsWith('|---'));
  return new Map(
    rows
      .map((l) =>
        l
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim()),
      )
      .map(([name, ...cells]) => [name!, cells]),
  );
}

describe('permission matrix vs PROJECT_SPEC 3.2', () => {
  const spec = specMatrix();

  it('covers every row of the document, and every permission belongs to a row', () => {
    expect([...spec.keys()].sort()).toEqual(Object.keys(ROWS).sort());
    const mapped = new Set(Object.values(ROWS).flatMap((r) => r.all));
    const rest = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => !mapped.has(p));
    expect(rest).toEqual(['shop.view']); // every member can see their own shop
  });

  for (const [row, def] of Object.entries(ROWS)) {
    it(row, () => {
      const cells = spec.get(row)!;
      ROLES.forEach((role, i) => {
        const cell = cells[i]!;
        const expected = cell === '✔' ? def.all : cell === '✖' ? [] : def.partial?.[role];
        if (!expected) throw new Error(`${row} / ${role}: ô "${cell}" chưa khai báo quyền`);
        for (const p of def.all) expect(roleHas(role, p), `${role} ${p} (ô "${cell}")`).toBe(expected.includes(p));
      });
    });
  }
});

describe('dataScope', () => {
  const sale = (saleDataScope: 'ALL' | 'OWN' | 'OWN_UNASSIGNED') => ({ id: 'm1', role: 'SALE' as const, saleDataScope });

  it('does not restrict Admin and Manager', () => {
    expect(dataScope({ id: 'a', role: 'ADMIN', saleDataScope: 'OWN' }, 'customer')).toEqual({});
    expect(dataScope({ id: 'a', role: 'MANAGER', saleDataScope: 'OWN' }, 'order')).toEqual({});
  });

  it('applies the shop setting to Sale, on the right column', () => {
    expect(dataScope(sale('ALL'), 'customer')).toEqual({});
    expect(dataScope(sale('OWN'), 'customer')).toEqual({ ownerId: 'm1' });
    expect(dataScope(sale('OWN'), 'conversation')).toEqual({ assigneeId: 'm1' });
    expect(dataScope(sale('OWN_UNASSIGNED'), 'order')).toEqual({ OR: [{ ownerId: 'm1' }, { ownerId: null }] });
  });

  it('gives other roles nothing', () => {
    expect(dataScope({ id: 'w', role: 'WAREHOUSE', saleDataScope: 'ALL' }, 'customer')).toEqual({ id: { in: [] } });
  });
});

describe('csvCell', () => {
  it('quotes values and neutralises spreadsheet formulas', () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('@cmd')).toBe('"\'@cmd"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell({ role: 'SALE' })).toBe('"{""role"":""SALE""}"');
  });
});
