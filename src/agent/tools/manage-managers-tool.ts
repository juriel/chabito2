import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { StoreFactory } from '../../persistence/index.ts';
import { listContacts, type ContactsMap } from '../contacts-registry.ts';

// --- ADD MANAGER ---
export const addManagerParams = Type.Object({
    identifier: Type.String({
        description: 'El identificador del nuevo manager: su número de teléfono con código de país (ej: 573001234567), o — si WhatsApp no expone su número — su identificador @lid completo obtenido con list_contacts (ej: 123456789012345@lid).'
    }),
    name: Type.String({ description: 'El nombre completo o apodo del manager.' })
});

export function createAddManagerTool(botSession: string): AgentTool<typeof addManagerParams> {
    return {
        name: 'add_manager',
        label: 'Add Manager',
        description: 'Agrega un nuevo manager autorizado para administrar este chatbot. Usa list_contacts primero si no conoces el identificador exacto de la persona.',
        parameters: addManagerParams,
        execute: async (_toolCallId, params) => {
            const textStore = StoreFactory.text('./data', botSession);
            const targetNumber = params.identifier.trim().split('@')[0].toLowerCase();
            const targetName = params.name.trim();

            try {
                const result = await textStore.load('managers');
                const content = result.ok ? result.value : '';
                const lines = content.split('\n');
                const managers = lines.filter(l => l.trim().length > 0 && !l.trim().startsWith('#'));

                if (managers.some(m => m.split(/\s+/)[0].toLowerCase() === targetNumber)) {
                    return { content: [{ type: 'text', text: `⚠️ El usuario ${targetNumber} ya es un manager.` }] };
                }

                await textStore.append('managers', `${targetNumber} ${targetName}\n`);
                return { content: [{ type: 'text', text: `✅ Manager ${targetName} (${targetNumber}) agregado correctamente.` }] };
            } catch (error: any) {
                return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }] };
            }
        }
    };
}

// --- REMOVE MANAGER ---
export const removeManagerParams = Type.Object({
    identifier: Type.String({ description: 'El número de teléfono o el identificador @lid del manager a eliminar (ver list_managers).' })
});

export function createRemoveManagerTool(botSession: string): AgentTool<typeof removeManagerParams> {
    return {
        name: 'remove_manager',
        label: 'Remove Manager',
        description: 'Elimina a un manager de la lista de autorizados.',
        parameters: removeManagerParams,
        execute: async (_toolCallId, params) => {
            const textStore = StoreFactory.text('./data', botSession);
            const targetNumber = params.identifier.trim().split('@')[0].toLowerCase();

            try {
                const result = await textStore.load('managers');
                if (!result.ok) throw new Error('No se pudo cargar la lista.');

                const lines = result.value.split('\n');
                const newLines = lines.filter(line => {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('#') || trimmed.length === 0) return true;
                    return trimmed.split(/\s+/)[0].toLowerCase() !== targetNumber;
                });

                if (newLines.length === lines.length) {
                    return { content: [{ type: 'text', text: `⚠️ No se encontró al manager con número ${targetNumber}.` }] };
                }

                await textStore.save('managers', newLines.join('\n') + '\n');
                return { content: [{ type: 'text', text: `✅ Manager ${targetNumber} eliminado.` }] };
            } catch (error: any) {
                return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }] };
            }
        }
    };
}

// --- LIST MANAGERS ---
export const listManagersParams = Type.Object({});

export function createListManagersTool(botSession: string): AgentTool<typeof listManagersParams> {
    return {
        name: 'list_managers',
        label: 'List Managers',
        description: 'Muestra la lista de todos los managers autorizados.',
        parameters: listManagersParams,
        execute: async () => {
            const textStore = StoreFactory.text('./data', botSession);
            try {
                const result = await textStore.load('managers');
                if (!result.ok) return { content: [{ type: 'text', text: '📋 No hay managers configurados.' }] };

                const managers = result.value.split('\n')
                    .map(l => l.trim())
                    .filter(l => l.length > 0 && !l.startsWith('#'));

                return {
                    content: [{
                        type: 'text',
                        text: `📋 *Managers autorizados:*\n${managers.map(m => `- ${m}`).join('\n')}`
                    }]
                };
            } catch (error: any) {
                return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }] };
            }
        }
    };
}

// --- LIST CONTACTS ---
export const listContactsParams = Type.Object({});

