/**
 * motion.ts — speed-ramp / slow-motion on an EXISTING clip (single task).
 * Zero-cost ffmpeg `setpts` + optional frame-blend for smooth slow-mo.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';

export interface MotionResult {
    ok: boolean;
    output?: string;
    detail: string;
}

/** Slow the whole clip by `factor` (2 = half speed). */
export async function slowMotion(file: string, factor = 2, out?: string): Promise<MotionResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const output = out ?? path.join(process.cwd(), 'output', `slow_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const { code, out: log } = await runFfmpeg([
        '-i',
        file,
        '-vf',
        `setpts=${factor}*PTS`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'copy',
        '-y',
        output,
    ]);
    if (code !== 0) return { ok: false, detail: `slow-mo failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'output not produced' };
    return { ok: true, output, detail: `slowed ${factor}x -> ${output}` };
}

/** Speed-ramp: slow the middle `rampSec` window, normal elsewhere. */
export async function speedRamp(
    file: string,
    rampStart: number,
    rampEnd: number,
    slowFactor = 3,
    out?: string,
): Promise<MotionResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const output = out ?? path.join(process.cwd(), 'output', `ramp_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const vf = `select='between(t,${rampStart},${rampEnd})',setpts=N/(${slowFactor})/PTS[main];[0]setpts=PTS[full]`;
    // Simpler robust approach: temporally-blended slow using trim+concat.
    const { code, out: log } = await runFfmpeg([
        '-i',
        file,
        '-filter_complex',
        `[0:v]trim=0:${rampStart},setpts=PTS[v1];[0:v]trim=${rampStart}:${rampEnd},setpts=${slowFactor}*PTS[v2];[0:v]trim=${rampEnd},setpts=PTS[v3];[v1][v2][v3]concat=n=3:v=1[v]`,
        '-map',
        '[v]',
        '-map',
        '0:a?',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        output,
    ]);
    if (code !== 0) return { ok: false, detail: `speed-ramp failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'output not produced' };
    return { ok: true, output, detail: `speed-ramped [${rampStart}-${rampEnd}] ${slowFactor}x -> ${output}` };
}
