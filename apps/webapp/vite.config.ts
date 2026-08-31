import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 4402,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.TESTRON_DEV_SERVER_URL ?? 'http://127.0.0.1:4400',
        changeOrigin: true,
      },
      '/slang': {
        target: process.env.TESTRON_DEV_SLANG_URL ?? 'https://app.testron.dev',
        changeOrigin: true,
      },
    },
  },
});
