import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { WhatsappSocketEnvelope } from '../whatsapp/whatsapp-socket-envelope.ts';
import { AgentWebSocketServer } from '../agent/agent-ws-server.ts';
import { cleanupSessionStorage, cleanupAllSessions } from '../whatsapp/baileys-storage-cleanup.ts';

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
        this.app.use(express.static('frontend/dist'));
        this.app.use(express.static('public'));
    }

    private configureRoutes(): void {
        this.app.get('/', this.handleIndexRequest.bind(this));
        this.app.get('/dashboard', this.handleDashboardRequest.bind(this));
        this.app.post('/api/sessions/:uuid', this.handleCreateSession.bind(this));
        this.app.get('/api/sessions/:uuid/qr', this.handleQrRequest.bind(this));
        this.app.get('/api/sessions/:uuid/qr/text', this.handleQrTextRequest.bind(this));
        this.app.get('/api/sessions/:uuid/qr/png', this.handleQrPngRequest.bind(this));
        this.app.get('/api/sessions/:uuid/status', this.handleStatusRequest.bind(this));
        this.app.get('/api/sessions', this.handleListSessions.bind(this));
        this.app.post('/api/sessions/:uuid/send', this.handleSendWhatsAppMessage.bind(this));
        this.app.post('/api/sessions/:uuid/cleanup', this.handleCleanupSession.bind(this));
        this.app.post('/api/sessions/cleanup', this.handleCleanupAllSessions.bind(this));
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

        // Auto-cleanup: remove stale pre-keys accumulated across restarts
        cleanupAllSessions().then((results) => {
            const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
            if (totalDeleted > 0) {
                console.log(`[CLEANUP] Pre-keys eliminados al arranque: ${totalDeleted}`);
            }
        }).catch((error) => {
            console.warn('[CLEANUP] Error durante limpieza automática:', error);
        });
    }

    private async handleDashboardRequest(req: express.Request, res: express.Response): Promise<void> {
        try {
            // For simplicity in this environment, we'll serve the source index if dist isn't built
            // but the production way would be to serve from dist.
            // Let's try to find where the main entry is.
            const path = await import('node:path');
            const fs = await import('node:fs');
            const distIndex = path.join(process.cwd(), 'frontend/dist/index.html');
            const srcIndex = path.join(process.cwd(), 'frontend/index.html');
            
            if (fs.existsSync(distIndex)) {
                res.sendFile(distIndex);
            } else {
                res.sendFile(srcIndex);
            }
        } catch (error) {
            res.status(500).send('Error loading dashboard');
        }
    }

    private async handleIndexRequest(req: express.Request, res: express.Response): Promise<void> {
        const host = req.get('host') || `localhost:${this.port}`;
        const baseUrl = `${req.protocol}://${host}`;
        const exampleUuid = 'demo-session';

        try {
            const html = await readFile('public/html/index.html', 'utf-8');
            const rendered = html.replace(/\$\{baseUrl\}/g, baseUrl).replace(/\$\{exampleUuid\}/g, exampleUuid);
            res.type('html').send(rendered);
        } catch (error) {
            res.status(500).send('Error loading page');
        }
    }

    private async handleCreateSession(req: express.Request, res: express.Response): Promise<void> {
        const uuid = this.getUuidParam(req.params.uuid);
        console.log(`[API] POST /api/sessions/${uuid}`);

        if (this.activeSessions.has(uuid)) {
            console.warn(`[API] createSession rejected, already exists: ${uuid}`);
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

    private async handleSendWhatsAppMessage(req: express.Request, res: express.Response): Promise<void> {
        const uuid = this.getUuidParam(req.params.uuid);
        const { to, text } = req.body;

        if (!to || !text) {
            res.status(400).json({ error: 'Faltan parámetros "to" o "text" en el body.' });
            return;
        }

        const bot = this.activeSessions.get(uuid);
        if (!bot) {
            res.status(404).json({ error: 'La sesión no ha sido instanciada o no existe.' });
            return;
        }

        try {
            await bot.sendTextMessage(String(to), String(text));
            res.json({ success: true, message: 'Mensaje enviado correctamente' });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[API] Error enviando mensaje desde endpoint para ${uuid}:`, errorMessage);
            res.status(500).json({ error: 'Error enviando el mensaje', details: errorMessage });
        }
    }

    private handleQrRequest(req: express.Request, res: express.Response): void {
        const uuid = this.getUuidParam(req.params.uuid);
        console.log(`[API] GET /api/sessions/${uuid}/qr`);
        const bot = this.activeSessions.get(uuid);

        if (!bot) {
            console.warn(`[API] GET /api/sessions/${uuid}/qr missing bot`);
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
        console.log(`[API] GET /api/sessions/${uuid}/qr/text`);
        const bot = this.activeSessions.get(uuid);

        if (!bot || !bot.qr) {
            console.warn(`[API] GET /api/sessions/${uuid}/qr/text no qr available`);
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
        console.log(`[API] GET /api/sessions/${uuid}/qr/png`);
        const bot = this.activeSessions.get(uuid);

        if (!bot || !bot.qr) {
            console.warn(`[API] GET /api/sessions/${uuid}/qr/png no qr available`);
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

    private handleListSessions(req: express.Request, res: express.Response): void {
        const sessions = Array.from(this.activeSessions.entries()).map(([uuid, bot]) => ({
            uuid,
            status: bot.connectionState,
        }));
        res.json({ sessions });
    }

    private handleStatusRequest(req: express.Request, res: express.Response): void {
        const uuid = this.getUuidParam(req.params.uuid);
        console.log(`[API] GET /api/sessions/${uuid}/status`);
        const bot = this.activeSessions.get(uuid);

        if (!bot) {
            console.warn(`[API] GET /api/sessions/${uuid}/status missing bot`);
            res.status(404).json({ error: 'No existe sesión con ese identificador.' });
            return;
        }

        res.json({
            uuid,
            state: bot.connectionState,
            hasSocketConnected: !!bot.sock,
            qrPending: !!bot.qr && bot.connectionState !== 'open',
            qr: bot.qr || null
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

    private async handleCleanupSession(req: express.Request, res: express.Response): Promise<void> {
        const uuid = this.getUuidParam(req.params.uuid);
        const keepLatest = Number(req.query['keep'] ?? 200);

        console.log(`[API] POST /api/sessions/${uuid}/cleanup (keep=${keepLatest})`);

        try {
            const result = await cleanupSessionStorage(uuid, keepLatest);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }

    private async handleCleanupAllSessions(req: express.Request, res: express.Response): Promise<void> {
        const keepLatest = Number(req.query['keep'] ?? 200);

        console.log(`[API] POST /api/sessions/cleanup (keep=${keepLatest})`);

        try {
            const results = await cleanupAllSessions(keepLatest);
            const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
            res.json({ results, totalDeleted });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    }
}
