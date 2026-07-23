/**
 * single-feature.ts — Run ONE pipeline stage in isolation from a job spec.
 *
 * The full `runAgenticPipeline` always runs plan → acquire → verify → decide →
 * gate → voice → render. But for testing, asset harvesting, voice experiments,
 * and voice cloning it is far more useful to run a SINGLE stage:
 *
 *   mode='download-images'    → fetch only image assets per scene (no video/music/voice/render)
 *   mode='download-videos'    → fetch only video clips per scene
 *   mode='download-music'     → fetch only background music tracks
 *   mode='generate-voice-edgetts' → Edge-TTS voiceover only (no visuals/render)
 *   mode='generate-voice-voicebox' → Voicebox/Kokoro real-voice generation only
 *   mode='clone-voice'        → clone a specific person's reference clip once, save profile
 *   mode='plan'               → build the plan + keywords only (dry-run style, no network)
 *   mode='full' | undefined   → delegate to the full pipeline (default)
 *
 * Every mode reuses the project's REAL, already-working engines (Pexels/Openverse
 * fetchers, downloadMedia, Edge-TTS, the in-repo Voicebox/Kokoro backend, the
 * clone-from-input/voices wiring). Nothing is reimplemented — we just call the
 * same functions the orchestrator uses, but skip the rest.
 *
 * Output is written under `workspace/jobs/<jobId>/<stage>/` so each isolated
 * artifact is inspectable on disk (you can visually verify downloaded files,
 * generated WAVs, cloned profiles).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fetchVisualsForScene, downloadMedia } from '../../lib/visual-fetcher/index.js';
import { resolveFreeBackgroundMusic } from '../../lib/free-music.js';
import { parseScript } from '../../lib/script-parser.js';
import { buildPlan, applyProEdits } from '../pipeline/plan.js';
import { createAgenticWorkspace, AgenticWorkspace } from '../management/workspace.js';
import { Plan } from '../types.js';
import { generateAgenticVoiceovers } from '../media/tts.js';
import { runVoiceStageSafe } from '../media/voice-controller.js';
import type { AgenticCliJob } from '../../adapters/cli/cli-job.js';

export type SingleFeatureMode =
    | 'plan'
    | 'visuals'
    | 'voice'
    | 'render'
    | 'download-images'
    | 'download-videos'
    | 'download-music'
    | 'generate-voice-edgetts'
    | 'generate-voice-voicebox'
    | 'clone-voice'
    | 'full';

export interface SingleFeatureResult {
    mode: SingleFeatureMode;
    jobId: string;
    workspace: AgenticWorkspace;
    plan?: Plan;
    outputs: string[]; // list of produced file paths (for visual inspection)
    summary: string;
}

/** Build the plan from a job spec (no network). */
async function buildPlanOnly(job: AgenticCliJob, id: string): Promise<{ plan: Plan; ws: AgenticWorkspace }> {
    const script = job.script ?? job.topic ?? job.title;
    const ws = createAgenticWorkspace(id);
    const plan = await buildPlan(
        script,
        {
            jobId: id,
            title: job.title,
            orientation: job.orientation ?? 'portrait',
            voice: job.voice ?? 'en-US-GuyNeural',
            musicQuery: job.musicQuery,
        },
        parseScript,
    );
    await applyProEdits(plan, { hookFirst: job.hookFirst ?? true, variablePacing: job.variablePacing ?? true });
    return { plan, ws };
}

/** Download only image assets for each scene. */
async function runDownloadImages(job: AgenticCliJob, id: string): Promise<SingleFeatureResult> {
    const { plan, ws } = await buildPlanOnly(job, id);
    const outDir = path.join(ws.root, 'download-images');
    fs.mkdirSync(outDir, { recursive: true });
    const outputs: string[] = [];
    const sceneFilter = job.sceneIndices ?? plan.scenes.map((_, i) => i);
    for (const i of sceneFilter) {
        const scene = plan.scenes[i];
        if (!scene) continue;
        const res = await fetchVisualsForScene(scene.searchKeywords, false, plan.orientation, undefined, i);
        const arr = !res ? [] : Array.isArray(res) ? res : [res];
        if (arr.length === 0) {
            console.warn(`  ⚠ scene ${i + 1}: no image candidates`);
            continue;
        }
        for (let c = 0; c < Math.min(job.candidatesPerAsset ?? 4, arr.length); c++) {
            const a = arr[c];
            if (!a?.url) continue;
            const ext = path.extname(a.url).split('?')[0] || '.jpg';
            const filename = `scene_${i + 1}_cand_${c + 1}${ext}`;
            try {
                const r = await downloadMedia(a.url, outDir, filename);
                if (r.path && fs.existsSync(r.path)) outputs.push(r.path);
            } catch (e) {
                console.warn(`  ⚠ scene ${i + 1} image ${c + 1} download failed: ${(e as Error)?.message ?? e}`);
            }
        }
    }
    return {
        mode: 'download-images',
        jobId: id,
        workspace: ws,
        plan,
        outputs,
        summary: `Downloaded ${outputs.length} image asset(s) across ${sceneFilter.length} scene(s) → ${outDir}`,
    };
}

