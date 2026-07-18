/**
 * export.ts — FREE post-production features (no paid/online dependencies).
 *
 * Everything here is pure ffmpeg + deterministic JS, runs fully offline, and
 * costs $0. It implements the "advanced" 120-day-plan items that need NO
 * external API:
 *   - multi-aspect export (9:16 / 16:9 / 1:1) from one render
 *   - free mechanical metadata (title / description / hashtags) — NO LLM call
 *   - branded thumbnail generation (title card)
 *   - A/B variant rendering (re-render with an alternate preset)
 *
 * The legacy `generateMetadataAI` (LLM-based) is intentionally NOT used here so
 * the agentic pipeline stays free + offline. `generateFreeMetadata` produces
 * social-ready text from the plan itself.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Plan } from './types.js';
import { renderAgenticSlideshow } from './orchestrate.js';
import { PipelineResult } from './orchestrate.js';

export type Aspect = '9:16' | '16:9' | '1:1';

export const ASPECT_DIMS: Record<Aspect, { w: number; h: number }> = {
    '9:16': { w: 720, h: 1280 },
    '16:9': { w: 1280, h: 720 },
    '1:1': { w: 1080, h: 1080 },
};

const FFMPEG = () => require('ffmpeg-static') as string;

/**
 * Async ffmpeg runner with a hard timeout. Avoids execFileSync, which blocks
 * the Node event loop permanently on a RAM-starved box (spawnSync/execFileSync
 * cannot be interrupted mid-fork). Resolves to the child exit code.
 */
function runFfmpeg(args: string[], timeoutMs = 180000): Promise<number> {
    return new Promise((resolve) => {
        const { spawn } = require('child_process');
        const child = spawn(FFMPEG(), args, { stdio: 'ignore' });
        const t = setTimeout(() => {
            try {
                child.kill('SIGKILL');
            } catch {
                /* noop */
            }
            resolve(-1);
        }, timeoutMs);
        child.on('error', () => {
            clearTimeout(t);
            resolve(-1);
        });
        child.on('close', (code: number | null) => {
            clearTimeout(t);
            resolve(code ?? -1);
        });
    });
}

/**
 * Re-scale an already-rendered MP4 into one or more aspect ratios (e.g. push
 * the portrait cut to YouTube as 16:9). Pure ffmpeg scale+pad, offline, free.
 * Returns the list of produced file paths.
 */
export async function exportMultiAspect(
    srcMp4: string,
    aspects: Aspect[] = ['9:16', '16:9', '1:1'],
): Promise<string[]> {
    const out: string[] = [];
    const dir = path.dirname(srcMp4);
    const base = path.basename(srcMp4, path.extname(srcMp4));
    for (const a of aspects) {
        const { w, h } = ASPECT_DIMS[a];
        const dest = path.join(dir, `${base}_${a.replace(':', 'x')}.mp4`);
        // scale to fit (preserve aspect, decrease), then pad to target aspect.
        // Using force_original_aspect_ratio=decrease avoids the -2 parity
        // failure that broke 1:1 / 16:9 from a 9:16 source.
        const filter = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
        try {
            const code = await runFfmpeg([
                '-y',
                '-i',
                srcMp4,
                '-vf',
                filter,
                '-c:a',
                'copy',
                '-movflags',
                '+faststart',
                dest,
            ]);
            if (code === 0 && fs.existsSync(dest)) out.push(dest);
        } catch (e) {
            console.warn(`⚠ multi-aspect ${a} failed: ${(e as Error).message}`);
        }
    }
    return out;
}

/**
 * FREE, offline metadata — no LLM. Builds a YouTube/TikTok-ready title,
 * description, and hashtag string from the plan alone.
 */
export function generateFreeMetadata(plan: Plan): {
    title: string;
    description: string;
    hashtags: string;
    tags: string[];
} {
    const title = plan.title?.trim() || 'AI-Generated Video';
    // Description: opening hook (scene 0) + bulleted facts + soft CTA.
    const hook = plan.scenes[0]?.voiceoverText || '';
    const bullets = plan.scenes
        .slice(1)
        .map((s) => `• ${s.voiceoverText || ''}`)
        .join('\n');
    const description = [hook, '', bullets, '', '#Shorts #AI #facts'].join('\n').trim();
    // Hashtags: de-duplicated keywords + fixed reach tags. Scene fields are
    // optional, so guard every access (a Plan from any source must not crash).
    const kw = new Set<string>();
    for (const s of plan.scenes) {
        const terms = (s.searchKeywords || []).flatMap((k) => k.replace(/\s+/g, '').toLowerCase().split(','));
        for (const t of terms) if (t) kw.add(t);
    }
    const hashtags =
        Array.from(kw)
            .slice(0, 8)
            .map((k) => '#' + k)
            .join(' ') + ' #ai #shorts #viral';
    return { title, description, hashtags, tags: Array.from(kw).slice(0, 8) };
}

/**
 * Branded thumbnail: a title card with the video title over the first frame.
 * Pure ffmpeg drawtext, offline, free. Returns the thumbnail path or null.
 */
export async function renderThumbnail(srcMp4: string, plan: Plan): Promise<string | null> {
    const ffmpeg = FFMPEG();
    const fs = require('fs');
    const dir = path.dirname(srcMp4);
    const base = path.basename(srcMp4, path.extname(srcMp4));
    const out = path.join(dir, `${base}_thumbnail.jpg`);
    const title = (plan.title || 'Video').replace(/'/g, '’').replace(/:/g, '\\:');
    // Pin a system font so drawtext avoids the broken fontconfig on this box.
    const fontCandidates = ['C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'];
    let fontArg = '';
    for (const c of fontCandidates)
        if (fs.existsSync(c)) {
            fontArg = `fontfile='${c}':`;
            break;
        }
    const filter = `drawtext=${fontArg}text='${title}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.55:boxborderw=20:line_spacing=8:x=(w-text_w)/2:y=(h-text_h)/2`;
    try {
        const code = await runFfmpeg(['-y', '-ss', '00:00:01', '-i', srcMp4, '-frames:v', '1', '-vf', filter, out]);
        return code === 0 && fs.existsSync(out) ? out : null;
    } catch {
        return null;
    }
}

/**
 * A/B variant: re-render the SAME plan with an alternate preset (e.g. a
 * "reels" punchy cut vs the "cinematic" cut) so the user can compare. Free
 * (no new assets fetched — reuses the approved manifest).
 */
export async function renderVariant(res: PipelineResult, preset: string, tag: string): Promise<string | null> {
    try {
        const out = await renderAgenticSlideshow(res, {
            preset,
            outPath: path.join(res.workspace.root, 'render', `${res.workspace.jobId}_${tag}.mp4`),
            kenBurns: true,
        });
        return out;
    } catch (e) {
        console.warn(`⚠ variant ${tag} failed: ${(e as Error).message}`);
        return null;
    }
}

/**
 * FREE word-level timing (karaoke captions) — NO TTS required.
 * Splits a scene's voiceover text into words and distributes them evenly
 * across the scene duration. This powers B1-style word-highlight captions
 * offline; when real TTS word-timings exist they can replace this.
 */
export function wordTimingsFromScript(
    text: string,
    durationSec: number,
): { word: string; startMs: number; endMs: number }[] {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const per = (durationSec * 1000) / words.length;
    return words.map((w, i) => ({
        word: w,
        startMs: Math.round(i * per),
        endMs: Math.round((i + 1) * per),
    }));
}
