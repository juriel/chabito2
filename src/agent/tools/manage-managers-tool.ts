import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { StoreFactory } from '../../persistence/index.ts';
import { listContacts } from '../contacts-registry.ts';

// --- ADD MANAGER ---
export const addManagerParams = Type.Object({
    identifier: Type.String({
        description: 'El identificador del nuevo manager: su número de teléfono con código de país (ej: 573001234567), o — si WhatsApp no expone su número — su identificador @lid completo obtenido con list_contacts (ej: 215504413290734@lid).'
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

                    return `- *${displayName}* → \`${identifier}\`${tag}`;
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
