# Antigravity Context - Chabito2

## Project Overview

Chabito2 es un bot de WhatsApp multi-sesión con agentes de IA. Cada chatbot tiene configuración personalizada (prompts, managers) y guarda el historial de conversaciones en disco.

## Stack

- Node.js 18+ / Bun
- TypeScript (ESM, strict mode)
- Baileys v7.0.0-rc.9 (WhatsApp)
- Express 5.x (REST API)
- ws v8.18.3 (WebSocket)
- @mariozechner/pi-agent-core v0.64.0 (AI)
- @mariozechner/pi-ai v0.64.0 (LLM)

## File Map

```
chabito2/
├── index.ts                    # Entry point
├── src/
│   ├── index.ts              # Entry point
│   ├── chabito_ws.ts        # Initializes server
│   ├── webserver/
│   │   └── chabito_http_server.ts   # Express (3000)
│   ├── whatsapp/
│   │   ├── whatsapp-socket-envelope.ts   # Baileys wrapper
│   │   └── baileys-storage-cleanup.ts    # Cleanup old auth
│   ├── agent/
│   │   ├── agent-ws-server.ts      # WS server (8081)
│   │   ├── ai-agent.ts           # AiAgent wrapper
│   │   ├── agents-map.ts         # Agents singleton
│   │   ├── whatsapp-tool.ts     # Send message tool
│   │   ├── chatbot-initial-setup.ts  # Bot config
│   │   └── conversation-store.ts # Chat history
│   ├── persistence/
│   │   ├── index.ts             # Public API
│   │   ├── types.ts            # Interfaces
│   │   ├── file-storage-provider.ts
│   │   ├── json-store.ts
│   │   └── text-store.ts
│   └── dto/
│       └── chat-message-dto.ts
├── data/                         # Bot data (gitignored)
│   └── <botSession>/
│       ├── prompt.txt
│       ├── prompt-admin.txt
│       ├── managers.txt
│       └── conversation-<peerId>.json
└── auth_info_baileys/            # WA credentials (gitignored)
```

## Architecture

```
┌─────────────────────┐
│  WhatsApp Mobile  │
└────────┬──────────┘
         │
         ▼
┌─────────────────────┐
│ WhatsAppSocket      │ ─── Baileys
│   Envelope        │
└────────┬──────────┘
         │
         ▼
┌─────────────────────┐
│ ChatbotInitialSetup │ ─── Load prompts, managers
└────────┬──────────┘
         │
         ▼
┌─────────────────────┐
│ AgentWebSocket    │ ─── Route to per-conversation agent
│   Server (8081)  │
└────────┬──────────┘
         │
         ▼
┌─────────────────────┐
│      AiAgent    │ ─── PI Agent Core + LLM
└────────┬──────────┘
         │
         ▼
┌─────────────────────┐
│ConversationStore │ ─── Save/load history
└─────────────────────┘
```

## Persistence Layer

### JsonStore<TData, TEntity>
```typescript
const store = new JsonStore(provider, deserializer);
await store.save('id', entity);
const result = await store.load('id');
```

### TextStore
```typescript
const store = new TextStore('./data', 'botSession');
await store.save('prompt', 'Eres un asistente...');
const result = await store.load('prompt');
```

### FileStorageProvider
```typescript
const provider = new FileStorageProvider('./data', 'conversations');
// data/conversations/<key>.json
```

## Bot Configuration

### ChatbotInitialSetup
```typescript
// Auto-create files if not exist
await ChatbotInitialSetup.ensureFiles(botSession);

// First user becomes manager automatically
const prompt = await ChatbotInitialSetup.getPromptForPeer(botSession, peerId);
// → prompt.txt or prompt-admin.txt
```

### Default Files
- `prompt.txt`: "Eres el asistente de una tienda..."
- `prompt-admin.txt`: "Eres el Asistente Administrativo de Chabito..."
- `managers.txt`: List of admin JIDs (one per line)

## Session Flow

1. `POST /api/sessions/:uuid` → Creates `WhatsappSocketEnvelope`
2. `bot.connect()` → Connects via Baileys
3. QR code generated for pairing
4. User scans QR
5. Messages flow through WebSocket to AI
6. Agent loads prompt based on peer (manager vs public)
7. Chat history saved to `data/{botSession}/conversation-{peerId}.json`

## Core Concepts

### Active Sessions
```typescript
const activeSessions = new Map<string, WhatsappSocketEnvelope>();
```

### Agents Map (singleton)
```typescript
const agents = AgentsMap.getInstance();
const agent = await agents.getOrCreate(conversationKey); // "botSession:peerId"
```

### Conversation Store
```typescript
const store = createConversationStore(botSession);
// → data/<botSession>/conversation-<peerId>.json
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions/:uuid` | Create session |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/:uuid/qr` | QR JSON |
| GET | `/api/sessions/:uuid/qr/png` | QR PNG |
| GET | `/api/sessions/:uuid/status` | Status |
| POST | `/api/sessions/:uuid/send` | Send message |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | HTTP port |
| AGENT_WS_PORT | 8081 | WS port |
| PI_PROVIDER | openai | AI provider |
| PI_MODEL | gpt-5-mini | AI model |
| AGENT_SYSTEM_PROMPT | "Eres Chabito..." | Default prompt |

## State Machine

```
undefined → connecting → open | close
On close (loggedOut) → Stop
On close (other) → Auto-reconnect after 2s
```

## Important Notes

1. **Data Storage**: `data/{botSession}/` is gitignored
2. **Auth Storage**: `auth_info_baileys/` is gitignored
3. **First user**: Auto-promoted to manager
4. **Per-conversation**: Each peerId gets its own agent and history
5. **Multi-session**: Multiple WhatsApp bots simultaneously
6. **ESM Only**: All imports use `.js` extension