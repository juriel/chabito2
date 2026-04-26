import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

export const getTimeParams = Type.Object({});

export function createGetTimeTool(): AgentTool<typeof getTimeParams> {
    return {
        name: 'get_current_time',
        label: 'Get Current Date and Time',
        description: 'Returns the current server date and time. Use this when the user asks for the date, time, or needs to know the current moment.',
        parameters: getTimeParams,
        execute: async () => {
            const now = new Date();
            const responseText = `La fecha y hora actual del servidor es: ${now.toLocaleString('es-CO', { timeZone: 'America/Bogota' })} (Hora de Colombia).`;
            
            console.log(`[TOOL] get_current_time → ${responseText}`);

            return {
                content: [{ type: 'text', text: responseText }],
                details: { 
                    iso: now.toISOString(),
                    local: now.toLocaleString(),
                    timestamp: now.getTime()
                }
            };
        }
    };
}
