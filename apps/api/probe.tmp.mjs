import { createServer } from 'node:net';
import { Redis } from 'ioredis';
const srv = createServer((s) =>
  s.on('data', (d) => {
    console.log('RECV', JSON.stringify(d.toString()));
    s.write('+PONG\r\n');
  }),
);
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const c = new Redis(`redis://127.0.0.1:${srv.address().port}`, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
c.on('error', (e) => console.log('ERR', e.message));
try {
  await c.connect();
  console.log('ping', await c.ping());
} catch (e) {
  console.log('fail', e.message);
}
c.disconnect();
srv.close();
