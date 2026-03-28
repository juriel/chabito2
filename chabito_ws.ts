import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import { WhatsappSocketEnvelope } from './whatsapp_main.js';

const app = express();
app.use(cors());
app.use(express.json());

// Mapa en memoria para mantener múltiples envoltorios controlados por UUID
const activeSessions = new Map<string, WhatsappSocketEnvelope>();

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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
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
});
