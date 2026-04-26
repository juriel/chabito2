import makeWASocket from 'baileys';
import { rm } from 'node:fs/promises';
import P from 'pino';
import QRCode from 'qrcode';
import {
    DisconnectReason,
    useMultiFileAuthState,
    Browsers,
    fetchLatestBaileysVersion
} from 'baileys';
import type {
    ConnectionState,
    BaileysEventMap,
    WASocket
} from 'baileys';
import NodeCache from 'node-cache';
import { Boom } from '@hapi/boom';
import WebSocket, { type RawData } from 'ws';
import type { ChatMessageDto } from '../dto/chat-message-dto.ts';
import { isChatMessageDto } from '../agent/agent-ws-server.ts';

export class WhatsappSocketEnvelope {
    private static readonly AUTH_INFO_DIR = 'auth_info_baileys';

    public uuid: string;
    public waSocket?: WASocket;
    public wsSocket: WebSocket | undefined;
    public qr?: string;
    public connectionState: 'connecting' | 'open' | 'close' | 'undefined' = 'undefined';
    public lastDisconnect?: unknown;
    public get sock(): WASocket | undefined {
        return this.waSocket;
    }

    private readonly groupCache: NodeCache;
    private readonly pendingAgentMessages: ChatMessageDto[] = [];
    private agentSocketReconnectTimeout: NodeJS.Timeout | undefined;
    private isAgentSocketOpen = false;

    constructor(uuid: string) {
        this.uuid = uuid;
        this.groupCache = new NodeCache({});
    }

    public async connect(): Promise<void> {
        this.connectToAgentWebSocket();

        const { state, saveCreds } = await useMultiFileAuthState(this.getSessionAuthPath());
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        this.waSocket = makeWASocket({
            version,
            auth: state,
            browser: Browsers.macOS('Desktop'),
            cachedGroupMetadata: async (jid) => this.groupCache.get(jid) as any,
            logger: P({ level: 'info' }) as any
        });

        this.setupEvents();
        this.waSocket.ev.on('creds.update', saveCreds);
    }

    private connectToAgentWebSocket(): void {
        if (this.wsSocket && (this.wsSocket.readyState === WebSocket.OPEN || this.wsSocket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const serverUrl = process.env.AGENT_WS_URL || `ws://127.0.0.1:${process.env.AGENT_WS_PORT || 8081}`;
        const ws = new WebSocket(serverUrl);
        this.wsSocket = ws;

        ws.on('open', () => {
            this.isAgentSocketOpen = true;
            console.log(`[AGENT-WS] Cliente WhatsApp conectado a ${serverUrl}`);
            this.flushPendingAgentMessages();
        });

        ws.on('message', (data: RawData) => {
            void this.handleAgentSocketMessage(data);
        });

        ws.on('close', () => {
            this.isAgentSocketOpen = false;
            this.wsSocket = undefined;
            this.scheduleAgentSocketReconnect();
        });

        ws.on('error', (error: Error) => {
            this.isAgentSocketOpen = false;
            console.error('[AGENT-WS] Error en socket cliente de WhatsApp:', error);
        });
    }

    private scheduleAgentSocketReconnect(): void {
        if (this.agentSocketReconnectTimeout) {
            return;
        }

        this.agentSocketReconnectTimeout = setTimeout(() => {
            this.agentSocketReconnectTimeout = undefined;
            this.connectToAgentWebSocket();
        }, 2000);
    }

    private async handleAgentSocketMessage(data: RawData): Promise<void> {
        try {
            const rawText = typeof data === 'string' ? data : data.toString('utf8');
            const parsed = JSON.parse(rawText) as unknown;

            if (!isChatMessageDto(parsed)) {
                throw new Error('El servidor no devolvio un ChatMessageDto valido');
            }

            if (parsed.direction !== 'out' || parsed.bot_session !== this.uuid) {
                return;
            }

            await this.waSocket?.sendMessage(parsed.peer_id, { text: parsed.text });
        } catch (error) {
            console.error('[AGENT-WS] Error procesando mensaje del agente:', error);
        }
    }

    private flushPendingAgentMessages(): void {
        while (this.pendingAgentMessages.length > 0) {
            const message = this.pendingAgentMessages.shift();
            if (!message) {
                continue;
            }

            this.sendMessageToAgentSocket(message);
        }
    }

    private sendMessageToAgentSocket(message: ChatMessageDto): void {
        if (!this.wsSocket || !this.isAgentSocketOpen) {
            this.pendingAgentMessages.push(message);
            this.connectToAgentWebSocket();
            return;
        }

        this.wsSocket.send(JSON.stringify(message));
    }

    public async sendTextMessage(to: string, text: string): Promise<void> {
        if (!this.waSocket) {
            throw new Error('El socket de WhatsApp no está conectado');
        }

        // Sanitize: strip +, spaces, dashes, parentheses so we get a clean E.164 number
        const cleanNumber = to.replace(/[\s+\-()]/g, '');
        const jid = cleanNumber.includes('@s.whatsapp.net') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;
        await this.waSocket.sendMessage(jid, { text });
        console.log(`[BAILEYS] Mensaje enviado a tercero desde tool: ${jid}`);
    }

    private setupEvents(): void {
        if (!this.waSocket) return;

        this.waSocket.ev.on('messages.upsert', async (m: BaileysEventMap['messages.upsert']) => {
            await this.handleMessagesUpsert(m);
        });

        this.waSocket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
            await this.handleConnectionUpdate(update);
        });
    }

