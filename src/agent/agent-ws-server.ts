import { createServer, type Server as HttpServer } from 'node:http';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import { AgentsMap } from './agents-map.ts';
import type { ChatMessageDto } from '../dto/chat-message-dto.ts';
import type { AiAgentResponseEvent } from './ai-agent.ts';

interface ConversationSnapshot {
    bot_session: string;
    agent_id: string;
    agent_nickname: string;
    peer_id: string;
    peer_nickname: string;
}

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
    private readonly agentsMap = AgentsMap.getInstance();
    private readonly conversationSockets = new Map<string, Set<WebSocket>>();
    private readonly conversationSnapshots = new Map<string, ConversationSnapshot>();
    private readonly conversationUnsubscribers = new Map<string, () => void>();

    constructor(
        private readonly port = Number(process.env.AGENT_WS_PORT || 8081),
        private readonly host = process.env.AGENT_WS_HOST || '0.0.0.0'
    ) {}

    public start(): void {
        if (this.server) {
            return;
        }

        this.server = createServer(this.handleHttpRequest);
        this.wsServer = new WebSocketServer({ server: this.server });
        this.wsServer.on("connection", this.handleConnection.bind(this));
        this.server.listen(this.port, this.host, this.handleServerListening.bind(this));
    }

    private readonly handleHttpRequest = (_req: unknown, res: { writeHead: (statusCode: number, headers: Record<string, string>) => void; end: (body: string) => void }): void => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
            service: 'agent-ws-server',
            status: 'ok',
            websocket_url: `ws://${this.host}:${this.port}`
        }));
    };

    private readonly handleConnection = (socket: WebSocket): void => {
        socket.on("message",this.handleSocketMessage.bind(this, socket));
        socket.on("error", this.handleSocketError.bind(this));
        socket.on("close", this.handleSocketClose.bind(this, socket));
       
    };

    private async handleSocketMessage(socket: WebSocket, data: RawData): Promise<void> {
        let message: ChatMessageDto | undefined;

        try {
            message = this.parseChatMessageDto(data);
            console.log('[AGENT-WS] DTO recibido:', message);
            this.registerSocketForConversation(socket, message);
            await this.dispatchMessageToAgent(message);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[AGENT-WS] Error procesando mensaje:', error);

            if (message) {
                this.sendToSocket(socket, this.createErrorResponseDto(message, errorMessage));
                return;
            }

            this.sendToSocket(socket, this.createErrorResponseDto(undefined, errorMessage));
        }
    }

    private readonly handleSocketError = (error: Error): void => {
        console.error('[AGENT-WS] Error en socket:', error);
    };

    private handleSocketClose(socket: WebSocket): void {
        for (const [conversationKey, sockets] of this.conversationSockets.entries()) {
            if (!sockets.delete(socket)) {
                continue;
            }

            if (sockets.size === 0) {
                this.releaseConversation(conversationKey);
            }
        }
    }

    private readonly handleServerListening = (): void => {
        console.log(`[AGENT-WS] Servidor PI Agent Core escuchando en ws://${this.host}:${this.port}`);
    };

    private getConversationKey(message: ChatMessageDto): string {
        return `${message.bot_session}:${message.peer_id}`;
    }

    private parseChatMessageDto(data: RawData): ChatMessageDto {
        const rawText = typeof data === 'string' ? data : data.toString('utf8');
        const parsed = JSON.parse(rawText) as unknown;

        if (!isChatMessageDto(parsed)) {
            throw new Error('Payload recibido no coincide con ChatMessageDto');
        }

        return parsed;
    }

    private registerSocketForConversation(socket: WebSocket, message: ChatMessageDto): void {
        const conversationKey = this.getConversationKey(message);
        const sockets = this.conversationSockets.get(conversationKey) || new Set<WebSocket>();

        sockets.add(socket);
        this.conversationSockets.set(conversationKey, sockets);
        this.conversationSnapshots.set(conversationKey, {
            bot_session: message.bot_session,
            agent_id: message.agent_id,
            agent_nickname: message.agent_nickname,
            peer_id: message.peer_id,
            peer_nickname: message.peer_nickname
        });

        this.ensureConversationSubscribed(conversationKey);
    }

    private async dispatchMessageToAgent(message: ChatMessageDto): Promise<void> {
        const conversationKey = this.getConversationKey(message);
        const agent = this.agentsMap.getOrCreate(conversationKey);

        try {
            await agent.receive(message.text);
        } catch (error) {
            this.broadcastToConversation(
                conversationKey,
                this.createErrorResponseDto(message, error instanceof Error ? error.message : String(error))
            );
        }
    }

    private ensureConversationSubscribed(conversationKey: string): void {
        if (this.conversationUnsubscribers.has(conversationKey)) {
            return;
        }

        const agent = this.agentsMap.getOrCreate(conversationKey);
        const unsubscribe = agent.subscribe(
            this.handleAgentResponse.bind(this, conversationKey)
        );

        this.conversationUnsubscribers.set(conversationKey, unsubscribe);
    }

    private handleAgentResponse(conversationKey: string, event: AiAgentResponseEvent): void {
        const snapshot = this.conversationSnapshots.get(conversationKey);
        if (!snapshot) {
            return;
        }

        this.broadcastToConversation(
            conversationKey,
            this.createOutgoingResponseDto(snapshot, event.text)
        );
    }

    private releaseConversation(conversationKey: string): void {
        this.conversationSockets.delete(conversationKey);
        this.conversationSnapshots.delete(conversationKey);
        this.conversationUnsubscribers.get(conversationKey)?.();
        this.conversationUnsubscribers.delete(conversationKey);
    }

    private createOutgoingResponseDto(snapshot: ConversationSnapshot, responseText: string): ChatMessageDto {
        return {
            ...snapshot,
            whatsapp_message_id: '',
            direction: 'out',
            timestamp: Date.now(),
            text: responseText,
            attachments: []
        };
    }

    private broadcastToConversation(conversationKey: string, payload: ChatMessageDto): void {
        const sockets = this.conversationSockets.get(conversationKey);
        if (!sockets) {
            return;
        }

        for (const socket of sockets) {
            if (!this.sendToSocket(socket, payload)) {
                sockets.delete(socket);
            }
        }

        if (sockets.size === 0) {
            this.releaseConversation(conversationKey);
        }
    }

    private sendToSocket(socket: WebSocket, payload: ChatMessageDto): boolean {
        if (socket.readyState !== WebSocket.OPEN) {
            return false;
        }

        socket.send(JSON.stringify(payload));
        return true;
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

export interface AgentMessageStream {
    close: () => void;
    opened: Promise<void>;
}

export function subscribeToAgentMessages(
    payload: ChatMessageDto,
    onMessage: (message: ChatMessageDto) => void,
    serverUrl = process.env.AGENT_WS_URL || `ws://127.0.0.1:${process.env.AGENT_WS_PORT || 8081}`
): AgentMessageStream {
    const ws = new WebSocket(serverUrl);
    let isOpen = false;

    const opened = new Promise<void>((resolve, reject) => {
        ws.once('open', () => {
            isOpen = true;
            ws.send(JSON.stringify(payload));
            resolve();
        });

        ws.once('error', () => {
            reject(new Error(`No fue posible conectar con el servidor ${serverUrl}`));
        });
    });

    ws.on('error', (error) => {
        if (!isOpen) {
            return;
        }

        console.error('[AGENT-WS] Error en stream cliente:', error);
    });

    ws.on('message', (data: RawData) => {
        try {
            const rawText = typeof data === 'string' ? data : data.toString('utf8');
            const parsed = JSON.parse(rawText) as unknown;

            if (!isChatMessageDto(parsed)) {
                throw new Error('El servidor no devolvio un ChatMessageDto valido');
            }

            onMessage(parsed);
        } catch (error) {
            console.error('[AGENT-WS] Error procesando mensaje de stream:', error);
        }
    });

    return {
        close: () => {
            ws.close();
        },
        opened
    };
}

export async function sendChatMessageToAgent(
    payload: ChatMessageDto,
    serverUrl = process.env.AGENT_WS_URL || `ws://127.0.0.1:${process.env.AGENT_WS_PORT || 8081}`
): Promise<ChatMessageDto> {
    return await new Promise<ChatMessageDto>((resolve, reject) => {
        let settled = false;
        const stream = subscribeToAgentMessages(
            payload,
            (message) => {
                settled = true;
                stream.close();
                resolve(message);
            },
            serverUrl
        );

        stream.opened.catch((error) => {
            if (settled) {
                return;
            }

            settled = true;
            reject(error);
        });
    });
}
