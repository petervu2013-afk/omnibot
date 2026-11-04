// /v1/shops/:shopId/categories, /products – catalog stored in PostgreSQL (POS-01, 02). Stock arrives in Step 9.
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { apiError } from '../common/api-error.js';
import { parse } from '../common/validation.js';
import { PrismaService } from '../core/prisma.service.js';
import { Audit, type AuditedRequest } from '../shop/audit.interceptor.js';
import { Permission } from '../shop/permission.guard.js';

const money = z.number().int('Giá phải là số nguyên').min(0, 'Giá không được âm').max(99_999_999_999_999);
const categoryBody = { name: z.string().trim().min(1, 'Nhập tên danh mục').max(100), description: z.string().trim().max(1000).nullable().optional(), active: z.boolean().optional() };
const productBody = {
  sku: z.string().trim().min(1, 'Nhập mã SKU').max(60),
  name: z.string().trim().min(1, 'Nhập tên sản phẩm').max(200),
  categoryId: z.string().max(60).nullable().optional(),
  price: money,
  costPrice: money.nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  barcode: z.string().trim().max(60).nullable().optional(),
  active: z.boolean().optional(),
};
const createProduct = z.strictObject(productBody);
const updateProduct = z.strictObject(productBody).partial();
const createCategory = z.strictObject(categoryBody);
const updateCategory = z.strictObject(categoryBody).partial();
const listProducts = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(60).optional(),
});
const importProducts = z.strictObject({
  items: z
    .array(
      z.object({
        sku: z.string().trim().max(60).optional(),
        name: z.string().trim().min(1).max(200),
        category: z.string().trim().max(100).optional(),
        price: money.optional(),
        description: z.string().trim().max(5000).optional(),
      }),
    )
    .min(1, 'Chưa có sản phẩm nào')
    .max(500, 'Tối đa 500 sản phẩm mỗi lần'),
});

const isUnique = (err: unknown) => (err as { code?: string })?.code === 'P2002';
const skuTaken = () => apiError(409, 'SKU_TAKEN', 'Mã SKU này đã có trong cửa hàng.');
const productMissing = () => apiError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm.');
const categoryMissing = () => apiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục.');

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  categoryId: string | null;
  price: unknown;
  costPrice: unknown;
  description: string | null;
  barcode: string | null;
  active: boolean;
  createdAt: Date;
}
const view = (p: ProductRow) => ({ ...p, price: Number(p.price), costPrice: p.costPrice === null ? null : Number(p.costPrice) });

