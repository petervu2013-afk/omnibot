// OmniBot design tokens for the mobile app (same palette as the web app).
export const colors = {
  primary: '#0b66ff',
  primaryDark: '#0052d9',
  primarySoft: '#e8f0ff',
  bg: '#f2f4f7',
  card: '#ffffff',
  text: '#1f2937',
  muted: '#6b7280',
  border: '#e5e7eb',
  red: '#e5484d',
  redSoft: '#fee2e2',
  green: '#16a34a',
  greenSoft: '#dcfce7',
  orange: '#d97706',
  orangeSoft: '#fef3c7',
  purple: '#7c3aed',
  purpleSoft: '#ede9fe',
  white: '#ffffff',
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const font = { xs: 12, sm: 13, md: 15, lg: 17, xl: 22, xxl: 28 };

// Width from which the app switches to the tablet (iPad / Android tablet) layout.
export const TABLET_MIN_WIDTH = 768;

export const STAGE_STYLE: Record<string, { label: string; color: string }> = {
  new: { label: 'Lead mới', color: '#64748b' },
  contacting: { label: 'Đang liên hệ', color: '#0ea5e9' },
  consulting: { label: 'Đang tư vấn', color: '#6366f1' },
  quoted: { label: 'Đã báo giá', color: '#f59e0b' },
  won: { label: 'Chốt đơn', color: '#16a34a' },
  nurturing: { label: 'Nuôi dưỡng', color: '#a855f7' },
  lost: { label: 'Thất bại', color: '#ef4444' },
};

export const money = (n: number) => `${Math.round(n || 0).toLocaleString('vi-VN')} ₫`;
export const compactMoney = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} tỷ` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} tr` : `${Math.round(n / 1e3)}k`);
export function timeAgo(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ`;
  return `${Math.floor(s / 86400)} ngày`;
}
