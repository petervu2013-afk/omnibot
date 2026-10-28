# KẾ HOẠCH TRIỂN KHAI TỪNG BƯỚC – OMNIBOT

> Đi kèm [Hồ sơ dự án OmniBot](PROJECT_SPEC.md) (mã tính năng AUTH-xx, POS-xx… và Prisma schema ở mục 7).
> Nguyên tắc: **mỗi bước phải qua đủ 3 phần – Việc cần làm → Tạo code → Kiểm tra code – và đạt "Cổng chuyển bước" mới được sang bước sau.** Không làm song song hai bước phụ thuộc nhau.
> Cập nhật 24/10/2026 theo Hồ sơ dự án **v2.1** (thêm giao diện mẫu điện thoại & iPad – Bước 0b; Bước 17–18 làm tiếp trên giao diện mẫu).

**Trạng thái hiện tại**
| Bước | Trạng thái | Còn lại |
|---|---|---|
| 0 – Chuẩn bị dự án | 🟡 Phần code **đạt** (monorepo pnpm, CI, lint/format/typecheck/test/build, báo cáo `docs/reports/STEP-00.md`) | Chủ dự án: tạo repo GitHub + bảo vệ nhánh `main`, nộp hồ sơ tài khoản bên ngoài (`docs/EXTERNAL_ACCOUNTS.md`), duyệt & merge |
| 0b – Giao diện mẫu di động | 🟡 Code **đạt** (typecheck, lint, chạy thử khung điện thoại 375 px và iPad 1024 px) | Chủ dự án xem demo và duyệt |
| 1 – Hạ tầng backend | 🟡 Code **đạt** (lint, typecheck, 26 unit + 14 e2e trên PostgreSQL, migrate trên DB trắng; báo cáo `docs/reports/STEP-01.md`) | Staging HTTPS + CI chạy thật (cần VPS, repo GitHub từ Bước 0); build thử Docker |
| 2 → 19 | ⬜ Chưa bắt đầu | Bước 2 – Xác thực |

---

## Phần I. Quy trình chung cho MỌI bước

### 1. Vòng làm việc của một bước
```
 ┌─────────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │ 1. CHUẨN BỊ │ → │ 2. TẠO CODE │ → │ 3. TỰ KIỂM   │ → │ 4. REVIEW &  │ → │ 5. CỔNG      │
 │ đọc spec,   │   │ nhánh riêng │   │ lint, type,  │   │ CI xanh,     │   │ CHUYỂN BƯỚC  │
 │ chốt API,   │   │ code + test │   │ test, chạy   │   │ deploy       │   │ checklist +  │
 │ test case   │   │ cùng lúc    │   │ thử tay      │   │ staging, QA  │   │ người duyệt  │
 └─────────────┘   └─────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
        ▲                                                                           │
        └──────────────────── chưa đạt: sửa và kiểm tra lại ────────────────────────┘
```

**1. Chuẩn bị** (trước khi viết dòng code nào)
- Đọc các mã tính năng của bước trong hồ sơ dự án; ghi lại phần nào làm, phần nào để sau.
- Chốt **hợp đồng API** (đường dẫn, dữ liệu vào/ra, mã lỗi) vào file OpenAPI.
- Viết sẵn **danh sách test case** (gồm cả trường hợp lỗi, quyền truy cập, dữ liệu biên).
- Kiểm tra phụ thuộc bên ngoài đã sẵn sàng (tài khoản Meta, Zalo, GHN…).

**2. Tạo code**
- Mỗi bước một nhánh git `step-XX-ten-buoc`; commit nhỏ, mô tả rõ.
- Viết test **cùng lúc** với code (không để cuối bước).
- Migration DB tạo bằng `prisma migrate dev --name ...`, không sửa tay migration đã chạy.

**3. Tự kiểm tra** – chạy đủ, tất cả phải đạt:
| Lệnh | Yêu cầu |
|---|---|
| `pnpm lint` | 0 lỗi |
| `pnpm typecheck` | 0 lỗi TypeScript |
| `pnpm test` | 100% test qua; độ phủ code mới ≥ 80% (logic nghiệp vụ, phân quyền: ≥ 90%) |
| `pnpm test:e2e` | Các luồng chính của bước qua |
| `pnpm build` | Build web, API thành công |
| `pnpm --filter @omnibot/mobile typecheck` + `lint` | 0 lỗi (đã nằm trong `pnpm lint` / `pnpm typecheck` gốc) – bắt buộc khi bước có sửa `apps/mobile` |
| Xem trên 2 khung | Bước có giao diện di động: kiểm tra ở **điện thoại (375 × 812)** và **iPad (1024 × 768 ngang, 768 × 1024 dọc)** – không tràn chữ, nút ≥ 44 pt, không lỗi console |
| `prisma migrate diff` | Migration khớp schema, chạy được trên DB trắng |
| Chạy thử tay | Làm lại các test case thủ công trên máy local |

