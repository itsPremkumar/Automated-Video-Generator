/**
 * brand.ts — BRAND-KIT BURN-IN (single task).
 *
 * Zero-cost ffmpeg only. Applies a reusable brand kit to a video:
 *   - corner LOGO (image overlay) OR wordmark (drawtext) with optional padding
 *   - a 1–3s animated INTRO card (brand color + name) at the head
 *   - a 1–3s OUTRO card (brand color + tagline) at the tail
 *   - optional brand-color letterbox bars
 * No paid API, no GPU. The runner is INJECTABLE for unit tests.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';
import { probeMedia, type ProbeRunner } from './probe.js';

export interface BrandKit {
    /** brand display name (used for wordmark + intro/outro text). */
    name?: string;
    /** path to a logo PNG (optional; falls back to wordmark). */
    logo?: string;
    /** primary brand color hex, e.g. '#1f6feb' (used for cards/bars). */
    color?: string;
    /** tagline shown on the outro card. */
    tagline?: string;
    /** intro card duration seconds (0 = skip). */
    intro?: number;
    /** outro card duration seconds (0 = skip). */
    outro?: number;
    /** add brand-color letterbox bars top/bottom. */
    bars?: boolean;
}

export interface BrandResult {
    ok: boolean;
    output?: string;
    detail: string;
}

export function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const n = parseInt(
        h.length === 3
            ? h
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : h,
        16,
    );
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbExpr(hex: string): string {
    const [r, g, b] = hexToRgb(hex || '#000000');
    return `${r}:${g}:${b}`;
}

/** Build the ffmpeg filter chain for a brand kit applied to a single clip. */
export function buildBrandFilter(kit: BrandKit, w = 720, h = 1280): string {
    const parts: string[] = [];
    const color = kit.color || '#101010';
    if (kit.bars) {
        // 6% letterbox top+bottom in brand color
        const bh = Math.round(h * 0.06);
        parts.push(`drawbox=x=0:y=0:w=iw:h=${bh}:color=${rgbExpr(color)}:t=fill`);
        parts.push(`drawbox=x=0:y=ih-${bh}:w=iw:h=${bh}:color=${rgbExpr(color)}:t=fill`);
    }
    if (kit.logo && fs.existsSync(kit.logo)) {
        const lo = kit.logo.replace(/\\/g, '/');
        parts.push(`movie='${lo}'[lg];[in][lg]overlay=W-w-24:24[ovl]`);
    } else if (kit.name) {
        const safe = kit.name.replace(/:/g, '\\:').replace(/'/g, "'\\''");
        parts.push(`drawtext=text='${safe}':fontcolor=white:fontsize=34:x=w-tw-24:y=24`);
    }
    return parts.join(',');
}

async function makeCard(text: string, color: string, dur: number, w: number, h: number, out: string): Promise<boolean> {
    const rgb = rgbExpr(color);
    const safe = text.replace(/:/g, '\\:').replace(/'/g, "'\\''");
    const vf = `drawtext=text='${safe}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2`;
    const { code } = await runFfmpeg([
        '-f',
        'lavfi',
        '-i',
        `color=c=${rgb}:s=${w}x${h}:d=${dur}`,
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        out,
    ]);
    return code === 0 && fs.existsSync(out);
}

/**
 * Apply a brand kit to a video (logo + optional intro/outro cards + bars).
 */
export async function applyBrandKit(
    file: string,
    kit: BrandKit,
    out?: string,
    runner?: (args: string[]) => Promise<{ code: number; out: string }>,
): Promise<BrandResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const run = runner ?? runFfmpeg;
    const color = kit.color || '#101010';
    const output = out ?? path.join(process.cwd(), 'output', `branded_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });

    // Probe REAL dims with ffprobe (fall back to 720x1280 default).
    const probe = (runner as unknown as { probe?: ProbeRunner })?.probe ?? probeMedia;
    const info = await probe(file);
    const dims = info.width > 0 && info.height > 0 ? { w: info.width, h: info.height } : { w: 720, h: 1280 };

    const tmpDir = path.join(process.cwd(), 'output', `_brand_${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const cards: string[] = [];

    if (kit.intro && kit.intro > 0 && kit.name) {
        const p = path.join(tmpDir, 'intro.mp4');
        if (await makeCard(kit.name, color, kit.intro, dims.w, dims.h, p)) cards.push(p);
    }
    if (kit.outro && kit.outro > 0) {
        const p = path.join(tmpDir, 'outro.mp4');
        const txt = kit.tagline || kit.name || 'Thanks for watching';
        if (await makeCard(txt, color, kit.outro, dims.w, dims.h, p)) cards.push(p);
    }

    const vf = buildBrandFilter(kit, dims.w, dims.h);
    const needsVf = vf.length > 0;

    // concat [intro?] + [main with brand filter] + [outro?]
    const segments = [...cards, file];
    const inputs = segments.flatMap((s) => ['-i', s]);
    if (segments.length === 1 && !needsVf) {
        const { code, out: log } = await run(['-i', file, '-c', 'copy', '-y', output]);
        return finalize(code, output, log, 'passed through (no brand elements)');
    }

    // Use concat demuxer-friendly filter_complex with re-encode.
    const filterParts: string[] = [];
    segments.forEach((_, i) => {
        let scale = `[${i}:v]scale=${dims.w}:${dims.h}:force_original_aspect_ratio=increase,crop=${dims.w}:${dims.h}[v${i}]`;
        if (i === segments.length - 1 && needsVf)
            scale = `[${i}:v]scale=${dims.w}:${dims.h}:force_original_aspect_ratio=increase,crop=${dims.w}:${dims.h},${vf}[v${i}]`;
        filterParts.push(scale);
    });
    const concat = segments.map((_, i) => `[v${i}]`).join('') + `concat=n=${segments.length}:v=1:a=0[outv]`;
    const { code, out: log } = await run([
        ...inputs,
        '-filter_complex',
        `${filterParts.join(';')};${concat}`,
        '-map',
        '[outv]',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        output,
    ]);
    return finalize(code, output, log, `branded with kit (intro=${kit.intro || 0}s, outro=${kit.outro || 0}s)`);
}

function finalize(code: number, output: string, log: string, detail: string): BrandResult {
    if (code !== 0) return { ok: false, detail: `brand burn-in failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'output not produced' };
    return { ok: true, output, detail };
}
