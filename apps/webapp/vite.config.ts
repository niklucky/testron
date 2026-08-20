import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4402,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.TESTRON_DEV_SERVER_URL ?? 'http://127.0.0.1:4400',
        changeOrigin: true,
      },
    },
  },
});
