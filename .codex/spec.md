# Codex Context - Chabito2

## Quick Facts

- **Project Type**: WhatsApp Bot with AI Agents (multi-session)
- **Language**: TypeScript (ESM, strict mode)
- **WhatsApp**: Baileys v7.0.0-rc.9
- **AI Framework**: @mariozechner/pi-agent-core + @mariozechner/pi-ai
- **API Server**: Express 5.x (port 3000)
- **WebSocket Server**: ws (port 8081)
- **Auth**: File-based (auth_info_baileys/{uuid}/)

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point |
| `src/chabito_ws.ts` | Initializes HTTP server |
| `src/webserver/chabito_http_server.ts` | Express API server + session management |
| `src/whatsapp/whatsapp-socket-envelope.ts` | WhatsAppSocketEnvelope class (Baileys) |
| `src/agent/agent-ws-server.ts` | WebSocket server for AI messages |
| `src/agent/ai-agent.ts` | AiAgent wrapper for PI Agent |
| `src/agent/agents-map.ts` | Singleton map of AI agents |
| `src/agent/whatsapp-tool.ts` | Tool for sending WhatsApp messages |
| `src/dto/chat-message-dto.ts` | Message DTO interface |

## Architecture

```
WhatsApp Mobile → WhatsAppSocketEnvelope → AgentWebSocketServer (8081) → AiAgent (per conversation)
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | HTTP API server port |
| AGENT_WS_HOST | 0.0.0.0 | WebSocket server host |
| AGENT_WS_PORT | 8081 | WebSocket server port |
| AGENT_WS_URL | ws://127.0.0.1:8081 | WebSocket URL for internal client |
| PI_PROVIDER | openai | AI provider (openai, anthropic, google, groq, xai) |
| PI_MODEL | gpt-5-mini | AI model |
| AGENT_SYSTEM_PROMPT | "Eres Chabito..." | System prompt for AI |
| XAI_API_KEY | - | API key for xAI provider |
| OPENAI_API_KEY | - | API key for OpenAI |
| ANTHROPIC_API_KEY | - | API key for Anthropic |
| GEMINI_API_KEY | - | API key for Google |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | HTML documentation page |
| POST | `/api/sessions/:uuid` | Create new WhatsApp session |
| GET | `/api/sessions` | List active sessions |
| GET | `/api/sessions/:uuid/qr` | Session state + QR |
| GET | `/api/sessions/:uuid/qr/text` | QR as ASCII |
| GET | `/api/sessions/:uuid/qr/png` | QR as PNG image |
| GET | `/api/sessions/:uuid/status` | Session status |
| POST | `/api/sessions/:uuid/send` | Send WhatsApp message |

## ESM Imports

```typescript
// TypeScript files use .js extension for local imports
import './chabito_ws.js';
import { WhatsappSocketEnvelope } from './whatsapp/whatsapp-socket-envelope.js';
```

## Connection States

- `'undefined'` → Initial state
- `'connecting'` → Attempting connection
- `'open'` → Authenticated, ready
- `'close'` → Disconnected (auto-reconnect except loggedOut)

## Key Patterns

### Session Creation
```typescript
const bot = new WhatsappSocketEnvelope(uuid);
bot.connect().catch(console.error);
activeSessions.set(uuid, bot);
```

### Message Flow (WhatsApp → AI)
1. WhatsAppSocketEnvelope receives message via Baileys
2. Converts to ChatMessageDto with direction: 'in'
3. Sends to AgentWebSocketServer via WebSocket
4. AiAgent processes with LLM
5. Response sent back as ChatMessageDto direction: 'out'
6. WhatsAppSocketEnvelope sends via Baileys

### Tool Execution (AI → WhatsApp)
1. AiAgent decides to call send_whatsapp_message tool
2. Tool makes HTTP POST to /api/sessions/:uuid/send
3. WhatsAppSocketEnvelope.sendTextMessage() sends via Baileys

## Code Guidelines

1. All async functions must use `try/catch`
2. Use `@hapi/boom` for HTTP errors
3. Always update `connectionState` on connection updates
4. Call `saveCreds()` on `creds.update` event
5. Don't commit `auth_info_baileys/` directory
6. Use prefix logs: `[API]`, `[AGENT-WS]`, `[BAILEYS]`, `[TOOL]`, `[AI-AGENT]`