// ID-01: one written form per phone number and email, so the same person is recognised across channels and typing styles.

/** Mobile prefixes renumbered in 2018 (11 → 10 digits): old local prefix → new. */
const RENUMBERED: Record<string, string> = {
  '120': '70',
  '121': '79',
  '122': '77',
  '126': '76',
  '128': '78',
  '123': '83',
  '124': '84',
  '125': '85',
  '127': '81',
  '129': '82',
  '162': '32',
  '163': '33',
  '164': '34',
  '165': '35',
  '166': '36',
  '167': '37',
  '168': '38',
  '169': '39',
  '186': '56',
  '188': '58',
  '199': '59',
};

/**
 * Vietnamese phone → +84 followed by 9–10 digits; null when it is not a valid number.
 * Accepts spaces, dots, dashes, parentheses, "(0)", the 0 / 84 / +84 / 0084 prefixes and pre-2018 11-digit mobiles.
 */
export function normalizePhone(input: string): string | null {
  let digits = input
    .trim()
    .replace(/\(0\)/g, '')
    .replace(/[\s.()-]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  if (digits.startsWith('+84')) digits = digits.slice(3);
  else if (digits.startsWith('0084')) digits = digits.slice(4);
  else if (digits.startsWith('84') && digits.length >= 11) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  else if (digits.startsWith('+'))
    return null; // another country
  else return null;
  if (digits.startsWith('0')) digits = digits.slice(1); // "+84 0938…"
  if (digits.length === 10 && digits.startsWith('1')) {
    const fresh = RENUMBERED[digits.slice(0, 3)];
    if (!fresh) return null;
    digits = fresh + digits.slice(3);
  }
  return /^[1-9]\d{8,9}$/.test(digits) ? `+84${digits}` : null;
}

/** Email in one form: trimmed, lower case. Null when it does not look like an email address. */
export function normalizeEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254 ? e : null;
}
