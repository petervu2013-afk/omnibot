# BÁO CÁO BƯỚC 01 – Hạ tầng backend

Ngày: 28/10/2026 · Nhánh: `step-01-backend` (tách từ `mobile-templates`) · Người thực hiện: Claude (cùng chủ dự án Vu Peter)

## 1. Phạm vi
**Đã làm** (theo `IMPLEMENTATION_PLAN.md` – Bước 1)
- `apps/api`: NestJS 12 (ESM) + TypeScript 6, cấu trúc `config/`, `common/`, `core/`, `health/`.
- Biến môi trường chốt trong `apps/api/.env.example`, kiểm tra bằng zod khi khởi động (`src/config/env.ts`); quy định lưu bí mật trong ADR 0002.
- Bảo vệ HTTP: Helmet, CORS theo danh sách `CORS_ORIGINS`, giới hạn body 1 MB, rate limit 120 yêu cầu/phút/IP, `trust proxy` cho nginx.
- Bộ lọc lỗi chung `{ error: { code, message, details? }, requestId }`; `X-Request-Id` trong header, body lỗi và log.
- Prisma 7.10: `prisma/schema.prisma` chép từ hồ sơ dự án mục 7 (60+ bảng), migration đầu tiên `20261028023812_init` (914 dòng SQL), `prisma.config.ts`.
- `PrismaService` với **tenant guard**: truy vấn thiếu `shopId` vào 28 bảng nghiệp vụ bị chặn trước khi chạm DB.
- `RedisService` (ioredis 6), `CryptoService` AES-256-GCM.
- `GET /health` → `{status, db, redis, uptime}` (200 hoặc 503), `GET /v1` (thông tin phiên bản).
- `docker-compose.yml` (postgres 18, redis 8, migrate, api) + `apps/api/Dockerfile` nhiều tầng, healthcheck.
- CI: job mới `api-e2e` chạy với PostgreSQL 18 + Redis 8 thật (service container): validate → e2e → kiểm tra migration khớp schema.
- ESLint cho TypeScript (typescript-eslint), Prettier cho `apps/api`.
- Chạy PostgreSQL không cần Docker: `pnpm --filter @omnibot/api db:local`.
- Tài liệu: ADR 0002, `docs/openapi.yaml` (`/health`, `/v1`, schema `Error`).

**Để lại / cần chủ dự án làm**
- **Staging qua HTTPS** (điều kiện cổng chuyển bước): cần VPS + tên miền (đã nằm trong việc còn lại của Bước 0). Khi có VPS: cài Docker, `docker compose up -d --build`, nginx + Let's Encrypt trước cổng 3000.
- **Chưa chạy được Docker trên máy này** (không có Docker/WSL) → `docker-compose.yml` và `Dockerfile` chưa được build thử; sẽ được kiểm tra lần đầu trên VPS hoặc máy có Docker Desktop.
- **CI chưa chạy thật** vì repo chưa có trên GitHub (Bước 0). Job `api-e2e` sẽ chạy ngay khi đẩy code lên.
- Seed dữ liệu mẫu: dời sang Bước 2 (cần tài khoản người dùng/shop thật từ API đăng ký).

## 2. Kết quả kiểm tra
| Kiểm tra | Kết quả |
|---|---|
| `pnpm lint` (web, ai-server, **api**, mobile) | ✔ 0 lỗi |
| `pnpm format:check` | ✔ |
| `pnpm typecheck` (api, mobile) | ✔ 0 lỗi |
| `pnpm test` | ✔ api 26/26 · web 18/18 |
| `pnpm --filter @omnibot/api test:e2e` | ✔ 14/14 (PostgreSQL 18 nhúng, Redis giả lập) |
| `pnpm build` | ✔ web, ai-server, api |
| `prisma validate` | ✔ |
| `prisma migrate deploy` trên DB trắng | ✔ (mỗi lần chạy e2e tạo DB mới rồi migrate) |
| `prisma migrate diff` (migration khớp schema) | ✔ "No difference detected" |
| `pnpm audit --prod --audit-level high` | ✔ (2 cảnh báo của `@expo/cli` được chấp nhận có ghi lý do, xem mục 4) |
| Độ phủ code `apps/api/src` (chỉ tính e2e) | 86% dòng · env/crypto/tenant-guard còn được unit test riêng |
| Kiểm tra test bắt được lỗi | ✔ Bỏ `Order` khỏi danh sách bảng → 3 unit test đỏ; tắt tenant guard → e2e đỏ |