**4. Review & staging**
- Mở Pull Request: mô tả, ảnh chụp màn hình, kết quả test.
- CI (GitHub Actions) chạy lại toàn bộ mục 3 + quét bảo mật thư viện (`pnpm audit`, CodeQL).
- Ít nhất 1 người review; với code xác thực, thanh toán, kho, phân quyền: **2 người**.
- Merge → tự deploy **staging** → QA chạy test case trên staging.

**5. Cổng chuyển bước**
- Tất cả ô trong checklist của bước được đánh dấu.
- Không còn lỗi mức **Nghiêm trọng/Cao** mở.
- Người duyệt (PO/chủ dự án) xem demo trên staging và đồng ý → gắn tag `step-XX-done` → sang bước sau.

### 2. Cấu trúc thư mục đích (monorepo)
```
omnibot/
├── apps/
│   ├── api/        NestJS 12 + Prisma 7 (backend, prisma/schema.prisma) ← Bước 1
│   ├── worker/     BullMQ jobs (gửi tin, đồng bộ)   ← tạo ở Bước 5
│   ├── web/        React + Vite (frontend hiện tại) ← chuyển vào ở Bước 0
│   └── mobile/     Expo SDK 58 + Expo Router        ← giao diện mẫu ở Bước 0b, nối API ở Bước 17
├── packages/
│   └── shared/     Kiểu dữ liệu, schema kiểm tra (zod), hằng số dùng chung web/api/mobile
├── docs/           PROJECT_SPEC.md, IMPLEMENTATION_PLAN.md, openapi.yaml
├── docker-compose.yml
└── .github/workflows/ci.yml
```

### 3. Mức độ lỗi
| Mức | Ví dụ | Xử lý |
|---|---|---|
| Nghiêm trọng | Lộ dữ liệu shop khác, mất đơn, trừ kho sai, bỏ qua đăng nhập | Dừng bước, sửa ngay |
| Cao | Chức năng chính không chạy, sai số tiền | Sửa trước cổng chuyển bước |
| Trung bình | Lỗi giao diện ảnh hưởng thao tác | Sửa trong bước hoặc ghi nợ có hạn |
| Thấp | Chính tả, căn lề | Ghi vào danh sách sửa sau |

---

## Phần II. Các bước triển khai

Tổng quan (sprint 2 tuần, khớp mục 8 hồ sơ dự án):

| Bước | Nội dung | Sprint | Phụ thuộc |
|---|---|---|---|
| 0 | Chuẩn bị: git, monorepo, CI, tài khoản bên ngoài | 1 | – |
| 0b | Giao diện mẫu ứng dụng di động (điện thoại + iPad), dữ liệu giả lập | 1 | 0 |
| 1 | Hạ tầng backend: NestJS + Prisma + PostgreSQL + Redis + Docker | 1 | 0 |
| 2 | Xác thực: đăng ký, đăng nhập, token, phiên, quên mật khẩu, xóa tài khoản | 1 | 1 |
| 3 | Shop, nhân viên, phân quyền RBAC, phạm vi dữ liệu, Audit log | 1 | 2 |
| 4 | Nối frontend web vào API (Auth, sản phẩm, khách hàng, cài đặt) | 1–2 | 3 |
| 5 | Kênh chat & Livechat realtime (Facebook, Instagram, Zalo, TikTok Shop, Webchat) | 2 | 4 |
| 6 | Hợp nhất hồ sơ khách (Identity Resolution) | 2 | 5 |
| 7 | AI trả lời tự động + kịch bản + trả lời nhanh + ngoài giờ | 2 | 6 |
| 8 | Ca làm việc & chia hội thoại xoay vòng, Ref & Src | 2 | 5 |
| 9 | Sản phẩm, kho, đơn hàng (transaction trừ kho) | 3 | 4 |
| 10 | Vận chuyển GHN/GHTK | 3 | 9 |
| 11 | VietQR, thanh toán tự động, thu chi | 3 | 9 |
| 12 | Trigger tự động | 3 | 9, 10, 11 |
| 13 | CRM: pipeline, bám đuổi, cảnh báo, Dashboard | 4 | 7, 9 |
| 14 | Quảng cáo Meta/TikTok: kết nối & đồng bộ | 4 | 8 |
| 15 | Gửi tin hàng loạt Messenger/Zalo ZNS | 4 | 5, 6 |
| 16 | Báo cáo, tích điểm, 2FA, bảo mật & hiệu năng, triển khai production | 4 | 9–15 |
| 17 | Ứng dụng di động (Android/iOS, điện thoại + iPad): nối API vào giao diện mẫu | 5 (có thể bắt đầu song song Bước 14–16) | 0b, 13 |
| 18 | Tuân thủ & nộp App Store / Google Play | 5 | 17 |
| 19 | Chạy thử với shop thật (pilot) & ra mắt | 5+ | 18 |

---

