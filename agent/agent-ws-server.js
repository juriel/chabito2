import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
function isChatMessageDto(payload) {
    if (!payload || typeof payload !== 'object') {
        return false;
    }
    const candidate = payload;
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
    port;
    host;
    server;
    wsServer;
    constructor(port = Number(process.env.AGENT_WS_PORT || 8081), host = process.env.AGENT_WS_HOST || '0.0.0.0') {
        this.port = port;
        this.host = host;
    }
    start() {
        if (this.server) {
            return;
        }
        this.server = createServer((req, res) => {
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
                service: 'agent-ws-server',
                status: 'ok',
                websocket_url: `ws://${this.host}:${this.port}`
            }));
        });
        this.wsServer = new WebSocketServer({ server: this.server });
        this.wsServer.on('connection', (socket) => {
            socket.on('message', (data) => {
                try {
                    const rawText = typeof data === 'string' ? data : data.toString('utf8');
                    const parsed = JSON.parse(rawText);
                    if (!isChatMessageDto(parsed)) {
                        throw new Error('Payload recibido no coincide con ChatMessageDto');
                    }
                    console.log('[AGENT-WS] DTO recibido:', parsed);
                    socket.send(JSON.stringify(parsed));
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    socket.send(JSON.stringify({ error: message }));
                }
            });
            socket.on('error', (error) => {
                console.error('[AGENT-WS] Error en socket:', error);
            });
        });
        this.server.listen(this.port, this.host, () => {
            console.log(`[AGENT-WS] Echo server escuchando en ws://${this.host}:${this.port}`);
        });
    }
}
export async function sendChatMessageToAgent(payload, serverUrl = process.env.AGENT_WS_URL || `ws://127.0.0.1:${process.env.AGENT_WS_PORT || 8081}`) {
    return await new Promise((resolve, reject) => {
        const ws = new WebSocket(serverUrl);
        ws.once('open', () => {
            ws.send(JSON.stringify(payload));
        });
        ws.once('message', (data) => {
            try {
                const rawText = typeof data === 'string' ? data : data.toString('utf8');
                const parsed = JSON.parse(rawText);
                if (!isChatMessageDto(parsed)) {
                    throw new Error('El servidor no devolvio un ChatMessageDto valido');
                }
                resolve(parsed);
            }
            catch (error) {
                reject(error);
            }
            finally {
                ws.close();
            }
        });
        ws.once('error', () => {
            reject(new Error(`No fue posible conectar con el servidor ${serverUrl}`));
        });
    });
}
//# sourceMappingURL=agent-ws-server.js.map