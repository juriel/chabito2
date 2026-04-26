import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { TaskScheduler, type BotTask } from '../task-scheduler.ts';

export const manageTasksParams = Type.Object({
    action: Type.Union([
        Type.Literal('add'),
        Type.Literal('remove'),
        Type.Literal('list')
    ], { description: 'Action to perform: "add" to schedule a new instruction, "remove" to delete a task, or "list" to see all tasks.' }),
    type: Type.Optional(Type.Union([
        Type.Literal('once'),
        Type.Literal('recurring')
    ], { description: 'Type of task: "once" for single execution, "recurring" for crontab. Required for add.' })),
    schedule: Type.Optional(Type.String({ 
        description: 'Schedule for the task. ISO date (e.g. 2024-12-31T23:59:00Z) for "once", or crontab expression (e.g. "0 9 * * *") for "recurring".' 
    })),
    instruction: Type.Optional(Type.String({ 
        description: 'The instruction the agent should execute. E.g. "Envía un saludo a 573001234567@s.whatsapp.net".' 
    })),
    id: Type.Optional(Type.String({ description: 'ID of the task to remove.' }))
});

export function createManageTasksTool(botSession: string): AgentTool<typeof manageTasksParams> {
    return {
        name: 'manage_tasks',
        label: 'Manage Scheduled Tasks',
        description: 'Allows managers to schedule automated instructions (one-time or recurring) for the bot. Instructions are processed by an agent with manager tools.',
        parameters: manageTasksParams,
        execute: async (_toolCallId, params) => {
            const scheduler = TaskScheduler.getInstance(botSession);
            if (!scheduler) {
                return {
                    content: [{ type: 'text', text: '❌ Error: El sistema de tareas no está activo para esta sesión.' }],
                    details: { error: 'scheduler_not_found' }
                };
            }

            console.log(`[TOOL] manage_tasks → action="${params.action}" botSession="${botSession}"`);

            try {
                if (params.action === 'list') {
                    const tasks = scheduler.getTasks();
                    const listText = tasks.length > 0
                        ? tasks.map(t => `- [${t.id}] (${t.type}): ${t.schedule} → "${t.instruction}"`).join('\n')
                        : '_No hay tareas programadas._';

                    return {
                        content: [{ type: 'text', text: `📋 *Tareas Programadas:*\n${listText}` }],
                        details: { tasks }
                    };
                }

                if (params.action === 'remove') {
                    if (!params.id) throw new Error('Se requiere el ID para eliminar una tarea.');
                    const success = await scheduler.removeTask(params.id);
                    return {
                        content: [{ type: 'text', text: success ? `✅ Tarea ${params.id} eliminada.` : `⚠️ No se encontró la tarea ${params.id}.` }],
                        details: { success }
                    };
                }

                if (params.action === 'add') {
                    if (!params.type || !params.schedule || !params.instruction) {
                        throw new Error('Para agregar una tarea se requiere: type, schedule e instruction.');
                    }

                    const newTask: BotTask = {
                        id: Math.random().toString(36).substring(2, 9).toUpperCase(),
                        type: params.type,
                        schedule: params.schedule,
                        instruction: params.instruction
                    };

                    await scheduler.addTask(newTask);

                    return {
                        content: [{ type: 'text', text: `✅ Tarea programada correctamente.\nID: *${newTask.id}*\nTipo: ${newTask.type}\nHorario: ${newTask.schedule}\nInstrucción: "${newTask.instruction}"` }],
                        details: { task: newTask }
                    };
                }

                throw new Error('Acción no reconocida.');
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                return {
                    content: [{ type: 'text', text: `❌ Error gestionando tareas: ${errorMessage}` }],
                    details: { error: errorMessage }
                };
            }
        }
    };
}
