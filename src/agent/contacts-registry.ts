import { StoreFactory } from '../persistence/index.ts';

/**
 * Registro liviano de "quién le ha escrito a este bot" y qué sabe Baileys de esa
 * persona, indexado por `peerId` (número `@s.whatsapp.net` o `@lid`).
 *
 * Se alimenta de dos fuentes:
 * 1. Cada `ChatMessageDto` entrante (siempre trae al menos el pushName).
 * 2. Los eventos nativos de contacto de Baileys (`contacts.upsert`, `contacts.update`,
 *    `messaging-history.set`), que a veces sí incluyen el `phoneNumber` real detrás
 *    de un `@lid` — vía sincronización de la libreta de contactos del teléfono, aunque
 *    el propio mensaje no traiga `remoteJidAlt`.
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
 * Mezcla `patch` sobre el registro existente para `peerId` (no lo reemplaza),
 * ya que los eventos de Baileys suelen llegar como actualizaciones parciales.
 */
export async function upsertContact(botSession: string, peerId: string, patch: ContactPatch): Promise<void> {
    if (!peerId) {
        return;
    }

    const store = getStore(botSession);
    const result = await store.loadRaw(CONTACTS_KEY);
    const contacts: ContactsMap = result.ok ? result.value : {};

    const existing = contacts[peerId];
    const merged: ContactRecord = { ...existing, lastSeen: Date.now() };

    for (const [key, value] of Object.entries(patch) as [keyof Omit<ContactRecord, 'lastSeen'>, ContactRecord[keyof ContactRecord]][]) {
        if (value !== undefined && value !== '') {
            (merged as any)[key] = value;
        }
    }

    contacts[peerId] = merged;
    await store.saveRaw(CONTACTS_KEY, contacts);
}

export async function listContacts(botSession: string): Promise<ContactsMap> {
    const store = getStore(botSession);
    const result = await store.loadRaw(CONTACTS_KEY);
    return result.ok ? result.value : {};
}
