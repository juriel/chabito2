# Chabito2 - Bot de WhatsApp Multi-Sesión con IA

## Resumen del Proyecto

Bot de WhatsApp basado en la librería Baileys que permite gestionar múltiples sesiones simultáneas mediante una API REST y responder automáticamente usando agentes de IA. Cada sesión de WhatsApp se identifica con un UUID y se conecta independientemente a WhatsApp.

## Stack Tecnológico

- **Runtime**: Node.js 18+ / Bun
- **Lenguaje**: TypeScript 6.x con strict mode
- **WhatsApp SDK**: Baileys v7.0.0-rc.9
- **AI Framework**: @mariozechner/pi-agent-core v0.64.0 + @mariozechner/pi-ai v0.64.0
- **API Server**: Express 5.x
- **WebSocket**: ws v8.18.3
- **QR Generation**: qrcode + sharp (para procesamiento de imágenes)
- **Logging**: pino
- **Auth Storage**: Sistema de archivos (auth_info_baileys/)
- **Cache**: node-cache
- **Validation**: Zod v4.3.6
- **Frontend**: Vite + Bun + Tailwind CSS v4

## Arquitectura

### Arquitectura de Servicios

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENTE WHATSAPP                        │
└─────────────────────────┬───────────────────────────────────┘
                          │ WhatsApp Mobile
                          │ (QR Code Pairing)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                WhatsappSocketEnvelope (Baileys)                │
│         ┌─────────────────────────────────────────┐        │
│         │  Per-Session WhatsApp Connection          │        │
│         │  - qr code generation                   │        │
│         │  - message send/receive               │        │
│         │  - connection state management       │        │
│         └─────────────────────────────────────────┘        │
└─────────────────────────┬───────────────────────────────────┘
                          │ ChatMessageDto (WebSocket)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              AgentWebSocketServer (Puerto 8081)                │
│         ┌─────────────────────────────────────────┐        │
│         │  AI Message Router                    │        │
│         │  - per-conversation agents           │        │
│         │  - broadcasts responses            │        │
│         └─────────────────────────────────────────┘        │
└─────────────────────────┬───────────────────────────────────┘
                          │ ChatMessageDto (WebSocket)
                          ▼
┌────────────────────────────────────────���────────────────────┐
│                      AiAgent (per-peer)                       │
│         ┌─────────────────────────────────────────┐        │
│         │  PI Agent Core                        │        │
│         │  - LLM integration (multi-provider) │        │
│         │  - tool execution (WhatsApp send)    │        │
│         │  - conversation memory              │        │
│         └─────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### Estructura del Proyecto

```
/
├── index.ts                      # Entry point
├── chabito_ws.ts                # Inicializa el servidor HTTP
├── SPEC.md                     # Este archivo
├── package.json                 # Dependencias (ESM)
├── tsconfig.json               # Configuración TypeScript strict
├── .env                      # Variables de entorno
├── public/
│   ├── html/
│   │   └── index.html        # Documentación de endpoints
│   └── css/                  # Estilos Tailwind
├── src/
│   ├── index.ts             # Entry point - importa chabito_ws
│   ├── chabito_ws.ts        # Inicializa ChabitoHttpServer
│   ├── dto/
│   │   └── chat-message-dto.ts
│   ├── webserver/
│   │   └── chabito_http_server.ts    # Servidor HTTP API (puerto 3000)
│   ├── whatsapp/
│   │   └── whatsapp-socket-envelope.ts  # Clase WhatsApp + Baileys
│   └── agent/
│       ├── ai-agent.ts            # Wrapper del PI Agent
│       ├── agent-ws-server.ts     # Servidor WebSocket IA (puerto 8081)
│       ├── whatsapp-tool.ts       # Tool para enviar mensajes WhatsApp
│       └── agents-map.ts         # Mapa de agentes por conversación
├── frontend/
│   ├── src/
│   │   ├── app.ts
│   │   ├── main.ts
│   │   ├── types.ts
│   │   ├── global.css
│   │   └── pages/
│   │       ├── landing/
│   │       │   └── landing-page.ts
│   │       └── chatbots/
│   │           ├── chatbots-page.ts
│   │           ├── chatbot-list.ts
│   │           ├── chatbot-card.ts
│   │           └── chatbot-creation-box.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
└── auth_info_baileys/          # Credenciales de sesión (gitignored)
    └── {uuid}/               # Una carpeta por sesión
        └── ...
```

### Servidores

| Servicio | Puerto Default | Protocolo | Descripción |
|----------|----------------|-----------|-------------|
| HTTP API | 3000 | HTTP | API REST para gestión de sesiones |
| WebSocket IA | 8081 | WS | Servidor WebSocket para mensajes de IA |

---

## Clases Principales

### 1. `WhatsappSocketEnvelope`

**Ubicación:** `src/whatsapp/whatsapp-socket-envelope.ts`

```typescript
export class WhatsappSocketEnvelope {
    uuid: string;
    waSocket?: WASocket;
    wsSocket: WebSocket | undefined;  // Conexión al AgentWebSocketServer
    qr?: string;
    connectionState: 'connecting' | 'open' | 'close' | 'undefined';
    lastDisconnect?: unknown;
}
```

**Métodos públicos:**
- `constructor(uuid: string)` - Inicializa la sesión
- `async connect()` - Conecta a WhatsApp usando auth multi-file
- `async sendTextMessage(to: string, text: string)` - Envía mensajes de texto

