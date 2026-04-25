import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || env.VITE_API_BASE_URL || 'http://localhost:5000';

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('ethers')) return 'web3';
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (
              id.includes('socket.io-client') ||
              id.includes('engine.io-client') ||
              id.includes('engine.io-parser')
            ) {
              return 'socket';
            }
            if (id.includes('react-router') || id.includes('@remix-run')) return 'router';
            if (id.includes('react-hot-toast')) return 'notifications';
            if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
          },
        },
      },
    },
  };
});
