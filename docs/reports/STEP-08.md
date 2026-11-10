# BÁO CÁO BƯỚC 08 – Ca làm việc, chia hội thoại, Ref & Src

Ngày: 09/11/2026 · Nhánh: `step-08-routing` (tách từ `main` de8f304) · Người thực hiện: Claude (cùng chủ dự án Vu Peter)

Bước 7 (AI trả lời tự động) để sau vì cần Anthropic API key và hội thoại mẫu của shop. Bước 8 chỉ cần Bước 5 nên làm trước.

## 1. Phạm vi
**Đã làm**
- **Ca làm việc (AUTH-15)**:
  - Mỗi nhân viên có các ca trong tuần, giờ theo múi giờ của shop.
  - Ca kết thúc sau giờ bắt đầu trong cùng ngày; "24:00" là hết ngày. Ca qua nửa đêm nhập thành 2 ca.
  - Nhân viên chưa đặt ca được coi là luôn trong ca.
  - API `GET/PUT /shops/{id}/members/{memberId}/shifts` (quyền `shift.manage`: Admin, Quản lý), có audit log. Cùng route đó bật/tắt **nhận lead**, nên Quản lý cũng làm được (trước đây chỉ Admin).
- **Trạng thái online**: nhân viên mở Livechat (socket `/live`) là online. Mở 2 tab rồi đóng 1 tab vẫn online, đóng hết mới offline. Nhân viên trong shop nhận sự kiện `presence { memberId, online }`.
- **Chia hội thoại mới (AUTH-16)** theo cài đặt của shop:
  - **Phân tay**: không tự chia.
  - **Người xem đầu tiên**: Sale mở hội thoại chưa giao sẽ nhận nó. Hai Sale mở cùng lúc thì chỉ một người nhận, người kia không xem được nữa. Admin, Quản lý mở xem không nhận.
  - **Chia đều cho Sale online**: chia cho Sale đang mở Livechat, ai chờ lâu nhất từ lần nhận trước thì được trước.
  - **Chia đều cho tất cả Sale**: như trên, kể cả Sale offline.
  - Chỉ Sale đang hoạt động, bật nhận lead và đang trong ca mới được chia. Quản lý, Thủ kho, người bị khóa không được chia.
  - Khách cũ quay lại được chia cho Sale đang phụ trách họ, nếu Sale đó đủ điều kiện.
  - Sale nhận hội thoại đầu tiên của khách trở thành người phụ trách khách đó.
  - Không có ai đủ điều kiện thì hội thoại chờ. Sale đầu tiên vào Livechat nhận các hội thoại đang chờ (tối đa 50, cũ nhất trước).
  - Mỗi lần chia giữ một khóa theo shop, nên 2 hội thoại đến cùng lúc không bị chia trùng người.
- **Ref & Src (ADS-08)**:
  - Messenger: đọc `ref` của link `m.me/...?ref=` và mã quảng cáo (`ad_id`) khi khách bấm quảng cáo. Đọc từ tin nhắn, từ sự kiện mở lại hội thoại qua link (`messaging_referrals`) và từ nút "Bắt đầu".
  - Khách mở link nhưng chưa nhắn: lưu một dòng ghi chú hệ thống trong hội thoại, không tính là tin chưa đọc. Webhook gửi lại thì không lưu trùng.
  - Khung chat website: đọc `?ref=`, `utm_campaign`, `utm_source` của trang khách vào lần đầu, nhớ cho các trang sau. Giá trị lạ (ký tự đặc biệt, quá dài) bị bỏ.
  - Hội thoại lưu `ref`, `src`, `adId`. Nguồn mặc định: `facebook`, `facebook_ads` (bấm quảng cáo), `website`, hoặc `utm_source`. Khách bấm link mới trong hội thoại đang mở thì nguồn của hội thoại được cập nhật.
  - Hồ sơ khách giữ **nguồn đầu tiên**.
  - Mã quảng cáo được nối với chiến dịch khi tài khoản quảng cáo của shop đã đồng bộ (Bước 14). Chỉ tìm trong tài khoản quảng cáo của chính shop đó.
