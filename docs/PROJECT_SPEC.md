# HỒ SƠ DỰ ÁN OMNIBOT

> **OmniBot – Chatbot AI, Livechat đa kênh, CRM, Quảng cáo & Bán hàng (POS)**
> Phiên bản tài liệu: **2.0** · Ngày cập nhật: 23/10/2026
> Nền tảng phát hành: **Website (trình duyệt)** · **Android (Google Play – CH Play)** · **iOS (Apple App Store)**

| Phiên bản | Nội dung thay đổi |
|---|---|
| 1.0 | Hồ sơ ban đầu: chi tiết màn hình frontend, mô hình dữ liệu, kế hoạch 7 giai đoạn |
| 2.0 | Đổi tên thành *Hồ sơ dự án OmniBot*. Bổ sung: đăng ký/đăng nhập, loại tài khoản & phân quyền (RBAC), bảo mật, ứng dụng Android/iOS và quy định của Google Play/App Store, hợp nhất hồ sơ khách (Identity Resolution), Zalo/TikTok Shop/Webchat WordPress, VietQR, Audit log. Chuẩn hóa thành 3 phần: **Danh mục tính năng – Database Schema (Prisma) – Roadmap theo Sprint** |

---

## 1. Tổng quan

### 1.1 Mục tiêu sản phẩm
1. **AI tự động trả lời khách 24/7** dựa trên danh mục sản phẩm: tư vấn, thu SĐT/địa chỉ, chốt đơn, chuyển nhân viên khi cần.
2. **Livechat đa kênh** (Facebook Messenger, Instagram, Zalo OA, TikTok Shop, Webchat trên website WordPress/WooCommerce) với **hồ sơ khách hợp nhất**.
3. **CRM**: lưu vết mọi tương tác, phân lead tự động, bám đuổi theo quy trình, nuôi dưỡng khách hoãn mua, khai thác khách cũ.
4. **Quảng cáo & gửi tin hàng loạt**: đo hiệu quả Meta/TikTok tới tận đơn hàng; gửi Messenger/Zalo ZNS theo tệp khách.
5. **POS & Kho**: sản phẩm, đơn hàng, nhiều kho, vận chuyển GHN/GHTK, VietQR, thu chi.
6. **Báo cáo & Dashboard điều hành** realtime; **Audit log** cho mọi thao tác quan trọng.

### 1.2 Nền tảng & phạm vi từng nền tảng
| Nền tảng | Đối tượng | Phạm vi |
|---|---|---|
| **Web app** (máy tính, trình duyệt) | Tất cả vai trò | Đầy đủ mọi phân hệ, cài đặt, báo cáo |
| **App Android & iOS** | Sale, Thủ kho, Manager khi đi lại | Livechat + thông báo đẩy, Việc cần làm/CRM, tạo & xem đơn, tra tồn kho, quét mã nhập/xuất kho, Dashboard rút gọn. **Không** có: cài đặt hệ thống, mua gói phần mềm, báo cáo chi tiết (mở trên web) |

### 1.3 Hiện trạng (tại ngày cập nhật)
- **Frontend web**: đã có giao diện cho hầu hết tính năng (React 18 + Vite, thư mục `apps/web/src/`), chạy bằng dữ liệu mẫu trong `localStorage`.
- **Đã có giao diện (giả lập, chưa có backend)**: đăng ký, đăng nhập, quên/đặt lại mật khẩu, xác minh email, quản lý thiết bị đăng nhập, đổi mật khẩu, lịch sử đăng nhập, xóa tài khoản (`apps/web/src/auth.jsx`, `apps/web/src/pages/auth/`, Cài đặt → Tài khoản & bảo mật).
- **Chưa có**: backend, phân quyền thật, ứng dụng di động, mọi kết nối thật tới Facebook/Zalo/TikTok/GHN/GHTK/ngân hàng.
- Có server mẫu `apps/ai-server/index.js` (Express + Claude API) cho AI trả lời tự động, quét danh mục, phân tích quảng cáo – sẽ chuyển vào backend NestJS.

---

## 2. Feature Catalog – Danh mục tính năng

**Cách đọc bảng**
- **Ưu tiên**: P0 = bắt buộc cho bản phát hành đầu · P1 = nên có trong bản đầu · P2 = phát hành sau.
- **Nền tảng**: W = Web · M = Mobile (Android + iOS).
- **Giao diện**: ✅ đã có trên frontend web · ⬜ chưa có, cần làm.
- **Sprint**: sprint triển khai (xem mục 8).

### 🔐 Phân hệ 1 – Xác thực & Phân quyền (Auth & Staff Management)
| Mã | Tính năng | Mô tả chi tiết | Ưu tiên | Nền tảng | Giao diện | Sprint |
|---|---|---|---|---|---|---|
| AUTH-01 | Đăng ký tài khoản chủ shop | Họ tên, email, mật khẩu (≥ 8 ký tự, có chữ và số), tên cửa hàng, lĩnh vực, đồng ý Điều khoản & Chính sách quyền riêng tư. Tạo đồng thời User + Shop + vai trò Admin | P0 | W, M | ✅ (giao diện, giả lập) | 1 |
| AUTH-02 | Xác minh email | Gửi link xác minh (hết hạn 24 giờ), gửi lại link; chưa xác minh thì chỉ dùng được 7 ngày | P0 | W, M | ✅ (giao diện, giả lập) | 1 |
| AUTH-03 | Đăng nhập Email/Password | Khóa tạm 15 phút sau 5 lần sai liên tiếp; CAPTCHA khi nghi ngờ; thông báo email khi đăng nhập từ thiết bị mới | P0 | W, M | ✅ (giao diện, giả lập) | 1 |
| AUTH-04 | Access token + Refresh token | Access token JWT 15 phút; refresh token 30 ngày, **xoay vòng mỗi lần dùng**, lưu dạng băm; phát hiện dùng lại token cũ → thu hồi cả chuỗi phiên | P0 | W, M | ✅ (giao diện, giả lập) | 1 |
| AUTH-05 | Quản lý & thu hồi phiên | Danh sách thiết bị đang đăng nhập (web/Android/iOS, IP, lần dùng cuối); đăng xuất 1 thiết bị / tất cả thiết bị; tự thu hồi khi đổi mật khẩu hoặc bị khóa | P0 | W, M | ✅ (giao diện, giả lập) | 1 |
| AUTH-06 | Quên / đặt lại mật khẩu | Link đặt lại 30 phút, dùng 1 lần; đổi mật khẩu trong hồ sơ cá nhân | P0 | W, M | ✅ (giao diện, giả lập) | 1 |
| AUTH-07 | Mời nhân viên | Admin/Manager mời qua email kèm vai trò; nhân viên tạo mật khẩu khi nhận lời mời; tạm khóa / mở lại / xóa nhân viên | P0 | W | ✅ một phần (Cài đặt → Nhân viên) | 1 |
| AUTH-08 | Phân quyền theo vai trò (RBAC) | 4 vai trò: **Admin, Manager, Sale, Thủ kho** – ma trận quyền ở mục 3 | P0 | W, M | ⬜ | 1 |
| AUTH-09 | Phạm vi dữ liệu của Sale | Sale xem đơn/khách/hội thoại: tất cả · của mình · của mình + chưa có người phụ trách | P0 | W, M | ✅ (Cài đặt → Sale) | 1 |
| AUTH-10 | Nhiều cửa hàng | Một tài khoản thuộc nhiều shop với vai trò khác nhau; chuyển shop không cần đăng nhập lại | P1 | W, M | ⬜ | 1 |
| AUTH-11 | Xác thực 2 lớp (2FA) | Mã TOTP (Google Authenticator); bắt buộc với Admin, tùy chọn với vai trò khác; mã dự phòng | P1 | W, M | ⬜ | 4 |
| AUTH-12 | Mở khóa bằng sinh trắc học | Vân tay / Face ID trên app di động (thay cho nhập lại mật khẩu khi phiên còn hạn) | P1 | M | ⬜ | 5 |
| AUTH-13 | Xóa tài khoản | Người dùng tự yêu cầu xóa tài khoản **ngay trong app** và qua **link web**; xác nhận lại mật khẩu; xóa/ẩn danh dữ liệu cá nhân sau 30 ngày; chủ shop phải chuyển quyền hoặc xóa cả shop – **bắt buộc theo App Store & Google Play** | P0 | W, M | ✅ (giao diện, giả lập) | 1 (API), 5 (app) |
| AUTH-14 | Đăng nhập Google / Apple | Tùy chọn. Nếu có đăng nhập Google trên iOS thì phải có thêm **Sign in with Apple** hoặc phương án tương đương (quy định 4.8 App Store) | P2 | W, M | ⬜ | Sau |
| AUTH-15 | Lịch làm việc & ca | Giờ làm việc của shop (✅ đã có) + **ca làm việc từng nhân viên**; ngoài ca không nhận hội thoại mới | P0 | W | ✅ một phần | 2 |
| AUTH-16 | Chia hội thoại xoay vòng (Round-Robin) | Thủ công · người xem đầu tiên · chia đều người đang online & trong ca · chia đều tất cả; bật/tắt nhận lead từng Sale | P0 | W | ✅ (cài đặt) | 2 |
| AUTH-17 | Nhật ký đăng nhập | Ghi đăng nhập thành công/thất bại, IP, thiết bị vào Audit log | P0 | W | ✅ (giao diện, giả lập) | 1 |

