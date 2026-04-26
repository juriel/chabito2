import type {
    Deserializer,
    Persistable,
    PersistResult,
    StorageProvider,
} from './types.ts';
import { fail, ok } from './types.ts';

/**
 * Repositorio genérico de objetos JSON.
 *
 * - Guarda cualquier objeto que implemente `Persistable<TData>`.
 * - Restaura usando el `Deserializer<TData, TEntity>` que se provee al construir.
 * - Internamente, cada entrada es un archivo JSON `<id>.json` gestionado por un `StorageProvider`.
 *
 * @template TData    Tipo del DTO plano (lo que va a disco).
 * @template TEntity  Tipo de la entidad de dominio (lo que maneja el negocio).
 *
 * @example
 * // Definir el store
 * const store = new JsonStore<ConversationData, Conversation>(
 *   new FileStorageProvider('./data', 'conversations'),
 *   (data) => Conversation.fromData(data)
 * );
 *
 * // Guardar
 * await store.save('conv-123', conversation);
 *
 * // Cargar
 * const result = await store.load('conv-123');
 * if (result.ok) console.log(result.value);
 */
export class JsonStore<TData, TEntity extends Persistable<TData>> {
    constructor(
        private readonly provider: StorageProvider,
        private readonly deserialize: Deserializer<TData, TEntity>
    ) {}

    /**
     * Persiste `entity` bajo el identificador `id`.
     * Sobreescribe si ya existía.
     */
    async save(id: string, entity: TEntity): Promise<PersistResult<void>> {
        try {
            const data = entity.serialize();
            const json = JSON.stringify(data, null, 2);
            await this.provider.write(id, json);
            return ok(undefined);
        } catch (error: unknown) {
            return fail(this.errorMessage(error));
        }
    }

    /**
     * Persiste un objeto plano directamente (sin necesitar que implemente `Persistable`).
     * Útil para tipos simples como configuraciones o dtos.
     */
    async saveRaw(id: string, data: TData): Promise<PersistResult<void>> {
        try {
            const json = JSON.stringify(data, null, 2);
            await this.provider.write(id, json);
            return ok(undefined);
        } catch (error: unknown) {
            return fail(this.errorMessage(error));
        }
    }

    /**
     * Carga y deserializa la entidad con id `id`.
     * Devuelve `{ ok: true, value: TEntity }` o `{ ok: false, error }` si no existe o falla.
     */
    async load(id: string): Promise<PersistResult<TEntity>> {
        try {
            const raw = await this.provider.read(id);
            if (raw === null) {
                return fail(`No encontrado: ${id}`);
            }
            const data = JSON.parse(raw) as TData;
            return ok(this.deserialize(data));
        } catch (error: unknown) {
            return fail(this.errorMessage(error));
        }
    }

    /**
     * Carga el DTO plano sin deserializar.
     */
    async loadRaw(id: string): Promise<PersistResult<TData>> {
        try {
            const raw = await this.provider.read(id);
            if (raw === null) {
                return fail(`No encontrado: ${id}`);
            }
            return ok(JSON.parse(raw) as TData);
        } catch (error: unknown) {
            return fail(this.errorMessage(error));
        }
    }

    /**
     * Carga todas las entidades de la colección.
     * Las entradas que fallen la deserialización se omiten con un warning.
     */
    async loadAll(): Promise<Map<string, TEntity>> {
        const ids = await this.provider.list();
        const result = new Map<string, TEntity>();

        await Promise.all(
            ids.map(async (id) => {
                const loaded = await this.load(id);
                if (loaded.ok) {
                    result.set(id, loaded.value);
                } else {
                    console.warn(`[JsonStore] Error cargando ${id}: ${loaded.error}`);
                }
            })
        );

        return result;
    }

    /**
     * Devuelve true si existe una entrada con ese id.
     */
    async exists(id: string): Promise<boolean> {
        const raw = await this.provider.read(id);
        return raw !== null;
    }

    /**
     * Elimina la entrada con id `id`.
     */
    async delete(id: string): Promise<PersistResult<void>> {
        try {
            await this.provider.delete(id);
            return ok(undefined);
        } catch (error: unknown) {
            return fail(this.errorMessage(error));
        }
    }

    /**
     * Devuelve todos los ids registrados en la colección.
     */
    async listIds(): Promise<string[]> {
        return this.provider.list();
    }

    private errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
