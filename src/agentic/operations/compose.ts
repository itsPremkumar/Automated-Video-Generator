/**
 * compose.ts — Real ffmpeg-based composer that bakes EVERY advanced editor
 * signal from agentic-scripts.json into an actual rendered video.
 *
 * This is the final link that was missing: the advanced signals were
 * config-reachable (proven by `apply-advanced`) and engine-tested as isolated
 * modules, but never actually combined into one output file. `compose` does
 * that — it consumes a job spec + fetched assets and produces:
 *   - a final mp4 (with SFX placed on cuts, music loop+normalize, per-clip FX,
 *     structure reorder/delete/loop, burned overlays: title/lower-third/CTA/
 *     emoji/captions, watermark)
 *   - optional gif / poster / contact-sheet artifacts
 *
 * Uses ffmpeg-static (zero cost). Pure functions + one orchestrating
 * `composeVideo()` so it is testable without the Remotion stack.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import type { AgenticCliJob } from '../../adapters/cli/cli-job.js';
import { applySceneFx, applyChromaKey } from './visual-fx.js';
import { resolveSfx, normalizeAudio, loopAudioToDuration } from './sfx.js';
import { transcode, exportPoster, exportContactSheet } from './export-fx.js';
import { restructurePlan, loopPlan } from './structure.js';
import { buildOverlayPlan } from './overlays.js';
import { dubScript } from './voice-intel.js';
import {
    resolveSceneDurations,
    applySceneGradeVignette,
    DEFAULT_SCENE_SEC,
} from './compose-scene-fx.js';
import type { ScenePlan } from '../types.js';

function ff(): string {
    const p = ffmpegPath as unknown as string;
    if (!p || !fs.existsSync(p)) throw new Error('ffmpeg-static binary not found');
    return p;
}

export interface ComposeInput {
    job: AgenticCliJob;
    /** Per-scene visual clip/image paths (length === scene count). */
    sceneVisuals: string[];
    /** Optional per-scene voiceover WAV/MP3 (length === scene count or []). */
    sceneAudio: string[];
    /** Background music path (optional). */
    music?: string;
    /** Output directory. */
    outDir: string;
    /** Resolved input/visuals dir (for watermark). */
    inputDir: string;
    /**
     * OPTIONAL per-scene plan carrying inline-tag signals ([Grade:],
     * [Vignette:], [KenBurns:], …). When provided, compose bakes these
     * per-scene tags on top of job-level fields. When omitted, behaviour is
     * exactly as before (job-level only) — fully backward-compatible.
     */
    scenes?: ScenePlan[];
}

export interface ComposeResult {
    video?: string;
    gif?: string;
    poster?: string;
    contactSheet?: string;
    sfxUsed: number;
    scenesRendered: number;
}

function esc(t: string): string {
    // ffmpeg drawtext: escape '\' then ':', and wrap text safely.
    return t.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "'\\''");
}

/** Escape a comma inside an ffmpeg filter *expression* (e.g. enable=lte(t,4))
 *  so the -vf parser doesn't treat it as a filterchain separator. */
function escExpr(e: string): string {
    return e.replace(/,/g, '\\,');
}

/** Resolve a font family+weight to an installed .ttf path (best-effort).
 * ffmpeg drawtext has no `fontweight` option — bold is selected by the
 * bold font file (e.g. arialbd.ttf). */
function resolveFontFile(family: string | undefined, weight?: number): string {
    const base = 'C:\\Windows\\Fonts';
    const bold = (weight ?? 400) >= 600;
    const map: Record<string, [string, string]> = { // [regular, bold]
        'inter, sans-serif': ['arial.ttf', 'arialbd.ttf'],
        'arial': ['arial.ttf', 'arialbd.ttf'],
        'sans-serif': ['arial.ttf', 'arialbd.ttf'],
        'georgia, serif': ['georgia.ttf', 'georgiab.ttf'],
        'georgia': ['georgia.ttf', 'georgiab.ttf'],
        'times new roman': ['times.ttf', 'timesbd.ttf'],
        'times': ['times.ttf', 'timesbd.ttf'],
        'courier new': ['cour.ttf', 'courbd.ttf'],
        'courier': ['cour.ttf', 'courbd.ttf'],
        'calibri': ['calibri.ttf', 'calibrib.ttf'],
        'comic sans ms': ['comic.ttf', 'comicbd.ttf'],
        'impact': ['impact.ttf', 'impact.ttf'],
    };
    const key = (family ?? 'arial').toLowerCase().trim();
    const [reg, bld] = map[key] ?? ['arial.ttf', 'arialbd.ttf'];
    const file = bold ? bld : reg;
    const p = path.join(base, file);
    return fs.existsSync(p) ? p : path.join(base, 'arial.ttf');
}