/** Download only video clips for each scene. */
async function runDownloadVideos(job: AgenticCliJob, id: string): Promise<SingleFeatureResult> {
    const { plan, ws } = await buildPlanOnly(job, id);
    const outDir = path.join(ws.root, 'download-videos');
    fs.mkdirSync(outDir, { recursive: true });
    const outputs: string[] = [];
    const sceneFilter = job.sceneIndices ?? plan.scenes.map((_, i) => i);
    for (const i of sceneFilter) {
        const scene = plan.scenes[i];
        if (!scene) continue;
        const res = await fetchVisualsForScene(scene.searchKeywords, true, plan.orientation, undefined, i);
        const arr = !res ? [] : Array.isArray(res) ? res : [res];
        if (arr.length === 0) {
            console.warn(`  ⚠ scene ${i + 1}: no video candidates`);
            continue;
        }
        for (let c = 0; c < Math.min(job.candidatesPerAsset ?? 4, arr.length); c++) {
            const a = arr[c];
            if (!a?.url) continue;
            const ext = path.extname(a.url).split('?')[0] || '.mp4';
            const filename = `scene_${i + 1}_cand_${c + 1}${ext}`;
            try {
                const r = await downloadMedia(a.url, outDir, filename);
                if (r.path && fs.existsSync(r.path)) outputs.push(r.path);
            } catch (e) {
                console.warn(`  ⚠ scene ${i + 1} video ${c + 1} download failed: ${(e as Error)?.message ?? e}`);
            }
        }
    }
    return {
        mode: 'download-videos',
        jobId: id,
        workspace: ws,
        plan,
        outputs,
        summary: `Downloaded ${outputs.length} video clip(s) across ${sceneFilter.length} scene(s) → ${outDir}`,
    };
}

/** Download only background music tracks. */
async function runDownloadMusic(job: AgenticCliJob, id: string): Promise<SingleFeatureResult> {
    const ws = createAgenticWorkspace(id);
    const outDir = path.join(ws.root, 'download-music');
    fs.mkdirSync(outDir, { recursive: true });
    const outputs: string[] = [];
    const query = job.musicQuery ?? job.topic ?? job.title;
    for (let c = 0; c < (job.candidatesPerAsset ?? 4); c++) {
        try {
            const m = await resolveFreeBackgroundMusic({ query, enabled: true });
            if (m?.localPath && fs.existsSync(m.localPath)) {
                const ext = path.extname(m.localPath) || '.mp3';
                const dest = path.join(outDir, `music_cand_${c + 1}${ext}`);
                fs.copyFileSync(m.localPath, dest);
                outputs.push(dest);
            }
        } catch (e) {
            console.warn(`  ⚠ music cand ${c + 1} failed: ${(e as Error)?.message ?? e}`);
        }
    }
    return {
        mode: 'download-music',
        jobId: id,
        workspace: ws,
        outputs,
        summary: `Downloaded ${outputs.length} music track(s) (query="${query}") → ${outDir}`,
    };
}

/** Generate voiceover via Edge-TTS only (no visuals/render). */
async function runGenerateVoiceEdgeTts(job: AgenticCliJob, id: string): Promise<SingleFeatureResult> {
    const { plan, ws } = await buildPlanOnly(job, id);
    const audioDir = path.join(ws.root, 'voice-edgetts');
    fs.mkdirSync(audioDir, { recursive: true });
    // Force Edge-TTS provider regardless of env.
    const prevProvider = process.env.TTS_PROVIDER;
    process.env.TTS_PROVIDER = '';
    const result = await generateAgenticVoiceovers(plan, ws, job.edgeTtsVoice ?? job.voice);
    if (prevProvider !== undefined) process.env.TTS_PROVIDER = prevProvider;
    else delete process.env.TTS_PROVIDER;
    // Copy produced WAVs/MP3s into the stage dir for easy inspection.
    const outputs: string[] = [];
    for (const s of result.scenes) {
        if (s.audioPath && fs.existsSync(s.audioPath)) {
            const dest = path.join(audioDir, path.basename(s.audioPath));
            fs.copyFileSync(s.audioPath, dest);
            outputs.push(dest);
        }
    }
    return {
        mode: 'generate-voice-edgetts',
        jobId: id,
        workspace: ws,
        plan,
        outputs,
        summary: `Edge-TTS voiceover: ${outputs.length}/${plan.scenes.length} scene(s) generated (driven=${result.voiceoverDriven}) → ${audioDir}`,
    };
}

