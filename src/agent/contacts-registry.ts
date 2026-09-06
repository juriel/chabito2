import { jidNormalizedUser } from 'baileys';
import { StoreFactory } from '../persistence/index.ts';

/**
 * Registro liviano de "quién le ha escrito a este bot" y qué sabe Baileys de esa
 * persona, indexado por `peerId` (número `@s.whatsapp.net` o `@lid`).
 *
 * Se alimenta de varias fuentes:
 * 1. Cada `ChatMessageDto` entrante (siempre trae al menos el pushName).
 * 2. Los eventos nativos de contacto de Baileys (`contacts.upsert`, `contacts.update`,
 *    `messaging-history.set`), que a veces sí incluyen el `phoneNumber`/`username` real
 *    detrás de un `@lid` — vía sincronización de la libreta de contactos del teléfono,
 *    aunque el propio mensaje no traiga `remoteJidAlt`.
 * 3. El evento `lid-mapping.update` (Baileys ≥7.0.0-rc14), que WhatsApp dispara cuando
 *    vincula un `@lid` a un número real por fuera del flujo normal de mensajes.
 * 4. Una consulta activa por username vía `USyncUsernameProtocol` al guardar el contacto
 *    (ver `WhatsappSocketEnvelope.resolveUsername`).
 */
export interface ContactRecord {
    /** Nombre de WhatsApp visto en el último mensaje (pushName). */
    nickname?: string;
    /** Nombre guardado en la libreta de contactos del teléfono, si Baileys lo sincronizó. */
    name?: string;
    /** Nombre verificado de cuenta de negocio, si aplica. */
    verifiedName?: string;
    /** Número real (`@s.whatsapp.net`), solo si Baileys logró resolverlo. */
    phoneNumber?: string;
    /** Identificador `@lid`, si aplica. */
    lid?: string;
    /** @username de WhatsApp, si la persona tiene uno configurado y Baileys logró verlo. */
    username?: string;
    /** true una vez que el bot ya lo guardó en la libreta de contactos de WhatsApp (addOrEditContact). */
    savedAsContact?: boolean;
    lastSeen: number;
}

export type ContactsMap = Record<string, ContactRecord>;

/** Igual que `Partial<Omit<ContactRecord, 'lastSeen'>>` pero admite `undefined` explícito por campo (Baileys manda objetos parciales con props en `undefined`). */
export type ContactPatch = { [K in keyof Omit<ContactRecord, 'lastSeen'>]?: ContactRecord[K] | undefined };

const CONTACTS_KEY = 'contacts';

function getStore(botSession: string) {
    return StoreFactory.rawFile<ContactsMap>('./data', botSession);
}

/**
 * `upsertContact` hace read-modify-write sobre un único archivo compartido, y se
 * llama sin esperar (`void upsertContact(...)`) desde varios sitios a la vez
 * (por cada mensaje entrante, por cada contacto de un evento `contacts.upsert`,
 * etc.). Sin serializar, dos llamadas concurrentes pueden pisarse (lost update)
 * o, peor, correr `write()` en paralelo sobre el mismo archivo. Esta cola en
 * memoria — una por `botSession` — asegura que solo haya un read-modify-write
 * en vuelo a la vez para ese bot.
 */
const writeQueues = new Map<string, Promise<void>>();

function enqueueWrite(botSession: string, task: () => Promise<void>): Promise<void> {
    const previousTail = writeQueues.get(botSession) ?? Promise.resolve();
    const result = previousTail.then(task, task);
    // La cola nunca debe quedar "trabada" por un error; solo importa el orden.
    writeQueues.set(botSession, result.then(() => undefined, () => undefined));
    return result;
}

/** `jidNormalizedUser` quita el sufijo de dispositivo (":N"); si el jid es inválido devuelve '' — en ese caso preferimos el original a perder el dato. */
function normalizeJid(jid: string): string {
    return jidNormalizedUser(jid) || jid;
}

/**
 * Mezcla `patch` sobre el registro existente para `peerId` (no lo reemplaza),
 * ya que los eventos de Baileys suelen llegar como actualizaciones parciales.
 *
 * Normaliza `peerId` y los campos `phoneNumber`/`lid` del patch (quita sufijo de
 * dispositivo) ACÁ, centralizado — no en cada call site. Ya se nos escapó esta
 * normalización dos veces en distintos puntos de whatsapp-socket-envelope.ts
 * (handleMessagesUpsert, handleContactsEvent) generando registros duplicados
 * para la misma persona; hacerlo en el único lugar por el que todo pasa evita
 * que se nos vuelva a olvidar en un futuro call site.
 */
export async function upsertContact(botSession: string, peerId: string, patch: ContactPatch): Promise<void> {
    if (!peerId) {
        return;
    }

    const normalizedPeerId = normalizeJid(peerId);
    const normalizedPatch: ContactPatch = { ...patch };
    if (patch.phoneNumber) normalizedPatch.phoneNumber = normalizeJid(patch.phoneNumber);
    if (patch.lid) normalizedPatch.lid = normalizeJid(patch.lid);

    await enqueueWrite(botSession, async () => {
        const store = getStore(botSession);
        const result = await store.loadRaw(CONTACTS_KEY);
        const contacts: ContactsMap = result.ok ? result.value : {};

        const existing = contacts[normalizedPeerId];
        const merged: ContactRecord = { ...existing, lastSeen: Date.now() };

        for (const [key, value] of Object.entries(normalizedPatch) as [keyof Omit<ContactRecord, 'lastSeen'>, ContactRecord[keyof ContactRecord]][]) {
            if (value !== undefined && value !== '') {
                (merged as any)[key] = value;
            }
        }

        contacts[normalizedPeerId] = merged;
        await store.saveRaw(CONTACTS_KEY, contacts);
    });
}

export async function listContacts(botSession: string): Promise<ContactsMap> {
    const store = getStore(botSession);
    const result = await store.loadRaw(CONTACTS_KEY);
    return result.ok ? result.value : {};
}
