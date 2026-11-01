# OmniBot – Chatbot AI & CRM quản trị kênh bán hàng online

Monorepo (pnpm workspaces):

| Thư mục | Nội dung | Trạng thái |
|---|---|---|
| `apps/web` | Giao diện web React + Vite (mọi màn hình, đang chạy dữ liệu mẫu) | Có |
| `apps/ai-server` | API AI tạm thời (Express + Claude) | Có – gộp vào `apps/api` ở Bước 7 |
| `apps/api` | Backend NestJS 12 + Prisma 7 + PostgreSQL + Redis (`/health`, tenant guard, mã hóa token) | Bước 1 – nền tảng; API nghiệp vụ từ Bước 2 |
| `apps/mobile` | App Android/iOS (Expo SDK 58 + Expo Router), giao diện điện thoại & iPad, dữ liệu mẫu | Giao diện mẫu – nối API ở Bước 17 |
| `apps/worker`, `packages/shared` | Hàng đợi, mã dùng chung | Các bước sau |

## Bắt đầu
```bash
corepack enable pnpm      # một lần (Node 22+)
pnpm install
pnpm dev                  # http://localhost:5173 – tài khoản demo: admin@goviet.vn / Demo@1234
pnpm --filter @omnibot/api db:local  # PostgreSQL cục bộ không cần Docker (cổng 5433); hoặc: docker compose up
pnpm --filter @omnibot/api start     # API http://localhost:3000/health – cần apps/api/.env (xem .env.example) và build trước
pnpm dev:ai               # tùy chọn: AI Claude, cần apps/ai-server/.env (xem .env.example)
pnpm --filter @omnibot/mobile start   # app di động: quét QR bằng Expo Go (điện thoại / iPad)
pnpm --filter @omnibot/mobile web     # xem app di động trên trình duyệt: http://localhost:8081
pnpm check                # lint + format + typecheck + test + build (giống CI)
```

## Tài liệu
- [Hồ sơ dự án](docs/PROJECT_SPEC.md) – tính năng, phân quyền, bảo mật, quy định kho ứng dụng, Prisma schema, roadmap
- [Kế hoạch triển khai từng bước](docs/IMPLEMENTATION_PLAN.md) – việc cần làm → tạo code → kiểm tra → cổng chuyển bước
- [Hồ sơ & tài khoản bên ngoài](docs/EXTERNAL_ACCOUNTS.md)
- [Quy ước phát triển](CONTRIBUTING.md) · [Quyết định kiến trúc](docs/adr/)
