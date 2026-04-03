import { AiAgent, AiAgentBuilder } from './ai-agent.ts';
import type { ChatMessageDto } from '../dto/chat-message-dto.ts';

export class AgentsMap {
    private static instance?: AgentsMap;

    private readonly agents = new Map<string, AiAgent>();
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

    public getOrCreate(conversationKey: string): AiAgent {
        const current = this.agents.get(conversationKey);

        if (current) {
            return current;
        }

        const agent = new AiAgentBuilder()
            .withModelProvider(this.modelProvider)
            .withModelId(this.modelId)
            .withSystemPrompt(this.systemPrompt)
            .withSessionId(conversationKey)
            .withThinkingLevel('off')
            .build();

        this.agents.set(conversationKey, agent);
        return agent;
    }



}
