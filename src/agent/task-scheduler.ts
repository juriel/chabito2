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

    public async updateTask(id: string, updates: Partial<Omit<BotTask, 'id'>>): Promise<boolean> {
        const index = this.tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            this.tasks[index] = { ...this.tasks[index], ...updates };
            await this.saveTasks();
            console.log(`[SCHEDULER] 📝 Tarea actualizada: ${id}`);
            return true;
        }
        return false;
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
        const MAX_TURNS = 5;
        const COMPLETION_MARKER = 'TAREA_COMPLETADA';

        try {
            console.log(`[SCHEDULER] 🤖 Iniciando flujo multi-agente para tarea: ${task.id}`);

            // 1. Crear Agente Ejecutor (con herramientas de manager)
            const executorBuilder = ManagerAgentFactory.create(this.botSession, 'system-executor', {
                ...this.modelOptions,
                sessionId: `exec-${task.id}-${Date.now()}`
            });
            const executor = await executorBuilder.buildAsync();

            // 2. Crear Agente Coordinador (sin herramientas, solo supervisión)
            const coordinatorBuilder = ManagerAgentFactory.create(this.botSession, 'system-coordinator', {
                ...this.modelOptions,
                sessionId: `coord-${task.id}-${Date.now()}`
            });
            // Modificamos el prompt del coordinador específicamente para esta tarea
            const coordinator = await coordinatorBuilder.buildAsync();
            coordinator.agent.state.systemPrompt = `Eres el Coordinador de Tareas de Chabito. 
Tu misión es asegurar que la siguiente instrucción se cumpla usando al Agente Ejecutor.
Instrucción original: "${task.instruction}"

Reglas:
1. Envía órdenes claras al Ejecutor.
2. Analiza sus respuestas.
3. Si el Ejecutor termina o el objetivo se cumple, escribe exactamente "${COMPLETION_MARKER}" para finalizar.
4. Tienes un máximo de ${MAX_TURNS} interacciones.`;

            // 3. Bucle de interacción
            let lastMessage = `Adelante, inicia la tarea: "${task.instruction}"`;
            
            for (let i = 0; i < MAX_TURNS; i++) {
                console.log(`[SCHEDULER] 🔄 Turno ${i + 1}/${MAX_TURNS} para tarea ${task.id}`);

                // El Coordinador genera la orden
                const coordinatorOrder = await coordinator.prompt(lastMessage);
                console.log(`[SCHEDULER] 🗣️ Coordinador: ${coordinatorOrder.substring(0, 50)}...`);

                if (coordinatorOrder.includes(COMPLETION_MARKER)) {
                    console.log(`[SCHEDULER] ✅ El Coordinador marcó la tarea como completada.`);
                    break;
                }

                // El Ejecutor procesa la orden (aquí es donde se usan las TOOLS)
                const executorResponse = await executor.prompt(coordinatorOrder);
                console.log(`[SCHEDULER] ⚙️ Ejecutor respondió.`);

                lastMessage = `Respuesta del Ejecutor: ${executorResponse}`;
            }

            console.log(`[SCHEDULER] 🏁 Tarea ${task.id} finalizada.`);
        } catch (error) {
            console.error(`[SCHEDULER] ❌ Error en flujo multi-agente para tarea ${task.id}:`, error);
        }
    }
}
