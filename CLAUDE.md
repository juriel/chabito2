# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Chabito2 is a multi-session WhatsApp bot (Baileys) where every conversation is answered by its own AI agent (built on `@mariozechner/pi-agent-core` / `@mariozechner/pi-ai`). Each bot instance ("botSession") has its own prompts, manager list, conversation histories and scheduled tasks stored under `data/<botSession>/`, and its own WhatsApp credentials under `auth_info_baileys/<uuid>/`. A separate `browser-service` (Playwright + Fastify) provides a `browse_url` capability to agents. A Lit/Vite frontend provides a dashboard for creating bots and pairing them via QR.

Bun is the official runtime; Node/`tsx` also works for debugging. All source uses ESM with explicit `.ts` extensions in relative imports (via `verbatimModuleSyntax`/`rewriteRelativeImportExtensions`).

## Commands

Install:
```bash
bun install
cd browser-service && bun install && bunx playwright install chromium && cd ..
```

Run everything (browser-service + main bot, official way):
```bash
bun run start:all          # scripts/start-all.sh: starts browser-service in bg, then the bot in fg
```

Run pieces individually (debugging):
```bash
bun run start:bun          # main bot only (builds frontend first); browse_url tool will fail without browser-service
bun run dev                # main bot via `tsx watch` (Node, no Bun)
bun run start               # main bot via `tsx` (Node, no Bun)
cd browser-service && bun run dev   # browser-service only, via tsx
cd frontend && bun run dev          # frontend dev server (Vite) only
```

Build:
```bash
bun run build               # tsc → dist/ (type-check + emit)
bun run build:bun           # bun build → dist/ (bundle for Bun)
bun run frontend:build      # builds frontend/dist (served by the Express app)
bun run build:css           # postcss public/css/styles.css → public/css/output.css
```

Type-check only (no test suite exists in this repo):
```bash
tsc --noEmit
```

There are no automated tests configured (`package.json` has no `test` script, no `test/` directory).

Change the agent WS port if 8081 is taken:
```bash
AGENT_WS_PORT=8082 AGENT_WS_URL=ws://127.0.0.1:8082 bun run start:all
```

## Architecture

### Two runtime processes

1. **Main bot** (`src/index.ts` → `ChabitoHttpServer`): Express API on `PORT` (default 3000), serving the frontend (`frontend/dist`, static) and the dashboard, plus an internal WebSocket "agent server" on `AGENT_WS_PORT` (default 8081).
2. **browser-service** (`browser-service/src/index.ts`): standalone Fastify server on `BROWSER_SERVICE_PORT` (default 3001) that drives headless Chromium via Playwright and converts page HTML to Markdown (Turndown) for the `browse_url` tool. It is a separate Bun/Node process — the main bot talks to it over HTTP (`BROWSER_SERVICE_URL`), not via imports.

### Message flow

```
WhatsApp Mobile
   │ (Baileys events)
   ▼
WhatsappSocketEnvelope (src/whatsapp/whatsapp-socket-envelope.ts)
   - one instance per botSession/uuid, holds the Baileys WASocket
   - resolves the real phone-number JID from @lid contacts (remoteJidAlt / signalRepository.lidMapping)
   - is itself a WebSocket *client* of the agent server (reconnects every 2s if dropped)
   │ ChatMessageDto over ws://AGENT_WS_HOST:AGENT_WS_PORT
   ▼
AgentWebSocketServer (src/agent/agent-ws-server.ts)
   - keyed by conversationKey = `${bot_session}:${peer_id}`
   - tracks which sockets are listening per conversation, broadcasts agent replies back
   ▼
AgentsMap.getOrCreate(conversationKey) (src/agent/agents-map.ts, singleton)
   - splits conversationKey into botSession/peerId
   - ChatbotInitialSetup.getAgentType() decides "manager" vs "client"
   - picks ManagerAgentFactory or ClientAgentFactory, builds an AiAgent (async, restores history)
   ▼
AiAgent.receive(dto) (src/agent/ai-agent.ts)
   - manager-only slash commands (/reset, /help) short-circuit before hitting the LLM
   - reloads the prompt from disk and re-applies WildcardProcessor on every message (so
     prompt edits and {{CURRENT_TIME}}-style placeholders always reflect current state)
   - queues messages per-agent (this.processingQueue) so concurrent messages to the same
     conversation are processed strictly in order
   - persists full message history back to disk after each completed turn
   ▼
response broadcast back through AgentWebSocketServer → WhatsappSocketEnvelope.sendMessage
```

