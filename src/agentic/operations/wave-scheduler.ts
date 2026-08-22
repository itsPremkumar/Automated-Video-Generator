/**
 * Wave-scheduled batch runner for agentic video generation.
 *
 * Runs multiple jobs in parallel waves, respecting RAM constraints:
 * - Max 3 concurrent jobs per wave (RAM-safe)
 * - After each wave, kills any RAM-hogging processes
 * - Reports progress as "wave 1/3: jobs 1-3 complete"
 *
 * This replaces the sequential `for` loop in agentic-cli.ts with a
 * wave-scheduled approach that's 3x faster on multi-core machines.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runAgenticPipeline } from '../orchestrator/pipeline.js';
import { composeVideo } from './compose.js';
import { cacheStats } from './asset-cache.js';
import type { AgenticCliJob } from '../../adapters/cli/cli-job.js';
import { buildPipelineRequest } from '../../adapters/cli/cli-job.js';

/**
 * Make a human title safe as a cross-platform FILENAME (no extension).
 * Windows forbids \ / : * ? " < > | in filenames; a raw title like
 * "WAVE A: zoomblur (landscape)" previously truncated at the colon and
 * produced a 0-byte file. We keep it readable: strip/replace only the
 * illegal characters, collapse whitespace, and cap length. Falls back to a
 * provided id when the title sanitizes to empty.
 */
export function sanitizeVideoFilename(title: string | undefined, fallback = 'output'): string {
    const cleaned = (title ?? '')
        .replace(/[\\/:*?"<>|]/g, ' ') // illegal on Windows/macOS
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f]/g, ' ') // control chars
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/, '') // no trailing dot/space (Windows strips them)
        .trim()
        .slice(0, 120);
    return cleaned.length > 0 ? cleaned : fallback;
}

export interface WaveResult {
    jobId: string;
    title: string;
    success: boolean;
    outputPath?: string;
    error?: string;
    durationSec?: number;
}

export interface WaveReport {
    waveNumber: number;
    totalWaves: number;
    jobs: WaveResult[];
    completed: number;
    failed: number;
}

/**
 * Default wave size — 3 jobs in parallel is RAM-safe on a 5.86GB machine.
 */
const DEFAULT_WAVE_SIZE = 3;

/**
 * Run a batch of jobs in parallel waves.
 *
 * @param jobs       The job array (from agentic-scripts.json)
 * @param waveSize   Max concurrent jobs per wave (default 3)
 * @param onProgress Optional progress callback
 */
export async function runBatchWaves(
    jobs: AgenticCliJob[],
    waveSize: number = DEFAULT_WAVE_SIZE,
    onProgress?: (report: WaveReport) => void,
): Promise<WaveResult[]> {
    const allResults: WaveResult[] = [];
    const totalJobs = jobs.length;
    const totalWaves = Math.ceil(totalJobs / waveSize);

    console.log(`\n🌊 Wave-scheduled batch: ${totalJobs} jobs in ${totalWaves} waves (wave size: ${waveSize})`);

    for (let waveIdx = 0; waveIdx < totalWaves; waveIdx++) {
        const start = waveIdx * waveSize;
        const end = Math.min(start + waveSize, totalJobs);
        const waveJobs = jobs.slice(start, end);
        const waveNumber = waveIdx + 1;

        console.log(`\n  Wave ${waveNumber}/${totalWaves}: jobs ${start + 1}-${end} (${waveJobs.length} concurrent)`);

        // Run all jobs in this wave in parallel (with bounded retries — a
        // transient network/DNS blip must not permanently kill a job)
        const wavePromises = waveJobs.map((job) => runSingleJobWithRetry(job));
        const waveResults = await Promise.allSettled(wavePromises);

        const waveReport: WaveReport = {
            waveNumber,
            totalWaves,
            jobs: [],
            completed: 0,
            failed: 0,
        };

        for (let i = 0; i < waveResults.length; i++) {
            const result = waveResults[i];
            const job = waveJobs[i];
            if (result.status === 'fulfilled') {
                waveReport.jobs.push(result.value);
                if (result.value.success) {
                    waveReport.completed++;
                    console.log(`    ✅ ${result.value.title} → ${result.value.outputPath}`);
                } else {
                    waveReport.failed++;
                    console.log(`    ❌ ${result.value.title}: ${result.value.error}`);
                }
            } else {
                waveReport.failed++;
                const errorResult: WaveResult = {
                    jobId: job.id || `job_${start + i}`,
                    title: job.title,
                    success: false,
                    error: result.reason?.message || String(result.reason),
                };
                waveReport.jobs.push(errorResult);
                console.log(`    ❌ ${job.title}: ${errorResult.error}`);
            }
        }

        allResults.push(...waveReport.jobs);
        onProgress?.(waveReport);

        // RAM cleanup between waves — kill any process using >500MB
        if (waveIdx < totalWaves - 1) {
            await cleanupRam();
        }

        // Show cache stats
        const stats = cacheStats();
        if (stats.entries > 0) {
            console.log(`    📦 Asset cache: ${stats.entries} entries, ${(stats.totalSize / 1024 / 1024).toFixed(1)}MB`);
        }
    }

    const completed = allResults.filter((r) => r.success).length;
    const failed = allResults.length - completed;
    console.log(`\n  Summary: ${completed}/${allResults.length} completed, ${failed} failed`);

    return allResults;
}

