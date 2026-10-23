# ADR 0001 – Monorepo với pnpm workspaces

- Trạng thái: Chấp nhận · Ngày: 23/10/2026

## Bối cảnh
OmniBot gồm web (React), backend (NestJS), worker, app di động (Expo) và các kiểu dữ liệu dùng chung. Cần chia sẻ kiểu dữ liệu, schema kiểm tra và một CI chung.

## Quyết định
- Một repo, pnpm workspaces: `apps/*` (web, api, worker, mobile, ai-server tạm) và `packages/*` (shared).
- pnpm 10 qua corepack (`packageManager` trong `package.json`), Node 24 (`.nvmrc`).
- pnpm chặn script cài đặt của thư viện, chỉ cho phép danh sách trong `pnpm-workspace.yaml` (`esbuild`).
- `apps/ai-server` (Express + Claude) là tạm thời, sẽ gộp vào `apps/api` ở Bước 7.

## Hệ quả
- Mỗi máy cần `corepack enable pnpm` một lần.
- CI cài một lần cho toàn repo, dùng `pnpm-lock.yaml` để đảm bảo giống nhau giữa các máy.
