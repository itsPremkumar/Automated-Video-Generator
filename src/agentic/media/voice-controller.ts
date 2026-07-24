
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import axios from 'axios';
import { logError, logInfo, logWarn } from '../../runtime';
import {
    ensureBackend,
    loadEngine,
    unloadAll,
    killBackend,
    isBackendUp,
} from '../../lib/speech-backend.js';
import { AgenticWorkspace } from '../management/workspace.js';
import { Plan } from '../types.js';
import { generateVoiceovers } from '../../lib/voice-generator.js';

const ffmpegPath: any = require('ffmpeg-static');
const ffprobePath: any = require('ffprobe-static');

const console = {
    log: (...a: unknown[]) => logInfo('[VOICE-CTRL]', ...a),
    warn: (...a: unknown[]) => logWarn('[VOICE-CTRL]', ...a),
    error: (...a: unknown[]) => logError('[VOICE-CTRL]', ...a),
};

export interface GeneratedVoice {
    sceneIndex: number; // 0-based
    audioPath: string;
    durationSec: number;
}

export interface VoiceRunResult {
    voices: GeneratedVoice[];
    voiceoverDriven: boolean; // true = real TTS used for all scenes
    profileId: string;
    fallbackUsed: boolean;
}

const DEFAULT_ENGINE = 'kokoro';
const DEFAULT_PRESET_VOICE = 'af_heart';
const PROFILE_CACHE_NAME = 'voicebox-profile.json';

function baseUrl(): string {
    const url = process.env.VOICEBOX_API_URL || 'http://127.0.0.1:17493';
    return url.replace(/\/$/, '');
}

function engineName(): string {
    return process.env.VOICEBOX_ENGINE || DEFAULT_ENGINE;
}

function presetVoice(): string {
    return process.env.VOICEBOX_PRESET_VOICE || DEFAULT_PRESET_VOICE;
}

function profileCachePath(ws: AgenticWorkspace): string {
    const cacheDir = path.join(ws.root, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    return path.join(cacheDir, PROFILE_CACHE_NAME);
}

/**
 * Resolve a usable profile id + the engine to drive it.
 * Priority:
 *   1. VOICEBOX_PROFILE_ID env (explicit, backward-compat)
 *   2. a reference clip in input/voices/*.wav → auto-clone a real voice profile
 *   3. cached id from a previous run in this workspace
 *   4. auto-create a Kokoro preset profile via POST /profiles
 */
interface ResolvedProfile {
    id: string;
    engine: string;
}

const CLONE_ENGINE = 'chatterbox_turbo';

/** Scan input/voices/ for a reference .wav (your cloned voice). Returns its path or null. */
function findReferenceVoice(): string | null {
    const dir = path.resolve(process.cwd(), 'input', 'voices');
    if (!fs.existsSync(dir)) return null;
    const clips = fs.readdirSync(dir).filter((f) => /\.(wav|mp3|flac|m4a)$/i.test(f));
    if (clips.length === 0) return null;
    // Use the first clip (alphabetical); ignore non-audio files.
    return path.join(dir, clips.sort()[0]);
}

/** Look for a sidecar transcript (.txt) next to a reference clip so the
 *  clone gets real reference_text instead of a placeholder (better fidelity).
 *  Returns the transcript text, or '' if none exists. */
function findReferenceTranscript(clipPath: string): string {
    const base = clipPath.replace(/\.[^.]+$/, '');
    for (const ext of ['.txt', '.transcript.txt', '.srt']) {
        const p = base + ext;
        if (fs.existsSync(p)) {
            try {
                return fs.readFileSync(p, 'utf-8').trim();
            } catch {
                /* ignore */
            }
        }
    }
    return '';
}

/** Auto-clone a real voice profile from a reference clip in input/voices/.
 *  If a sidecar transcript (.txt/.srt) sits next to the clip, it is used as the
 *  reference_text for maximum clone fidelity (otherwise a short placeholder). */
export async function cloneFromVoicesDir(
    clip: string,
    cacheFile: string,
): Promise<ResolvedProfile> {
    const clipName = path.basename(clip);
    // Idempotent: skip if a cloned profile for THIS clip already exists.
    if (fs.existsSync(cacheFile)) {
        try {
            const c = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            if (c?.sourceClip === clipName && c?.id) {
                console.log(`reusing cloned profile for ${clipName}: ${c.id}`);
                return { id: c.id, engine: c.engine || CLONE_ENGINE };
            }
        } catch { /* ignore */ }
    }
    const transcript = findReferenceTranscript(clip);
    console.log(`cloning real voice from ${clipName} (engine=${CLONE_ENGINE})${transcript ? ' using sidecar transcript' : ''}`);
    const create = await axios.post(
        `${baseUrl()}/profiles`,
        { name: `agentic-clone-${clipName}-${Date.now()}`, voice_type: 'cloned', default_engine: CLONE_ENGINE },
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
    );
    const id = create.data?.id || create.data?.profile_id;
    if (!id) throw new Error(`clone profile create returned no id: ${JSON.stringify(create.data)}`);
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(clip)], { type: 'audio/*' }), clipName);
    // Use a real (or placeholder) transcript. A sidecar .txt next to the clip
    // gives the best clone; the backend only rejects an EMPTY/missing value.
    form.append('reference_text', transcript || 'voice reference sample');
    await axios.post(`${baseUrl()}/profiles/${id}/samples`, form, { timeout: 60000 });
    fs.writeFileSync(cacheFile, JSON.stringify({ id, engine: CLONE_ENGINE, sourceClip: clipName }, null, 2));
    console.log(`cloned voice profile ${id}`);
    return { id, engine: CLONE_ENGINE };
}

