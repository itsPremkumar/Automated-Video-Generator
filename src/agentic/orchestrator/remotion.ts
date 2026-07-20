import * as fs from 'fs';
import * as path from 'path';
import { verifyRenderedVideo } from '../pipeline/gate.js';
import { AgentBrain } from '../ai/brain.js';
import { runFfmpeg } from './ffmpeg.js';
import { resolveRuntimePublicPath } from '../../shared/runtime/paths.js';
import type { PipelineResult } from './types.js';

const AGENTIC_ASSETS_DIR = 'agentic-assets';

/**
 * prepareRemotionAssets — build the per-scene asset descriptors for the
 * AgenticVideo Remotion composition.
 */
export async function prepareRemotionAssets(
    res: PipelineResult,
    opts: { brand?: { accentColor?: string }; preset?: string; kinetic?: boolean; quality?: 'draft' | 'medium' | 'high' },
    jobAssetDir: string,
    runFfmpeg: (args: string[], timeoutMs?: number) => Promise<number>,
): Promise<any[]> {
    const fs = require('fs');
    const path = require('path');
    const assetsForComposition: any[] = [];
    const targetH = opts.quality === 'draft' ? 1280 : 1920;
    const { computeStylePlan } = await import('../ai/style-engine.js');
    const _sp = computeStylePlan(res.plan, { preset: (opts.preset as any) ?? 'cinematic', kinetic: opts.kinetic });
    const styleByScene = new Map(_sp.scenes.map((s: any) => [s.sceneIndex, s]));
    const makePlaceholder = async (destPath: string, accent: string) => {
        const code = await runFfmpeg([
            '-f', 'lavfi',
            '-i', `color=c=${accent.replace('#', '0x')}:s=720x1280`,
            '-frames:v', '1', '-y', destPath,
        ]);
        if (code !== 0) {
            fs.writeFileSync(destPath, Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
                'base64',
            ));
        }
    };
    for (const a of res.manifest.assets) {
        const src = a.localPath;
        const destName = `s${a.sceneIndex}_${a.kind}_${path.basename(src).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const dest = path.join(jobAssetDir, destName);
        let copied = false;
        try {
            if (a.kind === 'video' && /\.(mp4|webm|mov|m4v)$/i.test(src) && fs.existsSync(src)) {
                const code = await runFfmpeg([
                    '-i', src, '-vf', `scale=-2:${targetH}`,
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
                    '-crf', '23', '-c:a', 'aac', '-y', dest,
                ]);
                copied = code === 0;
            } else if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
                copied = true;
            }
        } catch { copied = false; }
        if (!copied && a.kind !== 'music') {
            await makePlaceholder(dest, opts.brand?.accentColor ?? '#FF6B35');
            copied = fs.existsSync(dest);
        }
        if (!copied) continue;
        let audioRel: string | undefined;
        const audioSrc = a.kind === 'music' ? a.localPath : a.audioPath;
        if (audioSrc && fs.existsSync(audioSrc)) {
            const adestName = `s${a.sceneIndex}_audio.${audioSrc.split('.').pop()}`;
            const adest = path.join(jobAssetDir, adestName);
            fs.copyFileSync(audioSrc, adest);
            audioRel = path.join(AGENTIC_ASSETS_DIR, String(res.workspace.jobId), adestName).replace(/\\/g, '/');
        }
        const sty = styleByScene.get(a.sceneIndex);
        assetsForComposition.push({
            kind: a.kind,
            sceneIndex: a.sceneIndex,
            localPath: path.join(AGENTIC_ASSETS_DIR, String(res.workspace.jobId), destName).replace(/\\/g, '/'),
            audioPath: audioRel,
            durationSec: a.durationSec,
            captionSegments: a.captionSegments ?? [],
            transitionIn: (sty?.transitionIn ?? 'fade') as any,
            grade: (sty?.grade ?? 'neutral') as any,
            kinetic: (sty?.kinetic ?? []) as any,
            textConfig: { position: 'bottom', fontSize: 48 },
            hasVoice: a.kind !== 'music' && Boolean(a.audioPath),
            license: a.license,
        });
    }
    return assetsForComposition;
}

export async function renderAgenticWithRemotion(
    res: PipelineResult,
    opts: {
        brand?: { primaryColor?: string; accentColor?: string; fontFamily?: string; logoPath?: string };
        intro?: { title: string; subtitle?: string; durationSec?: number };
        outro?: { ctaText: string; showSubscribe?: boolean; hashtags?: string[]; durationSec?: number };
        kenBurns?: boolean;
        quality?: 'draft' | 'medium' | 'high';
        preset?: string;
        kinetic?: boolean;
        dimensions?: { w: number; h: number };
        crossfadeSec?: number;
        aiVerify?: import('../config.js').AgenticConfig['aiVerify'];
    } = {},
): Promise<string> {
    const { bundle } = require('@remotion/bundler');
    const { renderMedia, selectComposition, ensureBrowser } = require('@remotion/renderer');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    if (!process.env.CHROME_EXECUTABLE) {
        try {
            await Promise.race([
                ensureBrowser(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Chrome readiness timed out')), 20000),
                ),
            ]);
        } catch (e: any) {
            throw new Error(
                'Remotion renderer unavailable (no Chromium). ' +
                    (e?.message ?? e) + ' — use --renderer ffmpeg on this host.',
            );
        }
    }

    const fps = 30;
    const stagingDir = resolveRuntimePublicPath();
    const jobAssetDir = path.join(stagingDir, AGENTIC_ASSETS_DIR, String(res.workspace.jobId));
    fs.rmSync(jobAssetDir, { recursive: true, force: true });
    fs.mkdirSync(jobAssetDir, { recursive: true });

    const assetsForComposition = await prepareRemotionAssets(res, opts, jobAssetDir, runFfmpeg);
    const inputProps = {
        title: res.plan.title,
        orientation: res.plan.orientation ?? 'portrait',
        fps,
        assets: assetsForComposition,
        brand: opts.brand ?? { primaryColor: '#0a0a12', accentColor: '#FF6B35', fontFamily: 'system-ui' },
        introCard: opts.intro,
        outroCard: opts.outro,
        kenBurns: opts.kenBurns ?? true,
        width: opts.dimensions?.w,
        height: opts.dimensions?.h,
        crossfadeSec: opts.crossfadeSec ?? 0.5,
    };
    const totalFrames = Math.max(
        30,
        (assetsForComposition.filter((a) => a.kind !== 'music').reduce((s, a) => s + (a.durationSec ?? 4), 0) +
            (opts.intro?.durationSec ?? 0) + (opts.outro?.durationSec ?? 0)) * fps,
    );

    const bundleLoc = await bundle(path.resolve(process.cwd(), 'remotion/index.ts'), () => undefined, {
        webpackCacheDisabled: true,
        publicDir: stagingDir,
    });
    const outDir = res.workspace.root + '/render';
    fs.mkdirSync(outDir, { recursive: true });
    const crf = opts.quality === 'high' ? 18 : opts.quality === 'draft' ? 28 : 23;
    const renderOne = async (w: number | undefined, h: number | undefined, suffix: string): Promise<string> => {
        const aspectProps = { ...inputProps, width: w, height: h };
        const composition = await selectComposition({
            serveUrl: bundleLoc, id: 'AgenticVideo', inputProps: aspectProps,
        });
        const out = outDir + '/' + res.workspace.jobId + '_remotion' + suffix + '.mp4';
        await renderMedia({
            composition, serveUrl: bundleLoc,
            codec: 'h264', outputLocation: out, inputProps: aspectProps,
            crf, concurrency: 1, imageFormat: 'jpeg',
            timeoutInMilliseconds: 1000 * 60 * 9, framesPerLambda: null as any,
            ...(process.env.CHROME_EXECUTABLE ? { chromeExecutable: process.env.CHROME_EXECUTABLE } : {}),
        });
        return out;
    };
    const aspects: { w?: number; h?: number; s: string }[] = [
        { w: opts.dimensions?.w, h: opts.dimensions?.h, s: '' },
        { w: 1920, h: 1080, s: '_16x9' },
        { w: 1080, h: 1080, s: '_1x1' },
    ];
    let primary = '';
    for (const a of aspects) {
        try {
            const o = await renderOne(a.w, a.h, a.s);
            if (a.s === '') primary = o;
            res.postRender = await verifyRenderedVideo(o, totalFrames / fps, {
                aiVerify: opts.aiVerify,
                brain: opts.aiVerify?.verifyOnRender ? new AgentBrain() : undefined,
                keywords: res.plan.scenes.flatMap((s) => s.searchKeywords ?? []),
                expectedDimensions: { w: a.w ?? 0, h: a.h ?? 0 },
            });
        } catch (e) {
            console.warn(`⚠ remotion aspect ${a.s || 'native'} failed: ${(e as Error).message}`);
        }
    }
    if (!primary) throw new Error('Remotion: all aspect renders failed');
    return primary;
}
