// Vietnamese transactional email templates. Plain text + minimal HTML so they render in every client.

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function render(subject: string, greeting: string, lines: string[], action?: { label: string; url: string }): MailContent {
  const footer = 'Email tự động từ OmniBot. Nếu bạn không thực hiện thao tác này, hãy bỏ qua email hoặc liên hệ support@omnibot.vn.';
  const text = [greeting, '', ...lines, ...(action ? ['', `${action.label}: ${action.url}`] : []), '', footer].join('\n');
  const button = action
    ? `<p><a href="${esc(action.url)}" style="background:#0b66ff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(action.label)}</a></p><p style="color:#6b7280;font-size:12px">Hoặc mở liên kết: ${esc(action.url)}</p>`
    : '';
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937;max-width:560px">
<p>${esc(greeting)}</p>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}${button}
<hr style="border:none;border-top:1px solid #e5e7eb"><p style="color:#6b7280;font-size:12px">${esc(footer)}</p></div>`;
  return { subject, text, html };
}

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Quản trị viên', MANAGER: 'Quản lý', SALE: 'Nhân viên bán hàng', WAREHOUSE: 'Thủ kho' };

export const templates = {
  invitation: (shopName: string, role: string, url: string) =>
    render(
      `Lời mời tham gia ${shopName} trên OmniBot`,
      'Xin chào,',
      [`Bạn được mời tham gia cửa hàng "${shopName}" trên OmniBot với vai trò ${ROLE_LABEL[role] ?? role}.`, 'Lời mời có hiệu lực trong 7 ngày và chỉ dùng được 1 lần.'],
      {
        label: 'Nhận lời mời',
        url,
      },
    ),

  verifyEmail: (name: string, url: string) =>
    render(
      'Xác minh email đăng ký OmniBot',
      `Chào ${name},`,
      ['Cảm ơn bạn đã đăng ký OmniBot. Vui lòng xác minh email để tiếp tục sử dụng sau 7 ngày dùng thử.', 'Liên kết có hiệu lực trong 24 giờ và chỉ dùng được 1 lần.'],
      {
        label: 'Xác minh email',
        url,
      },
    ),

  resetPassword: (name: string, url: string) =>
    render('Đặt lại mật khẩu OmniBot', `Chào ${name},`, ['Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.', 'Liên kết có hiệu lực trong 30 phút và chỉ dùng được 1 lần.'], {
      label: 'Đặt lại mật khẩu',
      url,
    }),

  passwordChanged: (name: string) =>
    render('Mật khẩu OmniBot đã được thay đổi', `Chào ${name},`, [
      'Mật khẩu tài khoản của bạn vừa được thay đổi và các thiết bị khác đã bị đăng xuất.',
      'Nếu không phải bạn, hãy đặt lại mật khẩu ngay và liên hệ hỗ trợ.',
    ]),

  newDevice: (name: string, device: string, ip: string, at: Date) =>
    render('Đăng nhập OmniBot từ thiết bị mới', `Chào ${name},`, [
      `Tài khoản của bạn vừa đăng nhập từ thiết bị mới: ${device}.`,
      `Địa chỉ IP: ${ip} · Thời gian: ${at.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
      'Nếu không phải bạn, hãy đổi mật khẩu và đăng xuất thiết bị đó trong Cài đặt → Tài khoản & bảo mật.',
    ]),

  deletionRequested: (name: string, purgeAt: Date) =>
    render('Đã nhận yêu cầu xóa tài khoản OmniBot', `Chào ${name},`, [
      `Tài khoản của bạn sẽ bị xóa vĩnh viễn vào ngày ${purgeAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
      'Trước thời điểm đó, bạn có thể đăng nhập lại và chọn "Hủy yêu cầu xóa" để giữ tài khoản.',
    ]),
};
