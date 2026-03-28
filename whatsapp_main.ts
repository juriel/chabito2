import makeWASocket from 'baileys';
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

export class WhatsappSocketEnvelope {
    // Máquina de estados
    public sock?: WASocket;
    public qr?: string;
    public connectionState: 'connecting' | 'open' | 'close' | 'undefined' = 'undefined';
    public lastDisconnect?: any;
    
    private groupCache: NodeCache;

    constructor() {
        this.groupCache = new NodeCache({ /* ... */ });
    }

    public async connect(): Promise<void> {
        const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        this.sock = makeWASocket({
            version,
            auth: state,
            browser: Browsers.macOS("Desktop"),
            cachedGroupMetadata: async (jid) => this.groupCache.get(jid) as any,
            logger: P({ level: 'info' }) as any
        });

        // Configurar Eventos
        this.setupEvents();
        
        // Guardar credenciales al cambiar
        this.sock.ev.on("creds.update", saveCreds);
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

        if (jid && !msg.key.fromMe && text.toLowerCase().includes('chabito')) {
            await this.sock?.sendMessage(jid, { text: '¡Hola! Aquí está tu Chabito.' });
        }
    }

    private async handleConnectionUpdate(update: Partial<ConnectionState>): Promise<void> {
        const { connection, lastDisconnect, qr } = update;
        
        // Actualizamos estado de la instancia
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
                // Volver a establecer conexión invocándose a sí mismo
                setTimeout(() => this.connect(), 2000);
            } else {
                console.log('⚠️ Has cerrado sesión. Borra la carpeta auth_info_baileys para volver a escanear el QR.');
            }
        } else if (this.connectionState === 'open') {
            console.log('✅ ¡Conectado a WhatsApp con éxito!');
        }
    }
}
