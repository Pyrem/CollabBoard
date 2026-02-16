# CollabBoard — Claude Code Project Context

## Project Overview
Real-time collaborative whiteboard (like Miro) with an AI agent that manipulates the board through natural language. Solo developer, 7-day sprint. MVP hard gate at 24 hours.

## Guiding Principle
A simple, solid, multiplayer whiteboard with a working AI agent beats any feature-rich board with broken collaboration. **Sync first, features second.**

---

## MVP Requirements (24-Hour Hard Gate)

**All items required to pass. No AI agent yet — multiplayer infrastructure is the priority.**

- [ ] Infinite board with pan/zoom
- [ ] Sticky notes with editable text
- [ ] At least one shape type (rectangle, circle, or line)
- [ ] Create, move, and edit objects
- [ ] Real-time sync between 2+ users
- [ ] Multiplayer cursors with name labels
- [ ] Presence awareness (who's online)
- [ ] User authentication
- [ ] Deployed and publicly accessible

**Do not work on AI agent, connectors, frames, multi-select, or any post-MVP feature until every item above is checked off and verified in two separate browser windows on the deployed URL.**

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Real-time sync | Yjs + Hocuspocus |
| Canvas rendering | Fabric.js (imperative, managed via React refs) |
| Frontend | React + TypeScript + Vite |
| Auth | Firebase Auth (Google OAuth + email/password) |
| Persistence | SQLite on Fly.io persistent volume (via Hocuspocus) |
| AI model | Claude Sonnet 4.5 with tool use |
| AI backend | Express endpoint, in-process with Hocuspocus (direct Yjs doc access) |
| Frontend hosting | Vercel (auto-deploy on push to main) |
| Backend hosting | Fly.io (always-on container) |
| Package manager | pnpm with workspaces |
| Testing | Vitest |
| Linting | ESLint (strict-type-checked) + Prettier |

---

## Monorepo Structure

```
collabboard/
├── packages/
│   ├── client/                    # React SPA (Vite)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Board/         # Fabric.js canvas, pan/zoom, object rendering
│   │   │   │   ├── Objects/       # StickyNote, Rectangle, Circle, Line, Frame, Connector
│   │   │   │   ├── Toolbar/       # Tool selection, color picker, shape picker
│   │   │   │   ├── Cursors/       # Remote cursor rendering overlay
│   │   │   │   ├── Presence/      # Online users panel
│   │   │   │   ├── AIAgent/       # Chat input, command history, loading states
│   │   │   │   └── Auth/          # Login page, auth guards
│   │   │   ├── hooks/
│   │   │   │   ├── useYjs.ts      # Yjs document connection and sync
│   │   │   │   ├── useBoard.ts    # Board object CRUD (Yjs <-> Fabric binding)
│   │   │   │   ├── useCursors.ts  # Cursor position broadcasting/receiving
│   │   │   │   ├── usePresence.ts # Online users awareness
│   │   │   │   ├── useAI.ts       # AI command submission
│   │   │   │   └── useAuth.ts     # Firebase auth state
│   │   │   ├── lib/
│   │   │   │   ├── firebase.ts    # Firebase app + auth init
│   │   │   │   ├── fabric.ts      # Fabric.js canvas setup helpers
│   │   │   │   └── yjs.ts         # Yjs provider configuration
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   └── router.tsx
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── server/                    # Node.js backend
│   │   ├── src/
│   │   │   ├── hocuspocus/
│   │   │   │   ├── server.ts      # Hocuspocus instance config
│   │   │   │   ├── onAuthenticate.ts  # Firebase JWT verification
│   │   │   │   ├── onLoadDocument.ts  # Document load from SQLite
│   │   │   │   └── onChange.ts    # Optional validation, object count limits
│   │   │   ├── ai/
│   │   │   │   ├── handler.ts     # Express route: receive command -> call Claude -> execute
│   │   │   │   ├── tools.ts      # Tool definitions (createStickyNote, moveObject, etc.)
│   │   │   │   ├── executor.ts   # Executes Claude's tool calls against Yjs document
│   │   │   │   └── prompts.ts    # System prompt and tool schemas for Claude
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts       # Firebase JWT verification for HTTP routes
│   │   │   │   ├── rateLimit.ts  # express-rate-limit (10 req/min/IP)
│   │   │   │   └── cors.ts      # CORS locked to Vercel domain
│   │   │   └── index.ts          # Entry: starts Hocuspocus + Express
│   │   ├── Dockerfile
│   │   ├── fly.toml
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── shared/                    # Shared TypeScript types
│       ├── src/
│       │   ├── types.ts           # BoardObject, StickyNote, Shape, etc.
│       │   └── constants.ts       # Colors, sizes, limits
│       ├── tsconfig.json
│       └── package.json
│
├── package.json                   # Root workspace: "workspaces": ["packages/*"]
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .eslintrc.json
├── .prettierrc
├── .gitignore
├── .env.example
├── CLAUDE.md                      # This file
└── README.md
```

---

## Shared Type Definitions

Use discriminated unions for all board objects. The `type` field is the discriminant. Always handle all cases exhaustively.

```typescript
// packages/shared/src/types.ts

interface BaseBoardObject {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  lastModifiedBy: string;
  lastModifiedAt: number;
}

interface StickyNote extends BaseBoardObject {
  type: 'sticky';
  text: string;
  color: string; // hex
}

interface RectangleShape extends BaseBoardObject {
  type: 'rectangle';
  fill: string;
  stroke: string;
}

interface CircleShape extends BaseBoardObject {
  type: 'circle';
  fill: string;
  stroke: string;
}

interface LineShape extends BaseBoardObject {
  type: 'line';
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

interface Connector extends BaseBoardObject {
  type: 'connector';
  fromId: string;
  toId: string;
  stroke: string;
  style: 'straight' | 'curved';
}

interface Frame extends BaseBoardObject {
  type: 'frame';
  title: string;
  fill: string;
}

interface TextElement extends BaseBoardObject {
  type: 'text';
  text: string;
  fontSize: number;
  fill: string;
}

type BoardObject = StickyNote | RectangleShape | CircleShape | LineShape | Connector | Frame | TextElement;
```

---

## Architecture Decisions

### Real-time sync: Yjs + Hocuspocus
- Yjs CRDTs handle conflict resolution at the data structure level (merging, not last-write-wins)
- Hocuspocus provides WebSocket server, room management, auth hooks, and SQLite persistence
- Cursors and presence use Yjs awareness protocol
- Board objects stored in `Y.Map('objects')` — each object keyed by its UUID

### Canvas: Fabric.js (imperative, not React components)
- Fabric canvas managed via React ref + useEffect
- Sync layer binds Yjs <-> Fabric:
  - Local changes: Fabric events -> update Yjs map
  - Remote changes: Yjs observer -> update Fabric objects
  - Use object IDs to map between systems
  - **Prevent infinite loops**: use a flag to distinguish local vs remote updates
- Built-in: selection, multi-select, transforms (resize/rotate), text editing (IText), serialization

### AI agent: "just another user"
- Express POST /api/ai-command in same process as Hocuspocus
- Handler calls Claude Sonnet 4.5 with tool schemas
- Claude returns tool_use blocks
- Executor writes directly to the Yjs document in memory
- All connected clients see AI results via normal Yjs sync — no special handling
- This means AI-generated objects are automatically collaborative

### Auth flow
1. Client: Firebase Auth (Google sign-in or email/password)
2. Client gets Firebase ID token
3. Client connects to Hocuspocus WebSocket with token
4. Hocuspocus onAuthenticate verifies token via Firebase Admin SDK
5. User display name + photo from Firebase used for cursor labels and presence

---

## AI Tool Schemas (Minimum)

```
createStickyNote(text, x, y, color)
createShape(type, x, y, width, height, color)
createFrame(title, x, y, width, height)
createConnector(fromId, toId, style)
moveObject(objectId, x, y)
resizeObject(objectId, width, height)
updateText(objectId, newText)
changeColor(objectId, color)
getBoardState()  // returns current board objects for AI context
```

The AI must support 6+ distinct command types across creation, manipulation, layout, and complex template commands.

---

## Build Priority Order

**Follow this order strictly. Do not skip ahead.**

1. **Project scaffolding** — monorepo, pnpm workspaces, tsconfig, eslint, prettier (1.5 hrs)
2. **Hocuspocus + Yjs setup** — server with SQLite persistence, deploy to Fly.io (3 hrs)
3. **Firebase Auth** — Google sign-in on client, JWT verification in Hocuspocus onAuthenticate (1.5 hrs)
4. **Cursor sync** — Yjs awareness protocol, render remote cursors with names (2 hrs)
5. **Presence** — online users panel using awareness state (0.5 hrs)
6. **Infinite canvas** — Fabric.js with pan (drag) and zoom (scroll wheel) (2 hrs)
7. **Sticky notes** — create, edit text, change color, synced via Yjs (2.5 hrs)
8. **Rectangle shape** — create, move, resize, synced via Yjs (1.5 hrs)
9. **Deploy + verify MVP** — Vercel frontend, Fly.io backend, test with 2 browsers (1 hr)
   **--- MVP GATE (24 hrs) ---**
10. **More shapes** — circles, lines (2 hrs)
11. **Frames** — grouping areas with titles (2 hrs)
12. **Connectors** — lines/arrows between objects (2 hrs)
13. **Transforms** — resize handles, rotation via Fabric Transformer (2 hrs)
14. **Selection** — multi-select (shift-click, drag-to-select), delete, duplicate, copy/paste (3 hrs)
15. **AI agent — basic** — 6+ command types, single-step (4 hrs)
16. **AI agent — complex** — multi-step templates (SWOT, journey map, retro board) (4 hrs)
17. **Polish** — error handling, loading states, UI cleanup (2 hrs)
18. **Docs + video** — README, demo video (3-5 min), social post (2 hrs)

---

## Naming Conventions

- **Files**: PascalCase for components (`StickyNote.tsx`), camelCase for everything else (`useBoard.ts`, `handler.ts`)
- **Components**: PascalCase, one per file, props interface named `{Component}Props`
- **Hooks**: camelCase with `use` prefix
- **Types/Interfaces**: PascalCase (`BoardObject`, `StickyNote`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_OBJECTS_PER_BOARD`, `DEFAULT_STICKY_COLOR`)
- **Event handlers**: `handle` prefix internally, `on` prefix in props

---

## Code Rules

- **No `any`** — use `unknown` + type guards
- **Exhaustive switch** on `BoardObject.type` — compiler must catch missing cases
- **Explicit return types** on hooks and utility functions
- **react-hooks/exhaustive-deps** is an error, not a warning
- **Format on save** with Prettier
- **Never mock Yjs in tests** — use real in-memory Y.Doc instances

---

## Critical Warnings

- **Always authenticate WebSocket connections** — Hocuspocus onAuthenticate with Firebase JWT verification. Never leave it open.
- **Never commit API keys** — use .env files locally, Fly.io secrets in production
- **Prevent Yjs <-> Fabric infinite loops** — use a `isRemoteUpdate` flag when applying remote changes to Fabric objects
- **Throttle cursor updates** — don't broadcast every mousemove pixel. Throttle to ~30ms intervals.
- **Test with 2+ browsers continuously** — every feature, every time. If sync breaks, fix it before moving on.

---

## Environment Variables

```
# Client (.env)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_HOCUSPOCUS_URL=          # ws://localhost:1234 in dev, wss://your-app.fly.dev in prod
VITE_AI_ENDPOINT_URL=         # http://localhost:3001/api/ai-command in dev

# Server (.env)
ANTHROPIC_API_KEY=
FIREBASE_SERVICE_ACCOUNT=     # JSON string or path to service account file
HOCUSPOCUS_PORT=1234
EXPRESS_PORT=3001
CORS_ORIGIN=                  # https://your-app.vercel.app in prod
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Frame rate | 60 FPS during pan/zoom/manipulation |
| Object sync latency | <100ms |
| Cursor sync latency | <50ms |
| Object capacity | 500+ without drops |
| Concurrent users | 5+ without degradation |
| AI response | <2 seconds for single-step commands |