### 📢 Phân hệ 2 – Quảng cáo & Gửi tin hàng loạt (Ads & Bulk Messaging)
| Mã | Tính năng | Mô tả chi tiết | Ưu tiên | Nền tảng | Giao diện | Sprint |
|---|---|---|---|---|---|---|
| ADS-01 | Kết nối Meta Ads | Đăng nhập Facebook (OAuth) lấy token có quyền đọc quảng cáo; chọn tài khoản quảng cáo; mã hóa token; cảnh báo khi token sắp hết hạn | P0 | W | ✅ (Quảng cáo → Tài khoản) | 4 |
| ADS-02 | Kết nối TikTok Ads Manager | Token TikTok Business API; chọn advertiser | P1 | W | ✅ | 4 |
| ADS-03 | Kết nối Google Ads | Developer token + OAuth | P2 | W | ✅ | Sau |
| ADS-04 | Đồng bộ số liệu | Job hằng ngày lúc 1:00 + theo giờ cho ngày hôm nay: chi tiêu, hiển thị, tiếp cận, click, kết quả theo chiến dịch / nhóm / quảng cáo | P0 | W | ✅ | 4 |
| ADS-05 | Bảng chiến dịch đa cấp | Cột: Tiếp cận, Hiển thị, Bấm, Kết quả, Chi phí, CPA, Hội thoại, SĐT, %SĐT, Đơn, SR, Doanh số, ROAS, CPL, CPO | P0 | W | ✅ | 4 |
| ADS-06 | Bật/tắt chiến dịch, tạo chiến dịch (kể cả bằng AI) | Gọi API nền tảng; chiến dịch AI tạo bản nháp từ sản phẩm | P2 | W | ✅ | Sau |
| ADS-07 | KPI & gợi ý tối ưu | Mục tiêu KPI, đạt/chưa đạt, gợi ý theo quy tắc + phân tích bằng AI | P1 | W | ✅ | 4 |
| ADS-08 | Gắn nguồn Ref & Src | Lấy `ref` từ link Messenger, `ads_id` từ tin nhắn quảng cáo, `utm_campaign` từ website → gắn vào khách & đơn | P0 | W | ✅ | 2 |
| BRC-01 | Gửi tin nhắn hàng loạt (Broadcast) | Kênh: **Messenger**, **Zalo OA (tin tư vấn)**, **Zalo ZNS (theo SĐT, mẫu đã duyệt)**; gửi ngay / lập lịch; hàng đợi giãn cách; thống kê đã gửi / đã xem / phản hồi / lỗi | P0 | W | ✅ | 4 |
| BRC-02 | Bộ lọc tệp khách | Theo **Thẻ (Tag)**, **Lịch sử mua hàng** (đã mua / chưa mua / tổng chi tiêu / mua sản phẩm X), **Thời gian tương tác cuối**, giai đoạn CRM, nguồn quảng cáo; xem trước số người nhận | P0 | W | ✅ một phần (thiếu lọc lịch sử mua) | 4 |
| BRC-03 | Tuân thủ chính sách kênh | Messenger: chỉ tin quảng bá trong 24 giờ từ tin cuối của khách; Zalo OA: trong khung tương tác cho phép; ZNS: chỉ dùng mẫu đã được Zalo duyệt; tự loại khách đã từ chối nhận tin | P0 | W | ✅ một phần | 4 |
| BRC-04 | Quản lý mẫu ZNS | Lưu template ID, tham số, trạng thái duyệt, đơn giá | P1 | W | ⬜ | 4 |
| BRC-05 | Hủy nhận tin (opt-out) | Khách nhắn "HỦY"/bấm hủy nhận → gắn cờ không gửi broadcast | P0 | W | ⬜ | 4 |
| BRC-06 | Đẩy tệp khách & chuyển đổi offline | Xuất/đẩy Custom Audience, chuyển đổi offline (SHA-256) | P1 | W | ✅ (xuất CSV) | Sau (API) |

### 📦 Phân hệ 3 – Sản phẩm, Tồn kho & Đơn hàng (POS & Warehouse)
| Mã | Tính năng | Mô tả chi tiết | Ưu tiên | Nền tảng | Giao diện | Sprint |
|---|---|---|---|---|---|---|
| POS-01 | Sản phẩm | CRUD; SKU, giá bán, giá vốn, danh mục, mô tả cho AI, ảnh; quét danh mục từ link website / bảng Excel bằng AI | P0 | W | ✅ | 1 (DB), 3 |
| POS-02 | Danh mục | CRUD, ẩn/hiện | P0 | W | ✅ | 3 |
| POS-03 | Combo | Gói sản phẩm + giá combo, bật/tắt bán | P1 | W | ✅ | 3 |
| POS-04 | Coupon | Giảm % / số tiền, đơn tối thiểu, số lượt, hạn dùng; áp khi tạo đơn | P1 | W, M | ✅ | 3 |
| POS-05 | Nhà cung cấp | CRUD, trạng thái hợp tác | P1 | W | ✅ | 3 |
| WH-01 | Nhiều kho | Danh sách kho, kho mặc định | P0 | W | ✅ | 3 |
| WH-02 | Nhập / Xuất / Chuyển / Kiểm kho | Phiếu có trạng thái Nháp → Hoàn tất / Hủy; kiểm kho chốt tồn thực tế; quét mã vạch trên app | P0 | W, M | ✅ (web) | 3 |
| WH-03 | Trừ kho realtime khi chốt đơn | Tạo đơn + trừ tồn trong **một giao dịch DB** (khóa dòng tồn kho), chặn bán âm theo cài đặt, hoàn kho khi hủy/hoàn hàng | P0 | W, M | ✅ (logic frontend) | 3 |
| WH-04 | Tồn kho & cảnh báo | Tồn theo kho, cảnh báo sắp hết, giá trị tồn | P0 | W, M | ✅ | 3 |
| ORD-01 | Tạo đơn từ đoạn chat | Nhân viên hoặc AI tạo đơn ngay trong hội thoại; tự điền khách, địa chỉ, sản phẩm | P0 | W, M | ✅ | 3 |
| ORD-02 | Quản lý đơn | Trạng thái Mới → Đã xác nhận → Đang giao → Thành công / Hủy / Hoàn; lọc, export | P0 | W, M | ✅ | 3 |
| SHIP-01 | Kết nối GHN / GHTK | Tính phí, tạo vận đơn lấy **mã vận đơn**, in nhãn, hủy vận đơn | P0 | W | ✅ (giả lập) | 3 |
| SHIP-02 | Cập nhật trạng thái giao | Webhook của hãng → cập nhật vận đơn & đơn; đối soát COD | P0 | W | ✅ (giả lập) | 3 |
| SHIP-03 | Quy tắc phí ship | Miễn phí, ngưỡng miễn phí, đồng giá vùng, tối thiểu; địa chỉ mới/cũ | P1 | W | ✅ | 3 |
| PAY-01 | VietQR thanh toán tự động | Tạo mã VietQR động theo đơn (số tiền + nội dung = mã đơn); nhận biến động số dư qua webhook dịch vụ ngân hàng → tự chuyển đơn "Đã thanh toán" + tạo biên lai | P0 | W, M | ✅ (cài đặt) | 3 |
| FIN-01 | Biên lai (phiếu thu) / Phiếu chi | Tạo tay hoặc tự sinh từ đơn/thanh toán; trạng thái | P0 | W | ✅ | 3 |
| FIN-02 | Sổ quỹ | Số dư đầu kỳ, tổng thu, tổng chi, tồn cuối kỳ theo tháng | P0 | W | ✅ | 3 |

### 💬 Phân hệ 4 – Omni-channel Livechat, Chatbot & CRM
| Mã | Tính năng | Mô tả chi tiết | Ưu tiên | Nền tảng | Giao diện | Sprint |
|---|---|---|---|---|---|---|
| CH-01 | Facebook Messenger & Instagram | Kết nối Page qua OAuth, webhook nhận tin, Send API gửi tin | P0 | W, M | ✅ (giả lập) | 2 |
| CH-02 | Zalo OA | OAuth OA, webhook, gửi tin tư vấn, làm mới token | P0 | W, M | ✅ (giả lập) | 2 |
| CH-03 | TikTok Shop | Đồng bộ tin nhắn người mua & đơn TikTok Shop | P1 | W, M | ⬜ | 2 |
| CH-04 | Webchat WordPress/WooCommerce | Plugin WordPress nhúng khung chat, kết nối Socket.io; khách đăng nhập Woo thì gửi kèm email/SĐT | P0 | W | ⬜ (cần plugin) | 2 |
| CH-05 | Livechat realtime | Hộp thư hợp nhất, đang gõ, đã xem, gán người phụ trách, lọc theo kênh/trạng thái; thông báo đẩy trên app | P0 | W, M | ✅ | 2 |
| ID-01 | Hợp nhất hồ sơ khách (Identity Resolution) | Chuẩn hóa SĐT (+84…) & email; khi trùng → gắn danh tính kênh mới vào khách cũ, hiện lại **lịch sử mua hàng & tương tác cũ**; trùng không chắc chắn → đề xuất gộp để nhân viên duyệt; lưu vết gộp/tách | P0 | W, M | ⬜ | 2 |
| BOT-01 | AI trả lời tự động theo danh mục | Claude đọc danh mục + kiến thức shop; tư vấn, thu SĐT/địa chỉ, chốt đơn, chuyển nhân viên; xử lý tin gửi dồn dập theo hàng đợi từng hội thoại | P0 | W | ✅ | 2 |
| BOT-02 | Kịch bản từ khóa | Từ khóa → câu trả lời + nút gợi ý | P1 | W | ✅ | 2 |
| BOT-03 | Câu trả lời nhanh (Quick Replies) | Phím tắt `/…`, ảnh/video, áp dụng theo kênh | P0 | W, M | ✅ | 2 |
| BOT-04 | Trả lời ngoài giờ | Ngoài giờ làm việc: AI trả lời hoặc gửi tin hẹn liên hệ lại | P0 | W | ⬜ | 2 |
| BOT-05 | Trigger | Sự kiện đơn / thanh toán / vận chuyển → gửi tin Zalo/Messenger, gắn nhãn, báo nhân viên, tạo việc | P0 | W | ✅ | 3 |
| CRM-01 | Pipeline & hồ sơ khách 360° | 7 giai đoạn, dòng thời gian mọi tương tác | P0 | W, M | ✅ | 4 |
| CRM-02 | Tiếp nhận & bám đuổi lead | Tự phân lead, SLA gọi lần đầu, lịch bám đuổi, gọi lại khi không nghe máy, cảnh báo quá hạn | P0 | W, M | ✅ | 4 |
| CRM-03 | Phễu nuôi dưỡng & khách cũ (LTV) | Theo lý do hoãn, chăm sóc định kỳ, gợi ý bán chéo / nâng cấp | P1 | W | ✅ | 4 |

### 📊 Phân hệ 5 – Báo cáo & Cài đặt (Analytics & Settings)
| Mã | Tính năng | Mô tả chi tiết | Ưu tiên | Nền tảng | Giao diện | Sprint |
|---|---|---|---|---|---|---|
| RPT-01 | Dashboard điều hành | Marketing → Bán hàng → CSKH, năng suất nhân sự, cảnh báo sớm, điểm nghẽn | P0 | W, M (rút gọn) | ✅ | 4 |
| RPT-02 | Báo cáo tăng trưởng khách hàng | Khách mới, SĐT, hiệu quả theo Ref | P0 | W | ✅ | 4 |
| RPT-03 | Báo cáo doanh thu đơn hàng | Hợp lệ, thành công, hủy, hoàn, đã thu theo page | P0 | W | ✅ | 4 |
| RPT-04 | Hiệu suất Sale | Thời gian phản hồi, tỉ lệ phản hồi, chốt, doanh số so mục tiêu | P0 | W | ✅ | 4 |
| RPT-05 | Thẻ hội thoại, Tương tác | Top thẻ; khách mới/cũ theo nhân viên & ngày | P1 | W | ✅ | 4 |
| RPT-06 | ROI quảng cáo | Theo ngày & theo ads: chi phí, SĐT, đơn, doanh thu, ROAS, CPL, CPA | P0 | W | ✅ | 4 |
| RPT-07 | Kho hàng, Credit AI, Hiệu quả AI | Xuất/nhập; credit đã dùng; % hội thoại AI tự xử lý | P1 | W | ✅ | 4 |
| SET-01 | Tích hợp VietQR | Tài khoản nhận tiền, bật VietQR, kết nối dịch vụ báo biến động số dư | P0 | W | ✅ | 3 |
| SET-02 | Tích điểm (Loyalty) | Quy tắc tích/đổi điểm, cộng điểm khi đơn thành công, trừ khi hoàn/hủy, lịch sử điểm | P1 | W, M | ✅ | 4 |
| SET-03 | Audit logs | Ghi ai – làm gì – lúc nào – trên dữ liệu nào (trước/sau) cho thao tác quan trọng; lọc, export; không ai sửa/xóa được log | P0 | W | ✅ một phần (Lịch sử) | 4 (lõi từ Sprint 1) |
| SET-04 | Gói phần mềm & hạn mức | Gói, hạn mức page/khách/nhân viên/credit/tin gửi; thanh toán gói **trên web** | P1 | W | ✅ | 4 |
| SET-05 | Các cài đặt khác | Thông tin shop, tin nhắn mẫu, vận chuyển, tồn kho, Ref & Src | P0 | W | ✅ | 1–4 |

