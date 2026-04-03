# Chabito2 - Bot de WhatsApp Multi-Sesión

## Resumen del Proyecto

Bot de WhatsApp basado en la biblioteca Baileys que permite gestionar múltiples sesiones simultáneas mediante una API REST. Cada sesión se identifica con un UUID y se conecta independientemente a WhatsApp.

## Stack Tecnológico

- **Runtime**: Node.js (ESM modules)
- **Lenguaje**: TypeScript 6.x con strict mode
- **WhatsApp SDK**: Baileys v7.0.0-rc.9
- **API Server**: Express 5.x
- **QR Generation**: qrcode + qrcode-terminal
- **Logging**: pino
- **Auth Storage**: Sistema de archivos (auth_info_baileys/)
- **Cache**: node-cache

## Estructura del Proyecto

```
/
├── index.ts                 # Entry point - importa chabito_ws
├── chabito_ws.ts           # API REST + Express server (puerto 3000)
├── src/whatsapp/whatsapp-socket-envelope.ts        # Clase WhatsappSocketEnvelope
├── whatsapp/               # Módulo WhatsApp (vacío, preparado para expansión)
├── dto/                    # Data Transfer Objects
│   └── chat-message.dto.ts
├── auth_info_baileys/      # Credenciales de sesión (gitignored)
│   └── {uuid}/             # Una carpeta por sesión
│       └── ...
└── tsconfig.json           # Strict TypeScript config
```

## Arquitectura

### Clase Principal: `WhatsappSocketEnvelope`

Ubicación: `src/whatsapp/whatsapp-socket-envelope.ts`

```typescript
export class WhatsappSocketEnvelope {
    uuid: string;
    sock?: WASocket;
    qr?: string;
    connectionState: 'connecting' | 'open' | 'close' | 'undefined';
    lastDisconnect?: any;
    groupCache: NodeCache;
}
```

**Métodos públicos:**
- `constructor(uuid: string)` - Inicializa la sesión
- `async connect()` - Conecta a WhatsApp usando auth multi-file
- `async sendMessage(jid: string, content: MessageContent)` - Envía mensajes

**Eventos manejados:**
- `creds.update` - Guarda credenciales automáticamente
- `messages.upsert` - Procesa mensajes entrantes
- `connection.update` - Gestiona estados de conexión

### API REST Endpoints

Puerto por defecto: `3000` (configurable via `PORT` env var)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Página HTML con documentación de endpoints |
| POST | `/api/sessions/:uuid` | Crea nueva instancia de sesión |
| GET | `/api/sessions/:uuid/qr` | Estado + QR crudo |
| GET | `/api/sessions/:uuid/qr/text` | QR en formato ASCII |
| GET | `/api/sessions/:uuid/qr/png` | QR como imagen PNG |
| GET | `/api/sessions/:uuid/status` | Estado actual de la sesión |

### Estados de Conexión

- `undefined` - Sesión no iniciada
- `connecting` - Intentando conectar
- `open` - Conectado y listo
- `close` - Desconectado

### DTO: ChatMessageDto

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

## Convenciones de Código

### TypeScript
- `strict: true` habilitado
- `verbatimModuleSyntax: true` - imports/exports explícitos
- `module: "nodenext"` - ESM modules
- Extensiones `.ts` en imports, omitir `.js` en runtime

### Archivos
- Extensión `.ts` para código TypeScript
- Imports con extensión `.js` para archivos locales (required por ESM)
- Usar `async/await` en lugar de `.then()`/`.catch()`
- Tipado estricto de errores con `@hapi/boom`

### Manejo de Errores
- Usar `Boom` para errores HTTP estructurados
- Try/catch en endpoints async
- Logging con `console.error` para errores

## Ejecución

```bash
# Instalar dependencias
yarn install

# Iniciar servidor
yarn start

# Build (compilar TypeScript)
yarn build
```

## Autenticación

1.Primera ejecución genera QR en terminal
2.Escanear con WhatsApp > Dispositivos vinculados
3.Sesión guardada en `auth_info_baileys/{uuid}/`
4.Siguientes ejecuciones reutilizan sesión

## Notas Importantes

- Las sesiones se restauran automáticamente al iniciar el servidor
- Múltiples sesiones pueden correr simultáneamente (mapa en memoria)
- Carpeta `auth_info_baileys/` está en .gitignore
- Si la sesión se cierra, intentar reconectar automáticamente (excepto loggedOut)
