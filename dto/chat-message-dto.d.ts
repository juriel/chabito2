export interface ChatMessageAttachmentDto {
    mime_type: string;
    payload_base64: string;
}
export interface ChatMessageDto {
    bot_session: string;
    agent_id: string;
    agent_nickname: string;
    peer_id: string;
    peer_nickname: string;
    whatsapp_message_id: string;
    direction: 'in' | 'out';
    timestamp: number;
    text: string;
    attachments: ChatMessageAttachmentDto[];
}
//# sourceMappingURL=chat-message-dto.d.ts.map