### BƯỚC 0 – Chuẩn bị dự án
**Việc cần làm**
- [ ] Khởi tạo git, đẩy lên GitHub (repo private), bật bảo vệ nhánh `main` (bắt buộc PR + CI xanh).
- [ ] Chuyển frontend hiện tại vào `apps/web`, dựng monorepo pnpm workspace.
- [ ] Thống nhất quy ước: TypeScript strict, ESLint + Prettier, tên nhánh, mẫu PR, mẫu commit.
- [ ] Nộp hồ sơ bên ngoài (chờ duyệt lâu, phải làm sớm): Meta Business verification + App Review, Zalo OA + ZNS, TikTok Shop Partner, GHN/GHTK API, dịch vụ báo biến động số dư, Anthropic API key, mã D-U-N-S, Apple Developer & Google Play Console (tài khoản tổ chức).
- [ ] Chuẩn bị máy chủ staging (VPS) và tên miền `staging.<ten-mien>`.

**Tạo code**
- `pnpm-workspace.yaml`, `package.json` gốc, `.editorconfig`, `.eslintrc`, `.prettierrc`, `tsconfig.base.json`.
- `.github/workflows/ci.yml`: cài đặt → lint → typecheck → test → build.
- `docs/openapi.yaml` (khung rỗng), `docs/adr/` (ghi quyết định kiến trúc).

**Kiểm tra code**
- [ ] `pnpm install && pnpm -r build` chạy được trên máy sạch.
- [ ] Mở một PR thử → CI chạy và chặn merge khi cố tình làm lỗi lint.
- [ ] `apps/web` chạy `pnpm --filter web dev` giống hiện tại (mọi màn hình còn nguyên).

**Cổng chuyển bước**: repo + CI hoạt động; danh sách hồ sơ bên ngoài đã nộp kèm ngày dự kiến được duyệt.

---

### BƯỚC 0b – Giao diện mẫu ứng dụng di động (MOB-01 → 08, giao diện)
Mục đích: chốt giao diện điện thoại & iPad **trước** khi có backend, để duyệt trải nghiệm, chụp ảnh cửa hàng sớm và tránh làm lại ở Bước 17.

**Việc cần làm**
- [x] Chọn công nghệ: Expo SDK 58 + Expo Router (route theo file), TypeScript, React Compiler.
- [x] Chốt phạm vi app theo hồ sơ mục 1.2: Tổng quan, Hội thoại, Việc cần làm, Đơn hàng, Kho, Thông báo, Tài khoản; không có cài đặt hệ thống / mua gói.
- [x] Chốt quy tắc bố cục điện thoại / tablet (ngưỡng 768 px) và định danh `vn.omnibot.app` (tạm).

**Tạo code**
- [x] `apps/mobile`: `app.json` (tên, bundle id, `supportsTablet`, xoay màn hình), theme, bộ thành phần `ui.tsx`.
- [x] 20 màn hình theo hồ sơ mục 5.5, dữ liệu mẫu `src/data/mock.ts`, trạng thái giả lập `src/lib/store.tsx`.
- [x] Thanh tab dưới (điện thoại) / thanh bên trái (tablet); chia đôi màn hình Hội thoại và Đơn hàng trên tablet.
- [x] Xóa tài khoản trong app (mật khẩu + gõ "XOA"), trang Điều khoản & chính sách mở được khi chưa đăng nhập.
- [x] ESLint riêng cho mobile (`eslint-config-expo`), nối vào `pnpm lint` gốc.

**Kiểm tra code**
- [x] `pnpm --filter @omnibot/mobile typecheck` → 0 lỗi; `pnpm --filter @omnibot/mobile lint` → 0 lỗi.
- [x] Chạy `pnpm --filter @omnibot/mobile web`: đăng nhập demo → đi qua 5 tab ở khung 375 × 812, không lỗi console.
- [x] Khung iPad 1024 × 768: thanh bên trái, chia đôi Hội thoại và Đơn hàng hiển thị đúng.
- [ ] Chạy trên máy thật bằng Expo Go: 1 Android, 1 iPhone, 1 iPad (chủ dự án / QA).
- [ ] `npx expo-doctor` không có cảnh báo nghiêm trọng.

**Cổng chuyển bước**: chủ dự án duyệt giao diện trên điện thoại và iPad; danh sách chỉnh sửa (nếu có) được ghi vào Bước 17.

---

### BƯỚC 1 – Hạ tầng backend
**Việc cần làm**
- [ ] Chốt biến môi trường (`DATABASE_URL`, `REDIS_URL`, `JWT_*`, `ENCRYPTION_KEY`…) và cách lưu bí mật.
- [ ] Viết test case: API khởi động, `/health` báo DB & Redis, lỗi trả đúng định dạng.