### Agent construction: factory + centralized config

`src/agent/agent-configs.ts` defines `AGENT_CONFIGS` (`manager` | `client`), each with a default system prompt (loaded from `template/prompt-admin.txt` / `template/prompt.txt`) and a list of `toolIds`. `src/agent/factories/{manager,client}-agent-factory.ts` each keep a local `toolId → factory function` registry and build an `AiAgentBuilder` (`src/agent/ai-agent.ts`) accordingly:

- **manager** tools: `change-prompt`, `get-prompt`, `send-whatsapp`, `add-manager`/`remove-manager`/`list-managers`, `manage-tasks`, `add-rag-knowledge`/`query-rag-knowledge`, `get-time`, `browse-url`.
- **client** tools: `notify-manager`, `get-time`.

To add a new agent type: add it to `AgentType`/`AGENT_CONFIGS`, add a new factory under `src/agent/factories/`, wire detection logic into `ChatbotInitialSetup.getAgentType`, and branch on it in `AgentsMap.createAgent`. All tools live in `src/agent/tools/` and are re-exported from `src/agent/tools/index.ts`.

`AiAgentBuilder` also owns LLM provider/model resolution: it reads `PI_PROVIDER`/`PI_MODEL`, normalizes friendly aliases (`gemini`→`google`, `grok`→`xai`), resolves API keys per-provider (with OpenRouter/OpenAI-compatible fallbacks), and supports a "custom model" escape hatch for OpenAI-compatible endpoints not in `pi-ai`'s built-in registry (needed for arbitrary OpenRouter model ids).

### Manager detection & multi-tenant config (`ChatbotInitialSetup`, `src/agent/chatbot-initial-setup.ts`)

Per botSession, `data/<botSession>/` holds `prompt.txt` (client), `prompt-admin.txt` (manager), and `managers.txt` (one JID + optional name per line). Rules:
- Files are auto-created from `template/*.txt` on first use (`ensureFiles`).
- **If `managers.txt` is empty, the first person to message the bot is auto-promoted to manager.** This is a deliberate onboarding mechanic, not a bug.
- JID matching normalizes phone numbers (strips `@...`/`:...` device suffixes) before comparing, since WhatsApp may present the same contact as a `@lid` or `@s.whatsapp.net` JID depending on context.

### Wildcards (`src/agent/wildcard-processor.ts`)

System prompts support `{{peer_id}}`, `{{peer_nickname}}`, `{{CURRENT_DATE}}`, `{{CURRENT_TIME}}`, `{{CURRENT_WEEK_DAY}}`, `{{YESTERDAY}}`, `{{TOMORROW}}`, `{{MANAGER_NAME}}`. Processed fresh on every inbound message in `AiAgent.receive`, not cached.

### Task scheduler (`src/agent/task-scheduler.ts`)

One `TaskScheduler` per `botSession` (`WhatsappSocketEnvelope` owns it, starts it in `connect()`), polling every 60s for due tasks (`once` = ISO date, `recurring` = crontab via `cron-parser`) persisted to `data/<botSession>/tasks.json`. Due tasks run a small **coordinator/executor multi-agent loop**: a coordinator agent (manager-type, no real task) issues instructions to an executor agent (manager-type, has tools) for up to 5 turns or until the coordinator emits the literal marker `TAREA_COMPLETADA`. Managed via the `manage-tasks` tool.

### Persistence layer (`src/persistence/`)

Generic file-backed store abstraction, not WhatsApp/agent-specific:
- `StorageProvider` — read/write/delete/list by key (`FileStorageProvider` = one file per key under `<baseDir>/<namespace>/`).
- `JsonStore<TData, TEntity>` — typed JSON persistence with an optional domain-entity deserializer; `loadRaw`/`saveRaw` bypass the entity layer for plain DTOs (used by conversation history and tasks).
- `TextStore` — plain `.txt` files (prompts, managers list).
- `StoreFactory` — convenience constructors (`.file()`, `.rawFile()`, `.text()`).

