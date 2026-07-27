```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    mode: 'production',
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  css: {
    preprocessorOptions: {
      tailwindcss: {
        config: 'tailwind.config.js',
      },
    },
  },
});
```