**Tạo code**
- `apps/api`: NestJS, cấu hình (`@nestjs/config` + kiểm tra biến môi trường), Helmet, CORS, rate limit, bộ lọc lỗi chung, log có `requestId`.
- `prisma/schema.prisma`: chép schema từ hồ sơ dự án (mục 7); migration đầu tiên.
- `PrismaService` + **middleware bắt buộc `shopId`** cho các bảng nghiệp vụ (chống lộ dữ liệu giữa shop).
- `docker-compose.yml`: `postgres`, `redis`, `api`; `GET /health`.
- Tiện ích mã hóa AES-256-GCM cho token (`CryptoService`).

**Kiểm tra code**
- [ ] `docker compose up` → `GET /health` trả `{db: ok, redis: ok}`.
- [ ] `prisma migrate deploy` chạy được trên DB trắng; `prisma validate` đạt.
- [ ] Unit test `CryptoService` (mã hóa → giải mã đúng; sai khóa → lỗi).
- [ ] Test middleware: truy vấn thiếu `shopId` bị chặn.
- [ ] Thiếu biến môi trường bắt buộc → API không khởi động và báo rõ thiếu biến nào.

**Cổng chuyển bước**: staging chạy API qua HTTPS, `/health` xanh, CI có bước test với PostgreSQL thật (service container).

---

### BƯỚC 2 – Xác thực (AUTH-01 → 06, 13, 17)
**Việc cần làm**
- [ ] Chốt API: `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password`, `GET/DELETE /auth/sessions/:id`, `POST /auth/change-password`, `POST /auth/delete-account`, `POST /auth/cancel-deletion`.
- [ ] Chọn dịch vụ gửi email (SES/Mailgun/SMTP) và mẫu email tiếng Việt.
- [ ] Test case lấy từ luồng đã chạy thử trên frontend (khóa sau 5 lần sai, CAPTCHA từ lần 3, link dùng 1 lần, xoay vòng token, phát hiện dùng lại token…).

**Tạo code**
- `modules/auth`: Argon2id, JWT access 15 phút, refresh token 30 ngày xoay vòng lưu băm theo `familyId`, cookie `HttpOnly; Secure; SameSite=Strict` cho web, trả token trong body cho mobile.
- Khóa tạm & đếm sai bằng Redis; CAPTCHA (Cloudflare Turnstile hoặc reCAPTCHA) kiểm tra phía server.
- `modules/mail`: hàng đợi gửi email (verify, reset, thiết bị mới, xác nhận xóa tài khoản).
- Job xóa vĩnh viễn tài khoản sau 30 ngày (ẩn danh dữ liệu cá nhân).
- Ghi `AuditLog` cho đăng nhập thành công/thất bại.

**Kiểm tra code**
- [ ] Unit test: băm/kiểm mật khẩu, quy tắc mật khẩu, xoay vòng token, phát hiện dùng lại → thu hồi cả chuỗi.
- [ ] E2E: đăng ký → email xác minh → đăng nhập → refresh → đăng xuất; sai 5 lần → khóa 15 phút; reset mật khẩu → mọi phiên bị thu hồi; link reset dùng lần 2 → lỗi; xóa tài khoản → đăng nhập lại trong 30 ngày → hủy được.
- [ ] Bảo mật: thông báo lỗi giống nhau cho email có/không tồn tại; rate limit `/auth/*`; không ghi mật khẩu/token vào log (kiểm tra log thật).
- [ ] Đo thời gian: đăng nhập < 500 ms (Argon2 cấu hình hợp lý).

**Cổng chuyển bước**: 100% test case AUTH qua; review 2 người; quét OWASP ZAP baseline trên `/auth/*` không còn cảnh báo mức cao.

---

### BƯỚC 3 – Shop, nhân viên, phân quyền, Audit log (AUTH-07 → 10, SET-03)
**Việc cần làm**
- [ ] Chốt ma trận quyền (hồ sơ mục 3.2) thành bảng `permission → role` trong code.
- [ ] Test case truy cập chéo: Sale shop A không đọc được bất kỳ dữ liệu nào của shop B; Sale chỉ thấy khách "của mình + chưa phân" khi cài đặt như vậy.

**Tạo code**
- `modules/shop`, `modules/member`: mời nhân viên qua email, nhận lời mời, tạm khóa, chuyển shop, chuyển quyền chủ shop.
- `RolesGuard` + decorator `@Permission('order.cancel')`; `DataScopeService` thêm điều kiện lọc theo vai trò vào truy vấn.
- `AuditInterceptor`: ghi trước/sau cho thao tác ghi quan trọng; API xem/lọc/xuất audit log (chỉ đọc).

**Kiểm tra code**
- [ ] Test tự động sinh từ ma trận quyền: mỗi vai trò × mỗi API → đúng 200/403.
- [ ] Test truy cập chéo shop cho mọi API danh sách và chi tiết.
- [ ] Audit log: không có API sửa/xóa; mỗi thao tác ghi đúng người, thời gian, dữ liệu trước/sau.

**Cổng chuyển bước**: ma trận quyền 100% có test; không lỗi truy cập chéo.

---