    private async handleMessagesUpsert(m: BaileysEventMap['messages.upsert']): Promise<void> {
        console.log('\n--- NUEVO EVENTO DE MENSAJE ---');
        console.log(JSON.stringify(m, undefined, 2));

        const msg = m.messages[0];
        if (!msg || !msg.message) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const jid = msg.key.remoteJid;

        if (jid && !msg.key.fromMe && text.trim().length > 0) {
            // Mark as read → sends blue double-tick to the sender
            await this.waSocket?.readMessages([msg.key]);

            const dto = this.toChatMessageDto(msg, text, jid);
            this.sendMessageToAgentSocket(dto);
        }
    }

    private toChatMessageDto(
        msg: BaileysEventMap['messages.upsert']['messages'][number],
        text: string,
        jid: string
    ): ChatMessageDto {
        const timestamp = typeof msg.messageTimestamp === 'number'
            ? msg.messageTimestamp
            : Number(msg.messageTimestamp || Date.now());

        return {
            bot_session: this.uuid,
            agent_id: this.uuid,
            agent_nickname: 'Chabito',
            peer_id: jid,
            peer_nickname: msg.pushName || jid,
            whatsapp_message_id: msg.key.id || '',
            direction: 'in',
            timestamp,
            text,
            attachments: []
        };
    }

    private async handleConnectionUpdate(update: Partial<ConnectionState>): Promise<void> {
        const { connection, lastDisconnect, qr } = update;

        if (connection) this.connectionState = connection as any;
        if (lastDisconnect) this.lastDisconnect = lastDisconnect;
        if (qr) this.qr = qr;

        if (this.qr) {
            console.log(await QRCode.toString(this.qr, { type: 'terminal', small: true }));
        }

        if (this.connectionState === 'close') {
            const statusCode = (this.lastDisconnect as { error?: Boom } | undefined)?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log('❌ Conexión cerrada debido a: ', (this.lastDisconnect as { error?: { message?: string } } | undefined)?.error?.message || this.lastDisconnect);
            console.log('🔄 ¿Reconectar?: ', shouldReconnect);

            if (shouldReconnect) {
                setTimeout(() => this.connect(), 2000);
            } else {
                await this.deleteSessionAuthFolder();
                console.log(`⚠️ Sesión cerrada. Se eliminó la carpeta de autenticación para ${this.uuid}.`);
            }
        } else if (this.connectionState === 'open') {
            console.log('✅ ¡Conectado a WhatsApp con éxito!');
        }
    }

    private getSessionAuthPath(): string {
        return `${WhatsappSocketEnvelope.AUTH_INFO_DIR}/${this.uuid}`;
    }

    private async deleteSessionAuthFolder(): Promise<void> {
        const sessionAuthPath = this.getSessionAuthPath();
        await rm(sessionAuthPath, { recursive: true, force: true });
        delete this.qr;
        delete this.waSocket;
        this.wsSocket?.close();
        this.wsSocket = undefined;
        this.isAgentSocketOpen = false;
    }
}
