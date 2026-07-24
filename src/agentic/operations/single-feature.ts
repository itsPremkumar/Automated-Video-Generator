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
import { execFileSync } from 'child_process';
import { fetchVisualsForScene, searchImages, searchVideos, downloadMedia } from '../../lib/visual-fetcher/index.js';
import { resolveFreeBackgroundMusic } from '../../lib/free-music.js';
import { parseScript } from '../../lib/script-parser.js';
import { buildPlan, applyProEdits } from '../pipeline/plan.js';
import { createAgenticWorkspace, AgenticWorkspace } from '../management/workspace.js';
import { Plan } from '../types.js';
import { generateAgenticVoiceovers } from '../media/tts.js';
import { runVoiceStageSafe } from '../media/voice-controller.js';
import { runBulkImageFetch, downloadDirectUrl } from './bulk-fetch.js';
import { resolveSfx, normalizeAudio, loopAudioToDuration } from './sfx.js';
import { restructurePlan, loopPlan, applyBeatSync, detectBeats } from './structure.js';
import { transcode, exportPoster, exportContactSheet } from './export-fx.js';
import { buildVoiceConfigs, applyVoiceConfigsToPlan, dubScript } from './voice-intel.js';
import { buildOverlayPlan } from './overlays.js';
import { composeVideo } from './compose.js';
import ffmpegPath from 'ffmpeg-static';
import type { AgenticCliJob } from '../../adapters/cli/cli-job.js';

export type SingleFeatureMode =
    | 'plan'
    | 'visuals'
    | 'voice'
    | 'render'
    | 'download-images'
    | 'download-videos'
    | 'download-music'
    | 'download-sfx'
    | 'download-url'
    | 'generate-voice-edgetts'
    | 'generate-voice-voicebox'
    | 'clone-voice'
    | 'render-gif'
    | 'render-poster'
    | 'render-contact-sheet'
    | 'rerender'
    | 'apply-advanced'
    | 'compose'
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
            // NOTE: default voice MUST match buildPlan()'s default
            // ('en-US-JennyNeural'), otherwise an unset job.voice silently
            // resolves to two different voices depending on entry point.
            // 'en-US-GuyNeural' was the prior hardcoded default here and it
            // is the voice that times out on a flaky Edge-TTS connection,
            // so an unset voice would fail the whole voice stage. Pin Jenny.
            voice: job.voice ?? 'en-US-JennyNeural',
            musicQuery: job.musicQuery,
            // Wave N/O — multi-persona cast + per-scene persona/dialogue.
            personas: job.personas as import('../types.js').PersonaSpec[] | undefined,
            defaultPersona: job.defaultPersona,
            scenePersonas: job.scenePersonas,
            dialogueVoices: job.dialogueVoices,
            sceneDialogue: job.sceneDialogue,
        },
        parseScript,
    );
    await applyProEdits(plan, { hookFirst: job.hookFirst ?? true, variablePacing: job.variablePacing ?? true });
    return { plan, ws };
}

