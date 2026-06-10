import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoName = 'math-english-monster-trainer';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? `/${repoName}/` : '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT) || 5178,
  },
  preview: {
    host: '127.0.0.1',
    port: 4178,
  },
  build: {
    chunkSizeWarningLimit: 1300,
  },
});
