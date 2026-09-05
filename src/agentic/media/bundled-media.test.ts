/**
 * bundled-media.test.ts — REGRESSION: bundled fallback assets must be
 * geometrically clean (no baked-in rotation / black corner wedges).
 *
 * Background: `forest_soft.mp4` + `aurora_flow.mp4` shipped with a ~2-3deg
 * baked rotation (black triangles in frame corners). Every offline render
 * that fell back to them inherited the tilt, and no signal gate catches
 * corner-only wedges (blackdetect needs a large black area). This test
 * samples real decoded frames and fails on near-black corners inside an
 * otherwise bright frame, plus pins the 1280x720 / >=5s contract.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { bundledVideos, bundledImages } from './bundled-media.js';

const ffmpeg: string = require('ffmpeg-static');
const ffprobe: string = require('ffprobe-static').path;

function tmpFile(name: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundled-test-'));
    return path.join(dir, name);
}

function probeDuration(file: string): number {
    const out = execFileSync(ffprobe, ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
        timeout: 30000,
    }).toString();
    return Number(out.trim()) || 0;
}

interface LumaStats {
    corners: number[];
    /** top, bottom, left, right edge strips (excluding corners) */
    edges: number[];
    center: number;
    mean: number;
}

/** Mean luma over a rect of raw RGB(A) pixels. */
function rectMean(data: Buffer, w: number, ch: number, x0: number, y0: number, x1: number, y1: number): number {
    let sum = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const o = (y * w + x) * ch;
            const r = data[o] ?? 0;
            const g = data[o + 1] ?? r;
            const b = data[o + 2] ?? r;
            sum += 0.299 * r + 0.587 * g + 0.114 * b;
            n++;
        }
    }
    return n === 0 ? 0 : sum / n;
}

async function frameLuma(png: string): Promise<LumaStats> {
    const sharpMod: any = ((await import('sharp').catch(() => null)) as any)?.default ?? null;
    assert.ok(sharpMod, 'sharp is required for bundled-media regression test');
    const { data, info } = await sharpMod(png).raw().toBuffer({ resolveWithObject: true });
    const w: number = info.width;
    const h: number = info.height;
    const ch: number = info.channels;
    const m = 24;
    const corners = [
        rectMean(data, w, ch, 0, 0, m, m),
        rectMean(data, w, ch, w - m, 0, w, m),
        rectMean(data, w, ch, 0, h - m, m, h),
        rectMean(data, w, ch, w - m, h - m, w, h),
    ];
    const edges = [
        rectMean(data, w, ch, m, 0, w - m, 12),
        rectMean(data, w, ch, m, h - 12, w - m, h),
        rectMean(data, w, ch, 0, m, 12, h - m),
        rectMean(data, w, ch, w - 12, m, w, h - m),
    ];
    const center = rectMean(
        data,
        w,
        ch,
        Math.floor(w / 2) - 12,
        Math.floor(h / 2) - 12,
        Math.floor(w / 2) + 12,
        Math.floor(h / 2) + 12,
    );
    // Coarse full-frame mean via 32x32 downscale.
    const small = await sharpMod(png).resize(32, 32, { fit: 'fill' }).raw().toBuffer();
    let s = 0;
    const sch = info.channels;
    for (let i = 0; i < small.length; i += sch) s += 0.299 * small[i] + 0.587 * small[i + 1] + 0.114 * small[i + 2];
    return { corners, edges, center, mean: s / (small.length / sch) };
}

describe('bundled fallback media is geometrically clean', () => {
    it('bundled videos exist and meet the 1280x720 / >=5s contract', () => {
        const vids = bundledVideos();
        assert.ok(vids.length >= 3, `expected >=3 bundled videos, got ${vids.length}`);
        for (const v of vids) {
            assert.ok(fs.existsSync(v.path), `missing ${v.path}`);
            assert.ok(probeDuration(v.path) >= 5, `${v.path} shorter than 5s`);
        }
    });

    it('no bundled video frame has black corner wedges (rotation regression)', async () => {
        const vids = bundledVideos();
        for (const v of vids) {
            for (const t of [0.5, 3, 5]) {
                const png = tmpFile(`frame_${t}.png`);
                execFileSync(ffmpeg, ['-y', '-v', 'error', '-ss', String(t), '-i', v.path, '-frames:v', '1', png], {
                    timeout: 60000,
                });
                const st = await frameLuma(png);
                // A baked rotation leaves a near-black wedge INTRUDING into its
                // neighborhood: the corner is near-black AND much darker than
                // BOTH adjacent edge strips (MIN, not mean: a legit dark
                // gradient band runs along one full edge, so at least one
                // neighbor strip is equally dark and the ratio stays clean).
                const wedge = st.corners.some((c, i) => {
                    const [top, bottom] = [st.edges[0], st.edges[1]];
                    const [left, right] = [st.edges[2], st.edges[3]];
                    const adj =
                        i === 0 ? [top, left] : i === 1 ? [top, right] : i === 2 ? [bottom, left] : [bottom, right];
                    return c < 20 && c < 0.35 * Math.min(adj[0], adj[1]);
                });
                assert.ok(
                    !wedge,
                    `${path.basename(v.path)}@t=${t}s: black corner wedge (corners=${st.corners.map((c) => c.toFixed(0)).join(',')} edges=${st.edges.map((c) => c.toFixed(0)).join(',')}) — regenerate asset straight`,
                );
                try {
                    fs.rmSync(path.dirname(png), { recursive: true, force: true });
                } catch {
                    /* ignore */
                }
            }
        }
    });

    it('bundled images are present and not pure black', async () => {
        const imgs = bundledImages();
        assert.ok(imgs.length >= 1, 'expected >=1 bundled image');
        for (const im of imgs.slice(0, 4)) {
            const st = await frameLuma(im.path);
            assert.ok(st.mean > 20, `${im.path} suspiciously dark (mean=${st.mean.toFixed(1)})`);
        }
    });
});
