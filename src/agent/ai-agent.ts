import { Agent, type AgentEvent, type AgentMessage, type AgentOptions, type AgentTool } from '@mariozechner/pi-agent-core';
import { getModel, type AssistantMessage } from '@mariozechner/pi-ai';

export interface AiAgentResponseEvent {
    text: string;
}

type AiAgentListener = (event: AiAgentResponseEvent) => void | Promise<void>;

export class AiAgentBuilder {
    private modelProvider = (process.env.PI_PROVIDER || 'openai').trim().toLowerCase();
    private modelId = (process.env.PI_MODEL || 'gpt-5-mini').trim();
    private systemPrompt = process.env.AGENT_SYSTEM_PROMPT || 'Eres Chabito. Responde de forma util, breve y amable por WhatsApp.';
    private sessionId?: string;
    private thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' = 'off';
    private tools: AgentTool<any>[] = [];

    public withTool(tool: AgentTool<any>): AiAgentBuilder {
        this.tools.push(tool);
        return this;
    }

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
                tools: this.tools,
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
    private readonly listeners = new Set<AiAgentListener>();
    private processingQueue = Promise.resolve();

    public constructor(private readonly agent: Agent) {
        this.agent.subscribe(this.handleAgentEvent.bind(this));
    }

    public subscribe(listener: AiAgentListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public async receive(text: string): Promise<void> {
        const task = this.processingQueue
            .then(async () => {
                await this.agent.prompt(text);
            });

        this.processingQueue = task.catch((error) => {
            console.error('[AI-AGENT] Error procesando mensaje en cola:', error);
        });

        await task;
    }

    public async prompt(text: string): Promise<string> {
        return await this.generateResponse(text);
    }

    private handleAgentEvent(event: AgentEvent): void {
        if (event.type !== 'message_end' || event.message.role !== 'assistant') {
            return;
        }

        const assistantMsg = event.message as AssistantMessage;

        // Skip intermediate tool-use turns — the agent is still working.
        // The final text response will arrive in a subsequent message_end with stopReason 'stop'.
        if (assistantMsg.stopReason === 'toolUse') {
            console.log('[AI-AGENT] Tool use turn, esperando respuesta final...');
            return;
        }

        if (assistantMsg.stopReason === 'error' && assistantMsg.errorMessage) {
            console.error('[AI-AGENT] Error from LLM API:', assistantMsg.errorMessage);
            void this.notifyListeners({ text: `❌ Error del LLM: ${assistantMsg.errorMessage}` });
            return;
        }

        const responseText = this.extractAssistantText(assistantMsg.content);
        if (!responseText) {
            // No text to send — happens when the model emits only thinking blocks.
            // Silently ignore to avoid sending an unhelpful fallback message.
            console.warn('[AI-AGENT] mensaje_end sin texto (thinking only?), ignorando.');
            return;
        }

        void this.notifyListeners({ text: responseText });
    }

    private async generateResponse(text: string): Promise<string> {
        await this.agent.prompt(text);
        const response = this.getLastAssistantMessage(this.agent.state.messages);

        return response
            ? this.extractAssistantText(response.content) || 'No pude generar una respuesta en este momento.'
            : 'No pude generar una respuesta en este momento.';
    }

    private async notifyListeners(event: AiAgentResponseEvent): Promise<void> {
        const listeners = [...this.listeners];
        await Promise.all(listeners.map(async (listener) => {
            try {
                await listener(event);
            } catch (error) {
                console.error('[AI-AGENT] Error notificando listener:', error);
            }
        }));
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
