/**
 * asset-validators.ts — content-level checks for acquired media.
 *
 * Why this exists: matrix QA found that when the live fetchers fail (no
 * API key + free sources blip), the pipeline accepted a *solid-color
 * gradient placeholder* as a real scene visual and even labeled it
 * "Source: openverse/pexels" in the render manifest. A near-uniform image
 * has zero photographic content and produces a degenerate (swatch) video.
 *
 * `isUniformPlaceholderImage` uses ffmpeg signalstats to measure the
 * spatial brightness *spread* of the frame. A real photo has a wide
 * distribution of luma values; a flat gradient collapses to a tiny spread.
 * We reject anything below the threshold so the caller can try the next
 * source instead of shipping a swatch.
 *
 * This is a pure function with no network access — it only shells out to
 * the bundled ffmpeg-static, same as the rest of the pipeline.
 */

import * as fs from 'fs';
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';

/** Minimum luma (Y) standard-deviation (0–~128 scale) to count as "real"
 *  photographic content. A flat gradient has stddev ≈ 0–2; a real photo is
 *  typically > 12. 8 is deliberately conservative so we only reject obvious
 *  swatches, never legitimately low-contrast art. */
export const MIN_CONTENT_STDDEV = 8;

export interface ContentCheckResult {
    ok: boolean;
    /** ffmpeg-measured luma standard deviation (0–~128). */
    stddev: number;
    reason?: string;
}

/**
 * Returns true if the image is NOT a near-uniform placeholder (i.e. it has
 * enough spatial luma variance to be real content). Throws/returns ok:true on
 * any ffmpeg failure so a broken validator never blocks a legit asset.
 */
export function checkImageHasContent(localPath: string, minStddev = MIN_CONTENT_STDDEV): ContentCheckResult {
    if (!localPath || !fs.existsSync(localPath)) {
        return { ok: false, stddev: 0, reason: 'missing file' };
    }
    try {
        const out = execFileSync(
            ffmpegPath as unknown as string,
            [
                '-hide_banner',
                '-i', localPath,
                // yadif off; just measure luma stats per-frame, take the first
                '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:key=lavfi.signalstats.YSTD:data=1',
                '-frames:v', '1',
                '-f', 'null', '-',
            ],
            { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 },
        ).toString();
        const ystd = (out.match(/YSTD[=: ]([0-9.]+)/gi) || [])
            .map((m) => parseFloat(m.replace(/YSTD[=: ]/i, '')))
            .filter((n) => !Number.isNaN(n));
        const stddev = ystd.length ? Math.max(...ystd) : 0;
        if (stddev < minStddev) {
            return { ok: false, stddev, reason: `near-uniform image (YSTD=${stddev.toFixed(1)} < ${minStddev})` };
        }
        return { ok: true, stddev };
    } catch {
        // Validator failed (corrupt file, odd codec) — be permissive so the
        // caller's own robustness path decides, not this heuristic.
        return { ok: true, stddev: minStddev };
    }
}

export function isUniformPlaceholderImage(localPath: string, minStddev = MIN_CONTENT_STDDEV): boolean {
    return !checkImageHasContent(localPath, minStddev).ok;
}
