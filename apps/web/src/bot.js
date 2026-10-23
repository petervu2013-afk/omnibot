// Simple rule-based bot engine: keyword match -> reply, else fallback.

const normalize = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();

const PHONE_RE = /(0|\+84)\d{9}\b/;

export function botReply(bot, text, { isFirstMessage = false } = {}) {
  if (!bot?.enabled) return null;
  const t = normalize(text);

  if (isFirstMessage && /^(hi|hello|chao|xin chao|alo)\b/.test(t)) {
    return { text: bot.welcome, buttons: bot.quickReplies };
  }

  const rule = bot.rules.find((r) => r.keywords.some((k) => k && t.includes(normalize(k))));
  if (rule) return { text: rule.reply, buttons: rule.buttons || [], ruleId: rule.id };

  if (bot.askPhone && PHONE_RE.test(text)) {
    return { text: 'Cảm ơn bạn đã để lại số điện thoại, nhân viên sẽ liên hệ sớm nhất!', buttons: [] };
  }
  return { text: bot.fallback, buttons: [] };
}

export const extractPhone = (text) => text.match(PHONE_RE)?.[0] || null;
