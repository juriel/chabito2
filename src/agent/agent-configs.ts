import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const template = (file: string) => readFileSync(join('./template', file), 'utf8');

export const DEFAULT_PROMPTS = {
    manager: template('prompt-admin.txt'),
    client: template('prompt.txt'),
    managers: template('managers.txt')
};

export type AgentType = 'manager' | 'client';

export interface AgentTypeConfig {
    readonly systemPrompt: string;
    readonly toolIds: readonly string[];
    readonly canAccessAdminTools: boolean;
}

export const AGENT_CONFIGS = {
    manager: {
        systemPrompt: DEFAULT_PROMPTS.manager,
        toolIds: ['change-prompt', 'get-prompt', 'send-whatsapp', 'manage-managers', 'manage-tasks', 'get-time'],
        canAccessAdminTools: true
    } as const,

    client: {
        systemPrompt: DEFAULT_PROMPTS.client,
        toolIds: ['notify-manager', 'get-time'],
        canAccessAdminTools: false
    } as const
} satisfies Record<AgentType, AgentTypeConfig>;

export function getConfigForType(type: AgentType): AgentTypeConfig {
    return AGENT_CONFIGS[type];
}

export function isManagerType(type: AgentType): boolean {
    return type === 'manager';
}