export function createListContactsTool(botSession: string): AgentTool<typeof listContactsParams> {
    return {
        name: 'list_contacts',
        label: 'List Contacts',
        description: 'Muestra el nombre, número (cuando Baileys logró resolverlo) e identificador @lid de las personas que le han escrito a este chatbot. Úsala para identificar a alguien antes de agregarlo como manager con add_manager, ya que WhatsApp no siempre expone el número real de un contacto.',
        parameters: listContactsParams,
        execute: async () => {
            try {
                const [contacts, managersResult] = await Promise.all([
                    listContacts(botSession),
                    StoreFactory.text('./data', botSession).load('managers')
                ]);

                const entries = Object.entries(contacts);
                if (entries.length === 0) {
                    return { content: [{ type: 'text', text: '📋 Aún no hay contactos registrados para este chatbot.' }] };
                }

                const managerIds = new Set(
                    (managersResult.ok ? managersResult.value : '')
                        .split('\n')
                        .map((line) => line.trim())
                        .filter((line) => line.length > 0 && !line.startsWith('#'))
                        .map((line) => line.split(/\s+/)[0]?.toLowerCase())
                );

                entries.sort((a, b) => b[1].lastSeen - a[1].lastSeen);

                const lines = entries.map(([peerId, info]) => {
                    const displayName = info.name || info.verifiedName || info.nickname || peerId;
                    const shortId = peerId.split('@')[0]?.toLowerCase() || '';
                    const tag = managerIds.has(shortId) ? ' _(ya es manager)_' : '';

                    // Preferimos el número real como identificador para add_manager cuando
                    // Baileys logró resolverlo (más legible); si no, el propio peerId (@lid).
                    const identifier = info.phoneNumber
                        ? info.phoneNumber.split('@')[0]
                        : peerId;
                    const username = info.username ? ` (@${info.username})` : '';

                    return `- *${displayName}*${username} → \`${identifier}\`${tag}`;
                });

                return {
                    content: [{
                        type: 'text',
                        text: `📋 *Contactos conocidos:*\n${lines.join('\n')}\n\nUsa el identificador mostrado (número o @lid) con add_manager.`
                    }]
                };
            } catch (error: any) {
                return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }] };
            }
        }
    };
}

// --- SEARCH CONTACTS ---

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;

function normalizeToken(value: string): string {
    return value
        .normalize('NFD')
        .replace(DIACRITICS_REGEX, '') // quita acentos (á → a, etc.)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/** Distancia de Levenshtein clásica (edits mínimos para convertir `a` en `b`). */
function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[] = new Array(n + 1);
    for (let j = 0; j <= n; j++) dp[j] = j;

    for (let i = 1; i <= m; i++) {
        let prev = dp[0] ?? 0;
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
            const temp = dp[j] ?? 0;
            dp[j] = a[i - 1] === b[j - 1]
                ? prev
                : 1 + Math.min(prev, temp, dp[j - 1] ?? 0);
            prev = temp;
        }
    }

    return dp[n] ?? Math.max(m, n);
}

/**
 * Dos palabras "matchean" si una contiene a la otra, o si están a pocos
 * errores de tipeo de distancia (tolerancia proporcional al largo).
 */
function tokensMatch(queryToken: string, candidateToken: string): boolean {
    if (!queryToken || !candidateToken) return false;
    if (candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) return true;

    const maxDistance = Math.max(1, Math.floor(Math.min(queryToken.length, candidateToken.length) / 3));
    return levenshtein(queryToken, candidateToken) <= maxDistance;
}

export const searchContactsParams = Type.Object({
    query: Type.String({
        description: 'Texto a buscar (nombre completo o parcial). Tolera errores de tipeo y no importa el orden de las palabras, ej: "Tores JAime" encuentra a "Jaime Uriel Torres".'
    })
});