**Đối chiếu checklist Bước 1**
| Mục | Kết quả |
|---|---|
| `/health` trả `{db: ok, redis: ok}` | ✔ e2e (Redis giả lập cục bộ, Redis thật trong CI) · chạy tay với DB thật: `db: ok`, Redis không có → `503 redis: down` đúng thiết kế |
| `prisma migrate deploy` chạy trên DB trắng; `prisma validate` đạt | ✔ |
| Unit test `CryptoService` (đúng khóa giải mã được; sai khóa → lỗi) | ✔ 7 test (kể cả dữ liệu bị sửa, sai định dạng) |
| Truy vấn thiếu `shopId` bị chặn | ✔ 8 unit test + 3 e2e trên PostgreSQL (không đọc/sửa được dữ liệu shop khác theo id) |
| Thiếu biến môi trường → không khởi động, báo rõ biến nào | ✔ chạy `dist/main.js` thật: thoát mã 1, liệt kê đủ 5 biến; production từ chối khóa mẫu |
| `docker compose up` → `/health` xanh | ⏳ chưa có Docker trên máy này |
| Staging HTTPS, CI có PostgreSQL thật | ⏳ chờ VPS + repo GitHub |

## 3. Lỗi phát hiện & đã sửa trong bước
| Mức | Lỗi | Xử lý |
|---|---|---|
| Cao | PostgreSQL nhúng trên Windows khởi tạo bằng mã hóa **WIN1252** → lưu "Gỗ Việt" bị lỗi `22P05` | Ép `--encoding=UTF8 --locale=C` ở `db:local`, test e2e, docker compose và CI; tạo lại DB cục bộ |
| Trung bình | `prisma generate` đòi `DATABASE_URL` (hàm `env()`), làm hỏng typecheck/CI | Dùng `process.env.DATABASE_URL` trong `prisma.config.ts` |
| Trung bình | Mã Prisma sinh ra import đuôi `.ts`, `tsc` không build được | `importFileExtension = "js"` trong generator |
| Thấp | Log lỗi Redis rỗng khi `ECONNREFUSED` | Hiện `code`/`name` khi `message` rỗng |
| Thấp | Thư mục tạm của DB test bị khóa khi xóa trên Windows | Thử lại 10 lần, chỉ cảnh báo nếu vẫn lỗi |

## 4. Lỗi còn mở
Nghiêm trọng 0 · Cao 0 · Trung bình 0 · Thấp 0.

Rủi ro được chấp nhận (ghi trong `pnpm-workspace.yaml`, xem lại khi nâng Expo SDK, hạn 31/01/2027):
- GHSA-86w9-cpqp-85rv (`node-forge`) và GHSA-mrhx-c7xc-m3w5 (`zod` 3) – chỉ nằm trong `expo > @expo/cli` (công cụ build trên máy dev/EAS, không có trong app hay API); `node-forge` chưa có bản vá.

## 5. Cách chạy
```bash
pnpm --filter @omnibot/api db:local      # cửa sổ 1: PostgreSQL cổng 5433 (không cần Docker)
cp apps/api/.env.example apps/api/.env    # sửa DATABASE_URL sang cổng 5433, tạo khóa ngẫu nhiên
pnpm --filter @omnibot/api prisma:deploy
pnpm --filter @omnibot/api build && pnpm --filter @omnibot/api start   # http://localhost:3000/health
pnpm --filter @omnibot/api test:e2e
# Có Docker: docker compose up --build
```

## 6. Người duyệt
Người duyệt: ______ · Kết luận: **CHƯA ĐẠT CỔNG** – phần code đạt; còn thiếu staging HTTPS và CI chạy thật (phụ thuộc Bước 0: GitHub + VPS).


## Cập nhật 31/10/2026: CI thật
GitHub Actions đã chạy xanh trên PR #1 (commit `4557690`), gồm job e2e với PostgreSQL 18 + **Redis 8 thật** và kiểm tra migration khớp schema. Lần chạy đầu lộ lỗi `test:e2e` thiếu `prisma generate` trên bản clone sạch, đã sửa. `docker compose` và staging HTTPS vẫn chưa kiểm tra.
