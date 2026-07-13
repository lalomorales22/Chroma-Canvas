import path from 'path';
import os from 'node:os';
import { defineConfig, loadEnv, Plugin, ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * Phone-as-camera support: a tiny same-origin WebRTC signaling relay
 * (`/phone-signal` WebSocket rooms) plus `/phone-lan-ip` so the QR code can
 * point at this machine's LAN address. Same-origin means it works over the
 * HTTPS dev mode (`npm run dev:phone`) with no mixed-content issues.
 */
const phoneSignaling = (): Plugin => {
  const attach = (server: ViteDevServer) => {
    const rooms = new Map<string, Set<WebSocket>>();
    const wss = new WebSocketServer({ noServer: true });

    server.httpServer?.on('upgrade', (req, socket, head) => {
      if (!req.url?.startsWith('/phone-signal')) return;
      wss.handleUpgrade(req, socket, head, (ws) => {
        const url = new URL(req.url as string, 'http://localhost');
        const session = url.searchParams.get('session') ?? 'default';
        if (!rooms.has(session)) rooms.set(session, new Set());
        const room = rooms.get(session) as Set<WebSocket>;
        room.add(ws);

        ws.on('message', (data, isBinary) => {
          room.forEach((peer) => {
            if (peer !== ws && peer.readyState === WebSocket.OPEN) {
              peer.send(data, { binary: isBinary });
            }
          });
        });
        ws.on('close', () => {
          room.delete(ws);
          if (room.size === 0) rooms.delete(session);
        });
      });
    });

    server.middlewares.use('/phone-lan-ip', (_req, res) => {
      let ip = '';
      for (const list of Object.values(os.networkInterfaces())) {
        for (const net of list ?? []) {
          if (net.family === 'IPv4' && !net.internal) {
            ip = net.address;
            break;
          }
        }
        if (ip) break;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ip }));
    });
  };

  return { name: 'chromacanvas-phone-signaling', configureServer: attach };
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const useHttps = !!(env.CHROMA_HTTPS || process.env.CHROMA_HTTPS);
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      tailwindcss(),
      phoneSignaling(),
      // `npm run dev:phone` — phones require HTTPS for camera access.
      ...(useHttps ? [basicSsl()] : []),
    ],
    define: {
      // Optional build-time key. The app also reads a runtime key from
      // localStorage (Settings modal), which takes precedence.
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY ?? ''),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY ?? ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
  };
});
