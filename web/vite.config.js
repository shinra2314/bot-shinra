import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Дев-сервер проксирует /api на встроенный в бота Express (порт 3000).
// Прод: vite build → dist/, который раздаёт сам Express.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000'
    }
  }
});
