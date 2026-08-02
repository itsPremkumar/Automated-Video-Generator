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
import { createHash } from 'crypto';
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
import {
    applyVoiceAudioFx,
    sceneDuckGain,
    sceneVoiceVolume,
    sceneVoiceDelay,
    applyColorGradeDepth,
    applyParallax,
    applyParticles,
    applyShake,
    applySpeedRamp,
    applyPunchIn,
    applyWatermarkScene,
    applyBrandTint,
    resolveEncodeOpts,
    hasHardwareEncoder,
    resolveOutputName,
    resolveAspectSizes,
} from './advanced-fx.js';
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
    /** Phase 2: extra aspect-ratio renders keyed by label (e.g. "1x1"). */
    extraAspects?: Record<string, string>;
    sfxUsed: number;
    scenesRendered: number;
    /** P1#4: scene-index pairs that share an identical source asset. */
    duplicateScenePairs?: Array<[number, number]>;
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
    const bold = (weight ?? 400) >= 600;
    if (process.platform !== 'win32') {
        // Cross-platform: pick the first present common system font.
        const candidates = process.platform === 'darwin'
            ? ['/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf']
            : [
                '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
                '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
                '/usr/share/fonts/TTF/DejaVuSans.ttf',
            ];
        const ordered = bold ? candidates : [...candidates].reverse();
        for (const c of ordered) { if (fs.existsSync(c)) return c; }
        return candidates[0]; // best effort — ffmpeg falls back to fontconfig
    }
    const base = 'C:\\Windows\\Fonts';
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

/** Resolve an emoji-capable font (Segoe UI Emoji on Windows, else the
 *  default text font). Emoji glyphs render blank in Inter/DejaVu, so the
 *  sticker overlay must use this. */
function resolveEmojiFont(): string {
    if (process.platform === 'win32') {
        const p = 'C:/Windows/Fonts/seguiemj.ttf';
        if (fs.existsSync(p)) return p;
    }
    // Best-effort Linux/macOS emoji fonts.
    for (const p of ['/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', '/System/Library/Fonts/Apple Color Emoji.ttf']) {
        if (fs.existsSync(p)) return p;
    }
    return resolveFontFile(undefined);
}

/** Rasterize an emoji to a transparent PNG sticker via ffmpeg, so it can
 *  be composited with the `overlay` filter. On Windows the Segoe UI
 *  Emoji font renders the COLOR glyph when `fontcolor` is set (without
 *  it, drawtext emits a monochrome box). A `fontcolor` is required
 *  for a correct colored sticker. Returns the PNG path, or undefined on
 *  failure. */
