# Chabito2

Este es un bot de WhatsApp creado con Node.js y la biblioteca [Baileys](https://github.com/WhiskeySockets/Baileys).

## Requisitos previos

- **Node.js**: Asegúrate de tener Node.js instalado (se recomienda una versión reciente como v18 o superior).
- **Yarn** o **npm**: Para instalar las dependencias. El proyecto incluye un archivo `yarn.lock`, por lo que se recomienda usar Yarn.

## Instalación

1. Clona el repositorio o abre una terminal en la carpeta del proyecto .
2. Instala las dependencias ejecutando:

   ```bash
   yarn install
   ```
   *(O si prefieres usar npm, ejecuta `npm install`)*

## Ejecución

Para iniciar el bot, ejecuta el siguiente comando en la terminal:

```bash
node index.js
```

### Autenticación

1. Al ejecutar el script por primera vez, verás que se genera un **código QR** directamente en la terminal.
2. Abre WhatsApp en tu teléfono, ve a **Dispositivos vinculados** y selecciona **Vincular un dispositivo**.
3. Escanea el código QR que aparece en tu terminal.
4. Una vez escaneado, la sesión se guardará automáticamente en la carpeta `auth_info_baileys/`. Para futuras ejecuciones, el bot intentará reutilizar esta sesión y no será necesario volver a escanear el QR a menos que se cierre la sesión desde el teléfono.

## Notas adicionales

- Si experimentas problemas de inicio de sesión o quieres vincular una cuenta diferente, puedes borrar la carpeta `auth_info_baileys/` y volver a ejecutar `node index.js` para generar un nuevo código QR.
