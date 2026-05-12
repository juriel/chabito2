import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { RAGMemory } from '../../knowledge/rag_memory.ts';

export const queryRagKnowledgeParams = Type.Object({
    question: Type.String({
        description: 'Pregunta o necesidad de información específica para buscar en la base de conocimiento RAG.'
    }),
    topK: Type.Optional(Type.Number({
        description: 'Cantidad máxima de documentos relevantes a consultar.',
        minimum: 1,
        maximum: 10
    })),
    maxChars: Type.Optional(Type.Number({
        description: 'Cantidad máxima de caracteres de contexto a devolver.',
        minimum: 200,
        maximum: 12000
    }))
});

export function createQueryRagKnowledgeTool(botSession: string): AgentTool<typeof queryRagKnowledgeParams> {
    return {
        name: 'query_rag_knowledge',
        label: 'Query RAG Knowledge',
        description: 'Consulta la memoria RAG de este chatbot. Usa esta tool cuando la pregunta no parezca conocimiento general y pueda depender de información específica del negocio, clientes, procesos, documentos o datos previamente cargados por los managers.',
        parameters: queryRagKnowledgeParams,
        execute: async (_toolCallId, params) => {
            const question = params.question.trim();
            const topK = Math.max(1, Math.min(10, Math.floor(params.topK ?? 5)));
            const maxChars = Math.max(200, Math.min(12000, Math.floor(params.maxChars ?? 4000)));

            if (!question) {
                return { content: [{ type: 'text', text: '❌ El campo `question` no puede estar vacío.' }] };
            }

            try {
                const ragMemory = new RAGMemory({ chatUuid: botSession, baseDir: './data' });
                const hits = await ragMemory.search(question, topK);

                if (hits.length === 0) {
                    return {
                        content: [{ type: 'text', text: '📭 No encontré conocimiento relevante en el RAG para esa consulta.' }],
                        details: { hits: 0, question }
                    };
                }

                const context = await ragMemory.context(question, topK, { maxChars });

                return {
                    content: [
                        {
                            type: 'text',
                            text: `📚 Contexto RAG recuperado para: ${question}\n\n${context}`.trim()
                        }
                    ],
                    details: {
                        question,
                        hits: hits.length,
                        summaries: hits.map((hit) => ({
                            uuid: hit.uuid,
                            summary: hit.summary,
                            score: hit.score
                        }))
                    }
                };
            } catch (error: any) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [{ type: 'text', text: `❌ Error consultando conocimiento RAG: ${message}` }],
                    details: { error: message }
                };
            }
        }
    };
}
