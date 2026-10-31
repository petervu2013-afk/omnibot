# BÁO CÁO BƯỚC 02 – Xác thực

Ngày: 31/10/2026 · Nhánh: `step-02-auth` (tách từ `step-01-backend`) · Người thực hiện: Claude (cùng chủ dự án Vu Peter)

## 1. Phạm vi
**Đã làm** (AUTH-01 → 06, 13, 17; hợp đồng API trong `docs/openapi.yaml`)
- Đăng ký chủ shop: tạo User + Shop + vai trò ADMIN trong một transaction, gửi email xác minh, đăng nhập luôn.
- Xác minh email: liên kết 24 giờ, dùng 1 lần; sau 7 ngày chưa xác minh thì chặn đăng nhập.
- Đăng nhập: Argon2id (64 MiB, t=3); sai 5 lần khóa 15 phút; CAPTCHA (Cloudflare Turnstile, kiểm tra phía server) từ lần sai thứ 3; email cảnh báo thiết bị mới.
- Access token JWT 15 phút. Refresh token 30 ngày, xoay vòng, lưu dạng HMAC; dùng lại token cũ → thu hồi cả chuỗi.
- Web nhận refresh token qua cookie `HttpOnly; Secure; SameSite=Strict; Path=/v1/auth`; mobile nhận trong body.
- Danh sách thiết bị, đăng xuất 1 thiết bị / tất cả; thu hồi có hiệu lực ngay (guard kiểm tra phiên ở mỗi yêu cầu).
- Quên / đặt lại mật khẩu (30 phút, dùng 1 lần, thu hồi mọi phiên, mở khóa tạm); đổi mật khẩu (giữ thiết bị hiện tại).
- Xóa tài khoản: xác nhận mật khẩu, đăng xuất mọi nơi, hủy được bằng cách đăng nhập lại trong 30 ngày; job mỗi giờ ẩn danh dữ liệu khi quá hạn và dọn phiên/token cũ. Chủ shop có nhân viên phải chuyển quyền trước.
- `AuditLog` cho đăng ký, đăng nhập thành công/thất bại, phát hiện dùng lại token, đổi/đặt lại mật khẩu, xóa tài khoản.
- Mọi route mặc định bắt buộc đăng nhập; route công khai phải ghi rõ `@Public()`.
- Giới hạn `/auth/*` 10 yêu cầu/phút/IP/route (`AUTH_RATE_LIMIT_PER_MINUTE`).
- `modules/mail`: SMTP (production), file `.outbox` (dev), bộ nhớ (test); 5 mẫu email tiếng Việt.

**Khác với kế hoạch (cần chủ dự án biết)**
| Kế hoạch | Thực tế | Lý do / xử lý |
|---|---|---|
| Hàng đợi gửi email | Gửi trực tiếp, không chặn request, lỗi chỉ ghi log, **chưa tự thử lại** | Chưa có worker; chuyển sang hàng đợi ở Bước 5 |
| Chọn dịch vụ email | Chỉ làm SMTP chung, **chưa chọn nhà cung cấp** | Chủ dự án chọn (SES, Mailgun, Postmark…), chỉ cần đặt `SMTP_URL` |
| Khóa tạm bằng Redis | Đúng kế hoạch, nhưng khi Redis lỗi thì **bỏ qua khóa** (vẫn cho đăng nhập, có ghi log) và chỉ còn giới hạn theo IP | Ưu tiên không khóa toàn bộ người dùng khi Redis sự cố; cần cảnh báo giám sát Redis ở Bước 16 |
| Đăng ký báo trùng email | Trả `EMAIL_TAKEN` nên đăng ký có thể lộ email đã tồn tại (đăng nhập và quên mật khẩu thì không) | Giữ theo luồng frontend, có giới hạn tần suất |
| Unit test xoay vòng token | Kiểm tra bằng e2e trên DB thật, kể cả 2 yêu cầu đồng thời | Logic nằm trong truy vấn nguyên tử, e2e đáng tin hơn |

**Để lại**
- Frontend web và mobile chưa gọi API này: Bước 4 (web), Bước 17 (mobile).
- Chuyển quyền chủ shop: Bước 3.

