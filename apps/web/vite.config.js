import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same origin in development, so the HttpOnly refresh cookie (SameSite=Strict) works as in production.
    proxy: { '/api': 'http://localhost:8787', '/v1': process.env.API_PROXY ?? 'http://localhost:3000' },
  },
});