### 📱 Phân hệ 6 – Ứng dụng di động & phát hành (Android / iOS)
| Mã | Tính năng | Mô tả chi tiết | Ưu tiên | Giao diện | Sprint |
|---|---|---|---|---|---|
| MOB-01 | Khung ứng dụng | React Native (Expo) dùng chung API; đăng nhập, chọn shop, chế độ tối | P0 | ⬜ | 5 |
| MOB-02 | Livechat di động | Danh sách & khung chat, trả lời nhanh, gửi ảnh, bật/tắt AI | P0 | ⬜ | 5 |
| MOB-03 | Thông báo đẩy | Tin nhắn mới, lead mới được giao, việc đến hạn, đơn mới (FCM cho Android, APNs cho iOS); xin quyền thông báo; tùy chỉnh loại thông báo | P0 | ⬜ | 5 |
| MOB-04 | CRM & việc cần làm | Việc hôm nay/quá hạn, ghi nhận cuộc gọi (bấm gọi bằng máy), hồ sơ khách | P0 | ⬜ | 5 |
| MOB-05 | Đơn hàng & kho | Tạo/xem đơn, tra tồn, quét mã vạch phiếu nhập/xuất/kiểm kho bằng camera | P1 | ⬜ | 5 |
| MOB-06 | Dashboard rút gọn | KPI chính, cảnh báo sớm | P1 | ⬜ | 5 |
| MOB-07 | Tuân thủ kho ứng dụng | Xóa tài khoản trong app, chính sách quyền riêng tư, khai báo dữ liệu, tài khoản demo cho người duyệt… (chi tiết mục 5) | P0 | ⬜ | 5 |

---

## 3. Loại tài khoản & phân quyền

### 3.1 Loại tài khoản
| Loại | Tạo bằng cách | Ghi chú |
|---|---|---|
| **Chủ shop** | Tự đăng ký (AUTH-01) | Trở thành **Admin** của shop vừa tạo; có thể tạo/được mời vào nhiều shop |
| **Nhân viên** | Được mời qua email (AUTH-07) | Vai trò Manager / Sale / Thủ kho do người mời chọn |
| **Quản trị nền tảng OmniBot** | Nội bộ, không đăng ký công khai | Hỗ trợ kỹ thuật, khóa shop vi phạm; mọi thao tác ghi Audit log; bắt buộc 2FA |

### 3.2 Ma trận quyền (vai trò trong một shop)
| Chức năng | Admin | Manager | Sale | Thủ kho |
|---|:-:|:-:|:-:|:-:|
| Dashboard điều hành | ✔ | ✔ | Của mình | Kho |
| Livechat & trả lời khách | ✔ | ✔ | ✔ (theo phạm vi dữ liệu) | ✖ |
| Bật/tắt AI, cấu hình bot, kịch bản | ✔ | ✔ | ✖ | ✖ |
| Khách hàng / CRM | ✔ | ✔ | ✔ (theo phạm vi) | ✖ |
| Phân lead, đổi người phụ trách | ✔ | ✔ | ✖ | ✖ |
| Tạo đơn / sửa đơn | ✔ | ✔ | ✔ (đơn của mình) | Xem |
| Hủy đơn, hoàn tiền | ✔ | ✔ | ✖ | ✖ |
| Sản phẩm, danh mục, combo | ✔ | ✔ | Xem | Xem |
| Coupon | ✔ | ✔ | Áp dụng | ✖ |
| Nhập / xuất / chuyển / kiểm kho | ✔ | ✔ | ✖ | ✔ |
| Vận đơn | ✔ | ✔ | Tạo cho đơn của mình | ✔ |
| Thu chi, sổ quỹ | ✔ | ✔ | ✖ | ✖ |
| Quảng cáo, gửi tin hàng loạt | ✔ | ✔ | ✖ | ✖ |
| Báo cáo | ✔ | ✔ | Của mình | Kho hàng |
| Nhân viên, phân quyền, ca làm việc | ✔ | Xem, xếp ca | ✖ | ✖ |
| Kết nối kênh, tích hợp, thanh toán, gói phần mềm | ✔ | ✖ | ✖ | ✖ |
| Audit log | ✔ | Xem | ✖ | ✖ |
| Xóa shop, chuyển quyền chủ shop | ✔ (chủ shop) | ✖ | ✖ | ✖ |

Quyền được kiểm tra ở **backend** (Role Guard + kiểm tra phạm vi dữ liệu trên từng truy vấn), giao diện chỉ ẩn nút cho gọn. Có thể mở rộng thành vai trò tùy chỉnh (CSKH, Marketing, Kế toán) ở P2 bằng bảng `permissions`.

---

## 4. Bảo mật

| Nhóm | Biện pháp |
|---|---|
| Mật khẩu | Băm bằng **Argon2id**; chặn mật khẩu yếu/phổ biến; không bao giờ ghi mật khẩu vào log |
| Phiên đăng nhập | Access token 15 phút; refresh token xoay vòng, lưu băm, gắn thiết bị; thu hồi khi đổi mật khẩu/khóa tài khoản; web lưu refresh token trong cookie `HttpOnly; Secure; SameSite=Strict`; app lưu trong **Keychain (iOS) / Keystore (Android)** |
| Chống dò mật khẩu | Giới hạn tần suất theo IP & tài khoản (Redis), khóa tạm, CAPTCHA, cảnh báo đăng nhập lạ |
| 2FA | TOTP cho Admin & quản trị nền tảng |
| Phân quyền | RBAC + phạm vi dữ liệu theo shop (`shopId` trên mọi bảng, kiểm tra ở mọi truy vấn để chống lộ dữ liệu giữa các shop) |
| Mã hóa | HTTPS/TLS 1.2+, HSTS; token kênh (Facebook, Zalo, TikTok, Ads) mã hóa **AES-256-GCM**, khóa để ngoài DB; SĐT/email có cột băm để tìm kiếm và hợp nhất hồ sơ |
| Webhook | Xác thực chữ ký: Facebook `X-Hub-Signature-256`, Zalo `mac`, hãng vận chuyển & ngân hàng theo tài liệu; chống gửi lặp bằng mã sự kiện duy nhất |
| Ứng dụng web | Kiểm tra đầu vào (class-validator), chống XSS/CSRF/SQL injection (Prisma), CORS giới hạn, header bảo mật (Helmet), giới hạn kích thước upload, quét mã độc file tải lên |
| Nhật ký | Audit log không sửa/xóa được; log đăng nhập; cảnh báo hành vi bất thường (xuất dữ liệu khách số lượng lớn) |
| Dữ liệu cá nhân (Nghị định 13/2023/NĐ-CP) | Ghi nhận đồng ý khi thu SĐT, cho khách yêu cầu xem/xóa dữ liệu, chính sách lưu trữ có thời hạn, ẩn bớt SĐT với vai trò không cần thiết |
| Vận hành | Bí mật trong biến môi trường/secret manager, sao lưu DB hằng ngày (giữ 30 ngày) + thử khôi phục định kỳ, cập nhật thư viện định kỳ, kiểm thử bảo mật trước phát hành |

---

## 5. Ứng dụng di động & quy định Google Play / App Store

> Quy định của Apple và Google thay đổi thường xuyên – **kiểm tra lại bản mới nhất khi nộp** (App Store Review Guidelines, Google Play Developer Policy Center).

### 5.1 Yêu cầu chung cho cả hai cửa hàng
| Yêu cầu | Cách đáp ứng trong OmniBot |
|---|---|
| **Xóa tài khoản ngay trong app** (App Store 5.1.1(v); chính sách xóa tài khoản của Google Play, kèm **link web** để yêu cầu xóa) | AUTH-13: mục *Tài khoản → Xóa tài khoản* trong app + trang web `/xoa-tai-khoan` |
| **Chính sách quyền riêng tư** công khai, có link trong app và trên trang cửa hàng | Trang `/chinh-sach-quyen-rieng-tu` và `/dieu-khoan` trên website |
| **Tài khoản demo** cho người duyệt vì app yêu cầu đăng nhập | Tạo shop demo có dữ liệu mẫu, khai báo trong App Store Connect (App Review Information) và Play Console (App access) |
| **Khai báo dữ liệu thu thập** | iOS: *App Privacy* trên App Store Connect + file *Privacy Manifest* (`PrivacyInfo.xcprivacy`); Android: biểu mẫu *Data safety* |
| **Không phải chỉ là trang web bọc lại** (App Store 4.2) | App có chức năng riêng: thông báo đẩy, quét mã vạch, gọi điện, sinh trắc học, giao diện tối ưu di động |
| Thông báo đẩy | Xin quyền rõ ràng (Android 13+ cần quyền `POST_NOTIFICATIONS`); không dùng thông báo để quảng cáo khi chưa có đồng ý |
| Quyền truy cập | Chỉ xin quyền camera (quét mã), thông báo; **không** xin quyền đọc SMS/nhật ký cuộc gọi (Google Play hạn chế) – xác nhận thanh toán làm ở máy chủ |

### 5.2 Riêng App Store (iOS)
| Yêu cầu | Cách đáp ứng |
|---|---|
| Thanh toán nội dung số trong app (3.1) | **Không bán gói phần mềm trong app**; app chỉ dùng cho doanh nghiệp đã có tài khoản; ẩn nút "Nâng cấp / Mua thêm" trên iOS; gói phần mềm mua trên web. Nếu sau này bán trong app thì phải dùng In-App Purchase |
| Đăng nhập bằng mạng xã hội (4.8) | Bản đầu chỉ dùng email/mật khẩu nên không bắt buộc; nếu thêm đăng nhập Google/Facebook thì phải có thêm Sign in with Apple hoặc phương án tương đương |
| Theo dõi người dùng (App Tracking Transparency) | Không theo dõi chéo app → không cần hiện hộp thoại ATT; khai báo đúng trong App Privacy |
| Tài khoản nhà phát triển | Apple Developer Program dạng **Tổ chức** (cần mã D-U-N-S) để hiện tên công ty |

