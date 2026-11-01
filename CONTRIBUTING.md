# Quy ước phát triển OmniBot

Quy trình đầy đủ: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) – Phần I.

## Cài đặt
```bash
corepack enable pnpm   # một lần trên mỗi máy (Node 22+)
pnpm install
pnpm dev               # web: http://localhost:5173
pnpm dev:ai            # API AI tạm thời: http://localhost:8787 (cần apps/ai-server/.env)
```

## Kiểm tra trước khi mở PR
```bash
pnpm check   # = lint + format:check + typecheck + test + build
```

## Nhánh & commit
- `main` được bảo vệ: chỉ merge qua Pull Request, CI xanh, ≥ 1 người duyệt (xác thực, thanh toán, kho, phân quyền: 2 người).
- Mỗi bước một nhánh: `step-XX-ten-ngan` (VD `step-02-auth`); sửa lỗi: `fix/<mo-ta>`.
- Commit theo Conventional Commits: `feat(auth): ...`, `fix(orders): ...`, `chore: ...`, `docs: ...`, `test: ...`.
- Hoàn tất một bước: gắn tag `step-XX-done` sau khi qua cổng chuyển bước.

## Code
- Code mới viết bằng **TypeScript strict** (cấu hình chung `tsconfig.base.json`). Frontend thử nghiệm hiện tại (`apps/web/src`) còn là JavaScript, sẽ chuyển dần.
- Định dạng bằng Prettier, kiểm tra bằng ESLint (`eslint.config.js`).
- Viết test cùng lúc với code; không merge khi test đỏ.
- Không commit bí mật: dùng file `.env` (đã bị git bỏ qua) và `.env.example` để mô tả biến.
- Quyết định kiến trúc quan trọng ghi vào `docs/adr/`.
