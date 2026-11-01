# BÁO CÁO BƯỚC 04B – Sản phẩm, danh mục, khách hàng lưu database

Ngày: 01/11/2026 · Nhánh: `step-04b-data` (tách từ `step-04-web`) · Người thực hiện: Claude (cùng chủ dự án Vu Peter)

## 1. Phạm vi
**Đã làm**
- API `categories`, `products` (tìm kiếm, phân trang, nhập hàng loạt từ quét danh mục), `customers` (tìm theo tên/SĐT/email, lọc giai đoạn, phân trang, phân người phụ trách).
- Phạm vi dữ liệu của Sale áp dụng ở **API thật** cho danh sách, xem, sửa, xóa: ngoài phạm vi trả 404. Đây là phần Bước 3 còn nợ.
- Không cho client tự đặt `shopId` hay `ownerId` khi tạo/sửa; Sale tự làm chủ khách mình thêm; đổi người phụ trách cần quyền `lead.assign`.
- Trùng SĐT tính trên cả shop và theo dạng chuẩn hóa (`0938…` = `+84938…`). Quyền mới `customer.delete` (Admin, Quản lý).
- Audit log cho mọi thao tác ghi; khi xóa khách không lưu tên vào log vĩnh viễn.
- Web: trang Sản phẩm, Danh mục, Khách hàng (trong menu Đơn hàng) dùng API qua TanStack Query, nút theo quyền, bỏ thanh "dữ liệu mẫu" ở 3 trang này. Shop mới bắt đầu trống.

**Giới hạn cần biết** (chủ dự án nên đọc)
| Hạng mục | Hiện trạng | Làm ở |
|---|---|---|
| Cột Tồn kho | Đã bỏ khỏi trang Sản phẩm, chưa có kho thật | Bước 9 |
| Đơn, Kho, CRM, Livechat, Báo cáo, Combo, Coupon | **Vẫn dùng dữ liệu mẫu riêng**, không thấy sản phẩm và khách thật; số liệu chưa khớp giữa các trang | Bước 5–16 |
| AI, Bot Tester | Vẫn đọc danh mục mẫu, chưa đọc sản phẩm thật | Bước 7 |
| Menu "Khách hàng" trên thanh trên cùng | Là CRM dữ liệu mẫu; danh sách thật nằm ở Đơn hàng → Khách hàng | Bước 13 |
| "Quét danh mục" | Nhập vào DB đã có test API; phần quét cần `apps/ai-server` và **chưa chạy thử trên giao diện** | Bước 7 |
| Khách hàng trong cửa sổ quản lý | Chưa có trang chi tiết 360° với dữ liệu thật | Bước 13 |
| Người có `staff.view` mới thấy danh sách để phân người | Đúng với Admin, Quản lý hiện nay | – |

## 2. Kết quả kiểm tra
| Kiểm tra | Kết quả |
|---|---|
| `pnpm check` | ✔ |
| Unit | ✔ api 70/70 · web 18/18 |
| E2E API trên PostgreSQL | ✔ 239 đạt, 1 bỏ qua; Redis giả lập trên máy này |
| Playwright trên Chrome thật | ✔ 16/16; Redis giả lập trên máy này |
| Audit | ✔ |
| CI GitHub cho 4A (PR #2) | ✔ xanh cả 3 job, Redis 8 thật. 4B chưa chạy CI |

**Đối chiếu cổng Bước 4**
| Mục | Kết quả |
|---|---|
| Dữ liệu sản phẩm/khách hàng lưu DB | ✔ test mở trình duyệt mới, storage trống vẫn thấy dữ liệu |
| Sale chỉ thấy khách theo cài đặt | ✔ cả 3 chế độ qua API; giao diện kiểm tra chế độ mặc định |
| Truy cập chéo shop trên API mới | ✔ tự động theo vai trò × route, thêm test đọc/sửa/xóa theo id |
| Web trên **staging** đăng nhập thật | ⏳ **chưa có VPS** – Bước 4 chưa đạt cổng hoàn toàn |

**Test có bắt được lỗi không**: bỏ `dataScope` khỏi API khách hàng → test phạm vi đỏ.

## 3. Lỗi phát hiện & đã sửa
- Test trình duyệt ban đầu đạt dù cột Danh mục trống, vì tên danh mục trùng một phần tên sản phẩm. Đã đổi test để kiểm tra đúng ô.
- Cột Danh mục thoáng hiện "—" khi chưa tải xong; giờ để trống.

## 4. Lỗi còn mở
Nghiêm trọng 0 · Cao 0 · Trung bình 0 · Thấp 0.
