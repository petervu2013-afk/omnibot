import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseWebhook, sendText, validSignature } from './facebook.js';

const SECRET = 'app-secret-0123456789abcdef';
const body = Buffer.from('{"object":"page","entry":[]}');
const sig = (b: Buffer, s = SECRET) => `sha256=${createHmac('sha256', s).update(b).digest('hex')}`;

describe('validSignature', () => {
  it('accepts the HMAC of the exact raw bytes only', () => {
    expect(validSignature(SECRET, body, sig(body))).toBe(true);
    expect(validSignature(SECRET, body, sig(body, 'other-secret-xxxxxxxx'))).toBe(false);
    expect(validSignature(SECRET, Buffer.from(`${body.toString()} `), sig(body))).toBe(false);
    expect(validSignature(SECRET, body, sig(body).replace('sha256=', 'sha1='))).toBe(false);
    expect(validSignature(SECRET, body, undefined)).toBe(false);
    expect(validSignature(SECRET, undefined, sig(body))).toBe(false);
  });
});

describe('parseWebhook', () => {
  it('keeps customer messages with attachments and skips echoes, receipts and other objects', () => {
    const out = parseWebhook({
      object: 'page',
      entry: [
        {
          id: 'PAGE1',
          messaging: [
            { sender: { id: 'U1' }, timestamp: 1_700_000_000_000, message: { mid: 'm1', text: 'Chào shop' } },
            { sender: { id: 'U1' }, message: { mid: 'm2', attachments: [{ type: 'image', payload: { url: 'https://cdn.example/a.jpg' } }, { type: 'fallback' }] } },
            { sender: { id: 'PAGE1' }, message: { mid: 'm3', text: 'echo', is_echo: true } },
            { sender: { id: 'U1' }, read: { watermark: 1 } },
            { sender: { id: 'U1' }, delivery: { mids: ['m1'] } },
          ],
        },
      ],
    });
    expect(out).toEqual([
      { pageId: 'PAGE1', senderId: 'U1', mid: 'm1', text: 'Chào shop', attachments: [], at: new Date(1_700_000_000_000) },
      expect.objectContaining({ mid: 'm2', attachments: [{ type: 'image', url: 'https://cdn.example/a.jpg' }] }),
    ]);
    expect(parseWebhook({ object: 'instagram', entry: [] })).toEqual([]);
    expect(parseWebhook(null)).toEqual([]);
    expect(parseWebhook({ object: 'page', entry: 'x' })).toEqual([]);
  });
});

describe('sendText', () => {
  it('surfaces the Graph API error message', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token' } }), { status: 400 })) as unknown as typeof fetch;
    await expect(sendText('t', 'u', 'hi', fetcher)).rejects.toThrow('Facebook 400: Invalid OAuth access token');
  });
});