/**
 * Run a single job through the full pipeline + render.
 */
async function runSingleJob(job: AgenticCliJob): Promise<WaveResult> {
    const startTime = Date.now();
    const topic = job.topic ?? job.title ?? 'Untitled video';
    const id = (job.id || `job_${Date.now()}`).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 64);

    try {
        const req = buildPipelineRequest(job, id, topic);

        const result = await runAgenticPipeline(req, (progress) => {
            const pct = progress.percent?.toFixed(0) ?? '??';
            const stage = progress.stage ?? '?';
            process.stdout.write(`\r    ⏳ [${pct}%] ${stage}: ${(progress.message ?? '').substring(0, 60)}  `);
        });

        if (req.dryRun) {
            process.stdout.write(`\r    ✅ DRY RUN: ${result.plan.scenes.length} scenes planned\n`);
            return {
                jobId: id,
                title: job.title,
                success: true,
                durationSec: result.plan.totalDurationSec,
            };
        }

        if (!result.gate.pass || !result.manifest) {
            return {
                jobId: id,
                title: job.title,
                success: false,
                error: `Gate failed: ${result.gate.checks.filter((c) => !c.pass).map((c) => c.label).join(', ')}`,
            };
        }

        console.log(`\r    ✅ Gate PASS — ${result.plan.scenes.length} scenes, ${result.plan.totalDurationSec}s`);
        console.log(`    🎬 Rendering video...`);

        const outPath = path.resolve(process.cwd(), 'output', id);
        fs.mkdirSync(outPath, { recursive: true });

        // Route through composeVideo — the full-featured ffmpeg composer that
        // bakes EVERY advanced signal (emoji stickers, progress bar, kinetic
        // captions, palette grade, FX, lower-third, CTA/outro). The legacy
        // renderAgenticSlideshow path silently dropped emoji/progress/kinetic,
        // so a job requesting them produced textless/bare clips. composeVideo
        // is what the single-feature/demo path already uses successfully.
        const assets = result.manifest!.assets;
        const sceneCount = result.plan.scenes.length;
        const sceneVisuals: string[] = [];
        const sceneAudio: string[] = [];
        for (let i = 0; i < sceneCount; i++) {
            const a = assets.find((x) => x.kind !== 'music' && x.sceneIndex === i)
                ?? assets.find((x) => x.kind !== 'music');
            sceneVisuals.push(a?.localPath ?? '');
            sceneAudio.push(a?.audioPath ?? '');
        }
        const musicAsset = assets.find((x) => x.kind === 'music');
        const composeOut = path.join(outPath, `${sanitizeVideoFilename(job.title, id)}.mp4`);
        // Inline [Filter: bw|vintage|sepia] tags live on plan.scenes[].filter;
        // composeVideo reads job.filterByScene — bridge the two so the CLI batch
        // path honors per-scene filters exactly like renderAgenticSlideshow does.
        const filterByScene: Record<number, 'bw' | 'vintage' | 'sepia'> = {};
        (result.plan.scenes as any[]).forEach((s, i) => {
            if (s?.filter && ['bw', 'vintage', 'sepia'].includes(s.filter)) {
                filterByScene[i] = s.filter;
            }
        });
        // Job-level `grade` (noir/cyberpunk/sunset/…) was mapped into the request
        // but never reached composeVideo — applySceneGradeVignette only reads
        // PER-SCENE grade, so noir/cyberpunk/sunset jobs rendered ungraded.
        // Stamp the job grade onto every scene that doesn't declare its own.
        const jobGrade = (job as any).grade as string | undefined;
        const scenesWithGrade = jobGrade
            ? (result.plan.scenes as any[]).map((s) => ({ ...s, grade: s.grade ?? jobGrade }))
            : (result.plan.scenes as any[]);
        const composeRes = await composeVideo({
            job: { ...job, filterByScene },
            scenes: scenesWithGrade,
            sceneVisuals,
            sceneAudio,
            music: musicAsset?.localPath,
            outDir: path.join(outPath, '_compose'),
            inputDir: path.resolve('input', 'visuals'),
            scenes: result.plan.scenes as any,
        });
        const finalMp4 = composeRes.video ?? composeOut;

        if (fs.existsSync(finalMp4)) {
            const sizeKb = Math.round(fs.statSync(finalMp4).size / 1024);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`    🎬 Output: ${finalMp4} (${sizeKb}KB) in ${elapsed}s`);
            return {
                jobId: id,
                title: job.title,
                success: true,
                outputPath: finalMp4,
                durationSec: result.plan.totalDurationSec,
            };
        } else {
            return {
                jobId: id,
                title: job.title,
                success: false,
                error: 'Render produced no output file',
            };
        }
    } catch (e: any) {
        return {
            jobId: id,
            title: job.title,
            success: false,
            error: e?.message || String(e),
        };
    }
}

