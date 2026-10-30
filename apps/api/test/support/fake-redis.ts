// Tiny in-memory Redis (RESP2) for e2e tests on machines without Redis (local Windows without Docker).
// Implements only the commands the API uses: HELLO (refused → RESP2), PING, INFO, GET, SET [EX|PX], DEL, INCR, EXPIRE, PEXPIRE, TTL, PTTL.
// CI runs the same tests against a real redis:8 container.
import { createServer, type Server, type Socket } from 'node:net';

type Entry = { value: string; expiresAt?: number };

const ok = '+OK\r\n';
const int = (n: number) => `:${n}\r\n`;
const bulk = (s: string | null) => (s === null ? '$-1\r\n' : `$${Buffer.byteLength(s)}\r\n${s}\r\n`);
const err = (m: string) => `-ERR ${m}\r\n`;

/** Parses as many complete RESP arrays as the buffer holds; returns them and the unconsumed rest. */
function parse(buf: string): { cmds: string[][]; rest: string } {
  const cmds: string[][] = [];
  let i = 0;
  outer: while (i < buf.length) {
    if (buf[i] !== '*') break;
    let nl = buf.indexOf('\r\n', i);
    if (nl < 0) break;
    const n = Number(buf.slice(i + 1, nl));
    let p = nl + 2;
    const args: string[] = [];
    for (let k = 0; k < n; k++) {
      nl = buf.indexOf('\r\n', p);
      if (nl < 0) break outer;
      const len = Number(buf.slice(p + 1, nl));
      if (buf.length < nl + 2 + len + 2) break outer;
      args.push(buf.slice(nl + 2, nl + 2 + len));
      p = nl + 2 + len + 2;
    }
    cmds.push(args);
    i = p;
  }
  return { cmds, rest: buf.slice(i) };
}

export async function startFakeRedis(): Promise<{ url: string; close: () => Promise<void> }> {
  const store = new Map<string, Entry>();
  const live = (k: string) => {
    const e = store.get(k);
    if (e?.expiresAt !== undefined && e.expiresAt <= Date.now()) store.delete(k);
    return store.get(k);
  };

  function exec([name = '', ...a]: string[]): string {
    switch (name.toUpperCase()) {
      case 'HELLO':
        // ioredis 6 opens with HELLO 3; answer like a RESP2-only server so it falls back to RESP2.
        return err("unknown command 'HELLO'");
      case 'PING':
        return '+PONG\r\n';
      case 'INFO':
        return bulk('redis_version:fake\r\nloading:0\r\n');
      case 'GET':
        return bulk(live(a[0]!)?.value ?? null);
      case 'SET': {
        const [k, v, opt, n] = a;
        const ttl = opt?.toUpperCase() === 'EX' ? Number(n) * 1000 : opt?.toUpperCase() === 'PX' ? Number(n) : undefined;
        store.set(k!, { value: v!, expiresAt: ttl === undefined ? undefined : Date.now() + ttl });
        return ok;
      }
      case 'DEL':
        return int(a.filter((k) => live(k) && store.delete(k)).length);
      case 'INCR': {
        const e = live(a[0]!);
        const next = Number(e?.value ?? 0) + 1;
        store.set(a[0]!, { value: String(next), expiresAt: e?.expiresAt });
        return int(next);
      }
      case 'EXPIRE':
      case 'PEXPIRE': {
        const e = live(a[0]!);
        if (!e) return int(0);
        e.expiresAt = Date.now() + Number(a[1]) * (name.toUpperCase() === 'EXPIRE' ? 1000 : 1);
        return int(1);
      }
      case 'TTL':
      case 'PTTL': {
        const e = live(a[0]!);
        if (!e) return int(-2);
        if (e.expiresAt === undefined) return int(-1);
        const ms = e.expiresAt - Date.now();
        return int(name.toUpperCase() === 'TTL' ? Math.ceil(ms / 1000) : ms);
      }
      case 'FLUSHALL':
        store.clear();
        return ok;
      case 'QUIT':
      case 'CLIENT':
      case 'SELECT':
        return ok;
      default:
        return err(`fake-redis: lệnh ${name} chưa hỗ trợ`);
    }
  }

  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    let pending = '';
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (data) => {
      const { cmds, rest } = parse(pending + data.toString('utf8'));
      pending = rest;
      for (const cmd of cmds) socket.write(exec(cmd));
    });
    socket.on('error', () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `redis://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
