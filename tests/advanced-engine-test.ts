/**
 * advanced-engine-test.ts — Real ffmpeg-engine proof for visual-fx + export-fx.
 * Generates a synthetic test clip with ffmpeg-static, then exercises:
 *   - applySceneFx (clip speed + bw filter)
 *   - transcode → gif / webm
 *   - exportPoster (thumbnail)
 *   - exportContactSheet (grid)
 *   - normalizeAudio + loopAudioToDuration (sfx.ts)
 * All outputs are asserted to exist on disk with non-zero size.
 */
import * as fs from 'fs';
import * as path from 'path';
import ffmpegPath from 'ffmpeg-static';
import { applySceneFx, applyChromaKey } from '../src/agentic/operations/visual-fx.js';
import { transcode, exportPoster, exportContactSheet } from '../src/agentic/operations/export-fx.js';
import { normalizeAudio, loopAudioToDuration } from '../src/agentic/operations/sfx.js';

const ff = ffmpegPath as unknown as string;
const work = path.resolve('workspace', 'test-advanced');
fs.mkdirSync(work, { recursive: true });

function makeTestClip(p: string): boolean {
    try {
        // 3s color-bars clip with tone audio
        require('child_process').execFileSync(ff, [
            '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=3',
            '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
            '-c:v', 'libx264', '-c:a', 'aac', '-shortest', p,
        ], { stdio: 'ignore' });
        return fs.existsSync(p) && fs.statSync(p).size > 0;
    } catch { return false; }
}

let pass = 0, fail = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? '✅' : '❌'} ${name}`); ok ? pass++ : fail++; };

async function main() {
    const clip = path.join(work, 'test.mp4');
    check('generate test clip', makeTestClip(clip));

    // visual-fx: slow-mo (0.5) + bw on scene 0
    const fxClip = applySceneFx(clip, 0, { clipSpeedByScene: { 0: 0.5 }, filterByScene: { 0: 'bw' } }, work);
    check('applySceneFx (speed+bw) → new clip', fxClip !== clip && fs.existsSync(fxClip) && fs.statSync(fxClip).size > 0);

    // export: gif
    const gif = transcode(clip, 'gif', work);
    check('transcode → gif', !!gif && fs.existsSync(gif!) && fs.statSync(gif!).size > 0);

    // export: webm
    const webm = transcode(clip, 'webm', work);
    check('transcode → webm', !!webm && fs.existsSync(webm!) && fs.statSync(webm!).size > 0);

    // poster thumbnail at 1s
    const poster = exportPoster(clip, 1, work);
    check('exportPoster → jpg', !!poster && fs.existsSync(poster!) && fs.statSync(poster!).size > 0);

    // contact sheet
    const sheet = exportContactSheet(clip, work, 6);
    check('exportContactSheet → jpg', !!sheet && fs.existsSync(sheet!) && fs.statSync(sheet!).size > 0);

    // audio normalize + loop
    const norm = normalizeAudio(clip, path.join(work, 'norm.mp4'), -14);
    check('normalizeAudio → output', fs.existsSync(norm) && fs.statSync(norm).size > 0);
    const loop = loopAudioToDuration(clip, path.join(work, 'loop.mp4'), 6);
    check('loopAudioToDuration → output', fs.existsSync(loop) && fs.statSync(loop).size > 0);

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
    process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
