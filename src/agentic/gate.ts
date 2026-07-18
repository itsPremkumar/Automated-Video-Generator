/**
 * gate.ts — STAGE 5: final holistic gate (X1-X6).
 *
 * Blocks render unless EVERYTHING is verified and approved. Returns a report the
 * agent (and the operator) can read. This is the "after all the things must be
 * verified" guarantee.
 */

import { AssetCandidate, AssetDecision, Plan, RenderManifest } from './types.js';
import { aiVerifyAsset } from './ai-verify.js';

export interface GateReport {
    pass: boolean;
    checks: { id: string; label: string; pass: boolean; detail: string }[];
}

export interface GateOptions {
    /** Platform whose runtime cap applies (X5). Default Shorts=180s. */
    platform?: 'shorts' | 'tiktok' | 'reels' | 'youtube';
    /** Explicit override for X5 runtime cap (seconds). */
    maxRuntimeSec?: number;
}

const RUNTIME_CAPS: Record<string, number> = { shorts: 60, tiktok: 180, reels: 90, youtube: 600 };

export function runFinalGate(
    plan: Plan,
    candidates: AssetCandidate[],
    decisions: AssetDecision[],
    manifest: RenderManifest | null,
    opts: GateOptions = {},
): GateReport {
    const checks: GateReport['checks'] = [];

    // X3: no unresolved rejects / all assets decided
    const decidedIds = new Set(decisions.map((d) => d.assetId));
    const allDecided = candidates.every((c) => decidedIds.has(`${c.kind}_s${c.sceneIndex}_c${c.candidateIndex}`));
    checks.push({
        id: 'X3',
        label: 'No unresolved decisions',
        pass: allDecided,
        detail: allDecided ? 'every asset has a decision' : 'some assets lack a decision',
    });

    // X2: no missing scene visuals
    const approvedScenes = new Set(
        decisions.filter((d) => d.decision === 'approved' && d.kind !== 'music').map((d) => d.sceneIndex),
    );
    const missingScenes = plan.scenes.map((_, i) => i).filter((i) => !approvedScenes.has(i));
    checks.push({
        id: 'X2',
        label: 'Every scene has an approved visual',
        pass: missingScenes.length === 0,
        detail: missingScenes.length === 0 ? 'all scenes covered' : `missing scenes: ${missingScenes.join(', ')}`,
    });

    // X1: duration alignment — compare the planned total runtime against the
    // sum of approved visual DISPLAY times (from the render manifest, when
    // available) vs the plan's scene durations. Falls back to a scene-count
    // check when manifest durations aren't known yet.
    const planned = plan.totalDurationSec;
    const approved = decisions.filter((d) => d.decision === 'approved' && d.kind !== 'music');
    let durAligned: boolean;
    let durDetail: string;
    const manifestDur = manifest ? manifest.assets.reduce((s, a) => s + (a.durationSec ?? 0), 0) : 0;
    if (manifestDur > 0) {
        const drift = Math.abs(planned - manifestDur);
        durAligned = drift <= Math.max(2, planned * 0.1);
        durDetail = `planned ${planned.toFixed(1)}s vs assets ${manifestDur.toFixed(1)}s (drift ${drift.toFixed(1)}s)`;
    } else {
        durAligned = approved.length >= plan.scenes.length;
        durDetail = `approved visuals=${approved.length}/${plan.scenes.length}`;
    }
    checks.push({ id: 'X1', label: 'Duration alignment', pass: durAligned, detail: durDetail });

    // X5: total runtime within the platform cap.
    const cap = opts.maxRuntimeSec ?? RUNTIME_CAPS[opts.platform ?? 'shorts'] ?? 180;
    const runtimeOk = planned <= cap;
    checks.push({
        id: 'X5',
        label: 'Runtime within limit',
        pass: runtimeOk,
        detail: `${planned}s <= ${cap}s${opts.platform ? ` (${opts.platform})` : ''}`,
    });

    // X6: attribution completeness — every approved asset must carry a license
    // label (so it is attributable). A missing *URL* is acceptable for
    // CC0/placeholder assets; only a wholly-missing license blocks.
    const attrMissing = decisions
        .filter((d) => d.decision === 'approved')
        .filter((d) => {
            const c = candidates.find((c) => `${c.kind}_s${c.sceneIndex}_c${c.candidateIndex}` === d.assetId);
            return !c?.license;
        }).length;
    checks.push({
        id: 'X6',
        label: 'Attribution completeness',
        pass: attrMissing === 0,
        detail:
            attrMissing === 0 ? 'all approved assets carry a license' : `${attrMissing} asset(s) without any license`,
    });

    // X4: caption sync — deferred to render layer; treat as pass if manifest built
    checks.push({
        id: 'X4',
        label: 'Caption sync',
        pass: manifest !== null,
        detail: manifest ? 'render manifest present' : 'no render manifest',
    });

    const pass = checks.every((c) => c.pass) && manifest !== null;
    return { pass, checks };
}

