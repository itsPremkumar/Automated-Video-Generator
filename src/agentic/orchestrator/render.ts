import * as fs from 'fs';
import * as path from 'path';
import { ffmpegDrawtextEscape } from '../../lib/ffmpeg-text.js';
import { resolveCaptionTheme, captionThemeToDrawtext } from '../config.js';
import { exportMultiAspect, generateFreeMetadata, renderThumbnail, wordTimingsFromScript } from '../media/export.js';
import { runFinalGate, verifyRenderedVideo, PostRenderCheck } from '../pipeline/gate.js';
import { aiVerifyAsset } from '../ai/ai-verify.js';
import { AgentBrain, hasModel, envOpts } from '../ai/brain.js';
import { resolveBridge, type LlmBridge, type DriverLlmCallback } from '../ai/bridge.js';
import { writeJson, readJson } from '../management/workspace.js';
import { chunkCues, mergeWordsToLines, fmtSrt } from './captions.js';
import { runFfmpeg, estimateAudioDurationSafe } from './ffmpeg.js';
import { buildPaletteFilter } from '../operations/compose.js';
import type { PipelineResult } from './types.js';
import { AGENTIC_OUTPUT_DIR } from '../management/workspace.js';
import { logInfo, logWarn, logError } from '../../shared/logging/runtime-logging.js';

/**
 * Resolve the canonical output W×H for the agentic slideshow renderer.
 * Mirrors compose.ts `resolveOutputSize` so the agentic batch path honors
 * `aspect`/`orientation` instead of always falling back to 720×1280
 * (portrait). Precedence: explicit aspect > explicit orientation > portrait.
 */
export function resolveRenderDims(
    orientation: 'portrait' | 'landscape' | 'square' | undefined,
    aspect: '9:16' | '1:1' | '16:9' | 'square' | undefined,
): { w: number; h: number } {
    const PORT = 720;
    const LAND = 1280;
    const asp = aspect ?? (orientation ? undefined : undefined);
    if (asp === '1:1' || asp === 'square') return { w: PORT, h: PORT };
    if (asp === '16:9') return { w: LAND, h: Math.round(LAND * 9 / 16) };
    if (asp === '9:16') return { w: PORT, h: Math.round(PORT * 16 / 9) };
    if (orientation === 'square') return { w: PORT, h: PORT };
    if (orientation === 'landscape') return { w: LAND, h: Math.round(LAND * 9 / 16) };
    return { w: PORT, h: Math.round(PORT * 16 / 9) };
}

/** Title card at the start of the video. */
export interface IntroCard { title: string; subtitle?: string; durationSec?: number; }
/** CTA card at the end of the video. */
export interface OutroCard { ctaText: string; showSubscribe?: boolean; hashtags?: string[]; durationSec?: number; }

/** Wrap a caption into lines that fit the frame width (ffmpeg drawtext has no auto-wrap). */
function wrapCaptionLines(text: string, frameW: number, fontsize: number): string[] {
    const sidePad = 64 + 12;
    const maxChars = Math.max(8, Math.floor((frameW - 2 * sidePad) / (fontsize * 0.65)));
    const out: string[] = [];
    for (const para of String(text).split('\n')) {
        const words = para.split(/\s+/).filter(Boolean);
        let cur = '';
        for (const w of words) {
            if (!cur) cur = w;
            else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
            else {
                out.push(cur);
                cur = w;
            }
        }
        if (cur) out.push(cur);
    }
    return out.length ? out : [''];
}

function offsetFor(visuals: { durationSec?: number }[], i: number, xf: number): number {
    let acc = 0;
    for (let k = 0; k < i; k++) acc += visuals[k].durationSec ?? 4;
    return Math.max(0, acc - xf * i);
}

/**
 * Build a per-frame volume expression that ducks music during speech.
 */
export function buildDuckExpression(
    visuals: { durationSec?: number; captionSegments?: { startMs: number; endMs: number }[] }[],
    full: number,
    duck: number,
    duckForScene?: (sceneIndex: number) => number,
): string | null {
    // Each visual's caption segments drive the duck. Per-scene [MusicIntensity:]
    // overrides the global duck depth for that scene.
    const segs: { s: number; e: number; sceneIndex: number }[] = [];
    let t = 0;
    visuals.forEach((a, vi) => {
        const dur = a.durationSec ?? 4;
        for (const c of a.captionSegments ?? []) segs.push({ s: t + c.startMs / 1000, e: t + c.endMs / 1000, sceneIndex: vi });
        t += dur;
    });
    if (segs.length === 0) return null;
    // Guard against non-finite inputs (e.g. AUDIO_FULL_LEVEL unset/NaN) — a
    // malformed expression would make ffmpeg reject the whole filter_complex.
    if (!Number.isFinite(full) || !Number.isFinite(duck)) return null;
    const terms = segs
        .map((x) => {
            const d = duckForScene ? duckForScene(x.sceneIndex) : duck;
            if (!Number.isFinite(d)) return null;
            const delta = (full - d).toFixed(3);
            // ffmpeg expression commas stay RAW — `between(t,a,b)` is a function
            // call, not a filterchain, so escaping the commas (e.g. `\,`) would
            // make ffmpeg reject the expression. `between(t,s,e)` already returns
            // 1 while speaking and 0 while silent, so it is used DIRECTLY as the
            // gate: volume = full when silent, full-delta when speaking. (An
            // earlier revision wrapped it in gt(between(...)) — but gt() needs
            // TWO args, so ffmpeg rejected the whole expression and the audio
            // filter_complex failed on every ducked render.)
            return `${delta}*between(t,${x.s.toFixed(3)},${x.e.toFixed(3)})`;
        })
        .filter(Boolean)
        .join('+');
    if (!terms) return null;
    return `${full}-${terms}`;
}

