import parser from 'cron-parser';
import { ManagerAgentFactory } from './factories/manager-agent-factory.ts';
import { StoreFactory } from '../persistence/index.ts';

export interface BotTask {
    id: string;
    type: 'once' | 'recurring';
    schedule: string; // ISO date for 'once', crontab for 'recurring'
    instruction: string;
    lastExecuted?: number;
}

export class TaskScheduler {
    private static readonly instances = new Map<string, TaskScheduler>();

    public static getInstance(botSession: string): TaskScheduler | undefined {
        return TaskScheduler.instances.get(botSession);
    }

    private tasks: BotTask[] = [];
    private interval?: any;
    private isRunning = false;

    constructor(
        private readonly botSession: string,
        private readonly modelOptions: { modelProvider: string; modelId: string }
    ) {
        TaskScheduler.instances.set(botSession, this);
    }

    public async start(): Promise<void> {
        if (this.isRunning) return;
        this.isRunning = true;

        await this.loadTasks();

        // Run every minute
        this.interval = setInterval(() => {
            void this.checkAndExecute();
        }, 60000);

        console.log(`[SCHEDULER] ⏰ Sistema de tareas iniciado para chatbot: ${this.botSession}`);
        
        // Initial check in case some tasks were missed while offline
        void this.checkAndExecute();
    }

    public stop(): void {
        if (this.interval) {
            clearInterval(this.interval);
        }
        this.isRunning = false;
        TaskScheduler.instances.delete(this.botSession);
    }

    public async addTask(task: BotTask): Promise<void> {
        this.tasks.push(task);
        await this.saveTasks();
        console.log(`[SCHEDULER] 🆕 Tarea agregada: ${task.id} (${task.type})`);
    }

    public async removeTask(id: string): Promise<boolean> {
        const initialLength = this.tasks.length;
        this.tasks = this.tasks.filter(t => t.id !== id);
        if (this.tasks.length !== initialLength) {
            await this.saveTasks();
            console.log(`[SCHEDULER] 🗑️ Tarea eliminada: ${id}`);
            return true;
        }
        return false;
    }

    public getTasks(): BotTask[] {
        return [...this.tasks];
    }

    private async loadTasks(): Promise<void> {
        const store = StoreFactory.rawFile<BotTask[]>('./data', this.botSession);
        const result = await store.loadRaw('tasks');
        if (result.ok) {
            this.tasks = result.value;
            console.log(`[SCHEDULER] 📂 Cargadas ${this.tasks.length} tareas para ${this.botSession}`);
        }
    }

    private async saveTasks(): Promise<void> {
        const store = StoreFactory.rawFile<BotTask[]>('./data', this.botSession);
        await store.saveRaw('tasks', this.tasks);
    }

    private async checkAndExecute(): Promise<void> {
        const now = Date.now();
        const toRemove: string[] = [];
        let modified = false;

        for (const task of this.tasks) {
            let shouldRun = false;

            if (task.type === 'once') {
                const targetTime = new Date(task.schedule).getTime();
                if (!isNaN(targetTime) && now >= targetTime) {
                    shouldRun = true;
                    toRemove.push(task.id);
                }
            } else if (task.type === 'recurring') {
                try {
                    const options = {
                        currentDate: task.lastExecuted ? new Date(task.lastExecuted + 1000) : new Date(now - 61000)
                    };
                    const interval = parser.parseExpression(task.schedule, options);
                    const nextRun = interval.next().getTime();
                    
                    if (now >= nextRun) {
                        shouldRun = true;
                    }
                } catch (e) {
                    console.error(`[SCHEDULER] Error parseando cron "${task.schedule}" para tarea ${task.id}:`, e);
                }
            }

            if (shouldRun) {
                console.log(`[SCHEDULER] 🚀 Ejecutando instrucción: "${task.instruction}" (ID: ${task.id})`);
                task.lastExecuted = now;
                modified = true;
                void this.executeAgentTask(task);
            }
        }

        if (toRemove.length > 0) {
            this.tasks = this.tasks.filter(t => !toRemove.includes(t.id));
            modified = true;
        }

        if (modified) {
            await this.saveTasks();
        }
    }

    private async executeAgentTask(task: BotTask): Promise<void> {
        try {
            // Create a temporary manager agent to execute the instruction
            const builder = ManagerAgentFactory.create(this.botSession, 'system-scheduler', {
                ...this.modelOptions,
                sessionId: `sched-${task.id}-${Date.now()}`
            });

            // We don't need to subscribe to the agent because the agent will use TOOLS 
            // (like send_whatsapp_message) to perform the actual actions.
            const agent = await builder.buildAsync();
            
            // Give the agent the instruction
            await agent.receive(task.instruction);
            
            console.log(`[SCHEDULER] ✅ Instrucción procesada para tarea ${task.id}`);
        } catch (error) {
            console.error(`[SCHEDULER] ❌ Error en ejecución de agente para tarea ${task.id}:`, error);
        }
    }
}