### 5.3 Riêng Google Play (Android)
| Yêu cầu | Cách đáp ứng |
|---|---|
| Target API level | Build theo mức API Android mà Google yêu cầu tại thời điểm nộp (thường là bản Android mới trong vòng 1 năm) |
| Tài khoản nhà phát triển | Nên đăng ký dạng **Tổ chức** (cần D-U-N-S). Tài khoản cá nhân mới phải chạy **thử nghiệm kín với tối thiểu 12 người trong 14 ngày** trước khi phát hành chính thức |
| Định dạng phát hành | Android App Bundle (`.aab`), ký bằng Play App Signing |
| Data safety & quyền nhạy cảm | Khai báo đầy đủ; không dùng quyền SMS/Call log |

### 5.4 Quy trình phát hành
1. Thử nội bộ: TestFlight (iOS) và Internal testing (Android).
2. Thử kín với shop thật (Closed testing) ≥ 14 ngày.
3. Chuẩn bị trang cửa hàng: tên, mô tả tiếng Việt/Anh, ảnh chụp màn hình, biểu tượng, link chính sách, tài khoản demo.
4. Nộp duyệt; dự phòng 1–2 vòng bị từ chối để sửa.

---

## 6. Kiến trúc kỹ thuật

| Thành phần | Công nghệ |
|---|---|
| Backend API | **NestJS** (TypeScript), REST + **Socket.io** (Livechat, Dashboard realtime) |
| Database | **PostgreSQL** qua **Prisma ORM** (schema mục 7) |
| Cache & hàng đợi | **Redis** + BullMQ: gửi tin hàng loạt có giãn cách, đồng bộ quảng cáo, nhắc việc, trigger, AI trả lời theo hàng đợi từng hội thoại |
| AI | Dịch vụ AI dùng Claude API (chuyển từ `apps/ai-server/index.js`), ghi credit theo token |
| Web | React 18 + Vite (frontend hiện tại) – thay `localStorage` bằng gọi API |
| Mobile | React Native (Expo), dùng chung API & kiểu dữ liệu |
| Webchat | Plugin WordPress/WooCommerce + widget JS kết nối Socket.io |
| Lưu file | S3-compatible (ảnh sản phẩm, đính kèm chat) |
| Triển khai | Docker Compose trên VPS (giai đoạn đầu): `api`, `worker`, `postgres`, `redis`, `nginx`; staging + production; Sentry theo dõi lỗi; sao lưu DB hằng ngày |

---

## 7. Database Schema (Prisma)

> Mọi bảng nghiệp vụ có `shopId` (đa cửa hàng). Tiền tệ dùng `Decimal(14,0)` (VND). Token mã hóa lưu ở cột `*Enc`.

