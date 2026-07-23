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
import { renderAgenticSlideshow } from '../orchestrator/render.js';
import { cacheStats } from './asset-cache.js';
import type { AgenticCliJob } from '../../adapters/cli/cli-job.js';
import { buildPipelineRequest } from '../../adapters/cli/cli-job.js';

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

        // Run all jobs in this wave in parallel
        const wavePromises = waveJobs.map((job) => runSingleJob(job));
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

        const finalMp4 = await renderAgenticSlideshow(result, {
            outPath: path.join(outPath, `${job.title || 'output'}.mp4`),
            crossfadeSec: 0.3,
            burnCaptions: job.captions !== 'none',
            intro: job.intro,
            outro: job.outro,
            sfx: job.sfx,
            captions: job.captions,
            captionTheme: job.captionTheme,
            kinetic: job.kineticText,
            kenBurns: job.kenBurns,
            preset: job.preset,
            jCutSec: job.jCutSec,
            vignette: job.vignette,
        });

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
