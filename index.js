import makeWASocket from 'baileys'
import P from 'pino'
const groupCache = new NodeCache({ /* ... */ })
import QRCode from 'qrcode'
import { DisconnectReason, useMultiFileAuthState, Browsers, fetchLatestBaileysVersion } from 'baileys'
import NodeCache from 'node-cache'

const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
const { version, isLatest } = await fetchLatestBaileysVersion();
console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

const sock = makeWASocket({
    version,
    auth: state, // auth state of your choosing,
    browser: Browsers.macOS("Desktop"), // can be Windows/Ubuntu instead of macOS
    cachedGroupMetadata: async (jid) => groupCache.get(jid),


    logger: P() // you can configure this as much as you want, even including streaming the logs to a ReadableStream for upload or saving to a file
})


sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    // on a qr event, the connection and lastDisconnect fields will be empty

    // In prod, send this string to your frontend then generate the QR there
    if (qr) {
        // as an example, this prints the qr code to the terminal
        console.log(await QRCode.toString(qr, { type: 'terminal', small: true }))
    }
})

sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close' && (lastDisconnect?.error)?.output?.statusCode === DisconnectReason.restartRequired) {
        // create a new socket, this socket is now useless
    }
})

// sock.ev.on('connection.update', async (update) => {
//     const { connection, lastDisconnect, qr } = update
//     const phoneNumber = "YOUR_PHONE_NUMBER" // replace this
//     if (connection == "connecting" || !!qr) { // your choice
//         try {
//             const code = await sock.requestPairingCode(phoneNumber)
//             console.log("Pairing code: ", code)
//         } catch(err) {
//             // ignore error
//         }
//     }
// })


sock.ev.on("creds.update", saveCreds);