export async function resolveProfileId(ws: AgenticWorkspace, explicitId?: string): Promise<ResolvedProfile> {
    // 0. Explicit cloned-profile id from the job (highest priority — lets a
    //    user go "clone my voice" → "render in my voice" in one spec.
    if (explicitId && explicitId.trim().length > 0) {
        return { id: explicitId.trim(), engine: engineName() };
    }
    const explicit = process.env.VOICEBOX_PROFILE_ID;
    if (explicit && !explicit.includes('your-voicebox-profile-id')) {
        return { id: explicit, engine: engineName() };
    }

    // 2. reference clip in input/voices/ → auto-clone real voice
    const clip = findReferenceVoice();
    if (clip) {
        try {
            return await cloneFromVoicesDir(clip, profileCachePath(ws));
        } catch (e: any) {
            console.warn(`voice clone from ${clip} failed ("${e?.message}"); falling back to preset`);
        }
    }

    // 3. cached
    const cacheFile = profileCachePath(ws);
    if (fs.existsSync(cacheFile)) {
        try {
            const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            if (cached?.id) {
                console.log(`reusing cached profile ${cached.id}`);
                return { id: cached.id, engine: cached.engine || engineName() };
            }
        } catch {
            /* ignore corrupt cache */
        }
    }

    // 4. auto-provision (idempotent: reuse existing matching profile first)
    const engine = engineName();
    const voice = presetVoice();
    try {
        const list = await axios.get(`${baseUrl()}/profiles`, { timeout: 15000 });
        const existing = (list.data || []).find(
            (p: any) => p?.preset_engine === engine && p?.preset_voice_id === voice,
        );
        if (existing?.id) {
            console.log(`reusing existing ${engine}/${voice} profile ${existing.id}`);
            fs.writeFileSync(cacheFile, JSON.stringify({ id: existing.id, engine, voice }, null, 2));
            return { id: existing.id, engine };
        }
    } catch {
        /* listing failed — fall through to create */
    }
    console.log(`auto-provisioning ${engine} preset profile (voice=${voice})`);
    const res = await axios.post(
        `${baseUrl()}/profiles`,
        {
            // unique name per run so repeated runs never hit "already exists"
            name: `agentic-${engine}-${voice}-${Date.now()}`,
            voice_type: 'preset',
            preset_engine: engine,
            preset_voice_id: voice,
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
    );
    const id = res.data?.id || res.data?.profile_id;
    if (!id) throw new Error(`profile create returned no id: ${JSON.stringify(res.data)}`);
    fs.writeFileSync(cacheFile, JSON.stringify({ id, engine, voice }, null, 2));
    console.log(`auto-provisioned profile ${id}`);
    return { id, engine };
}

/** Generate one scene's audio via the live backend. Throws on failure. */
async function generateScene(
    text: string,
    outputPath: string,
    profileId: string,
    engine: string,
): Promise<number> {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) throw new Error('empty text');

    const base = baseUrl();
    const start = await axios.post(
        `${base}/speak`,
        { text: clean, profile: profileId, engine, language: 'en' },
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
    );
    const genId = start.data?.id;
    if (!genId) throw new Error(`/speak returned no id: ${JSON.stringify(start.data)}`);

    // poll status (SSE stream — grab the data frame, fall back to plain JSON)
    const deadline = Date.now() + 300000;
    let status = 'generating';
    let durationSec = 0;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
            const res = await axios.get(`${base}/generate/${genId}/status`, {
                timeout: 10000,
                responseType: 'text',
            });
            const raw = String(res.data);
            // SSE: find the first "data:" line. Plain JSON has no "data:" prefix.
            const dataLine = raw.split('\n').find((l) => l.startsWith('data:')) ?? raw;
            const json = JSON.parse(dataLine.replace(/^data:\s*/, '').trim() || '{}');
            status = json.status ?? status;
            if (typeof json.duration === 'number' && json.duration > 0) durationSec = json.duration;
            if (status === 'completed' || status === 'complete' || status === 'done') {
                // duration comes from the server's generation status (reliable).
                // If the server omitted it, the render falls back to the WAV
                // file length via ffprobe — no local probe needed here.
                break;
            }
            if (status === 'error' || status === 'failed') throw new Error(json.error ?? 'generation error');
        } catch (e: any) {
            if (e?.message && (e.message.includes('error') || e.message.includes('failed'))) throw e;
            /* transient poll error — keep waiting */
        }
    }
    if (status !== 'completed' && status !== 'complete' && status !== 'done') {
        throw new Error(`generation ${genId} did not complete (status=${status})`);
    }

    const audio = await axios.get(`${base}/audio/${genId}`, { responseType: 'stream', timeout: 60000 });
    await new Promise<void>((resolve, reject) => {
        const writer = fs.createWriteStream(outputPath);
        (audio.data as NodeJS.ReadableStream).pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
        throw new Error(`audio not written or too small: ${outputPath}`);
    }
    return durationSec;
}