- **Web**:
  - **Cài đặt → Sale** dùng dữ liệu thật:
    - Admin chọn phạm vi dữ liệu của Sale và cách chia hội thoại. Chọn "Người xem đầu tiên" khi Sale chỉ xem "của mình" thì có cảnh báo.
    - Danh sách Sale: chấm online, số ca, trong/ngoài ca, công tắc nhận lead.
    - Cửa sổ sửa ca theo từng ngày, có nút nhanh "Thứ 2–6, 8:00–17:30".
    - Quản lý vào được trang này để sửa ca và nhận lead.
  - **Cài đặt → Ref & Src** dùng dữ liệu thật: nhập mã ref (và nguồn cho website) → link `m.me` cho từng Page, link có `utm_*` cho từng website đã khai báo. Bỏ tab "Quảng cáo" dữ liệu mẫu, chờ Bước 14.
  - **Livechat**: khung bên phải hiện nguồn và ref của hội thoại; ghi chú hệ thống hiện giữa khung chat.
  - **Hồ sơ khách**: hiện nguồn đầu tiên.
- **DB**: migration `20261109120000_routing_attribution`. Thêm `shopId` cho `WorkShift` (thêm vào tenant guard); thêm `ref`, `src`, `adId` cho `Conversation`.

**Thay đổi so với kế hoạch**
- Kế hoạch ghi "khóa Redis" để không chia trùng. Bước này dùng khóa của PostgreSQL (`pg_advisory_xact_lock`), giống Bước 6. Khóa nằm cùng transaction ghi người nhận, nên không có trường hợp khóa hết hạn giữa chừng.
- Test Bước 5A về phạm vi dữ liệu nay đặt shop ở chế độ phân tay. Shop mặc định là "chia đều cho Sale online", nên Sale đang online trong test đó sẽ tự nhận hội thoại, làm sai mục đích test phạm vi.

**Giới hạn cần biết** (chủ dự án nên đọc)

| Hạng mục | Hiện trạng | Làm ở |
|---|---|---|
| Cổng: chạy thử 1 ngày trên staging với 3 Sale | **Chưa làm**, chưa có staging | Khi có staging |
| Nhiều máy chủ API | Online/offline đếm trong bộ nhớ của **một** máy chủ API; khởi động lại thì mọi người về offline cho tới khi kết nối lại | Bước 16 (Redis) |
| Hội thoại đang chờ | Chỉ được chia lại khi có Sale vào Livechat hoặc khách nhắn tiếp. Khi Sale bắt đầu ca hay Admin đổi cách chia, hội thoại đang chờ chưa tự chia lại | Khi cần |
| Ai được chia | Chỉ vai trò Sale. Shop chỉ có chủ shop (Admin) thì hội thoại để chưa giao; Admin vẫn thấy hết | – |
| Chiến dịch quảng cáo | Nối mã quảng cáo → chiến dịch đã viết và test với dữ liệu tạo tay; dữ liệu thật có từ Bước 14 | Bước 14 |
| Đơn hàng mang nguồn | Đơn chưa lấy ref/src/chiến dịch của khách | Bước 9 |
| Facebook thật | Payload referral làm theo tài liệu Meta, chưa chạy với Page thật | 5B |
| Lịch làm việc của shop | Mục **Lịch làm việc** (giờ mở cửa) vẫn là dữ liệu mẫu; ca của nhân viên không phụ thuộc mục này | Bước 7 (trả lời ngoài giờ) |

## 2. Kết quả kiểm tra
| Kiểm tra | Kết quả |
|---|---|
| `pnpm check` (lint, format, typecheck, unit, build) | ✔ |
| Unit | ✔ api 166/166 (thêm 16: giờ theo múi giờ, trong/ngoài ca, kiểm dữ liệu ca) · web 18/18 |
| E2E API trên PostgreSQL | ✔ 388 đạt, 1 bỏ qua (389). File mới `test/routing.e2e-spec.ts`: 11 test. Ma trận quyền tự thêm 2 route mới × 5 vai trò |
| Playwright trên Chrome thật | ✔ 19/19. Test mới: Admin bật chia đều, tắt nhận lead một Sale, đặt ca cho Sale kia → tạo link ref → khách website từ link nhắn → Sale đúng người thấy hội thoại kèm nguồn |
| Migration khớp `schema.prisma` | ✔ (`prisma migrate diff` không còn khác biệt) |
| Kiểm tra đột biến | ✔ 12/12 lỗi cố ý đều bị test bắt |
| Audit phụ thuộc | 4 cảnh báo (1 thấp, 2 trung bình, 1 cao đã bỏ qua), đều nằm trong phụ thuộc của Expo (app mobile), không thuộc code Bước 8 |

