import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ChatMessageDto } from '../dto/chat-message-dto.ts';
import { ChatbotInitialSetup } from './chatbot-initial-setup.ts';

/**
 * Procesa wildcards en los prompts del sistema.
 */
export class WildcardProcessor {
    private static readonly WEEK_DAYS = [
        'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
    ];

    /**
     * Reemplaza los wildcards {{wildcard}} en el texto dado.
     */
    public static async process(text: string, dto: ChatMessageDto, botSession: string): Promise<string> {
        const now = new Date();
        
        // Formateadores básicos
        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        const formatTime = (d: Date) => d.toTimeString().split(' ')[0].substring(0, 5);
        const formatDay = (d: Date) => this.WEEK_DAYS[d.getDay()];
        const formatFull = (d: Date) => `${formatDate(d)} (${formatDay(d)})`;

        // Datos de ayer y mañana
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);

        // MANAGER_NAME (Solo si es manager)
        let managerName = 'N/A';
        const type = await ChatbotInitialSetup.getAgentType(botSession, dto.peer_id);
        if (type === 'manager') {
            managerName = await this.getManagerName(botSession, dto.peer_id);
        }

        const wildcards: Record<string, string> = {
            'peer_id': dto.peer_id,
            'peer_nickname': dto.peer_nickname || 'Usuario',
            'CURRENT_DATE': formatDate(now),
            'CURRENT_TIME': formatTime(now),
            'CURRENT_WEEK_DAY': formatDay(now),
            'YESTERDAY': formatFull(yesterday),
            'TOMORROW': formatFull(tomorrow),
            'MANAGER_NAME': managerName
        };

        let result = text;
        for (const [key, value] of Object.entries(wildcards)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            result = result.replace(regex, value);
        }

        return result;
    }

    private static async getManagerName(botSession: string, peerId: string): Promise<string> {
        try {
            const managersPath = join('./data', botSession, 'managers.txt');
            const content = await readFile(managersPath, 'utf8');
            const lines = content.split('\n').map(l => l.trim());
            
            for (const line of lines) {
                if (line.startsWith('#') || line.length === 0) continue;
                const parts = line.split(/\s+/);
                const phone = parts[0];
                
                // Usamos la misma lógica de comparación que ChatbotInitialSetup
                if (phone === peerId || peerId.includes(phone) || phone.includes(peerId.split('@')[0])) {
                    return parts.slice(1).join(' ') || 'Manager';
                }
            }
        } catch {
            // Fallback
        }
        return 'Manager';
    }
}