### BƯỚC 4 – Nối frontend web vào API
**Việc cần làm**
- [ ] Liệt kê chỗ frontend đang dùng `localStorage` (`apps/web/src/store.jsx`, `apps/web/src/auth.jsx`) và API thay thế.
- [ ] Sinh client TypeScript từ `openapi.yaml` vào `packages/shared`.

**Tạo code**
- Thay `apps/web/src/auth.jsx` bằng gọi API thật (giữ nguyên các màn hình đăng nhập/đăng ký/bảo mật); bỏ "Hộp thư demo".
- Lớp dữ liệu dùng TanStack Query: sản phẩm, danh mục, khách hàng, nhân viên, cài đặt.
- Ẩn/hiện menu và nút theo quyền (dữ liệu quyền lấy từ `/me`).
- Trang Cài đặt → Nhân viên: mời qua email, đổi vai trò.

**Kiểm tra code**
- [ ] Test giao diện (Playwright): đăng nhập bằng 4 vai trò → đúng menu, đúng nút.
- [ ] Mở 2 trình duyệt cùng tài khoản → đăng xuất thiết bị kia hoạt động.
- [ ] Không còn đọc/ghi `omnibot-auth-*` trong `localStorage`.

**Cổng chuyển bước**: web trên staging đăng nhập thật, dữ liệu sản phẩm/khách hàng lưu DB.

---

### BƯỚC 5 – Kênh chat & Livechat realtime (CH-01 → 05)
**Việc cần làm**
- [ ] Có App Meta ở chế độ phát triển + Page thử; OA Zalo thử; tài khoản TikTok Shop sandbox.
- [ ] Test case: tin đến từ mỗi kênh, tin trùng (webhook gửi lại), chữ ký sai, token hết hạn.

**Tạo code**
- `modules/channel`: OAuth kết nối Facebook Page/Instagram, Zalo OA, TikTok Shop; lưu token mã hóa; job kiểm tra token sắp hết hạn.
- `modules/webhook`: xác thực chữ ký (Facebook `X-Hub-Signature-256`, Zalo `mac`…), chống trùng bằng `Message.externalId`, đẩy vào hàng đợi rồi trả 200 ngay.
- `modules/livechat`: Socket.io (phòng theo shop/hội thoại), gửi tin qua Send API từng kênh, trạng thái đã xem/đang gõ.
- Plugin WordPress/WooCommerce + widget JS nhúng (kết nối Socket.io).
- `apps/worker`: BullMQ xử lý tin đến/đi.

**Kiểm tra code**
- [ ] Test webhook với payload mẫu của từng nền tảng (đúng chữ ký → nhận; sai → 401; gửi lại → không tạo tin trùng).
- [ ] E2E: nhắn từ Page thử → hiện trên web < 2 giây; nhân viên trả lời → khách nhận được.
- [ ] Test tải: 50 hội thoại/giây trong 5 phút không mất tin (k6).

**Cổng chuyển bước**: 4 kênh nhận/gửi được trên staging; không mất/trùng tin trong test tải.

---

### BƯỚC 6 – Hợp nhất hồ sơ khách (ID-01)
**Việc cần làm**
- [ ] Chốt quy tắc: tự gộp khi trùng SĐT/email đã chuẩn hóa trong cùng shop; còn lại chỉ đề xuất.
- [ ] Bộ dữ liệu test: SĐT nhiều định dạng (`0901…`, `+84 901…`, `84901…`), email hoa/thường, khách 2 kênh.

**Tạo code**
- `CustomerIdentityService`: tìm/tạo danh tính theo `(channelId, externalUserId)`; chuẩn hóa SĐT/email; gộp hồ sơ (chuyển hội thoại, đơn, hoạt động, nhãn) trong **một transaction**; ghi `CustomerMergeLog`; tách lại hồ sơ.
- Giao diện: hồ sơ 360° hiện mọi kênh của khách; danh sách "đề xuất gộp".

**Kiểm tra code**
- [ ] Unit test chuẩn hóa SĐT/email (≥ 20 trường hợp).
- [ ] Test gộp: không mất hội thoại/đơn; gộp 2 lần không lỗi; tách lại khôi phục đúng.
- [ ] Test không gộp nhầm giữa 2 shop khác nhau.

**Cổng chuyển bước**: cùng SĐT nhắn từ Facebook và Zalo → 1 hồ sơ với đủ lịch sử mua hàng & tương tác.

---

### BƯỚC 7 – AI trả lời tự động (BOT-01 → 04)
**Việc cần làm**
- [ ] Bộ đánh giá AI: ≥ 50 đoạn hội thoại mẫu (hỏi giá, hết hàng, chốt đơn, phàn nàn, ngoài dữ liệu) kèm kết quả mong đợi.
- [ ] Ngân sách chi phí AI/tháng và hạn mức credit theo gói.

