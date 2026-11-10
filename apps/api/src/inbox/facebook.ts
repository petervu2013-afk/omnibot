// CH-01 Facebook Messenger: webhook signature check, payload parsing and the Send API call.
// Built against Meta's documented formats and tested with sample payloads; not yet run against a real Page
// (needs the Meta app from docs/EXTERNAL_ACCOUNTS.md).
import { createHmac } from 'node:crypto';
import { safeEqual } from '../auth/tokens.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

/** Meta signs the raw request body: X-Hub-Signature-256: sha256=<hex HMAC-SHA256 with the app secret>. */
export function validSignature(appSecret: string, rawBody: Buffer | undefined, header: string | undefined): boolean {
  if (!rawBody || !header?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  return safeEqual(expected, header);
}

export interface FacebookInbound {
  pageId: string;
  senderId: string;
  mid: string;
  text?: string;
  attachments: { type: string; url: string }[];
  at: Date;
  /** ADS-08: m.me link ?ref= and/or the ad clicked (Click-to-Messenger). */
  referral?: { ref?: string; adId?: string };
  /** True for a referral without a customer message (an existing chat reopened through a link or ad). */
  referralOnly?: boolean;
}

interface Referral {
  ref?: string;
  ad_id?: string;
  source?: string;
  type?: string;
}

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined);
function referralOf(r: Referral | undefined): FacebookInbound['referral'] {
  const ref = clean(r?.ref);
  const adId = clean(r?.ad_id);
  return ref || adId ? { ...(ref ? { ref } : {}), ...(adId ? { adId } : {}) } : undefined;
}

interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string; payload?: { url?: string } }[]; referral?: Referral };
  referral?: Referral; // messaging_referrals: link or ad opened in an existing conversation
  postback?: { referral?: Referral }; // "Get started" pressed after opening a link or ad
}

/**
 * Customer messages and referrals from a `page` webhook body. Echoes of our own sends, reads and deliveries are
 * skipped. A referral without a message gets a stable id (sender + time) so a redelivery is still dropped.
 */
export function parseWebhook(body: unknown): FacebookInbound[] {
  const b = body as { object?: string; entry?: { id?: string; messaging?: MessagingEvent[] }[] };
  if (b?.object !== 'page' || !Array.isArray(b.entry)) return [];
  const out: FacebookInbound[] = [];
  for (const entry of b.entry) {
    for (const ev of entry.messaging ?? []) {
      const m = ev.message;
      const standalone = referralOf(ev.referral ?? ev.postback?.referral);
      if (!m && standalone && ev.sender?.id && entry.id) {
        out.push({
          pageId: entry.id,
          senderId: ev.sender.id,
          mid: `ref:${ev.sender.id}:${ev.timestamp ?? 0}`,
          attachments: [],
          at: ev.timestamp ? new Date(ev.timestamp) : new Date(),
          referral: standalone,
          referralOnly: true,
        });
        continue;
      }
      if (!m?.mid || m.is_echo || !ev.sender?.id || !entry.id) continue;
      out.push({
        pageId: entry.id,
        senderId: ev.sender.id,
        mid: m.mid,
        text: m.text,
        attachments: (m.attachments ?? []).filter((a) => a.payload?.url).map((a) => ({ type: a.type ?? 'file', url: a.payload!.url! })),
        at: ev.timestamp ? new Date(ev.timestamp) : new Date(),
        referral: referralOf(m.referral),
      });
    }
  }
  return out;
}

/** Sends a text reply. Outside Messenger's 24-hour window Meta rejects it unless a message tag applies (Step 15). */
export async function sendText(pageToken: string, recipientId: string, text: string, fetcher: typeof fetch = fetch): Promise<void> {
  const res = await fetcher(`${GRAPH}/me/messages?access_token=${encodeURIComponent(pageToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: { text } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
    throw new Error(`Facebook ${res.status}: ${err?.error?.message ?? 'lỗi không rõ'}`);
  }
}
