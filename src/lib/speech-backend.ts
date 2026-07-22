
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { logInfo, logWarn, logError } from '../runtime';

const console = {
    log: (...a: unknown[]) => logInfo('[SPEECH-BACKEND]', ...a),
    warn: (...a: unknown[]) => logWarn('[SPEECH-BACKEND]', ...a),
    error: (...a: unknown[]) => logError('[SPEECH-BACKEND]', ...a),
};

export const SPEECH_DEFAULT_PORT = 17493;
export const SPEECH_DEFAULT_URL = process.env.VOICEBOX_API_URL || `http://127.0.0.1:${SPEECH_DEFAULT_PORT}`;

function backendDir(): string {
    // The vendored TTS server is a Python package named `speech` at src/speech.
    // We run it as `python -m speech.main` with cwd = src/ (so `speech` imports).
    return process.env.VOICEBOX_BACKEND_DIR || path.resolve(process.cwd(), 'src');
}

function pythonExe(): string {
    if (process.env.VOICEBOX_PYTHON) return process.env.VOICEBOX_PYTHON;
    // Default to the in-repo venv (self-contained: code + interpreter both live
    // under this project, so the system runs with NO outside dependency).
    return path.resolve(process.cwd(), 'venv', 'Scripts', 'python.exe');
}

function baseUrl(): string {
    return (process.env.VOICEBOX_API_URL || SPEECH_DEFAULT_URL).replace(/\/$/, '');
}

let backendProc: ChildProcess | null = null;
let spawnedUrl = '';

/** True if the backend HTTP server answers /health or /models/status. */
export async function isBackendUp(): Promise<boolean> {
    try {
        await axios.get(`${baseUrl()}/health`, { timeout: 2500 });
        return true;
    } catch {
        try {
            await axios.get(`${baseUrl()}/models/status`, { timeout: 2500 });
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Spawn the headless backend if it isn't already answering. Returns true if a
 * usable backend is up (either pre-existing or freshly spawned).
 */
export async function ensureBackend(): Promise<boolean> {
    // Startup is gated on the TTS provider, NOT on a profile id. Profile
    // provisioning happens later (VoiceController.resolveProfileId), so the
    // backend must come up even when no profile is configured yet. We only
    // refuse to spawn when the provider isn't voicebox (no point burning RAM).
    const provider = (process.env.TTS_PROVIDER || '').toLowerCase().trim();
    if (provider && provider !== 'voicebox') {
        console.warn(`TTS_PROVIDER=${provider} — not voicebox; backend not started`);
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
    const port = process.env.VOICEBOX_PORT || String(SPEECH_DEFAULT_PORT);
    // Redirect the backend's runtime data (sqlite db, profiles, audio cache)
    // OUT of the repo. Without this it writes src/data/voicebox.db (cwd-relative).
    const dataDir = process.env.VOICEBOX_DATA_DIR
        || path.resolve(process.cwd(), 'workspace', 'cache', 'voicebox');
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`spawning speech backend: ${py} -m speech.main --port ${port} --data-dir ${dataDir}`);
    backendProc = spawn(py, ['-m', 'speech.main', '--host', '127.0.0.1', '--port', port, '--data-dir', dataDir], {
        cwd: dir,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, PYTHONPATH: '' },
    });
    backendProc.stdout?.on('data', (d) => console.log(String(d).trim()));
    backendProc.stderr?.on('data', (d) => console.warn(String(d).trim()));
    backendProc.on('exit', (code) => console.log(`backend exited (code ${code})`));

    // Poll until /health (or /models/status) answers. Cold-starting the
    // PyTorch/CUDA backend can take >40s when the machine is RAM-pressured
    // (e.g. inside the full `npm test` suite after other heavy tests). Use a
    // generous, configurable deadline so the voice stage doesn't flake under load.
    const startupTimeoutMs = Number(process.env.VOICEBOX_STARTUP_TIMEOUT_MS) || 120_000;
    const deadline = Date.now() + startupTimeoutMs;
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
        // Backend expects model_size as a QUERY param, not a JSON body.
        await axios.post(`${baseUrl()}/models/load`, null, {
            params: { model_size: modelSize },
            timeout: 180_000,
        });
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