**Tạo code**
- `modules/ai`: chuyển logic từ `apps/ai-server/index.js` (Claude, structured output, cache prompt danh mục, fallback khi bị từ chối); hàng đợi **theo từng hội thoại** (tin gửi dồn → trả lời một lần với đủ ngữ cảnh); ghi `aiCostUsd`, credit.
- Áp kết quả: lưu SĐT/địa chỉ → giao lead (Bước 8) → tạo đơn (Bước 9, tạm tắt cho tới khi Bước 9 xong) → chuyển nhân viên.
- Kịch bản từ khóa, trả lời nhanh, trả lời ngoài giờ theo lịch làm việc.

**Kiểm tra code**
- [ ] Chạy bộ đánh giá: ≥ 90% câu trả lời đúng giá/tồn kho, 0% bịa sản phẩm, chuyển nhân viên đúng ≥ 95% ca phàn nàn.
- [ ] Thời gian trả lời trung vị < 8 giây; lỗi API AI → dùng trả lời dự phòng, không bỏ rơi khách.
- [ ] Test tin gửi dồn 3 tin trong 1 giây → 1 câu trả lời đủ ý.

**Cổng chuyển bước**: chủ dự án duyệt 20 hội thoại thật trên Page thử.

---

### BƯỚC 8 – Ca làm việc, chia hội thoại, Ref & Src (AUTH-15, 16, ADS-08)
**Tạo code**: `WorkShift`, trạng thái online qua Socket.io, chia xoay vòng (`lastAssignedAt`) theo 4 chế độ; đọc `ref` (Messenger), `ads_id`, `utm_*` gắn vào khách/hội thoại.

**Kiểm tra code**
- [ ] Test chia 100 hội thoại cho 3 sale online → lệch ≤ 1; sale ngoài ca/tắt nhận lead → không được chia.
- [ ] Test 2 tin đến cùng lúc không chia trùng (khóa Redis).
- [ ] Link quảng cáo có `ref` → khách mang đúng chiến dịch.

**Cổng chuyển bước**: chạy thử 1 ngày trên staging với 3 tài khoản sale.

---

### BƯỚC 9 – Sản phẩm, kho, đơn hàng (POS-01→05, WH-01→04, ORD-01→02)
**Việc cần làm**
- [ ] Test case đồng thời: 2 đơn cùng mua sản phẩm còn 1 → chỉ 1 đơn thành công (khi không cho bán âm).

**Tạo code**
- CRUD sản phẩm, danh mục, combo, coupon, nhà cung cấp; nhập Excel; quét danh mục bằng AI.
- Phiếu kho Nhập/Xuất/Chuyển/Kiểm (Nháp → Hoàn tất/Hủy).
- `OrderService.create`: **một transaction** – tạo đơn → `SELECT … FOR UPDATE` tồn kho → kiểm tra → phiếu xuất DONE → cập nhật tồn → audit; hủy/hoàn → hoàn kho.
- Tạo đơn từ hội thoại (nhân viên & AI).

**Kiểm tra code**
- [ ] Test đồng thời 50 request mua cùng sản phẩm → tồn không âm, tổng xuất = số đơn thành công.
- [ ] Test hủy đơn hoàn đúng kho; kiểm kho chốt đúng chênh lệch.
- [ ] Tổng tồn = tổng các kho sau mọi thao tác (test tính bất biến).

**Cổng chuyển bước**: QA chạy 30 test case kho/đơn đạt 100%.

---

### BƯỚC 10 – Vận chuyển GHN/GHTK (SHIP-01 → 03)
**Tạo code**: adapter chung `CarrierAdapter` + GHN + GHTK (tính phí, tạo vận đơn, in nhãn, hủy); webhook trạng thái; đối soát COD; quy tắc phí ship.

**Kiểm tra code**
- [ ] Test với môi trường sandbox của hãng: tạo → hủy → tạo lại.
- [ ] Webhook từng trạng thái cập nhật đúng đơn; hoàn hàng → hoàn kho.
- [ ] Lỗi API hãng → đơn không mất, báo lỗi rõ, cho thử lại.

**Cổng chuyển bước**: tạo vận đơn thật ở sandbox lấy được mã vận đơn.

---

### BƯỚC 11 – VietQR, thanh toán tự động, thu chi (PAY-01, FIN-01→02, SET-01)
**Tạo code**: tạo chuỗi VietQR theo đơn (số tiền + nội dung = mã đơn); webhook biến động số dư (xác thực, chống ghi nhận 2 lần bằng `bankTxnId`); tự "Đã thanh toán" + biên lai; phiếu chi; sổ quỹ.

**Kiểm tra code**
- [ ] Test khớp giao dịch: đúng tiền & nội dung → đã thanh toán; thiếu tiền/sai nội dung → chờ duyệt tay; webhook gửi 2 lần → chỉ 1 biên lai.
- [ ] Sổ quỹ: đầu kỳ + thu − chi = cuối kỳ cho 3 tháng dữ liệu mẫu.
- [ ] Quét QR bằng app ngân hàng thật → đúng số tiền & nội dung.

**Cổng chuyển bước**: chuyển khoản thật 10.000đ → đơn tự chuyển "Đã thanh toán" < 1 phút.

