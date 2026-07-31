/**
 * asset-validators.ts — content-level checks for acquired media.
 *
 * Why this exists: matrix QA found that when the live fetchers fail (no
 * API key + free sources blip), the pipeline accepted a *solid-color
 * gradient placeholder* as a real scene visual and even labeled it
 * "Source: openverse/pexels" in the render manifest. A near-uniform image
 * has zero photographic content and produces a degenerate (swatch) video.
 *
 * `isUniformPlaceholderImage` measures the spatial luma *spread* of the
 * frame. A real photo has a wide distribution of luma values; a flat
 * gradient collapses to a tiny spread. We reject anything below the
 * threshold so the caller can try the next source instead of shipping a
 * swatch.
 *
 * Implementation note (2026-07-31 bug): the original used
 * `signalstats,metadata=print:...:data=1` and parsed `YSTD` from the log.
 * On the bundled ffmpeg 6.1.1 build `data` is NOT a valid `metadata`
 * option (the whole filtergraph errors out → execFileSync throws → the
 * catch returned `ok:true` for EVERY image, so no placeholder was ever
 * rejected), and this build's `signalstats` never prints `YSTD` at all.
 * The check now decodes the frame to a 64×64 grayscale rawvideo buffer and
 * computes the luma standard deviation in JS — no signalstats metadata
 * parsing, works on any ffmpeg build. stddev is reported on the same
 * 0–~128 scale as signalstats YSTD (8-bit luma spread), so the
 * MIN_CONTENT_STDDEV constant keeps its meaning.
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
        // Decode one frame to a tiny grayscale rawvideo buffer (64×64 = 4096
        // bytes) and compute the luma standard deviation in JS. scale first so
        // the rawvideo payload is small and the cost is negligible.
        const out = execFileSync(
            ffmpegPath as unknown as string,
            [
                '-hide_banner',
                '-i', localPath,
                '-vf', 'scale=64:64,format=gray',
                '-frames:v', '1',
                '-f', 'rawvideo',
                '-pix_fmt', 'gray',
                'pipe:1',
            ],
            { stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000, maxBuffer: 1e6 },
        );
        const n = out.length;
        let sum = 0;
        for (let i = 0; i < n; i++) sum += out[i];
        const mean = sum / n;
        let variance = 0;
        for (let i = 0; i < n; i++) {
            const d = out[i] - mean;
            variance += d * d;
        }
        // 8-bit luma stddev on the 0–255 scale, halved to the 0–~128 scale
        // signalstats YSTD reports on, so MIN_CONTENT_STDDEV keeps its meaning.
        const stddev = Math.sqrt(variance / n) / 2;
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
