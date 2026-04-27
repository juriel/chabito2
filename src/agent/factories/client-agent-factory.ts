import { AiAgentBuilder } from '../ai-agent.ts';
import { getConfigForType } from '../agent-configs.ts';
import { createNotifyManagerTool } from '../tools/notify-manager-tool.ts';
import { createGetTimeTool } from '../tools/time-tool.ts';

/**
 * Factory para crear agentes para clientes.
 * 
 * Los clientes pueden:
 * - Enviar notificaciones a los managers cuando necesitan ayuda
 */
export class ClientAgentFactory {
    public static create(botSession: string, peerId: string, options?: {
        modelProvider?: string;
        modelId?: string;
        sessionId?: string;
    }): AiAgentBuilder {
        const config = getConfigForType('client');

        const builder = new AiAgentBuilder()
            .withBotSession(botSession)
            .withPeerId(peerId)
            .withSystemPrompt(config.systemPrompt)
            .withThinkingLevel('off');

        // Add tools for clients
        const toolRegistry: Record<string, (botSession: string) => any> = {
            'notify-manager': createNotifyManagerTool,
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
