import express from 'express';
import cors from 'cors';
import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { onAuthenticate } from './hocuspocus/onAuthenticate.js';
import { loadDocument, storeDocument, setupDatabase } from './hocuspocus/database.js';
import { aiCommandHandler } from './ai/handler.js';
import { authMiddleware } from './middleware/auth.js';
import { createRateLimiter } from './middleware/rateLimit.js';

const HOCUSPOCUS_PORT = parseInt(process.env['HOCUSPOCUS_PORT'] ?? '1234', 10);
const EXPRESS_PORT = parseInt(process.env['EXPRESS_PORT'] ?? '3001', 10);
const CORS_ORIGIN = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';

// Initialize SQLite database for persistence
const db = setupDatabase();

// Hocuspocus WebSocket server
const hocuspocus = Server.configure({
  port: HOCUSPOCUS_PORT,
  onAuthenticate,
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

// Start servers
void hocuspocus.listen().then(() => {
  console.log(`[HOCUS] Hocuspocus running on port ${String(HOCUSPOCUS_PORT)}`);
});

app.listen(EXPRESS_PORT, () => {
  console.log(`[EXPRESS] API server running on port ${String(EXPRESS_PORT)}`);
});

export { hocuspocus, app };