export function createSearchContactsTool(botSession: string): AgentTool<typeof searchContactsParams> {
    return {
        name: 'search_contacts',
        label: 'Search Contacts',
        description: 'Busca entre los contactos conocidos por nombre, tolerando errores de tipeo (typos) y sin importar el orden de las palabras. Úsala cuando no recuerdes el nombre exacto o el identificador de alguien antes de usar add_manager o send_whatsapp_message.',
        parameters: searchContactsParams,
        execute: async (_toolCallId, params) => {
            const queryTokens = params.query
                .split(/\s+/)
                .map(normalizeToken)
                .filter((token) => token.length > 0);

            if (queryTokens.length === 0) {
                return { content: [{ type: 'text', text: '⚠️ Escribe algún texto para buscar.' }] };
            }

            try {
                const [contacts, managersResult] = await Promise.all([
                    listContacts(botSession),
                    StoreFactory.text('./data', botSession).load('managers')
                ]);

                const managerIds = new Set(
                    (managersResult.ok ? managersResult.value : '')
                        .split('\n')
                        .map((line) => line.trim())
                        .filter((line) => line.length > 0 && !line.startsWith('#'))
                        .map((line) => line.split(/\s+/)[0]?.toLowerCase())
                );

                const scored = Object.entries(contacts).map(([peerId, info]) => {
                    const displayName = info.name || info.verifiedName || info.nickname || peerId;
                    const candidateTokens = [info.name, info.verifiedName, info.nickname, info.username]
                        .filter((value): value is string => !!value)
                        .flatMap((value) => value.split(/\s+/))
                        .map(normalizeToken)
                        .filter((token) => token.length > 0);

                    // Cada palabra buscada debe encontrar alguna palabra del contacto que la
                    // contenga o esté a pocos typos de distancia — el orden no importa.
                    const matchedCount = queryTokens.filter((queryToken) =>
                        candidateTokens.some((candidateToken) => tokensMatch(queryToken, candidateToken))
                    ).length;

                    return { peerId, info, displayName, score: matchedCount / queryTokens.length };
                });

                const matches = scored
                    .filter((m) => m.score > 0)
                    .sort((a, b) => b.score - a.score || b.info.lastSeen - a.info.lastSeen)
                    .slice(0, 10);

                if (matches.length === 0) {
                    return { content: [{ type: 'text', text: `🔍 No encontré contactos que coincidan con "${params.query}".` }] };
                }

                const lines = matches.map(({ peerId, info, displayName, score }) => {
                    const shortId = peerId.split('@')[0]?.toLowerCase() || '';
                    const tag = managerIds.has(shortId) ? ' _(ya es manager)_' : '';
                    const identifier = info.phoneNumber ? info.phoneNumber.split('@')[0] : peerId;
                    const username = info.username ? ` (@${info.username})` : '';
                    const confidence = score < 1 ? ` _(${Math.round(score * 100)}% match)_` : '';

                    return `- *${displayName}*${username} → \`${identifier}\`${confidence}${tag}`;
                });

                return {
                    content: [{
                        type: 'text',
                        text: `🔍 *Resultados para "${params.query}":*\n${lines.join('\n')}`
                    }]
                };
            } catch (error: any) {
                return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }] };
            }
        }
    };
}

// --- UPDATE CONTACT ---

/**
 * Encuentra el `peerId` (clave completa en el registro) que corresponde al
 * `identifier` que escribió el manager: puede ser el peerId completo, solo los
 * dígitos de un número, o solo el id numérico de un @lid.
 */
function resolvePeerId(contacts: ContactsMap, identifier: string): string | undefined {
    const trimmed = identifier.trim();
    if (contacts[trimmed]) return trimmed;

    const shortId = trimmed.split('@')[0]?.toLowerCase();
    if (!shortId) return undefined;

    for (const [peerId, info] of Object.entries(contacts)) {
        const peerShortId = peerId.split('@')[0]?.toLowerCase();
        const phoneShortId = info.phoneNumber?.split('@')[0]?.toLowerCase();
        if (peerShortId === shortId || phoneShortId === shortId) {
            return peerId;
        }
    }

    return undefined;
}

export const updateContactParams = Type.Object({
    identifier: Type.String({
        description: 'Número de teléfono o identificador @lid de un contacto ya conocido (ver list_contacts / search_contacts).'
    })
});