```prisma
generator client {
  provider    = "prisma-client-js"
}
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
// ───────────── Phân hệ 1: Xác thực & Phân quyền ─────────────
enum Role {
  ADMIN
  MANAGER
  SALE
  WAREHOUSE
}
enum UserStatus {
  ACTIVE
  LOCKED
  PENDING_DELETION
  DELETED
}
enum MemberStatus {
  INVITED
  ACTIVE
  DISABLED
}
enum ClientPlatform {
  WEB
  ANDROID
  IOS
}
enum TokenPurpose {
  EMAIL_VERIFY
  PASSWORD_RESET
}
enum DataScope {
  ALL
  OWN
  OWN_UNASSIGNED
}
enum AssignMode {
  MANUAL
  FIRST_VIEW
  ROUND_ROBIN_ONLINE
  ROUND_ROBIN_ALL
}

model User {
  id               String     @id @default(cuid())
  email            String     @unique
  passwordHash     String
  fullName         String
  phone            String?
  avatarUrl        String?
  status           UserStatus @default(ACTIVE)
  emailVerifiedAt  DateTime?
  twoFactorEnabled Boolean    @default(false)
  twoFactorSecretEnc String?
  failedLoginCount Int        @default(0)
  lockedUntil      DateTime?
  lastLoginAt      DateTime?
  isPlatformAdmin  Boolean    @default(false)
  deletionRequestedAt DateTime?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  memberships      ShopMember[]
  sessions         Session[]
  tokens           VerificationToken[]
}

model Shop {
  id         String   @id @default(cuid())
  name       String
  slug       String   @unique
  field      String?
  hotline    String?
  timezone   String   @default("Asia/Ho_Chi_Minh")
  currency   String   @default("VND")
  ownerId    String
  settings   Json     @default("{}")   // lịch làm việc, phí ship, tồn kho, tích điểm, KPI, quy trình CRM
  saleDataScope DataScope @default(OWN_UNASSIGNED)
  assignMode AssignMode @default(ROUND_ROBIN_ONLINE)
  createdAt  DateTime @default(now())
  deletedAt  DateTime?
  members    ShopMember[]
  subscription Subscription?
}

model ShopMember {
  id            String       @id @default(cuid())
  shopId        String
  userId        String
  role          Role
  status        MemberStatus @default(INVITED)
  monthlyTarget Decimal?     @db.Decimal(14, 0)
  receivesLeads Boolean      @default(true)
  isOnline      Boolean      @default(false)
  lastAssignedAt DateTime?   // phục vụ chia xoay vòng
  createdAt     DateTime     @default(now())
  shop          Shop         @relation(fields: [shopId], references: [id])
  user          User         @relation(fields: [userId], references: [id])
  shifts        WorkShift[]
  @@unique([shopId, userId])
}

model Invitation {
  id          String   @id @default(cuid())
  shopId      String
  email       String
  role        Role
  tokenHash   String   @unique
  invitedById String
  expiresAt   DateTime
  acceptedAt  DateTime?
  createdAt   DateTime @default(now())
}

model Session {
  id               String         @id @default(cuid())
  userId           String
  familyId         String         // chuỗi xoay vòng refresh token
  refreshTokenHash String         @unique
  platform         ClientPlatform
  deviceName       String?
  ip               String?
  userAgent        String?
  pushToken        String?        // FCM / APNs
  lastUsedAt       DateTime       @default(now())
  expiresAt        DateTime
  revokedAt        DateTime?
  revokeReason     String?
  createdAt        DateTime       @default(now())
  user             User           @relation(fields: [userId], references: [id])
  @@index([userId, revokedAt])
  @@index([familyId])
}

model VerificationToken {
  id        String       @id @default(cuid())
  userId    String
  purpose   TokenPurpose
  tokenHash String       @unique
  expiresAt DateTime
  usedAt    DateTime?
  user      User         @relation(fields: [userId], references: [id])
}

model WorkShift {
  id        String     @id @default(cuid())
  memberId  String
  dayOfWeek Int        // 0 = CN … 6 = T7
  startTime String     // "08:00"
  endTime   String     // "17:30"
  member    ShopMember @relation(fields: [memberId], references: [id])
}

model AuditLog {
  id         String   @id @default(cuid())
  shopId     String?
  actorId    String?            // User; null = hệ thống
  action     String             // vd: auth.login, order.cancel, customer.merge, settings.update
  entityType String?
  entityId   String?
  before     Json?
  after      Json?
  ip         String?
  userAgent  String?
  createdAt  DateTime @default(now())
  @@index([shopId, createdAt])
  @@index([entityType, entityId])
}

// ───────────── Phân hệ 4: Kênh, Hội thoại, Hồ sơ khách, CRM ─────────────
enum ChannelPlatform {
  FACEBOOK
  INSTAGRAM
  ZALO_OA
  TIKTOK_SHOP
  WEBCHAT
}
enum ChannelStatus {
  CONNECTED
  TOKEN_EXPIRED
  DISCONNECTED
}
enum Stage {
  NEW
  CONTACTING
  CONSULTING
  QUOTED
  WON
  NURTURING
  LOST
}
enum Sender {
  CUSTOMER
  AI
  BOT
  AGENT
  SYSTEM
}

model Channel {
  id             String          @id @default(cuid())
  shopId         String
  platform       ChannelPlatform
  externalId     String          // page_id, oa_id, shop_id TikTok, site_id webchat
  name           String
  accessTokenEnc String?
  refreshTokenEnc String?
  tokenExpiresAt DateTime?
  status         ChannelStatus   @default(CONNECTED)
  botConfig      Json            @default("{}")  // chế độ AI/kịch bản, lời chào, ngoài giờ
  createdAt      DateTime        @default(now())
  @@unique([platform, externalId])
}

model Customer {
  id              String   @id @default(cuid())
  shopId          String
  name            String
  phone           String?
  phoneNormalized String?            // +84xxxxxxxxx
  email           String?
  emailNormalized String?
  address         String?
  tags            String[]
  stage           Stage    @default(NEW)
  ownerId         String?            // ShopMember
  campaignId      String?            // nguồn quảng cáo
  ref             String?
  src             String?
  interestProductId String?
  expectedValue   Decimal? @db.Decimal(14, 0)
  nurtureReason   String?
  nextNurtureAt   DateTime?
  lostReason      String?
  marketingOptOut Boolean  @default(false)
  firstSeenAt     DateTime @default(now())
  phoneAt         DateTime?
  stageChangedAt  DateTime @default(now())
  mergedIntoId    String?            // khi bị gộp vào hồ sơ khác
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  identities      CustomerIdentity[]
  @@index([shopId, phoneNormalized])
  @@index([shopId, emailNormalized])
  @@index([shopId, stage, ownerId])
}

// Mỗi danh tính trên một kênh (PSID Facebook, user_id Zalo, buyer TikTok, visitor webchat)
model CustomerIdentity {
  id             String   @id @default(cuid())
  shopId         String
  customerId     String
  channelId      String
  externalUserId String
  displayName    String?
  avatarUrl      String?
  createdAt      DateTime @default(now())
  customer       Customer @relation(fields: [customerId], references: [id])
  @@unique([channelId, externalUserId])
}

model CustomerMergeLog {
  id          String   @id @default(cuid())
  shopId      String
  fromId      String
  intoId      String
  matchedBy   String   // phone | email | manual
  auto        Boolean
  actorId     String?
  createdAt   DateTime @default(now())
}

model ConsentRecord {
  id         String   @id @default(cuid())
  shopId     String
  customerId String
  purpose    String   // chăm sóc, quảng cáo, ZNS…
  source     String   // chat, form webchat, đơn hàng
  grantedAt  DateTime @default(now())
  revokedAt  DateTime?
}

model Conversation {
  id            String   @id @default(cuid())
  shopId        String
  channelId     String
  customerId    String
  identityId    String
  assigneeId    String?            // ShopMember
  botActive     Boolean  @default(true)
  handoff       Boolean  @default(false)
  handoffReason String?
  status        String   @default("open")
  unreadCount   Int      @default(0)
  campaignId    String?
  lastCustomerMessageAt DateTime?  // dùng cho khung 24h Messenger
  lastMessageAt DateTime?
  createdAt     DateTime @default(now())
  messages      Message[]
  @@index([shopId, lastMessageAt])
  @@index([assigneeId])
}

model Message {
  id             String   @id @default(cuid())
  conversationId String
  sender         Sender
  senderMemberId String?
  text           String?
  attachments    Json?
  productIds     String[]
  intent         String?
  aiEngine       String?            // claude | rules
  aiLatencyMs    Int?
  aiCostUsd      Decimal? @db.Decimal(10, 6)
  externalId     String?  @unique   // mid của nền tảng – chống trùng webhook
  createdAt      DateTime @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  @@index([conversationId, createdAt])
}

model QuickReply {
  id          String   @id @default(cuid())
  shopId      String
  shortcut    String
  name        String?
  content     String
  mediaUrl    String?
  channelIds  String[]
  createdById String
  @@unique([shopId, shortcut])
}

model Activity {
  id         String   @id @default(cuid())
  shopId     String
  customerId String
  memberId   String?
  type       String   // call, message, note, quote, meeting, care, stage, assign, broadcast
  outcome    String?
  durationSec Int?
  text       String?
  createdAt  DateTime @default(now())
  @@index([customerId, createdAt])
}

model Task {
  id         String   @id @default(cuid())
  shopId     String
  customerId String
  memberId   String
  type       String   // call | message
  kind       String   // cadence, retry, nurture, care, manual, upsell, reactivate
  title      String
  dueAt      DateTime
  doneAt     DateTime?
  cancelled  Boolean  @default(false)
  outcome    String?
  @@index([memberId, doneAt, dueAt])
}

model Trigger {
  id      String  @id @default(cuid())
  shopId  String
  type    String  // order | payment | shipping
  event   String
  action  String  // send_message | add_tag | notify | create_task
  payload Json
  active  Boolean @default(true)
}

// ───────────── Phân hệ 3: Sản phẩm, Kho, Đơn, Vận chuyển, Thanh toán, Thu chi ─────────────
enum StockDocKind {
  IMPORT
  EXPORT
  TRANSFER
  CHECK
}
enum DocStatus {
  DRAFT
  DONE
  CANCELLED
}
enum OrderStatus {
  NEW
  CONFIRMED
  SHIPPING
  DONE
  CANCELLED
  RETURNED
}
enum PaymentStatus {
  UNPAID
  PAID
  REFUNDED
}
enum PaymentMethod {
  COD
  BANK
  VIETQR
  CASH
  CARD
}
enum Carrier {
  GHN
  GHTK
  VIETTEL_POST
  SELF
}
enum ShipmentStatus {
  WAITING
  IN_TRANSIT
  DELIVERED
  RETURNING
  RETURNED
  CANCELLED
}

model Category {
  id          String @id @default(cuid())
  shopId      String
  name        String
  description String?
  active      Boolean @default(true)
}
model Product {
  id          String   @id @default(cuid())
  shopId      String
  sku         String
  name        String
  categoryId  String?
  price       Decimal  @db.Decimal(14, 0)
  costPrice   Decimal? @db.Decimal(14, 0)
  description String?            // AI dùng để tư vấn
  images      String[]
  barcode     String?
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  @@unique([shopId, sku])
}

model Combo {
  id          String @id @default(cuid())
  shopId      String
  name        String
  price       Decimal @db.Decimal(14, 0)
  active      Boolean @default(true)
  items       ComboItem[]
}
model ComboItem {
  id          String @id @default(cuid())
  comboId     String
  productId   String
  qty         Int
  combo       Combo @relation(fields: [comboId], references: [id])
}
model Coupon {
  id       String   @id @default(cuid())
  shopId   String
  code     String
  type     String   // percent | amount
  value    Decimal  @db.Decimal(14, 0)
  minOrder Decimal  @db.Decimal(14, 0) @default(0)
  usageLimit Int?
  usedCount  Int    @default(0)
  expiresAt DateTime
  active   Boolean  @default(true)
  @@unique([shopId, code])
}

model Supplier {
  id          String @id @default(cuid())
  shopId      String
  code        String
  name        String
  phone       String?
  address     String?
  description String?
  active      Boolean @default(true)
}
model Warehouse {
  id        String  @id @default(cuid())
  shopId    String
  code      String
  name      String
  address   String?
  ward      String?
  district  String?
  province  String?
  managerId String?
  phone     String?
  isDefault Boolean @default(false)
}

model StockLevel {
  id          String   @id @default(cuid())
  productId   String
  warehouseId String
  qty         Int      @default(0)
  updatedAt   DateTime @updatedAt
  @@unique([productId, warehouseId])   // khóa dòng (SELECT … FOR UPDATE) khi trừ kho
}

model StockDocument {
  id            String       @id @default(cuid())
  shopId        String
  code          String       // PN/PX/PC/PK + số
  kind          StockDocKind
  status        DocStatus    @default(DRAFT)
  warehouseId   String
  toWarehouseId String?
  supplierId    String?
  orderId       String?
  note          String?
  createdById   String
  createdAt     DateTime     @default(now())
  completedAt   DateTime?
  items         StockDocumentItem[]
  @@unique([shopId, code])
}

model StockDocumentItem {
  id          String  @id @default(cuid())
  documentId  String
  productId   String
  qty         Int
  cost        Decimal? @db.Decimal(14, 0)
  systemQty   Int?     // kiểm kho
  countedQty  Int?
  document    StockDocument @relation(fields: [documentId], references: [id])
}

model Order {
  id             String        @id @default(cuid())
  shopId         String
  code           String
  customerId     String
  channelId      String?
  conversationId String?
  campaignId     String?
  ownerId        String?               // Sale phụ trách
  createdBySource String               // ai | agent | web_shop
  status         OrderStatus   @default(NEW)
  paymentStatus  PaymentStatus @default(UNPAID)
  paymentMethod  PaymentMethod @default(COD)
  subtotal       Decimal       @db.Decimal(14, 0)
  discount       Decimal       @db.Decimal(14, 0) @default(0)
  shippingFee    Decimal       @db.Decimal(14, 0) @default(0)
  total          Decimal       @db.Decimal(14, 0)
  couponId       String?
  pointsUsed     Int           @default(0)
  shippingAddress String?
  note           String?
  createdById    String?
  createdAt      DateTime      @default(now())
  items          OrderItem[]
  @@unique([shopId, code])
  @@index([shopId, createdAt])
}

model OrderItem {
  id          String @id @default(cuid())
  orderId     String
  productId   String
  comboId     String?
  qty         Int
  price       Decimal @db.Decimal(14, 0)
  order       Order @relation(fields: [orderId], references: [id])
}
model Shipment {
  id           String         @id @default(cuid())
  shopId       String
  orderId      String
  carrier      Carrier
  trackingCode String?
  fee          Decimal        @db.Decimal(14, 0)
  codAmount    Decimal        @db.Decimal(14, 0) @default(0)
  status       ShipmentStatus @default(WAITING)
  labelUrl     String?
  rawPayload   Json?
  createdAt    DateTime       @default(now())
  @@unique([carrier, trackingCode])
}

model Payment {
  id          String        @id @default(cuid())
  shopId      String
  orderId     String?
  method      PaymentMethod
  amount      Decimal       @db.Decimal(14, 0)
  vietqrPayload String?               // chuỗi QR đã tạo
  bankTxnId   String?       @unique   // mã giao dịch từ webhook ngân hàng – chống ghi nhận 2 lần
  status      String        @default("pending")
  paidAt      DateTime?
  createdAt   DateTime      @default(now())
}

model CashTransaction {
  id          String   @id @default(cuid())
  shopId      String
  code        String   // PT… / PC…
  kind        String   // receipt | expense
  amount      Decimal  @db.Decimal(14, 0)
  method      PaymentMethod
  category    String?
  description String?
  orderId     String?
  paymentId   String?
  status      String   @default("done")
  paidAt      DateTime
  createdById String
  createdAt   DateTime @default(now())
  @@unique([shopId, code])
}

model LoyaltyAccount {
  id          String @id @default(cuid())
  shopId      String
  customerId  String @unique
  points      Int @default(0)
  updatedAt   DateTime @updatedAt
}
model LoyaltyTransaction {
  id          String @id @default(cuid())
  accountId   String
  points      Int
  reason      String
  orderId     String?
  createdAt   DateTime @default(now())
}
// ───────────── Phân hệ 2: Quảng cáo & Gửi tin hàng loạt ─────────────
enum AdPlatform {
  META
  TIKTOK
  GOOGLE
}
enum BroadcastChannel {
  MESSENGER
  ZALO_OA
  ZALO_ZNS
}
enum BroadcastStatus {
  DRAFT
  SCHEDULED
  SENDING
  SENT
  CANCELLED
}

model AdAccount {
  id             String     @id @default(cuid())
  shopId         String
  platform       AdPlatform
  externalId     String
  name           String
  accessTokenEnc String
  tokenExpiresAt DateTime?
  channelIds     String[]
  status         String     @default("connected")
  lastSyncAt     DateTime?
  @@unique([platform, externalId])
}

model AdCampaign {
  id          String  @id @default(cuid())
  adAccountId String
  externalId  String
  name        String
  objective   String?
  status      String
  dailyBudget Decimal? @db.Decimal(14, 0)
  channelId   String?
  productIds  String[]
  @@unique([adAccountId, externalId])
}

model AdSet {
  id          String @id @default(cuid())
  campaignId  String
  externalId  String
  name        String
  status      String
  audience    Json?
}
model Ad {
  id          String @id @default(cuid())
  adSetId     String
  externalId  String
  name        String
  status      String
  creative    Json?
}
model AdMetricDaily {
  id          String   @id @default(cuid())
  level       String   // campaign | adset | ad
  entityId    String
  date        DateTime @db.Date
  spend       Decimal  @db.Decimal(14, 0)
  impressions Int
  reach       Int
  clicks      Int
  results     Int
  @@unique([level, entityId, date])
}

model ZnsTemplate {
  id          String @id @default(cuid())
  shopId      String
  templateId  String
  name        String
  params      Json
  status      String
  unitPrice   Decimal? @db.Decimal(10, 0)
}
model Broadcast {
  id          String           @id @default(cuid())
  shopId      String
  name        String
  channel     BroadcastChannel
  audience    Json             // tags, lịch sử mua, tương tác cuối, giai đoạn, nguồn QC
  content     String?
  znsTemplateId String?
  scheduledAt DateTime?
  status      BroadcastStatus  @default(DRAFT)
  createdById String
  createdAt   DateTime         @default(now())
  recipients  BroadcastRecipient[]
}

model BroadcastRecipient {
  id          String   @id @default(cuid())
  broadcastId String
  customerId  String
  status      String   // queued | sent | failed | skipped_policy | opted_out
  error       String?
  sentAt      DateTime?
  readAt      DateTime?
  repliedAt   DateTime?
  broadcast   Broadcast @relation(fields: [broadcastId], references: [id])
  @@unique([broadcastId, customerId])
}

// ───────────── Phân hệ 5: Gói phần mềm ─────────────
model Subscription {
  id               String   @id @default(cuid())
  shopId           String   @unique
  planCode         String   // STARTER | BUSINESS | ENTERPRISE
  status           String   // active | past_due | cancelled
  source           String   @default("web")   // gói chỉ bán trên web
  currentPeriodEnd DateTime?
  quotas           Json
  shop             Shop     @relation(fields: [shopId], references: [id])
}
```

