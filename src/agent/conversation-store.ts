import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { StoreFactory } from '../persistence/index.ts';
import type { JsonStore } from '../persistence/json-store.ts';

const DATA_DIR = './data';

/**
 * Devuelve un store de conversaciones para un chatbot específico.
 *
 * Estructura en disco:
 * ```
 * data/
 *   <botSession>/
 *     conversation-<peerId>.json
 * ```
 *
 * @param botSession  UUID del chatbot (ej: "juriel")
 */
export function createConversationStore(botSession: string): JsonStore<AgentMessage[], never> {
    return StoreFactory.rawFile<AgentMessage[]>(DATA_DIR, botSession);
}

/**
 * Convierte un `peerId` a la clave de archivo de la conversación.
 * El `FileStorageProvider` ya sanitiza caracteres especiales, pero
 * añadimos el prefijo `conversation-` para cumplir el requisito.
 *
 * @example
 * conversationKey('573004654724@s.whatsapp.net') → 'conversation-573004654724@s.whatsapp.net'
 */
export function conversationKey(peerId: string): string {
    return `conversation-${peerId}`;
}

export type ConversationStore = JsonStore<AgentMessage[], never>;