/** Build an ffmpeg filter for burned text overlay (drawtext). */
function drawTextFilter(text: string, x: string, y: string, size: number, color: string, opts?: { fontFile?: string; weight?: number; enable?: string; shadow?: boolean }): string {
    const isHex = color.startsWith('#') || /^0x?[0-9a-fA-F]{6}$/.test(color);
    const c = isHex ? (color.startsWith('#') ? `0x${color.slice(1)}` : color) : color;
    const en = opts?.enable ? `:enable='${escExpr(opts.enable)}'` : '';
    const shadow = opts?.shadow ? `:shadowcolor=black@0.85:shadowx=3:shadowy=3` : '';
    const ff = opts?.fontFile ?? resolveFontFile(undefined);
    return `drawtext=fontfile='${ff}':text='${esc(text)}':fontcolor=${c}:fontsize=${size}:x=${x}:y=${y}:box=1:boxcolor=black@0.4:boxborderw=6${shadow}${en}`;
}

/**
 * Compose the final video. Returns produced artifact paths.
 * Every advanced signal that has a real effect is applied here.
 */
export async function composeVideo(input: ComposeInput): Promise<ComposeResult> {
    const { job, sceneVisuals, sceneAudio, music, outDir, inputDir } = input;
    fs.mkdirSync(outDir, { recursive: true });
    const result: ComposeResult = { sfxUsed: 0, scenesRendered: 0 };

    // ── 1) Structure: reorder / delete / loop the scene list ──
    let order = sceneVisuals.map((_, i) => i);
    if (job.sceneOrder) order = job.sceneOrder.filter((i) => i < sceneVisuals.length);
    if (job.deleteScenes) order = order.filter((i) => !job.deleteScenes!.includes(i));
    let visuals = order.map((i) => sceneVisuals[i]);
    let audios = order.map((i) => sceneAudio[i] ?? '');
    // Keep the per-scene plan aligned with the reordered visuals/audios so
    // inline tags ([Grade:]/[Vignette:]/…) follow their scene through reorder.
    let scenes: (ScenePlan | undefined)[] = order.map((i) => input.scenes?.[i]);
    if (job.loopVideo && job.loopVideo > 1) {
        const v2: string[] = []; const a2: string[] = []; const s2: (ScenePlan | undefined)[] = [];
        for (let n = 0; n < job.loopVideo; n++) { v2.push(...visuals); a2.push(...audios); s2.push(...scenes); }
        visuals = v2; audios = a2; scenes = s2;
    }
    result.scenesRendered = visuals.length;

    // ── 1b) Real per-scene durations from voiceover length (fixes hardcoded 3s
    //        drift). Falls back to plan duration, then DEFAULT_SCENE_SEC. ──
    const durations = resolveSceneDurations(audios, scenes as ScenePlan[]);
    const cumStart = durations.reduce<number[]>((acc, d, i) => {
        acc.push(i === 0 ? 0 : acc[i - 1] + durations[i - 1]);
        return acc;
    }, []);
    const totalDur = durations.reduce((a, d) => a + d, 0) || DEFAULT_SCENE_SEC;

    // Output frame size. Driven by `orientation` for backward compat, but
    // ALSO honor an explicit `aspect` override (e.g. "1:1" square, "9:16"
    // portrait, "16:9" landscape). Previously `aspect` was silently ignored
    // and every non-landscape job fell back to 720x1280 — so a square
    // (1:1) job rendered as a squashed portrait. This is the canonical
    // resolution used everywhere below (FX, slideshow, overlays, export).
    const PORT = 720; // portrait/reel short side
    const LAND = 1280; // landscape long side
    let outW: number;
    let outH: number;
    const asp = job.aspect;
    if (asp === '1:1') { outW = PORT; outH = PORT; }
    else if (asp === '16:9') { outW = LAND; outH = Math.round(LAND * 9 / 16); }
    else if (asp === '9:16') { outW = PORT; outH = Math.round(PORT * 16 / 9); }
    else if (job.orientation === 'landscape') { outW = LAND; outH = Math.round(LAND * 9 / 16); }
    else { outW = PORT; outH = Math.round(PORT * 16 / 9); } // portrait default

    // ── 2) Per-clip visual FX (speed / stabilize / chromaKey / bw / blur / kenBurns)
    //        then per-scene inline-tag grade + vignette. ──
    const fxVisuals = visuals.map((v, i) => {
        let out = applySceneFx(v, i, {
            clipSpeedByScene: job.clipSpeedByScene,
            stabilizeScenes: job.stabilizeScenes,
            chromaKeyScenes: job.chromaKeyScenes,
            filterByScene: job.filterByScene,
            blurScenes: job.blurScenes,
            // Per-scene [KenBurns:] tag overrides the job-level kenBurns flag.
            kenBurns: scenes[i]?.kenBurns ?? job.kenBurns,
            // Match output orientation so portrait/reel jobs aren't squashed.
            kenBurnsWidth: outW,
            kenBurnsHeight: outH,
        }, outDir);
        out = applyChromaKey(out, i, { chromaKeyScenes: job.chromaKeyScenes }, outDir);
        // Inline [Grade:] and [Vignette:] tags (with job.vignette fallback).
        out = applySceneGradeVignette(out, i, scenes[i], job.vignette, outDir);
        return out;
    });

    // ── 3) SFX placement (per scene + on-cut) ──
    const sfx = await resolveSfx(job, fxVisuals.length, path.join(outDir, 'sfx'));
    result.sfxUsed = sfx.length;

    // ── 4) Build the slideshow video (concat images/clips with crossfade) ──
    const W = outW;
    const H = outH;
    const baseVideo = path.join(outDir, 'base.mp4');
    const sceneTransitions = visuals.map((_, i) => scenes[i]?.transition);
    await buildSlideshow(fxVisuals, audios, W, H, baseVideo, durations, sceneTransitions, job.transition ?? 'fade');

    // ── 5) Burned overlays (title / lower-third / CTA / emoji / captions) ──
    const overlay = buildOverlayPlan(job);
    const vf: string[] = [];
    const txt = (text: string, x: string, y: string, size: number, color: string, opts?: { fontFile?: string; weight?: number; enable?: string }) =>
        drawTextFilter(text, x, y, size, color, { fontFile: opts?.fontFile, weight: opts?.weight, enable: opts?.enable, shadow: overlay.font.shadow });
    if (overlay.titleCard) vf.push(txt(overlay.titleCard.title, '(w-text_w)/2', 'h/2-40', 48, overlay.font.color, { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: overlay.font.weight }));
    if (overlay.lowerThird) vf.push(txt(overlay.lowerThird, '40', 'H-th-40', 36, overlay.font.color, { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: overlay.font.weight, enable: 'gte(t,1)*lte(t,4)' }));
    if (overlay.endCta) vf.push(txt(overlay.endCta, '(w-text_w)/2', 'H-th-60', 42, overlay.font.color, { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: overlay.font.weight }));
    for (const [idx, emoji] of Object.entries(overlay.emojiByScene)) {
        const si = Number(idx);
        const start = cumStart[si] ?? 0;
        const end = start + (durations[si] ?? DEFAULT_SCENE_SEC);
        vf.push(drawTextFilter(emoji, 'W-80', '80', 56, 'white', { enable: `gte(t,${start.toFixed(2)})*lte(t,${end.toFixed(2)})` }));
    }
    // Animated progress bar: a thin bar pinned to the bottom that grows
    // left→right over the clip using a time-based width expression.
    if (overlay.progressBar) {
        const dur = Math.max(1, totalDur);
        // NOTE: avoid enable= with a comma — in a -vf string the comma is read
        // as a filterchain separator. The width expression min(W,W*t/dur)
        // already keeps the bar growing and clamped, so enable is unnecessary.
        vf.push(`drawbox=x=0:y=ih-8:w='min(iw,iw*(t/${dur}))':h=8:color=white@0.9:t=fill`);
    }
    const watermarkPath = overlay.watermark ? path.join(inputDir, overlay.watermark) : undefined;
    let withOverlays = baseVideo;
    if (vf.length > 0) {
        const ov = path.join(outDir, 'overlays.mp4');
        const args = ['-y', '-i', baseVideo, '-vf', vf.join(','), '-c:v', 'libx264', '-preset', 'veryfast', ov];
        try { execFileSync(ff(), args, { stdio: 'ignore', timeout: 120000 }); if (fs.existsSync(ov)) withOverlays = ov; }
        catch (e: any) { console.warn(`  ⚠ overlay ffmpeg failed: ${String(e?.stderr ?? e?.message).slice(0, 300)}`); /* keep base */ }
    }
    if (watermarkPath && fs.existsSync(watermarkPath)) {
        const wm = path.join(outDir, 'watermarked.mp4');
        try {
            execFileSync(ff(), ['-y', '-i', withOverlays, '-i', watermarkPath, '-filter_complex', '[0:v][1:v]overlay=W-w-20:H-h-20', '-c:v', 'libx264', '-preset', 'veryfast', wm], { stdio: 'ignore', timeout: 120000 });
            if (fs.existsSync(wm)) withOverlays = wm;
        } catch { /* keep previous */ }
    }

    // ── 6) Audio: voice + music(loop+normalize) + sfx on cuts ──
    // Remove any stale final from a previous run so a failed/skipped mix can't
    // silently leave an out-of-date video behind (was masking the aspect fix).
    const finalVideo = path.join(outDir, 'final.mp4');
    if (fs.existsSync(finalVideo)) fs.rmSync(finalVideo, { force: true });
    const audioMixed = path.join(outDir, 'mixed_audio.aac');
    const musicForMix = (music && fs.existsSync(music))
        ? (job.loopMusic ? loopAudioToDuration(music, audioMixed + '.loop.mp3', Math.ceil(totalDur)) : music)
        : undefined;
    const normMusic = musicForMix ? normalizeAudio(musicForMix, audioMixed + '.norm.mp3', job.normalizeLufs ?? -14) : undefined;

    const amixInputs = ['-i', withOverlays];
    const filterParts: string[] = [];
    let ai = 1;
    // voice (concat scenes) — only if at least one non-empty voice file exists
    const validVoices = audios.filter((a) => a && fs.existsSync(a) && fs.statSync(a).size > 0);
    const voiceConcat = path.join(outDir, 'voice_concat.aac');
    if (validVoices.length > 0) {
        concatAudio(validVoices, voiceConcat);
        if (fs.existsSync(voiceConcat) && fs.statSync(voiceConcat).size > 0) {
            amixInputs.push('-i', voiceConcat); filterParts.push(`[${ai}:a]`); ai++;
        }
    }
    if (normMusic && fs.existsSync(normMusic) && fs.statSync(normMusic).size > 0) {
        amixInputs.push('-i', normMusic); filterParts.push(`[${ai}:a]`); ai++;
    }
    for (const s of sfx) { if (fs.existsSync(s.localPath) && fs.statSync(s.localPath).size > 0) { amixInputs.push('-i', s.localPath); filterParts.push(`[${ai}:a]`); ai++; } }

    if (filterParts.length > 0) {
        // amix needs >=2 real inputs; if only 1 audio input, map it directly
        // (no synthetic anullsrc — that is a *source*, not an audio filter).
        const amix = filterParts.length === 1
            ? `[${ai - 1}:a]acopy[a]`
            : `${filterParts.join('')}amix=inputs=${filterParts.length}:duration=longest[a]`;
        const args = [...amixInputs, '-filter_complex', amix, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', finalVideo];
        try { execFileSync(ff(), args, { stdio: 'ignore', timeout: 150000 }); }
        catch (e: any) { console.warn(`  ⚠ audio mix ffmpeg failed: ${String(e?.stderr ?? e?.message).slice(0,400)}`); /* keep video-only */ }
    } else {
        fs.copyFileSync(withOverlays, finalVideo);
    }
    if (fs.existsSync(finalVideo)) result.video = finalVideo;

    // ── 7) Export artifacts ──
    if (job.exportFormat === 'gif' && result.video) result.gif = transcode(result.video, 'gif', outDir) ?? undefined;
    if (job.exportFormat === 'webm' && result.video) result.gif = transcode(result.video, 'webm', outDir) ?? undefined;
    if (job.posterScene != null && result.video) {
        const si = Math.max(0, job.posterScene);
        result.poster = exportPoster(result.video, cumStart[si] ?? 0, outDir) ?? undefined;
    }
    if (job.contactSheet && result.video) result.contactSheet = exportContactSheet(result.video, outDir, Math.max(2, fxVisuals.length)) ?? undefined;

    return result;
}

function estimateDur(sceneCount: number): number {
    return Math.max(6, sceneCount * 3);
}

/** Concatenate image(s)/clip(s) into a video slideshow with per-scene
 *  crossfade transitions. `durations` (indexed like `visuals`) sets each
 *  scene's on-screen hold; `transitions[i]` (or `defaultTransition`)
 *  selects the wipe between scene i and i+1. Supported: 'fade',
 *  'slide', 'zoomblur', 'cut' (hard cut, no transition).
 *  When <2 clips or all 'cut', falls back to a plain concat copy. */
async function buildSlideshow(visuals: string[], audios: string[], W: number, H: number, out: string, durations?: number[], transitions?: (string | undefined)[], defaultTransition: string = 'fade'): Promise<void> {
    const dir = path.dirname(out);
    const sceneClips: string[] = [];
    visuals.forEach((v, i) => {
        const isImg = /\.(jpg|jpeg|png|webp)$/i.test(v);
        const clip = path.join(dir, `scene_${i}.mp4`);
        const hold = Math.max(0.5, durations?.[i] ?? DEFAULT_SCENE_SEC).toFixed(2);
        if (isImg) {
            // Hold each image for its real scene duration at the target resolution.
            try {
                execFileSync(ff(), ['-y', '-loop', '1', '-i', v, '-t', hold, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, '-r', '25', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', clip], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
            } catch (e: any) { console.warn(`  ⚠ scene ${i} image encode failed: ${String(e?.stderr ?? e?.message).slice(0, 300)}`); return; }
        } else {
            // Re-encode clip to target size/rate AND enforce the scene's real
            // duration: -stream_loop extends clips shorter than `hold` (e.g.
            // a still-image-derived FX clip that is only 1 frame long) and -t
            // trims longer ones, so every scene matches its voiceover length.
            try {
                execFileSync(ff(), ['-y', '-stream_loop', '-1', '-i', v, '-t', hold, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, '-r', '25', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', clip], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 90000 });
            } catch (e: any) { console.warn(`  ⚠ scene ${i} clip encode failed: ${String(e?.stderr ?? e?.message).slice(0, 300)}`); return; }
        }
        if (fs.existsSync(clip) && fs.statSync(clip).size > 0) sceneClips.push(clip);
    });
    if (sceneClips.length === 0) { console.warn('  ⚠ slideshow produced 0 scene clips — no video will be built'); return; }
    if (sceneClips.length < visuals.length) console.warn(`  ⚠ slideshow: only ${sceneClips.length}/${visuals.length} scenes encoded successfully`);
    // ── Crossfade / wipe transitions between consecutive scene clips ──
    const trans = transitions ?? visuals.map(() => defaultTransition);
    const wantXfade = sceneClips.length >= 2 && trans.some((t) => t && t !== 'cut');
    if (wantXfade) {
        const xf = crossfadeSlideshow(sceneClips, W, H, out, durations, trans, defaultTransition);
        if (xf) return; // success path
        console.warn('  ⚠ crossfade build failed — falling back to plain concat');
    }
    // Plain concat (hard cuts) — original behaviour.
    const list = path.join(dir, 'slideshow_list.txt');
    fs.writeFileSync(list, sceneClips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join('\n'));
    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out];
    try { execFileSync(ff(), args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 }); } catch (e: any) { console.warn(`  ⚠ slideshow concat failed: ${String(e?.stderr ?? e?.message).slice(0, 300)}`); }
}

/**
 * Build a slideshow with smooth transitions between scenes using the xfade
 * filter. Returns the output path on success, or undefined on any failure
 * (caller should fall back to plain concat).
 *
 * Transition types:
 *   fade      → xfade=transition=fade
 *   slide     → xfade=transition=slideleft
 *   zoomblur → xfade=transition=zoomIn (subtle Ken-Burns-like push)
 *   cut       → no transition (treated as hard cut at the seam)
 *
 * Each scene clip is (re)trimmed to its exact hold duration so the xfade
 * offsets line up; the last clip keeps its full hold (no trailing fade).
 */
function crossfadeSlideshow(clips: string[], W: number, H: number, out: string, durations?: number[], transitions?: (string | undefined)[], defaultTransition: string = 'fade'): string | undefined {
    const fps = 25;
    const durOf = (i: number) => Math.max(0.5, durations?.[i] ?? DEFAULT_SCENE_SEC);
    // Trim every clip to its hold so xfade offsets are exact.
    const trimmed: string[] = [];
    for (let i = 0; i < clips.length; i++) {
        const t = path.join(path.dirname(out), `xf_${i}.mp4`);
        try {
            execFileSync(ff(), ['-y', '-i', clips[i], '-t', durOf(i).toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', t], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
            if (fs.existsSync(t) && fs.statSync(t).size > 0) trimmed.push(t); else return undefined;
        } catch { return undefined; }
    }
    // Build xfade chain. Input k is trimmed[k] (label [k:v]).
    // offset_i = sum(dur_0..dur_{i-1}) - i*tDur  (overlapping fades).
    const tDur = 0.4;
    const segs: string[] = [];
    let offset = 0;
    for (let i = 1; i < trimmed.length; i++) {
        const kind = (transitions?.[i - 1] ?? defaultTransition ?? 'fade');
        if (kind === 'cut') {
            // hard cut: xfade with ~0 duration keeps the graph valid.
            segs.push(`[${i}:v][${i - 1}:v]xfade=transition=fade:duration=0.001:offset=${offset.toFixed(3)}[v${i}]`);
        } else {
            const ttype = kind === 'slide' ? 'slideleft' : kind === 'zoomblur' ? 'zoomin' : 'fade';
            segs.push(`[${i}:v][${i - 1}:v]xfade=transition=${ttype}:duration=${tDur}:offset=${offset.toFixed(3)}[v${i}]`);
        }
        offset += durOf(i - 1) - tDur;
    }
    const last = trimmed.length - 1;
    const filter = `[0:v]format=yuv420p,${segs.join(',')}`;
    const args: string[] = ['-y'];
    for (let i = 0; i < trimmed.length; i++) args.push('-i', trimmed[i]);
    args.push('-filter_complex', filter, '-map', `[v${last}]`, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', String(fps), out);
    try { execFileSync(ff(), args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 }); } catch (e: any) { console.warn(`  ⚠ xfade failed: ${String(e?.stderr ?? e?.message).slice(0, 300)}`); return undefined; }
    return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : undefined;
}

function concatAudio(files: string[], out: string): void {
    const list = path.join(path.dirname(out), 'audio_list.txt');
    fs.writeFileSync(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    // Re-encode to AAC rather than `-c copy`: the inputs are pcm_s16le WAVs and
    // the output is an .aac container, so a stream copy always fails (and used
    // to silently drop the voiceover from the final mix). Encoding produces a
    // valid concatenated voice track.
    try { execFileSync(ff(), ['-y', '-fflags', '+genpts', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'aac', '-b:a', '192k', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 }); } catch (e: any) { console.warn(`  ⚠ audio concat failed: ${String(e?.stderr ?? e?.message).slice(0, 300)}`); }
}