## 2. Kết quả kiểm tra
| Kiểm tra | Kết quả |
|---|---|
| `pnpm check` (lint, format, typecheck, test, build) | ✔ |
| Unit test | ✔ api 47/47 · web 18/18 |
| E2E `apps/api` trên PostgreSQL 18 | ✔ 38 đạt, 1 bỏ qua (test dự phòng chỉ chạy khi chưa build) – **Redis là bản giả lập trong bộ nhớ** |
| Độ phủ (chỉ tính e2e) | Toàn API 92,8% dòng · `src/auth` 96,7% dòng, 85,5% nhánh |
| `pnpm audit --prod --audit-level high` | ✔ (xem mục 4) |
| Thời gian đăng nhập | Test e2e < 500 ms; server thật 356 ms (lần đầu, Redis đang tắt) |
| Chạy thử `dist/main.js` với DB thật | ✔ đăng ký → cookie đúng cờ → email trong `.outbox` → xác minh → đăng nhập; route cần đăng nhập trả 401 |
| Log không lộ bí mật | ✔ test e2e đối chiếu mọi mật khẩu/token với log; chạy thật: 0 kết quả |
| Test bắt được lỗi | ✔ tắt phát hiện dùng lại token và kiểm tra phiên trong guard → 5 test đỏ |

**Đối chiếu checklist**
| Mục | Kết quả |
|---|---|
| Unit: băm/kiểm mật khẩu, quy tắc mật khẩu | ✔ |
| E2E: đăng ký → xác minh → đăng nhập → refresh → đăng xuất | ✔ |
| Sai 5 lần → khóa 15 phút; reset → thu hồi mọi phiên; link reset lần 2 → lỗi; xóa → hủy trong 30 ngày | ✔ |
| Lỗi giống nhau cho email có/không tồn tại; rate limit `/auth/*` | ✔ |
| Quét OWASP ZAP baseline | ⏳ **chưa chạy** – máy này không có Docker/ZAP; cần staging |
| Review 2 người | ⏳ **chưa có** |
| Redis thật, Turnstile thật, gửi SMTP thật | ⏳ **chưa kiểm tra** – cần CI/VPS và tài khoản bên ngoài |

## 3. Lỗi phát hiện & đã sửa trong bước
| Mức | Lỗi | Xử lý |
|---|---|---|
| Cao | `node-forge` trong `@expo/cli` có 6 lỗ hổng mức cao mới công bố (audit làm đỏ CI) | Ép lên bản đã vá 1.4.2 bằng `overrides`; gỡ cảnh báo đã bỏ qua trước đó; `expo config` vẫn chạy |
| Trung bình | Mật khẩu yếu làm mất hiệu lực liên kết đặt lại | Kiểm tra mật khẩu trước khi dùng token |
| Trung bình | Thông báo lỗi môi trường bị thay bằng "thiếu biến bắt buộc", che lý do thật | Giữ nguyên thông báo của quy tắc riêng |
| Thấp | Redis giả lập không xử lý `HELLO 3` của ioredis 6 (chỉ ảnh hưởng test) | Trả lời như máy chủ RESP2 |

## 4. Lỗi còn mở
Nghiêm trọng 0 · Cao 0 · Trung bình 0 · Thấp 0.

Audit còn 1 cảnh báo cao được chấp nhận (`zod` 3 trong `@expo/cli`, GHSA-mrhx-c7xc-m3w5, xem lại trước 31/01/2027) và 3 mức thấp/trung bình đều trong `@expo/cli` (công cụ build, không có trong app hay API).

## 5. Cần chuẩn bị trước production
Thêm `SMTP_URL`, `TURNSTILE_SECRET_KEY`, `APP_URL` (API từ chối khởi động nếu thiếu SMTP hoặc Turnstile). Xem `apps/api/.env.example`.

## 6. Người duyệt
Người duyệt: ______ · Kết luận: **CHƯA ĐẠT CỔNG** – phần code đạt; còn thiếu review 2 người, quét OWASP ZAP, chạy với Redis thật (phụ thuộc GitHub + VPS của Bước 0).
