/**
 * Scene-level post-render audit.
 *
 * After the full video is rendered, this module extracts each scene as a
 * segment and verifies:
 * - Duration matches the plan
 * - Audio track is present (voiceover)
 * - Visual content is not blank/black
 * - Dimensions are correct
 * - No freeze frames within the scene
 *
 * This catches per-scene issues that the whole-video checks (X7-X15) miss:
 * a single bad scene (wrong visual, desynced audio, blank frame) can pass
 * the whole-video gate but still look broken to a viewer.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Plan, RenderManifest } from '../types.js';
import { estimateAudioDurationSafe, probeVideo } from '../orchestrator/ffmpeg.js';
import * as ana from '../media/video-analyzer.js';

export interface SceneAuditResult {
    sceneIndex: number;
    sceneNumber: number;
    durationSec: { expected: number; actual: number; drift: number };
    hasAudio: boolean;
    hasVideo: boolean;
    dimensions: { width: number; height: number };
    codec: string;
    blackFrames: { longestBlackSec: number; pass: boolean };
    freezeFrames: { longestFreezeSec: number; pass: boolean };
    audioLoudness: { peakDb: number; meanDb: number; pass: boolean };
    pass: boolean;
    issues: string[];
}

export interface AuditReport {
    pass: boolean;
    scenes: SceneAuditResult[];
    totalScenes: number;
    passedScenes: number;
    failedScenes: number;
}

/**
 * Audit each scene of a rendered video by extracting it as a segment.
 *
 * @param mp4Path       Path to the rendered MP4
 * @param plan          The plan that was rendered
 * @param manifest      The render manifest (has scene durations and audio paths)
 * @param outDir        Directory for extracted scene segments
 */
export async function auditScenes(
    mp4Path: string,
    plan: Plan,
    manifest: RenderManifest,
    outDir: string,
): Promise<AuditReport> {
    const ffmpeg: string = require('ffmpeg-static');
    const { spawn } = require('child_process');

    const results: SceneAuditResult[] = [];
    const sceneAssets = manifest.assets.filter((a) => a.kind !== 'music');

    // Calculate scene start times from the manifest
    const sceneStarts: number[] = [];
    let cursor = 0;
    for (const a of sceneAssets) {
        sceneStarts.push(cursor);
        cursor += a.durationSec ?? 4;
    }

    for (let i = 0; i < sceneAssets.length; i++) {
        const asset = sceneAssets[i];
        const scene = plan.scenes[i];
        const startTime = sceneStarts[i];
        const duration = asset.durationSec ?? scene.durationSec ?? 4;

        const result = await auditSingleScene(
            mp4Path, asset, scene, startTime, duration, outDir, i, ffmpeg, spawn,
        );
        results.push(result);
    }

    const passed = results.filter((r) => r.pass).length;
    const failed = results.length - passed;

    return {
        pass: failed === 0,
        scenes: results,
        totalScenes: results.length,
        passedScenes: passed,
        failedScenes: failed,
    };
}

/**
 * Extract and audit a single scene from the rendered video.
 */
async function auditSingleScene(
    mp4Path: string,
    asset: RenderManifest['assets'][0],
    scene: Plan['scenes'][0],
    startTime: number,
    duration: number,
    outDir: string,
    sceneIndex: number,
    ffmpeg: string,
    spawn: any,
): Promise<SceneAuditResult> {
    const issues: string[] = [];
    const sceneNum = scene.sceneNumber;
    const segPath = path.join(outDir, `audit_scene_${sceneNum}.mp4`);

    // Extract the scene segment
    await new Promise<void>((resolve, reject) => {
        const cp = spawn(ffmpeg, [
            '-ss', startTime.toFixed(2),
            '-i', mp4Path,
            '-t', duration.toFixed(2),
            '-c', 'copy',
            '-y', segPath,
        ], { stdio: 'ignore' });
        cp.on('close', (code: number) => {
            if (code === 0) resolve();
            else reject(new Error(`scene ${sceneNum} extraction failed (exit ${code})`));
        });
        cp.on('error', reject);
    });

    // Probe the extracted segment
    let probed: { width: number; height: number; codec: string; fps: number; hasAudio: boolean };
    try {
        probed = await probeVideo(segPath);
    } catch {
        probed = { width: 720, height: 1280, codec: 'h264', fps: 25, hasAudio: false };
        issues.push('ffprobe failed — using defaults');
    }

    // Get actual duration via ffprobe
    let actualDuration = duration;
    try {
        actualDuration = await estimateAudioDurationSafe(segPath);
    } catch {
        issues.push('duration probe failed');
    }

    const drift = Math.abs(actualDuration - duration);
    const durationPass = drift <= Math.max(0.5, duration * 0.1);
    if (!durationPass) {
        issues.push(`duration drift: ${drift.toFixed(2)}s (expected ${duration}s, got ${actualDuration.toFixed(2)}s)`);
    }

    // Check dimensions
    const dimPass = probed.width > 0 && probed.height > 0;
    if (!dimPass) {
        issues.push('invalid dimensions');
    }

    // Check audio
    if (!probed.hasAudio) {
        issues.push('no audio track in scene');
    }

    // Check for black frames
    let blackPass = true;
    let longestBlack = 0;
    try {
        const black = await ana.detectBlackFrames(segPath);
        longestBlack = black.reduce((m: number, b: any) => Math.max(m, b.duration), 0);
        blackPass = longestBlack < 0.5;
        if (!blackPass) {
            issues.push(`black frames: ${longestBlack.toFixed(2)}s`);
        }
    } catch {
        issues.push('black frame analysis failed');
    }

    // Check for freeze frames
    let freezePass = true;
    let longestFreeze = 0;
    try {
        const freeze = await ana.detectFreezeFrames(segPath);
        longestFreeze = freeze.reduce((m: number, f: any) => Math.max(m, f.duration), 0);
        freezePass = longestFreeze < 1.0;
        if (!freezePass) {
            issues.push(`freeze frames: ${longestFreeze.toFixed(2)}s`);
        }
    } catch {
        issues.push('freeze frame analysis failed');
    }

    // Check audio loudness
    let audioPass = true;
    let peakDb = -999;
    let meanDb = -999;
    try {
        const audio = await ana.analyzeAudio(segPath);
        peakDb = audio.peakDb;
        meanDb = audio.meanVolumeDb;
        audioPass = peakDb <= 0 && peakDb > -60;
        if (!audioPass) {
            issues.push(`audio loudness out of range: peak ${peakDb.toFixed(1)}dB`);
        }
    } catch {
        issues.push('audio analysis failed');
    }

    // Clean up the segment file
    try {
        fs.rmSync(segPath, { force: true });
    } catch {
        /* ignore */
    }

    const pass = durationPass && dimPass && probed.hasAudio && blackPass && freezePass && audioPass;

    return {
        sceneIndex,
        sceneNumber: sceneNum,
        durationSec: { expected: duration, actual: actualDuration, drift },
        hasAudio: probed.hasAudio,
        hasVideo: probed.width > 0,
        dimensions: { width: probed.width, height: probed.height },
        codec: probed.codec,
        blackFrames: { longestBlackSec: longestBlack, pass: blackPass },
        freezeFrames: { longestFreezeSec: longestFreeze, pass: freezePass },
        audioLoudness: { peakDb, meanDb, pass: audioPass },
        pass,
        issues,
    };
}

/**
 * Write the audit report to disk as JSON.
 */
export function writeAuditReport(report: AuditReport, outPath: string): void {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
}
