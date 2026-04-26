/**
 * Persistence layer — public API
 *
 * Uso rápido:
 * ```ts
 * import { StoreFactory } from './persistence/index.ts';
 *
 * // Crear una colección tipada
 * const userStore = StoreFactory.file<UserData, User>(
 *   './data',
 *   'users',
 *   (data) => User.fromData(data)
 * );
 *
 * await userStore.save('user-1', myUser);
 * const result = await userStore.load('user-1');
 * ```
 */
export type { Persistable, StorageProvider, Deserializer, PersistResult } from './types.ts';
export { ok, fail } from './types.ts';
export { FileStorageProvider } from './file-storage-provider.ts';
export { JsonStore } from './json-store.ts';
export { TextStore } from './text-store.ts';

import { FileStorageProvider } from './file-storage-provider.ts';
import { JsonStore } from './json-store.ts';
import { TextStore } from './text-store.ts';
import type { Deserializer, Persistable } from './types.ts';

/**
 * Factory de conveniencia para crear stores sin boilerplate.
 */
export const StoreFactory = {
    /**
     * Crea un `JsonStore` respaldado por archivos en disco.
     *
     * @param baseDir       Directorio raíz (ej: './data').
     * @param namespace     Sub-carpeta para esta colección (ej: 'conversations').
     * @param deserialize   Función que convierte el DTO plano en la entidad de dominio.
     *
     * @example
     * const store = StoreFactory.file('./data', 'conversations', Conversation.fromData);
     */
    file<TData, TEntity extends Persistable<TData>>(
        baseDir: string,
        namespace: string,
        deserialize: Deserializer<TData, TEntity>
    ): JsonStore<TData, TEntity> {
        return new JsonStore(new FileStorageProvider(baseDir, namespace), deserialize);
    },

    /**
     * Crea un `JsonStore` para tipos de dato planos (sin entidad de dominio).
     * Útil para configuraciones, DTOs simples, etc.
     *
     * @example
     * const settingsStore = StoreFactory.rawFile<AppSettings>('./data', 'settings');
     * await settingsStore.saveRaw('global', { theme: 'dark' });
     */
    rawFile<TData>(baseDir: string, namespace: string): JsonStore<TData, never> {
        // Use a no-op deserializer since raw operations don't need it
        const noop = (_: TData): never => {
            throw new Error('Use loadRaw() for stores created with StoreFactory.rawFile()');
        };
        return new JsonStore(new FileStorageProvider(baseDir, namespace), noop);
    },

    /**
     * Crea un `TextStore` respaldado por archivos `.txt` en disco.
     * Ideal para prompts del sistema, memorias y notas de texto libre.
     *
     * @param baseDir   Directorio raíz (ej: './data').
     * @param namespace Sub-carpeta para esta colección (ej: 'juriel').
     *
     * @example
     * const texts = StoreFactory.text('./data', 'juriel');
     * await texts.save('prompt', 'Eres Chabito...');
     * const r = await texts.load('prompt');
     */
    text(baseDir: string, namespace: string): TextStore {
        return new TextStore(baseDir, namespace);
    }
};