---

### BƯỚC 12 – Trigger tự động (BOT-05)
**Tạo code**: bus sự kiện (đơn, thanh toán, vận chuyển) → bộ chạy trigger (gửi tin Zalo/Messenger, gắn nhãn, báo nhân viên, tạo việc), biến `{{ten}}`, `{{ma_don}}`, `{{ma_van_don}}`.

**Kiểm tra code**
- [ ] Mỗi sự kiện × mỗi hành động có test; trigger tắt → không chạy; lỗi gửi tin → thử lại 3 lần, không lặp vô hạn.

**Cổng chuyển bước**: đặt hàng thử → khách nhận tin xác nhận qua Zalo.

---

### BƯỚC 13 – CRM & Dashboard (CRM-01→03, RPT-01)
**Tạo code**: chuyển logic `apps/web/src/crm.js` sang API: giai đoạn, hoạt động, việc cần làm, lịch bám đuổi, gọi lại, nuôi dưỡng, khách cũ & bán thêm; job nhắc việc + thông báo; API Dashboard (tổng hợp theo ngày, cập nhật realtime qua Socket.io).

**Kiểm tra code**
- [ ] Test lịch bám đuổi tạo đúng giờ; "không nghe máy" tạo lịch gọi lại; lead quá SLA hiện cảnh báo.
- [ ] So số liệu Dashboard với truy vấn SQL trực tiếp (sai lệch = 0).
- [ ] Dashboard tải < 2 giây với 100.000 khách.

**Cổng chuyển bước**: không lead nào quá SLA mà thiếu cảnh báo trong 3 ngày chạy thử.

---

### BƯỚC 14 – Quảng cáo Meta/TikTok (ADS-01 → 07)
**Tạo code**: OAuth tài khoản quảng cáo, job đồng bộ 1:00 hằng ngày + theo giờ cho hôm nay, bảng chiến dịch/nhóm/quảng cáo, KPI, gợi ý tối ưu.

**Kiểm tra code**
- [ ] So số liệu với Ads Manager 7 ngày: chi tiêu lệch ≤ 1%.
- [ ] Token hết hạn → cảnh báo, không làm hỏng dữ liệu cũ; đồng bộ lại không tạo bản ghi trùng.

**Cổng chuyển bước**: chủ dự án đối chiếu số liệu với Ads Manager và đồng ý.

---

### BƯỚC 15 – Gửi tin hàng loạt (BRC-01 → 05)
**Tạo code**: bộ lọc tệp (tag, lịch sử mua, tương tác cuối, giai đoạn, nguồn), áp **khung 24h Messenger** & opt-out ở backend, mẫu ZNS, hàng đợi giãn cách, thống kê gửi/xem/phản hồi, ghi vào lịch sử khách.

**Kiểm tra code**
- [ ] Khách ngoài 24h / đã hủy nhận tin → **không bao giờ** được gửi (test bắt buộc).
- [ ] Gửi 5.000 tin không vượt giới hạn tốc độ của nền tảng; dừng giữa chừng → tiếp tục đúng chỗ.

**Cổng chuyển bước**: gửi thử 100 khách nội bộ, thống kê khớp.

---

### BƯỚC 16 – Báo cáo, tích điểm, 2FA, bảo mật & production (RPT-02→07, SET-02, AUTH-11)
**Tạo code**: API báo cáo (bảng tổng hợp theo ngày), tích/đổi điểm, 2FA TOTP (bắt buộc Admin), trang Chính sách & Điều khoản bản chính thức, sao lưu tự động, giám sát (Sentry, uptime).

**Kiểm tra code**
- [ ] Báo cáo khớp dữ liệu gốc; tích điểm cộng khi đơn thành công, trừ khi hoàn.
- [ ] Kiểm thử bảo mật toàn hệ thống (OWASP ZAP full scan + kiểm tra thủ công phân quyền); không còn lỗi mức cao.
- [ ] Kiểm thử tải: 200 người dùng đồng thời, API p95 < 500 ms.
- [ ] Diễn tập khôi phục từ bản sao lưu thành công.

**Cổng chuyển bước**: production chạy; tài liệu vận hành (khởi động lại, khôi phục, xoay khóa) hoàn tất.

---

### BƯỚC 17 – Ứng dụng di động (MOB-01 → 08, AUTH-12)
**Việc cần làm**
- [ ] Chốt `bundleIdentifier` / `package` chính thức (không đổi được sau khi nộp) và tạo app trên App Store Connect + Play Console.
- [ ] Đưa kiểu dữ liệu dùng chung vào `packages/shared` (web, API, mobile cùng dùng); liệt kê API app cần (auth, hội thoại, việc, đơn, kho, thông báo, thiết bị).
- [ ] Viết test case cho cả điện thoại và iPad (xoay ngang/dọc, Split View).

