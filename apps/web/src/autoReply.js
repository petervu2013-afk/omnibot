import { useStore, uid } from './store.jsx';
import { aiReply, applyAiResult } from './ai.js';
import { botReply, extractPhone } from './bot.js';
import { intakeLead } from './crm.js';

const tick = () => new Promise((r) => setTimeout(r, 30));

// Conversations with an AI reply in progress. Customers often send several messages in a row;
// those arriving mid-reply are answered once, afterwards, with the full history.
const inFlight = new Map(); // convId -> { pending: boolean }
const lastCustomerAt = (conv) => conv.messages.filter((m) => m.from === 'customer').at(-1)?.at || 0;

// Returns respond(convId): answers the latest customer message according to the channel's bot mode.
export function useAutoReply() {
  const { update, getState, setTyping } = useStore();

  const respond = async (convId, followUp = false) => {
    await tick(); // let the customer message land in state first
    if (inFlight.has(convId)) { inFlight.get(convId).pending = true; return null; }
    const state = getState();
    const conv = state.conversations.find((v) => v.id === convId);
    const channel = conv && state.channels.find((c) => c.id === conv.channelId);
    if (!conv || !conv.botActive || !channel?.bot.enabled) return null;
    if (!followUp && conv.messages.at(-1)?.from !== 'customer') return null;

    if (channel.bot.mode !== 'ai') {
      const isFirst = conv.messages.filter((m) => m.from !== 'customer').length === 0;
      const r = botReply(channel.bot, conv.messages.at(-1).text, { isFirstMessage: isFirst });
      if (r) update((d) => { d.conversations.find((v) => v.id === convId).messages.push({ id: uid(), from: 'bot', text: r.text, buttons: r.buttons, at: Date.now() }); });
      return null;
    }

    const answeredUpTo = lastCustomerAt(conv);
    const flight = { pending: false };
    inFlight.set(convId, flight);
    setTyping((t) => ({ ...t, [convId]: true }));
    let outcome = null;
    try {
      const result = await aiReply({ state, conv });
      update((d) => { outcome = applyAiResult(d, convId, result); });
      await tick();
    } finally {
      inFlight.delete(convId);
      setTyping((t) => { const n = { ...t }; delete n[convId]; return n; });
    }
    const latest = getState().conversations.find((v) => v.id === convId);
    if (flight.pending && latest && lastCustomerAt(latest) > answeredUpTo) return (await respond(convId, true)) || outcome;
    return outcome;
  };

  // Append a customer message (from a webhook or the simulator) and trigger the auto reply.
  const receive = (convId, text) => {
    update((d) => {
      const conv = d.conversations.find((v) => v.id === convId);
      conv.messages.push({ id: uid(), from: 'customer', text, at: Date.now() });
      conv.status = 'open';
      const phone = extractPhone(text);
      const cust = d.customers.find((u) => u.id === conv.customerId);
      if (phone && cust && !cust.phone) { cust.phone = phone; intakeLead(d, cust.id); }
      // A parked (nurturing) customer writing again is a buying signal: put them back in front of their sale.
      if (cust?.stage === 'nurturing' && cust.ownerId && !d.tasks.some((t) => t.customerId === cust.id && !t.done && t.kind === 'reactivate')) {
        d.tasks.push({ id: uid(), customerId: cust.id, staffId: cust.ownerId, type: 'call', kind: 'reactivate', due: Date.now() + d.process.slaMinutes * 60000, title: 'Khách nuôi dưỡng vừa nhắn lại – gọi ngay', done: false });
      }
    });
    return respond(convId);
  };

  return { respond, receive };
}