export function createUpdateContactTool(botSession: string): AgentTool<typeof updateContactParams> {
    return {
        name: 'update_contact',
        label: 'Update Contact',
        description: 'Vuelve a resolver la información de un contacto ya conocido: intenta encontrar su número real detrás del @lid y su @username, y lo re-guarda en la libreta de WhatsApp. Úsala si list_contacts/search_contacts muestran datos incompletos o si sospechas que cambiaron.',
        parameters: updateContactParams,
        execute: async (_toolCallId, params) => {
            try {
                const contacts = await listContacts(botSession);
                const peerId = resolvePeerId(contacts, params.identifier);

                if (!peerId) {
                    return {
                        content: [{
                            type: 'text',
                            text: `⚠️ No encontré ningún contacto conocido con el identificador "${params.identifier}". Usa list_contacts o search_contacts primero.`
                        }]
                    };
                }

                const port = process.env.PORT || 3000;
                const url = `http://127.0.0.1:${port}/api/sessions/${encodeURIComponent(botSession)}/contacts/refresh`;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ peerId })
                });

                const data = await response.json() as {
                    success?: boolean;
                    phoneNumber?: string;
                    username?: string;
                    error?: string;
                };

                if (!response.ok || !data.success) {
                    return { content: [{ type: 'text', text: `❌ No pude actualizar el contacto: ${data.error || 'error desconocido'}` }] };
                }

                const details: string[] = [];
                if (data.phoneNumber) details.push(`número: ${data.phoneNumber.split('@')[0]}`);
                if (data.username) details.push(`username: @${data.username}`);

                return {
                    content: [{
                        type: 'text',
                        text: `✅ Contacto actualizado (${peerId}).${details.length ? ' ' + details.join(', ') + '.' : ' No se encontró número real ni @username adicionales.'}`
                    }]
                };
            } catch (error: any) {
                return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }] };
            }
        }
    };
}

// --- SYNC CONTACTS ---
export const syncContactsParams = Type.Object({});

export function createSyncContactsTool(botSession: string): AgentTool<typeof syncContactsParams> {
    return {
        name: 'sync_contacts',
        label: 'Sync Contacts',
        description: 'Fuerza una resincronización con WhatsApp para traer TODOS los contactos guardados en la cuenta de este bot, no solo quienes ya le han escrito. Puede tardar unos segundos. Úsala antes de list_contacts/search_contacts si buscas a alguien que aún no le ha escrito al bot.',
        parameters: syncContactsParams,
        execute: async () => {
            try {
                const before = Object.keys(await listContacts(botSession)).length;

                const port = process.env.PORT || 3000;
                const url = `http://127.0.0.1:${port}/api/sessions/${encodeURIComponent(botSession)}/contacts/sync`;

                const response = await fetch(url, { method: 'POST' });
                const data = await response.json() as { success?: boolean; totalContacts?: number; error?: string };

                if (!response.ok || !data.success) {
                    return { content: [{ type: 'text', text: `❌ No pude sincronizar contactos: ${data.error || 'error desconocido'}` }] };
                }

                const after = data.totalContacts ?? 0;
                const delta = after - before;
                const deltaText = delta > 0 ? ` (+${delta} nuevos)` : delta < 0 ? ` (${delta})` : ' (sin cambios)';

                return {
                    content: [{
                        type: 'text',
                        text: `🔄 Sincronización completa. Contactos conocidos: ${after}${deltaText}. Usa list_contacts o search_contacts para verlos.`
                    }]
                };
            } catch (error: any) {
                return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }] };
            }
        }
    };
}

// --- FIND BY USERNAME ---
export const findByUsernameParams = Type.Object({
    username: Type.String({ description: 'El @username de WhatsApp a buscar (con o sin el @ inicial).' })
});

export function createFindByUsernameTool(botSession: string): AgentTool<typeof findByUsernameParams> {
    return {
        name: 'find_by_username',
        label: 'Find By Username',
        description: 'Busca a una persona por su @username de WhatsApp y devuelve su identificador (JID) para poder agregarla como manager o escribirle, incluso si nunca le ha escrito a este chatbot antes.',
        parameters: findByUsernameParams,
        execute: async (_toolCallId, params) => {
            try {
                const port = process.env.PORT || 3000;
                const url = `http://127.0.0.1:${port}/api/sessions/${encodeURIComponent(botSession)}/contacts/find-by-username`;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: params.username })
                });

                const data = await response.json() as { success?: boolean; jid?: string; error?: string };

                if (!response.ok || !data.success || !data.jid) {
                    return { content: [{ type: 'text', text: `🔍 ${data.error || `No encontré a nadie con @${params.username.replace(/^@/, '')}`}` }] };
                }

                const identifier = data.jid.split('@')[0];

                return {
                    content: [{
                        type: 'text',
                        text: `✅ Encontrado: \`${data.jid}\`. Usa \`${identifier}\` con add_manager o send_whatsapp_message.`
                    }]
                };
            } catch (error: any) {
                return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }] };
            }
        }
    };
}