/** Generate voiceover via the real Voicebox/Kokoro backend only. */
async function runGenerateVoiceVoicebox(job: AgenticCliJob, id: string): Promise<SingleFeatureResult> {
    const { plan, ws } = await buildPlanOnly(job, id);
    const audioDir = path.join(ws.root, 'voice-voicebox');
    fs.mkdirSync(audioDir, { recursive: true });
    const prevProfile = process.env.VOICEBOX_PROFILE_ID;
    if (job.kokoroVoice) process.env.VOICEBOX_PRESET_VOICE = job.kokoroVoice;
    try {
        const res = await runVoiceStageSafe(plan, ws, job.voice);
        const outputs: string[] = [];
        for (const v of res.voices) {
            if (v.audioPath && fs.existsSync(v.audioPath)) {
                const dest = path.join(audioDir, path.basename(v.audioPath));
                fs.copyFileSync(v.audioPath, dest);
                outputs.push(dest);
            }
        }
        return {
            mode: 'generate-voice-voicebox',
            jobId: id,
            workspace: ws,
            plan,
            outputs,
            summary: `Voicebox/Kokoro voiceover: ${outputs.length}/${plan.scenes.length} scene(s) generated (profile=${res.profileId}) → ${audioDir}`,
        };
    } finally {
        if (prevProfile !== undefined) process.env.VOICEBOX_PROFILE_ID = prevProfile;
    }
}

/** Clone a specific person's voice from input/voices/<clip> and save the profile. */
async function runCloneVoice(job: AgenticCliJob, id: string): Promise<SingleFeatureResult> {
    const ws = createAgenticWorkspace(id);
    const clip = job.cloneVoiceFrom;
    if (!clip) {
        throw new Error('clone-voice mode requires "cloneVoiceFrom" (filename in input/voices/).');
    }
    // Reference clips live in input/voices/ (the canonical location the voice
    // controller scans). Resolve explicitly rather than via inputVoiceoverPath
    // (which points at input/voiceover/).
    const clipPath = path.resolve(process.cwd(), 'input', 'voices', path.basename(clip));
    if (!fs.existsSync(clipPath)) {
        throw new Error(`Reference clip not found: ${clipPath}. Place it in input/voices/.`);
    }
    const cacheDir = path.join(ws.root, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const cacheFile = path.join(cacheDir, 'voicebox-profile.json');
    // Reuse the existing clone wiring from voice-controller by pointing its
    // findReferenceVoice() at our specific clip: we temporarily copy the clip
    // into input/voices/ (canonical location the controller scans) if needed,
    // then call resolveProfileId via runVoiceStageSafe on a 1-scene plan.
    // Simpler: import the clone helper through the controller's public resolve
    // by simulating an empty plan + forcing the reference scan.
    const { cloneFromVoicesDir } = await import('../media/voice-controller.js');
    const resolved = await cloneFromVoicesDir(clipPath, cacheFile);
    const outputs: string[] = [cacheFile];
    return {
        mode: 'clone-voice',
        jobId: id,
        workspace: ws,
        outputs,
        summary: `Cloned voice profile ${resolved.id} (engine=${resolved.engine}) from ${clip} → ${cacheFile}`,
    };
}

/**
 * Entry point: run a single feature by `mode`. Returns a result with the list
 * of produced files so the caller (CLI / batch) can visually verify outputs.
 */
export async function runSingleFeature(
    job: AgenticCliJob,
    id: string,
    modeOverride?: SingleFeatureMode,
): Promise<SingleFeatureResult> {
    const mode: SingleFeatureMode = modeOverride ?? job.mode ?? 'full';
    console.log(`\n🎯 Single-feature mode: ${mode} (job=${id})`);
    switch (mode) {
        case 'plan':
        case 'visuals':
        case 'voice':
        case 'render':
            // 'visuals'/'voice'/'render' in isolation are best served by building
            // the plan first, then the relevant sub-step. For maximum reuse we
            // treat 'visuals' as download-images, 'voice' as Edge-TTS, and
            // 'render' as a no-op placeholder (render needs the full pipeline).
            if (mode === 'visuals') return runDownloadImages(job, id);
            if (mode === 'voice') return runGenerateVoiceEdgeTts(job, id);
            if (mode === 'plan') {
                const { plan, ws } = await buildPlanOnly(job, id);
                return {
                    mode: 'plan',
                    jobId: id,
                    workspace: ws,
                    plan,
                    outputs: [],
                    summary: `Plan ready: ${plan.scenes.length} scenes, ${plan.totalDurationSec}s, voice=${plan.voice}. No assets fetched.`,
                };
            }
            throw new Error(`mode '${mode}' requires the full pipeline; use the default batch runner instead.`);
        case 'download-images':
            return runDownloadImages(job, id);
        case 'download-videos':
            return runDownloadVideos(job, id);
        case 'download-music':
            return runDownloadMusic(job, id);
        case 'generate-voice-edgetts':
            return runGenerateVoiceEdgeTts(job, id);
        case 'generate-voice-voicebox':
            return runGenerateVoiceVoicebox(job, id);
        case 'clone-voice':
            return runCloneVoice(job, id);
        case 'full':
        default:
            throw new Error("mode 'full' should be routed to runAgenticPipeline, not runSingleFeature.");
    }
}
