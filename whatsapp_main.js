import makeWASocket from 'baileys'
import P from 'pino'
import QRCode from 'qrcode'
import { DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } from 'baileys'
import NodeCache from 'node-cache'

const groupCache = new NodeCache({ /* ... */ })


async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        auth: state, // auth state of your choosing,
        browser: Browsers.macOS("Desktop"), // can be Windows/Ubuntu instead of macOS
        cachedGroupMetadata: async (jid) => groupCache.get(jid),
        logger: P({ level: 'info' }) // you can configure this as much as you want
    })

    sock.ev.on('messages.upsert', async (m) => {
        console.log('\n--- NUEVO EVENTO DE MENSAJE ---')
        console.log(JSON.stringify(m, undefined, 2))

        const msg = m.messages[0]
        if (!msg || !msg.message) return // Asegurarnos de que no crashee si viene vacío

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
        const jid = msg.key.remoteJid

        // Respondemos solo si no es nuestro propio mensaje para evitar bucle
        if (!msg.key.fromMe && text.toLowerCase().includes('chabito')) {
            await sock.sendMessage(jid, { text: '¡Hola! Aquí está tu Chabito.' })
        }
    })

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        // If a QR is received, print it
        if (qr) {
            console.log(await QRCode.toString(qr, { type: 'terminal', small: true }))
        }

        if (connection === 'close') {
            // Reconnect if the reason is NOT that the user has logged out
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('❌ Conexión cerrada debido a: ', lastDisconnect?.error?.message || lastDisconnect?.error)
            console.log('🔄 ¿Reconectar?: ', shouldReconnect)

            if (shouldReconnect) {
                // Wait a bit to avoid maxing out the event loop if the error is persistent
                setTimeout(connectToWhatsApp, 2000)
            } else {
                console.log('⚠️ Has cerrado sesión. Borra la carpeta auth_info_baileys para volver a escanear el QR.')
            }
        } else if (connection === 'open') {
            console.log('✅ ¡Conectado a WhatsApp con éxito!')
        }
    })

    sock.ev.on("creds.update", saveCreds);
}


export { connectToWhatsApp }