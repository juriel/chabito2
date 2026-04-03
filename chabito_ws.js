import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import { mkdir, readdir } from 'node:fs/promises';
import { WhatsappSocketEnvelope } from './whatsapp_main.js';
import { AgentWebSocketServer } from './agent/agent-ws-server.js';
const app = express();
app.use(cors());
app.use(express.json());
app.get('/', (req, res) => {
    const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
    const baseUrl = `${req.protocol}://${host}`;
    const exampleUuid = 'demo-session';
    res.type('html').send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Chabito WS API</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    max-width: 900px;
                    margin: 40px auto;
                    padding: 0 16px;
                    line-height: 1.6;
                }
                code {
                    background: #f4f4f4;
                    padding: 2px 6px;
                    border-radius: 4px;
                }
                li { margin-bottom: 10px; }
            </style>
        </head>
        <body>
            <h1>Chabito WS API</h1>
            <p>Estos son los endpoints disponibles actualmente.</p>
            <p>UUID de ejemplo: <code>${exampleUuid}</code></p>
            <ul>
                <li>
                    <strong>POST</strong> <code>/api/sessions/:uuid</code><br />
                    Crea una nueva sesion en memoria.<br />
                    Ejemplo: <a href="${baseUrl}/api/sessions/${exampleUuid}">${baseUrl}/api/sessions/${exampleUuid}</a>
                </li>
                <li>
                    <strong>GET</strong> <code>/api/sessions/:uuid/qr</code><br />
                    Devuelve el estado y el QR crudo si existe.<br />
                    Enlace: <a href="${baseUrl}/api/sessions/${exampleUuid}/qr">${baseUrl}/api/sessions/${exampleUuid}/qr</a>
                </li>
                <li>
                    <strong>GET</strong> <code>/api/sessions/:uuid/qr/text</code><br />
                    Devuelve el QR en texto ASCII.<br />
                    Enlace: <a href="${baseUrl}/api/sessions/${exampleUuid}/qr/text">${baseUrl}/api/sessions/${exampleUuid}/qr/text</a>
                </li>
                <li>
                    <strong>GET</strong> <code>/api/sessions/:uuid/qr/png</code><br />
                    Devuelve el QR como imagen PNG.<br />
                    Enlace: <a href="${baseUrl}/api/sessions/${exampleUuid}/qr/png">${baseUrl}/api/sessions/${exampleUuid}/qr/png</a>
                </li>
                <li>
                    <strong>GET</strong> <code>/api/sessions/:uuid/status</code><br />
                    Devuelve el estado actual de la sesion.<br />
                    Enlace: <a href="${baseUrl}/api/sessions/${exampleUuid}/status">${baseUrl}/api/sessions/${exampleUuid}/status</a>
                </li>
            </ul>
            <p>Nota: el endpoint <code>POST /api/sessions/:uuid</code> debe invocarse con una herramienta como <code>curl</code>, Postman o desde el frontend.</p>
        </body>
        </html>
    `);
});
// Mapa en memoria para mantener múltiples envoltorios controlados por UUID
const activeSessions = new Map();
const AUTH_INFO_DIR = 'auth_info_baileys';
const agentWebSocketServer = new AgentWebSocketServer();
async function bootstrapStoredSessions() {
    await mkdir(AUTH_INFO_DIR, { recursive: true });
    const entries = await readdir(AUTH_INFO_DIR, { withFileTypes: true });
    const uuids = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
    console.log(`[BOOT] Sesiones encontradas en ${AUTH_INFO_DIR}: ${uuids.length}`);
    if (uuids.length === 0) {
        console.log('[BOOT] No hay sesiones guardadas para restaurar.');
        return;
    }
    for (const uuid of uuids) {
        console.log(`[BOOT] Restaurando sesion: ${uuid}`);
        const bot = new WhatsappSocketEnvelope(uuid);
        activeSessions.set(uuid, bot);
        bot.connect().catch((error) => {
            console.error(`[BOOT] Error restaurando la sesion ${uuid}:`, error);
        });
    }
}
// Endpoint para inicializar y conectar una nueva instancia
app.post('/api/sessions/:uuid', async (req, res) => {
    const { uuid } = req.params;
    // Si ya fue mapeado, avisamos al cliente
    if (activeSessions.has(uuid)) {
        res.status(400).json({
            error: 'La sesión ya existe en memoria.',
            state: activeSessions.get(uuid)?.connectionState
        });
        return;
    }
    console.log(`[API] Solicitando creación de instancia UUID: ${uuid}`);
    try {
        const bot = new WhatsappSocketEnvelope(uuid);
        // Despachar el .connect() sin hacer await para que no bloquee HTTP si demora
        bot.connect().catch((error) => console.error(`[API] Error en sesión ${uuid}:`, error));
        activeSessions.set(uuid, bot);
        res.status(201).json({
            message: 'Instancia generada y en proceso de emulación.',
            uuid
        });
    }
    catch (e) {
        res.status(500).json({ error: 'Error del servidor al intentar arrancar', details: String(e) });
    }
});
// Endpoint para obtener información de emparejamiento (QR o sesión iniciada)
app.get('/api/sessions/:uuid/qr', (req, res) => {
    const { uuid } = req.params;
    const bot = activeSessions.get(uuid);
    if (!bot) {
        res.status(404).json({ error: 'La sesión no ha sido instanciada. Utilice POST primero.' });
        return;
    }
    // Devolvemos toda la información vital para el front
    res.json({
        uuid,
        state: bot.connectionState,
        qr: bot.qr || null, // Generado por Baileys como un string raw crudo para pintar
        message: bot.connectionState === 'open'
            ? '¡Ya está emparejado y conectado!'
            : 'En espera de ser escaneado con WhatsApp.'
    });
});
// Escupir el QR generado en formato ASCII para que sea visible directamente en curl o navegadores crudos
app.get('/api/sessions/:uuid/qr/text', async (req, res) => {
    const { uuid } = req.params;
    const bot = activeSessions.get(uuid);
    if (!bot || !bot.qr) {
        res.status(404).send('No hay código QR pendiente para esta sesión en este momento.');
        return;
    }
    try {
        // Enviar con soporte de color utf8 nativo de consola
        const qrString = await QRCode.toString(bot.qr, { type: 'terminal', small: true });
        res.type('text/plain').send(qrString);
    }
    catch (e) {
        res.status(500).send('Error generando el código ASCII.');
    }
});
// Extraer QR crudo pero en formato imagen (Buffer a PNG)
app.get('/api/sessions/:uuid/qr/png', async (req, res) => {
    const { uuid } = req.params;
    const bot = activeSessions.get(uuid);
    if (!bot || !bot.qr) {
        res.status(404).json({ error: 'No hay código QR pendiente para esta sesión en este momento.' });
        return;
    }
    try {
        const imageBuffer = await QRCode.toBuffer(bot.qr);
        res.type('image/png').send(imageBuffer);
    }
    catch (e) {
        res.status(500).json({ error: 'Error generando el código en formato imagen.', details: String(e) });
    }
});
// Endpoint opcional para consultar de forma estricta un estado
app.get('/api/sessions/:uuid/status', (req, res) => {
    const { uuid } = req.params;
    const bot = activeSessions.get(uuid);
    if (!bot) {
        res.status(404).json({ error: 'No existe sesión con ese identificador.' });
        return;
    }
    res.json({
        uuid,
        state: bot.connectionState,
        hasSocketConnected: !!bot.sock,
        qrPending: !!bot.qr && bot.connectionState !== 'open'
    });
});
// Montar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`--------------------------------------------------`);
    console.log(`🚀 Chabito WS (API) corriendo en el puerto ${PORT}...`);
    console.log(`--------------------------------------------------`);
    agentWebSocketServer.start();
    bootstrapStoredSessions().catch((error) => {
        console.error('[BOOT] Error inicializando sesiones guardadas:', error);
    });
});
//# sourceMappingURL=chabito_ws.js.map