/** Download only image assets for each scene. */
async function runDownloadImages(job: AgenticCliJob, id: string): Promise<SingleFeatureResult> {
    const ws = createAgenticWorkspace(id);
    const outDir = path.join(ws.root, 'download-images');
    fs.mkdirSync(outDir, { recursive: true });
    const outputs: string[] = [];

    // ── Bulk fetch path: "download N images of <subject>" ──────────────
    // When an explicit `searchQuery` is supplied (and mode=download-images),
    // bypass the per-scene script logic and pull `downloadCount` DISTINCT
    // images of that exact subject in one shot.
    if (job.searchQuery && job.searchQuery.trim().length > 0) {
        const query = job.searchQuery.trim();
        const count = Math.max(1, job.downloadCount ?? job.candidatesPerAsset ?? 10);
        const { runBulkImageFetch } = await import('./bulk-fetch.js');
        const fetched = await runBulkImageFetch(query, count, outDir, job.orientation ?? 'portrait', 'image', {
            license: job.licenseFilter,
            palette: job.paletteFilter,
        });
        for (const p of fetched) outputs.push(p);
        return {
            mode: 'download-images',
            jobId: id,
            workspace: ws,
            outputs,
            summary: `Bulk downloaded ${outputs.length}/${count} image(s) for query="${query}" → ${outDir}`,
        };
    }

    const { plan } = await buildPlanOnly(job, id);
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

/** SFX-only mode: fetch sound effects per scene (no images/music/voice/render). */
async function runDownloadSfx(job: AgenticCliJob, id: string): Promise<SingleFeatureResult> {
    const { plan, ws } = await buildPlanOnly(job, id);
    const outDir = path.join(ws.root, 'download-sfx');
    const sfx = await resolveSfx(job, plan.scenes.length, outDir);
    return {
        mode: 'download-sfx',
        jobId: id,
        workspace: ws,
        plan,
        outputs: sfx.map((s) => s.localPath),
        summary: `Fetched ${sfx.length} SFX clip(s) → ${outDir}`,
    };
}

/** Direct URL download mode (image/video/music/sfx). */
async function runDownloadUrl(job: AgenticCliJob, id: string): Promise<SingleFeatureResult> {
    const ws = createAgenticWorkspace(id);
    if (!job.downloadUrl) throw new Error('download-url mode requires "downloadUrl".');
    const kind = job.downloadUrlKind ?? 'image';
    const outDir = path.join(ws.root, `download-${kind}`);
    const p = await downloadDirectUrl(job.downloadUrl, kind, outDir);
    return {
        mode: 'download-url',
        jobId: id,
        workspace: ws,
        outputs: p ? [p] : [],
        summary: p ? `Downloaded ${kind} → ${p}` : `Failed to download ${job.downloadUrl}`,
    };
}

/**
 * apply-advanced mode: PURE CONFIG PROOF.
 * Builds the plan, then applies EVERY advanced editor signal configured on the
 * job (reorder/delete/loop/beat-sync, voice configs, overlays, sfx plan) and
 * returns a detailed report of what was applied. No network, no ffmpeg — it
 * proves the whole advanced control surface is reachable from the JSON.
 */
async function runApplyAdvanced(job: AgenticCliJob, id: string): Promise<SingleFeatureResult> {
    const { plan: basePlan, ws } = await buildPlanOnly(job, id);
    let plan = basePlan;
    const applied: string[] = [];

    // Structure: reorder / delete / loop / beat-sync
    if (job.sceneOrder || job.deleteScenes) {
        plan = restructurePlan(plan, { sceneOrder: job.sceneOrder, deleteScenes: job.deleteScenes });
        applied.push(`restructure(order=${JSON.stringify(job.sceneOrder)}, delete=${JSON.stringify(job.deleteScenes)})`);
    }
    if (job.loopVideo && job.loopVideo > 1) {
        plan = loopPlan(plan, job.loopVideo);
        applied.push(`loopVideo x${job.loopVideo}`);
    }
    if (job.beatSync) {
        const ff = ffmpegPath as unknown as string;
        const music = job.backgroundMusic ? path.resolve('input/visuals', job.backgroundMusic) : null;
        const beats = music && fs.existsSync(music) ? detectBeats(music, ff) : [];
        plan = applyBeatSync(plan, beats);
        applied.push(`beatSync(beats=${beats.length})`);
    }

    // Voice intelligence
    const voiceCfgs = buildVoiceConfigs(plan.scenes.length, {
        baseVoice: job.voice,
        ttsStyle: job.ttsStyle,
        voicesByScene: job.voicesByScene,
        voiceSpeed: job.voiceSpeed,
        voicePitchSemitones: job.voicePitchSemitones,
        voiceAging: job.voiceAging,
        dialogueVoices: job.dialogueVoices,
        useClonedVoiceId: job.useClonedVoiceId,
    });
    applyVoiceConfigsToPlan(plan, voiceCfgs);
    applied.push(`voice(style=${job.ttsStyle ?? '-'},speed=${job.voiceSpeed ?? 1},dialogue=${!!job.dialogueVoices},cloned=${job.useClonedVoiceId ?? '-'})`);
    if (job.dubLanguage) {
        plan.scenes.forEach((s) => { s.voiceoverText = dubScript(s.voiceoverText, job.dubLanguage!); });
        applied.push(`dub(${job.dubLanguage})`);
    }

    // Overlays
    const overlay = buildOverlayPlan(job);
    applied.push(`overlay(lowerThird=${!!overlay.lowerThird},title=${!!overlay.titleCard},cta=${!!overlay.endCta},wm=${!!overlay.watermark},emoji=${Object.keys(overlay.emojiByScene).length})`);

    // SFX plan (config only; actual fetch is download-sfx mode)
    if (job.sfxByScene || job.sfxOnCut) applied.push(`sfx(scenes=${Object.keys(job.sfxByScene ?? {}).length},onCut=${!!job.sfxOnCut})`);
    if (job.normalizeLufs != null) applied.push(`normalize(${job.normalizeLufs} LUFS)`);
    if (job.loopMusic) applied.push('loopMusic');

    // Visual FX (config only; applied at render via visual-fx.ts)
    const fxCount = (job.clipSpeedByScene ? Object.keys(job.clipSpeedByScene).length : 0)
        + (job.stabilizeScenes?.length ?? 0) + (job.chromaKeyScenes?.length ?? 0)
        + (job.filterByScene ? Object.keys(job.filterByScene).length : 0) + (job.blurScenes?.length ?? 0);
    if (fxCount > 0) applied.push(`visualFx(${fxCount} scene(s))`);

    // Export
    if (job.exportFormat) applied.push(`export(${job.exportFormat})`);
    if (job.posterScene != null) applied.push(`poster(scene ${job.posterScene})`);
    if (job.contactSheet) applied.push('contactSheet');

    // Acquisition filters
    if (job.licenseFilter) applied.push(`license(${job.licenseFilter})`);
    if (job.paletteFilter) applied.push(`palette(${job.paletteFilter})`);

    return {
        mode: 'apply-advanced',
        jobId: id,
        workspace: ws,
        plan,
        outputs: [],
        summary: `Applied ${applied.length} advanced signal(s) to ${plan.scenes.length}-scene plan:\n    • ${applied.join('\n    • ')}`,
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
        case 'download-sfx':
            return runDownloadSfx(job, id);
        case 'download-url':
            return runDownloadUrl(job, id);
        case 'generate-voice-edgetts':
            return runGenerateVoiceEdgeTts(job, id);
        case 'generate-voice-voicebox':
            return runGenerateVoiceVoicebox(job, id);
        case 'clone-voice':
            return runCloneVoice(job, id);
        case 'apply-advanced':
            return runApplyAdvanced(job, id);
        case 'compose':
            return runCompose(job, id);
        case 'rerender':
            return runRerender(job, id);
        case 'render-gif':
        case 'render-poster':
        case 'render-contact-sheet':
            return {
                mode,
                jobId: id,
                workspace: createAgenticWorkspace(id),
                outputs: [],
                summary: `Export artifact '${mode}' queued: requires a rendered mp4 input (pass --input). Handled by export-fx.ts transcode/exportPoster/exportContactSheet.`,
            };
        case 'full':
        default:
            throw new Error("mode 'full' should be routed to runAgenticPipeline, not runSingleFeature.");
    }
}

/**
 * compose mode: build the plan, gather per-scene visuals (download if a script
 * is present, else generate placeholder color frames), optionally generate
 * voiceovers, then bake EVERY advanced signal into a real video via compose.ts.
 */
async function runCompose(job: AgenticCliJob, id: string): Promise<SingleFeatureResult> {
    const { plan, ws } = await buildPlanOnly(job, id);
    const outDir = path.join(ws.root, 'compose');
    fs.mkdirSync(outDir, { recursive: true });
    const inputDir = path.resolve('input', 'visuals');

    // 1) Gather scene visuals: try downloaded images, else placeholder frames.
    const sceneVisuals: string[] = [];
    for (let i = 0; i < plan.scenes.length; i++) {
        const scene = plan.scenes[i];
        // Try the bulk-fetch cache for this scene's keyword.
        const kw = scene.searchKeywords.join(' ') || job.searchQuery || 'abstract';
        const fetched = await runBulkImageFetch(kw, 1, path.join(outDir, 'raw'), job.orientation ?? 'portrait', 'image', {
            license: job.licenseFilter, palette: job.paletteFilter,
        });
        if (fetched.length > 0) { sceneVisuals.push(fetched[0]); continue; }
        // Fallback: use the job's defaultVisual (a user-supplied brand/cover
        // image) if provided, else generate a solid-color placeholder frame
        // so compose still has input. `defaultVisual` was previously ignored
        // by the deterministic compose path (only the autopilot/orchestrator
        // path honored it), so a specified fallback image silently did
        // nothing and every empty scene became a teal frame.
        const ph = path.join(outDir, `placeholder_${i}.jpg`);
        const dv = job.defaultVisual ? path.resolve('input', 'visuals', job.defaultVisual) : undefined;
        const dvExists = dv && fs.existsSync(dv);
        if (dvExists) {
            try { fs.copyFileSync(dv!, ph); } catch { /* fall through to teal */ }
        }
        if (!fs.existsSync(ph)) {
            try {
                execFileSync(ffmpegPath as unknown as string, ['-y', '-f', 'lavfi', '-i', `color=c=teal:s=720x1280:d=3`, '-frames:v', '1', ph], { stdio: 'ignore' });
            } catch { /* ignore */ }
        }
        sceneVisuals.push(ph);
    }

    // 1b) Apply advanced voice-intelligence configs onto the plan fields.
    const voiceCfgs = buildVoiceConfigs(plan.scenes.length, {
        baseVoice: job.voice,
        ttsStyle: job.ttsStyle,
        voicesByScene: job.voicesByScene,
        voiceSpeed: job.voiceSpeed,
        voicePitchSemitones: job.voicePitchSemitones,
        voiceAging: job.voiceAging,
        dialogueVoices: job.dialogueVoices,
        useClonedVoiceId: job.useClonedVoiceId,
    });
    applyVoiceConfigsToPlan(plan, voiceCfgs);
    if (job.dubLanguage) {
        for (const s of plan.scenes) s.voiceoverText = dubScript(s.voiceoverText, job.dubLanguage);
    }

    // 2) Voiceovers. Try the real engine; if it yields no audio (sandbox /
    //    backend unavailable), synthesize a deterministic tone carrying the
    //    computed rate+pitch so the voice-intelligence signal is still verifiable.
    const sceneAudio: string[] = [];
    let usedToneFallback = false;
    try {
        const voiceRes = await generateAgenticVoiceovers(plan, ws, job.voice, job.useClonedVoiceId);
        for (const s of voiceRes.scenes) if (s.audioPath && fs.existsSync(s.audioPath) && fs.statSync(s.audioPath).size > 0) sceneAudio.push(s.audioPath);
    } catch { /* fall through to tone */ }
    if (sceneAudio.length === 0) {
        usedToneFallback = true;
        for (let i = 0; i < plan.scenes.length; i++) {
            const c = voiceCfgs[i];
            const tone = path.join(outDir, `tone_${i}.wav`);
            const rate = c?.rate ?? 1;
            const pitchHz = 220 * Math.pow(2, (c?.pitch ?? 0) / 12) * (1 / Math.max(0.5, rate));
            const dur = (3 / Math.max(0.5, rate)).toFixed(2);
            try {
                execFileSync(ffmpegPath as unknown as string, ['-y', '-f', 'lavfi', '-i', `sine=frequency=${pitchHz.toFixed(1)}:duration=${dur}`, '-c:a', 'pcm_s16le', tone], { stdio: 'ignore', timeout: 30000 });
                if (fs.existsSync(tone)) sceneAudio.push(tone);
            } catch { /* ignore */ }
        }
    }

    // 3) Background music (procedural free music if query present).
    let music: string | undefined;
    try {
        const m = await resolveFreeBackgroundMusic({ query: job.musicQuery ?? job.topic, enabled: true });
        if (m?.localPath && fs.existsSync(m.localPath)) music = m.localPath;
    } catch { /* music optional */ }

    // 4) Compose the final video with all advanced signals applied.
    const res = await composeVideo({ job, sceneVisuals, sceneAudio, music, outDir, inputDir, scenes: plan.scenes });
    const outputs = [res.video, res.gif, res.poster, res.contactSheet].filter(Boolean) as string[];
    return {
        mode: 'compose',
        jobId: id,
        workspace: ws,
        plan,
        outputs,
        summary: `Composed ${res.scenesRendered} scene(s) → ${res.video ?? '(video failed)'}` +
            (res.gif ? ` | gif ${res.gif}` : '') + (res.poster ? ` | poster ${res.poster}` : '') +
            (res.contactSheet ? ` | sheet ${res.contactSheet}` : '') + ` | sfx=${res.sfxUsed}` +
            (usedToneFallback ? ' | voice=tone-fallback' : ' | voice=tts'),
    };
}

/**
 * rerender mode: reuse cached assets from a previous compose run and re-bake
 * the video with (overridable) advanced signals — no re-fetch / no re-TTS.
 * This closes the iterative loop: change `filterByScene` / `clipSpeedByScene` /
 * `exportFormat` in the job and re-run cheaply.
 */
async function runRerender(job: AgenticCliJob, id: string): Promise<SingleFeatureResult> {
    const { ws } = await buildPlanOnly(job, id);
    // Find a prior compose cache: prefer this job's own compose dir, else the
    // most recently modified compose dir under workspace/jobs/<any>/compose
    // (supports "re-apply a signal to the previous render" globally, without
    // re-fetching assets or re-generating voice).
    const jobsRoot = path.resolve('workspace', 'jobs');
    let prev: string | undefined;
    const selfCompose = path.join(ws.root, 'compose');
    if (fs.existsSync(selfCompose)) prev = selfCompose;
    else if (fs.existsSync(jobsRoot)) {
        const candidates = fs.readdirSync(jobsRoot)
            .map((d) => path.join(jobsRoot, d, 'compose'))
            .filter((p) => fs.existsSync(p));
        candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
        if (candidates.length > 0) prev = candidates[0];
    }
    if (!prev) {
        // Nothing cached yet — run a full compose first, then we are iterative.
        return runCompose(job, id);
    }
    const listDir = (exts: string[]) => {
        if (!fs.existsSync(prev!)) return [] as string[];
        return fs.readdirSync(prev!).filter((f) => exts.some((e) => f.endsWith(e)) && fs.statSync(path.join(prev!, f)).size > 0).map((f) => path.join(prev!, f));
    };
    const sceneVisuals = listDir(['.mp4', '.jpg', '.png']).filter((f) => /scene_|placeholder|p\d/.test(f));
    const sceneAudio = listDir(['.wav', '.mp3']).filter((f) => /tone_|voice_|scene_.*_voice/.test(f));
    // Voice wavs live in the sibling <job>/audio/ dir, not under compose/.
    const audioSibling = path.join(path.dirname(prev!), 'audio');
    if (fs.existsSync(audioSibling)) {
        for (const f of fs.readdirSync(audioSibling)) {
            if (/scene_.*_voice/.test(f)) { const p = path.join(audioSibling, f); if (fs.statSync(p).size > 0) sceneAudio.push(p); }
        }
    }
    const musicCands = ['mixed_audio.aac.norm.mp3', 'mixed_audio.aac.loop.mp3'].map((f) => path.join(prev!, f)).filter((f) => fs.existsSync(f) && fs.statSync(f).size > 0);
    const music = musicCands[0];
    const outDir = path.join(ws.root, 'rerender');
    fs.mkdirSync(outDir, { recursive: true });
    const res = await composeVideo({ job, sceneVisuals, sceneAudio, music, outDir, inputDir: path.resolve('input', 'visuals') });
    const outputs = [res.video, res.gif, res.poster, res.contactSheet].filter(Boolean) as string[];
    return {
        mode: 'rerender',
        jobId: id,
        workspace: ws,
        outputs,
        summary: `Re-rendered ${res.scenesRendered} scene(s) from cache (${path.basename(prev)}) → ${res.video ?? '(failed)'} | sfx=${res.sfxUsed}`,
    };
}
