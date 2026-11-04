// Windows has no SIGTERM: the runner would kill the backend stack hard and leave postgres workers behind.
// So ask the stack to stop itself first (it watches for this file) and wait until it has.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STACK_DIR } from '../playwright.config.js';

export default async function teardown() {
  writeFileSync(join(STACK_DIR, 'STOP'), '');
  for (let i = 0; i < 100 && !existsSync(join(STACK_DIR, 'STOPPED')); i++) await new Promise((r) => setTimeout(r, 100));
}
