import { Agent, type AgentMessage, type AgentOptions } from '@mariozechner/pi-agent-core';
import { getModel, type AssistantMessage } from '@mariozechner/pi-ai';

export class AiAgentBuilder {
    private modelProvider = (process.env.PI_PROVIDER || 'openai').trim().toLowerCase();
    private modelId = (process.env.PI_MODEL || 'gpt-5-mini').trim();
    private systemPrompt = process.env.AGENT_SYSTEM_PROMPT || 'Eres Chabito. Responde de forma util, breve y amable por WhatsApp.';
    private sessionId?: string;
    private thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' = 'off';

    public withModelProvider(modelProvider: string): AiAgentBuilder {
        this.modelProvider = modelProvider.trim().toLowerCase();
        return this;
    }

    public withModelId(modelId: string): AiAgentBuilder {
        this.modelId = modelId.trim();
        return this;
    }

    public withSystemPrompt(systemPrompt: string): AiAgentBuilder {
        this.systemPrompt = systemPrompt;
        return this;
    }

    public withSessionId(sessionId: string): AiAgentBuilder {
        this.sessionId = sessionId;
        return this;
    }

    public withThinkingLevel(thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'): AiAgentBuilder {
        this.thinkingLevel = thinkingLevel;
        return this;
    }

    public build(): AiAgent {
        const model = this.resolveModel();
        const agentOptions: AgentOptions = {
            initialState: {
                systemPrompt: this.systemPrompt,
                model,
                messages: [],
                tools: [],
                thinkingLevel: this.thinkingLevel
            },
            getApiKey: this.getApiKeyForProvider.bind(this)
        };
        const agent = this.sessionId
            ? new Agent({ ...agentOptions, sessionId: this.sessionId })
            : new Agent(agentOptions);

        return new AiAgent(agent);
    }

    private resolveModel(): NonNullable<ReturnType<typeof getModel>> {
        const model = getModel(this.modelProvider as never, this.modelId as never);

        if (!model) {
            throw new Error(`Modelo no configurado o inexistente: provider=${this.modelProvider}, model=${this.modelId}`);
        }

        return model;
    }

    private getApiKeyForProvider(provider: string): string | undefined {
        const apiKeyEnvByProvider: Record<string, string> = {
            anthropic: 'ANTHROPIC_API_KEY',
            google: 'GEMINI_API_KEY',
            google_vertex: 'GOOGLE_API_KEY',
            'google-vertex': 'GOOGLE_API_KEY',
            groq: 'GROQ_API_KEY',
            openai: 'OPENAI_API_KEY',
            openrouter: 'OPENROUTER_API_KEY',
            xai: 'XAI_API_KEY'
        };

        const envName = apiKeyEnvByProvider[provider];
        return envName ? process.env[envName] : undefined;
    }
}

export class AiAgent {
    public constructor(private readonly agent: Agent) {}

    public async prompt(text: string): Promise<string> {
        await this.agent.prompt(text);
        const response = this.getLastAssistantMessage(this.agent.state.messages);

        return response
            ? this.extractAssistantText(response.content) || 'No pude generar una respuesta en este momento.'
            : 'No pude generar una respuesta en este momento.';
    }

    private getLastAssistantMessage(messages: AgentMessage[]): AssistantMessage | undefined {
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const message = messages[index];
            if (message?.role === 'assistant') {
                return message;
            }
        }

        return undefined;
    }

    private extractAssistantText(content: AssistantMessage['content']): string {
        return content
            .filter((block): block is { type: 'text'; text: string } => block.type === 'text' && typeof block.text === 'string')
            .map((block) => block.text.trim())
            .filter((text) => text.length > 0)
            .join('\n')
            .trim();
    }
}
