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
import type { PipelineResult } from './types.js';
import { AGENTIC_OUTPUT_DIR } from '../management/workspace.js';

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
): string | null {
    const segs: { s: number; e: number }[] = [];
    let t = 0;
    for (const a of visuals) {
        const dur = a.durationSec ?? 4;
        for (const c of a.captionSegments ?? []) segs.push({ s: t + c.startMs / 1000, e: t + c.endMs / 1000 });
        t += dur;
    }
    if (segs.length === 0) return null;
    const terms = segs.map((x) => String.raw`between(t\,${x.s.toFixed(3)}\,${x.e.toFixed(3)})`).join('+');
    return `${full}-${(full - duck).toFixed(3)}*gt(${terms},0)`;
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
                    console.log(`🌐 localized subtitles: ${out.length} language(s) -> ${out.map((p) => p.split(/[\\/]/).pop()).join(', ')}`);
            } catch (e: any) {
                console.warn(`⚠ subtitle localization skipped: ${e?.message ?? e}`);
            }
        }
    }
    const hashtags = res.plan.scenes
        .flatMap((s) => s.searchKeywords).slice(0, 8)
        .map((k) => '#' + k.replace(/\s+/g, ''))
        .join(' ');
    fs.writeFileSync(
        base + '_details.txt',
        `${res.plan.title}\n\n${res.plan.scenes.map((s) => `• ${s.voiceoverText}`).join('\n')}\n\n${hashtags}\n\nGenerated by agentic pipeline (backend=${res.backend}, voiceoverDriven=${res.voiceovers?.voiceoverDriven ?? false}).`,
        'utf8',
    );
    try { await renderThumbnail(mp4, res.plan); } catch { /* optional */ }
    let aspectPaths: string[] = [];
    try { aspectPaths = await exportMultiAspect(mp4, ['9:16', '16:9', '1:1']); } catch { /* optional */ }
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
        console.log(`📤 publish manifest: ${manifest.targets.length} platform target(s) → ${res.workspace.jobId}_publish-manifest.json`);
    } catch (e: any) { console.warn(`⚠ publish manifest skipped: ${e?.message ?? e}`); }
    try {
        const { archiveJob } = await import('../delivery/archive.js');
        const arch = archiveJob(res.workspace, mp4);
        if (arch) console.log(`📦 archived ${arch.totalFiles} files (${arch.totalBytes} bytes) → ${arch.archiveDir}`);
    } catch { /* archive is best-effort */ }
    try {
        const { openReview } = await import('../delivery/revision.js');
        openReview(res.workspace, res.workspace.jobId, res.plan.title);
        console.log(`🔍 review thread opened for "${res.plan.title}" — awaiting client approval`);
    } catch { /* review thread is best-effort */ }
    try {
        const { getPluginRegistry } = await import('../plugins/index.js');
        const reg = getPluginRegistry();
        if (reg) {
            await reg.invokeOnPostRender(mp4);
            console.log(`🧩 plugin post-render hooks applied`);
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
            console.log(`📁 ${copied} deliverable artifact(s) copied → ${outputDir}`);
    } catch { /* output copy is best-effort */ }
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
        outro?: { ctaText: string; showSubscribe?: boolean; hashtags?: string[]; durationSec?: number };
        jCutSec?: number;
        aiVerify?: import('../config.js').AgenticConfig['aiVerify'];
        languages?: string[];
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
    const outDir = res.workspace.root + '/render';
    fs.mkdirSync(outDir, { recursive: true });
    const out = opts.outPath ?? outDir + '/' + res.workspace.jobId + '.mp4';
    if (!res.manifest)
        throw new Error('Cannot render: final gate did not produce a render manifest (gate.pass=' + res.gate.pass + ').');

    const visuals = res.manifest.assets.filter((a) => a.kind !== 'music');
    for (const v of visuals) {
        const sd = res.plan.scenes[v.sceneIndex] && res.plan.scenes[v.sceneIndex].durationSec;
        if (sd && sd > 0) v.durationSec = sd;
    }
    const music = res.manifest.assets.find((a) => a.kind === 'music');
    if (visuals.length === 0) throw new Error('No approved visuals to render.');

    const CARD_W = opts.dimensions?.w ?? 720, CARD_H = opts.dimensions?.h ?? 1280;
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
            execFile(ffmpeg, ['-f', 'lavfi', '-i', vf, '-t', String(dur), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', outPath],
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

    const xf = opts.crossfadeSec ?? 0.5;
    const burn = opts.burnCaptions ?? true;

    const runFfmpegSpawn = (args: string[], totalSec = 0): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            const cp = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
            let lastPct = -1;
            let buf = '';
            cp.stderr.on('data', (d: Buffer) => {
                buf += d.toString();
                const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(buf);
                if (m && totalSec > 0) {
                    const secs = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
                    const pct = Math.min(99, Math.round((secs / totalSec) * 100));
                    if (pct !== lastPct) { lastPct = pct; console.log(`  · render ${pct}%`); }
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

    const W = opts.dimensions?.w ?? 720, H = opts.dimensions?.h ?? 1280;
    const sceneFilters = visuals.map((a, i) => {
        const dur = a.durationSec ?? 4;
        const doZoom = a.kind === 'image' && opts.kenBurns !== false;
        const zoom = doZoom ? `,zoompan=z=min(zoom+0.0008\\,1.04):d=1:s=${W}x${H}` : '';
        const grade = gradeFilter(stylePlan.scenes[i]?.grade ?? 'neutral');
        const tag = '[' + i + ':v]';
        return `${tag}scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,trim=duration=${dur},setpts=PTS-STARTPTS,settb=1/25${zoom},${grade},format=yuv420p[v${i}]`;
    });

    if (introClip)
        sceneFilters.push(`[${introInputIdx}:v]fps=25,trim=duration=${opts.intro!.durationSec ?? 2.5},setpts=PTS-STARTPTS,settb=1/25,format=yuv420p[vintro]`);
    if (outroClip)
        sceneFilters.push(`[${outroInputIdx}:v]fps=25,trim=duration=${opts.outro!.durationSec ?? 3},setpts=PTS-STARTPTS,settb=1/25,format=yuv420p[voutro]`);

    const orderedTags: string[] = [];
    const orderedDur: number[] = [];
    const durOf = (a: { sceneIndex: number; durationSec?: number }): number =>
        (res.plan.scenes[a.sceneIndex] && res.plan.scenes[a.sceneIndex].durationSec) || a.durationSec || 4;
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
        const theme = resolveCaptionTheme(opts.captionTheme);
        const { fontcolor: capColor, fontsize: baseSize, boxArgs, yExpr } = captionThemeToDrawtext(theme);
        let ctag = videoChain;
        let ci = 0;
        let tBase = 0;
        for (const a of visuals) {
            const dur = a.durationSec ?? 4;
            const scText = (res.plan.scenes[a.sceneIndex] && res.plan.scenes[a.sceneIndex].voiceoverText) || '';
            if (opts.captions === 'karaoke') {
                const words = wordTimingsFromScript(scText, dur);
                for (const wseg of words) {
                    const start = (tBase + wseg.startMs / 1000).toFixed(2);
                    const end = (tBase + wseg.endMs / 1000).toFixed(2);
                    const safe = ffmpegDrawtextEscape(wseg.word);
                    const out = `c${ci}`;
                    vfArgs.push(`${ctag}drawtext=${FONT_ARG}text='${safe}':fontcolor=yellow:fontsize=38:box=1:boxcolor=black@0.55:boxborderw=12:x=(w-text_w)/2:y=h-text_h-140:enable='between(t\\,${start},${end})'[${out}]`);
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
                        vfArgs.push(`drawtext=${FONT_ARG}text='${safe}':fontcolor=${capColor}:fontsize=${baseSize}${boxArgs}:line_spacing=4:x=(w-text_w)/2:y=${y}:enable='between(t\\,${start}\\,${end})'`);
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
                const safe = cue.text.replace(/'/g, '’').replace(/:/g, '\\:');
                if (cue.kind === 'lowerthird') {
                    vfArgs.push(`${ktag}drawtext=${FONT_ARG}text='${safe}':fontcolor=white:fontsize=34:box=1:boxcolor=black@0.45:boxborderw=12:x=(w-text_w)/2:y=h-text_h-90:enable='between(t\\,${start},${end})'[k${i}]`);
                } else {
                    vfArgs.push(`${ktag}drawtext=${FONT_ARG}text='${safe}':fontcolor=yellow:fontsize=64:box=1:boxcolor=black@0.0:borderw=3:bordercolor=yellow:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t\\,${start},${end})'[k${i}]`);
                }
                ktag = `[k${i}]`;
            }
        }
        if (ktag !== videoMap) { videoMap = ktag; }
    }
    vfArgs.push(`${videoMap}vignette=PI/5[vig]`);
    videoMap = '[vig]';

    const voScenes = visuals.filter((a) => a.audioPath && fs.existsSync(a.audioPath));
    let audioInputArgs: string[] = [];
    let audioFilter: string | null = null;
    let audioMap: string[] = [];
    const jCut = opts.jCutSec && opts.jCutSec > 0 ? opts.jCutSec : 0;
    if (voScenes.length > 0) {
        audioInputArgs = voScenes.flatMap((a) => ['-i', a.audioPath!]);
        const videoInputCount = visuals.length + (introClip ? 1 : 0) + (outroClip ? 1 : 0);
        const base = videoInputCount;
        const introDur = introClip ? (opts.intro!.durationSec ?? 2.5) : 0;
        const delayed: string[] = [];
        voScenes.forEach((_, i) => {
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
                dur: res.plan.scenes[i]?.durationSec ?? a.durationSec ?? 4,
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
            const doZoom = clip.kind === 'scene' && !isVideo && opts.kenBurns !== false;
            const zoom = doZoom ? `,zoompan=z=zoom+0.0008:d=1:s=${W}x${H}` : '';
            const grade = clip.kind === 'scene' ? gradeFilter(stylePlan.scenes[clip.idx]?.grade ?? 'neutral') : '';
            const segCaptionArg: string[] = [];
            if (clip.kind === 'scene' && burn) {
                const a = visuals[clip.idx];
                const raw = a.captionSegments?.length
                    ? a.captionSegments
                    : [{ text: res.plan.scenes[a.sceneIndex]?.voiceoverText ?? '', startMs: 0, endMs: Math.round(dur * 1000) }];
                const lines = mergeWordsToLines(raw);
                const theme = resolveCaptionTheme(opts.captionTheme);
                const { fontcolor: capColor, fontsize: baseSize, boxArgs, yExpr } = captionThemeToDrawtext(theme);
                for (const s of lines) {
                    const start = (s.startMs / 1000).toFixed(2);
                    const end = (s.endMs / 1000).toFixed(2);
                    const wrapped = wrapCaptionLines(s.text, W, baseSize);
                    const lineH = Math.round(baseSize * 1.3);
                    wrapped.forEach((ln, li) => {
                        const safe = ffmpegDrawtextEscape(ln).replace(/\n/g, ' ');
                        const y = li === 0 ? yExpr : `(${yExpr})-${li * lineH}`;
                        segCaptionArg.push(`drawtext=${FONT_ARG}text='${safe}':fontcolor=${capColor}:fontsize=${baseSize}${boxArgs}:line_spacing=4:x=(w-text_w)/2:y=${y}:enable='between(t\\,${start}\\,${end})'`);
                    });
                }
            }
            const kin: string[] = [];
            if (clip.kind === 'scene' && stylePlan && opts.kinetic !== false && opts.captions === 'none') {
                for (const cue of stylePlan.scenes[clip.idx]?.kinetic ?? []) {
                    const start = cue.atSec.toFixed(2);
                    const end = (cue.atSec + (cue.kind === 'wordpop' ? 0.9 : 2.6)).toFixed(2);
                    const safe = cue.text.replace(/'/g, '’').replace(/:/g, '\\:');
                    kin.push(`drawtext=${FONT_ARG}text='${safe}':fontcolor=${cue.kind === 'wordpop' ? 'yellow' : 'white'}:fontsize=${cue.kind === 'wordpop' ? 64 : 34}:box=1:boxcolor=black@0.45:boxborderw=12:x=(w-text_w)/2:y=${cue.kind === 'wordpop' ? '(h-text_h)/2' : 'h-text_h-90'}:enable='between(t\\,${start},${end})'`);
                }
            }
            const vfChain = `[0:v]${!isVideo ? 'loop=loop=-1:size=1,' : ''}fps=25,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=${dur},setpts=PTS-STARTPTS,settb=1/25${zoom}${grade ? ',' + grade : ''},format=yuv420p,vignette=PI/5${segCaptionArg.length ? ',' + segCaptionArg.join(',') : ''}${kin.length ? ',' + kin.join(',') : ''}[v]`;
            const voPath = clip.kind === 'scene' ? res.voiceovers?.scenes[clip.idx]?.audioPath : undefined;
            const hasVo = !!voPath && fs.existsSync(voPath);
            const inputs: string[] = ['-i', clip.file];
            if (hasVo) inputs.push('-i', voPath);
            else inputs.push('-f', 'lavfi', '-i', `anullsrc=channel_layout=mono:sample_rate=44100`);
            const af = hasVo
                ? `[1:a]aresample=44100,atrim=0:${dur},asetpts=PTS-STARTPTS,alimiter=limit=0.7:asc=1:level=disabled[a]`
                : `[1:a]atrim=0:${dur},asetpts=PTS-STARTPTS[a]`;
            const fc = vfChain + ';' + af;
            const args: string[] = [
                ...inputs, '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
                '-t', String(dur), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '25',
                '-c:a', 'aac', '-shortest', '-y', seg,
            ];
            let lastErr: any;
            for (let attempt = 0; attempt < 3; attempt++) {
                try { await runFfmpegSpawn(args, dur); break; }
                catch (e) { lastErr = e; console.warn(`⚠ segment ${ci} attempt ${attempt + 1} failed, retrying`); }
            }
            if (!fs.existsSync(seg)) throw lastErr ?? new Error(`segment ${ci} failed`);
            segFiles.push(seg);
        }
        const list = outDir + '/_concat_' + res.workspace.jobId + '.txt';
        fs.writeFileSync(list, segFiles.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
        silent = outDir + '/_av_' + res.workspace.jobId + '.mp4';
        await new Promise<void>((resolve, reject) => {
            execFile(ffmpeg, ['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent], (err: any) =>
                err ? reject(new Error('concat failed: ' + err)) : resolve());
        });
    } else {
        const introDur = introClip ? (opts.intro!.durationSec ?? 2.5) : 0;
        const outroDur = outroClip ? (opts.outro!.durationSec ?? 3) : 0;
        const scenesDur = visuals.reduce((s, a) => s + (a.durationSec ?? 4), 0);
        const xfadeTransitions = orderedTags.length - 1;
        const xfadeOverlap = xfadeTransitions * xf;
        const totalSec = Math.max(1, introDur + scenesDur + outroDur - xfadeOverlap);
        expectedDur = totalSec;
        silent = outDir + '/_av_' + res.workspace.jobId + '.mp4';
        const pass1: string[] = [
            ...videoInputs, ...audioInputArgs,
            '-filter_complex', [...vfArgs, ...(audioFilter ? [audioFilter] : [])].join(';'),
            '-map', videoMap, ...(audioMap.length ? audioMap : []),
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '25',
            ...(audioMap.length ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']),
            '-t', totalSec.toFixed(2), '-y', silent,
        ];
        if (process.env.DEBUG_FF) {
            console.error('FILTER_COMPLEX:\n' + [...vfArgs, ...(audioFilter ? [audioFilter] : [])].join(';\n'));
        }
        await runFfmpegSpawn(pass1, totalSec);
    }

    let sfxLayer: string | null = null;
    if (opts.sfx && music && fs.existsSync(music.localPath)) {
        try {
            const { planSceneSfx } = await import('../media/sfx-selector.js');
            const sfxPlans = planSceneSfx(res.plan);
            sfxLayer = await buildSfxLayer(ffmpeg, res.plan, visuals, sfxPlans, outDir);
        } catch { sfxLayer = null; }
    }
    if (music && fs.existsSync(music.localPath)) {
        const duck = parseFloat(process.env.AUDIO_DUCK_LEVEL ?? '0.06');
        const full = parseFloat(process.env.AUDIO_FULL_LEVEL ?? '0.18');
        const duckExpr = buildDuckExpression(visuals, full, duck);
        const volFilter = duckExpr ? `volume=eval=frame:volume='${duckExpr}'` : `volume=${full}`;
        const inputs: string[] = ['-i', silent, '-i', music.localPath];
        let fc = `[1:a]${volFilter}[a]`;
        if (sfxLayer && fs.existsSync(sfxLayer)) {
            inputs.push('-i', sfxLayer);
            fc += `;[2:a]volume=0.6[sfx];[0:a][a][sfx]amix=inputs=3:duration=shortest[amixout];[amixout]alimiter=limit=0.7:asc=1:level=disabled[aout]`;
        } else {
            fc += `;[0:a][a]amix=inputs=2:duration=shortest[amixout];[amixout]alimiter=limit=0.7:asc=1:level=disabled[aout]`;
        }
        const pass2 = [
            ...inputs, '-filter_complex', fc,
            '-map', '0:v:0', '-map', '[aout]',
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-y', out,
        ];
        await runFfmpegSpawn(pass2);
        fs.rmSync(silent, { force: true });
        if (sfxLayer) fs.rmSync(sfxLayer, { force: true });
    } else {
        fs.renameSync(silent, out);
    }

    await writeOutputArtifacts(res, out, outDir, opts.aiVerify, opts.languages);
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
