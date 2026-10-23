# Theo dõi hồ sơ & tài khoản bên ngoài (Bước 0)

Các thủ tục này **do chủ dự án thực hiện** (cần thông tin pháp nhân, đăng nhập tài khoản doanh nghiệp) và thường mất từ vài ngày đến vài tuần để được duyệt, nên cần nộp ngay. Cập nhật cột Trạng thái khi có tiến triển.

| # | Hạng mục | Cần cho bước | Việc cần làm | Ngày nộp | Dự kiến duyệt | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | GitHub (tổ chức + repo private) | 0 | Tạo repo, mời thành viên, bật bảo vệ nhánh `main` | | | ⬜ Chưa làm |
| 2 | Máy chủ staging (VPS) + tên miền `staging.<ten-mien>` | 1 | Thuê VPS (≥ 2 vCPU, 4 GB RAM), trỏ DNS | | | ⬜ Chưa làm |
| 3 | Meta Business: xác minh doanh nghiệp | 5, 14 | Business Manager → Bảo mật → Xác minh doanh nghiệp (giấy phép kinh doanh) | | | ⬜ Chưa làm |
| 4 | Meta App + App Review | 5, 14 | Tạo App, xin quyền `pages_messaging`, `pages_manage_metadata`, `instagram_manage_messages`, `ads_read`; quay video demo | | | ⬜ Chưa làm |
| 5 | Zalo Official Account + ứng dụng Zalo for Developers | 5 | Đăng ký OA doanh nghiệp, tạo app, lấy App ID/Secret | | | ⬜ Chưa làm |
| 6 | Zalo ZNS | 15 | Đăng ký ZNS, nạp tiền, gửi mẫu tin chờ duyệt | | | ⬜ Chưa làm |
| 7 | TikTok Shop Partner / TikTok for Business | 5, 14 | Đăng ký Partner Center, tạo app | | | ⬜ Chưa làm |
| 8 | GHN, GHTK (tài khoản API) | 10 | Đăng ký tài khoản shop, lấy token sandbox & production | | | ⬜ Chưa làm |
| 9 | Dịch vụ báo biến động số dư (VietQR) | 11 | Chọn dịch vụ (VD: Casso, SePay hoặc API ngân hàng), liên kết tài khoản nhận tiền | | | ⬜ Chưa làm |
| 10 | Anthropic (Claude API) | 7 | Tạo tài khoản tổ chức, API key, đặt hạn mức chi phí | | | ⬜ Chưa làm |
| 11 | Dịch vụ gửi email (SES / Mailgun / SMTP) | 2 | Xác minh tên miền gửi (SPF, DKIM) | | | ⬜ Chưa làm |
| 12 | Mã D-U-N-S | 18 | Đăng ký miễn phí qua Apple/D&B (cần cho tài khoản tổ chức) | | | ⬜ Chưa làm |
| 13 | Apple Developer Program (tổ chức) | 17, 18 | Đăng ký bằng D-U-N-S, phí năm | | | ⬜ Chưa làm |
| 14 | Google Play Console (tổ chức) | 17, 18 | Đăng ký, xác minh danh tính tổ chức | | | ⬜ Chưa làm |

**Cổng chuyển Bước 0** yêu cầu các mục 1–11 ít nhất ở trạng thái "Đã nộp" kèm ngày dự kiến duyệt.
