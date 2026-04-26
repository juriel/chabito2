import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

export const sendWhatsAppMessageParams = Type.Object({
    phoneNumber: Type.String({ description: 'Phone number to send the message to. Should include country code, e.g. 573001234567.' }),
    message: Type.String({ description: 'The text message to send.' })
});

export function createSendWhatsAppMessageTool(botSession: string): AgentTool<typeof sendWhatsAppMessageParams> {
    return {
        name: 'send_whatsapp_message',
        label: 'Send WhatsApp Message',
        description: 'Sends a WhatsApp text message to a specific third-party phone number. Useful when the user asks you to contact someone else, notify a phone number, or forward a message.',
        parameters: sendWhatsAppMessageParams,
        execute: async (_toolCallId, params) => {
            const port = process.env.PORT || 3000;
            const url = `http://127.0.0.1:${port}/api/sessions/${encodeURIComponent(botSession)}/send`;
            
            console.log(`[TOOL] send_whatsapp_message → to="${params.phoneNumber}" msg="${params.message}"`);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: params.phoneNumber,
                        text: params.message
                    })
                });

                if (!response.ok) {
                    const text = await response.text();
                    console.error(`[TOOL] send_whatsapp_message FAILED (${response.status}): ${text}`);
                    return {
                        content: [{ type: 'text', text: `Failed to send message to ${params.phoneNumber}. Error: ${text}` }],
                        details: { error: text }
                    };
                }

                console.log(`[TOOL] send_whatsapp_message OK → ${params.phoneNumber}`);
                return {
                    content: [{ type: 'text', text: `Successfully sent the message to ${params.phoneNumber}.` }],
                    details: { success: true, to: params.phoneNumber }
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[TOOL] send_whatsapp_message ERROR:`, errorMessage);
                return {
                    content: [{ type: 'text', text: `Failed to execute HTTP request. Error: ${errorMessage}` }],
                    details: { error: errorMessage }
                };
            }
        }
    };
}
