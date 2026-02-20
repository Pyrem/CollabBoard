# CollabBoard — Product Backlog

> Living document tracking all planned, in-progress, and completed work.
> Pull stories from **Ready** into **In Progress** one at a time. Update status as work lands.

---

## Sprint: MVP (24-Hour Gate)

### Completed

| ID | Story | Points | Notes |
|----|-------|--------|-------|
| MVP-001 | Project scaffolding — monorepo, pnpm workspaces, tsconfig, eslint, prettier | 3 | pnpm workspaces with client/server/shared packages |
| MVP-002 | Hocuspocus + Yjs server with SQLite persistence | 5 | WebSocket + HTTP on single port, SQLite via better-sqlite3 |
| MVP-003 | Firebase Auth — Google sign-in on client, JWT verification in Hocuspocus onAuthenticate | 3 | Firebase Admin SDK on server, onAuthenticate hook |
| MVP-004 | Cursor sync — Yjs awareness protocol, render remote cursors with names | 3 | Throttled to 30ms via CURSOR_THROTTLE_MS constant |
| MVP-005 | Presence — online users panel using awareness state | 2 | Awareness state drives user list UI |
| MVP-006 | Infinite canvas — Fabric.js with pan (drag) and zoom (scroll wheel) | 3 | Alt+drag for pan, scroll wheel for zoom |
| MVP-007 | Sticky notes — create, edit text, change color, synced via Yjs | 5 | Double-click to edit, Fabric Group recreation on remote update |
| MVP-008 | Rectangle shape — create, move, resize, synced via Yjs | 3 | Scale normalization on object:modified |
| MVP-009 | Deploy + verify MVP — Render static site (client) + Docker web service (server) | 5 | Pivoted from Fly.io/Vercel to Render. Persistent disk for SQLite. |
| MVP-010 | Fix production WebSocket URL — client was falling back to ws://localhost:1234 | 2 | .env only for shared config, .env.development for localhost defaults, smarter fallback in yjs.ts |

---

## Sprint: Post-MVP Polish & Real-Time Quality

### Completed

| ID | Story | Points | Notes |
|----|-------|--------|-------|
| RT-001 | Live object manipulation broadcast — sync move/resize/rotate to other users in real-time, not just on mouse release | 5 | Throttled object:moving/scaling handlers broadcast intermediate positions. Adaptive throttle: 50ms/100ms/200ms based on user count. Position-only sticky updates use lightweight move instead of Group recreation. object:modified still sends final authoritative state. |

### Ready (Pull Next)

### Backlog (Not Yet Refined)

| ID | Story | Points | Priority | Notes |
|----|-------|--------|----------|-------|
| SHP-001 | Circle shape — create, move, resize, synced via Yjs | 3 | P1 | Same pattern as rectangle |
| SHP-002 | Line shape — create with two endpoints, synced via Yjs | 3 | P1 | Uses x2/y2 instead of width/height |
| FRM-001 | Frames — grouping areas with titles | 5 | P2 | Visual containment, not Fabric Group |
| CON-001 | Connectors — lines/arrows between objects, update on move | 5 | P2 | Needs fromId/toId tracking, recalc on drag |
| TRN-001 | Transforms — resize handles, rotation via Fabric controls | 3 | P1 | Fabric built-in, just needs Yjs binding |
| SEL-001 | Multi-select — shift-click, drag-to-select, bulk delete/duplicate/copy-paste | 5 | P2 | Fabric activeSelection + Yjs batch updates |
| AI-001 | AI agent basic — 6+ command types, single-step tool use | 8 | P2 | Express POST /api/ai-command, Claude Sonnet 4.5, direct Yjs doc writes |
| AI-002 | AI agent complex — multi-step templates (SWOT, journey map, retro board) | 8 | P3 | Builds on AI-001, multi-turn tool use |
| PERF-001 | Fabric object index — replace linear canvas scan with Map\<string, FabricObject\> | 2 | P1 | Client-side only. findByBoardId currently scans all canvas objects O(n). With RT-001 increasing lookup frequency ~20x, this becomes relevant at 500+ objects. Maintain a Map alongside canvas add/remove. |
| POL-001 | Error handling + loading states | 3 | P2 | Connection loss recovery, optimistic UI, toast notifications |
| POL-002 | UI cleanup — toolbar polish, responsive layout | 3 | P3 | |
| DOC-001 | README, demo video, social post | 2 | P3 | 3-5 min video |

---

## Architecture Decisions Log

Decisions made during development that future work should respect.

| Date | Decision | Context | Consequences |
|------|----------|---------|--------------|
| 2026-02-18 | Render instead of Fly.io + Vercel | Simplified deployment to single platform | Server: Docker web service with persistent disk. Client: static site. Both on Render. Can migrate back to Fly.io — the server code is platform-agnostic. |
| 2026-02-18 | Single port for HTTP + WebSocket | Render free tier gives one port per service | Express and Hocuspocus share one HTTP server. WebSocket upgrade handled via `httpServer.on('upgrade')`. |
| 2026-02-18 | .env split: .env (shared) + .env.development (localhost) | Vite bakes env vars at build time; .env was gitignored so Render never saw localhost defaults | Production relies on hosting platform env vars. Dev uses .env.development. Fallback in yjs.ts warns instead of silently using localhost. |
| 2026-02-18 | Fabric Group recreation for sticky notes on remote update | Fabric LayoutManager bugs when updating Group children in place | Every remote sticky note update destroys and recreates the Group. Acceptable perf for now. |
| 2026-02-18 | object:modified only (no intermediate sync) | Initial implementation choice — simplest path | Causes "snap" behavior for remote viewers. RT-001 addresses this. |
| 2026-02-19 | Throttled intermediate sync via object:moving/scaling | RT-001 — remote users need to see smooth movement during drag | Per-object throttle ref (same pattern as cursor throttle). Adaptive rate: 50ms ≤5 users, 100ms ≤10, 200ms 11+. Sticky note position-only updates skip Group recreation by tracking _stickyText/_stickyColor on the Fabric object. object:modified still fires as final authoritative sync. |

---

## Story Point Scale

| Points | Meaning |
|--------|---------|
| 1 | Trivial — config change, one-liner |
| 2 | Small — single file, well-understood change |
| 3 | Medium — a few files, some design decisions |
| 5 | Large — cross-cutting, multiple components/hooks |
| 8 | XL — new subsystem, significant complexity |
| 13 | Epic — should be broken down further |

---

## Priorities

| Label | Meaning |
|-------|---------|
| P0 | Blocking — user-facing quality issue, fix now |
| P1 | High — needed for a complete MVP experience |
| P2 | Medium — planned feature, do after P1s |
| P3 | Low — nice to have, do if time permits |