function renderEmojiSticker(emoji: string, size: number, outDir: string): string | undefined {
    const png = path.join(outDir, `sticker_${Buffer.from(emoji).toString('hex')}.png`);
    if (fs.existsSync(png)) return png;
    try {
        // color=cindasium/transparent canvas + drawtext (no fontcolor) renders
        // the emoji glyph in its native color onto an alpha channel.
        execFileSync(ff(), [
            '-y', '-f', 'lavfi', '-i',
            `color=c=black@0:s=${size}x${size},format=rgba,format=yuva420p`,
            '-frames:v', '1', '-vf',
            `drawtext=fontfile='${resolveEmojiFont()}':text='${emoji.replace(/'/g, "'\\''")}':fontsize=${Math.round(size * 0.8)}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
            png,
        ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 30000 });
        return fs.existsSync(png) && fs.statSync(png).size > 0 ? png : undefined;
    } catch (e: any) { console.warn(`  ⚠ emoji sticker render failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`); return undefined; }
}
function drawTextFilter(text: string, x: string, y: string, size: number, color: string, opts?: { fontFile?: string; weight?: number; enable?: string; shadow?: boolean; emoji?: boolean }): string {
    const isHex = color.startsWith('#') || /^0x?[0-9a-fA-F]{6}$/.test(color);
    const c = isHex ? (color.startsWith('#') ? `0x${color.slice(1)}` : color) : color;
    const en = opts?.enable ? `:enable='${escExpr(opts.enable)}'` : '';
    const shadow = (opts?.shadow && !opts?.emoji) ? `:shadowcolor=black@0.85:shadowx=3:shadowy=3` : '';
    // Emoji glyphs carry their own color; forcing fontcolor blanks them, so
    // omit it for emoji overlays.
    const colorPart = opts?.emoji ? '' : `:fontcolor=${c}`;
    const ff = opts?.fontFile ?? resolveFontFile(undefined);
    return `drawtext=fontfile='${ff}':text='${esc(text)}'${colorPart}:fontsize=${size}:x=${x}:y=${y}:box=1:boxcolor=black@0.4:boxborderw=6${shadow}${en}`;
}

/** Rough glyph-width metric for the loaded font (~0.52em advance).
 *  Good enough to decide wrapping/sizing without measuring text. */
export function estimateTextWidth(s: string, size: number): number {
    return Math.ceil(s.length * size * 0.52);
}

/** Cheap sanity check: does `p` exist, is non-empty, and does ffprobe
 *  see a video stream? Used to skip FX/palette stages whose input
 *  is a corrupt/empty upstream intermediate (so one bad clip can't
 *  poison the whole composition). Uses the ffprobe binary (NOT ffmpeg). */
export function isReadableVideo(p: string): boolean {
    if (!p || !fs.existsSync(p) || fs.statSync(p).size === 0) return false;
    try {
        const bin = ffprobeStaticPath();
        if (!bin) return false;
        const o = execFileSync(bin, ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', p], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).toString();
        return /video/.test(o);
    } catch { return false; }
}

/**
 * P1#4: lightweight cross-scene duplicate detection.
 *
 * Two scenes that resolve to the SAME source asset (same file path, or same
 * content hash of the first 256 KB) produce an identical-looking shot back to
 * back — a real quality regression in long videos. This is NON-FATAL: it only
 * emits a console warning + returns the offending pairs so the caller can log
 * them. It never blocks or re-orders the composition.
 *
 * Cost is bounded: O(n) file reads of at most 256 KB each, so it stays cheap
 * even on a 6GB box with many scenes.
 */
export function detectDuplicateScenes(visuals: string[]): Array<[number, number]> {
    const sig = (p: string): string | null => {
        if (!p || !fs.existsSync(p)) return null;
        try {
            const st = fs.statSync(p);
            if (st.size === 0) return null;
            const fd = fs.openSync(p, 'r');
            const buf = Buffer.alloc(Math.min(262144, st.size));
            const n = fs.readSync(fd, buf, 0, buf.length, 0);
            fs.closeSync(fd);
            const h = createHash('sha1').update(buf.subarray(0, n)).digest('hex');
            // fold in size so two different files that happen to share a header
            // prefix still differ
            return `${st.size}:${h}`;
        } catch { return null; }
    };
    const seen = new Map<string, number>();
    const dups: Array<[number, number]> = [];
    visuals.forEach((v, i) => {
        const s = sig(v);
        if (!s) return;
        const prev = seen.get(s);
        if (prev !== undefined) dups.push([prev, i]);
        else seen.set(s, i);
    });
    return dups;
}

/** Resolve the ffprobe-static binary path (no type decls shipped). */
function ffprobeStaticPath(): string | undefined {
    try {
        const mod = require('ffprobe-static') as { path?: string };
        return mod?.path && fs.existsSync(mod.path) ? mod.path : undefined;
    } catch { return undefined; }
}

/** Named color-grade "palette" presets for the whole comp or per scene.
 *  The old code emitted a raw `palette(<name>)` string which ffmpeg
 *  has NO filter for (it failed silently). Here we map names to real
 *  ffmpeg color filters so `paletteFilter` is a usable high-control knob.
 *  Returns a filter string, or '' when the preset is unknown/empty. */
export function buildPaletteFilter(preset?: string): string {
    const p = (preset ?? '').toLowerCase().trim();
    switch (p) {
        case 'warm':    return "colortemperature=6500,eq=saturation=1.15:gamma=0.95";
        case 'cool':    return "colortemperature=9500,eq=saturation=1.1:gamma=1.05";
        case 'blue':    return "colorbalance=bs=0.12:rs=-0.06:gs=-0.03,eq=saturation=1.2";
        case 'teal':    return "colorbalance=bs=0.14:gs=0.05:rs=-0.10,eq=saturation=1.25";
        case 'cyberpunk': return "colorbalance=rs=0.10:bs=0.10:gs=-0.08,eq=contrast=1.2:saturation=1.3";
        case 'vintage': return "colorbalance=rs=0.08:gs=0.02:bs=-0.08,eq=contrast=0.95:saturation=0.85:gamma=1.1";
        case 'cinematic': return "eq=contrast=1.15:saturation=1.05,colortemperature=7000";
        // BUG A3: sunset/noir were documented vocab but silently mapped to ''.
        case 'sunset':  return "colorbalance=rs=0.15:gs=0.02:bs=-0.12,eq=saturation=1.2:gamma=1.05";
        case 'noir':    return "hue=s=0,eq=contrast=1.35:brightness=-0.03";
        default:
            if (p) console.warn(`  ⚠ unknown paletteFilter '${p}' — no palette applied (known: warm, cool, blue, teal, cyberpunk, vintage, cinematic, sunset, noir)`);
            return '';
    }
}
export function wrapCaption(s: string, size: number, maxW: number): string[] {
    const words = s.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
        const trial = cur ? `${cur} ${w}` : w;
        if (estimateTextWidth(trial, size) > maxW && cur) { lines.push(cur); cur = w; }
        else cur = trial;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [s];
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

    // ── 1a) P1#4: cross-scene duplicate detection (NON-FATAL warning only) ──
    // Catches identical source assets reused across scenes (back-to-back
    // identical shots). Never blocks the render; surfaces pairs for review.
    try {
        const dupPairs = detectDuplicateScenes(visuals);
        if (dupPairs.length) {
            const pairs = dupPairs.map(([a, b]) => `scene ${a} ⟷ scene ${b}`).join(', ');
            console.warn(`  ⚠ duplicate-scene detection: ${dupPairs.length} pair(s) share an identical source asset — ${pairs}`);
            (result as ComposeResult & { duplicateScenePairs?: Array<[number, number]> }).duplicateScenePairs = dupPairs;
        }
    } catch { /* best-effort, never fatal */ }

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
    const { width: outW, height: outH } = resolveOutputSize(job);

    // ── 2) Per-clip visual FX (speed / stabilize / chromaKey / bw / blur / kenBurns)
    //        then per-scene inline-tag grade + vignette + Phase 2 color adjustments. ──
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
        // Named color-grade palette (warm/cool/blue/teal/cyberpunk/vintage/
        // cinematic) — a real high-control knob that used to emit a
        // raw `palette(name)` string ffmpeg rejected.
        const pal = job.paletteFilter ? buildPaletteFilter(job.paletteFilter) : '';
        if (pal) {
            const pf = path.join(outDir, `pal_${i}.mp4`);
            if (fs.existsSync(pf)) fs.rmSync(pf, { force: true }); // avoid stale 0-byte reuse
            // Guard: only apply if `out` is a readable video (a corrupt
            // upstream FX intermediate must not poison the whole chain).
            if (isReadableVideo(out)) {
                try { execFileSync(ff(), ['-y', '-i', out, '-filter_complex', `[0:v]${pal}[v]`, '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '1', pf], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 }); if (fs.existsSync(pf) && fs.statSync(pf).size > 0) out = pf; else console.warn(`  ⚠ palette skipped: empty output for scene ${i}`); }
                catch (e: any) { console.warn(`  ⚠ palette filter failed: ${(String(e?.stderr ?? e?.message)).split('\\n').slice(-3).join(' | ').slice(0, 280)}`); }
            } else {
                console.warn(`  ⚠ palette skipped: scene ${i} input not a readable video (upstream FX issue)`);
            }
        }
        // Phase 2: per-scene color adjustments (contrast/saturation/brightness/gamma/colorTemp)
        out = applyColorAdjustments(out, i, job, outDir);
        // Phase 2: per-scene mirror/flip
        out = applyMirror(out, i, job, outDir);
        // Phase 2: per-scene opacity + blend mode
        out = applyOpacityBlend(out, i, job, outDir);
        // Phase 2: per-scene LUT
        out = applyLut(out, i, job, outDir);
        // Phase 2: color-grading depth (highlights/shadows/whites/blacks/wheels/tone-curve)
        out = applyColorGradeDepth(out, i, job, outDir);
        // Phase 2: motion — parallax + particles
        out = applyParallax(out, i, job, outDir, outW, outH);
        out = applyParticles(out, i, job, outDir, outW, outH);
        // Phase 3: motion plugins — shake + speed-ramp + punch-in
        out = applyShake(out, i, job, outDir, outW, outH);
        out = applySpeedRamp(out, i, job, outDir);
        out = applyPunchIn(out, i, job, outDir, outW, outH);
        // Phase 2: brand — per-scene watermark + brand tint
        out = applyWatermarkScene(out, i, job, outDir, inputDir, outW, outH);
        out = applyBrandTint(out, i, job, outDir);
        return out;
    });

    // ── 3) SFX placement (per scene + on-cut) ──
    const sfx = await resolveSfx(job, fxVisuals.length, path.join(outDir, 'sfx'));
    result.sfxUsed = sfx.length;

    // ── 4) Build the slideshow video (concat images/clips with crossfade) ──
    const W = outW;
    const H = outH;
    const baseVideo = path.join(outDir, 'base.mp4');
    // Phase 2: per-scene transition resolution. Each scene's effective
    // transition is: transitionOutByScene[i] ?? inline scene.transition ??
    // transitionInByScene[i+1] (the OUT of scene i == IN of scene i+1) ??
    // job.transition ?? 'fade'. Duration/curve honored in crossfadeSlideshow.
    const sceneTransitions = fxVisuals.map((_, i) => {
        const inline = scenes[i]?.transition;
        const out = job.transitionOutByScene?.[i];
        const inNext = job.transitionInByScene?.[i + 1];
        return out ?? inline ?? inNext ?? job.transition ?? 'fade';
    });
    // Phase 2: per-scene transition duration + curve → global crossfade params.
    const xfDurByScene = (i: number) => job.transitionDurationByScene?.[i] ?? job.crossfadeSec ?? 0.4;
    const xfCurve = job.transitionCurve ?? 'ease-in-out';
    await buildSlideshow(fxVisuals, audios, W, H, baseVideo, durations, sceneTransitions, job.transition ?? 'fade', xfDurByScene, xfCurve);

    // ── 5) Burned overlays (title / lower-third / CTA / emoji / captions) ──
    const overlay = buildOverlayPlan(job);
    const vf: string[] = [];
    const txt = (text: string, x: string, y: string, size: number, color: string, opts?: { fontFile?: string; weight?: number; enable?: string }) =>
        drawTextFilter(text, x, y, size, color, { fontFile: opts?.fontFile, weight: opts?.weight, enable: opts?.enable, shadow: overlay.font.shadow });
    if (overlay.titleCard) {
        const tcDur = overlay.titleCard.durationSec ?? 3;
        const tcEnable = `lte(t,${tcDur.toFixed(2)})`;
        // Title (large) + optional subtitle (smaller, below).
        vf.push(txt(overlay.titleCard.title, '(w-text_w)/2', 'h/2-40', 48, overlay.font.color, { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: overlay.font.weight, enable: tcEnable }));
        if (overlay.titleCard.subtitle) vf.push(txt(overlay.titleCard.subtitle, '(w-text_w)/2', 'h/2+10', 30, overlay.font.color, { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: 400, enable: tcEnable }));
    }
    if (overlay.lowerThird) vf.push(txt(overlay.lowerThird, '40', 'H-th-40', 36, overlay.font.color, { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: overlay.font.weight, enable: 'gte(t,1)*lte(t,4)' }));
    if (overlay.endCta) vf.push(txt(overlay.endCta, '(w-text_w)/2', 'H-th-60', 42, overlay.font.color, { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: overlay.font.weight }));
    // Outro end-card: CTA text (+ optional SUBSCRIBE + hashtags) shown
    // only in the final `durationSec` window. Previously declared in
    // cli-job.ts but never burned — dead signal. Uses totalDur for the
    // enable window so it lands at the very end regardless of cut count.
    if (overlay.outro) {
        const oDur = overlay.outro.durationSec ?? 3;
        const oEnable = `gte(t,${Math.max(0, totalDur - oDur).toFixed(2)})`;
        vf.push(txt(overlay.outro.ctaText, '(w-text_w)/2', 'H-th-70', 42, overlay.font.color, { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: overlay.font.weight, enable: oEnable }));
        if (overlay.outro.showSubscribe) vf.push(txt('SUBSCRIBE', '(w-text_w)/2', 'H-th-30', 28, overlay.font.color, { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: 400, enable: oEnable }));
        if (overlay.outro.hashtags?.length) vf.push(txt(overlay.outro.hashtags.join(' '), '(w-text_w)/2', 'h-40', 24, overlay.font.color, { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: 400, enable: oEnable }));
    }
    // Phase 2: per-scene text overlays (from textOverlayByScene)
    scenes.forEach((sc, i) => {
        if (!sc) return;
        const overlayText = job.textOverlayByScene?.[i];
        if (!overlayText?.text) return;
        const start = cumStart[i] ?? 0;
        const end = start + (durations[i] ?? DEFAULT_SCENE_SEC);
        const enable = `gte(t,${start.toFixed(2)})*lt(t,${end.toFixed(2)})`;
        const fontSize = overlayText.fontSize ?? 48;
        const color = overlayText.color ?? 'white';
        const x = overlayText.x ?? '(w-text_w)/2';
        const y = overlayText.y ?? '40';
        const fontFile = resolveFontFile(undefined);
        vf.push(drawTextFilter(overlayText.text, x, y, fontSize, color, {
            fontFile,
            weight: 700,
            enable,
            shadow: true,
        }));
    });
    // Phase 2: per-scene CTA buttons (from ctaButtonByScene)
    scenes.forEach((sc, i) => {
        if (!sc) return;
        const cta = job.ctaButtonByScene?.[i];
        if (!cta?.text) return;
        const start = cumStart[i] ?? 0;
        const end = start + (durations[i] ?? DEFAULT_SCENE_SEC);
        const enable = `gte(t,${start.toFixed(2)})*lt(t,${end.toFixed(2)})`;
        const fontSize = 32;
        const fontFile = resolveFontFile(undefined, cta.borderColor ? 800 : 700);
        const x = cta.x ?? '(w-text_w)/2';
        const y = cta.y ?? 'H-th-60';
        const w = cta.width ?? 200;
        const h = cta.height ?? 60;
        const color = cta.color ?? '#FF6B35';
        const borderColor = cta.borderColor ?? 'white';
        // Note: ffmpeg drawbox doesn't support rounded corners natively;
        // borderRadius is accepted for API completeness but renders as a
        // sharp-cornered rectangle. A rounded variant would need a separate
        // overlay PNG or the pad+ellipse approach.
        // Draw CTA button: rectangle + text
        vf.push(`drawbox=x='${x}':y='${y}':w=${w}:h=${h}:color=${color.replace('#', '0x')}@0.9:t=fill:enable='${enable}'`);
        vf.push(`drawbox=x='${x}':y='${y}':w=${w}:h=${h}:color=${borderColor.replace('#', '0x')}@0.9:t=4:enable='${enable}'`);
        vf.push(drawTextFilter(cta.text, x, `H-th-60`, fontSize, 'white', { fontFile, weight: 700, enable, shadow: false }));
    });
    // Emoji stickers: rasterize each emoji to a transparent PNG (with
    // fontcolor so Segoe UI Emoji renders the COLOR glyph on Windows),
    // then overlay it at its scene window.
    const stickerOverlays: { png: string; x: number; y: number; start: number; end: number }[] = [];
    for (const [idx, emoji] of Object.entries(overlay.emojiByScene)) {
        const si = Number(idx);
        const start = cumStart[si] ?? 0;
        const end = start + (durations[si] ?? DEFAULT_SCENE_SEC);
        const png = renderEmojiSticker(emoji, 96, outDir);
        if (png) stickerOverlays.push({ png, x: W - 96 - 24, y: 24, start, end });
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
    // Per-scene burned captions (the spoken line). This was the single
    // biggest gap: compose.ts burned title/lowerThird/CTA/emoji but NEVER
    // the scene's own caption text — so `captions:'burned'` produced
    // silent, textless clips. Now we burn `captionText ?? voiceoverText`
    // per scene, themed, auto-wrapped + auto-fit to the frame width
    // (long lines used to overflow and get clipped), and optionally
    // animate it kinetically.
    const frameW = W;
    const maxTextW = Math.floor(frameW * 0.92);
    scenes.forEach((sc, i) => {
        if (!sc) return;
        const cap = (sc.captionText?.trim()) ? sc.captionText : (sc.voiceoverText ?? '').trim();
        if (!cap) return;
        const start = cumStart[i] ?? 0;
        const end = start + (durations[i] ?? DEFAULT_SCENE_SEC);
        // Auto-shrink so the longest wrapped line fits the frame width.
        let size = 40;
        while (size > 20 && wrapCaption(cap, size, maxTextW).some((l) => estimateTextWidth(l, size) > maxTextW)) size -= 2;
        const lines = wrapCaption(cap, size, maxTextW);
        const lineH = Math.round(size * 1.3);
        const blockH = lines.length * lineH;
        if (overlay.kineticText && cap.split(/\s+/).length > 1) {
            // Karaoke: highlight one word at a time (still wrapped, 2 lines).
            const words = cap.split(/\s+/);
            const step = Math.max(0.05, (end - start) / words.length);
            words.forEach((w, wi) => {
                const ws = (start + wi * step).toFixed(2);
                const we = (start + (wi + 1) * step).toFixed(2);
                const full = words.map((x, k) => (k === wi ? x : x.toLowerCase())).join(' ');
                const wl = wrapCaption(full, size, maxTextW);
                wl.forEach((ln, li) => {
                    const ly = `H-th-${Math.max(60, 120 + blockH / 2) - (wl.length - 1 - li) * lineH}`;
                    vf.push(drawTextFilter(ln, '(w-text_w)/2', ly, size, overlay.font.color,
                        { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: overlay.font.weight, enable: `gte(t,${ws})*lt(t,${we})`, shadow: overlay.font.shadow }));
                });
            });
        } else {
            lines.forEach((ln, li) => {
                const ly = `H-th-${Math.max(60, 120 + blockH / 2) - (lines.length - 1 - li) * lineH}`;
                vf.push(txt(ln, '(w-text_w)/2', ly, size, overlay.font.color,
                    { fontFile: resolveFontFile(overlay.font.family, overlay.font.weight), weight: overlay.font.weight, enable: `gte(t,${start.toFixed(2)})*lt(t,${end.toFixed(2)})` }));
            });
        }
    });
    const watermarkPath = overlay.watermark ? path.join(inputDir, overlay.watermark) : undefined;
    let withOverlays = baseVideo;
    if (vf.length > 0) {
        withOverlays = applyOverlays(baseVideo, vf, outDir);
    }
    if (watermarkPath && fs.existsSync(watermarkPath)) {
        const wm = path.join(outDir, 'watermarked.mp4');
        try {
            execFileSync(ff(), ['-y', '-i', withOverlays, '-i', watermarkPath, '-filter_complex', '[0:v][1:v]overlay=W-w-20:H-h-20', '-c:v', 'libx264', '-preset', 'veryfast', wm], { stdio: 'ignore', timeout: 120000 });
            if (fs.existsSync(wm)) withOverlays = wm;
        } catch { /* keep previous */ }
    }
    // Emoji stickers: overlay each rendered PNG at its scene window.
    for (const st of stickerOverlays) {
        if (!fs.existsSync(st.png)) continue;
        const out = path.join(outDir, `sticker_${stickerOverlays.indexOf(st)}_applied.mp4`);
        try {
            execFileSync(ff(), [
                '-y', '-i', withOverlays, '-i', st.png,
                '-filter_complex', `[1:v]scale=${96}:${96}[s];[0:v][s]overlay=x=${st.x}:y=${st.y}:enable='between(t,${st.start.toFixed(2)},${st.end.toFixed(2)})'`,
                '-c:v', 'libx264', '-preset', 'veryfast', out,
            ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 });
            if (fs.existsSync(out)) withOverlays = out;
        } catch (e: any) { console.warn(`  ⚠ sticker overlay failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`); }
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
    // `musicIntensity` ('calm'|'mid'|'energetic') was previously an
    // AI-style-engine hint only — the deterministic render ignored it and
    // always normalized music to -14 LUFS. Map it to a target LUFS so the
    // declared field actually affects output loudness. Precedence: explicit
    // `normalizeLufs` > `musicIntensity` > default -14 (backward-compatible).
    const targetLufs = resolveMusicLufs(job);
    const normMusic = musicForMix ? normalizeAudio(musicForMix, audioMixed + '.norm.mp3', targetLufs) : undefined;

    const amixInputs = ['-i', withOverlays];
    // J-cut: when job.jCutSec > 0, start the PICTURE jCutSec seconds
    // AFTER the voiceover, so each scene's audio leads its picture
    // (classic documentary J-cut). Implemented by offsetting the video
    // input relative to the audio timeline via -itsoffset.
    if (job.jCutSec && job.jCutSec > 0) amixInputs.push('-itsoffset', job.jCutSec.toFixed(2));
    const filterParts: string[] = [];
    const amixLabels: string[] = []; // labels fed INTO amix (BUG#3 fix)
    let ai = 1;
    // voice (concat scenes) — only if at least one non-empty voice file exists
    const validVoices = audios
        .filter((a) => a && fs.existsSync(a) && fs.statSync(a).size > 0)
        .map((a, idx) => applyVoiceAudioFx(a, idx, job, outDir)); // Phase 2: per-scene voice FX
    const voiceConcat = path.join(outDir, 'voice_concat.aac');
    if (validVoices.length > 0) {
        concatAudio(validVoices, voiceConcat);
        if (fs.existsSync(voiceConcat) && fs.statSync(voiceConcat).size > 0) {
            // Phase 2: per-scene voice volume (scene 0 representative; the
            // concat already merged per-scene FX, so we scale the merged voice).
            const vVol = sceneVoiceVolume(job, 0);
            if (vVol !== 1) {
                const lbl = `[${ai}:a]volume=${vVol.toFixed(2)}[va${ai}]`;
                filterParts.push(`${lbl};`);
                amixLabels.push(`[va${ai}]`);
            } else {
                amixLabels.push(`[${ai}:a]`);
            }
            amixInputs.push('-i', voiceConcat); ai++;
        }
    }
    if (normMusic && fs.existsSync(normMusic) && fs.statSync(normMusic).size > 0) {
        // Phase 2: music ducking — average duck across scenes (0..1).
        const duckAvg = (() => {
            if (!job.duckDepthByScene && !job.duckDepth) return 1;
            const n = fxVisuals.length || 1;
            let sum = 0;
            for (let s = 0; s < n; s++) sum += sceneDuckGain(job, s);
            return sum / n;
        })();
        if (duckAvg !== 1) {
            const lbl = `[${ai}:a]volume=${duckAvg.toFixed(2)}[ma${ai}]`;
            filterParts.push(`${lbl};`);
            amixLabels.push(`[ma${ai}]`);
        } else {
            amixLabels.push(`[${ai}:a]`);
        }
        amixInputs.push('-i', normMusic); ai++;
    }
    for (const s of sfx) {
        if (fs.existsSync(s.localPath) && fs.statSync(s.localPath).size > 0) {
            // Time each SFX to its scene cut (sfxByScene / sfxOnCut) instead
            // of stacking them all at t=0. cumStart[sceneIndex] is the
            // video timestamp where that scene's picture begins.
            const at = cumStart[s.sceneIndex] ?? 0;
            if (at > 0) amixInputs.push('-itsoffset', at.toFixed(2));
            amixInputs.push('-i', s.localPath); amixLabels.push(`[${ai}:a]`); ai++;
        }
    }

    // Phase 2: resolve encode options (fps / gop / codec / resolution).
    const enc = resolveEncodeOpts(job, W, H);
    // Fall back from requested hardware encode if unavailable.
    let codecArgs = enc.codecArgs;
    if (job.hardwareEncode) {
        const hw = hasHardwareEncoder();
        if (hw === 'nvenc') codecArgs = ['-c:v', 'h264_nvenc', '-preset', 'p2', '-pix_fmt', 'yuv420p'];
        else if (hw === 'videotoolbox') codecArgs = ['-c:v', 'h264_videotoolbox', '-pix_fmt', 'yuv420p'];
        else codecArgs = ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p']; // safe fallback
    }
    const vEncArgs = job.jCutSec && job.jCutSec > 0 ? codecArgs : ['-c:v', 'copy'];

    if (filterParts.length > 0 || amixLabels.length > 0) {
        // amix needs >=2 real inputs; if only 1 audio input, map it directly
        // (no synthetic anullsrc — that is a *source*, not an audio filter).
        const n = amixLabels.length;
        const amix = n === 1
            ? `${amixLabels[0]}acopy[a]`
            : `${filterParts.join('')}${amixLabels.join('')}amix=inputs=${n}:duration=longest[a]`;
        const args = [...amixInputs, '-filter_complex', amix, '-map', '0:v', '-map', '[a]',
            // J-cut uses -itsoffset to shift the *video* timeline forward.
            // Copying a timestamp-shifted stream corrupts the tail frames
            // (undecodeable past the shift → outro/end-card region breaks),
            // so re-encode video when J-cut is active. Otherwise copy
            // (fast, lossless) is fine.
            ...vEncArgs,
            ...(enc.scaleW !== W || enc.scaleH !== H ? ['-vf', `scale=${enc.scaleW}:${enc.scaleH}`] : []),
            '-r', String(enc.fps), '-g', String(enc.gop), '-keyint_min', String(enc.gop),
            '-c:a', 'aac', '-shortest', finalVideo];
        try { execFileSync(ff(), args, { stdio: 'ignore', timeout: 150000 }); }
        catch (e: any) { console.warn(`  ⚠ audio mix ffmpeg failed: ${String(e?.stderr ?? e?.message).slice(0,400)}`); /* keep video-only */ }
    } else {
        fs.copyFileSync(withOverlays, finalVideo);
    }
    // Phase 2: honor outputName
    if (fs.existsSync(finalVideo)) {
        // Pass the BASE NAME, not the full path: resolveOutputName returns its
        // 2nd arg unchanged when job.outputName is unset, and joining a full
        // path onto outDir produced a broken doubled path (ENOENT on copyfile).
        const named = resolveOutputName(job, 'final.mp4');
        if (named !== 'final.mp4') {
            const dst = path.join(outDir, named);
            if (dst !== finalVideo) { fs.copyFileSync(finalVideo, dst); result.video = dst; }
            else result.video = finalVideo;
        } else {
            result.video = finalVideo;
        }
    }

    // ── 7) Export artifacts ──
    // Phase 2: multi-aspect re-render (exportAspects)
    const aspectSizes = resolveAspectSizes(job, W, H);
    for (const a of aspectSizes) {
        const outPath = path.join(outDir, `final_${a.label}.mp4`);
        if (result.video && (a.w !== W || a.h !== H)) {
            try {
                execFileSync(ff(), ['-y', '-i', result.video, '-vf', `scale=${a.w}:${a.h}:force_original_aspect_ratio=decrease,pad=${a.w}:${a.h}:(ow-iw)/2:(oh-ih)/2`, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outPath], { stdio: 'ignore', timeout: 120000 });
                if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) (result.extraAspects ??= {})[a.label] = outPath;
            } catch (e: any) { console.warn(`  ⚠ aspect ${a.label} render failed: ${String(e?.stderr ?? e?.message).slice(0,150)}`); }
        }
    }
    if (job.exportFormat === 'gif' && result.video) result.gif = transcode(result.video, 'gif', outDir) ?? undefined;
    if (job.exportFormat === 'webm' && result.video) result.gif = transcode(result.video, 'webm', outDir) ?? undefined;
    if (job.posterScene != null && result.video) {
        const si = Math.max(0, job.posterScene);
        result.poster = exportPoster(result.video, cumStart[si] ?? 0, outDir) ?? undefined;
    }
    if (job.contactSheet && result.video) result.contactSheet = exportContactSheet(result.video, outDir, Math.max(2, fxVisuals.length)) ?? undefined;

    return result;
}

/** Apply a (possibly huge) chain of video filters as burned overlays on top of
 *  `baseVideo`, producing `overlays.mp4` in `outDir`. Returns the overlay
 *  output path on success, or the unchanged `baseVideo` on failure.
 *
 *  The graph is passed via `-filter_script:v <file>` instead of an inline
 *  `-vf`: a per-word kinetic caption chain × many scenes easily exceeds the
 *  Windows 32,767-char command line, and `spawnSync` then throws
 *  ENAMETOOLONG — which used to silently drop ALL text (captions, intro,
 *  outro) while keeping the bare base video. */
export function applyOverlays(baseVideo: string, vf: string[], outDir: string): string {
    if (vf.length === 0 || !baseVideo || !fs.existsSync(baseVideo)) return baseVideo;
    const ov = path.join(outDir, 'overlays.mp4');
    const script = path.join(outDir, 'overlays_filter.txt');
    fs.writeFileSync(script, vf.join(','));
    const args = ['-y', '-i', baseVideo, '-filter_script:v', script, '-c:v', 'libx264', '-preset', 'veryfast', ov];
    try { execFileSync(ff(), args, { stdio: 'ignore', timeout: 120000 }); return fs.existsSync(ov) && fs.statSync(ov).size > 0 ? ov : baseVideo; }
    catch (e: any) { console.warn(`  ⚠ overlay ffmpeg failed: ${String(e?.stderr ?? e?.message).slice(0, 300)}`); return baseVideo; }
    finally { try { fs.rmSync(script, { force: true }); } catch { /* ignore */ } }
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
async function buildSlideshow(visuals: string[], audios: string[], W: number, H: number, out: string, durations?: number[], transitions?: (string | undefined)[], defaultTransition: string = 'fade', xfDurByScene?: (i: number) => number, xfCurve?: string): Promise<void> {
    const dir = path.dirname(out);
    const sceneClips: string[] = [];
    visuals.forEach((v, i) => {
        const isImg = /\.(jpg|jpeg|png|webp)$/i.test(v);
        const clip = path.join(dir, `scene_${i}.mp4`);
        const hold = Math.max(0.5, durations?.[i] ?? DEFAULT_SCENE_SEC).toFixed(2);
        if (isImg) {
            // Hold each image for its real scene duration at the target resolution.
            try {
                execFileSync(ff(), ['-y', '-loop', '1', '-i', v, '-t', hold, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`, '-r', '25', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', clip], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
            } catch (e: any) { console.warn(`  ⚠ scene ${i} image encode failed: ${String(e?.stderr ?? e?.message).slice(0, 300)}`); return; }
        } else {
            // Re-encode clip to target size/rate AND enforce the scene's real
            // duration: -stream_loop extends clips shorter than `hold` (e.g.
            // a still-image-derived FX clip that is only 1 frame long) and -t
            // trims longer ones, so every scene matches its voiceover length.
            try {
                execFileSync(ff(), ['-y', '-stream_loop', '-1', '-i', v, '-t', hold, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`, '-r', '25', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', clip], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 90000 });
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
        const xf = crossfadeSlideshow(sceneClips, W, H, out, durations, trans, defaultTransition, xfDurByScene, xfCurve);
        if (xf) return; // success path
        console.warn('  ⚠ crossfade build failed — falling back to plain concat');
    }
    // Plain concat (hard cuts) — original behaviour.
    const list = path.join(dir, 'slideshow_list.txt');
    fs.writeFileSync(list, sceneClips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join('\n'));
    const args = ['-y', '-fflags', '+genpts', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out];
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
export function crossfadeSlideshow(clips: string[], W: number, H: number, out: string, durations?: number[], transitions?: (string | undefined)[], defaultTransition: string = 'fade', xfDurByScene?: (i: number) => number, xfCurve?: string): string | undefined {
    const fps = 25;
    const durOf = (i: number) => Math.max(0.5, durations?.[i] ?? DEFAULT_SCENE_SEC);
    const tDurOf = (i: number) => xfDurByScene ? Math.min(2, Math.max(0.1, xfDurByScene(i))) : 0.4;
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
    // offset_i = sum(dur_0..dur_{i-1}) - i*segDur  (overlapping fades).
    // NOTE: the offset must be computed BEFORE emitting transition i —
    // using the previous loop's offset (as the original code did) puts
    // transition 0 at t=0 and shifts every later transition one scene
    // early, which silently truncates the whole chain to ~scene 0 length
    // (ffmpeg exits 0 on the degenerate graph, so it shipped undetected).
    const segs: string[] = [];
    let offset = 0;
    for (let i = 1; i < trimmed.length; i++) {
        const kind = (transitions?.[i - 1] ?? defaultTransition ?? 'fade');
        const segDur = tDurOf(i - 1);
        offset += durOf(i - 1) - segDur;
        const prevLabel = i === 1 ? `[0:v]` : `[v${i - 1}]`;
        if (kind === 'cut') {
            // hard cut: xfade with ~0 duration keeps the graph valid.
            segs.push(`${prevLabel}[${i}:v]xfade=transition=fade:duration=0.001:offset=${offset.toFixed(3)}[v${i}]`);
        } else {
            // Extended plugin transitions map to native ffmpeg xfade kinds:
            // glitch→pixelize, whippan→hblur (motion streak), morphcut→smoothleft,
            // lightleak→fadewhite (bright flash). Falls back to fade for unknown.
            const ttype =
                kind === 'slide' ? 'slideleft'
                : kind === 'zoomblur' ? 'zoomin'
                : kind === 'glitch' ? 'pixelize'
                : kind === 'whippan' || kind === 'whip-pan' ? 'hblur'
                : kind === 'morphcut' || kind === 'morph-cut' ? 'smoothleft'
                : kind === 'lightleak' || kind === 'light-leak' ? 'fadewhite'
                : 'fade';
            segs.push(`${prevLabel}[${i}:v]xfade=transition=${ttype}:duration=${segDur.toFixed(2)}:offset=${offset.toFixed(3)}[v${i}]`);
        }
    }
    const last = trimmed.length - 1;
    // Chain the xfade segments with ';' (NOT ',') and apply format to the final
    // output label so the graph is fully connected. BUG#1: old code consumed raw
    // [i:v][i-1:v] every iteration (double-consumed inputs, unchained) and joined
    // with ',' leaving format= with an unlabeled pad → every transition fell back
    // to a hard cut.
    const filter = `${segs.join(';')};[v${last}]format=yuv420p[vout]`;
    const args: string[] = ['-y'];
    for (let i = 0; i < trimmed.length; i++) args.push('-i', trimmed[i]);
    args.push('-filter_complex', filter, '-map', '[vout]', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', String(fps), out);
    try { execFileSync(ff(), args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 }); } catch (e: any) { console.warn(`  ⚠ xfade failed: ${String(e?.stderr ?? e?.message).split('\n').filter((l: string) => /Error|Invalid|not found|mismatch|non-monoton|exist/.test(l)).slice(-3).join(' | ').slice(0, 300)}`); return undefined; }
    return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : undefined;
}

function concatAudio(files: string[], out: string): void {
    const list = path.join(path.dirname(out), 'audio_list.txt');
    fs.writeFileSync(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    // Re-encode to AAC rather than `-c copy`: the inputs are pcm_s16le WAVs and
    // the output is an .aac container, so a stream copy always fails (and used
    // to silently drop the voiceover from the final mix). Encoding produces a
    // valid concatenated voice track.
    try { execFileSync(ff(), ['-y', '-fflags', '+genpts', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'aac', '-b:a', '192k', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 }); } catch (e: any) {
        const detail = String(e?.stderr ?? e?.message ?? e).slice(0, 300);
        throw new Error(`audio concat failed: ${detail}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2 — Advanced per-scene effect helpers
// These consume the new agentic-scripts.json fields that were previously
// declared but never reached the ffmpeg render path.
// ═══════════════════════════════════════════════════════════════════════════

/** Phase 2: per-scene color adjustments (contrast/saturation/brightness/gamma/colorTemp).
 *  Builds a single `eq` filter with only the parameters that are set for this scene. */
function applyColorAdjustments(clipPath: string, sceneIndex: number, job: any, workDir: string): string {
    if (!fs.existsSync(clipPath)) return clipPath;
    const c = job.contrastByScene?.[sceneIndex];
    const s = job.saturationByScene?.[sceneIndex];
    const b = job.brightnessByScene?.[sceneIndex];
    const g = job.gammaByScene?.[sceneIndex];
    const temp = job.colorTempByScene?.[sceneIndex];
    if (c === undefined && s === undefined && b === undefined && g === undefined && temp === undefined) return clipPath;
    const eqParts: string[] = [];
    if (c !== undefined) eqParts.push(`contrast=${c}`);
    if (s !== undefined) eqParts.push(`saturation=${s}`);
    if (b !== undefined) eqParts.push(`brightness=${b}`);
    if (g !== undefined) eqParts.push(`gamma=${g}`);
    // Color temperature: use colorbalance for warm/cool shifts
    let colorBalance = '';
    if (temp !== undefined) {
        const kelvin = temp;
        if (kelvin < 6500) {
            // Warmer (more red): positive rs, negative bs
            const shift = Math.min(0.15, (6500 - kelvin) / 6500 * 0.15);
            colorBalance = `colorbalance=rs=${shift.toFixed(3)}:bs=-${(shift * 0.5).toFixed(3)}`;
        } else if (kelvin > 6500) {
            // Cooler (more blue): positive bs, negative rs
            const shift = Math.min(0.15, (kelvin - 6500) / 10000 * 0.15);
            colorBalance = `colorbalance=bs=${shift.toFixed(3)}:rs=-${(shift * 0.5).toFixed(3)}`;
        }
    }
    const filters = eqParts.length > 0 ? `eq=${eqParts.join(':')}` : '';
    const allFilters = [filters, colorBalance].filter(Boolean).join(',');
    if (!allFilters) return clipPath;
    const out = path.join(workDir, `color_${sceneIndex}.mp4`);
    if (fs.existsSync(out)) fs.rmSync(out, { force: true });
    if (!isReadableVideo(clipPath)) return clipPath;
    try {
        execFileSync(ff(), ['-y', '-i', clipPath, '-vf', allFilters, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '1', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
        return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : clipPath;
    } catch (e: any) {
        console.warn(`  ⚠ color adjustments scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
        return clipPath;
    }
}

/** Phase 2: per-scene mirror/flip. */
function applyMirror(clipPath: string, sceneIndex: number, job: any, workDir: string): string {
    const mirror = job.mirrorByScene?.[sceneIndex];
    if (!mirror || !fs.existsSync(clipPath)) return clipPath;
    let filter: string;
    switch (mirror) {
        case 'horizontal': filter = 'hflip'; break;
        case 'vertical': filter = 'vflip'; break;
        case 'both': filter = 'hflip,vflip'; break;
        default: return clipPath;
    }
    const out = path.join(workDir, `mirror_${sceneIndex}.mp4`);
    if (fs.existsSync(out)) fs.rmSync(out, { force: true });
    if (!isReadableVideo(clipPath)) return clipPath;
    try {
        execFileSync(ff(), ['-y', '-i', clipPath, '-vf', filter, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '1', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
        return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : clipPath;
    } catch (e: any) {
        console.warn(`  ⚠ mirror scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
        return clipPath;
    }
}

/** Phase 2: per-scene opacity + blend mode. Opacity via colorchannelmixer
 *  (reliable on all builds). Blend mode uses ffmpeg `blend` against a
 *  generated solid-color base layer. */
function applyOpacityBlend(clipPath: string, sceneIndex: number, job: any, workDir: string): string {
    const opacity = job.opacityByScene?.[sceneIndex];
    const blend = job.blendModeByScene?.[sceneIndex];
    if (opacity === undefined && !blend) return clipPath;
    if (!fs.existsSync(clipPath)) return clipPath;
    const out = path.join(workDir, `blend_${sceneIndex}.mp4`);
    if (fs.existsSync(out)) fs.rmSync(out, { force: true });
    if (!isReadableVideo(clipPath)) return clipPath;
    try {
        let filter = '';
        if (blend) {
            // Generate a black base, then blend the clip over it with the mode.
            const blackBase = path.join(workDir, `blendbase_${sceneIndex}.mp4`);
            execFileSync(ff(), ['-y', '-f', 'lavfi', '-i', `color=c=black:s=1280x720:d=5`, '-c:v', 'libx264', '-preset', 'veryfast', blackBase], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 30000 });
            filter = `[0:v][1:v]blend=all_mode=${blend}[v]`;
            execFileSync(ff(), ['-y', '-i', clipPath, '-i', blackBase, '-filter_complex', filter, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '1', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
            fs.rmSync(blackBase, { force: true });
        } else if (opacity !== undefined) {
            const a = Math.max(0, Math.min(1, Number(opacity))).toFixed(2);
            filter = `format=yuva420p,colorchannelmixer=aa=${a}`;
            execFileSync(ff(), ['-y', '-i', clipPath, '-vf', filter, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '1', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
        }
        return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : clipPath;
    } catch (e: any) {
        console.warn(`  ⚠ opacity/blend scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
        return clipPath;
    }
}

/** Phase 2: per-scene LUT (Look-Up Table) via ffmpeg's lut3d filter.
 *  Looks for the LUT file in input/visuals/. */
function applyLut(clipPath: string, sceneIndex: number, job: any, workDir: string): string {
    const lut = job.lutByScene?.[sceneIndex];
    if (!lut || !fs.existsSync(clipPath)) return clipPath;
    const lutPath = path.resolve(process.cwd(), 'input', 'visuals', lut);
    if (!fs.existsSync(lutPath)) {
        console.warn(`  ⚠ LUT not found for scene ${sceneIndex}: ${lutPath}`);
        return clipPath;
    }
    const out = path.join(workDir, `lut_${sceneIndex}.mp4`);
    if (fs.existsSync(out)) fs.rmSync(out, { force: true });
    if (!isReadableVideo(clipPath)) return clipPath;
    try {
        execFileSync(ff(), ['-y', '-i', clipPath, '-vf', `lut3d=${lutPath}`, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '1', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
        return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : clipPath;
    } catch (e: any) {
        console.warn(`  ⚠ LUT scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
        return clipPath;
    }
}

/** Phase 2: per-scene text overlay. Burns text onto the scene at a specific
 *  time window using drawtext with an enable expression. */
function applyTextOverlay(clipPath: string, sceneIndex: number, job: any, workDir: string, W: number, H: number, cumStart: number, duration: number): string | null {
    const overlay = job.textOverlayByScene?.[sceneIndex];
    if (!overlay?.text) return null;
    if (!fs.existsSync(clipPath)) return null;
    const out = path.join(workDir, `text_${sceneIndex}.mp4`);
    if (fs.existsSync(out)) fs.rmSync(out, { force: true });
    if (!isReadableVideo(clipPath)) return null;
    const start = cumStart;
    const end = start + duration;
    const enable = `gte(t,${start.toFixed(2)})*lt(t,${end.toFixed(2)})`;
    const fontSize = overlay.fontSize ?? 48;
    const color = overlay.color ?? 'white';
    const x = overlay.x ?? '(w-text_w)/2';
    const y = overlay.y ?? '40';
    const fontFile = resolveFontFile(undefined);
    const textFilter = `drawtext=fontfile='${fontFile}':text='${overlay.text.replace(/'/g, "'\\''")}':fontcolor=${color}:fontsize=${fontSize}:x=${x}:y=${y}:box=1:boxcolor=black@0.4:boxborderw=6:enable='${enable}'`;
    try {
        execFileSync(ff(), ['-y', '-i', clipPath, '-vf', textFilter, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
        return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : null;
    } catch (e: any) {
        console.warn(`  ⚠ text overlay scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
        return null;
    }
}

/** Phase 2: per-scene animated zoom (Ken Burns-like) using zoompan. */
function applyAnimatedZoom(clipPath: string, sceneIndex: number, job: any, workDir: string, W: number, H: number, duration: number): string | null {
    const zoom = job.zoomByScene?.[sceneIndex];
    if (!zoom) return null;
    if (!fs.existsSync(clipPath)) return null;
    const out = path.join(workDir, `zoom_${sceneIndex}.mp4`);
    if (fs.existsSync(out)) fs.rmSync(out, { force: true });
    if (!isReadableVideo(clipPath)) return null;
    const fps = 25;
    const frames = Math.round(duration * fps);
    const zStart = zoom.start;
    const zEnd = zoom.end;
    // Linear interpolation of zoom factor over the scene duration
    const filter = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='if(lte(zoom,${zEnd}),min(zoom*1.005,${zEnd}),${zEnd})':d=${frames}:s=${W}x${H}:fps=${fps},setsar=1`;
    try {
        execFileSync(ff(), ['-y', '-i', clipPath, '-vf', filter, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '1', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 90000 });
        return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : null;
    } catch (e: any) {
        console.warn(`  ⚠ animated zoom scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
        return null;
    }
}

/** Phase 2: per-scene pan animation using x/y offset expressions. */
function applyPanAnimation(clipPath: string, sceneIndex: number, job: any, workDir: string, W: number, H: number, duration: number): string | null {
    const pan = job.panByScene?.[sceneIndex];
    if (!pan) return null;
    if (!fs.existsSync(clipPath)) return null;
    const out = path.join(workDir, `pan_${sceneIndex}.mp4`);
    if (fs.existsSync(out)) fs.rmSync(out, { force: true });
    if (!isReadableVideo(clipPath)) return null;
    const fps = 25;
    const frames = Math.round(duration * fps);
    // Interpolate x/y from start to end as percentage of frame size
    const startX = (pan.startX / 100) * W;
    const startY = (pan.startY / 100) * H;
    const endX = (pan.endX / 100) * W;
    const endY = (pan.endY / 100) * H;
    // Use crop with moving origin (pan effect)
    const cropW = Math.min(W, Math.round(W * 0.8));
    const cropH = Math.min(H, Math.round(H * 0.8));
    const filter = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${cropW}:${cropH}:x='if(between(n,0,${frames}),${startX}+(${endX}-${startX})*n/${frames},${startX})':y='if(between(n,0,${frames}),${startY}+(${endY}-${startY})*n/${frames},${startY})',setsar=1`;
    try {
        execFileSync(ff(), ['-y', '-i', clipPath, '-vf', filter, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-threads', '1', out], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 90000 });
        return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : null;
    } catch (e: any) {
        console.warn(`  ⚠ pan animation scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
        return null;
    }
}

/**
 * Resolve the output frame size from a job spec.
 *
 * Driven by `orientation` for backward compat, but ALSO honors an explicit
 * `aspect` override ("1:1" square, "9:16" portrait, "16:9" landscape) and a
 * `platform` default (tiktok/reels→9:16, instagram→1:1, youtube→16:9).
 *
 * Previously `aspect` and `platform` were silently ignored (every non-
 * landscape job fell back to 720x1280). `platform` was purely an AI-style
 * hint that never touched the deterministic render.
 *
 * Precedence: explicit `aspect` > `orientation` > `platform`-derived default
 * > portrait default. Extracted as a pure function so the resolution can be
 * unit-tested without spinning up the whole compose pipeline.
 */
export function resolveOutputSize(job: {
    aspect?: '9:16' | '1:1' | '16:9' | 'square';
    orientation?: 'portrait' | 'landscape' | 'square';
    platform?: 'tiktok' | 'youtube' | 'instagram' | 'reels';
}): { width: number; height: number } {
    const PORT = 720; // portrait/reel short side
    const LAND = 1280; // landscape long side
    const PLATFORM_ASPECT: Record<string, '9:16' | '16:9' | '1:1'> = {
        tiktok: '9:16', reels: '9:16', instagram: '1:1', youtube: '16:9',
    };
    // Precedence: explicit aspect > explicit orientation > platform-derived
    // default > portrait default. `platform` is only the fallback when the
    // caller hasn't pinned aspect/orientation (so it stays backward-compatible
    // and explicit orientation still wins over a platform default).
    const asp = job.aspect ?? (job.orientation ? undefined : (job.platform ? PLATFORM_ASPECT[job.platform] : undefined));
    if (asp === '1:1' || asp === 'square') { return { width: PORT, height: PORT }; }
    if (asp === '16:9') { return { width: LAND, height: Math.round(LAND * 9 / 16) }; }
    if (asp === '9:16') { return { width: PORT, height: Math.round(PORT * 16 / 9) }; }
    if (job.orientation === 'square') { return { width: PORT, height: PORT }; }
    if (job.orientation === 'landscape') { return { width: LAND, height: Math.round(LAND * 9 / 16) }; }
    return { width: PORT, height: Math.round(PORT * 16 / 9) }; // portrait default
}

/**
 * Resolve the music normalization target (LUFS) from a job spec.
 *
 * `musicIntensity` ('calm' | 'mid' | 'energetic') was previously an
 * AI-style-engine hint only — the deterministic render ignored it. Now it
 * maps to a real loudness target:
 *   calm -> -18 LUFS (quieter bed), mid -> -14, energetic -> -10 (louder).
 *
 * Precedence: explicit `normalizeLufs` > `musicIntensity` > default -14.
 * Extracted as a pure function so the mapping is unit-testable without
 * running ffmpeg.
 */
export function resolveMusicLufs(job: {
    musicIntensity?: 'calm' | 'mid' | 'energetic';
    normalizeLufs?: number;
}): number {
    const intensityLufs = job.musicIntensity === 'calm' ? -18
        : job.musicIntensity === 'energetic' ? -10
        : job.musicIntensity === 'mid' ? -14
        : undefined;
    return job.normalizeLufs ?? intensityLufs ?? -14;
}
