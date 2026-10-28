// Minimal RESP server answering PING/INFO/etc. Used ONLY when no real Redis is available (local Windows without
// Docker): it proves the API's Redis wiring end-to-end over a real socket. CI runs the same tests against redis:8.
import { createServer, type Server, type Socket } from 'node:net';

function reply(command: string): string {
  switch (command) {
    case 'PING':
      return '+PONG\r\n';
    case 'INFO': {
      const body = 'redis_version:fake\r\nloading:0\r\n';
      return `$${Buffer.byteLength(body)}\r\n${body}\r\n`;
    }
    case 'QUIT':
      return '+OK\r\n';
    default:
      return '+OK\r\n';
  }
}

/** Extracts command names from RESP arrays (*N\r\n$len\r\nCMD\r\n...). */
function commands(chunk: string): string[] {
  const out: string[] = [];
  const re = /\*(\d+)\r\n\$\d+\r\n([^\r]+)\r\n/g;
  for (let m = re.exec(chunk); m; m = re.exec(chunk)) out.push(m[2]!.toUpperCase());
  return out;
}

export async function startFakeRedis(): Promise<{ url: string; close: () => Promise<void> }> {
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (data) => {
      for (const cmd of commands(data.toString('utf8'))) socket.write(reply(cmd));
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