**Eventos manejados:**
- `creds.update` - Guarda credenciales automáticamente
- `messages.upsert` - Procesa mensajes entrantes y reenvía al Agent WebSocket Server
- `connection.update` - Gestiona estados de conexión y QR

### 2. `ChabitoHttpServer`

**Ubicación:** `src/webserver/chabito_http_server.ts`

Servidor Express que expone la API REST para gestión de sesiones WhatsApp.

**Endpoints HTTP:**

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Página HTML con documentación |
| POST | `/api/sessions/:uuid` | Crea nueva instancia de sesión |
| GET | `/api/sessions` | Lista sesiones activas |
| GET | `/api/sessions/:uuid/qr` | Estado + QR en JSON |
| GET | `/api/sessions/:uuid/qr/text` | QR en formato ASCII |
| GET | `/api/sessions/:uuid/qr/png` | QR como imagen PNG |
| GET | `/api/sessions/:uuid/status` | Estado actual de la sesión |
| POST | `/api/sessions/:uuid/send` | Envía mensaje WhatsApp |

### 3. `AgentWebSocketServer`

**Ubicación:** `src/agent/agent-ws-server.ts`

Servidor WebSocket que recibe mensajes de WhatsApp y los distribuye a los agentes de IA correspondientes.

**Protocolo de Mensajes:**

- **Entrada:** ChatMessageDto con `direction: 'in'`
- **Salida:** ChatMessageDto con `direction: 'out'`

**Gestión de Conversación:**

- Una clave de conversación = `{bot_session}:{peer_id}`
- Un AiAgent por conversación
- Múltiples WebSockets por conversación (broadcast)

### 4. `AiAgent` y `AiAgentBuilder`

**Ubicación:** `src/agent/ai-agent.ts`

Wrapper sobre `@mariozechner/pi-agent-core` para gestionar agentes de IA con herramientas.

**Proveedores LLM Soportados:**

- openai
- anthropic
- google / google_vertex
- groq
- xai
- openrouter

### 5. `WhatsAppTool`

**Ubicación:** `src/agent/whatsapp-tool.ts`

Herramienta que permite al agente de IA enviar mensajes WhatsApp.

```typescript
const tool = createSendWhatsAppMessageTool(botSession);
await tool.execute(toolCallId, { phoneNumber: '+573001234567', message: 'Hola!' });
```

### 6. `AgentsMap`

**Ubicación:** `src/agent/agents-map.ts`

Mapa singleton que gestiona agentes por clave de conversación (`bot_session:peer_id`).

---

## DTO: ChatMessageDto

```typescript
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

---

## Estados de Conexión

- `undefined` - Sesión no iniciada
- `connecting` - Intentando conectar
- `open` - Conectado y listo
- `close` - Desconectado

---

## Convenciones de Código

### TypeScript

- `strict: true` habilitado
- `verbatimModuleSyntax: true` - imports/exports explícitos
- `module: "nodenext"` - ESM modules
- Extensiones `.ts` en imports (omitir `.js` en runtime)

### Archivos

- Extensión `.ts` para código TypeScript
- Usar `async/await` en lugar de `.then()`/`.catch()`
- Tipado estricto de errores con `@hapi/boom`

### Logging

- Usar `console.log` / `console.error` para logs
- Prefijos de contexto: `[API]`, `[AGENT-WS]`, `[BAILEYS]`, `[TOOL]`, `[AI-AGENT]`

---

## Ejecución

### Instalación

```bash
yarn install
# o
bun install
```

### Iniciar Servidor

```bash
yarn start
# o
bun run start:bun
```

### Iniciar Frontend

```bash
cd frontend && bun run dev
```

### Build

```bash
yarn build                    # Compila TypeScript
cd frontend && bun run build  # Compila Frontend
```

---

## Variables de Entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | 3000 | Puerto del servidor HTTP |
| `AGENT_WS_HOST` | 0.0.0.0 | Host del servidor WebSocket IA |
| `AGENT_WS_PORT` | 8081 | Puerto del servidor WebSocket IA |
| `AGENT_WS_URL` | ws://127.0.0.1:8081 | URL del WebSocket para cliente interno |
| `PI_PROVIDER` | openai | Proveedor de IA |
| `PI_MODEL` | gpt-5-mini | Modelo de IA |
| `AGENT_SYSTEM_PROMPT` | "Eres Chabito..." | Prompt del sistema |

### API Keys por Proveedor

| Proveedor | Variable de Entorno |
|----------|---------------------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google | `GEMINI_API_KEY` |
| Groq | `GROQ_API_KEY` |
| xAI | `XAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |

---

## Autenticación

1. Primera ejecución genera QR en terminal
2. Escanear con WhatsApp > Dispositivos vinculados
3. Sesión guardada en `auth_info_baileys/{uuid}/`
4. Siguientes ejecuciones reutilizan sesión automáticamente

---

## Notas Importantes

- Las sesiones se restauran automáticamente al iniciar el servidor
- Múltiples sesiones WhatsApp pueden correr simultáneamente
- Múltiples agentes de IA (uno por conversación)
- La carpeta `auth_info_baileys/` está en `.gitignore`
- Si la sesión se cierra (no por `loggedOut`), se reconecta automáticamente
- El agente puede usar la herramienta `send_whatsapp_message` para contactar terceros