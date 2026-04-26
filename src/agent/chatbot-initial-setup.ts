import { StoreFactory } from '../persistence/index.ts';
import type { AgentType } from './agent-configs.ts';

/**
 * Gestiona la configuración inicial y el comportamiento diferenciado 
 * de cada chatbot basado en quién le escribe.
 */
export class ChatbotInitialSetup {
    private static readonly DEFAULT_EXTERNAL_PROMPT = 
        `Eres el asistente de una tienda. Responde de forma amable y profesional.`;

    private static readonly DEFAULT_ADMIN_PROMPT = 
        `Eres el Asistente Administrativo de Chabito. 
         Estás hablando con el DUEÑO o un MANAGER del bot. 
         Ayúdales a gestionar el sistema y responde con datos técnicos si es necesario.`;

    /**
     * Asegura que existan todos los archivos base para un bot nuevo.
     */
    public static async ensureFiles(botSession: string): Promise<void> {
        const textStore = StoreFactory.text('./data', botSession);
        
        // 1. Prompt Externo (Público)
        if (!(await textStore.exists('prompt'))) {
            await textStore.save('prompt', this.DEFAULT_EXTERNAL_PROMPT);
        }

        // 2. Prompt Administrativo (Dueños)
        if (!(await textStore.exists('prompt-admin'))) {
            await textStore.save('prompt-admin', this.DEFAULT_ADMIN_PROMPT);
        }

        // 3. Lista de Managers
        if (!(await textStore.exists('managers'))) {
            // Por defecto vacío, el usuario debe agregar números aquí
            await textStore.save('managers', '# Agrega un número por línea (ej: 573001234567@s.whatsapp.net)\n');
        }
    }

    /**
     * Determina el tipo de agente basándose en si el peerId es un manager.
     * Si no hay managers registrados, el primero en escribir se convierte en uno.
     */
    public static async getAgentType(botSession: string, peerId: string): Promise<AgentType> {
        // Guard clause: si no hay peerId, devolver client
        if (!peerId || peerId.trim().length === 0) {
            return 'client';
        }

        await this.ensureFiles(botSession);
        
        const textStore = StoreFactory.text('./data', botSession);
        
        // Cargar lista actual
        const managersResult = await textStore.load('managers');
        const rawContent = managersResult.ok ? managersResult.value : '';
        
        const managersList = rawContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#'));

        // REGLA 1: Si no hay nadie, el primero se vuelve manager
        if (managersList.length === 0) {
            console.log(`[SETUP] 🆕 Primer usuario detectado. Promoviendo a ${peerId} como MANAGER de ${botSession}`);
            await textStore.append('managers', `${peerId}\n`);
            return 'manager';
        }

        // REGLA 2: Reconocer si es un mensaje de sí mismo (o ya está en la lista)
        // Normalmente peerId == ownJid si te escribes a ti mismo
        const isManager = managersList.some(m => {
            const managerIdPart = m.split(':')[0];
            return managerIdPart ? peerId.includes(managerIdPart) : false;
        });

        if (isManager) {
            console.log(`[SETUP] 👑 Acceso administrativo para: ${peerId}`);
            return 'manager';
        }

        console.log(`[SETUP] 👤 Acceso de cliente para: ${peerId}`);
        return 'client';
    }

    /**
     * Determina qué prompt usar basándose en el botSession y el peerId (quién escribe).
     * Este método se mantiene para compatibilidad hacia atrás.
     */
    public static async getPromptForPeer(botSession: string, peerId: string): Promise<string> {
        const agentType = await this.getAgentType(botSession, peerId);
        const textStore = StoreFactory.text('./data', botSession);
        
        if (agentType === 'manager') {
            const adminPrompt = await textStore.load('prompt-admin');
            return adminPrompt.ok ? adminPrompt.value : this.DEFAULT_ADMIN_PROMPT;
        }

        const externalPrompt = await textStore.load('prompt');
        return externalPrompt.ok ? externalPrompt.value : this.DEFAULT_EXTERNAL_PROMPT;
    }
}
