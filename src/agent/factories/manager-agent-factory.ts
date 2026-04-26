import { AiAgentBuilder } from '../ai-agent.ts';
import { getConfigForType } from '../agent-configs.ts';
import { createChangePromptTool } from '../tools/change-prompt-tool.ts';
import { createGetPromptTool } from '../tools/get-prompt-tool.ts';
import { createSendWhatsAppMessageTool } from '../tools/whatsapp-tool.ts';

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
        config.toolIds.forEach((toolId) => {
            switch (toolId) {
                case 'change-prompt':
                    builder.withTool(createChangePromptTool(botSession));
                    break;
                case 'get-prompt':
                    builder.withTool(createGetPromptTool(botSession));
                    break;
                case 'send-whatsapp':
                    builder.withTool(createSendWhatsAppMessageTool(botSession));
                    break;
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
