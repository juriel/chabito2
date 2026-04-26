import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { StoreFactory } from '../../persistence/index.ts';

export const getPromptParams = Type.Object({
    promptType: Type.Union([
        Type.Literal('client'),
        Type.Literal('manager')
    ], { description: 'Which prompt to retrieve: "client" for customers or "manager" for administrators' })
});

export function createGetPromptTool(botSession: string): AgentTool<typeof getPromptParams> {
    return {
        name: 'get_prompt',
        label: 'Get Agent Prompt',
        description: 'Retrieves the current system prompt for either the client-facing agent or the manager-facing agent. Only managers can use this tool.',
        parameters: getPromptParams,
        execute: async (_toolCallId, params) => {
            const textStore = StoreFactory.text('./data', botSession);
            const promptKey = params.promptType === 'manager' ? 'prompt-admin' : 'prompt';

            console.log(`[TOOL] get_prompt → type="${params.promptType}" botSession="${botSession}"`);

            try {
                const promptResult = await textStore.load(promptKey);

                if (!promptResult.ok) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `❌ No se encontró el prompt para ${params.promptType}.`
                            }
                        ],
                        details: { error: 'prompt_not_found' }
                    };
                }

                console.log(`[TOOL] get_prompt OK → ${promptKey} recuperado`);

                return {
                    content: [
                        {
                            type: 'text',
                            text: `📝 **Prompt ${params.promptType}:**\n\n${promptResult.value}`
                        }
                    ],
                    details: { success: true, promptType: params.promptType, prompt: promptResult.value }
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[TOOL] get_prompt ERROR:`, errorMessage);

                return {
                    content: [
                        {
                            type: 'text',
                            text: `❌ Error al recuperar el prompt: ${errorMessage}`
                        }
                    ],
                    details: { error: errorMessage }
                };
            }
        }
    };
}