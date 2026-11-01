// Development accounts, one per role, in shop "Gỗ Việt": `pnpm --filter @omnibot/api db:seed`.
// The password is public in this repo, so the script refuses to touch anything but a local database.
import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import pg from 'pg';

const url = process.env.DATABASE_URL;
const host = url ? new URL(url).hostname : '';
if (!['localhost', '127.0.0.1', '::1'].includes(host) || process.env.NODE_ENV === 'production') {
  console.error('seed-dev chỉ chạy với database trên máy cục bộ. Kiểm tra DATABASE_URL và NODE_ENV.');
  process.exit(1);
}

const PASSWORD = 'Demo@1234';
const USERS = [
  ['admin@goviet.vn', 'Quản trị viên', 'ADMIN'],
  ['quanly@goviet.vn', 'Hải Yến (Quản lý)', 'MANAGER'],
  ['sale@goviet.vn', 'Minh Quân (Sale)', 'SALE'],
  ['kho@goviet.vn', 'Văn Tài (Thủ kho)', 'WAREHOUSE'],
];

const db = new pg.Client({ connectionString: url });
await db.connect();
const passwordHash = await hash(PASSWORD, { memoryCost: 65_536, timeCost: 3, parallelism: 1 });
const ids = {};
for (const [email, fullName] of USERS) {
  const { rows } = await db.query(
    `INSERT INTO "User" (id, email, "passwordHash", "fullName", "emailVerifiedAt", "updatedAt") VALUES ($1, $2, $3, $4, now(), now())
     ON CONFLICT (email) DO UPDATE SET "passwordHash" = $3, status = 'ACTIVE', "deletionRequestedAt" = NULL, "updatedAt" = now() RETURNING id`,
    [randomUUID(), email, passwordHash, fullName],
  );
  ids[email] = rows[0].id;
}
const { rows: shops } = await db.query(
  `INSERT INTO "Shop" (id, name, slug, field, "ownerId") VALUES ($1, 'Gỗ Việt', 'go-viet-dev', 'Nội thất', $2)
   ON CONFLICT (slug) DO UPDATE SET "deletedAt" = NULL RETURNING id`,
  [randomUUID(), ids['admin@goviet.vn']],
);
for (const [email, , role] of USERS) {
  await db.query(
    `INSERT INTO "ShopMember" (id, "shopId", "userId", role, status) VALUES ($1, $2, $3, $4::"Role", 'ACTIVE')
     ON CONFLICT ("shopId", "userId") DO UPDATE SET role = $4::"Role", status = 'ACTIVE'`,
    [randomUUID(), shops[0].id, ids[email], role],
  );
}
await db.end();
console.log(`Đã tạo ${USERS.length} tài khoản dev, mật khẩu ${PASSWORD}: ${USERS.map((u) => u[0]).join(', ')}`);
