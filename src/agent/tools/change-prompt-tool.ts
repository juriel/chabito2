import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { StoreFactory } from '../../persistence/index.ts';

export const changePromptParams = Type.Object({
    promptType: Type.String({ 
        enum: ['client', 'manager'],
        description: 'Which prompt to change: "client" for customers or "manager" for administrators' 
    }),
    newPrompt: Type.String({ description: 'The new system prompt text' })
});

export function createChangePromptTool(botSession: string): AgentTool<typeof changePromptParams> {
    return {
        name: 'change_prompt',
        label: 'Change Agent Prompt',
        description: 'Changes the system prompt for either the client-facing agent or the manager-facing agent. Only managers can use this tool.',
        parameters: changePromptParams,
        execute: async (_toolCallId, params) => {
            const textStore = StoreFactory.text('./data', botSession);
            const promptKey = params.promptType === 'manager' ? 'prompt-admin' : 'prompt';

            console.log(`[TOOL] change_prompt → type="${params.promptType}" botSession="${botSession}"`);

            try {
                await textStore.save(promptKey, params.newPrompt);
                console.log(`[TOOL] change_prompt OK → ${promptKey} actualizado`);

                return {
                    content: [
                        {
                            type: 'text',
                            text: `✅ Prompt para ${params.promptType} actualizado correctamente.`
                        }
                    ],
                    details: { success: true, promptType: params.promptType }
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[TOOL] change_prompt ERROR:`, errorMessage);

                return {
                    content: [
                        {
                            type: 'text',
                            text: `❌ Error al actualizar el prompt: ${errorMessage}`
                        }
                    ],
                    details: { error: errorMessage }
                };
            }
        }
    };
}
