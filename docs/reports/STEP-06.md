# BÁO CÁO BƯỚC 06 – Hợp nhất hồ sơ khách (ID-01)

Ngày: 09/11/2026 · Nhánh: `step-06-identity` (tách từ `main` 54e7df3) · Người thực hiện: Claude (cùng chủ dự án Vu Peter)

## 1. Phạm vi
**Đã làm**
- **Chuẩn hóa SĐT và email** (`apps/api/src/catalog/contact.ts`):
  - SĐT về dạng `+84…`. Nhận khoảng trắng, chấm, gạch, ngoặc, "(0)", các đầu `0` / `84` / `+84` / `0084`, và số di động 11 số cũ trước 2018 (ví dụ `0168…` thành `038…`, `0121…` thành `079…`).
  - Email: bỏ khoảng trắng, chữ thường.
  - Sai định dạng trả 400 `VALIDATION_FAILED`.
- **Gộp tự động**: hai hồ sơ trong **cùng shop** có cùng SĐT hoặc email đã chuẩn hóa được gộp ngay. Hồ sơ tạo sau gộp vào hồ sơ tạo trước. Xảy ra khi:
  - Khách nhắn qua kênh chat và cho SĐT/email (ví dụ khung chat website).
  - Nhân viên sửa hồ sơ và nhập SĐT/email trùng hồ sơ khác.
- **Gộp không mất dữ liệu**. Hồ sơ còn lại nhận tất cả:
  - Danh tính kênh, hội thoại, đơn hàng, hoạt động, công việc, đồng ý nhận tin, người nhận chiến dịch, điểm tích lũy.
  - Ô thông tin còn trống được điền từ hồ sơ kia; gộp thẻ; giữ ngày gặp đầu tiên sớm nhất.
  - Hồ sơ bị gộp không bị xóa, chỉ đánh dấu `mergedIntoId` và ẩn khỏi danh sách (mở trực tiếp trả 404).
- **Tách lại (undo)**:
  - Mọi thứ đã chuyển trở về hồ sơ cũ, kể cả hội thoại mở ra sau khi gộp nếu thuộc kênh của hồ sơ đó.
  - Ô thông tin chỉ được trả lại nếu chưa ai sửa sau khi gộp; thẻ thêm vào được gỡ; điểm được trừ lại.
  - Không tách được hai lần. Nếu hồ sơ nhận đã gộp tiếp vào hồ sơ khác thì phải tách lần mới hơn trước.
  - Cặp vừa tách không bị gộp tự động hay đề xuất lại, kể cả khi một hồ sơ thứ ba cùng SĐT xuất hiện sau đó.
- **An toàn khi chạy song song**:
  - Mỗi lần gộp và tách chạy trong một transaction, có khóa theo shop.
  - Gộp lại hồ sơ đã gộp trả 409 `MERGE_CONFLICT`, không lỗi 500. Gộp tự động gặp lỗi này thì tìm lại.
  - Nhiều tin cùng SĐT đến cùng lúc vẫn ra đúng 1 hồ sơ.
- **Đề xuất gộp**:
  - Cặp hồ sơ trùng tên (không tính dấu, hoa thường; cột `nameKey` do trigger trong DB tính) và không có SĐT/email khác nhau.
  - Bỏ qua tên chung chung ("Khách", "Khách hàng", "Guest"…) và cặp đã bấm "Không phải cùng người".
- **Hồ sơ 360°** (`GET …/customers/{id}/profile`): các kênh đã nhắn, số hội thoại, số đơn và tổng tiền, các lần gộp còn hiệu lực.
- **Quyền**:
  - Quyền mới `customer.merge` cho Admin, Manager; dùng cho gộp tay, tách lại, đề xuất gộp.
  - Sale nhập SĐT trùng hồ sơ ngoài phạm vi của mình nhận 409 `CUSTOMER_EXISTS`, không biết hồ sơ đó là của ai.
  - Mọi thao tác gộp, tách, bác đề xuất đều có audit log.
- **Tạo khách**: nay báo 409 `CUSTOMER_EXISTS` khi trùng SĐT **hoặc email** (trước chỉ SĐT).
- **Web** (trang Khách hàng):
  - Hộp sửa khách hiện hồ sơ 360°: kênh, số hội thoại, đơn, danh sách đã gộp với nút "Tách lại", và nút "Gộp vào hồ sơ khác…".
  - Nút "Đề xuất gộp" mở danh sách cặp hồ sơ, mỗi cặp có "Gộp" và "Không phải cùng người".
  - Lưu hồ sơ mà bị gộp tự động thì thông báo cho nhân viên.
- **DB**: migration `20261109090000_customer_identity`. Thêm cột `nameKey` cùng trigger và chỉ mục; thêm cột snapshot/undo cho `CustomerMergeLog`; thêm bảng `CustomerMergeDismissal`.

**Giới hạn cần biết** (chủ dự án nên đọc)

