import { AiAgent } from './ai-agent.ts';
import { ChatbotInitialSetup } from './chatbot-initial-setup.ts';
import { ManagerAgentFactory } from './factories/manager-agent-factory.ts';
import { ClientAgentFactory } from './factories/client-agent-factory.ts';

export class AgentsMap {
    private static instance?: AgentsMap;

    private readonly agents = new Map<string, AiAgent>();
    /** Keys of agents currently being created (to avoid race conditions). */
    private readonly pending = new Map<string, Promise<AiAgent>>();

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

        // Determine agent type based on peerId
        const agentType = await ChatbotInitialSetup.getAgentType(botSession, peerId);

        // Build agent using appropriate factory
        const factory = agentType === 'manager' ? ManagerAgentFactory : ClientAgentFactory;
        const builder = factory.create(botSession, peerId, {
            modelProvider: this.modelProvider,
            modelId: this.modelId,
            sessionId: conversationKey
        });

        return builder.buildAsync();
    }
}
