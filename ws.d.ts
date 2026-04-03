declare module 'ws' {
    import type { EventEmitter } from 'node:events';
    import type { Server as HttpServer } from 'node:http';

    export type RawData = string | Buffer | ArrayBuffer | Buffer[];

    export default class WebSocket extends EventEmitter {
        constructor(address: string);
        send(data: string | Buffer): void;
        close(): void;
        once(event: 'open', listener: () => void): this;
        once(event: 'message', listener: (data: RawData) => void): this;
        once(event: 'error', listener: (error: Error) => void): this;
        on(event: 'message', listener: (data: RawData) => void): this;
        on(event: 'error', listener: (error: Error) => void): this;
    }

    export class WebSocketServer extends EventEmitter {
        constructor(options: { server: HttpServer });
        on(event: 'connection', listener: (socket: WebSocket) => void): this;
    }
}
