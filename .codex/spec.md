# Codex Context - Chabito2

## Quick Facts

- **Project Type**: WhatsApp Bot (multi-session API)
- **Language**: TypeScript (ESM, strict mode)
- **Framework**: Baileys v7 + Express v5
- **Port**: 3000 (env: `PORT`)
- **Auth**: File-based (auth_info_baileys/{uuid}/)

## Key Files

| File | Purpose |
|------|---------|
| `chabito_ws.ts` | Express API server + session management |
| `whatsapp_main.ts` | `WhatsappSocketEnvelope` class (Baileys wrapper) |
| `dto/chat-message.dto.ts` | Message DTO interface |
| `index.ts` | Entry point |

## Important Patterns

### ESM Imports
```typescript
// TypeScript files use .js extension for local imports
import './chabito_ws.js';
import { WhatsappSocketEnvelope } from './whatsapp_main.js';
```

### Session Creation Flow
```typescript
// 1. POST /api/sessions/:uuid creates instance
const bot = new WhatsappSocketEnvelope(uuid);
activeSessions.set(uuid, bot);

// 2. connect() is called async (non-blocking)
// 3. QR available via GET /api/sessions/:uuid/qr
```

### Message Handling
```typescript
// In handleMessagesUpsert()
const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
if (jid && !msg.key.fromMe && text.toLowerCase().includes('chabito')) {
    await this.sock?.sendMessage(jid, { text: '¡Hola! Aquí está tu Chabito.' });
}
```

## TypeScript Config Highlights

```json
{
    "module": "nodenext",
    "strict": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
}
```

## Connection States

`'undefined'` → `'connecting'` → `'open'` | `'close'`

On `'close'`:
- If `statusCode !== DisconnectReason.loggedOut` → auto-reconnect after 2s
- If loggedOut → manual re-auth required

## Code Guidelines

1. All async functions must use `try/catch`
2. Use `@hapi/boom` for HTTP errors
3. Always update `connectionState` on connection updates
4. Call `saveCreds()` on `creds.update` event
5. Don't commit `auth_info_baileys/` directory
