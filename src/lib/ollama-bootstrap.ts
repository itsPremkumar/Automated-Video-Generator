/**
 * Ollama auto-bootstrap for zero-config local script generation.
 *
 * Before generating a script with a local Ollama model, this ensures Ollama is
 * installed, running, and has the requested model pulled. It is intentionally
 * defensive:
 *  - Returns a clear ServiceUnavailableError (no crash) if Ollama is missing.
 *  - Refuses to auto-start on memory-starved hosts (MIN_FREE_BYTES guard) so it
 *    never OOM-kills a small machine.
 *  - All network/process steps are best-effort; callers still fall back to a
 *    template script if bootstrapping fails.
 */

import { spawn, spawnSync } from 'child_process';
import * as os from 'os';
import axios from 'axios';
import { ServiceUnavailableError } from './errors';
import { appLogger } from './logger';

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const OLLAMA_SCRIPT_MODEL = (process.env.OLLAMA_SCRIPT_MODEL || process.env.OLLAMA_MODEL || 'llama3').trim() || 'llama3';
const AUTO_START = (process.env.OLLAMA_AUTOSTART || 'true').toLowerCase() !== 'false';
const AUTO_PULL = (process.env.OLLAMA_AUTOPULL || 'true').toLowerCase() !== 'false';
const MIN_FREE_BYTES = 1.5 * 1024 * 1024 * 1024; // 1.5 GB guard

const logger = appLogger.child({ component: 'ollama-bootstrap' });

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingOllama(timeoutMs = 3000): Promise<boolean> {
    try {
        const res = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: timeoutMs });
        return res.status === 200;
    } catch {
        return false;
    }
}

async function listModels(): Promise<string[]> {
    const res = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 5000 });
    return ((res.data as any)?.models || []).map((m: any) => m.name as string);
}

function isOllamaInstalled(): boolean {
    try {
        const r = spawnSync('ollama', ['--version'], { timeout: 5000, stdio: 'pipe' });
        if (r.status === 0) return true;
        const out = (r.stdout?.toString() || '') + (r.stderr?.toString() || '');
        return out.toLowerCase().includes('ollama');
    } catch {
        return false;
    }
}

function startOllama(): void {
    const child = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore', env: process.env });
    child.unref();
}

async function pullModel(model: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const p = spawn('ollama', ['pull', model], { stdio: 'ignore', env: process.env });
        p.on('error', reject);
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ollama pull exited ${code}`))));
    });
}

export interface OllamaReadyResult {
    ready: boolean;
    model: string;
    started: boolean;
    pulled: boolean;
    detail: string;
}

export async function ensureOllamaReady(opts: { model?: string; autostart?: boolean; autopull?: boolean } = {}): Promise<OllamaReadyResult> {
    const model = opts.model?.trim() || OLLAMA_SCRIPT_MODEL;
    const autostart = opts.autostart ?? AUTO_START;
    const autopull = opts.autopull ?? AUTO_PULL;

    if (await pingOllama()) {
        const models = await listModels();
        if (models.includes(model)) {
            return { ready: true, model, started: false, pulled: false, detail: `Ollama ready with ${model}` };
        }
        if (!autopull) {
            return { ready: false, model, started: false, pulled: false, detail: `Model ${model} not pulled and autopull disabled` };
        }
        await pullModel(model);
        return { ready: true, model, started: false, pulled: true, detail: `Pulled ${model}` };
    }

    if (!isOllamaInstalled()) {
        throw new ServiceUnavailableError(
            'Ollama is not installed. Install from https://ollama.com (or `winget install Ollama.Ollama`) to enable free local script generation.',
            { provider: 'ollama' },
        );
    }
    if (!autostart) {
        throw new ServiceUnavailableError(
            'Ollama is not running and autostart is disabled (set OLLAMA_AUTOSTART=true).',
            { provider: 'ollama' },
        );
    }

    const free = os.freemem();
    if (free < MIN_FREE_BYTES) {
        throw new ServiceUnavailableError(
            `Not enough free memory to auto-start Ollama (free ${Math.round(free / 1048576)}MB < ${Math.round(MIN_FREE_BYTES / 1048576)}MB). Start Ollama manually or free memory.`,
            { provider: 'ollama' },
        );
    }

    logger.info('ollama.bootstrap.starting', { model });
    startOllama();
    for (let i = 0; i < 15; i++) {
        await sleep(1000);
        if (await pingOllama()) break;
    }
    if (!(await pingOllama())) {
        throw new ServiceUnavailableError('Started Ollama but it did not become reachable.', { provider: 'ollama' });
    }

    const models = await listModels();
    if (models.includes(model)) {
        return { ready: true, model, started: true, pulled: false, detail: `Started Ollama, ${model} present` };
    }
    if (!autopull) {
        return { ready: false, model, started: true, pulled: false, detail: `Started but ${model} not pulled (autopull off)` };
    }
    await pullModel(model);
    return { ready: true, model, started: true, pulled: true, detail: `Started Ollama and pulled ${model}` };
}
