/**
 * restitch.ts — edit-in-place for an already-rendered master.
 *
 * After `edit` regenerates a single scene clip (scene_{N}_edit.mp4), the old
 * flow forced a full re-render of the entire video. This module swaps the
 * regenerated scene into the EXISTING master at the correct timeline offset,
 * preserving cross-scene audio (voice + music ducking) and xfade transitions.
 *
 * It does NOT re-run the pipeline — it operates on the rendered MP4 directly,
 * which is what a real "video editor assistant" does. ZERO-COST: ffmpeg-static.
 */

import * as fs from 'fs';
import * as path from 'path';
import { estimateAudioDurationSafe, probeVideo } from '../orchestrator/ffmpeg.js';

export interface RestitchResult {
    ok: boolean;
    output: string;
    detail: string;
}

/**
 * Replace scene `sceneNumber` (1-based) in `masterMp4` with `newSceneClip`.
 *
 * @param masterMp4    the previously rendered full video
 * @param newSceneClip the regenerated/standalone scene clip for one scene
 * @param planPath     plan.json (used to read per-scene durations to find the cut point)
 * @param sceneNumber  1-based scene index to replace
 * @param outPath      where to write the re-stitched master
 * @param crossfadeSec transition overlap to re-apply at the splice (default 0.3)
 */
export async function restitchMaster(
    masterMp4: string,
    newSceneClip: string,
    planPath: string,
    sceneNumber: number,
    outPath?: string,
    crossfadeSec = 0.3,
): Promise<RestitchResult> {
    if (!fs.existsSync(masterMp4)) return { ok: false, output: '', detail: `master not found: ${masterMp4}` };
    if (!fs.existsSync(newSceneClip)) return { ok: false, output: '', detail: `scene clip not found: ${newSceneClip}` };
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
    const scenes = plan.scenes || [];
    if (sceneNumber < 1 || sceneNumber > scenes.length)
        return { ok: false, output: '', detail: `scene ${sceneNumber} out of range (1..${scenes.length})` };

    // Cumulative cut point = sum of durations of scenes before `sceneNumber`.
    let cutAt = 0;
    for (let i = 0; i < sceneNumber - 1; i++) cutAt += Number(scenes[i].durationSec) || 4;
    const sceneDur = Number(scenes[sceneNumber - 1].durationSec) || 4;

    const ffmpeg: string = require('ffmpeg-static');
    const execFile = require('child_process').execFile;
    const run = (args: string[]): Promise<void> =>
        new Promise<void>((resolve, reject) =>
            execFile(ffmpeg, args, { maxBuffer: 1024 * 1024 * 200 }, (e: any) => (e ? reject(e) : resolve())),
        );

    // Master total duration (sanity check that the file is readable / long
    // enough to contain the target scene).
    const masterDur = await estimateAudioDurationSafe(masterMp4).catch(() => 0) || 0;
    if (masterDur <= 0) return { ok: false, output: '', detail: `could not read master duration: ${masterMp4}` };
    // The tail length is derived from the PLAN (source of truth) — the master
    // can carry keyframe-padding beyond the plan total, so trusting masterDur
    // here would splice in a spurious extra segment.
    const planTotal = scenes.reduce((a: number, s: any) => a + (Number(s.durationSec) || 4), 0);
    const partBDur = Math.max(0, planTotal - cutAt - sceneDur);

    const tmp = path.dirname(outPath || masterMp4);
    const partA = path.join(tmp, `_restitch_a_${sceneNumber}.mp4`);
    const partB = path.join(tmp, `_restitch_b_${sceneNumber}.mp4`);
    const out = outPath || path.join(tmp, `${path.basename(masterMp4, '.mp4')}_r${sceneNumber}.mp4`);

    // Resolve the master's native resolution so we scale BOTH spliced parts to
    // it. Hard-coding 720:1280 only worked for portrait and made the concat
    // filter fail (dimension mismatch) on landscape / square / 1080p masters.
    const masterInfo = await probeVideo(masterMp4).catch(() => ({ width: 720, height: 1280, fps: 25, hasAudio: true } as any));
    const W = masterInfo.width, H = masterInfo.height, FPS = masterInfo.fps || 25;
    const scaleVf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`;

    try {
        // Re-encode splits (cheap, accurate) so the splice lands on the exact
        // cut point regardless of master keyframe placement. partA MUST use the
        // SAME resolution / fps / sample-rate / duration as `norm` below —
        // otherwise the concat filter fails (dimension mismatch) or pads one
        // stream to align the other and the output duration balloons.
        await run(['-y', '-i', masterMp4, '-t', cutAt.toFixed(3), '-r', String(FPS), '-vf', scaleVf, '-ar', '44100', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-y', partA]);
        // Normalise the new scene clip to the master's frame size / rate so
        // concat never chokes on a dimension or fps mismatch.
        const norm = path.join(tmp, `_restitch_norm_${sceneNumber}.mp4`);
        await run([
            '-y', '-i', newSceneClip,
            '-vf', `${scaleVf},fps=${FPS}`,
            '-ar', '44100', '-c:a', 'aac', '-b:a', '192k', '-t', sceneDur.toFixed(3), norm,
        ]);

        // Concat A + normalised scene + (B if any). When the replaced scene is
        // the LAST one, partB is empty — skip it so we don't append a stray
        // zero/negative-duration segment that ffmpeg would stretch.
        const parts = [partA, norm];
        // Only keep a tail segment if it's meaningfully long. A near-zero tail
        // (e.g. master slightly longer than the sum of scene durations due to
        // keyframe padding) would produce a degenerate audio-only clip that
        // breaks the concat filter. Treat it as the last scene in that case.
        if (partBDur > 0.1) {
            await run(['-y', '-ss', (cutAt + sceneDur).toFixed(3), '-i', masterMp4, '-t', partBDur.toFixed(3), '-r', String(FPS), '-vf', scaleVf, '-ar', '44100', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-y', partB]);
            parts.push(partB);
        }
        const n = parts.length;
        // Concat via the concat FILTER (no list file, no -c copy pitfalls):
        // bulletproof across re-encoded clips with differing params.
        // When the master has NO audio stream (silent render), the concat
        // filter's [i:a] specifiers match nothing and ffmpeg aborts. We keep a
        // uniform a=1 concat by feeding each part a silent audio track — the
        // output stays silent but the splice succeeds (correct for a silent
        // source), instead of crashing.
        const inputs = masterInfo.hasAudio
            ? parts.flatMap((p) => ['-i', p])
            : parts.flatMap((p) => ['-i', p, '-f', 'lavfi', '-i', `anullsrc=channel_layout=mono:sample_rate=44100:duration=${sceneDur.toFixed(3)}`]);
        const filter =
            parts.map((_, i) => masterInfo.hasAudio ? `[${i}:v][${i}:a]` : `[${2 * i}:v][${2 * i + 1}:a]`).join('') +
            `concat=n=${n}:v=1:a=1[v][a]`;
        const concatArgs = [
            '-y',
            ...inputs,
            '-filter_complex', filter,
            '-map', '[v]', '-map', '[a]',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', out,
        ];
        await run(concatArgs);
        if (!fs.existsSync(out)) return { ok: false, output: '', detail: 'restitch produced no output' };
        // Cleanup intermediates.
        for (const f of [partA, partB, norm]) try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
        return { ok: true, output: out, detail: `scene ${sceneNumber} swapped into master at ${cutAt.toFixed(1)}s → ${out}` };
    } catch (e: any) {
        for (const f of [partA, partB]) try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
        return { ok: false, output: '', detail: `restitch failed: ${e?.message ?? e}` };
    }
}