# Antigravity Context - Chabito2

## Project Overview

Chabito2 es un bot de WhatsApp multi-sesión con agentes de IA. Proporciona una API REST para gestionar múltiples sesiones de WhatsApp simultáneamente, donde cada sesión puede tener conversaciones que son respondidas automáticamente por un agente de IA.

## Stack

- Node.js 18+ / Bun
- TypeScript (ESM, strict mode)
- Baileys v7.0.0-rc.9 (WhatsApp Web protocol)
- Express 5.x (REST API)
- ws v8.18.3 (WebSocket server)
- @mariozechner/pi-agent-core v0.64.0 (AI Agent framework)
- @mariozechner/pi-ai v0.64.0 (LLM integration)
- qrcode (QR generation)

## File Map

```
chabito2/
├── index.ts                           # Entry point
├── chabito_ws.ts                    # Initializes HTTP server
├── src/
│   ├── index.ts                   # Entry point
│   ├── chabito_ws.ts             # Initializes server
│   ├── webserver/
│   │   └── chabito_http_server.ts  # Express API (port 3000)
│   ├── whatsapp/
│   │   └── whatsapp-socket-envelope.ts  # WhatsAppSocketEnvelope (Baileys)
│   ├── agent/
│   │   ├── agent-ws-server.ts    # WebSocket server (port 8081)
│   │   ├── ai-agent.ts           # AiAgent wrapper
│   │   ├── agents-map.ts         # Agents singleton map
│   │   └── whatsapp-tool.ts     # Tool for sending messages
│   └── dto/
│       └── chat-message-dto.ts   # ChatMessageDto interface
├── auth_info_baileys/             # Session credentials (DO NOT COMMIT)
│   └── {uuid}/
│       └── ...
└── tsconfig.json
```

## Architecture

```
┌────────────────────┐
│  WhatsApp Mobile   │
└────────┬─────────┘
         │ QR / Messages
         ▼
┌────────────────────┐
│ WhatsAppSocket    │ ─── Baileys
│   Envelope       │
└────────┬─────────┘
         │ ChatMessageDto (WebSocket)
         ▼
┌────────────────────────────┐
│  AgentWebSocketServer  │
│     (port 8081)        │
└────────┬────────────────┘
         │ per-conversation routing
         ▼
┌────────────────────┐
│    AiAgent      │ ─── PI Agent Core + LLM
└────────┬─────────┘
         │ ChatMessageDto (out)
         ▼
┌────────────────────┐
│   WhatsApp Send    │ ─── HTTP POST /send
└────────────────────┘
```

## Connection Flow

1. `POST /api/sessions/:uuid` → Creates `WhatsappSocketEnvelope`
2. `bot.connect()` → Connects to WhatsApp via Baileys
3. `connection.update` event fires with QR code
4. User scans QR with WhatsApp mobile
5. `connection.update` fires with `open` state
6. Messages flow through WebSocket to AI agent

## Message Processing

### Incoming (WhatsApp → AI)
```typescript
// In handleMessagesUpsert()
const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
if (jid && !msg.key.fromMe && text.trim()) {
    const dto = this.toChatMessageDto(msg, text, jid);
    this.sendMessageToAgentSocket(dto); // → AgentWebSocketServer
}
```

### AI Response (AI → WhatsApp)
```typescript
// Agent responds via WebSocket
// WhatsAppSocketEnvelope.sendMessage(jid, { text: response })
```

## Core Concepts

### Session Management
```typescript
const activeSessions = new Map<string, WhatsappSocketEnvelope>();
// Key: UUID string
// Value: WhatsAppSocketEnvelope instance
```

### Agent Management
```typescript
const agentsMap = AgentsMap.getInstance();
const agent = agentsMap.getOrCreate(conversationKey); // "uuid:peer_jid"
// One AiAgent per conversation
```

### Tool Execution
```typescript
const tool = createSendWhatsAppMessageTool(botSession);
// Called by AI agent when it needs to send a message
await tool.execute(toolCallId, { phoneNumber, message });
// → HTTP POST to /api/sessions/:uuid/send
```

## API Reference

### POST /api/sessions/:uuid
```json
// Request: POST /api/sessions/my-session
// Response 201:
{ "message": "Instancia generada y en proceso de emulación.", "uuid": "my-session" }

// Response 400 (if exists):
{ "error": "La sesión ya existe en memoria.", "state": "open" }
```

### GET /api/sessions/:uuid/qr
```json
{
    "uuid": "my-session",
    "state": "connecting",
    "qr": "2@ABC123...",
    "message": "En espera de ser escaneado con WhatsApp."
}
```

### GET /api/sessions/:uuid/qr/png
- Returns PNG image (image/png)
- 404 if no QR pending

### POST /api/sessions/:uuid/send
```json
// Request:
{ "to": "+573001234567", "text": "Hola!" }

// Response:
{ "success": true, "message": "Mensaje enviado correctamente" }
```

## Message DTO

```typescript
interface ChatMessageAttachmentDto {
    mime_type: string;
    payload_base64: string;
}

interface ChatMessageDto {
    bot_session: string;
    agent_id: string;
    agent_nickname: string;
    peer_id: string;
    peer_nickname: string;
    whatsapp_message_id: string;
    direction: 'in' | 'out';
    timestamp: number;
    text: string;
    attachments: ChatMessageAttachmentDto[];
}
```

## State Machine

```
WhatsappSocketEnvelope.connectionState:
    'undefined'  → Initial state
    'connecting' → Attempting connection
    'open'       → Authenticated, ready
    'close'      → Disconnected

On 'close':
    - loggedOut statusCode → Stop (need re-auth)
    - other → setTimeout 2s → reconnect()
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | HTTP API server port |
| AGENT_WS_HOST | 0.0.0.0 | WebSocket server host |
| AGENT_WS_PORT | 8081 | WebSocket server port |
| AGENT_WS_URL | ws://127.0.0.1:8081 | Internal WebSocket URL |
| PI_PROVIDER | openai | AI provider |
| PI_MODEL | gpt-5-mini | AI model |
| AGENT_SYSTEM_PROMPT | "Eres Chabito..." | System prompt |
| XAI_API_KEY | - | xAI API key |
| OPENAI_API_KEY | - | OpenAI API key |
| ANTHROPIC_API_KEY | - | Anthropic API key |
| GEMINI_API_KEY | - | Google API key |

## Important Notes

1. **Auth Storage**: Sessions persist in `auth_info_baileys/{uuid}/`
2. **Auto-reconnect**: Automatically attempts reconnection on disconnect (except loggedOut)
3. **Multi-session**: Supports unlimited simultaneous WhatsApp sessions
4. **Per-conversation AI**: Each conversation gets its own AiAgent instance
5. **ESM Only**: No CommonJS, all imports use `.js` extension
6. **Strict TS**: No implicit any, strict null checks enabled
7. **Tool Use**: AI can send WhatsApp messages using send_whatsapp_message tool