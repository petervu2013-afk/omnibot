# BÁO CÁO BƯỚC 00 – Chuẩn bị dự án

Ngày: 23/10/2026 · Nhánh: `step-00-monorepo` · Người thực hiện: Claude (cùng chủ dự án Vu Peter)

## 1. Phạm vi
**Đã làm**
- Khởi tạo git (`main` chứa mốc gốc của bản frontend thử nghiệm; công việc Bước 0 nằm trên nhánh `step-00-monorepo`).
- Monorepo pnpm workspaces: `apps/web` (frontend), `apps/ai-server` (API Claude tạm thời); pnpm 10 qua corepack, Node 24 (`.nvmrc`).
- Quy ước code: ESLint 9 (React, React Hooks), Prettier, EditorConfig, `tsconfig.base.json` (strict), `.gitattributes` (LF).
- Test: Vitest + 18 test đơn vị cho logic sẽ chuyển lên backend (AI dự phòng, quy trình CRM, quy tắc mật khẩu, CSV, phân tích).
- CI GitHub Actions: lint → format → typecheck → test → build → audit thư viện.
- Tài liệu: `README`, `CONTRIBUTING`, mẫu PR, ADR 0001, khung `docs/openapi.yaml`, bảng theo dõi hồ sơ bên ngoài `docs/EXTERNAL_ACCOUNTS.md`.
- Sửa lỗi phát hiện khi bật lint: 3 import thừa, 1 tham số thừa, 2 phụ thuộc hook React, ký tự ẩn (BOM, dấu tổ hợp) trong regex ở `csv.js`, `bot.js`, `Orders.jsx` (thay bằng mã `﻿`, `̀-ͯ`, hành vi giữ nguyên).

**Để lại / cần chủ dự án làm**
- Tạo repo GitHub (private), đẩy code, bật bảo vệ nhánh `main` (bắt buộc PR + CI xanh). *Máy này chưa có GitHub CLI và repo chưa có remote.*
- Nộp các hồ sơ bên ngoài trong `docs/EXTERNAL_ACCOUNTS.md` (Meta, Zalo, TikTok, GHN/GHTK, ngân hàng, Anthropic, email, D-U-N-S, Apple, Google).
- Thuê VPS staging + tên miền.
- `pnpm typecheck` hiện chưa kiểm tra gì vì chưa có package TypeScript; sẽ có hiệu lực từ Bước 1 (`apps/api`). Ngưỡng độ phủ test ≥ 80% áp dụng cho code mới từ Bước 1.

## 2. Kết quả kiểm tra
| Kiểm tra | Kết quả |
|---|---|
| `pnpm lint` | ✔ 0 lỗi, 0 cảnh báo |
| `pnpm format:check` | ✔ |
| `pnpm typecheck` | ✔ (chưa có package TS) |
| `pnpm test` | ✔ 18/18 |
| `pnpm build` | ✔ web + ai-server |
| `pnpm audit --prod --audit-level high` | ✔ không có lỗ hổng |
| Cú pháp `.github/workflows/ci.yml` | ✔ hợp lệ (10 bước) |

**Cổng chuyển bước**
| Tiêu chí (theo kế hoạch) | Kết quả |
|---|---|
| `pnpm install && build` chạy được trên máy sạch | ✔ Clone mới → `install --frozen-lockfile` → `pnpm check` exit 0 |
| CI chặn khi cố tình làm lỗi | ✔ Chạy cục bộ: lỗi lint, test sai, sai định dạng đều exit 1; gỡ lỗi → exit 0. ⏳ Chặn merge thật trên GitHub: chờ tạo repo + bảo vệ nhánh |
| `apps/web` chạy giống trước | ✔ Đăng nhập demo, Dashboard, Quảng cáo, Livechat, CRM, Kho, Sổ quỹ, Báo cáo, Bảo mật hiển thị dữ liệu; 0 request lỗi |
| Hồ sơ bên ngoài đã nộp kèm ngày dự kiến | ⏳ Chưa nộp (chủ dự án) |

## 3. Lỗi còn mở
Nghiêm trọng 0 · Cao 0 · Trung bình 0 · Thấp 0

## 4. Ghi chú môi trường
- Đã bật `corepack enable pnpm` trên máy (tạo lệnh `pnpm` trong thư mục cài Node; gỡ bằng `corepack disable`).
- Git của repo cấu hình người commit: Vu Peter `<petervu2013@gmail.com>` (chỉ trong repo này).

## 5. Kết luận
**Phần kỹ thuật: ĐẠT.** Bước 0 hoàn tất khi chủ dự án: (1) tạo repo GitHub và bật bảo vệ nhánh, (2) nộp hồ sơ bên ngoài mục 1–11, (3) duyệt báo cáo này → merge `step-00-monorepo` vào `main` và gắn tag `step-00-done`.

Người duyệt: ______________ Ngày: __/__/____
