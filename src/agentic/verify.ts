/**
 * verify.ts — STAGE 3: run the full verification matrix for every asset.
 *
 * For images and videos it reuses the existing vision verifier (verifyMedia,
 * now extended with watermark + safety checks). For music it uses the new
 * signal-level music-verifier. Results are written to verification/*.json
 * and returned for the decision gateway.
 *
 * verifyImage/verifyVideo are injected so offline tests stub the vision calls.
 */

import * as fs from 'fs';
import * as path from 'path';
import { verifyMusic, MusicVerifyOptions } from '../lib/music-verifier.js';
import { verifyMedia, VerificationResult } from '../lib/media-verifier.js';
import { AgenticWorkspace, writeJson } from './workspace.js';
import { AssetCandidate, AssetVerification } from './types.js';
import { checkSourceAsset } from './asset-checks.js';

export interface VerifyDeps {
    verifyImage: (filePath: string, keywords: string[]) => Promise<VerificationResult>;
    verifyVideo: (filePath: string, keywords: string[]) => Promise<VerificationResult>;
    ffprobe?: (filePath: string) => any; // injected for music checks
    musicOptions?: MusicVerifyOptions;
}

const VERIFY_PASS_CONFIDENCE = Math.max(1, Math.min(10, Number.parseInt(process.env.VERIFY_PASS || '7', 10) || 7));

export async function verifyAll(
    candidates: AssetCandidate[],
    ws: AgenticWorkspace,
    deps: VerifyDeps,
): Promise<AssetVerification[]> {
    const results: AssetVerification[] = [];
    const imageResults: AssetVerification[] = [];
    const videoResults: AssetVerification[] = [];
    const musicResults: AssetVerification[] = [];

    for (const c of candidates) {
        const id = `${c.kind}_s${c.sceneIndex}_c${c.candidateIndex}`;
        if (!fs.existsSync(c.localPath)) {
            const v: AssetVerification = {
                assetId: id,
                kind: c.kind,
                sceneIndex: c.sceneIndex,
                passes: false,
                confidence: 0,
                reason: `File missing: ${c.localPath}`,
            };
            results.push(v);
            pushByKind(v, imageResults, videoResults, musicResults);
            continue;
        }

        if (c.kind === 'image') {
            const r = await deps.verifyImage(c.localPath, c.keywords);
            const v = toVerification(id, c, r);
            // STAGE-3 source check (I4/I5): resolution + aspect, catches a 240p
            // upscale or wrong-aspect asset BEFORE it wastes a render.
            try {
                const sc = checkSourceAsset(c.localPath, { kind: 'image', minWidth: 480, targetAspect: 9 / 16 });
                v.metrics = { ...(v.metrics ?? {}), sourceChecks: sc };
            } catch { /* probe failure is non-fatal */ }
            results.push(v);
            imageResults.push(v);
        } else if (c.kind === 'video') {
            const r = await deps.verifyVideo(c.localPath, c.keywords);
            const v = toVerification(id, c, r);
            // STAGE-3 source check (V4/V5/V6): resolution/aspect/duration fit.
            try {
                const sc = checkSourceAsset(c.localPath, { kind: 'video', minWidth: 480, targetAspect: 9 / 16 });
                v.metrics = { ...(v.metrics ?? {}), sourceChecks: sc };
            } catch { /* probe failure is non-fatal */ }
            results.push(v);
            videoResults.push(v);
        } else {
            // music: signal-level check, no vision
            const mr = verifyMusic(c.localPath, { license: c.license, ...deps.musicOptions }, deps.ffprobe);
            const v: AssetVerification = {
                assetId: id,
                kind: 'music',
                sceneIndex: c.sceneIndex,
                passes: mr.passes,
                confidence: mr.passes ? 8 : 2,
                reason: mr.reason,
                metrics: mr.metrics as unknown as Record<string, unknown>,
            };
            results.push(v);
            musicResults.push(v);
        }
    }

    writeJson(ws, 'verification/image_checks.json', imageResults);
    writeJson(ws, 'verification/video_checks.json', videoResults);
    writeJson(ws, 'verification/music_checks.json', musicResults);
    writeJson(ws, 'verification/all_checks.json', results);
    return results;
}

function toVerification(id: string, c: AssetCandidate, r: VerificationResult): AssetVerification {
    return {
        assetId: id,
        kind: c.kind,
        sceneIndex: c.sceneIndex,
        passes: r.passes,
        confidence: r.confidence,
        reason: r.reason,
    };
}

function pushByKind(v: AssetVerification, img: AssetVerification[], vid: AssetVerification[], mus: AssetVerification[]) {
    if (v.kind === 'image') img.push(v);
    else if (v.kind === 'video') vid.push(v);
    else mus.push(v);
}

export { VERIFY_PASS_CONFIDENCE };