`ConversationStore` (`src/agent/conversation-store.ts`) and `TaskScheduler`'s task store both sit on top of this via `StoreFactory.rawFile`/`.text`.

### RAG knowledge (`src/knowledge/rag_memory.ts`)

`RAGMemory` is a **Bun-only** (`bun:sqlite`) per-bot knowledge store: each entry is a markdown file under `data/<botSession>/knowledge/<uuid>.md` (frontmatter-style `uuid`/`summary`/`keywords` header + `---` + content) with embeddings (OpenAI-compatible `/embeddings` endpoint, falling back to a deterministic local hash-based embedding if no key/endpoint is reachable) cached in `data/<botSession>/db.sqlite`. Exposed to manager agents via `add-rag-knowledge`/`query-rag-knowledge` tools. Because it needs `bun:sqlite`, this path requires running under Bun, not plain Node/`tsx`.

### browse_url tool (`src/agent/tools/browse-url-tool.ts`)

Manager-only tool that POSTs `{ url, waitForSelector?, extraWaitMs? }` to `browser-service`'s `/browse` endpoint and returns Markdown. Fails gracefully (returns an error message to the LLM) if `browser-service` isn't running — it does not crash the main process.

### HTTP API (`src/webserver/chabito_http_server.ts`)

Session lifecycle for WhatsApp bots, in-memory `Map<uuid, WhatsappSocketEnvelope>` (`activeSessions`), separate from `AgentsMap`'s per-conversation agents:
- `POST /api/sessions/:uuid` — create + connect a session
- `GET /api/sessions` — list with connection state
- `GET /api/sessions/:uuid/qr` | `/qr/text` | `/qr/png` — pairing QR in JSON/ASCII/PNG
- `GET /api/sessions/:uuid/status` — connection state detail
- `POST /api/sessions/:uuid/send` — send a message directly (bypasses the agent)
- `POST /api/sessions/:uuid/cleanup` | `POST /api/sessions/cleanup` — prune old Baileys pre-keys (`src/whatsapp/baileys-storage-cleanup.ts`); also runs automatically on boot for all sessions

On startup, `bootstrapStoredSessions()` scans `auth_info_baileys/` and reconnects every existing session automatically — no QR re-scan needed across restarts.

### Connection state machine (`WhatsappSocketEnvelope`)

`undefined → connecting → open | close`. On `close`, auto-reconnects after 2s unless the disconnect reason is `loggedOut` (Baileys `DisconnectReason`), in which case the auth folder is deleted and the session must be recreated/rescanned from the UI.

## Conventions

- ESM only; relative imports use explicit `.ts` extensions (enforced by `tsconfig.json`'s `verbatimModuleSyntax`/`allowImportingTsExtensions`/`rewriteRelativeImportExtensions`).
- TypeScript strict mode plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — index/optional access needs real narrowing, not `!`.
- Console log prefixes identify subsystem: `[API]`, `[AGENT-WS]`, `[BAILEYS]`, `[TOOL]`, `[AI-AGENT]`, `[SETUP]`, `[SCHEDULER]`, `[CLEANUP]`, `[BOOT]`, `[UI]`.
- `data/`, `auth_info_baileys/`, and `frontend/dist/` are gitignored; rebuild the frontend (`bun run frontend:build`) after frontend changes since the server serves the compiled `dist`, not source.
- `PI_PROVIDER` accepts friendly aliases: `gemini`→`google`, `grok`→`xai`; the corresponding API key env var is `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` / `ANTHROPIC_API_KEY` / `XAI_API_KEY`.
- `ARCHITECTURE_AGENTS.md`, `SPEC.md`, `ANTIGRAVITY.md`, and `.codex/spec.md` are older/partially-duplicated architecture notes generated at different points in the project's history; several are stale (e.g. they don't mention the RAG, task-scheduler, or browse-url tools) — prefer this file and the source when they disagree.
