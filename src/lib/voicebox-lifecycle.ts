/**
 * voicebox-lifecycle.ts — lifecycle controller for the Voicebox headless backend.
 *
 * Voicebox is a SEPARATE Python process (jamiepine/voicebox). On a 6 GB laptop we
 * must NOT keep any TTS engine resident during the Remotion render / asset-fetch
 * phases. This controller owns the RAM lifecycle:
 *
 *   wake  -> spawn `python -m backend.main` (if not already up)
 *   load  -> POST /models/load  {model_size}   (downloads once, caches after)
 *   ... pipeline calls POST /generate per scene ...
 *   unload-> POST /models/unload (frees that engine's RAM, keeps backend up)
 *   kill  -> terminate the backend process (zero RAM until next run)
 *
 * Everything is opt-in and fails safe: if the backend can't start or the engine
 * can't load, the caller falls back to Edge-TTS (existing null-safe behavior).
 *
 * Config (env):
 *   VOICEBOX_API_URL      default http://127.0.0.1:17493
 *   VOICEBOX_BACKEND_DIR  dir containing backend/ (default <cwd>/voicebox)
 *   VOICEBOX_PYTHON       python interpreter (default <backend_dir>/.venv/Scripts/python.exe)
 *   VOICEBOX_PORT         default 17493
 */
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { logInfo, logWarn, logError } from '../runtime';

const console = {
    log: (...a: unknown[]) => logInfo('[VOICEBOX-LIFECYCLE]', ...a),
    warn: (...a: unknown[]) => logWarn('[VOICEBOX-LIFECYCLE]', ...a),
    error: (...a: unknown[]) => logError('[VOICEBOX-LIFECYCLE]', ...a),
};

export const VOICEBOX_DEFAULT_PORT = 17493;
export const VOICEBOX_DEFAULT_URL = process.env.VOICEBOX_API_URL || `http://127.0.0.1:${VOICEBOX_DEFAULT_PORT}`;

function backendDir(): string {
    return process.env.VOICEBOX_BACKEND_DIR || path.resolve(process.cwd(), 'voicebox');
}

function pythonExe(): string {
    if (process.env.VOICEBOX_PYTHON) return process.env.VOICEBOX_PYTHON;
    return path.join(backendDir(), '.venv', 'Scripts', 'python.exe');
}

function baseUrl(): string {
    return (process.env.VOICEBOX_API_URL || VOICEBOX_DEFAULT_URL).replace(/\/$/, '');
}

let backendProc: ChildProcess | null = null;
let spawnedUrl = '';

/** True if the backend HTTP server answers /health or /models/status. */
export async function isBackendUp(): Promise<boolean> {
    try {
        await axios.get(`${baseUrl()}/models/status`, { timeout: 2500 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Spawn the headless backend if it isn't already answering. Returns true if a
 * usable backend is up (either pre-existing or freshly spawned).
 */
export async function ensureBackend(): Promise<boolean> {
    // Opt-in guard: only spawn the backend when a REAL Voicebox profile id is
    // configured. The repo's .env ships a placeholder ("<your-voicebox-profile-id-here>");
    // dotenv re-injects it even when the shell unset it, so we must treat the
    // placeholder as "not configured" — otherwise we spawn a doomed backend on
    // every voiceover call (40s wait + retry storm) before falling back to tones.
    const profile = process.env.VOICEBOX_PROFILE_ID;
    if (!profile || profile.includes('your-voicebox-profile-id')) {
        console.warn('no real Voicebox profile configured — backend not started; pipeline falls back to tones');
        return false;
    }
    if (await isBackendUp()) {
        console.log('backend already up');
        return true;
    }
    const py = pythonExe();
    const dir = backendDir();
    if (!fs.existsSync(py)) {
        console.warn(`Voicebox python not found at ${py} — backend not started; pipeline will fall back to Edge-TTS`);
        return false;
    }
    const port = process.env.VOICEBOX_PORT || String(VOICEBOX_DEFAULT_PORT);
    console.log(`spawning voicebox backend: ${py} -m backend.main --port ${port}`);
    backendProc = spawn(py, ['-m', 'backend.main', '--host', '127.0.0.1', '--port', port], {
        cwd: path.join(dir, 'backend'),
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
    });
    backendProc.stdout?.on('data', (d) => console.log(String(d).trim()));
    backendProc.stderr?.on('data', (d) => console.warn(String(d).trim()));
    backendProc.on('exit', (code) => console.log(`backend exited (code ${code})`));

    // poll until /models/status answers (or timeout after 40s)
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000));
        if (await isBackendUp()) {
            spawnedUrl = baseUrl();
            console.log('backend is up');
            return true;
        }
    }
    console.warn('backend did not become ready in 40s; falling back');
    return false;
}

/** Load one engine into RAM (downloads first time, cached after). */
export async function loadEngine(modelSize: string): Promise<boolean> {
    try {
        await axios.post(`${baseUrl()}/models/load`, { model_size: modelSize }, { timeout: 180_000 });
        console.log(`engine loaded: ${modelSize}`);
        return true;
    } catch (e: any) {
        console.warn(`engine load failed (${modelSize}): ${e?.message}`);
        return false;
    }
}

/** Unload one engine (frees RAM, keeps backend up). */
export async function unloadEngine(modelSize: string): Promise<void> {
    try {
        await axios.post(`${baseUrl()}/models/${modelSize}/unload`, {}, { timeout: 30_000 });
        console.log(`engine unloaded: ${modelSize}`);
    } catch (e: any) {
        console.warn(`engine unload failed (${modelSize}): ${e?.message}`);
    }
}

/** Unload all engines (frees RAM between jobs). */
export async function unloadAll(): Promise<void> {
    try {
        await axios.post(`${baseUrl()}/models/unload`, {}, { timeout: 30_000 });
        console.log('all engines unloaded');
    } catch (e: any) {
        console.warn(`unload-all failed: ${e?.message}`);
    }
}

/** Terminate the backend process — zero RAM footprint until next run. */
export function killBackend(): void {
    if (backendProc && !backendProc.killed) {
        try {
            backendProc.kill('SIGTERM');
        } catch {
            /* ignore */
        }
        backendProc = null;
        console.log('backend killed');
    }
}