**Ghi chú triển khai schema**
- `Customer` + `CustomerIdentity` là lõi của **Identity Resolution**: tin nhắn mới → tìm `CustomerIdentity` theo `(channelId, externalUserId)`; nếu chưa có thì tạo khách tạm; khi lấy được SĐT/email → tìm khách trùng `phoneNormalized`/`emailNormalized` trong cùng shop → gộp (ghi `CustomerMergeLog`, chuyển hội thoại, đơn, hoạt động sang hồ sơ đích).
- Tạo đơn: một transaction gồm tạo `Order` + `OrderItem` → `SELECT … FOR UPDATE` các `StockLevel` → kiểm tra tồn → tạo `StockDocument` EXPORT trạng thái DONE → cập nhật `StockLevel` → ghi `AuditLog`.
- Các bảng lớn (`Message`, `AuditLog`, `AdMetricDaily`) nên phân vùng theo tháng khi dữ liệu tăng.

---

## 8. Development Roadmap

> Kế hoạch thực hiện chi tiết từng bước (việc cần làm → tạo code → kiểm tra code → cổng chuyển bước): xem **[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)**.

**Quy ước**: mỗi Sprint 2 tuần. Bốn sprint đầu theo kế hoạch đã chốt; các tác vụ bổ sung được đánh dấu **[Bổ sung]**; thêm **Sprint 5** cho ứng dụng di động và phát hành lên kho ứng dụng.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                  KẾ HOẠCH TRIỂN KHAI OMNIBOT (5 SPRINTS)                 │
└──────────────────────────────────────────────────────────────────────────┘

 PHASE 1: CORE INFRASTRUCTURE & AUTH (Sprint 1)
 ├── Task 1.1: Setup NestJS + Prisma PostgreSQL + Redis Base Project
 ├── Task 1.2: Triển khai Auth Module (Register, Login JWT, Role Guard)
 ├── Task 1.3: Dựng cơ sở dữ liệu nền tảng (User, Customer, Product, Inventory)
 ├── Task 1.4: [Bổ sung] Refresh token xoay vòng, quản lý & thu hồi phiên, đăng xuất mọi thiết bị
 ├── Task 1.5: [Bổ sung] Xác minh email, quên/đặt lại mật khẩu, khóa tạm khi sai mật khẩu, rate limit
 ├── Task 1.6: [Bổ sung] Mời nhân viên, Shop/ShopMember đa cửa hàng, Data Scope Guard cho Sale
 ├── Task 1.7: [Bổ sung] Khung Audit Log (interceptor) + nhật ký đăng nhập
 ├── Task 1.8: [Bổ sung] API xóa tài khoản (bắt buộc theo App Store/Google Play)
 └── Task 1.9: [Bổ sung] Màn hình web: Đăng ký, Đăng nhập, Quên mật khẩu, Hồ sơ cá nhân, Thiết bị đăng nhập;
               chuyển frontend từ localStorage sang API (Auth, Sản phẩm, Khách hàng)

 PHASE 2: OMNI-CHANNEL & IDENTITY ENGINE (Sprint 2)
 ├── Task 2.1: Triển khai CustomerIdentityService (Identity Resolution logic)
 ├── Task 2.2: Đấu nối Webhook Zalo OA API & TikTok Shop API
 ├── Task 2.3: Đấu nối WebSocket / Socket.io cho WordPress Webchat Plugin
 ├── Task 2.4: Dựng API Livechat & Gửi/Nhận tin nhắn đa kênh Real-time
 ├── Task 2.5: [Bổ sung] Webhook Facebook Messenger & Instagram + xác thực chữ ký webhook mọi kênh
 ├── Task 2.6: [Bổ sung] AI Service trả lời tự động theo danh mục (Claude) + hàng đợi theo hội thoại + ghi credit
 ├── Task 2.7: [Bổ sung] Ca làm việc nhân viên + chia hội thoại Round-Robin theo người online/trong ca
 ├── Task 2.8: [Bổ sung] Quick Replies, kịch bản từ khóa, trả lời ngoài giờ
 └── Task 2.9: [Bổ sung] Gắn Ref & Src (ref Messenger, ads_id, utm) vào khách và hội thoại

 PHASE 3: POS, INVENTORY & SHIPMENT INTEGRATION (Sprint 3)
 ├── Task 3.1: Xây dựng Module Quản lý Kho (Nhập/Xuất/Kiểm/Chuyển kho)
 ├── Task 3.2: Viết Transaction Tạo đơn hàng & Trừ tồn kho tự động
 ├── Task 3.3: Kết nối API Vận chuyển (GHN/GHTK) & Tạo VietQR Code
 ├── Task 3.4: Xây dựng Module Trigger (Tự động gửi tin xác nhận đơn qua Zalo)
 ├── Task 3.5: [Bổ sung] Combo, Coupon, Nhà cung cấp, quy tắc phí ship khi tạo đơn
 ├── Task 3.6: [Bổ sung] Webhook biến động số dư → tự xác nhận thanh toán VietQR + tự tạo biên lai
 ├── Task 3.7: [Bổ sung] Webhook trạng thái vận đơn GHN/GHTK, đối soát COD, hoàn kho khi hủy/hoàn hàng
 └── Task 3.8: [Bổ sung] Thu chi: biên lai, phiếu chi, sổ quỹ

 PHASE 4: ADS CAMPAIGN, REPORTS & POLISHING (Sprint 4)
 ├── Task 4.1: Xây dựng Module Broadcast gửi tin nhắn Zalo ZNS / Messenger hàng loạt
 ├── Task 4.2: Xây dựng API Báo cáo & Thống kê (Doanh thu, Sale, Kho, Ads)
 ├── Task 4.3: Viết Audit Logs & Cài đặt Tích điểm (Loyalty)
 ├── Task 4.4: Testing, Tối ưu hóa hiệu năng & Deployment (Docker/VPS)
 ├── Task 4.5: [Bổ sung] Kết nối Meta Ads & TikTok Ads (token, đồng bộ số liệu hằng ngày), bảng chiến dịch đa cấp
 ├── Task 4.6: [Bổ sung] Bộ lọc tệp khách (Tag, lịch sử mua, tương tác cuối), quản lý mẫu ZNS, hủy nhận tin, khung 24h Messenger
 ├── Task 4.7: [Bổ sung] CRM: pipeline, việc cần làm, cảnh báo sớm, Dashboard điều hành realtime
 └── Task 4.8: [Bổ sung] 2FA cho Admin, kiểm thử bảo mật (OWASP), trang Chính sách quyền riêng tư & Điều khoản

 PHASE 5: MOBILE APPS & STORE RELEASE (Sprint 5) – [Bổ sung]
 ├── Task 5.1: App React Native (Expo): đăng nhập, lưu token an toàn (Keychain/Keystore), mở khóa sinh trắc học, chọn shop
 ├── Task 5.2: Livechat di động + thông báo đẩy (FCM / APNs), lưu push token theo phiên
 ├── Task 5.3: CRM việc cần làm, tạo/xem đơn, tra tồn, quét mã vạch kho, Dashboard rút gọn
 ├── Task 5.4: Tuân thủ kho ứng dụng: xóa tài khoản trong app + link web, App Privacy & Privacy Manifest,
 │             Data safety, tài khoản demo cho người duyệt, ẩn mua gói trên iOS
 ├── Task 5.5: TestFlight + Google Play Closed testing với shop thật (≥ 14 ngày)
 └── Task 5.6: Nộp duyệt App Store & Google Play, xử lý phản hồi, phát hành
