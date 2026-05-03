import { AiAgentBuilder } from '../ai-agent.ts';
import { getConfigForType } from '../agent-configs.ts';
import { createChangePromptTool } from '../tools/change-prompt-tool.ts';
import { createGetPromptTool } from '../tools/get-prompt-tool.ts';
import { createSendWhatsAppMessageTool } from '../tools/whatsapp-tool.ts';
import { createAddManagerTool, createRemoveManagerTool, createListManagersTool } from '../tools/manage-managers-tool.ts';
import { createManageTasksTool } from '../tools/manage-tasks-tool.ts';
import { createGetTimeTool } from '../tools/time-tool.ts';

/**
 * Factory para crear agentes administrativos (managers/dueños del bot).
 * 
 * Los managers pueden:
 * - Cambiar prompts de clientes y administradores
 * - Enviar mensajes directos por WhatsApp a terceros
 */
export class ManagerAgentFactory {
    public static create(botSession: string, peerId: string, options?: {
        modelProvider?: string;
        modelId?: string;
        sessionId?: string;
    }): AiAgentBuilder {
        const config = getConfigForType('manager');

        const builder = new AiAgentBuilder()
            .withBotSession(botSession)
            .withPeerId(peerId)
            .withSystemPrompt(config.systemPrompt)
            .withThinkingLevel('off')
            .withIsManager(true); // ← Managers pueden usar comandos especiales

        // Add tools for managers
        const toolRegistry: Record<string, (botSession: string) => any> = {
            'change-prompt': createChangePromptTool,
            'get-prompt': createGetPromptTool,
            'send-whatsapp': createSendWhatsAppMessageTool,
            'add-manager': createAddManagerTool,
            'remove-manager': createRemoveManagerTool,
            'list-managers': createListManagersTool,
            'manage-tasks': createManageTasksTool,
            'get-time': () => createGetTimeTool()
        };

        config.toolIds.forEach((toolId) => {
            const factory = toolRegistry[toolId];
            if (factory) {
                builder.withTool(factory(botSession));
            }
        });

        // Apply optional config
        if (options?.modelProvider) {
            builder.withModelProvider(options.modelProvider);
        }
        if (options?.modelId) {
            builder.withModelId(options.modelId);
        }
        if (options?.sessionId) {
            builder.withSessionId(options.sessionId);
        }

        return builder;
    }
}