**Tạo code** (làm tiếp trên giao diện mẫu Bước 0b, **không** dựng lại)
- [ ] Thay `src/data/mock.ts` + `src/lib/store.tsx` bằng lớp gọi API (TanStack Query) + Socket.io cho Livechat realtime.
- [ ] Token lưu bằng `expo-secure-store` (Keychain/Keystore), làm mới token tự động; vân tay/Face ID bằng `expo-local-authentication`; chọn shop.
- [ ] Thông báo đẩy `expo-notifications` (FCM/APNs), lưu push token theo phiên, deep link `omnibot://` tới đúng hội thoại/đơn.
- [ ] Quét mã vạch thật bằng `expo-camera` (thêm chuỗi xin quyền camera trong `app.json`).
- [ ] Ẩn mọi nút mua/nâng cấp gói trên iOS; biểu tượng, màn hình chờ theo thương hiệu; `eas.json` (development / preview / production).

**Kiểm tra code**
- [ ] `pnpm lint`, `pnpm typecheck`, unit test lớp API & store (≥ 80%).
- [ ] Chạy trên ≥ 3 máy Android (bản 10–mới nhất), ≥ 2 iPhone và ≥ 1 iPad (xoay ngang/dọc, Split View).
- [ ] Thông báo đẩy đến < 5 giây khi app tắt; đăng xuất từ web → app mất quyền ở lần gọi kế tiếp.
- [ ] Test giao diện tự động (Maestro) cho đăng nhập, trả lời chat, tạo đơn – chạy ở cả khung điện thoại và tablet.

**Cổng chuyển bước**: bản TestFlight + Internal testing chạy ổn 1 tuần nội bộ trên điện thoại và iPad.

---

### BƯỚC 18 – Tuân thủ & nộp kho ứng dụng (MOB-07, AUTH-13)
**Việc cần làm / kiểm tra** (theo hồ sơ mục 5 – kiểm tra lại quy định mới nhất khi nộp)
- [ ] Xóa tài khoản trong app + link web hoạt động.
- [ ] Link Chính sách quyền riêng tư trong app và trên trang cửa hàng.
- [ ] App Privacy + Privacy Manifest (iOS); Data safety (Android); chỉ xin quyền camera & thông báo.
- [ ] Tài khoản demo có dữ liệu cho người duyệt.
- [ ] Không có nút mua gói trên iOS.
- [ ] Target API level Android theo yêu cầu hiện hành; file `.aab` ký bằng Play App Signing.
- [ ] Thử kín ≥ 14 ngày (bắt buộc nếu tài khoản Google Play cá nhân, ≥ 12 người thử).
- [ ] Ảnh chụp màn hình đủ kích thước (hồ sơ mục 5.5): iPhone 6.9", **iPad 13" (bắt buộc vì app hỗ trợ iPad)**, Android điện thoại + tablet 7"/10", ảnh nổi bật 1024 × 500.
- [ ] `ITSAppUsesNonExemptEncryption = false`, mô tả quyền camera/thông báo bằng tiếng Việt rõ mục đích.

**Cổng chuyển bước**: cả hai cửa hàng duyệt bản phát hành.

---

### BƯỚC 19 – Pilot & ra mắt
- [ ] 1–3 shop thật dùng 2 tuần; theo dõi lỗi, thời gian phản hồi AI, tỉ lệ hội thoại AI tự xử lý.
- [ ] Sửa lỗi phát sinh qua đúng quy trình Phần I.
- [ ] Ra mắt; theo dõi chỉ số tuần đầu; họp tổng kết.

---

## Phần III. Mẫu báo cáo cuối mỗi bước

```
BƯỚC XX – <tên>                     Ngày: __/__/____   Người phụ trách: ______
1. Phạm vi đã làm: <mã tính năng>     Để lại sau: <mã + lý do>
2. Kết quả kiểm tra:
   lint ✔  typecheck ✔  unit test __/__ (phủ __%)  e2e __/__  build ✔  migration ✔
   Test thủ công: __/__ test case     Bảo mật/hiệu năng: <kết quả>
3. Lỗi còn mở: Nghiêm trọng 0 · Cao 0 · Trung bình __ · Thấp __
4. Link PR / staging / video demo:
5. Người duyệt: ______   Kết luận: ĐẠT / CHƯA ĐẠT (lý do)
```

---

## Phần IV. Thời gian & lưu ý
- 21 bước (0, 0b, 1–19) trên khớp 5 sprint × 2 tuần **chỉ khi** đội đủ người (3–4 backend, 2 frontend/mobile, 1 QA) hoặc chỉ làm mục **P0** trước. Với đội 2 backend + 1 frontend, dự kiến **18–25 tuần** (như hồ sơ dự án).
- Thời gian chờ duyệt bên ngoài (Meta, Zalo ZNS, Apple/Google) không phụ thuộc đội – đã đưa vào Bước 0 để chạy song song.
- Bước nào không qua được cổng thì **dừng lại sửa**, không dời lỗi sang bước sau; nếu trễ, cắt bớt mục P1/P2 thay vì bỏ kiểm tra.
