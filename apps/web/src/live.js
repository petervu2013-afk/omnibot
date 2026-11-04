// Realtime connection to /live: new messages, conversation changes and typing for the shop that is open. The server
// filters events by the member's data scope, so a Sale only receives conversations they may see.
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken, refreshSession } from './api.js';

const BASE = import.meta.env?.VITE_API_URL ?? '';

/** handlers: { message, conversation, typing, revoked } – read through a ref, so they may change every render. */
export function useLive(shopId, handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const [state, setState] = useState('connecting'); // connecting | online | offline | denied
  const socketRef = useRef(null);

  useEffect(() => {
    if (!shopId) return undefined;
    let refreshed = 0;
    // auth as a function: every (re)connect presents the current access token, which rotates every few minutes.
    const socket = io(`${BASE}/live`, { auth: (cb) => cb({ token: getAccessToken(), shopId }), transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => { refreshed = 0; setState('online'); });
    socket.on('disconnect', () => setState('offline'));
    socket.on('connect_error', async (err) => {
      if (err.message === 'FORBIDDEN') return setState('denied');
      if (err.message !== 'UNAUTHORIZED' || refreshed++ > 2) return setState('offline');
      // Middleware errors stop automatic reconnection: renew the token and try again.
      try {
        await refreshSession();
        socket.connect();
      } catch {
        setState('offline');
      }
    });
    socket.on('message', (p) => ref.current.message?.(p));
    socket.on('conversation', (p) => ref.current.conversation?.(p));
    socket.on('typing', (p) => ref.current.typing?.(p));
    socket.on('revoked', () => { setState('denied'); ref.current.revoked?.(); });
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [shopId]);

  const emitTyping = (conversationId) => socketRef.current?.emit('typing', { conversationId });
  return { state, emitTyping };
}
