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
import type { ChatMessageDto } from '../dto/chat-message-dto.js';
import { sendChatMessageToAgent } from '../agent/agent-ws-server.js';

export class WhatsappSocketEnvelope {
    private static readonly AUTH_INFO_DIR = 'auth_info_baileys';

    public uuid: string;
    public sock?: WASocket;
    public qr?: string;
    public connectionState: 'connecting' | 'open' | 'close' | 'undefined' = 'undefined';
    public lastDisconnect?: any;

    private groupCache: NodeCache;

    constructor(uuid: string) {
        this.uuid = uuid;
        this.groupCache = new NodeCache({});
    }

    public async connect(): Promise<void> {
        const { state, saveCreds } = await useMultiFileAuthState(this.getSessionAuthPath());
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        this.sock = makeWASocket({
            version,
            auth: state,
            browser: Browsers.macOS('Desktop'),
            cachedGroupMetadata: async (jid) => this.groupCache.get(jid) as any,
            logger: P({ level: 'info' }) as any
        });

        this.setupEvents();
        this.sock.ev.on('creds.update', saveCreds);
    }

    private setupEvents(): void {
        if (!this.sock) return;

        this.sock.ev.on('messages.upsert', async (m: BaileysEventMap['messages.upsert']) => {
            await this.handleMessagesUpsert(m);
        });

        this.sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
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
            const dto = this.toChatMessageDto(msg, text, jid);
            const echoedMessage = await sendChatMessageToAgent(dto);

            await this.sock?.sendMessage(jid, { text: echoedMessage.text });
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
            const statusCode = (this.lastDisconnect?.error as Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log('❌ Conexión cerrada debido a: ', this.lastDisconnect?.error?.message || this.lastDisconnect?.error);
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
        delete this.sock;
    }
}
