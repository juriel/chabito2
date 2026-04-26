# Chabito2

Bot de WhatsApp construido con Node.js, [Baileys](https://github.com/WhiskeySockets/Baileys), una API HTTP con Express y un servidor WebSocket de agente basado en `ws`.

## Requisitos

- Node.js 18 o superior
- npm, yarn o bun

## Instalación

### npm

```bash
npm install
```

### Yarn

```bash
yarn install
```

### Bun

```bash
bun install
```

## Scripts

### npm / Yarn

- `npm run start` / `yarn start`: ejecuta el proyecto en desarrollo usando `tsx`
- `npm run build` / `yarn build`: compila TypeScript a `dist/`

### Bun

- `bun run start:bun`: ejecuta el proyecto directamente con Bun
- `bun run build:bun`: genera un bundle para Bun en `dist/`

La compilación ya no genera archivos `.map` dentro de los fuentes. Todo el output compilado se escribe en `dist/`.

## Ejecución

### Con npm

```bash
npm run start
```

### Con Yarn

```bash
yarn start
```

### Con Bun

```bash
bun run start:bun
```

Si el puerto `8081` ya está ocupado, puedes cambiarlo temporalmente:

```bash
AGENT_WS_PORT=8082 AGENT_WS_URL=ws://127.0.0.1:8082 bun run start:bun
```

Servicios que se levantan al iniciar:

- API HTTP de Express en `http://localhost:3000` por defecto
- Servidor WebSocket del agente en `ws://127.0.0.1:8081` por defecto

Variables de entorno soportadas:

- `PORT`: puerto de la API HTTP
- `AGENT_WS_HOST`: host del servidor WebSocket
- `AGENT_WS_PORT`: puerto del servidor WebSocket
- `AGENT_WS_URL`: URL WebSocket que usa el cliente interno para enviar `ChatMessageDto`

## Flujo de WhatsApp

1. Crea una sesión con `POST /api/sessions/:uuid`.
2. Consulta el QR con `GET /api/sessions/:uuid/qr`, `GET /api/sessions/:uuid/qr/text` o `GET /api/sessions/:uuid/qr/png`.
3. Escanea el QR desde WhatsApp en tu teléfono.
4. La sesión se guarda en `auth_info_baileys/` y se intenta restaurar automáticamente al reiniciar.

## Endpoints HTTP

- `POST /api/sessions/:uuid`: crea una nueva sesión en memoria
- `GET /api/sessions/:uuid/qr`: devuelve el estado y el QR crudo
- `GET /api/sessions/:uuid/qr/text`: devuelve el QR en ASCII
- `GET /api/sessions/:uuid/qr/png`: devuelve el QR en PNG
- `GET /api/sessions/:uuid/status`: devuelve el estado actual de la sesión

## WebSocket del agente

El servidor WebSocket recibe objetos `ChatMessageDto` y responde en modo echo con el mismo payload.

Cuando entra un mensaje desde WhatsApp:

1. Se transforma a `ChatMessageDto`.
2. Se envía al servidor WebSocket del agente.
3. La respuesta del WebSocket se reenvía al chat de WhatsApp.

## Notas

- `dist/` está ignorado en git.
- Si necesitas volver a vincular la cuenta, elimina `auth_info_baileys/` y genera un nuevo QR.
