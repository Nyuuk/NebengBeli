import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isE2EMode = env.VITE_E2E_MODE === 'true' || process.env.VITE_E2E_MODE === 'true';

  return {
    plugins: [
      react(),
      isE2EMode && {
        name: 'e2e-preload-plugin',
        transformIndexHtml() {
          return [
            {
              tag: 'script',
              children: 'window.__E2E_MODE__ = true;',
              injectTo: 'head-prepend',
            },
          ];
        },
      },
    ].filter(Boolean),
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          secure: false,
        },
        '/healthz': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
        '/readyz': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});

