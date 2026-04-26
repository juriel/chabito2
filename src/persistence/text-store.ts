import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { PersistResult } from './types.ts';
import { fail, ok } from './types.ts';

/**
 * Almacén de archivos de texto plano (`.txt`).
 *
 * Estructura en disco:
 * ```
 * <baseDir>/
 *   <namespace>/
 *     <key>.txt
 * ```
 *
 * Diseñado para guardar contenido de texto libre: prompts, memorias,
 * notas de configuración, etc.
 *
 * @example
 * const store = new TextStore('./data', 'juriel');
 *
 * // Guardar el prompt del chatbot
 * await store.save('prompt', 'Eres Chabito, un asistente amable...');
 *
 * // Leer el prompt
 * const result = await store.load('prompt');
 * if (result.ok) console.log(result.value);
 *
 * // Agregar líneas a un archivo de memorias
 * await store.append('memory', 'El usuario se llama Jaime Uriel.\n');
 */
export class TextStore {
    private readonly dir: string;

    /**
     * @param baseDir   Directorio raíz donde se guardan los datos.
     * @param namespace Sub-carpeta lógica para esta colección (ej: "juriel", "ventas-bot").
     */
    constructor(baseDir: string, namespace: string) {
        this.dir = resolve(join(baseDir, namespace));
    }

    /** Asegura que el directorio existe. */
    async init(): Promise<void> {
        await mkdir(this.dir, { recursive: true });
    }

    /**
     * Lee el contenido del archivo `<key>.txt`.
     * Devuelve `{ ok: false }` si el archivo no existe.
     */
    async load(key: string): Promise<PersistResult<string>> {
        const filepath = this.keyToPath(key);
        try {
            const content = await readFile(filepath, 'utf-8');
            return ok(content);
        } catch (error: unknown) {
            if (this.isNotFound(error)) {
                return fail(`Archivo no encontrado: ${key}.txt`);
            }
            return fail(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Escribe (o sobreescribe) el archivo `<key>.txt` con `content`.
     * Crea el directorio si no existe.
     */
    async save(key: string, content: string): Promise<PersistResult<void>> {
        try {
            await mkdir(this.dir, { recursive: true });
            await writeFile(this.keyToPath(key), content, 'utf-8');
            return ok(undefined);
        } catch (error: unknown) {
            return fail(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Agrega `content` al final del archivo `<key>.txt`.
     * Lo crea si no existe.
     */
    async append(key: string, content: string): Promise<PersistResult<void>> {
        try {
            await mkdir(this.dir, { recursive: true });
            const existing = await this.load(key);
            const current = existing.ok ? existing.value : '';
            await writeFile(this.keyToPath(key), current + content, 'utf-8');
            return ok(undefined);
        } catch (error: unknown) {
            return fail(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Devuelve `true` si el archivo `<key>.txt` existe.
     */
    async exists(key: string): Promise<boolean> {
        const result = await this.load(key);
        return result.ok;
    }

    /**
     * Elimina el archivo `<key>.txt`. No lanza error si no existía.
     */
    async delete(key: string): Promise<PersistResult<void>> {
        try {
            await rm(this.keyToPath(key));
            return ok(undefined);
        } catch (error: unknown) {
            if (this.isNotFound(error)) {
                return ok(undefined);
            }
            return fail(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Devuelve todos los keys (sin extensión `.txt`) del namespace.
     */
    async list(): Promise<string[]> {
        try {
            const entries = await readdir(this.dir);
            return entries
                .filter((f) => f.endsWith('.txt'))
                .map((f) => f.slice(0, -4)); // strip .txt
        } catch (error: unknown) {
            if (this.isNotFound(error)) {
                return [];
            }
            throw error;
        }
    }

    /**
     * Carga todos los archivos del namespace como un mapa `key → contenido`.
     */
    async loadAll(): Promise<Map<string, string>> {
        const keys = await this.list();
        const result = new Map<string, string>();

        await Promise.all(
            keys.map(async (key) => {
                const loaded = await this.load(key);
                if (loaded.ok) {
                    result.set(key, loaded.value);
                }
            })
        );

        return result;
    }

    private keyToPath(key: string): string {
        const safeKey = key.replace(/[^a-zA-Z0-9._\-]/g, '_');
        return join(this.dir, `${safeKey}.txt`);
    }

    private isNotFound(error: unknown): boolean {
        return (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as NodeJS.ErrnoException).code === 'ENOENT'
        );
    }
}