/**
 * Kill RAM-hogging processes between waves to stay within the 800MB free budget.
 * Uses taskkill on Windows (MSYS-compatible single-slash syntax).
 */
async function cleanupRam(): Promise<void> {
    try {
        const { execSync } = require('child_process');
        // Never kill our own process tree — the batch's tsx/node process can
        // legitimately exceed 500MB while downloading UHD videos / running
        // ffmpeg children. Killing it would kill the batch itself.
        const ownPid = process.pid;
        let ownTree = new Set<number>([ownPid]);
        try {
            // Collect all descendants of our process (children, grandchildren…)
            let frontier = [ownPid];
            for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
                const csv = String(execSync(
                    `wmic process where "ParentProcessId=${frontier.join(' or ParentProcessId=')}" get ProcessId /format:csv 2>NUL`,
                    { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
                ));
                const kids = csv
                    .split('\n')
                    .map((l: string) => l.trim())
                    .filter((l: string) => l && /^\d+$/.test(l))
                    .map((l: string) => Number(l));
                ownTree = new Set([...ownTree, ...kids]);
                frontier = kids;
            }
        } catch {
            /* descendant enumeration failed — own PID is still protected */
        }
        // List processes by memory usage, kill any over 500MB
        // This is a best-effort cleanup — failures are silently ignored
        try {
            const output = execSync(
                'wmic process where "WorkingSetSize > 524288000" get ProcessId,Name,WorkingSetSize /format:csv 2>NUL',
                { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
            );
            const lines = output.trim().split('\n').slice(1); // skip header
            for (const line of lines) {
                const parts = line.split(',');
                if (parts.length >= 3) {
                    const pid = parts[1]?.trim();
                    const name = parts[2]?.trim();
                    if (pid && name && !name.includes('hermes') && !name.includes('electron')) {
                        const pidNum = Number(pid);
                        if (!pidNum || ownTree.has(pidNum)) continue; // never kill ourselves/descendants
                        try {
                            execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', timeout: 2000 });
                            console.log(`    🧹 Killed RAM hog: ${name} (PID ${pid})`);
                        } catch {
                            /* ignore */
                        }
                    }
                }
            }
        } catch {
            /* wmic not available or no hogs found */
        }
    } catch {
        /* cleanup is best-effort */
    }
}

/**
 * Run a single job, retrying on failure. A transient network/DNS outage
 * (e.g. `getaddrinfo ENOTFOUND videos.pexels.com`) previously killed a job
 * permanently — the gate rejected placeholder-card assets and the batch
 * moved on. Retrying the same job a bounded number of times with a short
 * backoff lets it succeed once connectivity recovers. Deterministic
 * failures (bad config, bad topic) simply fail all attempts and surface as
 * failed.
 *
 * Retry count/backoff are tunable via env: AGENTIC_JOB_RETRIES (default 2)
 * and AGENTIC_RETRY_DELAY_MS (default 15000).
 */
async function runSingleJobWithRetry(job: AgenticCliJob): Promise<WaveResult> {
    const maxRetries = Number(process.env.AGENTIC_JOB_RETRIES ?? 2);
    const delayMs = Number(process.env.AGENTIC_RETRY_DELAY_MS ?? 15000);
    let lastResult: WaveResult | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
            const wait = delayMs * attempt; // 15s, 30s, …
            console.log(`    🔁 Retrying "${job.title}" (attempt ${attempt}/${maxRetries}) after ${Math.round(wait / 1000)}s…`);
            await new Promise((resolve) => setTimeout(resolve, wait));
        }
        lastResult = await runSingleJob(job);
        if (lastResult.success) return lastResult;
    }
    return lastResult!;
}
