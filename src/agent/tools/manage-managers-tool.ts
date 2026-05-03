import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { StoreFactory } from '../../persistence/index.ts';

export const manageManagersParams = Type.Object({
    action: Type.String({ 
        enum: ['add', 'remove', 'list'],
        description: 'Action to perform: "add" to authorize a new manager, "remove" to revoke access, or "list" to see current managers.' 
    }),
    number: Type.Optional(Type.String({ 
        description: 'The WhatsApp ID/number of the manager (e.g. 573001234567). Required for add/remove.' 
    })),
    name: Type.Optional(Type.String({
        description: 'The display name for the manager. Required for "add".'
    }))
});

export function createManageManagersTool(botSession: string): AgentTool<typeof manageManagersParams> {
    return {
        name: 'manage_managers',
        label: 'Manage Bot Managers',
        description: 'Allows adding, removing or listing the authorized managers for this chatbot. Only available to existing managers.',
        parameters: manageManagersParams,
        execute: async (_toolCallId, params) => {
            const textStore = StoreFactory.text('./data', botSession);
            
            console.log(`[TOOL] manage_managers → action="${params.action}" number="${params.number || 'N/A'}" botSession="${botSession}"`);

            try {
                // Load current managers
                const result = await textStore.load('managers');
                let content = result.ok ? result.value : '';
                
                // Parse current list (ignore comments and empty lines)
                const lines = content.split('\n');
                const managers = lines
                    .map(l => l.trim())
                    .filter(l => l.length > 0 && !l.startsWith('#'));

                if (params.action === 'list') {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `📋 *Listado de Managers autorizados:*\n${managers.length > 0 ? managers.map(m => `- ${m}`).join('\n') : '_No hay managers adicionales configurados._'}`
                            }
                        ],
                        details: { managers }
                    };
                }

                if (!params.number) {
                    throw new Error('Se requiere un número para las acciones "add" o "remove".');
                }

                const targetNumber = params.number.trim().split('@')[0].toLowerCase(); // Solo el número
                const targetName = params.name?.trim() || 'Sin Nombre';

                if (params.action === 'add') {
                    const exists = managers.some(m => m.split(/\s+/)[0].toLowerCase() === targetNumber);
                    if (exists) {
                        return {
                            content: [{ type: 'text', text: `⚠️ El usuario ${targetNumber} ya es un manager.` }],
                            details: { success: false, reason: 'already_exists' }
                        };
                    }
                    
                    // Add to the end of the file
                    await textStore.append('managers', `${targetNumber} ${targetName}\n`);
                    console.log(`[TOOL] manage_managers OK → Agregado ${targetNumber} (${targetName})`);

                    return {
                        content: [{ type: 'text', text: `✅ Usuario ${targetNumber} (${targetName}) agregado como manager correctamente.` }],
                        details: { success: true, action: 'add', number: targetNumber, name: targetName }
                    };
                }

                if (params.action === 'remove') {
                    const exists = managers.some(m => m.split(/\s+/)[0].toLowerCase() === targetNumber);
                    if (!exists) {
                        return {
                            content: [{ type: 'text', text: `⚠️ El usuario ${targetNumber} no se encuentra en la lista de managers.` }],
                            details: { success: false, reason: 'not_found' }
                        };
                    }

                    // Reconstruct file content preserving comments if possible
                    const newLines = lines.filter(line => {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('#') || trimmed.length === 0) return true;
                        const phoneInLine = trimmed.split(/\s+/)[0].toLowerCase();
                        return phoneInLine !== targetNumber;
                    });

                    await textStore.save('managers', newLines.join('\n') + '\n');
                    console.log(`[TOOL] manage_managers OK → Eliminado ${targetNumber}`);

                    return {
                        content: [{ type: 'text', text: `✅ Usuario ${targetNumber} eliminado de la lista de managers.` }],
                        details: { success: true, action: 'remove', number: targetNumber }
                    };
                }

                throw new Error('Acción no reconocida.');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[TOOL] manage_managers ERROR:`, errorMessage);

                return {
                    content: [{ type: 'text', text: `❌ Error al gestionar managers: ${errorMessage}` }],
                    details: { error: errorMessage }
                };
            }
        }
    };
}
