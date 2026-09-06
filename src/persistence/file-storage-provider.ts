import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { StorageProvider } from './types.ts';

/**
 * Implementación de `StorageProvider` que persiste cada entrada como un archivo
 * en el sistema de archivos.
 *
 * Estructura en disco:
 * ```
 * <baseDir>/
 *   <namespace>/
 *     <key>.json
 * ```
 *
 * El `namespace` se pasa en el constructor para separar colecciones distintas
 * (conversaciones, configuraciones, etc.).
 */
export class FileStorageProvider implements StorageProvider {
    private readonly dir: string;

    /**
     * @param baseDir   Directorio raíz donde se guardan los datos. Se crea si no existe.
     * @param namespace Sub-carpeta lógica para esta colección (ej: "conversations", "settings").
     */
    constructor(baseDir: string, namespace: string) {
        this.dir = resolve(join(baseDir, namespace));
    }

    /** Asegura que el directorio existe. Llámalo antes de la primera operación. */
    async init(): Promise<void> {
        await mkdir(this.dir, { recursive: true });
    }

    async read(key: string): Promise<string | null> {
        const filepath = this.keyToPath(key);
        try {
            return await readFile(filepath, 'utf-8');
        } catch (error: unknown) {
            if (this.isNotFoundError(error)) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Escribe de forma atómica: escribe a un archivo temporal y lo renombra sobre
     * el destino final. `rename` es atómico en el mismo filesystem, así que dos
     * escrituras concurrentes a la misma `key` nunca dejan un archivo a medio
     * escribir (torn write) — la última en renombrar gana, entera.
     */
    async write(key: string, value: string): Promise<void> {
        // Ensure directory exists in case init() wasn't called
        await mkdir(this.dir, { recursive: true });
        const finalPath = this.keyToPath(key);
        const tmpPath = `${finalPath}.tmp-${randomBytes(6).toString('hex')}`;
        await writeFile(tmpPath, value, 'utf-8');
        await rename(tmpPath, finalPath);
    }

    async delete(key: string): Promise<void> {
        try {
            await rm(this.keyToPath(key));
        } catch (error: unknown) {
            if (!this.isNotFoundError(error)) {
                throw error;
            }
        }
    }

    async list(): Promise<string[]> {
        try {
            const entries = await readdir(this.dir);
            return entries
                .filter((f) => f.endsWith('.json'))
                .map((f) => f.slice(0, -5)); // strip .json extension
        } catch (error: unknown) {
            if (this.isNotFoundError(error)) {
                return [];
            }
            throw error;
        }
    }

    private keyToPath(key: string): string {
        // Sanitize key: allow alphanumeric, dash, underscore, dot and colon
        const safeKey = key.replace(/[^a-zA-Z0-9._\-:]/g, '_');
        return join(this.dir, `${safeKey}.json`);
    }

    private isNotFoundError(error: unknown): boolean {
        return (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as NodeJS.ErrnoException).code === 'ENOENT'
        );
    }
}
