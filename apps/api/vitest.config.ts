import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC instead of esbuild: NestJS dependency injection needs emitDecoratorMetadata.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { include: ['src/**/*.spec.ts'], environment: 'node' },
});
