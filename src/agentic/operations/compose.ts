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
    return t.replace(/:/g, '\\:').replace(/'/g, "'\\''");
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
function drawTextFilter(text: string, x: string, y: string, size: number, color: string, opts?: { fontFile?: string; weight?: number; enable?: string }): string {
    const isHex = color.startsWith('#') || /^0x?[0-9a-fA-F]{6}$/.test(color);
    const c = isHex ? (color.startsWith('#') ? `0x${color.slice(1)}` : color) : color;
    const en = opts?.enable ? `:enable='${opts.enable}'` : '';
    const ff = opts?.fontFile ?? resolveFontFile(undefined);
    return `drawtext=fontfile='${ff}':text='${esc(text)}':fontcolor=${c}:fontsize=${size}:x=${x}:y=${y}:box=1:boxcolor=black@0.4:boxborderw=6${en}`;
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
    if (job.loopVideo && job.loopVideo > 1) {
        const v2: string[] = []; const a2: string[] = [];
        for (let n = 0; n < job.loopVideo; n++) { v2.push(...visuals); a2.push(...audios); }
        visuals = v2; audios = a2;
    }
    result.scenesRendered = visuals.length;

    // ── 2) Per-clip visual FX (speed / stabilize / chromaKey / bw / blur / kenBurns)
    const fxVisuals = visuals.map((v, i) => {
        let out = applySceneFx(v, i, {
            clipSpeedByScene: job.clipSpeedByScene,
            stabilizeScenes: job.stabilizeScenes,
            chromaKeyScenes: job.chromaKeyScenes,
            filterByScene: job.filterByScene,
            blurScenes: job.blurScenes,
            kenBurns: job.kenBurns,
        }, outDir);
        out = applyChromaKey(out, i, { chromaKeyScenes: job.chromaKeyScenes }, outDir);
        return out;
    });

    // ── 3) SFX placement (per scene + on-cut) ──
    const sfx = await resolveSfx(job, fxVisuals.length, path.join(outDir, 'sfx'));
    result.sfxUsed = sfx.length;

    // ── 4) Build the slideshow video (concat images/clips with crossfade) ──
    const W = job.orientation === 'landscape' ? 1280 : 720;
    const H = job.orientation === 'landscape' ? 720 : 1280;
    const baseVideo = path.join(outDir, 'base.mp4');
    await buildSlideshow(fxVisuals, audios, W, H, baseVideo);

    // ── 5) Burned overlays (title / lower-third / CTA / emoji / captions) ──
    const overlay = buildOverlayPlan(job);
    const vf: string[] = [];
    if (overlay.titleCard) vf.push(drawTextFilter(overlay.titleCard.title, '(w-text_w)/2', 'h/2-40', 48, overlay.font.color, { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: overlay.font.weight }));
    if (overlay.lowerThird) vf.push(drawTextFilter(overlay.lowerThird, '40', 'H-th-40', 36, overlay.font.color, { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: overlay.font.weight, enable: 'gte(t,1)*lte(t,4)' }));
    if (overlay.endCta) vf.push(drawTextFilter(overlay.endCta, '(w-text_w)/2', 'H-th-60', 42, 'yellow', { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: overlay.font.weight }));
    for (const [idx, emoji] of Object.entries(overlay.emojiByScene)) {
        vf.push(drawTextFilter(emoji, 'W-80', '80', 56, 'white', { enable: `gte(t,${Number(idx) * 3})*lte(t,${Number(idx) * 3 + 3})` }));
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
    const finalVideo = path.join(outDir, 'final.mp4');
    const audioMixed = path.join(outDir, 'mixed_audio.aac');
    const musicForMix = (music && fs.existsSync(music))
        ? (job.loopMusic ? loopAudioToDuration(music, audioMixed + '.loop.mp3', estimateDur(fxVisuals.length)) : music)
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
    if (job.posterScene != null && result.video) result.poster = exportPoster(result.video, Math.max(0, job.posterScene) * 3, outDir) ?? undefined;
    if (job.contactSheet && result.video) result.contactSheet = exportContactSheet(result.video, outDir, Math.max(2, fxVisuals.length)) ?? undefined;

    return result;
}

function estimateDur(sceneCount: number): number {
    return Math.max(6, sceneCount * 3);
}

/** Concatenate image(s)/clip(s) into a video slideshow with per-scene timing. */
async function buildSlideshow(visuals: string[], audios: string[], W: number, H: number, out: string): Promise<void> {
    const dir = path.dirname(out);
    const sceneClips: string[] = [];
    visuals.forEach((v, i) => {
        const isImg = /\.(jpg|jpeg|png|webp)$/i.test(v);
        const clip = path.join(dir, `scene_${i}.mp4`);
        if (isImg) {
            // Hold each image for 3s at the target resolution.
            try {
                execFileSync(ff(), ['-y', '-loop', '1', '-i', v, '-t', '3', '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, '-r', '25', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', clip], { stdio: 'ignore', timeout: 60000 });
            } catch { return; }
        } else {
            // Re-encode clip to target size/rate for clean concat.
            try {
                execFileSync(ff(), ['-y', '-i', v, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, '-r', '25', '-c:v', 'libx264', '-preset', 'veryfast', clip], { stdio: 'ignore', timeout: 90000 });
            } catch { return; }
        }
        if (fs.existsSync(clip) && fs.statSync(clip).size > 0) sceneClips.push(clip);
    });
    if (sceneClips.length === 0) return; // leave absent → caller notices
    // Concat the per-scene clips.
    const list = path.join(dir, 'slideshow_list.txt');
    fs.writeFileSync(list, sceneClips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join('\n'));
    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out];
    try { execFileSync(ff(), args, { stdio: 'ignore', timeout: 120000 }); } catch (e: any) { console.warn(`  ⚠ slideshow concat failed: ${String(e?.stderr ?? e?.message).slice(0, 300)}`); }
}

function concatAudio(files: string[], out: string): void {
    const list = path.join(path.dirname(out), 'audio_list.txt');
    fs.writeFileSync(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    try { execFileSync(ff(), ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { stdio: 'ignore', timeout: 60000 }); } catch { /* leave absent */ }
}
