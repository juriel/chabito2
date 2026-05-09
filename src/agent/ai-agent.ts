import { Agent, type AgentEvent, type AgentMessage, type AgentOptions, type AgentTool } from '@mariozechner/pi-agent-core';
import { getModel, type AssistantMessage } from '@mariozechner/pi-ai';
import { createConversationStore, conversationKey, type ConversationStore } from './conversation-store.ts';
import { ChatbotInitialSetup } from './chatbot-initial-setup.ts';
import { WildcardProcessor } from './wildcard-processor.ts';
import type { ChatMessageDto } from '../dto/chat-message-dto.ts';

export interface AiAgentResponseEvent {
    text: string;
}

type AiAgentListener = (event: AiAgentResponseEvent) => void | Promise<void>;

export class AiAgentBuilder {
    private modelProvider = this.normalizeProvider((process.env.PI_PROVIDER || 'openai').trim().toLowerCase());
    private modelId = (process.env.PI_MODEL || 'gpt-5-mini').trim();
    private systemPrompt = process.env.AGENT_SYSTEM_PROMPT || 'Eres Chabito. Responde de forma util, breve y amable por WhatsApp.';
    private sessionId?: string;
    private thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' = 'off';
    private tools: AgentTool<any>[] = [];
    private botSession?: string;
    private peerId?: string;
    private isManager: boolean = false;

    public withTool(tool: AgentTool<any>): AiAgentBuilder {
        this.tools.push(tool);
        return this;
    }