```

### 8.1 Đánh giá thời gian (cần đọc)
- Phạm vi trên lớn: ước tính trước đây cho bản đầy đủ là **18–25 tuần** với 2 backend + 1 frontend + QA. **5 sprint × 2 tuần = 10 tuần** chỉ khả thi khi tăng nhân sự (khoảng 3–4 backend, 2 frontend/mobile) **hoặc** chỉ làm các mục **P0** trong mỗi sprint và dời P1/P2 sang sau.
- Việc chờ duyệt bên ngoài không phụ thuộc đội phát triển và cần bắt đầu **ngay từ Sprint 1**: Meta App Review (quyền nhắn tin, đọc quảng cáo), xác minh doanh nghiệp Meta, Zalo OA & mẫu ZNS, TikTok Shop Partner, tài khoản GHN/GHTK, dịch vụ báo biến động số dư, mã D-U-N-S cho tài khoản nhà phát triển Apple/Google.
- Thời gian duyệt app và 14 ngày thử kín (nếu dùng tài khoản Google Play cá nhân) có thể làm Sprint 5 kéo dài thêm 1–3 tuần.

### 8.2 Tiêu chí hoàn thành từng Sprint
| Sprint | Nghiệm thu |
|---|---|
| 1 | Đăng ký → xác minh email → đăng nhập → mời nhân viên; mỗi vai trò chỉ thấy đúng dữ liệu; thu hồi phiên có hiệu lực ngay; mọi thao tác đăng nhập có trong Audit log |
| 2 | Khách nhắn từ Facebook/Zalo/Webchat hiện realtime; AI trả lời < 10 giây; cùng SĐT từ 2 kênh → 1 hồ sơ khách với đầy đủ lịch sử; hội thoại chia đúng người trong ca |
| 3 | Một đơn đi trọn vòng: chat → đơn → trừ kho (không âm khi 2 đơn đồng thời) → vận đơn GHN/GHTK có mã → khách quét VietQR → tự "Đã thanh toán" → biên lai → sổ quỹ; trigger gửi tin xác nhận |
| 4 | Số chi tiêu khớp Ads Manager (±1%); broadcast tôn trọng khung 24h & opt-out; báo cáo khớp dữ liệu gốc; hệ thống chạy trên VPS bằng Docker, có sao lưu |
| 5 | App Android & iOS được duyệt và phát hành; thông báo đẩy hoạt động; xóa tài khoản trong app hoạt động |

---

## 9. Rủi ro & lưu ý chính sách

| Vấn đề | Cách xử lý |
|---|---|
| Messenger chỉ cho gửi tin quảng bá trong 24 giờ từ tin cuối của khách | Bộ lọc 24 giờ (đã có trên giao diện); ngoài 24h chỉ dùng thẻ tin nhắn đúng mục đích hoặc tin nhắn tài trợ |
| Meta App Review & xác minh doanh nghiệp mất thời gian | Nộp từ Sprint 1, chuẩn bị video demo, chính sách quyền riêng tư |
| Zalo ZNS cần duyệt mẫu, tính phí theo tin | Chuẩn bị mẫu sớm, theo dõi chi phí trong báo cáo |
| App Store từ chối vì app chỉ là web bọc lại hoặc thiếu xóa tài khoản / tài khoản demo | Làm đủ mục 5 trước khi nộp |
| Bảo vệ dữ liệu cá nhân (Nghị định 13/2023/NĐ-CP) | Ghi nhận đồng ý, cho phép xem/xóa dữ liệu, mã hóa, phân quyền xem SĐT |
| Lộ dữ liệu giữa các shop | `shopId` bắt buộc ở mọi truy vấn (Prisma middleware), kiểm thử tự động chống truy cập chéo |
| AI trả lời sai giá / bịa thông tin | Chỉ dùng dữ liệu danh mục + kiến thức shop; chuyển nhân viên khi ngoài dữ liệu |
| Gộp nhầm hồ sơ khách | Chỉ tự gộp khi trùng SĐT/email đã chuẩn hóa; trường hợp khác đề xuất để nhân viên duyệt; cho phép tách lại |
| Chi phí AI tăng theo lượng tin | Theo dõi Credit, hạn mức theo gói, cache prompt danh mục |
| Token kênh/quảng cáo hết hạn | Job kiểm tra token, cảnh báo trong Lịch sử & thông báo |

---

## Phụ lục A. Chi tiết màn hình frontend web (theo icon / nút bấm)

Ký hiệu cột "Hiện tại": ✅ chạy thật trên frontend · 🟡 giả lập (demo) · ⛔ cần backend mới chạy thật.

### A1. Thanh điều hướng trên cùng
| Icon / nút | Chức năng | Hiện tại |
|---|---|---|
| Logo OmniBot | Về Dashboard | ✅ |
| 10 mục menu (Dashboard → Cài đặt) | Chuyển trang; màn hình hẹp chỉ hiện icon, rê chuột thấy tên | ✅ |
| 🔔 Chuông + số đỏ | Tổng tin chưa đọc; bấm mở Livechat | ✅ (⛔ thông báo đẩy realtime cần WebSocket) |
| Tên shop + avatar | Hiển thị shop đang đăng nhập | 🟡 (⛔ đăng nhập, đổi shop, đăng xuất) |

### A2. Dashboard điều hành
| Thành phần | Chức năng | Hiện tại |
|---|---|---|
| Hôm nay / 7 ngày / 30 ngày | Đổi kỳ báo cáo cho toàn trang | ✅ |
| Chấm xanh "Cập nhật realtime" | Tự tính lại mỗi 30 giây và mỗi khi dữ liệu đổi | ✅ (⛔ realtime nhiều máy cần WebSocket) |
| 6 thẻ KPI | Doanh thu (thanh tiến độ so mục tiêu), Đơn hàng, Lead mới, Lead chưa liên hệ (đỏ khi > 0), Việc quá hạn, Chi phí QC + ROAS | ✅ |
| Dòng chảy dữ liệu (3 cột) | Marketing → Bán hàng → CSKH với tỉ lệ chuyển đổi từng bước | ✅ |
| Nút "Chi tiết quảng cáo" / "Mở pipeline" / "Khách cũ & LTV" | Đi tới trang chi tiết | ✅ |
| Cảnh báo sớm – nút **Xử lý** | Mở Hồ sơ khách 360° của thương vụ có nguy cơ (quá hạn, kẹt giai đoạn, chưa gọi trong SLA, không nghe máy nhiều lần, chưa có lịch hẹn tiếp) | ✅ |
| Nút "Tất cả việc" | Tới Bám đuổi & việc cần làm | ✅ |
| Điểm nghẽn quy trình | Danh sách vấn đề + gợi ý xử lý; bảng số lead / thời gian nằm / số kẹt ở mỗi giai đoạn | ✅ |
| Bảng Năng suất nhân sự | Cuộc gọi, phút gọi, chăm sóc, lead nhận, % đã liên hệ, thời gian gọi lần đầu, chốt, doanh số, tiến độ mục tiêu, việc quá hạn | ✅ (⛔ cuộc gọi tự động cần tích hợp tổng đài) |

### A3. Kênh & Bot
| Icon / nút | Chức năng | Hiện tại |
|---|---|---|
| Bot của tôi / Bot mẫu | Chuyển tab | ✅ |
| Lọc kênh, ô Tìm kiếm | Lọc danh sách kênh/bot mẫu | ✅ |
| **Gộp kênh** (xanh lá) | Gộp hộp thư các kênh vào Livechat | 🟡 |
| **+ Kết nối kênh mới (x/10)** | Chọn nền tảng (Facebook, Instagram, Zalo OA, Website, TikTok) và tên kênh | 🟡 ⛔ cần OAuth Facebook/Zalo/TikTok + webhook |
| Công tắc "Chatbot đang bật" | Bật/tắt tự động trả lời của kênh | ✅ |
| 🗑 trên thẻ kênh | Ngắt kết nối kênh | 🟡 |
| Livechat / Cấu hình bot | Mở hộp thư / mở trang cấu hình bot | ✅ |
| Bot mẫu: **Test bot** | Chat thử bot mẫu | ✅ |
| Bot mẫu: **Sao chép** | Áp bot mẫu vào một kênh | ✅ |

**Cấu hình bot:** chọn chế độ *AI tự động hoàn toàn* hoặc *Kịch bản từ khóa*; kiến thức shop, cách xưng hô, mức suy nghĩ (effort), giọng điệu, công tắc *cho AI tự tạo đơn*, *chuyển nhân viên khi phàn nàn*; khung điện thoại để chat thử; nút **Danh mục (n)** mở danh sách sản phẩm. Chế độ kịch bản: lời chào, nút trả lời nhanh, **+ Thêm kịch bản** (từ khóa → câu trả lời → nút gợi ý), 🗑 xóa kịch bản. ✅ (AI Claude ⛔ cần API key + server).

### A4. Quảng cáo
**Tài khoản**
| Nút | Chức năng | Hiện tại |
|---|---|---|
| **+ Thêm tài khoản** | Thêm tài khoản quảng cáo (nền tảng, tên, ID, kênh nhận khách) | 🟡 ⛔ OAuth Meta Marketing API / Google Ads API / TikTok Business API |
| ⟳ Đồng bộ | Cập nhật số liệu tài khoản | 🟡 ⛔ job đồng bộ |
| ⛓ Ngắt kết nối | Ngắt tài khoản | 🟡 |
| Export | Xuất CSV danh sách | ✅ |

**Chiến dịch** (bảng giống trình quản lý quảng cáo)
| Thành phần | Chức năng | Hiện tại |
|---|---|---|
| Chọn tài khoản / Tìm ID, tên / Trạng thái / Kỳ | Lọc bảng | ✅ |
| Tab **Chiến dịch · Nhóm quảng cáo · Quảng cáo** | Đổi cấp xem | ✅ (nhóm & quảng cáo đang chia tỉ lệ từ chiến dịch ⛔ cần API) |
| Công tắc Tắt/bật mỗi dòng | Bật/tắt chiến dịch, nhóm, quảng cáo | 🟡 ⛔ gọi API nền tảng |
| Cột chỉ số | Tiếp cận, Hiển thị, Bấm, Kết quả, Chi phí, CPA, Hội thoại, SĐT, %SĐT, Đơn hàng, SR, Doanh số, ROAS, CPL, CPO + dòng Tổng | ✅ |
| **+ Tạo chiến dịch** | Form: tên, tài khoản, kênh, mục tiêu, ngân sách, vị trí, tệp nhắm, sản phẩm, nội dung | 🟡 ⛔ tạo trên nền tảng qua API |
| **✨ Tạo chiến dịch AI** | Chọn sản phẩm + mục tiêu + ngân sách → AI đề xuất tên, tệp, vị trí, 3 mẫu nội dung → mở form để sửa & lưu | ✅ (mẫu nội bộ; ⛔ Claude khi có server) |
| Export | Xuất CSV | ✅ |

**Gửi tin hàng loạt**
| Thành phần | Chức năng | Hiện tại |
|---|---|---|
| 4 thẻ thống kê | Chiến dịch đã gửi, tin đã gửi/lỗi, tỉ lệ xem, tỉ lệ phản hồi | ✅ |
| **+ Tạo chiến dịch gửi tin** | Trình hướng dẫn 4 bước: (1) Kênh: Messenger / Zalo OA tin tư vấn / Zalo ZNS theo SĐT; (2) Tệp khách: giai đoạn, nhãn, nguồn quảng cáo, chỉ khách trong khung được phép (24 giờ Messenger, 7 ngày Zalo OA) + cảnh báo khi bỏ chọn; (3) Nội dung có biến `{{ten}}`, `{{sdt}}` + xem trước; (4) Gửi ngay / Hẹn giờ | 🟡 ⛔ Messenger Send API, Zalo OA API, ZNS (mẫu phải được Zalo duyệt) |
| Lọc trạng thái, tìm, Export | Lọc/ xuất danh sách | ✅ |
| Lưu vết | Mỗi tin đã gửi được ghi vào lịch sử tương tác của khách | ✅ |

**Báo cáo & tối ưu** (đã có từ trước): Tổng quan kết nối & KPI (thẻ tài khoản, KPI tiếp cận đạt/chưa đạt, **Đặt mục tiêu KPI**, bảng theo kênh), Hiệu quả chiến dịch, Gợi ý tối ưu (quy tắc + **Phân tích bằng AI**), Tệp khách & chuyển đổi (**Tải tệp CSV** Meta/Google/TikTok có SHA-256, **Xuất chuyển đổi**), Nhập dữ liệu & theo dõi (**Đọc dữ liệu** CSV từ Ads Manager, **+ Thêm chiến dịch**, công tắc chạy, **Sao chép link theo dõi**).

### A5. Livechat
| Icon / nút | Chức năng | Hiện tại |
|---|---|---|
| Thanh icon trái: 📥 Tất cả · 💬 Chưa đọc · 🤖 AI đang xử lý · 👤 Cần nhân viên (số đỏ) | Lọc hội thoại | ✅ |
| Biểu ngữ AI (xanh/vàng) | Cho biết đang dùng Claude hay AI nội bộ | ✅ |
| Ô tìm tên, **+** | Tìm khách; **+** giả lập khách mới nhắn tin | ✅ (giả lập) ⛔ tin thật cần webhook |
| Lọc theo kênh | Lọc hội thoại theo kênh | ✅ |
| Nhãn trên dòng hội thoại | AI / Cần nhân viên / nguồn quảng cáo | ✅ |
| ← (đầu khung chat) | Đóng hội thoại (màn hình nhỏ) | ✅ |
| Công tắc **AI tự động** | Bật/tắt AI cho riêng hội thoại; bật lại thì AI trả lời tin đang chờ | ✅ |
| Thẻ sản phẩm trong tin AI | Hiển thị sản phẩm AI gợi ý | ✅ |
| **Nhập vai khách** | Tự chat như khách để thử AI (thu SĐT, chốt đơn) | ✅ |
| 😊 / ⚡ / gõ `/` | Chèn emoji / tin nhắn mẫu | ✅ |
| **Gửi** | Nhân viên trả lời → tự tắt AI hội thoại đó | ✅ (⛔ gửi thật cần Send API) |
| Cột phải: Họ tên, SĐT, Địa chỉ, Nhãn, Ghi chú | Sửa hồ sơ khách | ✅ |
| **Tạo đơn** / **Đặt lịch** | Tạo đơn cho khách / tạo lịch hẹn 9:00 ngày mai | ✅ |

### A6. Khách hàng (CRM)
| Màn hình | Nút / thành phần | Chức năng |
|---|---|---|
| Pipeline | 7 cột giai đoạn, thẻ viền đỏ = có nguy cơ, lọc nhân sự, tìm | Bấm thẻ mở Hồ sơ 360° ✅ |
| Hồ sơ 360° | Đổi giai đoạn (Nuôi dưỡng hỏi lý do, Thất bại hỏi lý do), đổi người phụ trách; nút **Gọi, Nhắn, Báo giá, Gặp mặt, Chăm sóc, Ghi chú** (kết quả cuộc gọi, thời lượng, hẹn liên hệ lại); **Mở Livechat**; dòng thời gian mọi tương tác; việc cần làm (nút **Làm**); gợi ý bán thêm | ✅ |
| Bám đuổi | Nhóm Quá hạn / 24h tới / Sắp tới; nút **Gọi được**, **Không nghe** (tự hẹn gọi lại), **Đã nhắn**, **Hồ sơ** | ✅ |
| Phễu nuôi dưỡng | Thẻ theo lý do hoãn; "Đón đầu nhu cầu" khi khách nhắn lại → **Chuyển sang tư vấn**; **Gửi chăm sóc** (mẫu theo lý do, tự hẹn kỳ sau); **Có nhu cầu**; **Tệp retarget** | ✅ |
| Khách cũ & LTV | Tỉ lệ mua lại, LTV, giá trị đơn TB, tiềm năng upsell; **Tạo cơ hội** (đưa vào pipeline + việc gọi); **Xuất tệp** | ✅ |
| Quy trình chuẩn | Sơ đồ 6 bước; chỉnh SLA, giờ gọi lại, số lần gọi, chu kỳ nuôi dưỡng, ngưỡng cảnh báo kẹt; lịch bám đuổi (**+ Thêm bước**, 🗑) | ✅ |

### A7. Đơn hàng & POS
| Màn hình | Nút / thành phần | Chức năng | Hiện tại |
|---|---|---|---|
| Đơn hàng | Lọc trạng thái, tìm, **Export**, **+ Tạo đơn**, đổi trạng thái tại dòng, 🗑 | Quản lý đơn; tạo đơn tự xuất kho | ✅ |
| Sản phẩm | **Quét danh mục** (link website cho AI đọc / dán bảng Excel), **+ Thêm sản phẩm**, bấm dòng để sửa, 🗑 | Danh mục AI dùng để tư vấn | ✅ (quét link ⛔ cần server AI) |
| Danh mục | **+ Thêm danh mục**, ✏️, 🗑, Export | Nhóm sản phẩm, đếm số sản phẩm | ✅ |
| Combo | **+ Tạo combo** (2 sản phẩm + giá), công tắc Mở bán, cột Giá lẻ / Tiết kiệm | Bán kèm | ✅ |
| Coupon | **+ Tạo mã giảm giá** (% hoặc số tiền, đơn tối thiểu, lượt dùng, hạn) | Mã giảm giá | ✅ (⛔ áp mã khi tạo đơn) |
| Nhà cung cấp | **+ Thêm nhà cung cấp**, lọc trạng thái | Danh bạ NCC dùng khi nhập kho | ✅ |
| Khách hàng | Bảng khách, số đơn, chi tiêu | | ✅ |
| Kho – Danh sách | **+ Thêm kho**, đặt **kho mặc định** | Nhiều kho | ✅ |
| Nhập / Xuất / Chuyển kho | **+ Tạo phiếu** (kho, NCC/kho nhận, dòng sản phẩm, giá nhập), **Lưu nháp**, **Hoàn tất**; tại dòng: ✔ Hoàn tất (cập nhật tồn), ✖ Hủy | Phiếu kho có trạng thái | ✅ |
| Tồn kho | Lọc kho, tab Sắp hết / Hết hàng, Export, dòng tổng | Tồn theo kho | ✅ |
| Kiểm kho | **+ Tạo phiếu kiểm** (tồn hệ thống vs thực tế, chênh lệch), Hoàn tất = chốt tồn thực tế | | ✅ |
| Vận đơn | Thẻ: chờ tạo, đang giao, phí ship, COD chưa đối soát; **+ Tạo vận đơn** (chọn đơn, hãng, phí); đổi trạng thái giao (tự cập nhật đơn) | | 🟡 ⛔ API GHN/GHTK/Viettel Post, webhook trạng thái |
| Biên lai / Phiếu chi | **+ Tạo biên lai** (thu cho đơn → đơn thành Đã thanh toán) / **+ Tạo phiếu chi** (khoản chi) | | ✅ |
| Sổ quỹ | Chọn tháng; Số dư đầu kỳ, Tổng thu, Tổng chi, Tồn cuối kỳ; tab Biên lai / Phiếu chi; Export | | ✅ |
| Thanh bên | Nhóm mở/đóng, **Thu gọn** | | ✅ |

### A8. Báo cáo
| Báo cáo | Nội dung |
|---|---|
| Tổng quan | KPI khách, SĐT, hội thoại, đơn, doanh thu; biểu đồ ngày; tin nhắn theo giờ; theo kênh |
| Khách hàng | Khách mới & SĐT theo ngày, khách theo page, **Hiệu quả theo Ref** (contact, order, CR, doanh thu) |
| Đơn hàng | Hợp lệ / Thành công / Đã TT / Hủy / Hoàn; biểu đồ; bảng theo page (SR1, DR, SR2, đã thu) |
| Nhân viên | Top 5 phản hồi nhanh nhất, tỉ lệ phản hồi, bảng tin nhắn được giao / phản hồi / thời gian |
| Thẻ hội thoại | Top 5 thẻ, biểu đồ tỉ lệ, bảng gắn / hủy |
| Tương tác | Khách mới vs cũ, đơn khách mới vs cũ, theo nhân viên & theo ngày (SR) |
| Quảng cáo | Chi phí & kết quả theo ngày, bảng theo ngày và theo ads (ngân sách, tin nhắn, SĐT, %SĐT, đơn, SR, doanh thu, ROAS, CPL, CPA) |
| Hiệu quả AI | % hội thoại AI tự xử lý, thời gian phản hồi, chuyển nhân viên & lý do, đơn/doanh thu do AI, chi phí AI |
| Credit | Credits đã dùng, số yêu cầu AI, trung bình, hạn mức còn lại, biểu đồ theo ngày |
| Kho hàng | Nhập / xuất / chuyển, biểu đồ xuất-nhập, phiếu gần nhất |

Mỗi báo cáo: chọn kỳ (7/14/28 ngày), lọc page/kho, **Export** CSV. ✅

### A9. Cài đặt
| Mục | Nút / thiết lập | Hiện tại |
|---|---|---|
| Thông tin | Tên shop, lĩnh vực, email, hotline, tiền tệ, múi giờ, ngôn ngữ, **Lưu thiết lập**, **Khôi phục dữ liệu mẫu** | ✅ |
| Nhân viên | Thêm/xóa nhân viên, vai trò, **mục tiêu doanh số/tháng** | ✅ (⛔ mời qua email, đăng nhập) |
| Sale | Phạm vi xem đơn / khách / hội thoại (tất cả, của mình, của mình + chưa phân); cách chia hội thoại (thủ công, người xem đầu tiên, chia đều người online, chia đều tất cả); công tắc nhân viên nhận lead | ✅ lưu cài đặt (⛔ áp phân quyền thật cần backend + đăng nhập) |
| Tin nhắn mẫu | **+ Thêm mới** (từ khóa, tên hiển thị, ảnh, nội dung, kênh áp dụng), sửa, 🗑 | ✅ |
| Gói phần mềm | Gói, thời hạn, bảng hạn mức đã dùng/còn lại, **Nâng cấp**, **Mua thêm** | 🟡 ⛔ thanh toán gói |
| Lịch làm việc | Ngày làm việc trong tuần, giờ từ–đến | ✅ |
| Thanh toán | Kết nối cổng thanh toán, COD / chuyển khoản / VietQR / thẻ, SMS Banking tự xác nhận, tài khoản nhận tiền | 🟡 ⛔ cổng thanh toán, đối soát ngân hàng |
| Trigger | **+ Tạo trigger** (sự kiện đơn/thanh toán/vận chuyển → gửi tin / gắn nhãn / báo nhân viên / tạo việc), công tắc bật, 🗑 | ✅ lưu (⛔ chạy trigger cần backend) |
| Lịch sử | Lịch sử kết nối kênh, phân sale, đổi cài đặt; tìm; Export | ✅ |
| Ref & Src | Tab Pages / Quảng cáo, ref–src từng chiến dịch, **sao chép link gắn mã** | ✅ |
| Vận chuyển | Loại địa chỉ mới/cũ, quy tắc phí ship (miễn phí, ngưỡng miễn phí, đồng giá HN-HCM, tỉnh, tối thiểu), hãng vận chuyển, ví dụ tính phí | ✅ lưu |
| Tồn kho | Tự động xuất kho khi tạo đơn, cho phép tồn âm, ngưỡng sắp hết | ✅ (đang áp dụng) |
| Tích điểm | Bật/tắt, số tiền/điểm, giá trị điểm, điểm tối thiểu, lịch sử điểm | ✅ lưu (⛔ cộng điểm tự động cần backend) |
| Tích hợp API | Danh sách tích hợp cần backend | thông tin |

---

---

## Phụ lục B. Danh sách file frontend chính
| File | Nội dung |
|---|---|
| `apps/web/src/App.jsx` | Menu & định tuyến |
| `apps/web/src/store.jsx`, `apps/web/src/seedCrm.js`, `apps/web/src/seedOps.js` | Dữ liệu & dữ liệu mẫu (thay bằng API khi có backend) |
| `apps/web/src/ai.js`, `apps/web/src/autoReply.js`, `apps/ai-server/index.js` | AI trả lời tự động |
| `apps/web/src/crm.js` | Logic CRM, cảnh báo, năng suất |
| `apps/web/src/analytics.js` | Chỉ số quảng cáo, AI, tệp khách |
| `apps/web/src/ops.js` | Logic kho, thu chi |
| `apps/web/src/components/kit.jsx` | Bảng dữ liệu, thanh bên, form dùng chung |
| `apps/web/src/pages/*` | Từng màn hình (Home, Ads, Livechat, Crm, Orders + `pos/`, Reports + `reports/`, Settings + `settings/`) |
