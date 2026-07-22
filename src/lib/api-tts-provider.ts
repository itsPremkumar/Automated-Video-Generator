import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { logError, logInfo, logWarn } from '../runtime';

const console = {
    log: (...args: unknown[]) => logInfo('[API-TTS]', ...args),
    warn: (...args: unknown[]) => logWarn('[API-TTS]', ...args),
    error: (...args: unknown[]) => logError('[API-TTS]', ...args),
};

/**
 * Downloads a binary stream from an axios response and writes it to a file.
 */
async function saveStreamToFile(responseStream: any, outputPath: string): Promise<void> {
    if (responseStream && typeof responseStream.pipe === 'function') {
        const writer = fs.createWriteStream(outputPath);
        responseStream.pipe(writer);
        await new Promise<void>((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } else if (responseStream instanceof Buffer) {
        fs.writeFileSync(outputPath, responseStream);
    } else if (typeof responseStream === 'string') {
        // In case response is a base64 encoded audio, decode it, otherwise write as buffer
        const buf = Buffer.from(responseStream, 'base64');
        fs.writeFileSync(outputPath, buf);
    } else {
        // fallback if data is returned as ArrayBuffer/Buffer
        fs.writeFileSync(outputPath, Buffer.from(responseStream));
    }
}

/**
 * Synthesizes voice using Jamie Pine's Voicebox FastAPI backend.
 *
 * Voicebox is profile-based: EVERY generation (including plain Kokoro narration)
 * runs through a voice PROFILE. Set VOICEBOX_PROFILE_ID to either:
 *   - a Kokoro PRESET profile (voice_type="preset", preset_engine="kokoro",
 *     preset_voice_id e.g. "af_heart") for zero-clone narration, or
 *   - a CLONED profile (voice_type="cloned") for voice cloning.
 *
 * The `engine` (default "kokoro") is passed per-request; the backend lazily
 * loads that engine's model on first use. On a GPU box (CUDA/ROCm auto-detected)
 * the model loads into VRAM — Kokoro-82M uses ~800 MB VRAM, safe on a 4 GB card,
 * leaving system RAM free. On CPU-only boxes heavy engines can OOM; Kokoro-82M
 * is the lightest and the recommended narration engine.
 *
 * Flow (verified against Voicebox v0.5.0):
 *   1. POST /speak  { text, profile, engine, language }  -> { id, status:"generating" }
 *   2. poll GET /generate/{id}/status  until status == "completed" | "error"
 *   3. GET /audio/{id}  -> WAV bytes (24 kHz mono PCM)
 *
 * Fails safe: if the backend is unreachable, no profile is configured, or the
 * engine can't load, this throws and the caller (voice-generator) falls back to
 * Edge-TTS.
 */
export async function generateVoiceoverWithVoicebox(
    text: string,
    outputPath: string,
    language: string = 'en',
    opts: { engine?: string; profileId?: string; modelSize?: string } = {},
): Promise<void> {
    const base = (process.env.VOICEBOX_API_URL || 'http://127.0.0.1:17493').replace(/\/$/, '');
    // `modelSize` kept for backwards-compat with older callers; treated as engine.
    const engine = opts.engine || opts.modelSize || process.env.VOICEBOX_ENGINE || 'kokoro';
    const profileId = opts.profileId || process.env.VOICEBOX_PROFILE_ID;
    // The repo .env ships a placeholder ("<your-voicebox-profile-id-here>");
    // treat it as "no profile" so we fall back to tones immediately instead of
    // doing a doomed 30s x3 HTTP retry per scene (which makes every video hang).
    const realProfile = profileId && !profileId.includes('your-voicebox-profile-id') ? profileId : '';

    if (!realProfile) {
        throw new Error(
            'Voicebox requires a voice profile. Set VOICEBOX_PROFILE_ID (create one via ' +
                'POST /profiles — a Kokoro preset profile needs no reference audio). ' +
                'Pipeline will fall back to Edge-TTS.',
        );
    }

    // Wake the backend (spawns it if not already up). Non-fatal if the helper
    // is unavailable — we still probe the URL below.
    try {
        const { ensureBackend } = await import('./speech-backend.js');
        await ensureBackend();
    } catch {
        /* lifecycle helper optional; a manually-started backend still works */
    }

    console.log(`Voicebox synthesis: ${base}/speak (engine: ${engine}, profile: ${profileId})`);

    // 1. Kick off generation.
    let genId: string;
    try {
        const start = await axios.post(
            `${base}/speak`,
            { text, profile: profileId, engine, language },
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 },
        );
        genId = start.data?.id;
        if (!genId) throw new Error(`Voicebox /speak returned no generation id: ${JSON.stringify(start.data)}`);
    } catch (error: any) {
        const detail = error.response?.data?.detail || error.message;
        console.error(`Voicebox /speak failed: ${detail}`);
        throw new Error(`Voicebox /speak failed: ${detail}`);
    }

    // 2. Poll status until the async job finishes (model load + synthesis).
    //    Kokoro cold-load on GPU is ~60-90s; warm generations are a few seconds.
    const deadline = Date.now() + 300000; // 5 min ceiling
    let status = 'generating';
    let lastErr: string | null = null;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
            const res = await axios.get(`${base}/generate/${genId}/status`, {
                timeout: 10000,
                // status endpoint is an SSE stream; grab the first data frame as text
                responseType: 'text',
                headers: { Accept: 'text/event-stream' },
            });
            const raw =
                String(res.data)
                    .split('\n')
                    .find((l) => l.startsWith('data:')) || String(res.data);
            const json = JSON.parse(raw.replace(/^data:\s*/, ''));
            status = json.status;
            lastErr = json.error ?? null;
            if (status === 'completed' || status === 'complete' || status === 'done') break;
            if (status === 'error' || status === 'failed') break;
        } catch {
            /* transient poll error — keep waiting until deadline */
        }
    }

    if (status !== 'completed' && status !== 'complete' && status !== 'done') {
        throw new Error(
            `Voicebox generation ${genId} did not complete (status=${status}${lastErr ? `, error=${lastErr}` : ''})`,
        );
    }

    // 3. Download the finished audio.
    try {
        const audio = await axios.get(`${base}/audio/${genId}`, {
            responseType: 'stream',
            timeout: 60000,
        });
        await saveStreamToFile(audio.data, outputPath);
        console.log(`Successfully generated voiceover via Voicebox: ${outputPath}`);
    } catch (error: any) {
        const detail = error.response?.data?.detail || error.message;
        console.error(`Voicebox audio download failed: ${detail}`);
        throw new Error(`Voicebox audio download failed: ${detail}`);
    }
}

