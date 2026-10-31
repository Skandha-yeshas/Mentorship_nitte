import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Development and production use the same authenticated Express API.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:5001', changeOrigin: true } }
  }
});

