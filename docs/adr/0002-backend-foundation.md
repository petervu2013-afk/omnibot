# ADR 0002 – Nền tảng backend (Bước 1)

- Trạng thái: Chấp nhận · Ngày: 28/10/2026

## Bối cảnh
Bước 1 dựng `apps/api` theo hồ sơ dự án mục 6–7: NestJS + Prisma + PostgreSQL + Redis, chạy được trên máy phát triển Windows chưa có Docker và trong CI/VPS bằng Docker.

## Quyết định
| Chủ đề | Lựa chọn | Lý do |
|---|---|---|
| Framework | **NestJS 12** (ESM, `"type": "module"`) | Bản ổn định mới nhất; NestJS 12 phát hành dạng ESM nên API cũng là ESM (`module: NodeNext`, import có đuôi `.js`) |
| TypeScript | **~6.0** (không dùng 7.x) | TypeScript 7 là bản viết lại bằng Go; chưa xác nhận hỗ trợ `experimentalDecorators` + `emitDecoratorMetadata` mà DI của NestJS cần. typescript-eslint cũng chỉ hỗ trợ < 6.1 |
| ORM | **Prisma 7.10** (bản ổn định; thẻ `latest` trên npm đang là 8.0 RC) | Generator `prisma-client` sinh mã vào `src/generated/prisma` (ESM, import `.js`); kết nối qua driver adapter `@prisma/adapter-pg`; cấu hình ở `prisma.config.ts` |
| Vị trí schema | `apps/api/prisma/schema.prisma` (không đặt ở gốc repo như sơ đồ ban đầu) | Chỉ API (và sau này worker) dùng; worker sẽ trỏ `--schema` về file này |
| Kiểm tra biến môi trường | zod 4, chạy khi nạp `AppModule` | Thiếu/sai biến → dừng khởi động, liệt kê **tất cả** biến lỗi; ở production cấm dùng giá trị mẫu của `.env.example` |
| Cách ly dữ liệu giữa shop | Prisma client extension `tenant-guard` trên `PrismaService.db` | Mọi truy vấn vào 28 bảng có `shopId` bắt buộc phải có `shopId` ở cấp cao nhất của `where` / `data`, nếu không ném `TenantScopeError` **trước khi** chạm DB. Danh sách bảng được test đối chiếu tự động với `schema.prisma` |
| Client không chặn | `PrismaService.system` | Chỉ cho việc hợp lệ xuyên shop (tra email khi đăng nhập, job hệ thống). **Mỗi chỗ dùng mới phải được reviewer duyệt** |
| Mã hóa token | AES-256-GCM, định dạng `v1.iv.tag.data` (base64url) | Có tiền tố phiên bản để xoay khóa sau này |
| Lỗi trả về | `{ error: { code, message, details? }, requestId }` | Một định dạng cho web/mobile; lỗi 5xx không lộ chi tiết, chỉ ghi log kèm stack |
| Rate limit | `@nestjs/throttler`, bộ nhớ trong tiến trình, mặc định 120 yêu cầu/phút/IP; `/health` không giới hạn | Đủ cho 1 instance; chuyển sang Redis khi chạy nhiều instance (Bước 16) |
| Log | Nest `ConsoleLogger` (JSON ở production) + `X-Request-Id` cho mọi yêu cầu | Không thêm thư viện log ở bước này |
| DB cục bộ không Docker | `embedded-postgres` (PostgreSQL 18), **ép UTF8** | initdb trên Windows mặc định WIN1252 → không lưu được tiếng Việt (lỗi đã bắt được bằng test e2e) |
| Redis cục bộ không Docker | Test e2e dùng Redis giả lập (chỉ trả lời PING) khi không có `REDIS_URL` | CI chạy cùng bộ test với Redis 8 thật |

## Quy định lưu bí mật
- Máy phát triển: `apps/api/.env` (đã nằm trong `.gitignore`), tạo từ `.env.example` với khóa ngẫu nhiên.
- Staging/production: biến môi trường do máy chủ cấp (Docker secrets / file `.env` chỉ root đọc được trên VPS), không commit, không gửi qua chat. Sinh khóa bằng `openssl rand -base64 32` (ENCRYPTION_KEY) và `openssl rand -base64 48` (JWT_*).
- Đổi `ENCRYPTION_KEY` cần quy trình xoay khóa (giải mã bằng khóa cũ, mã hóa lại) – làm khi có dữ liệu thật (Bước 5).

## Hệ quả
- Test dùng SWC (`unplugin-swc`) vì esbuild không sinh decorator metadata.
- Không dùng quy tắc ESLint `consistent-type-imports` cho API (có thể biến import class của DI thành `import type` và làm hỏng DI).
- Bảng con không có `shopId` (Message, OrderItem…) chỉ được truy cập qua bảng cha đã lọc shop; quy tắc phân quyền theo vai trò/người phụ trách bổ sung ở Bước 3.