/**
 * Synthesizes voice using local XTTS API Server (e.g. daswer123/xtts-api-server).
 */
export async function generateVoiceoverWithXtts(
    text: string,
    outputPath: string,
    language: string = 'en',
): Promise<void> {
    const url = process.env.XTTS_API_URL || 'http://127.0.0.1:8020';
    const speakerWav = process.env.XTTS_SPEAKER_WAV || 'cloned_speaker.wav';
    const xttsLanguage = process.env.XTTS_LANGUAGE || language || 'en';

    const baseUrl = url.replace(/\/$/, '');

    // We will try standard /tts_to_audio first, and fallback to /tts or /tts_post if they fail
    const endpoints = [`${baseUrl}/tts_to_audio`, `${baseUrl}/tts`, `${baseUrl}/tts_post`];
    let lastError: any = null;

    for (const endpoint of endpoints) {
        try {
            console.log(
                `Sending synthesis request to XTTS: ${endpoint} (speaker: ${speakerWav}, lang: ${xttsLanguage})`,
            );
            const response = await axios.post(
                endpoint,
                {
                    text,
                    speaker_wav: speakerWav,
                    language: xttsLanguage,
                },
                {
                    responseType: 'stream',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    timeout: 120000,
                },
            );

            await saveStreamToFile(response.data, outputPath);
            console.log(`Successfully generated voiceover via XTTS: ${outputPath}`);
            return; // Success, exit function
        } catch (error: any) {
            console.warn(`XTTS endpoint ${endpoint} failed, trying fallback: ${error.message}`);
            lastError = error;
        }
    }

    throw new Error(`XTTS synthesis failed on all endpoints. Last error: ${lastError?.message}`);
}

/**
 * Synthesizes voice using local OpenAI-compatible API (e.g. Kokoro-FastAPI).
 */
export async function generateVoiceoverWithLocalOpenAI(text: string, outputPath: string): Promise<void> {
    const url = process.env.OPENAI_LOCAL_TTS_URL || 'http://127.0.0.1:8880/v1';
    const apiKey = process.env.OPENAI_LOCAL_TTS_API_KEY || 'mock-key';
    const voice = process.env.OPENAI_LOCAL_TTS_VOICE || 'af_sky';
    const model = process.env.OPENAI_LOCAL_TTS_MODEL || 'kokoro';

    const endpoint = `${url.replace(/\/$/, '')}/audio/speech`;
    console.log(`Sending synthesis request to OpenAI-Local TTS: ${endpoint} (voice: ${voice}, model: ${model})`);

    try {
        const response = await axios.post(
            endpoint,
            {
                model,
                input: text,
                voice,
                response_format: 'mp3',
            },
            {
                responseType: 'stream',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                timeout: 120000,
            },
        );

        await saveStreamToFile(response.data, outputPath);
        console.log(`Successfully generated voiceover via OpenAI-Local TTS: ${outputPath}`);
    } catch (error: any) {
        console.error(`OpenAI-Local TTS synthesis failed: ${error.message}`);
        throw error;
    }
}

/**
 * Synthesizes voice using a Kokoro-FastAPI (or Kokoro-Cpp) OpenAI-compatible
 * endpoint. Kokoro is an MIT-licensed, fully local neural TTS — no cloud, no
 * API key. Point OPENAI_LOCAL_TTS_URL at any Kokoro server.
 */
export async function generateVoiceoverWithKokoro(text: string, outputPath: string): Promise<void> {
    const baseUrl = (process.env.OPENAI_LOCAL_TTS_URL || 'http://127.0.0.1:8880/v1').replace(/\/+$/, '');
    const apiKey = process.env.OPENAI_LOCAL_TTS_API_KEY || 'mock-key';
    const voice = process.env.OPENAI_LOCAL_TTS_VOICE || 'af_sky';
    const model = process.env.OPENAI_LOCAL_TTS_MODEL || 'kokoro';
    const endpoint = `${baseUrl}/audio/speech`;
    console.log(`Sending synthesis request to Kokoro: ${endpoint} (voice: ${voice}, model: ${model})`);
    try {
        const response = await axios.post(
            endpoint,
            {
                model,
                input: text,
                voice,
                response_format: 'mp3',
            },
            {
                responseType: 'stream',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                timeout: 120000,
            },
        );
        await saveStreamToFile(response.data, outputPath);
        console.log(`Successfully generated voiceover via Kokoro: ${outputPath}`);
    } catch (error: any) {
        console.error(`Kokoro synthesis failed: ${error.message}`);
        throw error;
    }
}