    public withModelProvider(modelProvider: string): AiAgentBuilder {
        this.modelProvider = this.normalizeProvider(modelProvider.trim().toLowerCase());
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

    /**
     * Establece si este agente es para un manager/administrador.
     * Los managers pueden usar comandos especiales como /reset.
     */
    public withIsManager(isManager: boolean): AiAgentBuilder {
        this.isManager = isManager;
        return this;
    }

    /**
     * Establece el UUID del chatbot al que pertenece este agente.
     * Se usa como subcarpeta en `data/<botSession>/`.
     */
    public withBotSession(botSession: string): AiAgentBuilder {
        this.botSession = botSession;
        return this;
    }

    /**
     * Establece el identificador del usuario con quien habla el agente.
     * Se usa como nombre de archivo `conversation-<peerId>.json`.
     */
    public withPeerId(peerId: string): AiAgentBuilder {
        this.peerId = peerId;
        return this;
    }

    /**
     * Construye el agente de forma asíncrona, restaurando el historial de
     * conversación desde disco si existe.
     */
    public async buildAsync(): Promise<AiAgent> {
        const model = this.resolveModel();
        const apiKeyForModel = this.getApiKeyForProvider(model.provider);
        if (!apiKeyForModel) {
            const hints: Record<string, string> = {
                openai: 'OPENAI_API_KEY (or OPENROUTER_API_KEY if using OpenRouter base URL)',
                openrouter: 'OPENROUTER_API_KEY',
                google: 'GEMINI_API_KEY',
                groq: 'GROQ_API_KEY',
                anthropic: 'ANTHROPIC_API_KEY',
                xai: 'XAI_API_KEY'
            };
            const hint = hints[model.provider] || 'API key env var for that provider';
            console.error(
                `[AI-AGENT] Falta API key para provider=${model.provider}. Configura ${hint}. (PI_PROVIDER=${this.modelProvider}, PI_MODEL=${this.modelId})`
            );
        }

        // Load persisted conversation history if botSession + peerId are set
        let restoredMessages: AgentMessage[] = [];
        let store: ConversationStore | undefined;
        let storeKey: string | undefined;

        // Resolve effective system prompt via ChatbotInitialSetup
        let effectiveSystemPrompt = this.systemPrompt;

        if (this.botSession && this.peerId) {
            effectiveSystemPrompt = await ChatbotInitialSetup.getPromptForPeer(this.botSession, this.peerId);
        } else if (this.botSession) {
            // Fallback if peerId is not available yet
            await ChatbotInitialSetup.ensureFiles(this.botSession);
        }

        if (this.botSession && this.peerId) {
            store = createConversationStore(this.botSession);
            storeKey = conversationKey(this.peerId);
            const result = await store.loadRaw(storeKey);
            if (result.ok) {
                restoredMessages = result.value;
                console.log(`[AI-AGENT] Historial restaurado: ${restoredMessages.length} mensajes (${storeKey})`);
            }
        }

        const agentOptions: AgentOptions = {
            initialState: {
                systemPrompt: effectiveSystemPrompt,
                model,
                messages: restoredMessages,
                tools: this.tools,
                thinkingLevel: this.thinkingLevel
            },
            getApiKey: this.getApiKeyForProvider.bind(this)
        };

        const agent = this.sessionId
            ? new Agent({ ...agentOptions, sessionId: this.sessionId })
            : new Agent(agentOptions);

        return new AiAgent(agent, this.botSession, store, storeKey, this.isManager);
    }

    private resolveModel(): NonNullable<ReturnType<typeof getModel>> {
        const baseModel = getModel(this.modelProvider as never, this.modelId as never);

        // If the model isn't in the built-in registry, allow a minimal "custom model" for OpenAI-compatible endpoints.
        // This is important for OpenRouter model IDs like `nvidia/...:free`.
        const overrideBaseUrl = (process.env.PI_BASE_URL || process.env.OPENAI_BASE_URL || '').trim();
        const allowCustom =
            !baseModel && !!overrideBaseUrl && (this.modelProvider === 'openai' || this.modelProvider === 'openrouter' || this.modelProvider === 'xai' || this.modelProvider === 'groq');
        if (!baseModel && allowCustom) {
            const custom: any = {
                id: this.modelId,
                name: this.modelId,
                api: 'openai-completions',
                provider: this.modelProvider,
                baseUrl: overrideBaseUrl,
                reasoning: false,
                input: ['text', 'image'],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 128000,
                maxTokens: 16384,
                headers: {}
            };

            if (this.modelProvider === 'openrouter' || overrideBaseUrl.includes('openrouter.ai')) {
                const siteUrl = (process.env.OPENROUTER_SITE_URL || '').trim();
                const appName = (process.env.OPENROUTER_APP_NAME || '').trim();
                if (siteUrl) custom.headers['HTTP-Referer'] = siteUrl;
                if (appName) custom.headers['X-Title'] = appName;
            }

            return custom;
        }

        if (!baseModel) {
            throw new Error(`Modelo no configurado o inexistente: provider=${this.modelProvider}, model=${this.modelId}`);
        }

        // Clone so we can safely override baseUrl/headers via env without mutating shared registry objects.
        const model: any = {
            ...baseModel,
            headers: { ...(baseModel as any).headers }
        };

        // Allow overriding OpenAI-compatible base URL (useful for OpenRouter, proxies, self-hosted gateways, etc).
        const isOpenAICompatApi = model.api === 'openai-completions' || model.api === 'openai-responses';
        if (overrideBaseUrl && isOpenAICompatApi) {
            model.baseUrl = overrideBaseUrl;
        }

        // OpenRouter "recommended" headers (optional): https://openrouter.ai docs suggest Referer + Title.
        const looksLikeOpenRouter =
            this.modelProvider === 'openrouter' ||
            (typeof model.baseUrl === 'string' && model.baseUrl.includes('openrouter.ai'));
        if (looksLikeOpenRouter) {
            const siteUrl = (process.env.OPENROUTER_SITE_URL || '').trim();
            const appName = (process.env.OPENROUTER_APP_NAME || '').trim();
            if (siteUrl) model.headers['HTTP-Referer'] = siteUrl;
            if (appName) model.headers['X-Title'] = appName;
        }

        return model;
    }

    private normalizeProvider(provider: string): string {
        // Friendly aliases (users commonly say "gemini" or "grok")
        if (provider === 'gemini') return 'google';
        if (provider === 'grok') return 'xai';
        if (provider === 'google-vertex') return 'google_vertex';
        return provider;
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
        let key = envName ? process.env[envName] : undefined;

        // Convenience: allow using OpenRouter key with OpenAI-compatible base URL and provider=openai.
        if (!key && provider === 'openai') {
            const baseUrl = (process.env.PI_BASE_URL || process.env.OPENAI_BASE_URL || '').trim();
            if (baseUrl.includes('openrouter.ai')) key = process.env.OPENROUTER_API_KEY;
        }

        // Convenience: if user selected OpenAI provider but only set OPENROUTER_API_KEY, use it.
        if (!key && provider === 'openai') {
            key = process.env.OPENROUTER_API_KEY;
        }

        // Convenience: some people set OPENAI_API_KEY even when using openrouter provider.
        if (!key && provider === 'openrouter') {
            key = process.env.OPENAI_API_KEY;
        }

        return key;
    }
}

export class AiAgent {
    private readonly listeners = new Set<AiAgentListener>();
    private processingQueue = Promise.resolve();