**Kiểm tra đột biến**: cố ý làm hỏng từng chỗ dưới đây, chạy lại test, rồi hoàn tác.
| # | Chỗ làm hỏng | Test bắt |
|---|---|---|
| 1 | Chia theo thứ tự ngược (người vừa nhận lại được trước) | chia đều 100 hội thoại |
| 2 | Bỏ điều kiện "đang online" | chỉ Sale online được chia |
| 3 | Bỏ điều kiện "nhận lead" | Sale tắt nhận lead không được chia |
| 4 | Bỏ lọc theo ca | Sale ngoài ca không được chia |
| 5 | Bỏ khóa theo shop | 2 hội thoại song song về 2 Sale khác nhau |
| 6 | Bỏ ưu tiên Sale đang phụ trách khách cũ | khách cũ quay lại |
| 7 | Không đọc lại hội thoại sau khi nhận (người xem đầu tiên) | hai Sale mở cùng lúc → 200 và 404 |
| 8 | Ghi đè nguồn đầu tiên của khách | nguồn đầu tiên được giữ |
| 9 | Không chia hội thoại đang chờ khi Sale vào Livechat | hội thoại chờ được chia khi Sale kết nối |
| 10 | Đóng 1 tab là offline luôn | 2 tab |
| 11 | Không lọc giá trị lạ của khung chat website | giá trị lạ bị bỏ |
| 12 | Giờ kết thúc ca tính là trong ca | unit test cuối ca |

**Lỗi thật test tìm ra khi viết**: ở chế độ "người xem đầu tiên", hai Sale mở cùng một hội thoại cùng lúc thì người chậm hơn vẫn xem được dù hội thoại đã thuộc người kia. Đã sửa: sau khi nhận không thành, hội thoại được đọc lại theo phạm vi của Sale đó (trả 404).

**Đối chiếu checklist Bước 8**
| Mục | Kết quả |
|---|---|
| Chia 100 hội thoại cho 3 Sale online → lệch ≤ 1 | ✔ chế độ chia đều; với Sale online: test riêng chỉ Sale online được chia |
| Sale ngoài ca / tắt nhận lead → không được chia | ✔ cùng Sale bị khóa, Thủ kho, Quản lý |
| 2 tin đến cùng lúc không chia trùng | ✔ chạy 5 lần, mỗi lần 2 hội thoại song song → 2 Sale khác nhau |
| Link quảng cáo có `ref` → khách mang đúng chiến dịch | ✔ với dữ liệu quảng cáo tạo tay; mã quảng cáo trùng ở shop khác không bị nhận nhầm |
| Cổng: chạy thử 1 ngày trên staging với 3 Sale | ⬜ chờ staging |

## 3. Cách thử trên máy
1. Chạy `pnpm --filter @omnibot/api exec prisma migrate deploy`, rồi chạy API và web như các bước trước.
2. Mời 2 Sale (**Cài đặt → Nhân viên**), đăng nhập mỗi Sale ở một cửa sổ ẩn danh và mở Livechat.
3. Admin vào **Cài đặt → Sale**: thấy chấm online, chọn "Chia đều cho Sale đang online trên Livechat", lưu.
4. Vào **Cài đặt → Ref & Src**, nhập `livestream-21h`, mở link website (trang `webchat-demo.html?key=…&utm_campaign=livestream-21h`) và nhắn vài lần từ các cửa sổ khác nhau: hội thoại lần lượt về từng Sale, khung bên phải ghi nguồn.

## 4. Việc chủ dự án cần làm
- Review và tạo PR khi muốn đẩy lên. Đợi CI xanh rồi merge.
- Staging (VPS) để qua cổng Bước 4, 5, 8.
- Anthropic API key và khoảng 50 hội thoại mẫu nếu muốn làm Bước 7.
