# BÁO CÁO BƯỚC 03 – Shop, nhân viên, phân quyền, Audit log

Ngày: 31/10/2026 · Nhánh: `step-03-rbac` (tách từ `step-02-auth`) · Người thực hiện: Claude (cùng chủ dự án Vu Peter)

## 1. Phạm vi
**Đã làm** (AUTH-07 → 10, SET-03; hợp đồng API trong `docs/openapi.yaml`)
- Ma trận quyền hồ sơ mục 3.2 thành bảng `permission → role` (`src/shop/permissions.ts`), 26 quyền.
- `@Permission('...')` + `PermissionGuard`: kiểm tra thành viên, vai trò và trạng thái ở **mỗi yêu cầu**, nên khóa nhân viên hay đổi vai trò có hiệu lực ngay. Người ngoài shop nhận 404 để không dò được mã shop.
- Phạm vi dữ liệu của Sale (`dataScope`): tất cả / của mình / của mình + chưa phân.
- Nhiều shop: một tài khoản có vai trò riêng ở từng shop; chuyển shop chỉ cần đổi `shopId`, không đăng nhập lại; tạo thêm shop.
- Nhân viên: mời qua email (7 ngày, dùng 1 lần, mời lại thì link cũ hết hiệu lực), nhận lời mời, đổi vai trò, tạm khóa/mở lại, xóa (khách, hội thoại, đơn về chưa phân). Chủ shop và chính mình được bảo vệ.
- Chuyển quyền chủ shop và xóa shop: chỉ chủ shop, xác nhận mật khẩu. Sau khi chuyển quyền, chủ cũ xóa được tài khoản (nối với Bước 2).
- Audit log: `@Audit` ghi người, shop, IP, dữ liệu trước/sau cho mọi thao tác ghi; API xem/lọc/phân trang, xuất CSV (chống chèn công thức Excel).
- **Log không sửa/xóa được ở cấp database**: trigger chặn UPDATE, DELETE, TRUNCATE (migration `audit_log_immutable`).

**Khác với kế hoạch / cần chủ dự án quyết định**
| Vấn đề | Đang làm | Cần biết |
|---|---|---|
| Hồ sơ mâu thuẫn: AUTH-07 ghi "Admin/Manager mời nhân viên", ma trận 3.2 ghi Manager chỉ "Xem, xếp ca" | Theo ma trận: **chỉ Admin mời được** | Cần chủ dự án chốt; nếu Manager được mời, chỉ cần sửa 1 dòng và ma trận |
| Lời mời không cấp thẳng vai trò Admin | Theo hồ sơ 3.1; muốn có Admin thì mời vai trò khác rồi đổi | |
| Xuất audit log | Chỉ Admin (ô Manager là "Xem") | |
| Ca làm việc (quyền `shift.manage`) | Đã có quyền, chưa có API | Bước 8 |
| Phạm vi dữ liệu Sale | Kiểm tra trên truy vấn PostgreSQL thật, **chưa qua API khách hàng** vì API đó chưa có | Mọi API danh sách ở Bước 4, 5, 9 phải áp dụng `dataScope` và có test riêng |
| Quyền của Thủ kho trên đơn, "Của mình" ở báo cáo | Đã có quyền, lọc dữ liệu làm cùng các API đó | Bước 9, 13, 16 |
| Tenant guard không tự bảo vệ `AuditLog` và bảng con | API audit tự lọc `shopId`, có test | Giữ nguyên quy tắc trong ADR 0002 |

## 2. Kết quả kiểm tra
| Kiểm tra | Kết quả |
|---|---|
| `pnpm check` (lint, format, typecheck, test, build) | ✔ |
| `pnpm audit --prod --audit-level high` | ✔ |
| Unit test | ✔ api 70/70 · web 18/18 |
| E2E trên PostgreSQL 18 | ✔ 125 đạt, 1 bỏ qua (test dự phòng khi chưa build) – **Redis là bản giả lập** |
| Migration trên DB trắng | ✔ mỗi lần chạy e2e |

**Đối chiếu checklist**
| Mục | Kết quả |
|---|---|
| Test tự sinh: mỗi vai trò × mỗi API → đúng 403 hoặc được phép | ✔ đọc route từ chính controller; route mới tự có test, thiếu `@Permission`/`@Audit` thì test đỏ |
| Ma trận khớp hồ sơ | ✔ test đọc bảng 3.2 trong `PROJECT_SPEC.md` và so từng ô |
| Truy cập chéo shop trên mọi API | ✔ người ngoài nhận 404 ở mọi route; Admin shop A không đụng được nhân viên, lời mời, nhật ký shop B |
| Sale chỉ thấy khách theo cài đặt | ✔ cả 3 chế độ (ở cấp truy vấn, xem bảng trên) |
| Audit log không có API sửa/xóa; đúng người, thời gian, trước/sau | ✔ cả database cũng từ chối |
| Test bắt được lỗi | ✔ tắt kiểm tra chủ shop → 3 test đỏ; bỏ lọc shop của audit → 1 đỏ; cho Sale xem nhân viên → đỏ ở e2e và ở test ma trận |
| Review người thật | ⏳ **chưa có** |
| CI với Redis thật | ⏳ **chưa chạy**, repo chưa có trên GitHub |

## 3. Lỗi còn mở
Nghiêm trọng 0 · Cao 0 · Trung bình 0 · Thấp 0.

## 4. Người duyệt
Người duyệt: ______ · Kết luận: **Phần code đạt cổng** (ma trận quyền 100% có test, không có lỗi truy cập chéo ở các API hiện có). Còn chờ người review và quyết định về quyền mời nhân viên của Manager.
