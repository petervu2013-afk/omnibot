import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// End-to-end tests against a real PostgreSQL (CI service container, or an embedded one started by global-setup).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
