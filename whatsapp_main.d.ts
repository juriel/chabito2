import type { WASocket } from 'baileys';
export declare class WhatsappSocketEnvelope {
    uuid: string;
    sock?: WASocket;
    qr?: string;
    connectionState: 'connecting' | 'open' | 'close' | 'undefined';
    lastDisconnect?: any;
    private groupCache;
    constructor(uuid: string);
    connect(): Promise<void>;
    private setupEvents;
    private handleMessagesUpsert;
    private toChatMessageDto;
    private handleConnectionUpdate;
}
//# sourceMappingURL=whatsapp_main.d.ts.map