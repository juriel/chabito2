import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

export const searchWhatsAppContactsParams = Type.Object({
    query: Type.String({ description: 'The name or phone number to search for (partial match).' })
});

export function createSearchWhatsAppContactsTool(botSession: string): AgentTool<typeof searchWhatsAppContactsParams> {
    return {
        name: 'search_whatsapp_contacts',
        label: 'Search WhatsApp Contacts',
        description: 'Searches for one or more WhatsApp contacts by name or phone number using a partial match (similar to SQL LIKE). Useful for finding the phone number of someone the user wants to contact.',
        parameters: searchWhatsAppContactsParams,
        execute: async (_toolCallId, params) => {
            const port = process.env.PORT || 3000;
            const url = `http://127.0.0.1:${port}/api/sessions/${encodeURIComponent(botSession)}/search-contacts`;
            
            console.log(`[TOOL] search_whatsapp_contacts → query="${params.query}"`);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: params.query
                    })
                });

                if (!response.ok) {
                    const text = await response.text();
                    console.error(`[TOOL] search_whatsapp_contacts FAILED (${response.status}): ${text}`);
                    return {
                        content: [{ type: 'text', text: `Failed to search contacts for "${params.query}". Error: ${text}` }],
                        details: { error: text }
                    };
                }

                const data = await response.json();
                const contacts = data.contacts || [];

                if (contacts.length === 0) {
                    return {
                        content: [{ type: 'text', text: `No contacts found matching "${params.query}".` }],
                        details: { success: true, count: 0 }
                    };
                }

                const contactList = contacts.map((c: any) => {
                    const name = c.name || c.pushName || c.verifiedName || 'Unknown';
                    const id = c.id.split('@')[0];
                    return `- *${name}*: ${id}`;
                }).join('\n');

                return {
                    content: [{ type: 'text', text: `Found ${contacts.length} contact(s) matching "${params.query}":\n${contactList}` }],
                    details: { success: true, count: contacts.length }
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[TOOL] search_whatsapp_contacts ERROR:`, errorMessage);
                return {
                    content: [{ type: 'text', text: `Failed to execute HTTP request. Error: ${errorMessage}` }],
                    details: { error: errorMessage }
                };
            }
        }
    };
}
