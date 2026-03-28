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
    BaileysEventMap
} from 'baileys';
import NodeCache from 'node-cache';
import { Boom } from '@hapi/boom';

const groupCache = new NodeCache({ /* ... */ });

async function connectToWhatsApp(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        auth: state,
        browser: Browsers.macOS("Desktop"),
        cachedGroupMetadata: async (jid) => groupCache.get(jid) as any,
        logger: P({ level: 'info' }) as any
    });

    sock.ev.on('messages.upsert', async (m: BaileysEventMap['messages.upsert']) => {
        console.log('\n--- NUEVO EVENTO DE MENSAJE ---');
        console.log(JSON.stringify(m, undefined, 2));

        const msg = m.messages[0];
        if (!msg || !msg.message) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const jid = msg.key.remoteJid;

        if (jid && !msg.key.fromMe && text.toLowerCase().includes('chabito')) {
            await sock.sendMessage(jid, { text: '¡Hola! Aquí está tu Chabito.' });
        }
    });

    sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Conexión cerrada debido a: ', lastDisconnect?.error?.message || lastDisconnect?.error);
            console.log('🔄 ¿Reconectar?: ', shouldReconnect);

            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 2000);
            } else {
                console.log('⚠️ Has cerrado sesión. Borra la carpeta auth_info_baileys para volver a escanear el QR.');
            }
        } else if (connection === 'open') {
            console.log('✅ ¡Conectado a WhatsApp con éxito!');
        }
    });

    sock.ev.on("creds.update", saveCreds);
}

export { connectToWhatsApp };
