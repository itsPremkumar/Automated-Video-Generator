import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import { SfxClip, SfxKind } from './models.js';

const SFX_CACHE_DIR = path.join(os.tmpdir(), 'agentic-sfx-cache');

const SFX_SPECS: Record<SfxKind, { description: string; args: string[]; durationMs: number }> = {
    whoosh: {
        description: 'Frequency sweep 200→2000Hz over 0.3s',
        durationMs: 300,
        args: [
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=200:duration=0.3,volume=0.3',
            '-af',
            'vibrato=f=0.1:d=0.3,volume=0.25',
            '-c:a',
            'pcm_s16le',
            '-y',
        ],
    },
    ding: {
        description: 'Short 880Hz tone with exponential decay',
        durationMs: 400,
        args: [
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=880:duration=0.4,volume=0.4,aformat=sample_rates=44100',
            '-af',
            'afade=t=out:st=0.05:d=0.35,volume=0.3',
            '-c:a',
            'pcm_s16le',
            '-y',
        ],
    },
    impact: {
        description: 'White noise burst 0.15s with sharp attack',
        durationMs: 150,
        args: [
            '-f',
            'lavfi',
            '-i',
            'anoisesrc=d=0.15:c=pink:a=0.5',
            '-af',
            'afade=t=in:d=0.01,afade=t=out:st=0.1:d=0.05,volume=0.35',
            '-c:a',
            'pcm_s16le',
            '-y',
        ],
    },
    notification: {
        description: 'Two-tone 440→880Hz',
        durationMs: 300,
        args: [
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=440:duration=0.15,volume=0.3',
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=880:duration=0.15,volume=0.3',
            '-filter_complex',
            '[0:a][1:a]concat=n=2:v=0:a=1[a]',
            '-map',
            '[a]',
            '-c:a',
            'pcm_s16le',
            '-y',
        ],
    },
    click: {
        description: 'Single 1ms click (short impulse)',
        durationMs: 50,
        args: [
            '-f',
            'lavfi',
            '-i',
            'anoisesrc=d=0.05:c=white:a=0.8',
            '-af',
            'afade=t=in:d=0.001,afade=t=out:st=0.04:d=0.01,volume=0.2',
            '-c:a',
            'pcm_s16le',
            '-y',
        ],
    },
    pop: {
        description: 'Short bubble pop 0.05s',
        durationMs: 80,
        args: [
            '-f',
            'lavfi',
            '-i',
            'anoisesrc=d=0.08:c=pink:a=0.6',
            '-af',
            'afade=t=in:d=0.005,afade=t=out:st=0.05:d=0.03,volume=0.25',
            '-c:a',
            'pcm_s16le',
            '-y',
        ],
    },
    transition: {
        description: 'Sweep + noise blend for scene transitions',
        durationMs: 400,
        args: [
            '-f',
            'lavfi',
            '-i',
            'anoisesrc=d=0.4:c=pink:a=0.3,volume=0.15',
            '-af',
            'afade=t=in:d=0.05,afade=t=out:st=0.3:d=0.1',
            '-c:a',
            'pcm_s16le',
            '-y',
        ],
    },
    swish: {
        description: 'Quick high-freq sweep for list items',
        durationMs: 150,
        args: [
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=400:duration=0.15,volume=0.2',
            '-af',
            'vibrato=f=0.2:d=0.15,volume=0.15',
            '-c:a',
            'pcm_s16le',
            '-y',
        ],
    },
    bounce: {
        description: 'Rising two-tone for positive reveals',
        durationMs: 350,
        args: [
            '-f',
            'lavfi',
            '-i',
            'sine=frequency=523:duration=0.35,volume=0.25',
            '-af',
            'vibrato=f=4:d=0.35,afade=t=in:d=0.01,afade=t=out:st=0.25:d=0.1,volume=0.25',
            '-c:a',
            'pcm_s16le',
            '-y',
        ],
    },
};

export class FfmpegSfxGenerator {
    readonly name = 'ffmpeg-sfx-generator';
    private cache: Map<string, string> = new Map();

    constructor() {
        try {
            fs.mkdirSync(SFX_CACHE_DIR, { recursive: true });
        } catch {
            // Cache dir best-effort; getSfx will fall back
        }
    }

    async getSfx(kind: SfxKind): Promise<SfxClip | null> {
        const cacheKey = `sfx_${kind}`;
        const cached = this.cache.get(cacheKey);
        if (cached && fs.existsSync(cached)) {
            return {
                kind,
                localPath: cached,
                durationMs: SFX_SPECS[kind].durationMs,
                description: SFX_SPECS[kind].description,
            };
        }

        const outPath = path.join(SFX_CACHE_DIR, `${cacheKey}.wav`);
        if (fs.existsSync(outPath)) {
            this.cache.set(cacheKey, outPath);
            return {
                kind,
                localPath: outPath,
                durationMs: SFX_SPECS[kind].durationMs,
                description: SFX_SPECS[kind].description,
            };
        }

        return this.generate(kind, outPath, cacheKey);
    }

    private async generate(kind: SfxKind, outPath: string, cacheKey: string): Promise<SfxClip | null> {
        const ffmpeg = ffmpegStatic;
        if (!ffmpeg) {
            console.warn('[SFX-GEN] ffmpeg-static not available');
            return null;
        }

        const spec = SFX_SPECS[kind];

        try {
            await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
        } catch {
            return null;
        }

        try {
            await new Promise<void>((resolve, reject) => {
                const child = execFile(
                    ffmpeg,
                    [...spec.args, outPath],
                    { timeout: 10000 },
                    (error, _stdout, stderr) => {
                        if (error) {
                            reject(new Error(`ffmpeg failed: ${error.message}. stderr: ${stderr?.slice(0, 200)}`));
                        } else {
                            resolve();
                        }
                    },
                );
                child?.stdin?.destroy();
            });

            if (!fs.existsSync(outPath)) return null;

            this.cache.set(cacheKey, outPath);
            return { kind, localPath: outPath, durationMs: spec.durationMs, description: spec.description };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[SFX-GEN] Failed to generate "${kind}": ${message}`);
            return null;
        }
    }

    clearCache(): void {
        this.cache.clear();
        try {
            const entries = fs.readdirSync(SFX_CACHE_DIR);
            for (const file of entries) {
                fs.rmSync(path.join(SFX_CACHE_DIR, file), { force: true });
            }
        } catch {
            /* best-effort */
        }
    }
}