/**
 * Run the full voice stage for a plan.
 * @param plan        agentic plan (scene.voiceoverText + voiceOverride)
 * @param ws          agentic workspace (audio -> ws.audioDir)
 * @param voice       optional global voice override (unused by kokoro preset;
 *                    kept for API symmetry with tts.ts)
 * @param onProgress  optional 0..100 progress callback for the orchestrator
 * @returns VoiceRunResult — or throws if the backend cannot be brought up
 *          (caller falls back to Edge-TTS).
 */

/**
 * Resolve a single persona spec → a VoiceBox profile id + engine.
 *  - profileId: reuse an existing profile (id or name).
 *  - clone:     auto-clone a real voice from a reference clip (cached per clip).
 *  - preset:    provision a built-in TTS preset profile (e.g. kokoro 'af_heart').
 * Falls back to the supplied default when the persona cannot be resolved.
 */
async function resolvePersonaProfile(
    persona: { id: string; name?: string; profileId?: string; clone?: string; preset?: { engine: string; voiceId: string }; engine?: string },
    ws: AgenticWorkspace,
    fallback: { id: string; engine: string },
): Promise<{ id: string; engine: string }> {
    try {
        if (persona.profileId && persona.profileId.trim().length > 0) {
            return { id: persona.profileId.trim(), engine: persona.engine || fallback.engine };
        }
        if (persona.clone) {
            const clip = path.resolve(process.cwd(), 'input', 'voices', persona.clone);
            if (fs.existsSync(clip)) {
                const r = await cloneFromVoicesDir(clip, profileCachePath(ws).replace('.json', `-${persona.id}.json`));
                return r;
            }
            console.warn(`persona '${persona.id}' clone clip ${clip} missing — falling back`);
        }
        if (persona.preset) {
            const res = await axios.post(
                `${baseUrl()}/profiles`,
                { name: persona.name || `agentic-${persona.id}`, voice_type: 'preset', preset_engine: persona.preset.engine, preset_voice_id: persona.preset.voiceId },
                { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
            );
            const id = res.data?.id || res.data?.profile_id;
            if (!id) throw new Error(`preset profile create returned no id`);
            return { id, engine: persona.preset.engine };
        }
    } catch (e: any) {
        console.warn(`persona '${persona.id}' resolution failed (${e?.message}) — falling back`);
    }
    return fallback;
}

/** Resolve every declared persona to a profile id (cached, idempotent). */
export async function resolvePersonas(
    personas: { id: string; name?: string; profileId?: string; clone?: string; preset?: { engine: string; voiceId: string }; engine?: string }[] | undefined,
    ws: AgenticWorkspace,
    fallback: { id: string; engine: string },
): Promise<Map<string, { id: string; engine: string }>> {
    const map = new Map<string, { id: string; engine: string }>();
    if (!personas || personas.length === 0) return map;
    for (const p of personas) {
        map.set(p.id, await resolvePersonaProfile(p, ws, fallback));
    }
    return map;
}

/** Concatenate per-turn audio files (each a persona voice) with a short
 *  silence gap between turns, into one scene audio track. Returns duration. */
export async function concatDialogueTurns(turnPaths: string[], outPath: string, gapSec = 0.35): Promise<number> {
    if (turnPaths.length === 1) {
        fs.copyFileSync(turnPaths[0], outPath);
    } else {
        const listFile = outPath + '.concat.txt';
        const parts: string[] = [];
        turnPaths.forEach((p, i) => {
            parts.push(`file '${p.replace(/'/g, "'\\''")}'`);
            if (i < turnPaths.length - 1) parts.push(`file '${outPath}.gap.wav'`);
        });
        fs.writeFileSync(listFile, parts.join('\n'));
        // generate a tiny silence gap (valid low-frequency sine looped silently
        // is avoided; use anullsrc for true silence)
        execFileSync(ffmpegPath as unknown as string, ['-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono:d=${gapSec}`, '-c:a', 'pcm_s16le', outPath + '.gap.wav'], { stdio: 'ignore' });
        execFileSync(ffmpegPath as unknown as string, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outPath], { stdio: 'ignore' });
        fs.rmSync(listFile, { force: true });
        fs.rmSync(outPath + '.gap.wav', { force: true });
    }
    // duration via ffprobe
    try {
        const probeBin: string = ffprobePath?.path ?? ffprobePath;
        const out = execFileSync(probeBin, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', outPath], { encoding: 'utf8' }).toString().trim();
        return parseFloat(out) || 0;
    } catch {
        return 0;
    }
}

export async function runVoiceStage(
    plan: Plan,
    ws: AgenticWorkspace,
    _voice?: string,
    onProgress?: (percent: number, message: string) => void,
    useClonedVoiceId?: string,
    /** Wave N/O — declared persona cast (from Plan.personas). When present,
     *  scenes may reference a persona by id for per-scene multi-voice. */
    personas?: import('../types.js').PersonaSpec[],
): Promise<VoiceRunResult> {
    const report = (p: number, m: string) => {
        onProgress?.(p, m);
        console.log(`[${p}%] ${m}`);
    };

    report(5, 'waking speech backend');

    // P1 — explicit fallback path. When the autopilot diagnoses a dead speech
    // backend it sets AGENTIC_VOICE_FALLBACK=1 so we skip the Python backend
    // entirely and drive all scenes through the engine-agnostic generator
    // (Edge-TTS / Kokoro / tones) — no external service required. This is what
    // lets an autonomous run still produce a real voiceover instead of retrying
    // blindly against an unavailable backend.
    if (process.env.AGENTIC_VOICE_FALLBACK === '1') {
        report(10, 'voice fallback mode (AGENTIC_VOICE_FALLBACK=1) — using built-in TTS engine');
        const audioDir = ws.audioDir;
        fs.mkdirSync(audioDir, { recursive: true });
        const scenes = plan.scenes.map((s, i) => ({
            sceneNumber: i + 1,
            voiceoverText: s.voiceoverText,
            voiceConfig: (s as any).voiceConfig,
        }));
        try {
            const map = await generateVoiceovers(scenes as any, audioDir, {} as any);
            const voices: GeneratedVoice[] = [];
            let ok = 0;
            for (const [n, r] of map.entries()) {
                if (r.path && fs.existsSync(r.path)) {
                    voices.push({ sceneIndex: n - 1, audioPath: r.path, durationSec: (r as any).duration ?? 0 });
                    ok++;
                }
            }
            report(100, `voiceover generated via fallback engine (${ok}/${scenes.length})`);
            return { voices, voiceoverDriven: ok === scenes.length, profileId: 'fallback', fallbackUsed: true };
        } catch (e: any) {
            throw new Error(`voice fallback failed: ${e?.message ?? e}`);
        }
    }

    const up = await ensureBackend();
    if (!up) throw new Error('speech backend unavailable — caller should fall back to Edge-TTS');

    report(15, 'resolving voice profile(s)');
    // Default single-voice profile (used when a scene has no persona assigned).
    const defaultProfile = await resolveProfileId(ws, useClonedVoiceId);
    // Wave N/O — resolve every declared persona to a VoiceBox profile so
    // scenes can speak with distinct (cloned/preset) voices.
    const personaMap = await resolvePersonas(personas ?? plan.personas, ws, defaultProfile);
    const defaultProfileId = defaultProfile.id;
    const defaultEngine = defaultProfile.engine;

    // Preload only for engines backed by the default model loader (chatterbox/qwen).
    // Kokoro loads lazily inside /speak and does NOT support /models/load
    // (that endpoint drives the default Qwen/Chatterbox loader and 500s on "kokoro").
    // A cloned real voice uses chatterbox_turbo → preload it for a warm first scene.
    const preloadable = defaultEngine !== 'kokoro';
    if (preloadable) {
        report(30, `preloading engine: ${defaultEngine}`);
        await loadEngine(defaultEngine);
    } else {
        report(30, `engine ${defaultEngine} loads on first speak (no explicit preload)`);
    }

    const audioDir = ws.audioDir;
    fs.mkdirSync(audioDir, { recursive: true });

    const voices: GeneratedVoice[] = [];
    let ok = 0;
    const total = plan.scenes.length;

    for (let i = 0; i < total; i++) {
        const scene = plan.scenes[i];
        const outPath = path.join(audioDir, `scene_${scene.sceneNumber}_voice.wav`);
        // idempotency: reuse existing
        if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
            voices.push({ sceneIndex: scene.sceneNumber - 1, audioPath: outPath, durationSec: 0 });
            ok++;
            report(Math.round(30 + (i + 1) / total * 60), `scene ${scene.sceneNumber} reused`);
            continue;
        }
        try {
            // Wave N/O — resolve THIS scene's speaking profile.
            // Precedence: scene.voicePersona (a declared persona id) >
            //   scene.voiceOverride (a raw VoiceBox profile id) > default.
            let profId = defaultProfileId;
            let eng = defaultEngine;
            const personaId = scene.voicePersona;
            if (personaId && personaMap.has(personaId)) {
                profId = personaMap.get(personaId)!.id;
                eng = personaMap.get(personaId)!.engine;
            } else if (scene.voiceOverride && !/Neural$/.test(scene.voiceOverride)) {
                // A non-Edge voiceOverride is treated as a VoiceBox profile id.
                profId = scene.voiceOverride;
            }
            // In-scene dialogue: each turn spoken by its own persona, one-by-one.
            if (scene.dialogue && scene.dialogue.length > 0) {
                const turnPaths: string[] = [];
                let turnOk = true;
                for (let t = 0; t < scene.dialogue.length; t++) {
                    const turn = scene.dialogue[t];
                    let turnProf = profId;
                    let turnEng = eng;
                    if (turn.speaker && personaMap.has(turn.speaker)) {
                        turnProf = personaMap.get(turn.speaker)!.id;
                        turnEng = personaMap.get(turn.speaker)!.engine;
                    }
                    const turnPath = path.join(audioDir, `scene_${scene.sceneNumber}_turn_${t}_voice.wav`);
                    try {
                        await generateScene(turn.text, turnPath, turnProf, turnEng);
                        turnPaths.push(turnPath);
                    } catch (e: any) {
                        console.warn(`scene ${scene.sceneNumber} turn ${t} failed: ${e?.message}`);
                        turnOk = false;
                    }
                }
                if (turnOk && turnPaths.length > 0) {
                    const dur = await concatDialogueTurns(turnPaths, outPath);
                    voices.push({ sceneIndex: scene.sceneNumber - 1, audioPath: outPath, durationSec: dur });
                    ok++;
                }
            } else {
                const dur = await generateScene(scene.voiceoverText, outPath, profId, eng);
                voices.push({ sceneIndex: scene.sceneNumber - 1, audioPath: outPath, durationSec: dur });
                ok++;
            }
        } catch (e: any) {
            console.warn(`scene ${scene.sceneNumber} voice failed: ${e?.message}`);
        }
        report(Math.round(30 + (i + 1) / total * 60), `scene ${scene.sceneNumber} done`);
    }

    report(95, 'releasing voice engine RAM');
    await unloadAll().catch(() => {});

    const voiceoverDriven = ok === total;
    report(100, voiceoverDriven ? 'voiceover generated via speech backend' : `partial (${ok}/${total})`);

    return { voices, voiceoverDriven, profileId: defaultProfileId, fallbackUsed: !voiceoverDriven };
}

/** Run the full voice stage, guaranteeing the backend is torn down
 *  (zero RAM footprint) even if generation throws partway. */
export async function runVoiceStageSafe(
    plan: Plan,
    ws: AgenticWorkspace,
    _voice?: string,
    onProgress?: (percent: number, message: string) => void,
    useClonedVoiceId?: string,
    personas?: import('../types.js').PersonaSpec[],
): Promise<VoiceRunResult> {
    try {
        return await runVoiceStage(plan, ws, _voice, onProgress, useClonedVoiceId, personas);
    } finally {
        killBackend();
    }
}
