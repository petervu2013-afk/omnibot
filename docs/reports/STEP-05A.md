# BÁO CÁO BƯỚC 05A – Livechat realtime, chat website, webhook Facebook

Ngày: 04/11/2026 · Nhánh: `step-05-livechat` (tách từ `main`) · Người thực hiện: Claude (cùng chủ dự án Vu Peter)

Bước 5 được chia đôi vì chưa có tài khoản Meta, Zalo, TikTok:
- **5A (báo cáo này)**: phần làm được ngay, không cần tài khoản bên ngoài.
- **5B**: các kênh cần tài khoản nhà phát triển, làm khi có tài khoản.

## 1. Phạm vi
**Đã làm**
- **Đường nhận tin chung** (`InboxService.receiveInbound`):
  - Mỗi tin có khóa `nền tảng:kênh:mã tin`.
  - Tin gửi lại, kể cả gửi song song, chỉ được lưu một lần.
  - Khách nhắn lần đầu được tạo hồ sơ và danh tính kênh; tin nhắn tiếp theo vào hội thoại đang mở.
- **Realtime cho nhân viên** (Socket.io namespace `/live`):
  - Khi kết nối, kiểm tra access token, phiên còn hiệu lực, thành viên đang hoạt động có quyền `chat.reply`, và website gọi tới nằm trong `CORS_ORIGINS`.
  - Sự kiện được lọc theo **phạm vi dữ liệu của Sale**: Sale chỉ nhận tin của hội thoại mình được xem.
  - Cứ 30 giây kiểm lại từng kết nối. Người bị khóa, đổi vai trò hoặc phiên bị đăng xuất sẽ bị ngắt.
- **API hội thoại**:
  - Danh sách (lọc tất cả / chưa đọc / cần nhân viên / giao cho tôi, theo kênh), xem chi tiết, tin nhắn có phân trang.
  - Trả lời; đánh dấu đã đọc; bật/tắt bot; đóng/mở lại; giao cho nhân viên (cần quyền `lead.assign`, có audit log).
  - Hội thoại ngoài phạm vi trả 404.
- **Chat trên website (CH-04)**, chạy thật từ đầu đến cuối:
  - Shop tạo kênh và khai báo website được phép, rồi chép mã nhúng `<script … data-site-key>`.
  - Khung chat nằm trong shadow DOM nên CSS của website không làm vỡ giao diện.
  - Khách giữ hội thoại khi tải lại trang nhờ mã khách có chữ ký. Mã giả mạo sẽ thành khách mới.
  - Có "Đã gửi", "Đã xem", "đang nhập" hai chiều; gửi lỗi thì bấm để gửi lại mà không bị trùng.
  - Giới hạn 10 tin/10 giây, mỗi tin tối đa 2000 ký tự.
  - Mã nhân viên không bao giờ gửi ra website.
- **Facebook Messenger (CH-01), phần làm được khi chưa có app Meta**:
  - Webhook `/v1/webhooks/facebook` xác minh đăng ký và kiểm chữ ký `X-Hub-Signature-256` trên body gốc. Sai chữ ký trả 401.
  - Bỏ qua tin echo và Page chưa kết nối.
  - Kết nối Page bằng Page access token nhập tay; token được mã hóa và không bao giờ trả về; mỗi Page chỉ thuộc một shop.
  - Trả lời qua Send API. Nếu Facebook từ chối thì báo lỗi 502 và **không lưu tin**.
- **Web**:
  - Trang Livechat viết lại hoàn toàn trên dữ liệu thật và socket; bỏ thanh "dữ liệu mẫu" ở trang này.
  - Thêm mục **Cài đặt → Kênh chat** (chỉ Admin). Ở đây tạo được khung chat website, chép mã nhúng, sửa danh sách website được phép, kết nối Page và ngắt kênh.
  - Thêm trang thử `apps/web/public/webchat-demo.html?key=…`.
- **Dọn dẹp**:
  - Xóa `apps/api/probe.tmp.mjs`, file dò lỗi Redis còn sót từ Bước 1 và lỡ bị commit.
  - Sửa lỗi trong test ma trận quyền: mẫu thay tham số đường dẫn viết sai (`/:w+/` thành `/:\w+/`), nên id giả trước đây không được thay.

**Sự kiện realtime** (namespace `/live`, kết nối với `auth: { token, shopId }`)

| Sự kiện | Dữ liệu |
|---|---|
| `message` | `{ conversationId, message }` |
| `conversation` | `{ conversationId, change }` |
| `typing` | `{ conversationId }` |
| `revoked` | Không có dữ liệu; server ngắt kết nối ngay sau đó |

- Nhân viên gửi `typing { conversationId }`, tối đa một lần mỗi 2 giây.
- Namespace `/webchat` dùng `auth: { siteKey, visitorToken }`:
  - Server gửi cho khách: `session { visitorToken, history }`, `message`, `seen`, `typing`.
  - Khách gửi `message { clientId, text }` (có ack) và `typing`.

**Giới hạn cần biết** (chủ dự án nên đọc)

