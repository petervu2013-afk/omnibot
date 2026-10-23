# OmniBot – Chatbot AI & CRM quản trị kênh bán hàng online

Monorepo (pnpm workspaces):

| Thư mục | Nội dung | Trạng thái |
|---|---|---|
| `apps/web` | Giao diện web React + Vite (mọi màn hình, đang chạy dữ liệu mẫu) | Có |
| `apps/ai-server` | API AI tạm thời (Express + Claude) | Có – gộp vào `apps/api` ở Bước 7 |
| `apps/api` | Backend NestJS + Prisma + PostgreSQL + Redis | Bước 1 |
| `apps/worker`, `apps/mobile`, `packages/shared` | Hàng đợi, app di động, mã dùng chung | Các bước sau |

## Bắt đầu
```bash
corepack enable pnpm      # một lần (Node 22+)
pnpm install
pnpm dev                  # http://localhost:5173 – tài khoản demo: admin@goviet.vn / Demo@1234
pnpm dev:ai               # tùy chọn: AI Claude, cần apps/ai-server/.env (xem .env.example)
pnpm check                # lint + format + typecheck + test + build (giống CI)
```

## Tài liệu
- [Hồ sơ dự án](docs/PROJECT_SPEC.md) – tính năng, phân quyền, bảo mật, quy định kho ứng dụng, Prisma schema, roadmap
- [Kế hoạch triển khai từng bước](docs/IMPLEMENTATION_PLAN.md) – việc cần làm → tạo code → kiểm tra → cổng chuyển bước
- [Hồ sơ & tài khoản bên ngoài](docs/EXTERNAL_ACCOUNTS.md)
- [Quy ước phát triển](CONTRIBUTING.md) · [Quyết định kiến trúc](docs/adr/)