| Hạng mục | Hiện trạng | Làm ở |
|---|---|---|
| Cổng "cùng SĐT từ Facebook và Zalo" | Đạt **trong test**: tạo kênh Zalo trong DB và đưa tin qua đường nhận tin chung. Chưa chạy với Page/OA thật | 5B (cần tài khoản) |
| Facebook, Zalo không tự gửi SĐT | Hồ sơ chỉ gộp khi có SĐT/email: khách cho trên khung chat website, hoặc nhân viên nhập vào hồ sơ. Chưa tự đọc SĐT trong nội dung tin nhắn | Bước 7 (bot hỏi SĐT) |
| Tên viết kiểu tổ hợp (NFD) | `nameKey` chỉ bỏ dấu cho chữ dựng sẵn (NFC), là dạng các trình duyệt và app gửi lên. Tên NFD sẽ không được đề xuất gộp | Khi cần |
| Số nước ngoài | Chỉ nhận số Việt Nam; số nước ngoài trả 400 | Khi cần |
| Đề xuất gộp | Chỉ theo tên; tối đa 50 cặp mỗi lần | – |
| Ô thông tin khi tách | Nếu ai đó sửa ô sau khi gộp, khi tách ô đó giữ giá trị mới trên hồ sơ còn lại | – |

## 2. Kết quả kiểm tra
| Kiểm tra | Kết quả |
|---|---|
| `pnpm check` (lint, format, typecheck, unit, build) | ✔ |
| Unit | ✔ api 150/150 (thêm 41 ca chuẩn hóa SĐT/email: 21 SĐT đúng, 11 SĐT sai, 3 email đúng, 6 email sai) · web 18/18 |
| E2E API trên PostgreSQL | ✔ 365 đạt, 1 bỏ qua (có sẵn từ trước). File mới `test/identity.e2e-spec.ts`: 12 test. Ma trận quyền tự thêm 5 route mới × 5 vai trò. Một lần chạy có test "đăng nhập dưới 500 ms" chậm 1,3 giây do máy đang tải nặng; chạy lại riêng thì đạt |
| Playwright trên Chrome thật | ✔ 18/18. Test mới: hai khách website cùng email → 1 hồ sơ, 2 hội thoại → Tách lại → 2 hồ sơ → đề xuất "Lý Gia Bảo"/"Ly Gia Bao" → Gộp |
| Migration khớp `schema.prisma` | ✔ (`prisma migrate diff` không còn khác biệt) |
| Kiểm tra đột biến | ✔ 9/9 lỗi cố ý bị test bắt |
| Audit phụ thuộc | API và web: không có lỗ hổng. 3 cảnh báo (`--prod`) đều nằm trong `expo` của app mobile, có từ trước, không do bước này |

**Kiểm tra đột biến**: cố ý làm hỏng từng chỗ dưới đây, chạy lại test, rồi hoàn tác.
1. Gộp ngược chiều (hồ sơ cũ gộp vào hồ sơ mới).
2. Tìm hồ sơ trùng không lọc theo shop.
3. Bỏ chặn Sale khi SĐT trùng hồ sơ ngoài phạm vi.
4. Khi tách, không trả lại hội thoại theo danh tính kênh.
5. Đề xuất gộp không loại cặp đã bấm "Không phải cùng người".
6. Gộp tự động không tìm lại khi gặp `MERGE_CONFLICT`.
7. Đề xuất gộp cả tên chung chung ("Khách hàng"…).
8. Bỏ khóa theo shop khi gộp. Lần chạy đầu không test nào đỏ, nên đã thêm test gửi cùng một lần gộp hai lần song song: chỉ một lần thành công, một bản ghi, điểm không bị cộng đôi.
9. Gộp tự động không bỏ qua cặp đã tách.

**Lỗi thật tìm ra khi viết và rà soát**:
- Hội thoại mở ra từ chính tin nhắn làm hồ sơ bị gộp tự động vẫn ở lại hồ sơ còn lại sau khi tách. Đã sửa: khi tách, hội thoại đi theo danh tính kênh của nó.
- Sau khi tách, một hồ sơ thứ ba cùng SĐT sẽ kéo cặp vừa tách gộp lại với nhau. Đã sửa: gộp tự động bỏ qua cặp đã tách hoặc đã bấm "Không phải cùng người".
- Cả hai lỗi đều đã có test API.

**Đối chiếu checklist Bước 6**
| Mục | Kết quả |
|---|---|
| ≥ 20 ca chuẩn hóa SĐT/email | ✔ 41 ca |
| Gộp không mất hội thoại, đơn | ✔ |
| Gộp hai lần không lỗi | ✔ 409 `MERGE_CONFLICT`, không phải 500 |
| Tách lại khôi phục đúng | ✔ hội thoại, đơn, hoạt động, điểm, ô thông tin, thẻ |
| Không gộp khác shop | ✔ cùng SĐT ở hai shop vẫn là hai hồ sơ; gộp tay sang shop khác trả 404 |
| Hồ sơ 360° đủ kênh, danh sách đề xuất gộp | ✔ |
| Cổng: cùng SĐT từ Facebook và Zalo → 1 hồ sơ, đủ lịch sử mua và tương tác | ✔ trong test (xem giới hạn ở trên); với kênh thật: chờ 5B |

## 3. Cách thử trên máy
1. Chạy `pnpm --filter api exec prisma migrate deploy`, rồi chạy API và web như các bước trước.
2. Tạo khung chat website (**Cài đặt → Kênh chat**), mở `webchat-demo.html?key=…` ở hai cửa sổ ẩn danh khác nhau, nhắn và cho cùng email.
3. Vào trang **Khách hàng** (`/#/orders/customers`): chỉ còn một hồ sơ. Mở hồ sơ để thấy 2 hội thoại và lần gộp; bấm "Tách lại" để thử.
4. Tạo tay khách "Ly Gia Bao" khi đã có "Lý Gia Bảo", bấm **Đề xuất gộp**.

## 4. Việc chủ dự án cần làm
- Review và tạo PR khi muốn đẩy lên.
- Tài khoản Meta, Zalo cho 5B để thử cổng với kênh thật.
