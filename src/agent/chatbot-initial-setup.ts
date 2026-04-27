import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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
            await textStore.save('managers', '# Agrega un número por línea (ej: 573001234567)\n');
        }
    }

    private static normalizeJid(jid: string): string {
        return jid
            .split('/')
            .shift()!
            .split(':')
            .shift()!
            .trim()
            .toLowerCase();
    }

    private static getPhoneNumberLocalPart(jid: string): string {
        const bare = this.normalizeJid(jid).split('@')[0];
        const match = bare.match(/^\d+/);
        return match ? match[0] : bare;
    }

    private static isSameManagerJid(peerId: string, managerJid: string): boolean {
        const peerBare = this.normalizeJid(peerId);
        const managerBare = this.normalizeJid(managerJid);

        if (peerBare === managerBare) {
            console.log(`[SETUP] ✅ Match exacto: ${peerBare}`);
            return true;
        }

        const peerPhone = this.getPhoneNumberLocalPart(peerBare);
        const managerPhone = this.getPhoneNumberLocalPart(managerBare);

        const match = peerPhone === managerPhone && peerPhone.length > 5;
        if (match) {
            console.log(`[SETUP] ✅ Match por número detectado: ${peerPhone} (Peer: ${peerBare} vs Manager: ${managerBare})`);
        } else {
            console.log(`[SETUP] ❌ No match: PeerPhone=${peerPhone} vs ManagerPhone=${managerPhone}`);
        }
        return match;
    }

    private static getBotSessionDir(botSession: string): string {
        return resolve(join('./data', botSession));
    }

    private static getManagersPath(botSession: string): string {
        return join(this.getBotSessionDir(botSession), 'managers.txt');
    }

    private static async readManagers(botSession: string): Promise<string[]> {
        try {
            const rawContent = await readFile(this.getManagersPath(botSession), 'utf8');
            return rawContent
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0 && !line.startsWith('#'));
        } catch {
            return [];
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

        const managersList = await this.readManagers(botSession);

        // REGLA 1: Si no hay nadie, el primero se vuelve manager
        if (managersList.length === 0) {
            console.log(`[SETUP] 🆕 Primer usuario detectado. Promoviendo a ${peerId} como MANAGER de ${botSession}`);
            const textStore = StoreFactory.text('./data', botSession);
            await textStore.append('managers', `${peerId}\n`);
        }

        const managersListAfter = await this.readManagers(botSession);
        console.log(`[SETUP] Managers cargados (${managersListAfter.length}):`, managersListAfter);

        // REGLA 2: Reconocer si el peerId pertenece a un manager existente
        const isManager = managersListAfter.some((managerJid) => {
            const match = this.isSameManagerJid(peerId, managerJid);
            console.log(`[SETUP] Comparando ${peerId} vs ${managerJid} → ${match ? '✅ MATCH' : '❌ NO MATCH'}`);
            return match;
        });

        if (isManager) {
            console.log(`[SETUP] 👑 Acceso administrativo concedido para: ${peerId}`);
            return 'manager';
        }

        console.log(`[SETUP] 👤 Acceso de cliente para: ${peerId}`);
        console.log(`[SETUP] 💡 Para promover este usuario a MANAGER, agrega esta línea a data/${botSession}/managers.txt:`);
        console.log(`        ${peerId}`);

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
