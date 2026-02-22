import 'dotenv/config';
import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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

app.use(helmet());
app.use(
  cors({
    origin: CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
  const checks: { sqlite: string; hocuspocus: string } = {
    sqlite: 'ok',
    hocuspocus: 'ok',
  };

  // Verify SQLite is readable
  try {
    db.prepare('SELECT count(*) AS cnt FROM documents').get();
  } catch (err: unknown) {
    checks.sqlite = err instanceof Error ? err.message : 'unreachable';
  }

  // Verify Hocuspocus is running
  const documentCount = hocuspocus.getDocumentsCount();
  const connectionCount = hocuspocus.getConnectionsCount();

  const healthy = checks.sqlite === 'ok' && checks.hocuspocus === 'ok';

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'unhealthy',
    checks,
    documentCount,
    connectionCount,
  });
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

// ── Graceful shutdown ────────────────────────────────────────────────
let shuttingDown = false;

/**
 * Gracefully shut down the server in response to a POSIX signal.
 *
 * Execution order:
 * 1. Stop the HTTP server from accepting new connections.
 * 2. Close the raw WebSocket server.
 * 3. Call `hocuspocus.destroy()` which flushes all in-memory Yjs documents
 *    to SQLite via the `Database` extension and disconnects clients.
 * 4. Close the SQLite database handle.
 * 5. Exit with code 0.
 *
 * A 10-second hard-exit timer (via `setTimeout(...).unref()`) guarantees the
 * process terminates even if a step hangs.
 *
 * The `shuttingDown` flag ensures the function is idempotent — only the
 * first signal triggers the sequence.
 *
 * @param signal - Name of the signal that triggered the shutdown
 *   (e.g. `"SIGTERM"`, `"SIGINT"`).
 */
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[SERVER] ${signal} received — shutting down`);

  // 1. Stop accepting new connections
  httpServer.close(() => {
    console.log('[SERVER] HTTP server closed');
  });
  wss.close();

  // 2. Flush Hocuspocus documents to SQLite and disconnect clients
  hocuspocus
    .destroy()
    .then(() => {
      console.log('[SERVER] Hocuspocus documents flushed');
    })
    .catch((err: unknown) => {
      console.error('[SERVER] Hocuspocus destroy error', err);
    })
    .finally(() => {
      // 3. Close SQLite connection
      db.close();
      console.log('[SERVER] Database closed');
      process.exit(0);
    });

  // Hard exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('[SERVER] Forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { hocuspocus, app };