/** Build a single SFX audio layer (mp3) by resolving each scene's transition SFX. */
async function buildSfxLayer(
    ffmpeg: string,
    plan: import('../types.js').Plan,
    visuals: { durationSec?: number }[],
    sfxPlans: { sceneIndex: number; transitionIn: any; transitionOut: any }[],
    tmpDir: string,
): Promise<string | null> {
    try {
        const { planSceneSfx, resolveSfx } = await import('../media/sfx-selector.js');
        void planSceneSfx;
        const events: { atMs: number; kind: any }[] = [];
        let t = 0;
        for (let i = 0; i < visuals.length; i++) {
            const dur = (visuals[i].durationSec ?? 4) * 1000;
            const sp = sfxPlans.find((p) => p.sceneIndex === i);
            if (sp?.transitionIn) events.push({ atMs: Math.round(t), kind: sp.transitionIn });
            if (sp?.transitionOut) events.push({ atMs: Math.round(t + dur - 250), kind: sp.transitionOut });
            t += dur;
        }
        const clips = await Promise.all(
            events.map((e) => resolveSfx(e.kind).then((c) => (c ? { atMs: e.atMs, path: c.localPath } : null))),
        );
        const valid = clips.filter(Boolean) as { atMs: number; path: string }[];
        if (valid.length === 0) return null;
        const totalMs = t;
        const filter = valid.map((c, i) => `[${i}:a]adelay=${c.atMs}|${c.atMs},volume=0.5[a${i}]`).join(';');
        const mix = valid.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${valid.length}:duration=longest[aout]`;
        const tmp = `${tmpDir}/_sfx_${Date.now()}.mp3`;
        const args = [
            ...valid.flatMap((c) => ['-i', c.path]),
            '-filter_complex',
            `${filter};${mix}`,
            '-map', '[aout]',
            '-t', (totalMs / 1000).toFixed(2),
            '-c:a', 'libmp3lame', '-y', tmp,
        ];
        await new Promise<void>((res, rej) =>
            require('child_process').execFile(ffmpeg, args, { maxBuffer: 1024 * 1024 * 200 }, (e: any) =>
                e ? rej(e) : res(),
            ),
        );
        return fs.existsSync(tmp) ? tmp : null;
    } catch {
        return null;
    }
}

/** Phase 7.3 — emit thumbnail.jpg, subtitles sidecars, details.txt, scene-data copy. */
async function writeOutputArtifacts(
    res: PipelineResult,
    mp4: string,
    outDir: string,
    aiVerify?: import('../config.js').AgenticConfig['aiVerify'],
    languages?: string[],
    exportAspects?: string[],
): Promise<void> {
    const brain = new AgentBrain();
    const base = outDir + '/' + res.workspace.jobId;
    try {
        await runFfmpeg(['-i', mp4, '-ss', '00:00:01', '-vframes', '1', '-y', base + '_thumbnail.jpg']);
    } catch { /* thumbnail optional */ }
    if (res.voiceovers?.sidecars) {
        for (const sc of res.voiceovers.sidecars) {
            try { fs.copyFileSync(sc, base + '_' + sc.split(/[\\/]/).pop()); } catch { /* ignore */ }
        }
    }
    if (languages && languages.length) {
        const nativeSrt = (res.voiceovers?.sidecars ?? []).find((s) => s.endsWith('.srt'));
        if (nativeSrt && fs.existsSync(nativeSrt)) {
            try {
                const { localizeSrtSidecars } = await import('../media/localize.js');
                const out = await localizeSrtSidecars({
                    srcSrtPath: nativeSrt, outDir, baseName: res.workspace.jobId, languages, brain,
                });
                for (const p of out) {
                    try { fs.copyFileSync(p, base + '_' + p.split(/[\\/]/).pop()); } catch { /* ignore */ }
                }
                if (out.length)
                    logInfo(`🌐 localized subtitles: ${out.length} language(s) -> ${out.map((p) => p.split(/[\\/]/).pop()).join(', ')}`);
            } catch (e: any) {
                console.warn(`⚠ subtitle localization skipped: ${e?.message ?? e}`);
            }
        }
    }
    const hashtags = res.plan.scenes
        .flatMap((s) => s.searchKeywords ?? [])
        .filter((k): k is string => typeof k === 'string')
        .slice(0, 8)
        .map((k) => '#' + k.replace(/\s+/g, ''))
        .join(' ');
    fs.writeFileSync(
        base + '_details.txt',
        `${res.plan.title ?? ''}\n\n${res.plan.scenes.map((s) => `• ${s.voiceoverText ?? ''}`).join('\n')}\n\n${hashtags}\n\nGenerated by agentic pipeline (backend=${res.backend}, voiceoverDriven=${res.voiceovers?.voiceoverDriven ?? false}).`,
        'utf8',
    );
    try { await renderThumbnail(mp4, res.plan); } catch { /* optional */ }
    let aspectPaths: string[] = [];
    // BUG A2: honor the job's exportAspects (incl. '4K') instead of a
    // hardcoded three-aspect list.
    const aspects = (exportAspects && exportAspects.length ? exportAspects : ['9:16', '16:9', '1:1']) as any;
    try { aspectPaths = await exportMultiAspect(mp4, aspects); } catch { /* optional */ }
    if (aiVerify?.verifyOnRender && brain.modelEnabled && aspectPaths.length) {
        const keywords = res.plan.scenes.flatMap((s) => s.searchKeywords);
        for (const ap of aspectPaths) {
            try {
                const ai = await aiVerifyAsset(ap, 'video', keywords, { aiVerify } as any, brain);
                if (ai && !ai.pass) console.warn(`⚠ ai(per-aspect ${ap}) failed: ${ai.reason} (conf ${ai.confidence})`);
            } catch { /* optional */ }
        }
    }
    try {
        const brainMeta = await brain.generateMetadata(
            res.plan.title, res.plan.scenes.map((s) => s.voiceoverText),
        );
        let mTitle: string, mDesc: string, mHash: string, mTags: string;
        if (brainMeta) {
            mTitle = brainMeta.title;
            mDesc = brainMeta.description;
            mHash = brainMeta.hashtags.join(' ');
            mTags = brainMeta.hashtags.join(', ');
        } else {
            const f = generateFreeMetadata(res.plan);
            mTitle = f.title;
            mDesc = f.description;
            mHash = f.hashtags;
            mTags = f.tags.join(', ');
        }
        let variantBlock = '';
        try {
            const variants = await brain.titleVariants(
                res.plan.title, res.plan.scenes.map((s) => s.voiceoverText),
            );
            if (variants && variants.length) {
                variantBlock = `\n\nA/B TITLE VARIANTS (CTR test):\n` + variants.map((v, i) => `  ${i + 1}. ${v}`).join('\n');
            }
        } catch { /* optional */ }
        fs.writeFileSync(
            base + '_metadata.txt',
            `TITLE:\n${mTitle}\n\nDESCRIPTION:\n${mDesc}\n\nHASHTAGS:\n${mHash}\n\nTAGS:\n${mTags}${variantBlock}`,
            'utf8',
        );
    } catch { /* optional */ }
    try {
        const { writePublishManifest } = await import('../delivery/publish.js');
        const fm = generateFreeMetadata(res.plan);
        const manifest = writePublishManifest({
            jobId: res.workspace.jobId,
            deliverablesDir: outDir,
            cfg: res.plan as unknown as import('../config.js').AgenticConfig,
            title: fm.title, description: fm.description, hashtags: fm.hashtags, languages: languages ?? [],
        });
        logInfo(`📤 publish manifest: ${manifest.targets.length} platform target(s) → ${res.workspace.jobId}_publish-manifest.json`);
    } catch (e: any) { console.warn(`⚠ publish manifest skipped: ${e?.message ?? e}`); }
    try {
        const { archiveJob } = await import('../delivery/archive.js');
        const arch = archiveJob(res.workspace, mp4);
        if (arch) logInfo(`📦 archived ${arch.totalFiles} files (${arch.totalBytes} bytes) → ${arch.archiveDir}`);
    } catch { /* archive is best-effort */ }
    try {
        const { openReview } = await import('../delivery/revision.js');
        openReview(res.workspace, res.workspace.jobId, res.plan.title);
        logInfo(`🔍 review thread opened for "${res.plan.title}" — awaiting client approval`);
    } catch { /* review thread is best-effort */ }
    try {
        const { getPluginRegistry } = await import('../plugins/index.js');
        const reg = getPluginRegistry();
        if (reg) {
            await reg.invokeOnPostRender(mp4);
            logInfo(`🧩 plugin post-render hooks applied`);
        }
    } catch { /* plugin hooks are best-effort */ }
    try {
        const outputDir = path.resolve(AGENTIC_OUTPUT_DIR, res.workspace.jobId);
        fs.mkdirSync(outputDir, { recursive: true });
        const files = fs.readdirSync(outDir).filter((f) => f.startsWith(res.workspace.jobId));
        let copied = 0;
        for (const f of files) {
            const src = path.join(outDir, f);
            const dst = path.join(outputDir, f);
            try { fs.copyFileSync(src, dst); copied++; } catch { /* skip individual failures */ }
        }
        if (copied > 0)
            logInfo(`📁 ${copied} deliverable artifact(s) copied → ${outputDir}`);
    } catch { /* output copy is best-effort */ }
}

/**
 * Resolve the per-scene voiceover audio path for a clip (BUG A3 guard).
 *
 * `voiceovers` can arrive in two shapes:
 *   1. Full `{ scenes: SceneVoiceover[]; ... }` (orchestrator path, modular
 *      path with on-disk WAVs).
 *   2. Slim fallback `{ voiceoverDriven, sceneCount, fallbackUsed }` with NO
 *      `scenes` array (modular CLI when the voice stage wrote no per-scene
 *      WAVs). The legacy `res.voiceovers.scenes[idx]` indexing threw
 *      `TypeError: Cannot read properties of undefined (reading '0')`.
 *
 * This helper defensively returns `undefined` for either the missing array or
 * a missing entry, so the caller falls back to a silent anullsrc track instead
 * of crashing the entire render. Exported for unit testing.
 */
export function sceneVoicePath(
    voiceovers: { scenes?: Array<{ audioPath?: string; sceneIndex?: number }> | null } | null | undefined,
    idx: number,
): string | undefined {
    // Match by sceneIndex when present (BUG M3): a missing/extra scene shifts
    // positional array indexing so the WRONG narration lands on a visual. The
    // entries carry their own sceneIndex, so key on that instead of position.
    const scenes = voiceovers?.scenes;
    if (!scenes) return undefined;
    const byIndex = scenes.find((s) => s && s.sceneIndex === idx);
    return (byIndex ?? scenes[idx])?.audioPath;
}

export async function renderAgenticSlideshow(
    res: PipelineResult,
    opts: {
        outPath?: string;
        crossfadeSec?: number;
        burnCaptions?: boolean;
        sfx?: boolean;
        transition?: string;
        preset?: string;
        kinetic?: boolean;
        kenBurns?: boolean;
        dimensions?: { w: number; h: number };
        captions?: 'burned' | 'karaoke' | 'none';
        captionTheme?: string;
        intro?: { title: string; subtitle?: string; durationSec?: number };
        titleCard?: { title: string; subtitle?: string; durationSec?: number };
        lowerThird?: string;
        endCta?: string;
        progressBar?: boolean;
        outro?: { ctaText: string; showSubscribe?: boolean; hashtags?: string[]; durationSec?: number };
        jCutSec?: number;
        exportAspects?: string[];
        emojiByScene?: Record<string, string>;
        // BUG W2-1: per-scene motion FX (previously compose.ts-only / video-only)
        shakeByScene?: Record<number, number>;
        punchInByScene?: Record<number, number>;
        parallaxDepthByScene?: Record<number, number>;
        speedRampByScene?: Record<number, number>;
        paletteFilter?: string;
        aiVerify?: import('../config.js').AgenticConfig['aiVerify'];
        languages?: string[];
        vignette?: boolean;
        brand?: { watermark?: string; accent?: string };
        /** Orientation/aspect HINTS for the output frame size. When
         *  `dimensions` is omitted, these drive the canonical W×H so a
         *  `square`/`landscape` job actually renders square/landscape
         *  instead of the legacy 720×1280 portrait default. Precedence
         *  mirrors compose.ts: aspect > orientation > portrait default. */
        orientation?: 'portrait' | 'landscape' | 'square';
        aspect?: '9:16' | '1:1' | '16:9' | 'square';
        /** When true, print the full ffmpeg command line to stderr before each invocation. */
        verbose?: boolean;
        /** When true, auto-detect the best available GPU encoder (nvenc/amf/qsv) for HW-accelerated encoding. */
        gpu?: boolean;
    } = {},
): Promise<string> {
    const ffmpeg: string = require('ffmpeg-static');
    const { execFile, spawn } = require('child_process');

    const FONT_FILE = (() => {
        const home = process.env.HOME || process.env.USERPROFILE || '';
        const candidates = [
            'C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/seguiemj.ttf',
            home && `${home}/Library/Fonts/Arial.ttf`,
            '/Library/Fonts/Arial.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        ].filter(Boolean) as string[];
        for (const c of candidates) if (fs.existsSync(c)) return c;
        return '';
    })();
    const FONT_ARG = FONT_FILE ? `fontfile='${FONT_FILE}':` : '';
    // BUG P2-2: captions with CJK (Chinese/Japanese/Korean) text rendered as
    // tofu boxes because the default Arial chain has no CJK glyphs. When the
    // text contains CJK codepoints, fall back to a CJK-capable font
    // (msyh.ttc on Windows, Noto CJK on Linux). .ttc collections need fontindex.
    const CJK_RE = /[぀-ヿ㐀-鿿\uF900-\uFAFF\u2F00-\u2FDF\u3000-\u303F\uFF00-\uFFEF]/;
    const CJK_FONT_WIN = 'C:/Windows/Fonts/msyh.ttc';
    const CJK_FONT_LINUX = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
    const CJK_FONT = process.platform === 'win32' ? CJK_FONT_WIN : CJK_FONT_LINUX;
    // BUG W3-1: multilingual captions in non-CJK scripts (Devanagari/Hindi,
    // Tamil, Arabic, etc.) rendered as tofu boxes because pickFontArg only
    // special-cased CJK. Nirmala UI (Windows) / Noto scripts (Linux) cover
    // these. Detect the codepoint ranges and fall back to a capable font.
    const INDIC_ARABIC_RE = /[஀-௿଀-୿ഀ-ിก-๛ༀ-༏က-ၿႀ-Ⴟ\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/;
    const SCRIPT_FONT_WIN = 'C:/Windows/Fonts/Nirmala.ttf';
    const SCRIPT_FONT_LINUX = '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf';
    const SCRIPT_FONT = process.platform === 'win32' ? SCRIPT_FONT_WIN : SCRIPT_FONT_LINUX;
    function pickFontArg(text: string): string {
        if (CJK_RE.test(text) && fs.existsSync(CJK_FONT)) {
            // NOTE: this ffmpeg build rejects drawtext `fontindex`, so just pass
            // the .ttc path directly — the first face renders CJK glyphs fine.
            const p = CJK_FONT.replace(/:/g, '\\:');
            return `fontfile='${p}':`;
        }
        if (INDIC_ARABIC_RE.test(text) && fs.existsSync(SCRIPT_FONT)) {
            const p = SCRIPT_FONT.replace(/:/g, '\\:');
            return `fontfile='${p}':`;
        }
        return FONT_ARG;
    }

    // ── GPU encoder detection (cached once per process via module-level var) ──
    let _gpuEncoder: string | undefined;
    function resolveGpuEncoder(): string {
        if (!opts.gpu) return 'libx264';
        if (_gpuEncoder !== undefined) return _gpuEncoder;
        try {
            const { execFileSync } = require('child_process');
            const encoders = execFileSync(ffmpeg, ['-encoders'], { timeout: 10000, encoding: 'utf8' }) as string;
            for (const enc of ['h264_nvenc', 'h264_amf', 'h264_qsv']) {
                if (encoders.includes(enc)) {
                    _gpuEncoder = enc;
                    logInfo(`  ⚡ GPU encoder detected: ${enc}`);
                    return enc;
                }
            }
        } catch {
            /* probe failed, fall through to libx264 */
        }
        _gpuEncoder = 'libx264';
        logInfo('  ℹ No HW encoder found, falling back to libx264 (CPU)');
        return 'libx264';
    }
    function gpuExtra(encoder: string): string[] {
        if (encoder === 'h264_nvenc') return ['-preset', 'p7'];
        if (encoder === 'h264_amf') return ['-quality', 'speed'];
        return [];
    }
    // Pre-resolve the GPU encoder once so every use site reads the cached value.
    const GPU_ENCODER = resolveGpuEncoder();
    const GPU_EXTRA = gpuExtra(GPU_ENCODER);
    const GPU_HWACCEL = opts.gpu ? ['-hwaccel', 'auto'] : [];

    const outDir = res.workspace.root + '/render';
    fs.mkdirSync(outDir, { recursive: true });
    const out = opts.outPath ?? outDir + '/' + res.workspace.jobId + '.mp4';
    // Ensure the destination directory exists — edit commands may write to
    // output/<id>/ which doesn't exist until a full pipeline run completes.
    try { fs.mkdirSync(path.dirname(out), { recursive: true }); } catch { /* ignore */ }
    if (!res.manifest)
        throw new Error('Cannot render: final gate did not produce a render manifest (gate.pass=' + res.gate.pass + ').');

    const visuals = res.manifest.assets.filter((a) => a.kind !== 'music');
    // FIX: scene lengths must follow the ACTUAL synthesized speech when a
    // voiceover exists. The plan's `durationSec` is a pre-voice ESTIMATE
    // (the agent planner defaults to 8s) — overriding with it truncated a
    // 16s narration to 8s and capped videos at half their script length.
    const voiceScenes = res.voiceovers?.scenes ?? [];
    for (const v of visuals) {
        const vs = voiceScenes.find((s) => s.sceneIndex === v.sceneIndex);
        if (vs) {
            if (vs.durationSec && vs.durationSec > 0) v.durationSec = vs.durationSec;
            // mirror orchestrator/pipeline.ts: attach the real voice track so
            // the audio mix actually contains the narration (without this,
            // modular-path renders were music-only, ~60s)
            if (vs.audioPath && fs.existsSync(vs.audioPath)) v.audioPath = vs.audioPath;
            if (vs.captionSegments?.length) v.captionSegments = vs.captionSegments;
            continue;
        }
        const sd = res.plan.scenes[v.sceneIndex] && res.plan.scenes[v.sceneIndex].durationSec;
        if (sd && sd > 0) v.durationSec = sd;
    }
    const music = res.manifest.assets.find((a) => a.kind === 'music');
    if (visuals.length === 0) throw new Error('No approved visuals to render.');

    const dims = opts.dimensions
        ?? resolveRenderDims(opts.orientation ?? (res.plan as any)?.orientation, opts.aspect);
    const CARD_W = dims.w, CARD_H = dims.h;
    const introClip = opts.intro ? outDir + '/_intro_' + res.workspace.jobId + '.mp4' : null;
    const outroClip = opts.outro ? outDir + '/_outro_' + res.workspace.jobId + '.mp4' : null;
    const makeCard = async (
        outPath: string, title: string, subtitle: string | undefined,
        dur: number, bg: string, fg: string,
    ): Promise<void> => {
        const t = ffmpegDrawtextEscape(title);
        const s = ffmpegDrawtextEscape(subtitle ?? '');
        const vf = [
            `color=c=${bg}:s=${CARD_W}x${CARD_H}:d=${dur}`,
            `drawtext=${FONT_ARG}text='${t}':fontcolor=${fg}:fontsize=58:box=1:boxcolor=${bg}@0.0:borderw=0:x=(w-text_w)/2:y=h/2-(text_h/2)${s ? `:fontsize=58` : ''}`,
            s ? `drawtext=${FONT_ARG}text='${s}':fontcolor=${fg}@0.8:fontsize=30:x=(w-text_w)/2:y=h/2+50` : '',
        ].filter(Boolean).join(',');
        await new Promise<void>((resolve, reject) => {
            execFile(ffmpeg, ['-f', 'lavfi', '-i', vf, '-t', String(dur), '-c:v', GPU_ENCODER, ...GPU_EXTRA, '-pix_fmt', 'yuv420p', '-y', outPath],
                (err: any, _stdout: string, stderr: string) =>
                    err ? reject(new Error('card render failed: ' + (stderr || '').trim())) : resolve());
        });
    };
    if (introClip)
        await makeCard(introClip, opts.intro!.title, opts.intro!.subtitle, opts.intro!.durationSec ?? 2.5, '#2563EB', '#ffffff');
    if (outroClip) {
        const cta = ffmpegDrawtextEscape(opts.outro?.ctaText || 'Subscribe');
        const tags = (opts.outro!.hashtags || []).join(' ');
        const sub = (opts.outro!.showSubscribe ? 'Subscribe for more' : '') +
            (tags ? (opts.outro!.showSubscribe ? '  ' : '') + tags : '');
        await makeCard(outroClip, cta, sub || undefined, opts.outro!.durationSec ?? 3, '#FF6B35', '#0a0a12');
    }
    const introInputIdx = introClip ? visuals.length : -1;
    const outroInputIdx = outroClip ? visuals.length + (introClip ? 1 : 0) : -1;

    const { computeStylePlan, gradeFilter, xfadeName } = await import('../ai/style-engine.js');
    const stylePlan = computeStylePlan(res.plan, { preset: (opts.preset as any) ?? 'cinematic', kinetic: opts.kinetic });

    // Apply per-scene overrides from the plan (user-supplied inline tags win over auto)
    for (const sc of stylePlan.scenes) {
        const scene = res.plan.scenes[sc.sceneIndex];
        if (scene?.transition) sc.transitionIn = scene.transition as any;
        if (scene?.grade) sc.grade = scene.grade as any;
        if (scene?.captionTheme !== undefined) sc.captionTheme = scene.captionTheme;
        if (scene?.sfx !== undefined) sc.sfx = scene.sfx;
        if (scene?.jCutSec !== undefined) sc.jCutSec = scene.jCutSec;
        if (scene?.vignette !== undefined) sc.vignette = scene.vignette;
        if (scene?.kineticText !== undefined) sc.kineticText = scene.kineticText;
        if (scene?.musicIntensity !== undefined) sc.musicIntensity = scene.musicIntensity;
    }

    const xf = opts.crossfadeSec ?? 0.5;
    const burn = opts.burnCaptions ?? true;

    const runFfmpegSpawn = (args: string[], totalSec = 0, sceneDurations?: number[]): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            if (opts.verbose) {
                console.error('[ffmpeg] ' + ffmpeg + ' ' + args.join(' '));
            }
            const cp = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
            let lastPct = -1;
            let buf = '';
            cp.stderr.on('data', (d: Buffer) => {
                buf += d.toString();
                const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(buf);
                if (m && totalSec > 0) {
                    const secs = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
                    const pct = Math.min(99, Math.round((secs / totalSec) * 100));
                    if (pct !== lastPct) {
                        lastPct = pct;
                        if (sceneDurations && sceneDurations.length > 1) {
                            // Compute which scene we're currently rendering
                            let accum = 0;
                            let sceneIdx = 0;
                            for (let i = 0; i < sceneDurations.length; i++) {
                                if (secs < accum + sceneDurations[i]) {
                                    sceneIdx = i;
                                    break;
                                }
                                accum += sceneDurations[i];
                            }
                            logInfo(`  · Scene ${sceneIdx + 1}/${sceneDurations.length} ${pct}%`);
                        } else {
                            logInfo(`  · render ${pct}%`);
                        }
                    }
                }
                if (buf.length > 4096) buf = buf.slice(-2048);
            });
            cp.on('error', (e: any) => reject(e));
            cp.on('close', (code: number) => {
                if (code === 0) return resolve();
                console.error('[ffmpeg stderr tail]\n' + buf.split('\n').slice(-25).join('\n'));
                reject(new Error('ffmpeg failed (exit ' + code + ')'));
            });
        });

    const srtRel = `${res.workspace.root}/render/_captions_${res.workspace.jobId}.srt`;
    const srtPath = path.resolve(process.cwd(), srtRel).replace(/\\/g, '/');
    let captionFile: string | null = null;
    if (burn) {
        const cues: string[] = [];
        let t = introClip ? (opts.intro!.durationSec ?? 2.5) : 0;
        let n = 1;
        for (const a of visuals) {
            const dur = a.durationSec ?? 4;
            const raw = a.captionSegments?.length
                ? a.captionSegments
                : [{ text: res.plan.scenes[a.sceneIndex]?.voiceoverText ?? '', startMs: 0, endMs: Math.round(dur * 1000) }];
            const segs = chunkCues(raw);
            for (const s of segs) {
                const start = t + s.startMs / 1000;
                const end = t + s.endMs / 1000;
                cues.push(`${n}\n${fmtSrt(start)} --> ${fmtSrt(end)}\n${s.text.replace(/\n/g, ' ')}\n`);
                n++;
            }
            t += dur;
        }
        if (cues.length) {
            fs.mkdirSync(path.dirname(srtPath), { recursive: true });
            fs.writeFileSync(srtPath, cues.join('\n'), 'utf8');
            captionFile = srtRel;
        }
    }

    const W = dims.w, H = dims.h;
    const sceneFilters = visuals.map((a, i) => {
        const dur = a.durationSec ?? 4;
        const sceneKb = res.plan.scenes[i]?.kenBurns;
        const doZoom = a.kind === 'image' && (sceneKb !== false ? opts.kenBurns !== false : false);
        const zoom = doZoom ? `,zoompan=z=min(zoom+0.0008\\\\\\\\,1.04):d=1:s=${W}x${H}` : '';
        const grade = gradeFilter(stylePlan.scenes[i]?.grade ?? 'neutral');
        const tag = '[' + i + ':v]';
        // ═══ Advanced editing (per-scene, additive) — mirrors visual-fx.ts ═══
        const adv: string[] = [];
        const sp = res.plan.scenes[i];
        if (sp) {
            if (sp.speed && sp.speed !== 1) adv.push(`setpts=${1 / sp.speed}*PTS`);
            if (sp.filter === 'bw') adv.push('format=gray');
            else if (sp.filter === 'vintage') adv.push('curves=vintage,saturation=1.2');
            else if (sp.filter === 'sepia') adv.push('sepia=0.8');
            if (sp.blur) adv.push('boxblur=10');
            if (sp.keyframes && sp.keyframes.length >= 2) {
                // Build a piecewise-linear zoom expr over time (ffmpeg eval).
                const sorted = [...sp.keyframes].sort((a, b) => a.t - b.t);
                let expr = `${sorted[sorted.length - 1].z}`;
                for (let k = sorted.length - 1; k >= 0; k--) {
                    expr = `if(lte(t\\,${sorted[k].t})\\,${sorted[k].z}\\,${expr})`;
                }
                adv.push(`zoompan=z='${expr}':d=${Math.round(dur * 25)}:s=${W}x${H}:fps=25`);
            }
        }
        // Chroma key runs LAST so later passes (captions/vignette) can't
        // re-inject the keyed-out green.
        const chromaStr = sp?.chromaKey ? ',colorkey=0x00FF00:0.5:0.2,format=yuv420p' : '';
        const advStr = adv.length ? ',' + adv.join(',') : '';
        return `${tag}scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,trim=duration=${dur},setpts=PTS-STARTPTS,settb=1/25${zoom}${advStr},${grade},format=yuv420p${chromaStr}[v${i}]`;
    });

    if (introClip)
        sceneFilters.push(`[${introInputIdx}:v]fps=25,trim=duration=${opts.intro!.durationSec ?? 2.5},setpts=PTS-STARTPTS,settb=1/25,format=yuv420p[vintro]`);
    if (outroClip)
        sceneFilters.push(`[${outroInputIdx}:v]fps=25,trim=duration=${opts.outro!.durationSec ?? 3},setpts=PTS-STARTPTS,settb=1/25,format=yuv420p[voutro]`);

    const orderedTags: string[] = [];
    const orderedDur: number[] = [];
    const durOf = (a: { sceneIndex: number; durationSec?: number }): number =>
        a.durationSec || (res.plan.scenes[a.sceneIndex] && res.plan.scenes[a.sceneIndex].durationSec) || 4;
    if (introClip) { orderedTags.push('vintro'); orderedDur.push(opts.intro!.durationSec ?? 2.5); }
    for (let i = 0; i < visuals.length; i++) { orderedTags.push('v' + i); orderedDur.push(durOf(visuals[i])); }
    if (outroClip) { orderedTags.push('voutro'); orderedDur.push(opts.outro!.durationSec ?? 3); }

    let videoChain: string;
    if (orderedTags.length === 1) {
        videoChain = '[' + orderedTags[0] + ']';
    } else {
        let prev = orderedTags[0];
        let cursor = orderedDur[0];
        for (let i = 1; i < orderedTags.length; i++) {
            const cur = orderedTags[i];
            const isCard = prev === 'vintro' || cur === 'voutro';
            const tk: any = isCard ? 'fade' : (stylePlan.scenes[i - (introClip ? 1 : 0)]?.transitionIn ?? 'fade');
            const outTag = i === orderedTags.length - 1 ? 'vout' : 'vx' + i;
            if (tk === 'cut') {
                sceneFilters.push(`[${prev}][${cur}]concat=n=2:v=1:a=0,settb=1/25,fps=25[${outTag}]`);
                cursor += orderedDur[i];
            } else {
                const xname = xfadeName(tk);
                const off = Math.max(0, cursor - xf);
                sceneFilters.push(`[${prev}][${cur}]xfade=transition=${xname}:duration=${xf}:offset=${off}[${outTag}]`);
                cursor = cursor + orderedDur[i] - xf;
            }
            prev = outTag;
        }
        videoChain = '[vout]';
    }

    const videoInputs = visuals.flatMap((v) =>
        v.kind === 'image' ? ['-loop', '1', '-i', v.localPath] : ['-i', v.localPath],
    );
    if (introClip) videoInputs.push('-i', introClip);
    if (outroClip) videoInputs.push('-i', outroClip);
    const vfArgs = [...sceneFilters];
    let videoMap = videoChain;

    if (captionFile) {
        let ctag = videoChain;
        let ci = 0;
        let tBase = 0;
        for (const a of visuals) {
            const dur = a.durationSec ?? 4;
            const scText = (res.plan.scenes[a.sceneIndex] && (res.plan.scenes[a.sceneIndex].captionText ?? res.plan.scenes[a.sceneIndex].voiceoverText)) || '';
            // Per-scene caption theme wins over the global opts.captionTheme.
            const sceneCaptionTheme = stylePlan.scenes[a.sceneIndex]?.captionTheme ?? opts.captionTheme;
            const theme = resolveCaptionTheme(sceneCaptionTheme);
            const { fontcolor: capColor, fontsize: baseSize, boxArgs, yExpr } = captionThemeToDrawtext(theme);
            if (opts.captions === 'karaoke') {
                const words = wordTimingsFromScript(scText, dur);
                for (const wseg of words) {
                    const start = (tBase + wseg.startMs / 1000).toFixed(2);
                    const end = (tBase + wseg.endMs / 1000).toFixed(2);
                    const safe = ffmpegDrawtextEscape(wseg.word);
                    const out = `c${ci}`;
                    vfArgs.push(`${ctag}drawtext=${pickFontArg(safe)}text='${safe}':fontcolor=yellow:fontsize=38:box=1:boxcolor=black@0.55:boxborderw=12:x=(w-text_w)/2:y=h-text_h-140:enable='between(t\\,${start},${end})'[${out}]`);
                    ctag = `[${out}]`;
                    ci++;
                }
            } else {
                const segs = a.captionSegments?.length
                    ? mergeWordsToLines(a.captionSegments)
                    : [{ text: scText, startMs: 0, endMs: Math.round(dur * 1000) }];
                for (const s of segs) {
                    const start = (tBase + s.startMs / 1000).toFixed(2);
                    const end = (tBase + s.endMs / 1000).toFixed(2);
                    const lines = wrapCaptionLines(s.text, W, baseSize);
                    const lineH = Math.round(baseSize * 1.3);
                    lines.forEach((ln, li) => {
                        const safe = ffmpegDrawtextEscape(ln).replace(/\n/g, ' ');
                        const out = `c${ci}`;
                        const y = li === 0 ? yExpr : `(${yExpr})-${li * lineH}`;
                        vfArgs.push(`drawtext=${pickFontArg(safe)}text='${safe}':fontcolor=${capColor}:fontsize=${baseSize}${boxArgs}:line_spacing=4:x=(w-text_w)/2:y=${y}:enable='between(t\\,${start}\\,${end})'`);
                        ctag = `[${out}]`;
                        ci++;
                    });
                }
            }
            tBase += Math.max(0, dur);
        }
        videoMap = ctag;
    }

    if (stylePlan && opts.kinetic !== false && opts.captions === 'none') {
        let t = introClip ? (opts.intro!.durationSec ?? 2.5) : 0;
        const sceneStarts = visuals.map((a) => {
            const s = t;
            t += Math.max(0, (a.durationSec ?? 4) - xf);
            return s;
        });
        let ktag = videoMap;
        for (let i = 0; i < visuals.length; i++) {
            const base = sceneStarts[i];
            for (const cue of stylePlan.scenes[i]?.kinetic ?? []) {
                const start = (base + cue.atSec).toFixed(2);
                const end = (base + cue.atSec + (cue.kind === 'wordpop' ? 0.9 : 2.6)).toFixed(2);
                const safe = String(cue.text ?? '').replace(/'/g, '’').replace(/:/g, '\\:');
                if (cue.kind === 'lowerthird') {
                    vfArgs.push(`${ktag}drawtext=${pickFontArg(safe)}text='${safe}':fontcolor=white:fontsize=34:box=1:boxcolor=black@0.45:boxborderw=12:x=(w-text_w)/2:y=h-text_h-90:enable='between(t\\,${start},${end})'[k${i}]`);
                } else {
                    vfArgs.push(`${ktag}drawtext=${pickFontArg(safe)}text='${safe}':fontcolor=yellow:fontsize=64:box=1:boxcolor=black@0.0:borderw=3:bordercolor=yellow:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t\\,${start},${end})'[k${i}]`);
                }
                ktag = `[k${i}]`;
            }
        }
        if (ktag !== videoMap) { videoMap = ktag; }
    }
    // Vignette is a single global filter, so a per-scene [Vignette: off] disables
    // it for the whole video; [Vignette: on] can't re-enable if globally off.
    const doVignette = opts.vignette !== false && !stylePlan.scenes.some((s) => s.vignette === false);
    if (doVignette) vfArgs.push(`${videoMap}vignette=PI/5[vig]`);
