import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import { mkdir, readdir } from 'node:fs/promises';
import { WhatsappSocketEnvelope } from '../whatsapp/whatsapp-socket-envelope.ts';
import { AgentWebSocketServer } from '../agent/agent-ws-server.ts';

export class ChabitoHttpServer {
    private readonly app = express();
    private readonly activeSessions = new Map<string, WhatsappSocketEnvelope>();
    private readonly authInfoDir = 'auth_info_baileys';
    private readonly agentWebSocketServer = new AgentWebSocketServer();

    constructor(private readonly port = Number(process.env.PORT || 3000)) {
        this.configureMiddleware();
        this.configureRoutes();
    }

    public start(): void {
        this.app.listen(this.port, () => {
            console.log('--------------------------------------------------');
            console.log(`🚀 Chabito WS (API) corriendo en el puerto ${this.port}...`);
            console.log('--------------------------------------------------');

            this.agentWebSocketServer.start();

            this.bootstrapStoredSessions().catch((error) => {
                console.error('[BOOT] Error inicializando sesiones guardadas:', error);
            });
        });
    }

    private configureMiddleware(): void {
        this.app.use(cors());
        this.app.use(express.json());
    }

    private configureRoutes(): void {
        this.app.get('/', this.handleIndexRequest.bind(this));
        this.app.post('/api/sessions/:uuid', this.handleCreateSession.bind(this));
        this.app.get('/api/sessions/:uuid/qr', this.handleQrRequest.bind(this));
        this.app.get('/api/sessions/:uuid/qr/text', this.handleQrTextRequest.bind(this));
        this.app.get('/api/sessions/:uuid/qr/png', this.handleQrPngRequest.bind(this));
        this.app.get('/api/sessions/:uuid/status', this.handleStatusRequest.bind(this));
    }

    private async bootstrapStoredSessions(): Promise<void> {
        await mkdir(this.authInfoDir, { recursive: true });

        const entries = await readdir(this.authInfoDir, { withFileTypes: true });
        const uuids = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort((a, b) => a.localeCompare(b));

        console.log(`[BOOT] Sesiones encontradas en ${this.authInfoDir}: ${uuids.length}`);

        if (uuids.length === 0) {
            console.log('[BOOT] No hay sesiones guardadas para restaurar.');
            return;
        }

        for (const uuid of uuids) {
            console.log(`[BOOT] Restaurando sesion: ${uuid}`);

            const bot = new WhatsappSocketEnvelope(uuid);
            this.activeSessions.set(uuid, bot);
            bot.connect().catch((error) => {
                console.error(`[BOOT] Error restaurando la sesion ${uuid}:`, error);
            });
        }
    }

    private handleIndexRequest(req: express.Request, res: express.Response): void {
        const host = req.get('host') || `localhost:${this.port}`;
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
    }

    private async handleCreateSession(req: express.Request, res: express.Response): Promise<void> {
        const uuid = this.getUuidParam(req.params.uuid);

        if (this.activeSessions.has(uuid)) {
            res.status(400).json({
                error: 'La sesión ya existe en memoria.',
                state: this.activeSessions.get(uuid)?.connectionState
            });
            return;
        }

        console.log(`[API] Solicitando creación de instancia UUID: ${uuid}`);

        try {
            const bot = new WhatsappSocketEnvelope(uuid);
            bot.connect().catch((error) => console.error(`[API] Error en sesión ${uuid}:`, error));

            this.activeSessions.set(uuid, bot);

            res.status(201).json({
                message: 'Instancia generada y en proceso de emulación.',
                uuid
            });
        } catch (error) {
            res.status(500).json({ error: 'Error del servidor al intentar arrancar', details: String(error) });
        }
    }

    private handleQrRequest(req: express.Request, res: express.Response): void {
        const uuid = this.getUuidParam(req.params.uuid);
        const bot = this.activeSessions.get(uuid);

        if (!bot) {
            res.status(404).json({ error: 'La sesión no ha sido instanciada. Utilice POST primero.' });
            return;
        }

        res.json({
            uuid,
            state: bot.connectionState,
            qr: bot.qr || null,
            message: bot.connectionState === 'open'
                ? '¡Ya está emparejado y conectado!'
                : 'En espera de ser escaneado con WhatsApp.'
        });
    }

    private async handleQrTextRequest(req: express.Request, res: express.Response): Promise<void> {
        const uuid = this.getUuidParam(req.params.uuid);
        const bot = this.activeSessions.get(uuid);

        if (!bot || !bot.qr) {
            res.status(404).send('No hay código QR pendiente para esta sesión en este momento.');
            return;
        }

        try {
            const qrString = await QRCode.toString(bot.qr, { type: 'terminal', small: true });
            res.type('text/plain').send(qrString);
        } catch {
            res.status(500).send('Error generando el código ASCII.');
        }
    }

    private async handleQrPngRequest(req: express.Request, res: express.Response): Promise<void> {
        const uuid = this.getUuidParam(req.params.uuid);
        const bot = this.activeSessions.get(uuid);

        if (!bot || !bot.qr) {
            res.status(404).json({ error: 'No hay código QR pendiente para esta sesión en este momento.' });
            return;
        }

        try {
            const imageBuffer = await QRCode.toBuffer(bot.qr);
            res.type('image/png').send(imageBuffer);
        } catch (error) {
            res.status(500).json({ error: 'Error generando el código en formato imagen.', details: String(error) });
        }
    }

    private handleStatusRequest(req: express.Request, res: express.Response): void {
        const uuid = this.getUuidParam(req.params.uuid);
        const bot = this.activeSessions.get(uuid);

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
    }

    private getUuidParam(uuidParam: string | string[] | undefined): string {
        if (typeof uuidParam === 'string') {
            return uuidParam;
        }

        if (Array.isArray(uuidParam) && uuidParam.length > 0) {
            return uuidParam[0] || '';
        }

        throw new Error('UUID no proporcionado en la ruta');
    }
}
