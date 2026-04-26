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

## Configuración de Inteligencia Artificial (LLM)

Antes de iniciar tu chatbot, debes configurar el proveedor de IA y tu API Key. Crea un archivo `.env` en la raíz del proyecto (si no existe) y agrega la configuración correspondiente a tu proveedor:

```env
# Proveedor de IA (ej: xai, openai, anthropic, google, groq)
PI_PROVIDER=xai
# Modelo a utilizar
PI_MODEL=grok-beta
# API Key del proveedor correspondiente (Ejemplo para XAI)
XAI_API_KEY=tu_clave_api_aqui

# Prompt del sistema que define la personalidad de tu bot
AGENT_SYSTEM_PROMPT=Eres Chabito. Responde de forma útil, breve y amable por WhatsApp.
```
> **Nota:** Dependiendo de tu `PI_PROVIDER`, la variable de la clave cambiará (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, etc).

## Flujo de WhatsApp: Creación de tu Chatbot desde la UI

La forma más fácil de crear y emparejar tu chatbot es utilizando la interfaz gráfica provista (Frontend).

1. Ejecuta el servidor principal:
   ```bash
   bun run start:bun
   ```
2. Abre tu navegador y dirígete a **[http://localhost:3000](http://localhost:3000)**.
3. En la página principal, haz clic en **"Administrar Chatbots"** (o dirígete a `http://localhost:3000/#/chatbots`).
4. **Crear Sesión:** En la caja de texto "UUID del chatbot", ingresa un nombre o identificador único para tu bot (por ejemplo, `ventas-bot`).
5. Haz clic en **"Crear chatbot"**. Verás que aparece una nueva tarjeta.
6. **Escanear QR:** Espera unos segundos a que el sistema se comunique con WhatsApp. En la tarjeta aparecerá un código QR. Abre tu aplicación de WhatsApp en tu teléfono, ve a "Dispositivos vinculados" y escanea el código QR que ves en pantalla.
7. Una vez escaneado, la tarjeta indicará el estado `open` o `online`. ¡Tu bot ya está funcionando y respondiendo con Inteligencia Artificial!

> **Restauración Automática:** Las sesiones escaneadas se guardan en el directorio local `auth_info_baileys/`. Si reinicias el servidor, tus chatbots se reconectarán automáticamente a WhatsApp sin necesidad de volver a escanear el QR.

## Endpoints HTTP (API)

Si deseas integrar la gestión de chatbots desde otra aplicación o herramienta:

- `POST /api/sessions/:uuid`: crea una nueva sesión en memoria y genera la conexión con Baileys.
- `GET /api/sessions`: devuelve una lista con todas las sesiones activas y su estado de conexión.
- `GET /api/sessions/:uuid/qr/png`: devuelve el QR en imagen PNG (ideal para mostrar en etiquetas `<img>`).
- `GET /api/sessions/:uuid/status`: devuelve el estado actual de la sesión.
- `GET /api/sessions/:uuid/qr/text`: devuelve el QR en ASCII crudo.

## WebSocket del Agente de Inteligencia Artificial

El servidor WebSocket recibe objetos `ChatMessageDto` en la ruta `ws://127.0.0.1:8081` de manera interna.

1. Cuando entra un mensaje desde WhatsApp, el cliente interno lo transforma a `ChatMessageDto` y lo envía al WebSocket del servidor de IA.
2. El agente procesa el historial de chat con el LLM seleccionado en tu `.env`.
3. Una vez se genera la respuesta, el WebSocket reenvía el payload al cliente de Baileys, quien entrega finalmente el mensaje al usuario de WhatsApp.

## Notas Adicionales

- La carpeta `frontend/dist/` (archivos estáticos compilados de la UI) está ignorada en git. Si haces cambios en el frontend, no olvides compilarlo primero con `bun run frontend:build`.
- Si necesitas **desvincular o resetear un bot**, simplemente elimina su carpeta correspondiente dentro de `auth_info_baileys/` y vuelve a crear la sesión desde la UI web.
