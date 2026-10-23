# OmniBot – Chatbot AI quản trị kênh online

Ứng dụng quản trị đa kênh (Facebook, Zalo OA, Instagram, Website, TikTok). **AI tự động trả lời khách hoàn toàn** dựa trên danh mục sản phẩm, và có báo cáo hiệu quả AI cùng báo cáo chiến dịch quảng cáo Facebook / Google / TikTok.

## Chạy

```bash
npm install
cp .env.example .env      # điền ANTHROPIC_API_KEY để dùng Claude
npm run server            # API AI – cổng 8787
npm run dev               # giao diện – http://localhost:5173
```

Không có API key (hoặc không chạy server) thì app vẫn tự động trả lời bằng **AI nội bộ**: khớp danh mục theo từ khóa, thu SĐT, địa chỉ và tự tạo đơn.

## AI tự động trả lời (phần cốt lõi)

Luồng xử lý mỗi khi khách nhắn (`src/autoReply.js` → `src/ai.js` → `server/index.js`):

1. Lấy toàn bộ lịch sử hội thoại, hồ sơ khách và chiến dịch quảng cáo mà khách đến từ đó.
2. Gửi lên Claude (`claude-opus-5-5`) kèm **toàn bộ danh mục sản phẩm** (tên, giá, tồn kho, mô tả) và **kiến thức shop**. Phần danh mục được cache prompt nên chi phí thấp.
3. Claude trả về JSON có cấu trúc: câu trả lời, sản phẩm gợi ý, SĐT/địa chỉ đã thu được, đơn hàng (khi khách đã xác nhận) và có cần chuyển nhân viên không.
4. App gửi câu trả lời kèm thẻ sản phẩm, lưu SĐT và địa chỉ vào hồ sơ khách, **tự tạo đơn** (gắn với chiến dịch nguồn) và chuyển cho nhân viên khi khách phàn nàn hoặc hỏi ngoài dữ liệu.

Cài đặt ở **Tổng quan → Cấu hình bot**: chọn chế độ AI hay kịch bản từ khóa, cách AI xưng hô, giọng điệu, kiến thức shop, có cho AI tự tạo đơn không. Có khung chat để thử ngay.

**Quét danh mục** (Đơn hàng → Sản phẩm): dán link website cho AI đọc, hoặc dán bảng từ Excel/Google Sheets.

**Thử trong Livechat**: bấm **+** để giả lập một khách mới nhắn tin, hoặc mở một hội thoại và bật **Nhập vai khách** để tự chat như khách hàng.

## Quản trị dữ liệu và báo cáo

| Trang | Nội dung |
|---|---|
| Báo cáo → Hiệu quả AI | % hội thoại AI tự xử lý trọn vẹn, số tin AI trả lời, thời gian phản hồi, tỉ lệ chuyển nhân viên kèm lý do, SĐT và đơn do AI chốt, doanh thu từ AI, chi phí AI/đơn, sản phẩm được gợi ý nhiều nhất |
| Quảng cáo → Hiệu quả chiến dịch | Chi tiêu, ROAS, CPA, chi phí/hội thoại, chi phí/SĐT, phễu chuyển đổi (hiển thị → click → hội thoại → SĐT → đơn), so sánh FB/Google/TikTok, bảng chiến dịch, xuất CSV |
| Quảng cáo → Gợi ý tối ưu | Gợi ý theo quy tắc (cắt ngân sách, tăng ngân sách, đổi creative, lệch số liệu đo lường) và nút **Phân tích bằng AI** (Claude) |
| Quảng cáo → Tệp khách & chuyển đổi | Xuất tệp khách đã mua, khách có SĐT chưa mua, khách VIP theo định dạng Meta Custom Audience / Google Customer Match / TikTok (có mã hóa SHA-256); xuất chuyển đổi offline (đơn thật) để nền tảng quảng cáo tối ưu theo người mua thật |
| Quảng cáo → Nhập dữ liệu & theo dõi | Dán báo cáo theo ngày từ Ads Manager; link theo dõi (`ref` cho Messenger, `utm_campaign` cho website) để gắn hội thoại và đơn hàng vào đúng chiến dịch |

## Kiến trúc

- Frontend: React 18 + Vite, dữ liệu lưu trong `localStorage` (`src/store.jsx`). Cài đặt → "Khôi phục dữ liệu mẫu" để làm mới.
- Backend: Express + `@anthropic-ai/sdk` (`server/index.js`) với các API `/api/ai/reply`, `/api/ai/scan-catalog`, `/api/ai/campaign-insights`, `/api/health`. Có bật fallback phía server khi model từ chối trả lời (`AI_FALLBACKS=off` để tắt).
- Phân tích số liệu: `src/analytics.js`. Đọc CSV: `src/csv.js`.
- Lịch sử hội thoại, quảng cáo và đơn hàng có sẵn khi mới cài là **dữ liệu mẫu** để minh họa báo cáo.

## Để chạy với kênh thật

1. Webhook Facebook Messenger / Zalo OA / Instagram → gọi `/api/ai/reply` → gửi câu trả lời qua Send API của từng nền tảng.
2. Lưu dữ liệu vào database thay cho `localStorage`.
3. Lấy số liệu quảng cáo tự động qua Meta Marketing API, Google Ads API, TikTok Business API thay vì dán CSV.
