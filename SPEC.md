# Chabito2 - Bot de WhatsApp Multi-Sesión con IA

## Resumen del Proyecto

Bot de WhatsApp basado en Baileys que permite gestionar múltiples sesiones simultáneas con API REST y responder automáticamente usando agentes de IA. Cada chatbot tiene configuración personalizada y guarda historial de conversaciones en disco.

## Stack Tecnológico

- **Runtime**: Node.js 18+ / Bun
- **Lenguaje**: TypeScript 6.x con strict mode
- **WhatsApp SDK**: Baileys v7.0.0-rc.9
- **AI Framework**: @mariozechner/pi-agent-core + @mariozechner/pi-ai
- **API Server**: Express 5.x
- **WebSocket**: ws v8.18.3
- **QR Generation**: qrcode
- **Storage**: File-based (propio)
- **Validation**: Zod
- **Frontend**: Vite + Bun + Tailwind CSS v4

## Arquitectura

```
WhatsApp Mobile → WhatsAppSocketEnvelope → AgentWebSocketServer (8081) → AiAgent
                        ↓                                ↓
                 ChatbotInitialSetup           ConversationStore
                   (data/{bot}/)                 (data/{bot}/)
```

## Estructura del Proyecto

```
/
├── index.ts                      # Entry point
├── SPEC.md                      # Documentación
├── package.json                 # Dependencias ESM
├── src/
│   ├── index.ts               # Entry point
│   ├── chabito_ws.ts           # Inicializa servidor
│   ├── dto/
│   │   └── chat-message-dto.ts
│   ├── webserver/
│   │   └── chabito_http_server.ts    # Express (3000)
│   ├── whatsapp/
│   │   ├── whatsapp-socket-envelope.ts
│   │   └── baileys-storage-cleanup.ts
│   ├── agent/
│   │   ├── ai-agent.ts            # AiAgent wrapper
│   │   ├── agent-ws-server.ts     # WS server (8081)
│   │   ├── agents-map.ts         # Agents singleton
│   │   ├── whatsapp-tool.ts     # Send message tool
│   │   ├── chatbot-initial-setup.ts  # Bot config
│   │   └── conversation-store.ts # Chat history
│   └── persistence/
│       ├── index.ts             # Public API
│       ├── types.ts             # Interfaces
│       ├── file-storage-provider.ts
│       ├── json-store.ts
│       └── text-store.ts
├── data/                       # Datos (gitignored)
│   └── {botSession}/
│       ├── prompt.txt
│       ├── prompt-admin.txt
│       ├── managers.txt
│       └── conversation-{peerId}.json
└── auth_info_baileys/           # Credenciales WA
```

---

## Clases Principales

### 1. `WhatsappSocketEnvelope`

Gestiona la conexión WhatsApp via Baileys.

```typescript
class WhatsappSocketEnvelope {
    uuid: string;
    waSocket?: WASocket;
    wsSocket: WebSocket | undefined;
    qr?: string;
    connectionState: 'connecting' | 'open' | 'close' | 'undefined';
}
```

### 2. `ChabitoHttpServer`

Servidor Express (puerto 3000).

### 3. `AgentWebSocketServer`

Servidor WebSocket (puerto 8081) que routing mensajes a agentes por conversación.

### 4. `AiAgent` / `AiAgentBuilder`

Wrapper sobre PI Agent Core con tools.

Proveedores: openai, anthropic, google, groq, xai, openrouter

### 5. `ChatbotInitialSetup`

Gestión de configuración por bot.

- `prompt.txt`: Prompt público
- `prompt-admin.txt`: Prompt para admins
- `managers.txt`: Lista de JIDs admins

### 6. `AgentsMap`

Singleton que crea agentes async por `conversationKey` = `botSession:peerId`

### 7. `ConversationStore`

Historial de conversaciones guardado en `data/{botSession}/conversation-{peerId}.json`

---

## Persistence Layer

### TextStore

Archivos `.txt` (prompts, managers).

```typescript
const store = new TextStore('./data', 'botSession');
await store.save('prompt', 'Eres un asistente...');
await store.append('managers', '573001234567@s.whatsapp.net\n');
```

### JsonStore

Archivos JSON (conversaciones).

```typescript
const store = new JsonStore(provider, deserializer);
await store.save('id', entity);
```

### FileStorageProvider

```typescript
const provider = new FileStorageProvider('./data', 'conversations');
// → data/conversations/<key>.json
```

---

## Estados de Conexión

- `undefined` → Sesión no iniciada
- `connecting` → Intentando conectar
- `open` → Conectado y listo
- `close` → Desconectado (auto-reconnect excepto loggedOut)

---

## API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Página HTML |
| POST | `/api/sessions/:uuid` | Crear sesión |
| GET | `/api/sessions` | Listar sesiones |
| GET | `/api/sessions/:uuid/qr` | Estado + QR |
| GET | `/api/sessions/:uuid/qr/png` | QR PNG |
| GET | `/api/sessions/:uuid/status` | Estado |
| POST | `/api/sessions/:uuid/send` | Enviar mensaje |

---

## Variables de Entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| PORT | 3000 | HTTP API port |
| AGENT_WS_PORT | 8081 | WS port |
| PI_PROVIDER | openai | AI provider |
| PI_MODEL | gpt-5-mini | AI model |

---

## Convenciones

- ESM: imports con `.js` extension
- Strict TypeScript
- Logging con prefijos: `[API]`, `[AGENT-WS]`, `[BAILEYS]`, `[TOOL]`, `[AI-AGENT]`, `[SETUP]`

---

## Notas Importantes

- `data/` y `auth_info_baileys/` en `.gitignore`
- Primer usuario se promueve a manager automáticamente
- Cada conversación tiene su propio agente e historial
- Múltiples sesiones WhatsApp simultáneas