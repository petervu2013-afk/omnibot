// Which permission opens each menu and settings tab (matrix: docs/PROJECT_SPEC.md 3.2). This only tidies the
// interface: the API checks every request. `null` = any signed-in member.
export const PAGE_PERMISSION = {
  home: 'dashboard.view',
  dashboard: 'bot.manage',
  templates: 'bot.manage',
  bot: 'bot.manage',
  ads: 'marketing.manage',
  livechat: 'chat.reply',
  crm: 'customer.access',
  posts: 'marketing.manage',
  orders: 'order.view',
  booking: 'customer.access',
  reports: 'report.view',
  settings: null,
};

export const SETTINGS_PERMISSION = {
  info: 'shop.view',
  security: null,
  staff: 'staff.view',
  channels: 'integration.manage',
  sale: 'shop.manage',
  replies: 'bot.manage',
  plan: 'integration.manage',
  schedule: 'shift.manage',
  payment: 'integration.manage',
  trigger: 'bot.manage',
  history: 'audit.view',
  refsrc: 'marketing.manage',
  shipping: 'shop.manage',
  inventory: 'shop.manage',
  points: 'shop.manage',
  integrations: 'integration.manage',
};

export const allowed = (can, permission) => permission === null || permission === undefined || can(permission);

export const ROLE_LABEL = { ADMIN: 'Admin', MANAGER: 'Quản lý', SALE: 'Sale', WAREHOUSE: 'Thủ kho' };