@Controller('shops/:shopId')
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCategory(shopId: string, id: string | null | undefined) {
    if (!id) return;
    if (!(await this.prisma.db.category.findFirst({ where: { shopId, id }, select: { id: true } }))) throw categoryMissing();
  }

  // ---------- categories ----------

  @Permission('product.view')
  @Get('categories')
  async categories(@Param('shopId') shopId: string) {
    const [rows, counts] = await Promise.all([
      this.prisma.db.category.findMany({ where: { shopId }, orderBy: { name: 'asc' } }),
      this.prisma.db.product.groupBy({ by: ['categoryId'], where: { shopId }, _count: { _all: true } }),
    ]);
    const byId = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    return rows.map((c) => ({ ...c, productCount: byId.get(c.id) ?? 0 }));
  }

  @Permission('product.manage')
  @Audit('category.create')
  @Post('categories')
  async createCategory(@Param('shopId') shopId: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const row = await this.prisma.db.category.create({ data: { ...parse(createCategory, body), shopId } });
    req.audit = { entityType: 'Category', entityId: row.id, after: { name: row.name } };
    return row;
  }

  @Permission('product.manage')
  @Audit('category.update')
  @Patch('categories/:categoryId')
  async updateCategory(@Param('shopId') shopId: string, @Param('categoryId') id: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const data = parse(updateCategory, body);
    const before = await this.prisma.db.category.findFirst({ where: { shopId, id } });
    if (!before) throw categoryMissing();
    const row = await this.prisma.db.category.update({ where: { shopId, id }, data });
    req.audit = { entityType: 'Category', entityId: id, before: { name: before.name, active: before.active }, after: { name: row.name, active: row.active } };
    return row;
  }

  /** Products of a deleted category stay, without a category. */
  @Permission('product.manage')
  @Audit('category.delete')
  @Delete('categories/:categoryId')
  @HttpCode(204)
  async deleteCategory(@Param('shopId') shopId: string, @Param('categoryId') id: string, @Req() req: AuditedRequest) {
    const before = await this.prisma.db.category.findFirst({ where: { shopId, id } });
    if (!before) throw categoryMissing();
    await this.prisma.db.$transaction(async (tx) => {
      await tx.product.updateMany({ where: { shopId, categoryId: id }, data: { categoryId: null } });
      await tx.category.delete({ where: { shopId, id } });
    });
    req.audit = { entityType: 'Category', entityId: id, before: { name: before.name } };
  }

  // ---------- products ----------

  @Permission('product.view')
  @Get('products')
  async products(@Param('shopId') shopId: string, @Query() query: unknown) {
    const { q, categoryId, limit, cursor } = parse(listProducts, query);
    const rows = await this.prisma.db.product.findMany({
      where: {
        shopId,
        categoryId,
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { sku: { contains: q, mode: 'insensitive' as const } }, { barcode: q }] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    return { items: page.map(view), nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null };
  }

  @Permission('product.view')
  @Get('products/:productId')
  async product(@Param('shopId') shopId: string, @Param('productId') id: string) {
    const row = await this.prisma.db.product.findFirst({ where: { shopId, id } });
    if (!row) throw productMissing();
    return view(row);
  }

  @Permission('product.manage')
  @Audit('product.create')
  @Post('products')
  async createProduct(@Param('shopId') shopId: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const data = parse(createProduct, body);
    await this.assertCategory(shopId, data.categoryId);
    try {
      const row = await this.prisma.db.product.create({ data: { ...data, shopId } });
      req.audit = { entityType: 'Product', entityId: row.id, after: { sku: row.sku, name: row.name, price: Number(row.price) } };
      return view(row);
    } catch (err) {
      if (isUnique(err)) throw skuTaken();
      throw err;
    }
  }

  /** Bulk add from a catalog scan: matches by SKU, then by name; creates missing categories. */
  @Permission('product.manage')
  @Audit('product.import')
  @Post('products/import')
  async importProducts(@Param('shopId') shopId: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const { items } = parse(importProducts, body);
    let created = 0;
    let updated = 0;
    await this.prisma.db.$transaction(async (tx) => {
      const categories = new Map((await tx.category.findMany({ where: { shopId } })).map((c) => [c.name.toLowerCase(), c.id]));
      for (const item of items) {
        let categoryId: string | undefined;
        if (item.category) {
          categoryId = categories.get(item.category.toLowerCase());
          if (!categoryId) {
            categoryId = (await tx.category.create({ data: { shopId, name: item.category } })).id;
            categories.set(item.category.toLowerCase(), categoryId);
          }
        }
        const existing = await tx.product.findFirst({
          where: { shopId, OR: [...(item.sku ? [{ sku: item.sku }] : []), { name: { equals: item.name, mode: 'insensitive' as const } }] },
          select: { id: true },
        });
        const fields = { name: item.name, categoryId, description: item.description };
        if (existing) {
          await tx.product.update({ where: { shopId, id: existing.id }, data: { ...fields, price: item.price, sku: item.sku } });
          updated++;
        } else {
          await tx.product.create({ data: { ...fields, shopId, price: item.price ?? 0, sku: item.sku || `SP-${crypto.randomUUID().slice(0, 8).toUpperCase()}` } });
          created++;
        }
      }
    });
    req.audit = { entityType: 'Product', after: { created, updated } };
    return { created, updated };
  }

  @Permission('product.manage')
  @Audit('product.update')
  @Patch('products/:productId')
  async updateProduct(@Param('shopId') shopId: string, @Param('productId') id: string, @Body() body: unknown, @Req() req: AuditedRequest) {
    const data = parse(updateProduct, body);
    const before = await this.prisma.db.product.findFirst({ where: { shopId, id } });
    if (!before) throw productMissing();
    await this.assertCategory(shopId, data.categoryId);
    try {
      const row = await this.prisma.db.product.update({ where: { shopId, id }, data });
      req.audit = {
        entityType: 'Product',
        entityId: id,
        before: { sku: before.sku, name: before.name, price: Number(before.price) },
        after: { sku: row.sku, name: row.name, price: Number(row.price) },
      };
      return view(row);
    } catch (err) {
      if (isUnique(err)) throw skuTaken();
      throw err;
    }
  }

  /** A product already on an order stays for history: it can only be hidden (active = false). */
  @Permission('product.manage')
  @Audit('product.delete')
  @Delete('products/:productId')
  @HttpCode(204)
  async deleteProduct(@Param('shopId') shopId: string, @Param('productId') id: string, @Req() req: AuditedRequest) {
    const before = await this.prisma.db.product.findFirst({ where: { shopId, id } });
    if (!before) throw productMissing();
    if (await this.prisma.db.orderItem.findFirst({ where: { productId: id, order: { shopId } }, select: { id: true } })) {
      throw apiError(409, 'PRODUCT_IN_USE', 'Sản phẩm đã có trong đơn hàng nên không xóa được. Hãy chuyển sang ngừng bán.');
    }
    await this.prisma.db.product.delete({ where: { shopId, id } });
    req.audit = { entityType: 'Product', entityId: id, before: { sku: before.sku, name: before.name } };
  }
}
