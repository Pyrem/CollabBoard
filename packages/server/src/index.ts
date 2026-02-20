import 'dotenv/config';
import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { WebSocketServer } from 'ws';
import { onAuthenticate } from './hocuspocus/onAuthenticate.js';
import { onChange } from './hocuspocus/onChange.js';
import { loadDocument, storeDocument, setupDatabase } from './hocuspocus/database.js';
import { aiCommandHandler } from './ai/handler.js';
import { authMiddleware } from './middleware/auth.js';
import { createRateLimiter } from './middleware/rateLimit.js';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';

// Initialize SQLite database for persistence
const db = setupDatabase();

// Hocuspocus server (no standalone listen — we handle upgrades manually)
const hocuspocus = Server.configure({
  onAuthenticate,
  onChange,
  extensions: [
    new Database({
      fetch: async ({ documentName }) => loadDocument(db, documentName),
      store: async ({ documentName, state }) => {
        storeDocument(db, documentName, state);
      },
    }),
  ],
});

// Express HTTP server (AI endpoint + health)
const app: ReturnType<typeof express> = express();

app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/ai-command', createRateLimiter(), authMiddleware, aiCommandHandler(hocuspocus));

// Single HTTP server for both Express and WebSocket
const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade — hand off to Hocuspocus
httpServer.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    hocuspocus.handleConnection(ws, request);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[SERVER] HTTP + WebSocket running on port ${String(PORT)}`);
});

export { hocuspocus, app };
