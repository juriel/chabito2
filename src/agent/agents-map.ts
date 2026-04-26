import { AiAgent, AiAgentBuilder } from './ai-agent.ts';
import { createSendWhatsAppMessageTool } from './whatsapp-tool.ts';

export class AgentsMap {
    private static instance?: AgentsMap;

    private readonly agents = new Map<string, AiAgent>();
    /** Keys of agents currently being created (to avoid race conditions). */
    private readonly pending = new Map<string, Promise<AiAgent>>();

    private readonly systemPrompt = process.env.AGENT_SYSTEM_PROMPT
        || 'Eres Chabito. Responde de forma util, breve y amable por WhatsApp.';
    private readonly modelProvider = (process.env.PI_PROVIDER || 'openai').trim().toLowerCase();
    private readonly modelId = (process.env.PI_MODEL || 'gpt-5-mini').trim();

    private constructor() {}

    public static getInstance(): AgentsMap {
        if (!AgentsMap.instance) {
            AgentsMap.instance = new AgentsMap();
        }

        return AgentsMap.instance;
    }

    /**
     * Obtiene el agente para `conversationKey` si ya existe, o lo crea cargando
     * el historial persistido desde disco.
     *
     * El `conversationKey` tiene el formato `<botSession>:<peerId>`.
     */
    public async getOrCreate(conversationKey: string): Promise<AiAgent> {
        // Return already-running agent
        const current = this.agents.get(conversationKey);
        if (current) {
            return current;
        }

        // Return in-progress creation promise (avoids race conditions)
        const inProgress = this.pending.get(conversationKey);
        if (inProgress) {
            return inProgress;
        }

        const creation = this.createAgent(conversationKey);
        this.pending.set(conversationKey, creation);

        try {
            const agent = await creation;
            this.agents.set(conversationKey, agent);
            return agent;
        } finally {
            this.pending.delete(conversationKey);
        }
    }

    private async createAgent(conversationKey: string): Promise<AiAgent> {
        // conversationKey format: "botSession:peerId"
        const separatorIndex = conversationKey.indexOf(':');
        const botSession = separatorIndex !== -1
            ? conversationKey.slice(0, separatorIndex)
            : conversationKey;
        const peerId = separatorIndex !== -1
            ? conversationKey.slice(separatorIndex + 1)
            : '';

        return new AiAgentBuilder()
            .withModelProvider(this.modelProvider)
            .withModelId(this.modelId)
            .withSystemPrompt(this.systemPrompt)
            .withSessionId(conversationKey)
            .withThinkingLevel('off')
            .withBotSession(botSession)
            .withPeerId(peerId)
            .withTool(createSendWhatsAppMessageTool(botSession))
            .buildAsync();
    }
}
