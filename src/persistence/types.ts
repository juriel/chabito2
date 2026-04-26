/**
 * Contrato para cualquier objeto que pueda ser serializado a JSON y restaurado.
 *
 * @template TData  El tipo del DTO plano (plain JS object) que se escribe en disco.
 *
 * Implementa `serialize()` para convertir tu objeto a ese DTO plano.
 * Usa una función estática o factory externa para el camino inverso (deserialize).
 *
 * @example
 * class Conversation implements Persistable<ConversationData> {
 *   serialize(): ConversationData {
 *     return { id: this.id, messages: this.messages };
 *   }
 * }
 */
export interface Persistable<TData> {
    serialize(): TData;
}

/**
 * Factory que convierte un DTO plano de vuelta a la instancia del dominio.
 * Se pasa al JsonStore al definir la colección.
 *
 * @template TData   El tipo plano guardado en disco.
 * @template TEntity La clase de dominio que se restaura.
 */
export type Deserializer<TData, TEntity> = (data: TData) => TEntity;

// ──────────────────────────────────────────────────────────────────────────────
// Storage Provider (abstracción del medio físico)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Abstracción del backend de almacenamiento.
 * Permite intercambiar FileSystem, in-memory, Redis, S3, etc.
 */
export interface StorageProvider {
    /** Lee el contenido almacenado bajo `key`. Devuelve `null` si no existe. */
    read(key: string): Promise<string | null>;
    /** Escribe `value` bajo `key`, creando la entrada si no existe. */
    write(key: string, value: string): Promise<void>;
    /** Elimina la entrada bajo `key`. No lanza error si no existe. */
    delete(key: string): Promise<void>;
    /** Devuelve todas las claves disponibles en este provider. */
    list(): Promise<string[]>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Result wrapper (evita try/catch en el caller)
// ──────────────────────────────────────────────────────────────────────────────

export type PersistResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

export function ok<T>(value: T): PersistResult<T> {
    return { ok: true, value };
}

export function fail<T>(error: string): PersistResult<T> {
    return { ok: false, error };
}
