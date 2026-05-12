import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { RAGMemory } from '../../knowledge/rag_memory.ts';

export const addRagKnowledgeParams = Type.Object({
    summary: Type.String({ description: 'Resumen corto del conocimiento a guardar.' }),
    content: Type.String({ description: 'Contenido completo del conocimiento que se agregará al RAG.' }),
    keywords: Type.Array(Type.String({ description: 'Keyword individual para indexar el conocimiento.' }), {
        description: 'Lista de keywords relacionadas con este conocimiento.'
    })
});

export function createAddRagKnowledgeTool(botSession: string): AgentTool<typeof addRagKnowledgeParams> {
    return {
        name: 'add_rag_knowledge',
        label: 'Add RAG Knowledge',
        description: 'Agrega una nueva pieza de conocimiento a la memoria RAG de este chatbot usando summary, content y keywords.',
        parameters: addRagKnowledgeParams,
        execute: async (_toolCallId, params) => {
            const summary = params.summary.trim();
            const content = params.content.trim();
            const keywords = params.keywords
                .map((keyword) => keyword.trim())
                .filter((keyword) => keyword.length > 0);

            if (!summary) {
                return { content: [{ type: 'text', text: '❌ El campo `summary` no puede estar vacío.' }] };
            }

            if (!content) {
                return { content: [{ type: 'text', text: '❌ El campo `content` no puede estar vacío.' }] };
            }

            if (keywords.length === 0) {
                return { content: [{ type: 'text', text: '❌ Debes enviar al menos una keyword válida en `keywords`.' }] };
            }

            try {
                const ragMemory = new RAGMemory({ chatUuid: botSession, baseDir: './data' });
                const uuid = await ragMemory.create(summary, keywords, content);

                return {
                    content: [
                        {
                            type: 'text',
                            text: `✅ Conocimiento RAG agregado correctamente con ID ${uuid}.`
                        }
                    ],
                    details: {
                        uuid,
                        summary,
                        keywordsCount: keywords.length
                    }
                };
            } catch (error: any) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [{ type: 'text', text: `❌ Error agregando conocimiento RAG: ${message}` }],
                    details: { error: message }
                };
            }
        }
    };
}
