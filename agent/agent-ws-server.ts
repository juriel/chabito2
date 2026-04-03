import { createServer, type Server as HttpServer } from 'node:http';
import { Agent, type AgentMessage } from '@mariozechner/pi-agent-core';
import { getModel, type AssistantMessage } from '@mariozechner/pi-ai';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import type { ChatMessageDto } from '../dto/chat-message-dto.js';

function isChatMessageDto(payload: unknown): payload is ChatMessageDto {
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    const candidate = payload as Record<string, unknown>;
    return typeof candidate.bot_session === 'string'
        && typeof candidate.agent_id === 'string'
        && typeof candidate.agent_nickname === 'string'
        && typeof candidate.peer_id === 'string'
        && typeof candidate.peer_nickname === 'string'
        && typeof candidate.whatsapp_message_id === 'string'
        && (candidate.direction === 'in' || candidate.direction === 'out')
        && typeof candidate.timestamp === 'number'
        && typeof candidate.text === 'string'
        && Array.isArray(candidate.attachments);
}

export class AgentWebSocketServer {
    private server?: HttpServer;
    private wsServer?: WebSocketServer;
    private readonly agents = new Map<string, Agent>();
    private readonly systemPrompt = process.env.AGENT_SYSTEM_PROMPT
        || 'Eres Chabito. Responde de forma util, breve y amable por WhatsApp.';
    private readonly modelProvider = (process.env.PI_PROVIDER || 'openai').trim().toLowerCase();
    private readonly modelId = (process.env.PI_MODEL || 'gpt-5-mini').trim();

    constructor(
        private readonly port = Number(process.env.AGENT_WS_PORT || 8081),
        private readonly host = process.env.AGENT_WS_HOST || '0.0.0.0'
    ) {
        this.handleHttpRequest = this.handleHttpRequest.bind(this);
        this.handleConnection = this.handleConnection.bind(this);
        this.handleServerListening = this.handleServerListening.bind(this);
    }

    public start(): void {
        if (this.server) {
            return;
        }

        this.server = createServer(this.handleHttpRequest);
        this.wsServer = new WebSocketServer({ server: this.server });
        this.wsServer.on('connection', this.handleConnection);

        this.server.listen(this.port, this.host, this.handleServerListening);
    }

    private handleHttpRequest(_req: unknown, res: { writeHead: (statusCode: number, headers: Record<string, string>) => void; end: (body: string) => void }): void {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            service: 'agent-ws-server',
            status: 'ok',
            websocket_url: `ws://${this.host}:${this.port}`
        }));
    }

    private handleConnection(socket: WebSocket): void {
        socket.on('message', this.handleSocketMessage.bind(this, socket));
        socket.on('error', this.handleSocketError.bind(this));
    }

    private async handleSocketMessage(socket: WebSocket, data: RawData): Promise<void> {
        try {
            const rawText = typeof data === 'string' ? data : data.toString('utf8');
            const parsed = JSON.parse(rawText) as unknown;

            if (!isChatMessageDto(parsed)) {
                throw new Error('Payload recibido no coincide con ChatMessageDto');
            }

            console.log('[AGENT-WS] DTO recibido:', parsed);
            const responseDto = await this.generateAgentResponse(parsed);
            socket.send(JSON.stringify(responseDto));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[AGENT-WS] Error procesando mensaje:', error);
            socket.send(JSON.stringify(this.createErrorResponseDto(parsedIfChatMessage(data), message)));
        }
    }

    private handleSocketError(error: Error): void {
        console.error('[AGENT-WS] Error en socket:', error);
    }

    private handleServerListening(): void {
        console.log(`[AGENT-WS] Servidor PI Agent Core escuchando en ws://${this.host}:${this.port}`);
        console.log(`[AGENT-WS] Modelo configurado: ${this.modelProvider}/${this.modelId}`);
    }

    private async generateAgentResponse(message: ChatMessageDto): Promise<ChatMessageDto> {
        const agent = this.getOrCreateAgent(message);
        await agent.prompt(message.text);
        const response = this.getLastAssistantMessage(agent.state.messages);

        return {
            ...message,
            direction: 'out',
            timestamp: Date.now(),
            text: response
                ? this.extractAssistantText(response.content) || 'No pude generar una respuesta en este momento.'
                : 'No pude generar una respuesta en este momento.'
        };
    }

    private getOrCreateAgent(message: ChatMessageDto): Agent {
        const conversationKey = `${message.bot_session}:${message.peer_id}`;
        const existingAgent = this.agents.get(conversationKey);

        if (existingAgent) {
            return existingAgent;
        }

        const model = this.resolveModel();
        const agent = new Agent({
            initialState: {
                systemPrompt: this.systemPrompt,
                model,
                messages: [],
                tools: [],
                thinkingLevel: 'off'
            },
            sessionId: conversationKey,
            getApiKey: this.getApiKeyForProvider.bind(this)
        });

        this.agents.set(conversationKey, agent);
        return agent;
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

    private createErrorResponseDto(message: ChatMessageDto | undefined, errorMessage: string): ChatMessageDto {
        return {
            bot_session: message?.bot_session || 'unknown',
            agent_id: message?.agent_id || 'agent-ws-server',
            agent_nickname: message?.agent_nickname || 'Chabito',
            peer_id: message?.peer_id || 'unknown',
            peer_nickname: message?.peer_nickname || 'unknown',
            whatsapp_message_id: message?.whatsapp_message_id || '',
            direction: 'out',
            timestamp: Date.now(),
            text: `Ocurrio un error procesando tu mensaje: ${errorMessage}`,
            attachments: []
        };
    }
}

function parsedIfChatMessage(data: RawData): ChatMessageDto | undefined {
    try {
        const rawText = typeof data === 'string' ? data : data.toString('utf8');
        const parsed = JSON.parse(rawText) as unknown;
        return isChatMessageDto(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

export async function sendChatMessageToAgent(
    payload: ChatMessageDto,
    serverUrl = process.env.AGENT_WS_URL || `ws://127.0.0.1:${process.env.AGENT_WS_PORT || 8081}`
): Promise<ChatMessageDto> {
    return await new Promise<ChatMessageDto>((resolve, reject) => {
        const ws = new WebSocket(serverUrl);

        ws.once('open', () => {
            ws.send(JSON.stringify(payload));
        });

        ws.once('message', (data: RawData) => {
            try {
                const rawText = typeof data === 'string' ? data : data.toString('utf8');
                const parsed = JSON.parse(rawText) as unknown;

                if (!isChatMessageDto(parsed)) {
                    throw new Error('El servidor no devolvio un ChatMessageDto valido');
                }

                resolve(parsed);
            } catch (error) {
                reject(error);
            } finally {
                ws.close();
            }
        });

        ws.once('error', () => {
            reject(new Error(`No fue posible conectar con el servidor ${serverUrl}`));
        });
    });
}