| Hạng mục | Hiện trạng | Làm ở |
|---|---|---|
| Facebook | **Chưa chạy với Page thật**. Đã kiểm bằng payload mẫu và giả lập Graph API. Chưa có nút "Đăng nhập Facebook" (OAuth). Webhook trả 404 cho tới khi đặt `META_APP_SECRET`, `META_VERIFY_TOKEN` | 5B (cần app Meta) |
| Zalo OA, Instagram, TikTok Shop | Chưa làm | 5B |
| Hàng đợi BullMQ | Webhook xử lý ngay trong request; tin đến dồn dập lúc cao điểm có thể làm Meta phải gửi lại (không mất tin, nhưng chậm) | 5B |
| Nhiều máy chủ API | Realtime chỉ chạy đúng với **một** máy chủ API. Chạy nhiều máy cần Redis adapter | Bước 16 |
| Test tải 50 hội thoại/giây | Chưa chạy | 5B |
| Plugin WordPress | Chưa làm; hiện dán mã nhúng vào chân trang | 5B |
| Ngoài 24 giờ (Messenger) | Facebook sẽ từ chối và nhân viên thấy lỗi; chưa có message tag | Bước 15 |
| Bot / AI tự trả lời | Công tắc "Bot" chỉ lưu trạng thái, chưa có bot thật | Bước 7 |
| Ảnh, tệp từ khách | Facebook: lưu và hiện thành liên kết. Webchat: chỉ có chữ. Nhân viên chỉ gửi được chữ | Bước sau |
| Tìm hội thoại | Lọc theo tên/SĐT trong các hội thoại đã tải, chưa tìm trên server | Bước 13 |
| Gửi tin và audit log | Gửi tin và "đã đọc" không ghi audit log, vì bản ghi tin nhắn đã lưu ai gửi, lúc nào. Ma trận quyền ghi rõ 2 ngoại lệ này | – |
| Mục Kênh chat | Chỉ Admin mở được (quyền `integration.manage`) | – |

## 2. Kết quả kiểm tra
| Kiểm tra | Kết quả |
|---|---|
| `pnpm check` (lint, format, typecheck, unit, build) | ✔ |
| Unit | ✔ api 109/109 (thêm 39: chữ ký, đọc payload Facebook, `inScope` khớp `dataScope` ở cả 36 tổ hợp) · web 18/18 |
| E2E API trên PostgreSQL | ✔ 323 đạt, 1 bỏ qua (có sẵn từ trước); Redis giả lập trên máy này. File mới `test/inbox.e2e-spec.ts`: 12 test. Ma trận quyền tự thêm 12 route mới × 5 vai trò |
| Playwright trên Chrome thật | ✔ 17/17. Test mới chạy luồng: khách website → Livechat → trả lời → khách nhận, qua mốc hết hạn token 5 giây |
| Kiểm tra đột biến | ✔ 7/7 lỗi cố ý bị test bắt; 1 đột biến tương đương (xem bên dưới) |
| Audit phụ thuộc | API và web: không có lỗ hổng. 3 cảnh báo (`--prod`) đều nằm trong `expo` của app mobile, có từ trước, không do bước này |

**Kiểm tra đột biến**: cố ý làm hỏng từng chỗ dưới đây, chạy lại test, rồi hoàn tác. Mục 1–7 đều làm ít nhất một test đỏ.
1. Bỏ kiểm chữ ký webhook.
2. Bỏ lọc phạm vi Sale khi phát sự kiện.
3. Bỏ kiểm website được phép của khung chat.
4. Bỏ kiểm origin của `/live`.
5. Chấp nhận mã khách không có chữ ký.
6. Gửi lại cho khách chính tin khách vừa nhắn.
7. Bỏ bắt lỗi trùng khi nhiều bản gửi đến cùng lúc.
8. Bỏ bước kiểm trùng trước khi lưu: test không đỏ, nhưng đây là đột biến **tương đương**, vì ràng buộc unique trong DB cùng bước bắt lỗi ở mục 7 vẫn chặn trùng. Bước kiểm trước chỉ để đỡ một lần ghi.

**Lỗi thật test tìm ra khi viết**: lộ lịch sử tin nhắn chưa lọc cho khách. Lịch sử gửi cho khách thiếu trường `from` và còn kèm mã nhân viên. Đã sửa và thêm kiểm tra.

**Đối chiếu checklist Bước 5**
| Mục | Kết quả |
|---|---|
| Webhook với payload mẫu: đúng chữ ký → nhận; sai → 401; gửi lại → không trùng | ✔ Facebook. Zalo, TikTok ở 5B |
| E2E: khách nhắn → hiện trên web < 2 giây; nhân viên trả lời → khách nhận | ✔ với kênh website, trên trình duyệt thật và trong test API. Với Page Facebook thật: chưa |
| Test tải 50 hội thoại/giây | ⬜ 5B |
| Cổng: 4 kênh nhận/gửi trên staging | ⬜ Chưa đạt: cần tài khoản các nền tảng và staging |

## 3. Cách thử trên máy
1. Chạy API và web như các bước trước.
2. Đăng nhập bằng Admin, vào **Cài đặt → Kênh chat → Chat trên website**, khai báo `http://localhost:5173`.
3. Chép site key (`wc_…`) trong mã nhúng, mở `http://localhost:5173/webchat-demo.html?key=wc_…` ở cửa sổ ẩn danh rồi nhắn thử.
4. Mở **Livechat** ở cửa sổ kia để thấy tin đến và trả lời.

## 4. Việc chủ dự án cần làm
- Đăng ký app Meta (`docs/EXTERNAL_ACCOUNTS.md`) để làm 5B và thử Page thật.
- Thuê staging (VPS) để qua cổng Bước 4 và 5.
