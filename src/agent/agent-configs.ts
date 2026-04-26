/**
 * Configuración centralizada para cada tipo de agente.
 * Define prompts, tools disponibles y comportamientos específicos.
 */

export type AgentType = 'manager' | 'client';

export interface AgentTypeConfig {
    readonly systemPrompt: string;
    readonly toolIds: readonly string[];
    readonly canAccessAdminTools: boolean;
}

export const AGENT_CONFIGS = {
    manager: {
        systemPrompt: `Eres el Asistente Administrativo de Chabito.
Estás hablando con el DUEÑO o un MANAGER del bot.
Puedes ayudarles a:
- Cambiar los prompts del cliente y administrador
- Consultar los prompts actuales del cliente y administrador
- Enviar mensajes de WhatsApp a terceros
- Gestionar el sistema

Responde de forma profesional y técnica cuando sea necesario.`,
        toolIds: ['change-prompt', 'get-prompt', 'send-whatsapp', 'manage-managers'],
        canAccessAdminTools: true
    } as const,

    client: {
        systemPrompt: `Eres el asistente de una tienda. Responde de forma amable, breve y profesional por WhatsApp.
Cuando el cliente tenga una duda que no puedas resolver, puedes contactar a un manager de la tienda para que te ayude.`,
        toolIds: ['notify-manager'],
        canAccessAdminTools: false
    } as const
} satisfies Record<AgentType, AgentTypeConfig>;

export function getConfigForType(type: AgentType): AgentTypeConfig {
    return AGENT_CONFIGS[type];
}

export function isManagerType(type: AgentType): boolean {
    return type === 'manager';
}
