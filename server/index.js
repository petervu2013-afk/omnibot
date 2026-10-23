// OmniBot API server: AI auto-reply grounded on the product catalog, catalog scanning, campaign insights.
// Run: npm run server  (reads ANTHROPIC_API_KEY from .env or the environment)
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
// Server-side refusal fallback (beta). Set AI_FALLBACKS=off to send plain requests.
const USE_FALLBACKS = process.env.AI_FALLBACKS !== 'off';
const PRICE = { input: 4 / 1e6, output: 20 / 1e6, cacheRead: 0.2 / 1e6 }; // claude-opus-5-5, USD per token

const hasCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
const client = new Anthropic();
const app = express();
app.use(express.json({ limit: '4mb' }));

// ---------- helpers ----------

async function ask({ system, messages, schema, effort = 'low', maxTokens = 4000 }) {
  const request = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    output_config: { effort, format: zodOutputFormat(schema) },
  };
  const started = Date.now();
  const response = USE_FALLBACKS
    ? await client.beta.messages.create({ ...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await client.messages.create(request);

  if (response.stop_reason === 'refusal') {
    const err = new Error('refusal');
    err.code = 'refusal';
    throw err;
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const data = schema.parse(JSON.parse(text));
  const u = response.usage;
  const cost = (u.input_tokens || 0) * PRICE.input + (u.output_tokens || 0) * PRICE.output
    + (u.cache_read_input_tokens || 0) * PRICE.cacheRead + (u.cache_creation_input_tokens || 0) * PRICE.input * 1.25;
  return {
    data,
    meta: {
      model: response.model,
      latencyMs: Date.now() - started,
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_input_tokens || 0,
      costUsd: Number(cost.toFixed(6)),
    },
  };
}

function sendError(res, err) {
  console.error('[ai]', err?.status || '', err?.message);
  const status = err instanceof Anthropic.AuthenticationError ? 401
    : err instanceof Anthropic.RateLimitError ? 429
      : err?.code === 'refusal' ? 422 : 502;
  res.status(status).json({ error: err?.message || 'AI error', code: err?.code || err?.status || 'ai_error' });
}

const money = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

function catalogText(products) {
  return products.map((p) => [
    `- id: ${p.id}`,
    `  tên: ${p.name}`,
    p.sku && `  sku: ${p.sku}`,
    p.category && `  danh mục: ${p.category}`,
    `  giá: ${money(p.price)}`,
    `  tồn kho: ${p.stock}`,
    p.description && `  mô tả: ${p.description}`,
  ].filter(Boolean).join('\n')).join('\n');
}

// ---------- AI auto-reply ----------

const ReplySchema = z.object({
  reply: z.string().describe('Tin nhắn gửi cho khách, tiếng Việt, ngắn gọn, tự nhiên như nhân viên bán hàng'),
  intent: z.enum(['greeting', 'product_question', 'price', 'shipping', 'order', 'booking', 'complaint', 'other']),
  product_ids: z.array(z.string()).describe('id sản phẩm trong danh mục được nhắc tới/gợi ý trong câu trả lời, tối đa 3'),
  quick_replies: z.array(z.string()).describe('0-3 nút gợi ý ngắn để khách bấm'),
  lead: z.object({
    name: z.string().nullable(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
  }).describe('Thông tin khách đã cung cấp trong toàn bộ hội thoại; null nếu chưa có'),
  order: z.object({
    ready: z.boolean().describe('true chỉ khi khách đã xác nhận mua, đã chọn sản phẩm và đã có SĐT + địa chỉ'),
    items: z.array(z.object({ product_id: z.string(), qty: z.number().int() })),
    note: z.string().nullable(),
  }),
  handoff: z.boolean().describe('true khi cần nhân viên: khiếu nại, yêu cầu ngoài khả năng, khách đòi gặp người thật'),
  handoff_reason: z.string().nullable(),
});

function replySystemPrompt({ shop, ai, products }) {
  return `Bạn là nhân viên tư vấn bán hàng trực tuyến của "${shop.name}" (lĩnh vực: ${shop.field}). Bạn trả lời khách trên Messenger/Zalo/Instagram thay cho shop, hoàn toàn tự động.

Mục tiêu theo thứ tự: hiểu nhu cầu → gợi ý đúng sản phẩm trong danh mục → xin số điện thoại → chốt đơn (sản phẩm, số lượng, địa chỉ).

Nguyên tắc:
- Chỉ tư vấn sản phẩm có trong DANH MỤC bên dưới, dùng đúng giá và tồn kho. Không bịa sản phẩm, giá, khuyến mãi hay chính sách không có trong dữ liệu.
- Hết hàng (tồn kho 0) thì nói rõ và gợi ý sản phẩm thay thế gần nhất.
- Mỗi tin nhắn ngắn (1-4 câu), xưng hô "${ai.persona || 'em'}" và gọi khách là "anh/chị" nếu chưa biết giới tính. Giọng điệu: ${ai.tone || 'thân thiện, chuyên nghiệp'}.
- Khi khách quan tâm một sản phẩm, nêu 1-2 điểm nổi bật + giá, rồi hỏi một câu để tiến tới bước tiếp theo.
- Khi khách muốn mua: xác nhận lại sản phẩm, số lượng, tổng tiền; xin SĐT và địa chỉ nếu còn thiếu. Chỉ đặt order.ready=true khi đã đủ thông tin và khách đã đồng ý.
${ai.handoffOnComplaint === false
    ? '- Câu hỏi ngoài dữ liệu: trả lời lịch sự rằng shop sẽ kiểm tra thêm, mời khách để lại SĐT; chỉ đặt handoff=true khi khách yêu cầu gặp nhân viên.'
    : '- Câu hỏi ngoài dữ liệu (bảo hành chi tiết, đổi trả đặc biệt...) mà KIẾN THỨC SHOP không nêu, hoặc khách phàn nàn, thì nói sẽ nhờ nhân viên hỗ trợ và đặt handoff=true.'}
${ai.autoOrder ? '' : '- Shop không cho phép AI tự tạo đơn: luôn để order.ready=false, chỉ thu thập thông tin.\n'}
KIẾN THỨC SHOP:
${ai.knowledge || '(không có)'}
Hotline: ${shop.hotline}

DANH MỤC SẢN PHẨM:
${catalogText(products)}`;
}

app.post('/api/ai/reply', async (req, res) => {
  const { shop, ai = {}, products = [], customer = {}, messages = [], campaign } = req.body || {};
  // Map chat history to alternating user/assistant turns (shop-side messages become assistant turns).
  const turns = [];
  for (const m of messages) {
    const role = m.from === 'customer' ? 'user' : 'assistant';
    const last = turns.at(-1);
    if (last && last.role === role) last.content += '\n' + m.text;
    else turns.push({ role, content: m.text });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns.at(-1).role !== 'user') return res.status(400).json({ error: 'Last message must be from the customer' });

  // Volatile per-conversation context goes after the cached catalog prompt.
  const context = [
    `Kênh: ${req.body.channelName || ''}`,
    customer.name && `Tên khách trên mạng xã hội: ${customer.name}`,
    customer.phone && `SĐT đã lưu: ${customer.phone}`,
    campaign && `Khách đến từ quảng cáo: "${campaign.name}" (${campaign.platform}). Ưu tiên sản phẩm liên quan: ${campaign.focus || 'không rõ'}`,
  ].filter(Boolean).join('\n');
  turns[0].content = `[Thông tin hội thoại]\n${context}\n[/Thông tin hội thoại]\n\n${turns[0].content}`;

  try {
    const out = await ask({
      system: [{ type: 'text', text: replySystemPrompt({ shop, ai, products }), cache_control: { type: 'ephemeral' } }],
      messages: turns,
      schema: ReplySchema,
      effort: ai.effort || 'low',
    });
    const valid = new Set(products.map((p) => p.id));
    out.data.product_ids = out.data.product_ids.filter((id) => valid.has(id)).slice(0, 3);
    out.data.order.items = out.data.order.items.filter((i) => valid.has(i.product_id) && i.qty > 0);
    res.json(out);
  } catch (err) { sendError(res, err); }
});

// ---------- catalog scan ----------

const CatalogSchema = z.object({
  products: z.array(z.object({
    name: z.string(),
    sku: z.string().nullable(),
    category: z.string().nullable(),
    price: z.number().describe('Giá bán VND, 0 nếu không rõ'),
    stock: z.number().int().nullable(),
    description: z.string().describe('Mô tả ngắn 1-2 câu: chất liệu, kích thước, điểm nổi bật'),
  })),
});

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

app.post('/api/ai/scan-catalog', async (req, res) => {
  let { url, text } = req.body || {};
  try {
    if (url) {
      if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'URL phải bắt đầu bằng http(s)://' });
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 OmniBot catalog scanner' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return res.status(400).json({ error: `Không tải được trang (${r.status})` });
      text = htmlToText(await r.text());
    }
    if (!text?.trim()) return res.status(400).json({ error: 'Không có nội dung để quét' });
    // Very large pages are split rather than truncated so no products are silently lost.
    const CHUNK = 60000;
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));
    if (chunks.length > 8) return res.status(413).json({ error: `Nội dung quá lớn (${chunks.length} phần). Hãy quét từng trang danh mục.` });

    const results = await Promise.all(chunks.map((chunk) => ask({
      system: 'Bạn trích xuất danh mục sản phẩm từ nội dung website/bảng tính của một cửa hàng Việt Nam. Chỉ lấy sản phẩm thật sự được bán, không lấy menu, bài viết hay danh mục chung. Giá quy về số VND (ví dụ "1.290.000₫" → 1290000).',
      messages: [{ role: 'user', content: `Nội dung cần quét:\n\n${chunk}` }],
      schema: CatalogSchema,
      effort: 'medium',
      maxTokens: 16000,
    })));
    const products = results.flatMap((r) => r.data.products);
    const costUsd = results.reduce((s, r) => s + r.meta.costUsd, 0);
    res.json({ products, meta: { costUsd, chunks: chunks.length } });
  } catch (err) { sendError(res, err); }
});

