/**
 * image-video.ts - IMAGE <-> VIDEO conversion (single task). Zero-cost ffmpeg.
 *  - imagesToVideo: folder of images (or a single image) -> slideshow (Ken-Burns optional).
 *  - videoToImages: extract frames from a video into PNGs.
 */
import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';

export interface ImgVideoResult {
    ok: boolean;
    output?: string;
    outputs?: string[];
    detail: string;
}

export async function imagesToVideo(
    images: string[],
    output?: string,
    opts: { durationPerImage?: number; kenBurns?: boolean; width?: number; height?: number } = {},
): Promise<ImgVideoResult> {
    if (!images.length) return { ok: false, detail: 'No images provided' };
    const dur = Math.max(1, opts.durationPerImage ?? 3);
    const w = opts.width ?? 720;
    const h = opts.height ?? 1280;
    const res = `${w}x${h}`;
    const out = output ?? path.join(process.cwd(), `slideshow_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(out), { recursive: true });

    if (images.length === 1) {
        const vf = opts.kenBurns
            ? `scale=${res},zoompan=z='min(zoom+0.0015,1.5)':d=${Math.round(dur * 25)}:s=${res}:fps=25`
            : `scale=${res},format=yuv420p,loop=1:size=2,trim=duration=${dur}`;
        const { code, out: log } = await runFfmpeg([
            '-loop',
            '1',
            '-i',
            images[0],
            '-vf',
            vf,
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-t',
            String(dur),
            '-y',
            out,
        ]);
        if (code !== 0) return { ok: false, detail: `image->video failed:\n${log.slice(-600)}` };
        return { ok: true, output: out, detail: 'Single-image hold rendered' };
    }

    const list = path.join(path.dirname(out), `.imglist_${Date.now()}.txt`);
    fs.writeFileSync(list, images.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    const vf = `scale=${res}:force_original_aspect_ratio=decrease,pad=${res}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;
    const { code, out: log } = await runFfmpeg([
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-vf',
        `fps=25,${vf}`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        out,
    ]);
    fs.rmSync(list, { force: true });
    if (code !== 0) return { ok: false, detail: `images->video failed:\n${log.slice(-600)}` };
    return { ok: true, output: out, detail: `Slideshow of ${images.length} images rendered` };
}

export async function videoToImages(file: string, outDir?: string, everyNthFrame = 30): Promise<ImgVideoResult> {
    const dir = outDir ?? path.join(path.dirname(file), `${path.basename(file, path.extname(file))}_frames`);
    fs.mkdirSync(dir, { recursive: true });
    const { code, out: log } = await runFfmpeg([
        '-i',
        file,
        '-vf',
        `select='not(mod(n\\,${everyNthFrame}))',scale=480:-1`,
        '-vsync',
        'vfr',
        '-frames:v',
        '10000',
        path.join(dir, 'frame_%05d.png'),
        '-y',
    ]);
    if (code !== 0) return { ok: false, detail: `video->images failed:\n${log.slice(-600)}` };
    const outputs = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.png'))
        .map((f) => path.join(dir, f));
    return { ok: true, outputs, detail: `Extracted ${outputs.length} frames into ${dir}` };
}
