import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

function normalizeBackendTarget(raw: string | undefined): string {
  if (!raw) return 'http://127.0.0.1:3000';
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return `http://127.0.0.1:${trimmed}`;
  return `http://${trimmed}`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = normalizeBackendTarget(env.VITE_API_TARGET || env.API_TARGET || env.API_PORT || '3000');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd()),
      },
    },
    css: {
      postcss: './postcss.config.js',
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('motion')) return 'vendor-motion';
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
              return 'vendor';
            }
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: Number(env.VITE_PORT || 5173),
      strictPort: false,
      hmr: env.DISABLE_HMR !== 'true',
      watch: env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
        '/ws': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
  };
});
