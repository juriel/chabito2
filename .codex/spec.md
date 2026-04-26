# Codex Context - Chabito2

## Quick Facts

- **Project Type**: WhatsApp Bot with AI Agents (multi-session)
- **Language**: TypeScript (ESM, strict mode)
- **WhatsApp**: Baileys v7.0.0-rc.9
- **AI Framework**: @mariozechner/pi-agent-core + @mariozechner/pi-ai
- **API Server**: Express 5.x (port 3000)
- **WebSocket Server**: ws (port 8081)
- **Auth**: File-based (auth_info_baileys/{uuid}/)
- **Data Storage**: File-based per bot (data/{botSession}/)

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point |
| `src/chabito_ws.ts` | Initializes HTTP server |
| `src/webserver/chabito_http_server.ts` | Express API server (port 3000) |
| `src/whatsapp/whatsapp-socket-envelope.ts` | WhatsAppSocketEnvelope (Baileys) |
| `src/whatsapp/baileys-storage-cleanup.ts` | Cleanup old auth files |
| `src/agent/agent-ws-server.ts` | WebSocket server (port 8081) |
| `src/agent/ai-agent.ts` | AiAgent wrapper |
| `src/agent/agents-map.ts` | Singleton map of AI agents |
| `src/agent/whatsapp-tool.ts` | Tool for sending WhatsApp messages |
| `src/agent/chatbot-initial-setup.ts` | Bot config (prompts, managers) |
| `src/agent/conversation-store.ts` | Per-conversation history |
| `src/persistence/` | Storage abstraction layer |
| `src/dto/chat-message-dto.ts` | Message DTO |

## Architecture

```
WhatsApp Mobile → WhatsAppSocketEnvelope → AgentWebSocketServer (8081) → AiAgent (per conversation)
                    ↓
             ChatbotInitialSetup
          (load prompts, managers from data/)
                    ↓
              ConversationStore
           (save/load history from data/)
```

## Data Structure

```
data/
  <botSession>/
    prompt.txt           # Public prompt
    prompt-admin.txt     # Admin prompt
    managers.txt        # List of admin numbers
    conversation-<peerId>.json  # Chat history
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | HTTP API server port |
| AGENT_WS_HOST | 0.0.0.0 | WebSocket server host |
| AGENT_WS_PORT | 8081 | WebSocket server port |
| PI_PROVIDER | openai | AI provider |
| PI_MODEL | gpt-5-mini | AI model |
| AGENT_SYSTEM_PROMPT | "Eres Chabito..." | Default system prompt |
| XAI_API_KEY | - | xAI API key |
| OPENAI_API_KEY | - | OpenAI API key |
| ANTHROPIC_API_KEY | - | Anthropic API key |
| GEMINI_API_KEY | - | Google API key |

## Bot Configuration (ChatbotInitialSetup)

- **First user**: Auto-promoted to manager if no managers exist
- **prompt.txt**: Public-facing system prompt
- **prompt-admin.txt**: Admin-specific prompt (technical help)
- **managers.txt**: List of admin JIDs (one per line)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | HTML documentation |
| POST | `/api/sessions/:uuid` | Create WhatsApp session |
| GET | `/api/sessions` | List active sessions |
| GET | `/api/sessions/:uuid/qr` | Session state + QR |
| GET | `/api/sessions/:uuid/qr/text` | QR as ASCII |
| GET | `/api/sessions/:uuid/qr/png` | QR as PNG |
| GET | `/api/sessions/:uuid/status` | Session status |
| POST | `/api/sessions/:uuid/send` | Send WhatsApp message |

## Connection States

- `'undefined'` → Initial
- `'connecting'` → Attempting
- `'open'` → Authenticated
- `'close'` → Disconnected (auto-reconnect except loggedOut)

## Code Guidelines

1. All async functions use `try/catch`
2. Use `@hapi/boom` for HTTP errors
3. Prefix logs: `[API]`, `[AGENT-WS]`, `[BAILEYS]`, `[TOOL]`, `[AI-AGENT]`, `[SETUP]`
4. Don't commit `auth_info_baileys/` or `data/`