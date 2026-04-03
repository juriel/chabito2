import makeWASocket from 'baileys';
import P from 'pino';
import QRCode from 'qrcode';
import { DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } from 'baileys';
import NodeCache from 'node-cache';
import { Boom } from '@hapi/boom';
import { sendChatMessageToAgent } from './agent/agent-ws-server.js';
export class WhatsappSocketEnvelope {
    // Máquina de estados
    uuid;
    sock;
    qr;
    connectionState = 'undefined';
    lastDisconnect;
    groupCache;
    constructor(uuid) {
        this.uuid = uuid;
        this.groupCache = new NodeCache({ /* ... */});
    }
    async connect() {
        const { state, saveCreds } = await useMultiFileAuthState(`auth_info_baileys/${this.uuid}`);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);
        this.sock = makeWASocket({
            version,
            auth: state,
            browser: Browsers.macOS("Desktop"),
            cachedGroupMetadata: async (jid) => this.groupCache.get(jid),
            logger: P({ level: 'info' })
        });
        // Configurar Eventos
        this.setupEvents();
        // Guardar credenciales al cambiar
        this.sock.ev.on("creds.update", saveCreds);
    }
    setupEvents() {
        if (!this.sock)
            return;
        this.sock.ev.on('messages.upsert', async (m) => {
            await this.handleMessagesUpsert(m);
        });
        this.sock.ev.on('connection.update', async (update) => {
            await this.handleConnectionUpdate(update);
        });
    }
    async handleMessagesUpsert(m) {
        console.log('\n--- NUEVO EVENTO DE MENSAJE ---');
        console.log(JSON.stringify(m, undefined, 2));
        const msg = m.messages[0];
        if (!msg || !msg.message)
            return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const jid = msg.key.remoteJid;
        if (jid && !msg.key.fromMe && text.trim().length > 0) {
            const dto = this.toChatMessageDto(msg, text, jid);
            const echoedMessage = await sendChatMessageToAgent(dto);
            await this.sock?.sendMessage(jid, { text: echoedMessage.text });
        }
    }
    toChatMessageDto(msg, text, jid) {
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
    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;
        // Actualizamos estado de la instancia
        if (connection)
            this.connectionState = connection;
        if (lastDisconnect)
            this.lastDisconnect = lastDisconnect;
        if (qr)
            this.qr = qr;
        if (this.qr) {
            console.log(await QRCode.toString(this.qr, { type: 'terminal', small: true }));
        }
        if (this.connectionState === 'close') {
            const statusCode = this.lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexión cerrada debido a: ', this.lastDisconnect?.error?.message || this.lastDisconnect?.error);
            console.log('🔄 ¿Reconectar?: ', shouldReconnect);
            if (shouldReconnect) {
                // Volver a establecer conexión invocándose a sí mismo
                setTimeout(() => this.connect(), 2000);
            }
            else {
                console.log('⚠️ Has cerrado sesión. Borra la carpeta auth_info_baileys para volver a escanear el QR.');
            }
        }
        else if (this.connectionState === 'open') {
            console.log('✅ ¡Conectado a WhatsApp con éxito!');
        }
    }
}
//# sourceMappingURL=whatsapp_main.js.map