// ---------- campaign insights ----------

const InsightSchema = z.object({
  summary: z.string().describe('2-3 câu tổng quan hiệu quả quảng cáo'),
  actions: z.array(z.object({
    campaign_id: z.string().nullable(),
    priority: z.enum(['high', 'medium', 'low']),
    action: z.string().describe('Hành động cụ thể: tăng/giảm ngân sách, tắt, đổi nội dung, đổi tệp...'),
    reason: z.string().describe('Lý do dựa trên số liệu'),
  })),
  audience_tips: z.array(z.string()).describe('Gợi ý dùng tệp khách hàng (custom audience, lookalike, loại trừ người đã mua...)'),
});

app.post('/api/ai/campaign-insights', async (req, res) => {
  const { campaigns = [], period } = req.body || {};
  try {
    const out = await ask({
      system: 'Bạn là chuyên gia tối ưu quảng cáo Facebook, Google và TikTok cho shop bán hàng qua tin nhắn tại Việt Nam. Phân tích số liệu và đưa ra hành động cụ thể, có thể làm ngay. Ưu tiên chỉ số kinh doanh (chi phí/đơn, ROAS, tỉ lệ ra SĐT) hơn chỉ số hiển thị. Không bịa số liệu.',
      messages: [{ role: 'user', content: `Kỳ báo cáo: ${period}\nSố liệu chiến dịch (JSON):\n${JSON.stringify(campaigns, null, 1)}` }],
      schema: InsightSchema,
      effort: 'medium',
      maxTokens: 8000,
    });
    res.json(out);
  } catch (err) { sendError(res, err); }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, ai: hasCredentials, model: MODEL }));

app.listen(PORT, () => {
  console.log(`OmniBot API on http://localhost:${PORT} (AI ${hasCredentials ? 'enabled' : 'disabled: set ANTHROPIC_API_KEY'})`);
});
