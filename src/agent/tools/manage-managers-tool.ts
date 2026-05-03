import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { StoreFactory } from '../../persistence/index.ts';

// --- ADD MANAGER ---
export const addManagerParams = Type.Object({
    number: Type.String({ description: 'El número de teléfono del manager (ej: 573001234567).' }),
    name: Type.String({ description: 'El nombre completo o apodo del manager.' })
});

export function createAddManagerTool(botSession: string): AgentTool<typeof addManagerParams> {
    return {
        name: 'add_manager',
        label: 'Add Manager',
        description: 'Agrega un nuevo manager autorizado para administrar este chatbot.',
        parameters: addManagerParams,
        execute: async (_toolCallId, params) => {
            const textStore = StoreFactory.text('./data', botSession);
            const targetNumber = params.number.trim().split('@')[0].toLowerCase();
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
    number: Type.String({ description: 'El número de teléfono del manager a eliminar.' })
});

export function createRemoveManagerTool(botSession: string): AgentTool<typeof removeManagerParams> {
    return {
        name: 'remove_manager',
        label: 'Remove Manager',
        description: 'Elimina a un manager de la lista de autorizados.',
        parameters: removeManagerParams,
        execute: async (_toolCallId, params) => {
            const textStore = StoreFactory.text('./data', botSession);
            const targetNumber = params.number.trim().split('@')[0].toLowerCase();

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
