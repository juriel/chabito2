# Antigravity Context - Chabito2

## Project Overview

Chabito2 es un bot de WhatsApp que proporciona una API REST para gestionar múltiples sesiones de WhatsApp simultáneamente. Cada sesión es identificada por un UUID y puede ser controlada independientemente.

## Stack

- Node.js + TypeScript (ESM)
- Baileys 7.x (WhatsApp Web protocol)
- Express 5.x (REST API)
- qrcode (QR generation)
- pino (logging)

## File Map

```
chabito2/
├── index.ts                    # Entry point
├── chabito_ws.ts               # API server (main logic)
├── whatsapp_main.ts            # WhatsAppSocketEnvelope class
├── dto/
│   └── chat-message.dto.ts     # ChatMessageDto interface
├── auth_info_baileys/          # Session credentials (DO NOT COMMIT)
│   └── {uuid}/
│       ├── creds.json
│       └── ...
└── tsconfig.json
```

## Core Concepts

### Session Management
```typescript
const activeSessions = new Map<string, WhatsappSocketEnvelope>();
// Key: UUID string
// Value: WhatsAppSocketEnvelope instance
```

### Connection Flow
1. `POST /api/sessions/:uuid` → Creates `WhatsappSocketEnvelope`
2. Calls `bot.connect()` async
3. `connection.update` event fires with QR
4. User scans QR
5. `connection.update` fires with `open` state

### Message Processing
Currently echoes "¡Hola! Aquí está tu Chabito." when message contains "chabito"

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
    "qr": "2@ABC123...",  // raw QR string
    "message": "En espera de ser escaneado con WhatsApp."
}
```

### GET /api/sessions/:uuid/qr/png
- Returns PNG image (image/png)
- 404 if no QR pending

## Important Notes

1. **Auth Storage**: Sessions persist in `auth_info_baileys/{uuid}/`
2. **Auto-reconnect**: Automatically attempts reconnection on disconnect (except loggedOut)
3. **Multi-session**: Supports unlimited simultaneous sessions via UUID
4. **ESM Only**: No CommonJS, all imports use `.js` extension
5. **Strict TS**: No implicit any, strict null checks enabled

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
| PORT | 3000 | Server port |
