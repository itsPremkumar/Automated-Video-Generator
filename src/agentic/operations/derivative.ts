/**
 * derivative.ts — produce DERIVATIVE outputs FROM an existing video
 * (single task): multi-aspect re-exports (9:16 / 16:9 / 1:1) and a
 * thumbnail. Reuses the project's ffmpeg-centric approach (no Remotion
 * needed for these simple transforms). Zero-cost.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';

const ASPECT_DIMS: Record<string, { w: number; h: number }> = {
    '9:16': { w: 720, h: 1280 },
    '16:9': { w: 1280, h: 720 },
    '1:1': { w: 1080, h: 1080 },
};

export interface DerivativeResult {
    ok: boolean;
    outputs: string[];
    thumbnail?: string;
    detail: string;
}

/**
 * @param aspects aspect ratios to produce (default all three).
 * @param thumbnail also render a .jpg thumbnail.
 */
export async function deriveFromVideo(
    file: string,
    aspects: string[] = ['9:16', '16:9', '1:1'],
    thumbnail = true,
    outDir?: string,
): Promise<DerivativeResult> {
    if (!fs.existsSync(file)) return { ok: false, outputs: [], detail: `input not found: ${file}` };
    const dir = outDir ?? path.join(process.cwd(), 'output', `derive_${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    const base = path.basename(file, path.extname(file));
    const outputs: string[] = [];

    for (const a of aspects) {
        const dim = ASPECT_DIMS[a];
        if (!dim) continue;
        const out = path.join(dir, `${base}_${a.replace(':', 'x')}.mp4`);
        // scale to cover the target frame, then center-crop (safe, never distort).
        const vf = `scale=${dim.w}:${dim.h}:force_original_aspect_ratio=increase,crop=${dim.w}:${dim.h}`;
        const { code } = await runFfmpeg([
            '-i',
            file,
            '-vf',
            vf,
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'copy',
            '-y',
            out,
        ]);
        if (code === 0 && fs.existsSync(out)) outputs.push(out);
    }

    let thumb: string | undefined;
    if (thumbnail) {
        thumb = path.join(dir, `${base}_thumb.jpg`);
        const { code } = await runFfmpeg([
            '-i',
            file,
            '-ss',
            '00:00:01',
            '-vframes',
            '1',
            '-vf',
            'scale=720:-1',
            '-y',
            thumb,
        ]);
        if (code !== 0 || !fs.existsSync(thumb)) thumb = undefined;
    }

    return {
        ok: outputs.length > 0,
        outputs,
        thumbnail: thumb,
        detail: `produced ${outputs.length} aspect(s)${thumb ? ' + thumbnail' : ''} from ${file}`,
    };
}
