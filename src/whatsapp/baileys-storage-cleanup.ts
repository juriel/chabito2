import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const AUTH_INFO_DIR = 'auth_info_baileys';

/**
 * Files that must never be deleted from a session directory.
 * Baileys uses these for authentication, E2E session state and device sync.
 */
const PROTECTED_PREFIXES = [
    'creds',
    'session-',
    'sender-key-',
    'app-state-sync-',
    'device-list-',
    'lid-mapping-',
    'tctoken-',
    'app-state-sync-key-',
];

function isProtected(filename: string): boolean {
    return PROTECTED_PREFIXES.some((prefix) => filename.startsWith(prefix));
}

/**
 * Parses the numeric ID from a `pre-key-<N>.json` filename.
 * Returns NaN if the filename doesn't match the pattern.
 */
function preKeyId(filename: string): number {
    const match = filename.match(/^pre-key-(\d+)\.json$/);
    return match ? parseInt(match[1]!, 10) : NaN;
}

export interface CleanupResult {
    uuid: string;
    deleted: number;
    kept: number;
    errors: string[];
}

/**
 * Cleans up stale pre-keys from a single session directory.
 *
 * Strategy:
 *  - Keep the `keepLatest` highest-numbered pre-keys (safe, still on WA servers).
 *  - Delete all lower-numbered ones (already consumed by contacts).
 *  - Never touch protected files (creds, sessions, device lists, etc.).
 *
 * @param uuid       The chatbot session UUID.
 * @param keepLatest How many of the highest pre-keys to preserve. Default: 200.
 */
export async function cleanupSessionStorage(
    uuid: string,
    keepLatest = 200
): Promise<CleanupResult> {
    const sessionDir = join(AUTH_INFO_DIR, uuid);
    const result: CleanupResult = { uuid, deleted: 0, kept: 0, errors: [] };

    let entries: string[];
    try {
        entries = await readdir(sessionDir);
    } catch {
        result.errors.push(`No se pudo leer el directorio: ${sessionDir}`);
        return result;
    }

    // Separate pre-keys from everything else
    const preKeyFiles = entries
        .filter((f) => preKeyId(f) !== null && !isNaN(preKeyId(f)))
        .sort((a, b) => preKeyId(a) - preKeyId(b)); // ascending → lowest first

    const otherFiles = entries.filter((f) => !preKeyFiles.includes(f));

    // Count protected + unknown files as "kept" (we never touch them)
    result.kept += otherFiles.length;

    const toDelete = preKeyFiles.slice(0, Math.max(0, preKeyFiles.length - keepLatest));
    const toKeep = preKeyFiles.slice(Math.max(0, preKeyFiles.length - keepLatest));

    result.kept += toKeep.length;

    for (const filename of toDelete) {
        const filepath = join(sessionDir, filename);
        try {
            await rm(filepath);
            result.deleted++;
        } catch (error) {
            result.errors.push(`Error al borrar ${filename}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    return result;
}

/**
 * Runs storage cleanup across all session sub-directories found in auth_info_baileys/.
 */
export async function cleanupAllSessions(keepLatest = 200): Promise<CleanupResult[]> {
    let uuids: string[];
    try {
        const entries = await readdir(AUTH_INFO_DIR, { withFileTypes: true });
        uuids = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
        return [];
    }

    return Promise.all(uuids.map((uuid) => cleanupSessionStorage(uuid, keepLatest)));
}