else vfArgs.push(`${videoMap}null[vig]`);
    videoMap = '[vig]';

    const voScenes = visuals.filter((a) => a.audioPath && fs.existsSync(a.audioPath));
    let audioInputArgs: string[] = [];
    let audioFilter: string | null = null;
    let audioMap: string[] = [];
    const defaultJCut = opts.jCutSec && opts.jCutSec > 0 ? opts.jCutSec : 0;
    if (voScenes.length > 0) {
        audioInputArgs = voScenes.flatMap((a) => ['-i', a.audioPath!]);
        const videoInputCount = visuals.length + (introClip ? 1 : 0) + (outroClip ? 1 : 0);
        const base = videoInputCount;
        const introDur = introClip ? (opts.intro!.durationSec ?? 2.5) : 0;
        const delayed: string[] = [];
        voScenes.forEach((_, i) => {
            // Per-scene [JCut:] overrides the global jCutSec for this scene.
            const sc = stylePlan.scenes[visuals[i].sceneIndex];
            const jCut = (sc?.jCutSec && sc.jCutSec > 0 ? sc.jCutSec : defaultJCut);
            const picStart = introDur + offsetFor(visuals, i, xf);
            const audioStart = Math.max(0, picStart - (i === 0 ? 0 : jCut));
            delayed.push(`[${base + i}:a]adelay=delays=${(audioStart * 1000).toFixed(0)}:all=1[a${i}]`);
        });
        const mix = delayed.map((_, i) => `[a${i}]`).join('') +
            `amix=inputs=${voScenes.length}:duration=longest:normalize=0[aout];[aout]apad[aout2];[aout2]alimiter=limit=0.7:asc=1:level=disabled[aout]`;
        audioFilter = [...delayed, mix].join(';');
        audioMap = ['-map', '[aout]'];
    }

    const segmented = process.env.AGENTIC_SEGMENTED !== '0';
    let silent: string;
    let expectedDur = 0;
    if (segmented) {
        const introDur = introClip ? (opts.intro!.durationSec ?? 2.5) : 0;
        const outroDur = outroClip ? (opts.outro!.durationSec ?? 3) : 0;
        const scenesDur = visuals.reduce((s, a) => s + (a.durationSec ?? 4), 0);
        const segFiles: string[] = [];
        const ordered: { file: string; dur: number; kind: 'card' | 'scene'; idx: number }[] = [];
        if (introClip) ordered.push({ file: introClip, dur: introDur, kind: 'card', idx: -1 });
        visuals.forEach((a, i) =>
            ordered.push({
                file: a.localPath,
                dur: a.durationSec ?? res.plan.scenes[i]?.durationSec ?? 4,
                kind: 'scene', idx: i,
            }),
        );
        if (outroClip) ordered.push({ file: outroClip, dur: outroDur, kind: 'card', idx: -1 });
        expectedDur = Math.max(0.1, introDur + visuals.reduce((s, a) => s + (a.durationSec ?? 4), 0) + outroDur);
        for (let ci = 0; ci < ordered.length; ci++) {
            const clip = ordered[ci];
            const seg = outDir + '/_seg_' + res.workspace.jobId + '_' + ci + '.mp4';
            const dur = clip.dur;
            const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(clip.file);
            const sceneKb = clip.kind === 'scene' ? res.plan.scenes[clip.idx]?.kenBurns : undefined;
            const doZoom = clip.kind === 'scene' && !isVideo && (sceneKb !== false ? opts.kenBurns !== false : false);
            // BUG C3: with a tpad-cloned 25fps stream + d=1 the `zoom` variable
            // resets every input frame, so zoom+0.0008 never accumulates
            // (static image). Drive the zoom off `time` instead and anchor at
            // the center so the Ken Burns drift is actually visible.
            const zoom = doZoom ? `,zoompan=z='1+0.04*time':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=25` : '';
            const grade = clip.kind === 'scene' ? gradeFilter(stylePlan.scenes[clip.idx]?.grade ?? 'neutral') : '';
            const segCaptionArg: string[] = [];
            if (clip.kind === 'scene' && burn) {
                const a = visuals[clip.idx];
                const raw = a.captionSegments?.length
                    ? a.captionSegments
                    : [{ text: res.plan.scenes[a.sceneIndex]?.captionText ?? res.plan.scenes[a.sceneIndex]?.voiceoverText ?? '', startMs: 0, endMs: Math.round(dur * 1000) }];
                const lines = mergeWordsToLines(raw);
                const theme = resolveCaptionTheme(stylePlan.scenes[clip.idx]?.captionTheme ?? opts.captionTheme);
                const { fontcolor: capColor, fontsize: baseSize, boxArgs, yExpr: defaultY } = captionThemeToDrawtext(theme);
                // Per-scene caption style/color overrides from inline tags
                const sceneStyle = clip.kind === 'scene' ? res.plan.scenes[clip.idx]?.captionStyle : undefined;
                const sceneColor = clip.kind === 'scene' ? res.plan.scenes[clip.idx]?.captionColor : undefined;
                const yExpr = sceneStyle === 'top' ? 'h/10' : sceneStyle === 'center' ? '(h-text_h)/2' : defaultY;
                const fontColor = sceneColor ?? capColor;
                for (const s of lines) {
                    const start = (s.startMs / 1000).toFixed(2);
                    const end = (s.endMs / 1000).toFixed(2);
                    const wrapped = wrapCaptionLines(s.text, W, baseSize);
                    const lineH = Math.round(baseSize * 1.3);
                    wrapped.forEach((ln, li) => {
                        const safe = ffmpegDrawtextEscape(ln).replace(/\n/g, ' ');
                        const y = li === 0 ? yExpr : `(${yExpr})-${li * lineH}`;
                        segCaptionArg.push(`drawtext=${pickFontArg(safe)}text='${safe}':fontcolor=${fontColor}:fontsize=${baseSize}${boxArgs}:line_spacing=4:x=(w-text_w)/2:y=${y}:enable='between(t\\,${start}\\,${end})'`);
                    });
                }
            }
            const kin: string[] = [];
            // BUG C4: emojiByScene was a dead option on this path — burn a big
            // emoji sticker (Segoe UI Emoji renders color glyphs on Windows).
            if (clip.kind === 'scene' && opts.emojiByScene) {
                const em = opts.emojiByScene[String(clip.idx)];
                if (em) {
                    const emojiFont = process.platform === 'win32' ? 'C\\:/Windows/Fonts/seguiemj.ttf' : '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf';
                    kin.push(`drawtext=fontfile='${emojiFont}':text='${em}':fontsize=96:x=w-text_w-40:y=40`);
                }
            }
            if (clip.kind === 'scene' && stylePlan && opts.kinetic !== false && opts.captions === 'none') {
                for (const cue of stylePlan.scenes[clip.idx]?.kinetic ?? []) {
                    const start = cue.atSec.toFixed(2);
                    const end = (cue.atSec + (cue.kind === 'wordpop' ? 0.9 : 2.6)).toFixed(2);
                    const safe = String(cue.text ?? '').replace(/'/g, '’').replace(/:/g, '\\:');
                    kin.push(`drawtext=${pickFontArg(safe)}text='${safe}':fontcolor=${cue.kind === 'wordpop' ? 'yellow' : 'white'}:fontsize=${cue.kind === 'wordpop' ? 64 : 34}:box=1:boxcolor=black@0.45:boxborderw=12:x=(w-text_w)/2:y=${cue.kind === 'wordpop' ? '(h-text_h)/2' : 'h-text_h-90'}:enable='between(t\\,${start},${end})'`);
                }
            }
            // ═══ Advanced editing (per-scene, additive) — segment branch ═══
            const sp = clip.kind === 'scene' ? res.plan.scenes[clip.idx] : undefined;
            const doVignette = opts.vignette !== false && !sp?.chromaKey;
            const segAdv: string[] = [];
            if (sp) {
                if (sp.speed && sp.speed !== 1) segAdv.push(`setpts=${1 / sp.speed}*PTS`);
                if (sp.filter === 'bw') segAdv.push('format=gray');
                else if (sp.filter === 'vintage') segAdv.push('curves=vintage,eq=saturation=1.2');
                else if (sp.filter === 'sepia') segAdv.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
                if (sp.blur) segAdv.push('boxblur=10');
                if (sp.keyframes && sp.keyframes.length >= 2) {
                    const sorted = [...sp.keyframes].sort((a, b) => a.t - b.t);
                    // BUG C1: zoompan's eval has no `t` variable (use `time`),
                    // and `\\,` escaping inside z='...' reaches ffmpeg's eval as
                    // a literal backslash → parse error. Plain commas inside the
                    // quoted expr are legal.
                    let expr = `${sorted[sorted.length - 1].z}`;
                    for (let k = sorted.length - 1; k >= 0; k--) expr = `if(lte(time,${sorted[k].t}),${sorted[k].z},${expr})`;
                    segAdv.push(`zoompan=z='${expr}':d=1:s=${W}x${H}:fps=25`);
                }
            }
            // BUG W2-1: shakeByScene / punchInByScene / parallaxDepthByScene /
            // speedRampByScene were only consumed by compose.ts (advanced-fx.ts) on
            // the VIDEO-only pre-process path; on the CLI segmented render path they
            // were silently dropped (image assets were explicitly skipped). Apply
            // them here as filtergraph strings so they work on BOTH images and
            // videos, uniformly, on the production render path.
            if (clip.kind === 'scene') {
                const si = clip.idx;
                const shake = opts.shakeByScene?.[si];
                if (shake) {
                    const amp = Math.max(1, Math.round(Math.min(1, Number(shake)) * 20)); // 1..20 px
                    segAdv.push(`scale=${W + amp * 2}:${H + amp * 2}:force_original_aspect_ratio=increase,crop=${W}:${H}:x='${amp}+${amp}*sin(n/7)*sin(n/3)':y='${amp}+${amp}*cos(n/9)*cos(n/5)'`);
                }
                const punch = opts.punchInByScene?.[si];
                if (punch && punch !== 1) {
                    // animate a subtle zoom-in (scale up then settle) via zoompan
                    const z = Math.max(1.05, Number(punch));
                    segAdv.push(`zoompan=z='min(${z}\\,1+0.05*time)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=25`);
                }
                const par = opts.parallaxDepthByScene?.[si];
                if (par && par !== 0) {
                    // horizontal pan: shift the frame left/right across the clip
                    const px = Math.round(Math.min(0.3, Math.abs(Number(par))) * W);
                    segAdv.push(`crop=${W}:${H}:x='${px}*sin(2*PI*t/${Math.max(0.1, dur).toFixed(2)})':y=0`);
                }
                const ramp = opts.speedRampByScene?.[si];
                if (ramp && ramp !== 1) {
                    segAdv.push(`setpts=PTS/${Number(ramp).toFixed(3)},minterpolate=fps=25:mi_mode=blend`);
                }
            }
            // BUG W2-1 (SAR fix): motion FX filters (scale/crop/zoompan) reset the
            // sample aspect ratio after the early setsar=1 in the base chain, which
            // produced SAR 12160:12159 and broke downstream concat (G70 class).
            // Re-pin SAR=1 at the very end of the segment filter chain.
            const segAdvStr = segAdv.length ? ',' + segAdv.join(',') + ',setsar=1' : '';
            const capStr = segCaptionArg.length ? ',' + segCaptionArg.join(',') : '';
            const kinStr = kin.length ? ',' + kin.join(',') : '';
            const gradeStr = grade ? ',' + grade : '';
            // BUG A2/combo: paletteFilter (job-wide color grade) was never
            // applied on the modular render path. Append it to every scene.
            const paletteStr = opts.paletteFilter ? buildPaletteFilter(opts.paletteFilter) : '';
            const gradeWithPalette = (gradeStr + (paletteStr ? ',' + paletteStr : '')) || '';
            let vfChain: string;
            if (sp?.chromaKey) {
                // Chroma key: key the scene to TRANSPARENT (rgba) then composite over
                // a black background via overlay. Just discarding alpha with
                // format=yuv420p would reveal the original green underneath.
                const base = `[0:v]tpad=stop_mode=clone:stop_duration=${dur},fps=25,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=${dur},setpts=PTS-STARTPTS,settb=1/25${zoom}${segAdvStr}${gradeWithPalette},format=rgba,colorkey=0x00FF00:0.3:0.2[fg]`;
                vfChain = `color=c=black:s=${W}x${H}:r=25:d=${dur},settb=1/25[bg];${base};[bg][fg]overlay=shortest=1,format=yuv420p${capStr}${kinStr}[v]`;
            } else {
                vfChain = `[0:v]tpad=stop_mode=clone:stop_duration=${dur},fps=25,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=${dur},setpts=PTS-STARTPTS,settb=1/25${zoom}${doVignette ? ',vignette=PI/5' : ''}${segAdvStr}${gradeWithPalette},format=yuv420p${capStr}${kinStr}[v]`;
            }
            // GUARD (BUG A3): `voiceovers` may be a slim fallback shape
            // (e.g. {voiceoverDriven, sceneCount, fallbackUsed} written by the
            // modular CLI when no per-scene WAVs exist) with NO `scenes` array.
            // The naive `res.voiceovers?.scenes[clip.idx]` throws
            // "Cannot read properties of undefined (reading '0')". Use the
            // optional chain on `.scenes` so a missing array yields undefined
            // (→ silent anullsrc track) instead of crashing the whole render.
            const voPath = clip.kind === 'scene' ? sceneVoicePath(res.voiceovers, clip.idx) : undefined;
            const hasVo = !!voPath && fs.existsSync(voPath);
            const inputs: string[] = ['-i', clip.file];
            if (hasVo) inputs.push('-i', voPath);
            else inputs.push('-f', 'lavfi', '-i', `anullsrc=channel_layout=mono:sample_rate=44100`);
            const afBase = hasVo
                ? `aresample=44100,atrim=0:${dur},asetpts=PTS-STARTPTS,alimiter=limit=0.7:asc=1:level=disabled`
                : `atrim=0:${dur},asetpts=PTS-STARTPTS`;
            // Per-scene audio fade from inline tags
            const fadeInDur = clip.kind === 'scene' ? res.plan.scenes[clip.idx]?.fadeIn : undefined;
            const fadeOutDur = clip.kind === 'scene' ? res.plan.scenes[clip.idx]?.fadeOut : undefined;
            let fadeFilter = '';
            if (fadeInDur && fadeInDur > 0) fadeFilter += `,afade=t=in:st=0:d=${fadeInDur}`;
            if (fadeOutDur && fadeOutDur > 0) fadeFilter += `,afade=t=out:st=${Math.max(0, dur - fadeOutDur)}:d=${fadeOutDur}`;
            const volOverride = clip.kind === 'scene' ? res.plan.scenes[clip.idx]?.volumeOverride : undefined;
const volFilter = volOverride && volOverride > 0 && volOverride !== 1 ? `,volume=${volOverride}` : '';
const af = `[1:a]${afBase}${fadeFilter}${volFilter}[a]`;
            const fc = vfChain + ';' + af;
            const args: string[] = [
                ...GPU_HWACCEL, ...inputs, '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
                '-t', String(dur), '-c:v', GPU_ENCODER, ...GPU_EXTRA, '-pix_fmt', 'yuv420p', '-r', '25',
                '-c:a', 'aac', '-b:a', '192k', '-y', seg,
            ];
            let lastErr: any;
            let segOk = false;
            for (let attempt = 0; attempt < 3; attempt++) {
                try { await runFfmpegSpawn(args, dur); segOk = true; break; }
                catch (e) { lastErr = e; console.warn(`⚠ segment ${ci} attempt ${attempt + 1} failed, retrying`); }
            }
            // BUG C2: a failed ffmpeg run can leave a headerless/0-byte file
            // behind, so existsSync alone let a hard per-scene failure become a
            // silent content drop at concat. Require success + a plausible size.
            const segSize = fs.existsSync(seg) ? fs.statSync(seg).size : 0;
            if (!segOk || segSize < 2048) {
                throw lastErr ?? new Error(`segment ${ci} failed (size=${segSize}) — aborting render instead of silently dropping the scene`);
            }
            segFiles.push(seg);
        }
        const list = outDir + '/_concat_' + res.workspace.jobId + '.txt';
        fs.writeFileSync(list, segFiles.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
        silent = outDir + '/_av_' + res.workspace.jobId + '.mp4';
        await new Promise<void>((resolve, reject) => {
            // `-fflags +genpts` regenerates PTS so the concat demuxer with
            // `-c copy` does not silently drop/truncate frames at segment
            // boundaries when timestamps are non-monotonic (the classic
            // concat-copy pitfall). Segments are all libx264/yuv420p/25fps so
            // stream-copy is safe once timestamps are normalized.
            const concatArgs = ['-fflags', '+genpts', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent];
            if (opts.verbose) {
                console.error('[ffmpeg concat] ' + ffmpeg + ' ' + concatArgs.join(' '));
            }
            execFile(ffmpeg, concatArgs, (err: any) =>
                err ? reject(new Error('concat failed: ' + err)) : resolve());
        });
        // BUG (cleanup leak): _seg_* intermediates and the _concat_*.txt list are
        // created per render but never removed. Clean them up now that concat is done.
        for (const seg of segFiles) try { fs.rmSync(seg, { force: true }); } catch { /* ignore */ }
        try { fs.rmSync(list, { force: true }); } catch { /* ignore */ }
    } else {
        const introDur = introClip ? (opts.intro!.durationSec ?? 2.5) : 0;
        const outroDur = outroClip ? (opts.outro!.durationSec ?? 3) : 0;
        const scenesDur = visuals.reduce((s, a) => s + (a.durationSec ?? 4), 0);
        const xfadeTransitions = orderedTags.length - 1;
        const xfadeOverlap = xfadeTransitions * xf;
        const totalSec = Math.max(1, introDur + scenesDur + outroDur - xfadeOverlap);
        expectedDur = totalSec;
        silent = outDir + '/_av_' + res.workspace.jobId + '.mp4';
        // Same ENAMETOOLONG guard as compose.ts applyOverlays: the full-chain
        // filter graph (xfade × scenes + per-word kinetic captions + audio) can
        // exceed the Windows 32,767-char command line. Feed it via
        // -filter_complex_script so length is not a limit, and clean up after.
        const fcScript = path.join(outDir, `_fc_${res.workspace.jobId}.txt`);
        fs.writeFileSync(fcScript, [...vfArgs, ...(audioFilter ? [audioFilter] : [])].join(';'));
        const pass1: string[] = [
            ...GPU_HWACCEL, ...videoInputs, ...audioInputArgs,
            '-filter_complex_script', fcScript,
            '-map', videoMap, ...(audioMap.length ? audioMap : []),
            '-c:v', GPU_ENCODER, ...GPU_EXTRA, '-pix_fmt', 'yuv420p', '-r', '25',
            ...(audioMap.length ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']),
            '-t', totalSec.toFixed(2), '-y', silent,
        ];
        if (process.env.DEBUG_FF) {
            console.error('FILTER_COMPLEX:\n' + [...vfArgs, ...(audioFilter ? [audioFilter] : [])].join(';\n'));
        }
        const sceneDurations = visuals.map((a: any) => a.durationSec ?? 4);
        try {
            await runFfmpegSpawn(pass1, totalSec, sceneDurations);
        } finally {
            try { fs.rmSync(fcScript, { force: true }); } catch { /* ignore */ }
        }
    }

    // BUG W1-1: global overlays (titleCard / lowerThird / endCta / progressBar)
    // were forwarded into the render opts but NEVER burned on the modular CLI
    // path — only compose.ts handled them, so the standard `render` command
    // silently dropped them. Apply them here as ONE post-process pass on the
    // fully-concatenated `silent` video. Doing it post-concat (not per-segment
    // and not in the non-segmented-only vfArgs) guarantees the overlays survive
    // BOTH render branches and span the whole timeline correctly.
    {
        const introDur = opts.intro?.durationSec ?? (introClip ? (opts.intro?.durationSec ?? 2.5) : 0);
        const outroDur = opts.outro?.durationSec ?? (outroClip ? (opts.outro?.durationSec ?? 3) : 0);
        const totalDur = introDur + visuals.reduce((s, a) => s + (a.durationSec ?? 4), 0) + outroDur;
        const ol: string[] = [];
        const safeEsc = (t: string) => ffmpegDrawtextEscape(t).replace(/\\n/g, ' ');
        if (opts.titleCard && opts.titleCard.title) {
            const tcDur = opts.titleCard.durationSec ?? 3;
            const tcEnable = `lte(t\\,${tcDur})`;
            const title = safeEsc(opts.titleCard.title);
            ol.push(`drawtext=${FONT_ARG}text='${title}':fontcolor=white:fontsize=64:box=1:boxcolor=black@0.45:boxborderw=16:x=(w-text_w)/2:y=h/2-40:enable='${tcEnable}'`);
            if (opts.titleCard.subtitle) {
                const sub = safeEsc(opts.titleCard.subtitle);
                ol.push(`drawtext=${FONT_ARG}text='${sub}':fontcolor=white@0.85:fontsize=32:box=1:boxcolor=black@0.45:boxborderw=12:x=(w-text_w)/2:y=h/2+20:enable='${tcEnable}'`);
            }
        }
        if (opts.lowerThird) {
            const lt = safeEsc(opts.lowerThird);
            ol.push(`drawtext=${FONT_ARG}text='${lt}':fontcolor=white:fontsize=36:box=1:boxcolor=black@0.5:boxborderw=12:x=40:y=h-text_h-50`);
        }
        if (opts.endCta) {
            const ctaStart = Math.max(0, totalDur - 4);
            const cta = safeEsc(opts.endCta);
            ol.push(`drawtext=${FONT_ARG}text='${cta}':fontcolor=yellow:fontsize=48:box=1:boxcolor=black@0.55:boxborderw=14:x=(w-text_w)/2:y=h/2:enable='gte(t\\,${ctaStart})'`);
        }
        if (opts.progressBar) {
            const barH = 8;
            ol.push(`drawbox=x=0:y=h-${barH}:w='iw*(t/${totalDur.toFixed(2)})':h=${barH}:color=white@0.8:t=fill:enable='gt(t\\,0)'`);
        }
        if (ol.length) {
            const ovOut = outDir + '/_av_ol_' + res.workspace.jobId + '.mp4';
            const ovArgs = [
                ...GPU_HWACCEL, '-i', silent,
                '-vf', ol.join(','),
                '-c:v', GPU_ENCODER, ...GPU_EXTRA, '-pix_fmt', 'yuv420p', '-r', '25',
                '-c:a', 'copy', '-y', ovOut,
            ];
            try {
                await runFfmpegSpawn(ovArgs, totalDur);
                if (fs.existsSync(ovOut) && fs.statSync(ovOut).size > 2048) {
                    try { fs.rmSync(silent, { force: true }); } catch { /* ignore */ }
                    silent = ovOut;
                } else {
                    console.warn('⚠ global-overlay pass produced no usable file; keeping base render');
                }
            } catch (e: any) {
                console.warn('⚠ global-overlay pass failed (' + (e?.message ?? e) + '); keeping base render');
            }
        }
    }

    let sfxLayer: string | null = null;
    // BUG M5 (partial): SFX used to be gated on music being present; cut SFX
    // are independent of the music bed, so build the layer whenever sfx is on.
    if (opts.sfx) {
        try {
            const { planSceneSfx } = await import('../media/sfx-selector.js');
            const sfxPlans = planSceneSfx(res.plan);
            sfxLayer = await buildSfxLayer(ffmpeg, res.plan, visuals, sfxPlans, outDir);
        } catch { sfxLayer = null; }
    }
    if (music && fs.existsSync(music.localPath)) {
        const duck = parseFloat(process.env.AUDIO_DUCK_LEVEL ?? '0.06');
        const full = parseFloat(process.env.AUDIO_FULL_LEVEL ?? '0.18');
        // Per-scene [MusicIntensity:] maps to duck depth: calm=deeper duck (music quieter),
        // energetic=shallower duck (music louder). Default uses the global duck level.
        const MUSIC_INTENSITY_DUCK: Record<string, number> = { calm: 0.04, mid: 0.06, energetic: 0.10 };
        const duckForScene = (sceneIndex: number): number => {
            const mi = stylePlan.scenes[sceneIndex]?.musicIntensity;
            return mi ? (MUSIC_INTENSITY_DUCK[mi] ?? duck) : duck;
        };
        const duckExpr = buildDuckExpression(visuals, full, duck, duckForScene);
        const volFilter = duckExpr ? `volume=eval=frame:volume='${duckExpr}'` : `volume=${full}`;
        const inputs: string[] = ['-i', silent, '-i', music.localPath];
        // GUARD (BUG #4 class): `silent` is audio-less when no scene had a
        // voiceover (voScenes empty → pass1 used -an). Referencing `[0:a]` in the
        // amix then throws "Stream specifier ':a' matches no streams" and the
        // render dies even though music was requested. Probe the silent video
        // and, when it has no audio, mux the music (± sfx) ALONE.
        let silentHasAudio = false;
        try {
            const { execFileSync } = require('child_process');
            const ffprobeBin = require('ffprobe-static').path;
            const pr = execFileSync(ffprobeBin, ['-v', 'quiet', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', silent], { timeout: 15000 }).toString();
            silentHasAudio = pr.trim().length > 0;
        } catch { /* best effort */ }
        let fc: string;
        if (silentHasAudio) {
            fc = `[1:a]${volFilter}[a]`;
            if (sfxLayer && fs.existsSync(sfxLayer)) {
                inputs.push('-i', sfxLayer);
                fc += `;[2:a]volume=0.6[sfx];[0:a][a][sfx]amix=inputs=3:duration=shortest[amixout];[amixout]alimiter=limit=0.7:asc=1:level=disabled[aout]`;
            } else {
                fc += `;[0:a][a]amix=inputs=2:duration=shortest[amixout];[amixout]alimiter=limit=0.7:asc=1:level=disabled[aout]`;
            }
        } else {
            // No voiceover audio in the silent track — just play the music (±sfx).
            if (sfxLayer && fs.existsSync(sfxLayer)) {
                inputs.push('-i', sfxLayer);
                fc = `[1:a]${volFilter}[a];[2:a]volume=0.6[sfx];[a][sfx]amix=inputs=2:duration=shortest[amixout];[amixout]alimiter=limit=0.7:asc=1:level=disabled[aout]`;
            } else {
                fc = `[1:a]${volFilter}[a];[a]alimiter=limit=0.7:asc=1:level=disabled[aout]`;
            }
        }
        const pass2 = [
            ...inputs, '-filter_complex', fc,
            '-map', '0:v:0', '-map', '[aout]',
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-y', out,
        ];
        if (process.env.DEBUG_FF) {
            console.error('PASS2_INPUTS:\n' + inputs.join('\n'));
            console.error('PASS2_FILTER_COMPLEX:\n' + fc);
        }
        try {
            await runFfmpegSpawn(pass2);
        } catch (e) {
            // Graceful fallback: this ffmpeg build (gyan.dev Windows) crashes
            // (ENOMEM) on volume=eval=frame+between() over real audio, so duck
            // to a flat volume instead. The render still completes.
            console.warn(`ℹ music duck expression unsupported on this ffmpeg build; using flat volume`);
            const flatFc = sfxLayer && fs.existsSync(sfxLayer)
                ? silentHasAudio
                    ? `[1:a]volume=${full}[a];[2:a]volume=0.6[sfx];[0:a][a][sfx]amix=inputs=3:duration=shortest[amixout];[amixout]alimiter=limit=0.7:asc=1:level=disabled[aout]`
                    : `[1:a]volume=${full}[a];[2:a]volume=0.6[sfx];[a][sfx]amix=inputs=2:duration=shortest[amixout];[amixout]alimiter=limit=0.7:asc=1:level=disabled[aout]`
                : silentHasAudio
                    ? `[1:a]volume=${full}[a];[0:a][a]amix=inputs=2:duration=shortest[amixout];[amixout]alimiter=limit=0.7:asc=1:level=disabled[aout]`
                    : `[1:a]volume=${full}[a];[a]alimiter=limit=0.7:asc=1:level=disabled[aout]`;
            const flatPass2 = [...inputs, '-filter_complex', flatFc, '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-y', out];
            await runFfmpegSpawn(flatPass2);
        }
        fs.rmSync(silent, { force: true });
        if (sfxLayer) fs.rmSync(sfxLayer, { force: true });
    } else if (sfxLayer && fs.existsSync(sfxLayer)) {
        // No music, but SFX requested: mix the cut-SFX layer over the silent
        // track's own audio (or alone when the video has no audio stream).
        let vidHasAudio = false;
        try {
            const { execFileSync } = require('child_process');
            const ffprobeBin = require('ffprobe-static').path;
            const pr = execFileSync(ffprobeBin, ['-v', 'quiet', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', silent], { timeout: 15000 }).toString();
            vidHasAudio = pr.trim().length > 0;
        } catch { /* best effort */ }
        const fcS = vidHasAudio
            ? `[1:a]volume=0.6[sfx];[0:a][sfx]amix=inputs=2:duration=shortest[amixout];[amixout]alimiter=limit=0.7:asc=1:level=disabled[aout]`
            : `[1:a]volume=0.6[aout]`;
        await runFfmpegSpawn(['-i', silent, '-i', sfxLayer, '-filter_complex', fcS, '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-y', out]);
        fs.rmSync(silent, { force: true });
        fs.rmSync(sfxLayer, { force: true });
    } else {
        fs.renameSync(silent, out);
    }

    // Pass 3 — logo overlay (brand watermark)
    const logoPath = (() => {
        const candidates = [
            'assets/logos/logo-automation.png',
            'public/logo.png',
            'input/visuals/logo-automation.png',
        ];
        for (const c of candidates) {
            const abs = path.resolve(process.cwd(), c);
            if (fs.existsSync(abs)) return abs;
        }
        return '';
    })();
    if (logoPath && opts.brand) {
        // Only apply a watermark if the logo actually has an alpha channel.
        // Opaque logos (e.g. rgb24 with a solid/dark background) can't be
        // composited without stamping a black box, so skip them cleanly.
        let hasAlpha = false;
        try {
            const { execFileSync } = require('child_process');
            const ffprobe = require('ffprobe-static').path;
            const pix = execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', logoPath], { encoding: 'utf8' }).trim();
            hasAlpha = /rgba|argb|ya8|ya16|graya|ga|:a$|a@/.test(pix);
        } catch { /* ignore */ }
        if (!hasAlpha) {
            console.warn('  ⚠ Logo watermark skipped (logo has no alpha channel; would stamp a black box)');
        } else {
        const logoOut = outDir + '/_logo_' + res.workspace.jobId + '.mp4';
        try {
            await new Promise<void>((resolve, reject) => {
                execFile(ffmpeg, [
                    '-i', out, '-i', logoPath,
                    '-filter_complex', 'overlay=W-w*0.12-20:H-h*0.12-20:format=auto',
                    '-c:a', 'copy', '-y', logoOut,
                ], (err: any) => err ? reject(err) : resolve());
            });
            fs.rmSync(out, { force: true });
            fs.renameSync(logoOut, out);
            logInfo(`  🎨 Logo watermark applied`);
        } catch {
            console.warn(`  ⚠ Logo watermark skipped`);
            if (fs.existsSync(logoOut)) fs.rmSync(logoOut, { force: true });
        }
        }
    }

    // ── Subtitle export (SRT + VTT alongside the final mp4) ──
    const srtOut = out.replace(/\.mp4$/i, '') + '.srt';
    const vttOut = out.replace(/\.mp4$/i, '') + '.vtt';
    {
        const cues: string[] = [];
        const vttCues: string[] = ['WEBVTT', ''];
        let t = introClip ? (opts.intro!.durationSec ?? 2.5) : 0;
        let n = 1;
        for (const a of visuals) {
            const dur = a.durationSec ?? 4;
            const raw = a.captionSegments?.length
                ? a.captionSegments
                : [{ text: res.plan.scenes[a.sceneIndex]?.voiceoverText ?? '', startMs: 0, endMs: Math.round(dur * 1000) }];
            const segs = chunkCues(raw);
            for (const s of segs) {
                const start = t + s.startMs / 1000;
                const end = t + s.endMs / 1000;
                const startStr = fmtSrt(start);
                const endStr = fmtSrt(end);
                cues.push(`${n}\n${startStr} --> ${endStr}\n${s.text.replace(/\n/g, ' ')}\n`);
                // VTT uses '.' as millisecond separator instead of ','
                vttCues.push(`${startStr.replace(',', '.')} --> ${endStr.replace(',', '.')}\n${s.text.replace(/\n/g, ' ')}\n`);
                n++;
            }
            t += dur;
        }
        if (cues.length) {
            fs.writeFileSync(srtOut, cues.join('\n'), 'utf8');
            fs.writeFileSync(vttOut, vttCues.join('\n') + '\n', 'utf8');
            logInfo(`  📝 Subtitles exported: ${path.basename(srtOut)}, ${path.basename(vttOut)}`);
        }
    }

    // ── Chapter markers (ffmpeg chapter metadata from scene titles) ──
    {
        const chapters: { startMs: number; title: string }[] = [];
        let accT = 0;
        // Intro chapter
        const introDur = introClip ? (opts.intro!.durationSec ?? 2.5) : 0;
        if (introDur > 0) {
            chapters.push({ startMs: 0, title: opts.intro?.title ?? 'Intro' });
            accT = introDur;
        }
        // Scene chapters
        for (let i = 0; i < visuals.length; i++) {
            const sceneTitle = (res.plan.scenes[i]?.voiceoverText ?? '').slice(0, 60).trim();
            chapters.push({ startMs: Math.round(accT * 1000), title: sceneTitle || `Scene ${i + 1}` });
            accT += visuals[i].durationSec ?? 4;
        }
        if (chapters.length > 1) {
            const metaFile = path.join(path.dirname(out), `_chapters_${res.workspace.jobId}.txt`);
            const metaLines: string[] = [';FFMETADATA1'];
            for (let i = 0; i < chapters.length; i++) {
                const ch = chapters[i];
                const endMs = i + 1 < chapters.length ? chapters[i + 1].startMs : ch.startMs + 60000;
                metaLines.push(
                    '[CHAPTER]',
                    'TIMEBASE=1/1000',
                    `START=${ch.startMs}`,
                    `END=${endMs}`,
                    `title=${ch.title}`,
                );
            }
            fs.writeFileSync(metaFile, metaLines.join('\n'), 'utf8');
            const chapterTmp = path.join(path.dirname(out), `_chapters_tmp_${res.workspace.jobId}.mp4`);
            try {
                const chArgs = ['-i', out, '-i', metaFile, '-map_metadata', '1', '-codec', 'copy', '-y', chapterTmp];
                if (opts.verbose) {
                    console.error('[ffmpeg chapters] ' + ffmpeg + ' ' + chArgs.join(' '));
                }
                await new Promise<void>((resolve, reject) => {
                    execFile(ffmpeg, chArgs, (err: any) => err ? reject(err) : resolve());
                });
                fs.rmSync(out, { force: true });
                fs.renameSync(chapterTmp, out);
                logInfo(`  📑 ${chapters.length} chapter markers embedded`);
            } catch (e) {
                console.warn(`  ⚠ Chapter markers skipped: ${(e as Error).message}`);
                if (fs.existsSync(chapterTmp)) fs.rmSync(chapterTmp, { force: true });
            } finally {
                try { fs.rmSync(metaFile, { force: true }); } catch { /* ignore */ }
            }
        }
    }

    // ── Auto temp cleanup — delete intermediate render files older than 24h ──
    // Scans outDir for orphaned _av_*, _seg_*, _concat_*, _intro_*, _outro_*
    // files that may have been left behind by previous aborted runs.
    try {
        const cleanupPatterns = ['_av_', '_seg_', '_concat_', '_intro_', '_outro_'];
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const allFiles = fs.readdirSync(outDir);
        let cleaned = 0;
        for (const f of allFiles) {
            const matched = cleanupPatterns.some((p) => f.startsWith(p));
            if (!matched) continue;
            const fpath = path.join(outDir, f);
            try {
                const st = fs.statSync(fpath);
                if (st.isFile() && st.mtimeMs < cutoff) {
                    fs.rmSync(fpath, { force: true });
                    cleaned++;
                }
            } catch { /* skip unreadable entries */ }
        }
        if (cleaned > 0) logInfo(`  🧹 temp cleanup: removed ${cleaned} stale intermediate file(s)`);
    } catch { /* cleanup is best-effort */ }

    await writeOutputArtifacts(res, out, outDir, opts.aiVerify, opts.languages, opts.exportAspects);
    fs.rmSync(srtPath, { force: true });

    const aiBrain = opts.aiVerify?.verifyOnRender ? new AgentBrain() : undefined;
    res.postRender = await verifyRenderedVideo(out, expectedDur, {
        aiVerify: opts.aiVerify,
        brain: aiBrain,
        keywords: res.plan.scenes.flatMap((s) => s.searchKeywords ?? []),
        expectedDimensions: { w: W, h: H },
    });
    return out;
}

export async function renderVariant(res: PipelineResult, preset: string, tag: string): Promise<string | null> {
    try {
        const out = await renderAgenticSlideshow(res, {
            preset,
            outPath: path.join(res.workspace.root, 'render', `${res.workspace.jobId}_${tag}.mp4`),
            kenBurns: true,
        });
        return out;
    } catch (e) {
        console.warn(`variant ${tag} failed: ${(e as Error).message}`);
        return null;
    }
}
