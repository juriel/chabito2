import type { ChatMessageDto } from '../dto/chat-message-dto.js';
export declare class AgentWebSocketServer {
    private readonly port;
    private readonly host;
    private server?;
    private wsServer?;
    constructor(port?: number, host?: string);
    start(): void;
}
export declare function sendChatMessageToAgent(payload: ChatMessageDto, serverUrl?: string): Promise<ChatMessageDto>;
//# sourceMappingURL=agent-ws-server.d.ts.map