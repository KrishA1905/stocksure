import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    // The proxy keeps the session cookie same-origin with the page, so cookies +
    // CSRF work without cross-site cookie settings. Backend: server/ on :5000.
    server: {
      port: Number(env.VITE_PORT) || 5173,
      strictPort: true,
      proxy: { '/api': env.VITE_BACKEND_URL || 'http://localhost:5000' },
    },
  };
});