    public constructor(
        private readonly agent: Agent,
        private readonly botSession?: string,
        private readonly store?: ConversationStore,
        private readonly storeKey?: string,
        private readonly isManager: boolean = false
    ) {
        if (this.isManager) {
            console.log(`[AI-AGENT] 🛡️ Agente administrativo iniciado para: ${this.storeKey}`);
        }
        this.agent.subscribe(this.handleAgentEvent.bind(this));
    }

    public subscribe(listener: AiAgentListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public async receive(dto: ChatMessageDto): Promise<void> {
        const text = dto.text;
        const command = text.trim().toLowerCase();

        // Handle special commands for managers
        if (this.isManager) {
            if (command === '/reset') {
                await this.handleResetCommand();
                return;
            }
            if (command === '/help') {
                await this.handleHelpCommand();
                return;
            }
        }

        const task = this.processingQueue
            .then(async () => {
                // Reload prompt from disk and process wildcards for every interaction
                if (this.botSession && this.storeKey) {
                    const peerId = this.storeKey.replace(/^conversation-/, '');
                    
                    const rawPrompt = await ChatbotInitialSetup.getPromptForPeer(this.botSession, peerId);
                    const processedPrompt = await WildcardProcessor.process(rawPrompt, dto, this.botSession);
                    
                    // Always set the prompt to ensure wildcards like CURRENT_TIME are up to date
                    this.agent.state.systemPrompt = processedPrompt;
                }

                await this.agent.prompt(text);
            });

        this.processingQueue = task.catch((error) => {
            console.error('[AI-AGENT] Error procesando mensaje en cola:', error);
        });

        await task;
    }

    private async handleResetCommand(): Promise<void> {
        console.log(`[AI-AGENT] 🔄 Reset command ejecutado para ${this.storeKey}`);

        try {
            // Clear conversation history from memory
            this.agent.state.messages = [];

            // Clear persisted conversation if store exists
            if (this.store && this.storeKey) {
                await this.store.saveRaw(this.storeKey, []);
                console.log(`[AI-AGENT] Conversación reseteada: ${this.storeKey}`);
            }

            // Notify listeners
            void this.notifyListeners({
                text: '✅ Conversación reseteada. El historial ha sido borrado.'
            });
        } catch (error) {
            console.error('[AI-AGENT] Error reseteando conversación:', error);
            void this.notifyListeners({
                text: '❌ Error al resetear la conversación.'
            });
        }
    }

    private async handleHelpCommand(): Promise<void> {
        const tools = this.agent.state.tools || [];
        const toolList = tools.length > 0
            ? tools.map(t => `- *${t.name}*: ${t.description}`).join('\n')
            : '_No hay herramientas configuradas._';

        const helpText = `*🛠️ Menú de Ayuda para Managers*

*Comandos directos:*
- */reset*: Borra el historial de esta conversación.
- */help*: Muestra este menú.

*Herramientas disponibles (puedes pedirlas en lenguaje natural):*
${toolList}

_Recuerda que como manager puedes pedirme cambios técnicos o información del sistema._`;

        void this.notifyListeners({ text: helpText });
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
        if (assistantMsg.stopReason === 'toolUse') {
            const toolCalls = assistantMsg.content.filter(c => c.type === 'toolCall' || c.type === 'tool_call' || c.type === 'tool_use' as any);
            console.log(`[AI-AGENT] Ejecutando ${toolCalls.length} llamadas a herramientas...`);
            return;
        }

        if (assistantMsg.stopReason === 'error' && assistantMsg.errorMessage) {
            const meta = {
                provider: (assistantMsg as any).provider,
                model: (assistantMsg as any).model,
                api: (assistantMsg as any).api,
                error: assistantMsg.errorMessage
            };
            console.error('💣☠️ [AI-AGENT] Error del LLM:', meta);
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

        // Persist conversation history after a completed turn
        void this.persistMessages();

        void this.notifyListeners({ text: responseText });
    }

    private async persistMessages(): Promise<void> {
        if (!this.store || !this.storeKey) {
            return;
        }

        try {
            await this.store.saveRaw(this.storeKey, this.agent.state.messages);
            console.log(`[AI-AGENT] Conversación guardada: ${this.storeKey} (${this.agent.state.messages.length} mensajes)`);
        } catch (error) {
            console.error('[AI-AGENT] Error guardando conversación:', error);
        }
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