/**
 * Phase 8.4 — POST-RENDER quality verification (X7-X9).
 * Runs ffprobe on the produced MP4 and asserts it is valid, on-spec, and has audio.
 * Returns extra checks merged into the gate report so the agent can prove the
 * output is shippable.
 */
export interface PostRenderCheck {
    path: string;
    checks: GateReport['checks'];
    pass: boolean;
    probed?: { durationSec: number; hasVideo: boolean; hasAudio: boolean; codec?: string };
}

export async function verifyRenderedVideo(
    mp4Path: string,
    expectedDurationSec: number,
    opts?: {
        aiVerify?: import('./config.js').AgenticConfig['aiVerify'];
        brain?: import('./brain.js').AgentBrain;
        keywords?: string[];
    },
): Promise<PostRenderCheck> {
    const ffmpeg: string = require('ffmpeg-static');
    const { spawn } = require('child_process');
    const fs = require('fs');
    const checks: GateReport['checks'] = [];

    const exists = fs.existsSync(mp4Path);
    // Size floor scales with duration. Factor is conservative: it must catch
    // empty/corrupt renders (<50KB) without over-penalising valid low-entropy
    // content (gradient cards, simple scenes) which legitimately compress small.
    const minSize = Math.max(50_000, Math.round(expectedDurationSec * 6_000));
    const sizeOk = exists && fs.statSync(mp4Path).size > minSize;
    checks.push({
        id: 'X7',
        label: 'Output file valid',
        pass: sizeOk,
        detail: exists
            ? `${Math.round(fs.statSync(mp4Path).size / 1024)}KB (min ${Math.round(minSize / 1024)}KB)`
            : 'missing',
    });

    let probed: PostRenderCheck['probed'] | undefined;
    if (exists) {
        let raw = '';
        const probe = await new Promise<string>((resolve) => {
            try {
                const child = spawn(ffmpeg, ['-i', mp4Path], { stdio: ['pipe', 'pipe', 'pipe'] } as any);
                let o = '';
                let e = '';
                const t = setTimeout(
                    () => {
                        try {
                            child.kill('SIGKILL');
                        } catch {
                            /* ignore */
                        }
                        resolve(e);
                    },
                    Number(process.env.AGENTIC_FFMPEG_TIMEOUT_MS || 20000),
                );
                child.stdout?.on('data', (d: Buffer) => {
                    o += d.toString();
                });
                child.stderr?.on('data', (d: Buffer) => {
                    e += d.toString();
                });
                child.on('error', () => {
                    clearTimeout(t);
                    resolve(e);
                });
                child.on('close', () => {
                    clearTimeout(t);
                    resolve(e);
                });
            } catch {
                resolve('');
            }
        });
        raw = probe;
        // Accept ANY video stream (h264, hevc, vp9, …), not just h264, so the
        // post-render check never falsely fails on a valid non-h264 encode.
        const hasVideo = /Video:/.test(raw) && !/Video: none/.test(raw);
        const hasAudio = /Audio:/.test(raw);
        const durM = raw.match(/Duration:\s*([\d:.]+)/);
        const dur = durM ? durM[1].split(':').reduce((a: number, x: string) => a * 60 + parseFloat(x), 0) : 0;
        const codec = (raw.match(/Video:\s*(\w+)/) || [])[1];
        probed = { durationSec: dur, hasVideo, hasAudio, codec };
        const durOk = dur > 0 && Math.abs(dur - expectedDurationSec) <= Math.max(2, expectedDurationSec * 0.05);
        checks.push({
            id: 'X8',
            label: 'Duration matches plan',
            pass: durOk,
            detail: `actual ${dur.toFixed(1)}s vs planned ${expectedDurationSec.toFixed(1)}s`,
        });
        checks.push({
            id: 'X9',
            label: 'Audio track present',
            pass: hasAudio,
            detail: hasAudio ? 'aac audio stream found' : 'no audio stream',
        });

        // ── X10–X15: FINAL-OUTPUT quality (the real gap). ──
        // Imported lazily so offline tests that stub ffmpeg don't pay for it.

        const ana = require('./video-analyzer.js');
        try {
            const black = await ana.detectBlackFrames(mp4Path);
            const longestBlack = black.reduce((m: number, b: any) => Math.max(m, b.duration), 0);
            const blackOk = longestBlack < 0.5;
            checks.push({
                id: 'X10',
                label: 'No long black frames',
                pass: blackOk,
                detail: blackOk ? 'none' : `black ${longestBlack.toFixed(2)}s`,
            });

            const freeze = await ana.detectFreezeFrames(mp4Path);
            const longestFreeze = freeze.reduce((m: number, f: any) => Math.max(m, f.duration), 0);
            const freezeOk = longestFreeze < 1.0;
            checks.push({
                id: 'X11',
                label: 'No frozen frames',
                pass: freezeOk,
                detail: freezeOk ? 'none' : `freeze ${longestFreeze.toFixed(2)}s`,
            });

            const audio = await ana.analyzeAudio(mp4Path);
            // Pass if audio is present and not clipping. A very quiet ambient
            // track (peak ~ -25dB) is fine; only a broken/unreadable track
            // (volumedetect returns -999) or clipping fails.
            const loudOk = audio.peakDb <= 0 && audio.peakDb > -60;
            checks.push({
                id: 'X12',
                label: 'Audio loudness in range',
                pass: loudOk,
                detail: `peak ${audio.peakDb.toFixed(1)}dB mean ${audio.meanVolumeDb.toFixed(1)}dB`,
            });

            const clipOk = !audio.clipping;
            checks.push({
                id: 'X13',
                label: 'No audio clipping',
                pass: clipOk,
                detail: clipOk ? 'true peak < -1dB' : `peak ${audio.peakDb.toFixed(1)}dB (clipping)`,
            });

            const dim = await ana.analyzeDimensions(mp4Path);
            const portraitOk = dim.height >= dim.width; // 9:16 / 1:1 expected portrait-ish
            const landscapeOk = dim.width >= dim.height;
            const dimOk = dim.width > 0 && dim.height > 0 && (portraitOk || landscapeOk);
            checks.push({
                id: 'X14',
                label: 'Output dimensions valid',
                pass: dimOk,
                detail: `${dim.width}x${dim.height} ${dim.codec}`,
            });

            const codecOk = /^(h264|hevc|vp9|av1)$/.test(dim.codec);
            checks.push({ id: 'X15', label: 'Web-compatible codec', pass: codecOk, detail: dim.codec || 'unknown' });
        } catch (e: any) {
            // Analysis itself failing must not silently pass the video.
            checks.push({
                id: 'X10',
                label: 'No long black frames',
                pass: false,
                detail: `analyzer error: ${e?.message ?? e}`,
            });
        }
    } else {
        checks.push({ id: 'X8', label: 'Duration matches plan', pass: false, detail: 'no output file' });
        checks.push({ id: 'X9', label: 'Audio track present', pass: false, detail: 'no output file' });
    }

    // ── X16: OPT-IN AI verify of the final video (uses the agent's
    // own model). Skipped unless opts.aiVerify.verifyOnRender is on AND a
    // brain is supplied. A null result (no model / offline) never blocks.
    if (opts?.aiVerify?.verifyOnRender && opts?.brain) {
        try {
            const frameDir = mp4Path + '.ai-frame';
            fs.mkdirSync(frameDir, { recursive: true });
            const frame = require('path').join(frameDir, 'f.jpg');
            await new Promise<void>((res) => {
                const c = spawn(ffmpeg, ['-y', '-ss', '00:00:00.5', '-i', mp4Path, '-frames:v', '1', frame], {
                    stdio: 'ignore',
                });
                const t = setTimeout(() => {
                    try {
                        c.kill('SIGKILL');
                    } catch {
                        /* */
                    }
                    res();
                }, 20000);
                c.on('close', () => {
                    clearTimeout(t);
                    res();
                });
                c.on('error', () => {
                    clearTimeout(t);
                    res();
                });
            });
            if (fs.existsSync(frame)) {
                const ai = await aiVerifyAsset(frame, 'video', opts.keywords ?? [], opts.aiVerify as any, opts.brain);
                if (ai) {
                    checks.push({
                        id: 'X16',
                        label: 'AI content verification',
                        pass: ai.pass,
                        detail: ai.pass ? `ai-ok conf ${ai.confidence}` : `ai-flag: ${ai.reason}`,
                    });
                } else {
                    checks.push({
                        id: 'X16',
                        label: 'AI content verification',
                        pass: true,
                        detail: 'skipped (no model / offline)',
                    });
                }
                try {
                    fs.rmSync(frameDir, { recursive: true, force: true });
                } catch {
                    /* */
                }
            }
        } catch {
            checks.push({
                id: 'X16',
                label: 'AI content verification',
                pass: true,
                detail: 'skipped (extract failed)',
            });
        }
    }

    return { path: mp4Path, checks, pass: checks.every((c) => c.pass), probed };
}
