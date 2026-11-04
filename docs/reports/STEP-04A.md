# BÁO CÁO BƯỚC 04A – Nối web vào API: đăng nhập, phân quyền, nhân viên

Ngày: 01/11/2026 · Nhánh: `step-04-web` (tách từ `step-03-rbac`) · Người thực hiện: Claude (cùng chủ dự án Vu Peter)

Bước 4 được chia làm hai phần. **4A (báo cáo này) đã xong phần code. 4B (sản phẩm, danh mục, khách hàng lưu DB) chưa làm**, nên **Bước 4 chưa qua cổng chuyển bước**.

## 1. Phạm vi 4A
**Đã làm**
- `apps/web/src/auth.jsx` viết lại, gọi API thật; bỏ "Hộp thư demo" và toàn bộ dữ liệu xác thực trong `localStorage`.
- `api.js`: access token chỉ nằm trong bộ nhớ; refresh token là cookie HttpOnly; tự làm mới khi hết hạn; khóa làm mới giữa các tab; tab này đăng xuất thì tab kia theo ngay; thiết bị bị đăng xuất nơi khác tự về trang đăng nhập trong 30 giây.
- Màn hình mới: nhận lời mời (`#/invite`). Sửa: đăng nhập, quên/đặt lại mật khẩu, xác minh email, Tài khoản & bảo mật (thiết bị, lịch sử đăng nhập thật).
- Menu, mục Cài đặt và nút hiện theo quyền lấy từ `/auth/me`; vào URL không có quyền thì báo "không có quyền"; đổi vai trò có hiệu lực không cần đăng nhập lại; chuyển shop trong menu tài khoản.
- Cài đặt → Nhân viên và Thông tin dùng dữ liệu thật qua TanStack Query.
- API thêm: `PATCH /auth/me`, `GET /auth/login-history`, `POST /auth/logout-others`, `permissions` và `isOwner` trong `/auth/me`.
- CAPTCHA: ô Cloudflare Turnstile khi có `VITE_TURNSTILE_SITE_KEY`, ô đánh dấu khi dev.
- `pnpm --filter @omnibot/api db:seed`: 4 tài khoản dev theo 4 vai trò; chỉ chạy với database cục bộ vì mật khẩu công khai trong repo.
- Thanh báo **"dữ liệu mẫu"** trên mọi trang còn chạy bằng dữ liệu trình duyệt, để không ai nhầm là số liệu thật.
- Playwright + job CI `web-e2e`.

**Khác với kế hoạch**
| Kế hoạch | Thực tế | Lý do |
|---|---|---|
| Sinh client TypeScript từ OpenAPI vào `packages/shared` | Viết tay `api.js` | Web đang là JavaScript; làm khi mobile cần dùng chung (Bước 17) |
| Ô "Ghi nhớ đăng nhập" | **Đã bỏ**: phiên luôn 30 ngày | API chưa có phiên ngắn; thêm lại nếu chủ dự án cần |
| Chọn "đăng xuất thiết bị khác" khi đổi mật khẩu | Luôn đăng xuất thiết bị khác | Theo AUTH-05 |
| Nút theo quyền | Mới áp dụng cho menu, Cài đặt, Nhân viên, Thông tin | Nút trong Đơn, Kho, CRM vẫn thao tác trên dữ liệu mẫu; làm cùng 4B và các bước sau |

**Giới hạn cần biết**
- Các trang ngoài Cài đặt vẫn dùng **dữ liệu mẫu trên trình duyệt**, kể cả với shop thật. Các mục trong Cài đặt ngoài Thông tin, Bảo mật, Nhân viên cũng vậy.
- Cookie `Secure` hoạt động trên `localhost` với Chrome/Firefox; Safari cần HTTPS.
- Chưa thử với Turnstile và SMTP thật.

## 2. Kết quả kiểm tra
| Kiểm tra | Kết quả |
|---|---|
| `pnpm check` | ✔ |
| Unit | ✔ api 70/70 · web 18/18 |
| E2E API trên PostgreSQL | ✔ 129 đạt, 1 bỏ qua (test dự phòng khi chưa build) – Redis giả lập trên máy này |
| Playwright trên Chrome thật | ✔ 12/12 với API, DB thật; access token 5 giây để ép làm mới liên tục – Redis giả lập trên máy này |
| Audit | ✔ |

**Đối chiếu checklist**
| Mục | Kết quả |
|---|---|
| Đăng nhập bằng 4 vai trò → đúng menu, đúng nút | ✔ (trong phạm vi nêu trên) |
| 2 trình duyệt cùng tài khoản → đăng xuất thiết bị kia | ✔ tự về trang đăng nhập, không cần tải lại |
| Không đọc/ghi `omnibot-auth-*` trong `localStorage` | ✔ test kiểm tra cả việc không có token trong storage và cookie đúng cờ |
| Web trên staging đăng nhập thật | ⏳ chưa có VPS |
| Dữ liệu sản phẩm/khách hàng lưu DB | ⏳ **chưa làm**, phần 4B |

**Test có bắt được lỗi không**: bỏ khóa làm mới giữa các tab → test 2 tab đỏ; bỏ lọc menu → test Thủ kho đỏ.

## 3. Lỗi phát hiện & đã sửa
| Mức | Lỗi | Cách phát hiện | Xử lý |
|---|---|---|---|
| Trung bình | Màn 1280px: menu tràn, không thấy "Cài đặt", khu vực tài khoản vỡ khi tên shop dài | Xem ảnh chụp (test không bắt được) | Sửa CSS; thêm test menu nằm trọn trong màn hình |
| Trung bình | Trên Windows, dừng test để lại `postgres` mồ côi, làm lần chạy sau treo | Thử chạy lại test | Tắt êm qua `global-teardown`, mỗi lần chạy dùng cổng và thư mục riêng |
| Thấp | Thư mục tạm của test khởi động không được xóa | Khi điều tra lỗi trên | Xóa sau khi chạy |

## 4. Lỗi còn mở
Nghiêm trọng 0 · Cao 0 · Trung bình 0 · Thấp 0.
