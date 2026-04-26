import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { StoreFactory } from '../../persistence/index.ts';

export const notifyManagerParams = Type.Object({
    message: Type.String({ description: 'The message to send to the managers' }),
    subject: Type.Optional(Type.String({ description: 'Optional subject or category for the message' }))
});

export function createNotifyManagerTool(botSession: string): AgentTool<typeof notifyManagerParams> {
    return {
        name: 'notify_manager',
        label: 'Notify Managers',
        description: 'Sends a notification message to the managers/administrators of this chatbot. Use when you need help with something or want to escalate an issue.',
        parameters: notifyManagerParams,
        execute: async (_toolCallId, params) => {
            const textStore = StoreFactory.text('./data', botSession);
            const port = process.env.PORT || 3000;

            console.log(`[TOOL] notify_manager → botSession="${botSession}" message="${params.message}"`);

            try {
                // Get managers list
                const managersResult = await textStore.load('managers');
                const rawContent = managersResult.ok ? managersResult.value : '';

                const managersList = rawContent
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0 && !line.startsWith('#'));

                if (managersList.length === 0) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: '⚠️ No managers configured yet. Cannot notify anyone.'
                            }
                        ],
                        details: { error: 'no_managers_configured' }
                    };
                }

                // Send notification to each manager
                const notificationMessage = params.subject
                    ? `[${params.subject}] ${params.message}`
                    : params.message;

                const sendPromises = managersList.map(async (managerJid) => {
                    const url = `http://127.0.0.1:${port}/api/sessions/${encodeURIComponent(botSession)}/send`;

                    try {
                        const response = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                to: managerJid,
                                text: `🔔 *Notification from Client*\n\n${notificationMessage}`
                            })
                        });

                        if (!response.ok) {
                            console.error(`[TOOL] notify_manager FAILED to send to ${managerJid}`);
                            return { success: false, manager: managerJid };
                        }

                        console.log(`[TOOL] notify_manager OK → ${managerJid}`);
                        return { success: true, manager: managerJid };
                    } catch (error) {
                        console.error(`[TOOL] notify_manager ERROR for ${managerJid}:`, error);
                        return { success: false, manager: managerJid, error: String(error) };
                    }
                });

                const results = await Promise.all(sendPromises);
                const successCount = results.filter((r) => r.success).length;

                return {
                    content: [
                        {
                            type: 'text',
                            text: `✅ Notificación enviada a ${successCount}/${managersList.length} managers.`
                        }
                    ],
                    details: { success: true, notifiedManagers: successCount, totalManagers: managersList.length }
                };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[TOOL] notify_manager ERROR:`, errorMessage);

                return {
                    content: [
                        {
                            type: 'text',
                            text: `❌ Error notificando a managers: ${errorMessage}`
                        }
                    ],
                    details: { error: errorMessage }
                };
            }
        }
    };
}
