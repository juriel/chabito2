import makeWASocket from 'baileys';
import { rm } from 'node:fs/promises';
import P from 'pino';
import QRCode from 'qrcode';
import {
    DisconnectReason,
    useMultiFileAuthState,
    Browsers,
    fetchLatestBaileysVersion,
    jidNormalizedUser,
    ALL_WA_PATCH_NAMES,
    USyncQuery,
    USyncUser
} from 'baileys';
import type {
    ConnectionState,
    BaileysEventMap,
    Contact,
    WASocket
} from 'baileys';
import NodeCache from 'node-cache';
import { Boom } from '@hapi/boom';
import WebSocket, { type RawData } from 'ws';
import type { ChatMessageDto } from '../dto/chat-message-dto.ts';
import { isChatMessageDto } from '../agent/agent-ws-server.ts';
import { TaskScheduler } from '../agent/task-scheduler.ts';
import { listContacts, upsertContact } from '../agent/contacts-registry.ts';
import { AgentsMap } from '../agent/agents-map.ts';

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
    private readonly taskScheduler: TaskScheduler;
    private agentSocketReconnectTimeout: NodeJS.Timeout | undefined;
    private isAgentSocketOpen = false;

    constructor(uuid: string) {
        this.uuid = uuid;
        this.groupCache = new NodeCache({});
        
        const modelProvider = (process.env.PI_PROVIDER || 'openai').trim().toLowerCase();
        const modelId = (process.env.PI_MODEL || 'gpt-5-mini').trim();
        this.taskScheduler = new TaskScheduler(uuid, { modelProvider, modelId });
    }

    public async connect(): Promise<void> {
        this.connectToAgentWebSocket();
        void this.taskScheduler.start();

        const { state, saveCreds } = await useMultiFileAuthState(this.getSessionAuthPath());
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        this.waSocket = makeWASocket({
            version,
            auth: state,
            browser: Browsers.appropriate('Desktop'),
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

        const jid = await this.resolveSendJid(to.trim());

        await this.waSocket.sendMessage(jid, { text });
        console.log(`[BAILEYS] Mensaje enviado a tercero desde tool: ${jid}`);

        // Este envío ocurre por fuera del flujo normal prompt→respuesta (manager
        // escribiéndole a un tercero, o la API /send). Si no lo registramos en el
        // historial del destinatario, cuando responda su agente no va a tener
        // contexto de lo que ya se le dijo.
        try {
            await AgentsMap.getInstance().recordOutgoingMessage(this.uuid, jid, text);
        } catch (error) {
            console.error(`[AI-AGENT] Error registrando mensaje saliente en el historial de ${jid}:`, error);
        }
    }

    /**
     * Resuelve el identificador que llega de una tool/API (managers.txt, un
     * parámetro de tool, etc.) a un JID realmente enviable.
     *
     * BUG que esto corrige: `managers.txt` guarda solo dígitos (ej: "215504413290734"),
     * y ese id puede ser un número de teléfono real O el id numérico de un @lid — no
     * hay forma de saberlo mirando solo los dígitos. Asumir siempre `@s.whatsapp.net`
     * producía un JID inexistente para managers/contactos cuyo número real WhatsApp
     * nunca expuso (solo @lid): el envío no fallaba (Baileys no lanza error), pero
     * el mensaje nunca llegaba, y además creaba una conversación nueva y separada
     * (`conversation-<id>_s.whatsapp.net.json`) en vez de sumarse al historial real
     * de esa persona (`conversation-<id>_lid.json`).
     *
     * Prioridad:
     * 1. Si ya es un JID completo (@lid/@s.whatsapp.net/@g.us), se usa tal cual.
     * 2. Si los dígitos coinciden con un contacto conocido (por su peerId o su
     *    phoneNumber resuelto), se usa el peerId real de ese contacto.
     * 3. Si no hay match conocido, se asume número de teléfono nuevo y se arma
     *    `${dígitos}@s.whatsapp.net` (comportamiento anterior).
     */
    private async resolveSendJid(to: string): Promise<string> {
        const isFullJid = to.endsWith('@lid') || to.endsWith('@s.whatsapp.net') || to.endsWith('@g.us');
        if (isFullJid) {
            // Por si viene con sufijo de dispositivo (ej: "...:0@s.whatsapp.net") — mismo
            // motivo que la normalización en handleMessagesUpsert.
            return jidNormalizedUser(to) || to;
        }

        const shortId = to.replace(/[\s+\-()]/g, '').toLowerCase();
        const contacts = await listContacts(this.uuid);

        for (const [peerId, info] of Object.entries(contacts)) {
            const peerShortId = peerId.split('@')[0]?.toLowerCase();
            const phoneShortId = info.phoneNumber?.split('@')[0]?.toLowerCase();

            if (peerShortId === shortId || phoneShortId === shortId) {
                if (peerId !== `${shortId}@s.whatsapp.net`) {
                    console.log(`[BAILEYS] 🔎 Identificador "${to}" resuelto contra contacto conocido: ${peerId}`);
                }
                return peerId;
            }
        }

        return `${shortId}@s.whatsapp.net`;
    }

    private setupEvents(): void {
        if (!this.waSocket) return;

        this.waSocket.ev.on('messages.upsert', async (m: BaileysEventMap['messages.upsert']) => {
            await this.handleMessagesUpsert(m);
        });

        this.waSocket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
            await this.handleConnectionUpdate(update);
        });

        // Baileys expone la libreta de contactos sincronizada del teléfono via estos
        // eventos; a veces trae el phoneNumber real detrás de un @lid aunque el propio
        // mensaje no incluya remoteJidAlt.
        this.waSocket.ev.on('contacts.upsert', (contacts: BaileysEventMap['contacts.upsert']) => {
            this.handleContactsEvent(contacts);
        });

        this.waSocket.ev.on('contacts.update', (contacts: BaileysEventMap['contacts.update']) => {
            this.handleContactsEvent(contacts);
        });

        this.waSocket.ev.on('messaging-history.set', ({ contacts }: BaileysEventMap['messaging-history.set']) => {
            if (contacts?.length) {
                console.log(`[BAILEYS] Sincronización inicial de contactos: ${contacts.length}`);
                this.handleContactsEvent(contacts);
            }
        });

        // Baileys ≥7.0.0-rc14: WhatsApp puede vincular un @lid a un número real por fuera
        // del flujo normal de mensajes (pnForLidChatAction); antes este evento estaba
        // declarado pero nunca se emitía.
        this.waSocket.ev.on('lid-mapping.update', ({ lid, pn }: BaileysEventMap['lid-mapping.update']) => {
            console.log(`[BAILEYS] 🔗 lid-mapping.update: ${lid} → ${pn}`);
            void upsertContact(this.uuid, lid, { phoneNumber: pn });
        });
    }

    private handleContactsEvent(contacts: Partial<Contact>[]): void {
        for (const contact of contacts) {
            if (!contact.id) continue;

            void upsertContact(this.uuid, contact.id, {
                name: contact.name,
                verifiedName: contact.verifiedName,
                nickname: contact.notify,
                phoneNumber: contact.phoneNumber,
                lid: contact.lid,
                username: contact.username
            });
        }
    }

    /**
     * Consulta activamente el @username de WhatsApp de un JID via USyncUsernameProtocol
     * (Baileys ≥7.0.0-rc14). Devuelve `undefined` si no tiene username o no se pudo resolver.
     */
    private async resolveUsername(jid: string): Promise<string | undefined> {
        if (!this.waSocket) return undefined;

        try {
            const query = new USyncQuery().withUsernameProtocol().withUser(new USyncUser().withId(jid));
            const result = await this.waSocket.executeUSyncQuery(query);
            console.log(`[BAILEYS] USync username query para ${jid} →`, JSON.stringify(result));

            const entry = result?.list.find((item) => item.id === jid) ?? result?.list[0];
            const username = entry?.['username'];

            return typeof username === 'string' && username.length > 0 ? username : undefined;
        } catch (error) {
            console.error(`[BAILEYS] Error resolviendo username de ${jid}:`, error);
            return undefined;
        }
    }

    private async handleMessagesUpsert(m: BaileysEventMap['messages.upsert']): Promise<void> {
        console.log('\n--- NUEVO EVENTO DE MENSAJE ---');
        console.log(JSON.stringify(m, undefined, 2));

        const msg = m.messages[0];
        if (!msg || !msg.message) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        
        let jid = msg.key.remoteJid || '';
        const altJid = (msg.key as any).remoteJidAlt;
        
        console.log(`[BAILEYS] Analizando JIDs - Principal: ${jid}, Alt: ${altJid}`);

        // Strong preference for @s.whatsapp.net (phone numbers)
        if (jid.endsWith('@s.whatsapp.net')) {
            // Keep it, it's already a phone number
        } else if (altJid?.endsWith('@s.whatsapp.net')) {
            console.log(`[BAILEYS] 🔄 Cambiando LID ${jid} por Phone ${altJid}`);
            jid = altJid;
        } else if (altJid) {
            // Fallback if no phone number but we have an alternative
            console.log(`[BAILEYS] Usando JID alternativo: ${altJid}`);
            jid = altJid;
        }

        // WhatsApp no siempre envía el número en el propio mensaje (remoteJidAlt vacío).
        // Como último recurso, consultamos el mapeo LID↔número que Baileys ya tenga
        // persistido de interacciones previas con este mismo contacto.
        if (jid.endsWith('@lid')) {
            const resolvedPn = await this.waSocket?.signalRepository.lidMapping.getPNForLID(jid);
            if (resolvedPn) {
                console.log(`[BAILEYS] 🔄 Resuelto LID ${jid} → Phone ${resolvedPn} vía lidMapping store`);
                jid = resolvedPn;
            }
        }

        // Normaliza (quita sufijo de dispositivo ":N", ej "573004654724:0@...").
        // Sin esto, el mismo contacto escribiendo desde distintos dispositivos vinculados
        // generaba una conversación/agente separado por cada variante del JID.
        if (jid) {
            const normalized = jidNormalizedUser(jid);
            if (normalized && normalized !== jid) {
                console.log(`[BAILEYS] 🔧 JID normalizado (sin sufijo de dispositivo): ${jid} → ${normalized}`);
                jid = normalized;
            }
        }

        if (jid && !msg.key.fromMe && text.trim().length > 0) {
            // Mark as read → sends blue double-tick to the sender
            await this.waSocket?.readMessages([msg.key]);

            const dto = this.toChatMessageDto(msg, text, jid);
            this.sendMessageToAgentSocket(dto);
            void this.ensureWhatsAppContact(jid, dto.peer_nickname);
        }
    }

    /**
     * Guarda a quien escribe en la libreta de contactos de WhatsApp de este bot
     * (mismo mecanismo que usa la app oficial al guardar un contacto manualmente).
     * Solo se ejecuta una vez por peer — se apoya en el registro local para no
     * reenviar el patch en cada mensaje.
     */
    private async ensureWhatsAppContact(jid: string, nickname: string): Promise<void> {
        if (!this.waSocket) return;
        // Solo tiene sentido para personas (número o @lid), no grupos/canales/broadcasts.
        if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@lid')) return;

        try {
            const known = await listContacts(this.uuid);
            if (known[jid]?.savedAsContact) return;

            const username = await this.resolveUsername(jid);

            await this.waSocket.addOrEditContact(jid, {
                fullName: nickname || jid.split('@')[0] || jid,
                saveOnPrimaryAddressbook: true
            });

            await upsertContact(this.uuid, jid, { savedAsContact: true, username });
            console.log(`[BAILEYS] 📇 Contacto agregado a la libreta de WhatsApp: ${jid} (${nickname})${username ? ` @${username}` : ''}`);
        } catch (error) {
            console.error(`[BAILEYS] Error agregando contacto ${jid}:`, error);
        }
    }

    /**
     * Re-resuelve y re-guarda la información de un contacto ya conocido, a pedido
     * (tool `update_contact`). A diferencia de `ensureWhatsAppContact`, no respeta el
     * flag `savedAsContact` — siempre reintenta resolver número real (si `jid` es un
     * @lid) y @username, y vuelve a llamar `addOrEditContact`.
     */
    public async refreshContact(jid: string): Promise<{ ok: true; phoneNumber: string | undefined; username: string | undefined } | { ok: false; error: string }> {
        if (!this.waSocket) {
            return { ok: false, error: 'El socket de WhatsApp no está conectado' };
        }

        try {
            let resolvedJid = jid;
            if (resolvedJid.endsWith('@lid')) {
                const resolvedPn = await this.waSocket.signalRepository.lidMapping.getPNForLID(resolvedJid);
                if (resolvedPn) {
                    console.log(`[BAILEYS] 🔄 update_contact: LID ${resolvedJid} → Phone ${resolvedPn}`);
                    resolvedJid = resolvedPn;
                }
            }

            const username = await this.resolveUsername(resolvedJid);
            const known = await listContacts(this.uuid);
            const nickname = known[jid]?.nickname || known[resolvedJid]?.nickname || resolvedJid.split('@')[0] || resolvedJid;

            await this.waSocket.addOrEditContact(resolvedJid, {
                fullName: nickname,
                saveOnPrimaryAddressbook: true
            });

            const phoneNumber = resolvedJid.endsWith('@s.whatsapp.net') ? resolvedJid : undefined;

            await upsertContact(this.uuid, resolvedJid, { savedAsContact: true, username, phoneNumber });
            if (resolvedJid !== jid) {
                // El registro original bajo el @lid también se beneficia de conocer el número real.
                await upsertContact(this.uuid, jid, { phoneNumber });
            }

            console.log(`[BAILEYS] 🔁 Contacto actualizado: ${jid}${resolvedJid !== jid ? ` (→ ${resolvedJid})` : ''}${username ? ` @${username}` : ''}`);
            return { ok: true, phoneNumber, username };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[BAILEYS] Error actualizando contacto ${jid}:`, error);
            return { ok: false, error: message };
        }
    }

    /**
     * Fuerza una resincronización completa del app-state de WhatsApp (las 5
     * colecciones: critical_block, critical_unblock_low, regular_high, regular_low,
     * regular). No sabemos en cuál vive exactamente `contactAction`/`lidContactAction`
     * — en nuestros propios logs vimos "resyncing critical_unblock_low" tras guardar
     * un contacto — así que pedimos todas para no perder nada.
     *
     * A diferencia de `ensureWhatsAppContact`/`refreshContact` (que solo conocen
     * gente que ya escribió), esto trae TODOS los contactos guardados en la cuenta
     * del bot: WhatsApp reenvía los parches `contactAction`/`lidContactAction`
     * acumulados, que vuelven a pasar por `contacts.upsert` (ya suscripto en
     * `setupEvents`) y terminan en el registro local igual que siempre.
     */
    public async syncContacts(): Promise<{ ok: true; totalContacts: number } | { ok: false; error: string }> {
        if (!this.waSocket) {
            return { ok: false, error: 'El socket de WhatsApp no está conectado' };
        }

        try {
            console.log('[BAILEYS] 🔄 Forzando resync de app-state para traer todos los contactos...');
            await this.waSocket.resyncAppState(ALL_WA_PATCH_NAMES, false);

            const contacts = await listContacts(this.uuid);
            const totalContacts = Object.keys(contacts).length;
            console.log(`[BAILEYS] ✅ Resync completo. Contactos conocidos: ${totalContacts}`);

            return { ok: true, totalContacts };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[BAILEYS] Error sincronizando contactos:', error);
            return { ok: false, error: message };
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
        this.taskScheduler.stop();
        const sessionAuthPath = this.getSessionAuthPath();
        await rm(sessionAuthPath, { recursive: true, force: true });
        delete this.qr;
        delete this.waSocket;
        this.wsSocket?.close();
        this.wsSocket = undefined;
        this.isAgentSocketOpen = false;
    }
}
