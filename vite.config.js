import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Resilient in-memory WebRTC signaling relay embedded directly into Vite dev server
const viteSignalingMap = new Map();

function webrtcSignalingPlugin() {
  return {
    name: 'vite-webrtc-signaling-relay',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // 1. POST /api/meetings/signal
        if (req.url === '/api/meetings/signal' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const signal = JSON.parse(body);
              if (signal && signal.issueId) {
                const key = signal.issueId.toUpperCase();
                if (!viteSignalingMap.has(key)) viteSignalingMap.set(key, []);
                const list = viteSignalingMap.get(key);
                list.push({ ...signal, timestamp: Date.now() });
                if (list.length > 200) list.splice(0, list.length - 200);
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        // 2. GET /api/meetings/signals/:issueId
        if (req.url && req.url.startsWith('/api/meetings/signals/') && req.method === 'GET') {
          try {
            const urlObj = new URL(req.url, 'http://localhost');
            const parts = urlObj.pathname.split('/');
            const issueId = decodeURIComponent(parts[parts.length - 1] || '').toUpperCase();
            const since = parseInt(urlObj.searchParams.get('since')) || 0;
            const list = viteSignalingMap.get(issueId) || [];
            const signals = list.filter(s => s.timestamp >= since);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ signals, now: Date.now() }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Internal signaling error' }));
          }
          return;
        }

        // 3. DELETE /api/meetings/signals/:issueId
        if (req.url && req.url.startsWith('/api/meetings/signals/') && req.method === 'DELETE') {
          const parts = req.url.split('/');
          const issueId = decodeURIComponent(parts[parts.length - 1] || '').toUpperCase();
          viteSignalingMap.delete(issueId);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
          return;
        }

        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), webrtcSignalingPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
