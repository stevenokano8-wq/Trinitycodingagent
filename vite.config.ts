import { defineConfig } from 'vite';
import reactPlugin from '@vitejs/plugin-react';

const react = typeof reactPlugin === 'function' ? reactPlugin : (reactPlugin as any)?.default || reactPlugin;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
