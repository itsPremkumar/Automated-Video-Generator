#!/usr/bin/env node
/**
 * bin/agentic-batch.ts — generate AND end-to-end verify MULTIPLE agentic videos.
 *
 *   npx tsx bin/agentic-batch.ts            # run all topics
 *   npx tsx bin/agentic-batch.ts --resume   # skip completed jobs (restart-safe)
 *   npx tsx bin/agentic-batch.ts --parallel 3   # bounded concurrency (default 1)
 *
 * Feature D: now uses the proven durable batch queue (src/adapters/cli/batch-queue.ts)
 * so progress is persisted to output/batch-manifest.json after every job and a
 * crash mid-batch can be resumed with --resume without re-running finished videos.
 * Each job renders a real MP4 and is verified with the bundled ffmpeg.
 */
import dotenv from 'dotenv';
// Load .env from project root before anything else
dotenv.config();

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { runAgenticPipeline, renderAgenticSlideshow } from '../src/agentic/orchestrate.js';
import { runBatch, type BatchJobInput, type BatchJobResult, BATCH_MANIFEST_PATH } from '../src/adapters/cli/batch-queue.js';

const ffmpeg: string = require('ffmpeg-static');

interface TopicSpec {
    topic: string;
    title: string;
    orientation: 'portrait' | 'landscape';
}

const TOPICS: TopicSpec[] = [
    { topic: '5 simple home workout exercises for beginners', title: 'Home Workout', orientation: 'landscape' },
    { topic: '3 easy vegan dinner recipes you can cook in 15 minutes', title: 'Quick Vegan Dinners', orientation: 'portrait' },
    { topic: 'how to stay focused while studying: 4 proven techniques', title: 'Study Focus', orientation: 'landscape' },
];

/** Verify a rendered MP4 using the bundled ffmpeg (tolerant of its non-zero exit). */
function verifyVideo(mp4: string): { ok: boolean; video: boolean; audio: boolean; duration: string; codec: string; dims: string; size: number; note: string } {
    const size = fs.statSync(mp4).size;
    let raw = '';
    try {
        raw = execFileSync(ffmpeg, ['-i', mp4], { stderr: 'pipe' }).toString();
    } catch (e: any) {
        raw = (e.stderr || '').toString();
    }
    const hasVideo = /Stream #0:\d+.*Video:/.test(raw);
    const hasAudio = /Stream #0:\d+.*Audio:/.test(raw);
    const durM = raw.match(/Duration:\s*([\d:.]+)/);
    const codecM = raw.match(/Video:\s*(\w+)/);
    const dimsM = raw.match(/(\d{3,4}x\d{3,4})/);
    const ok = hasVideo && size > 1000 && !!durM;
    return {
        ok,
        video: hasVideo,
        audio: hasAudio,
        duration: durM ? durM[1] : '?',
        codec: codecM ? codecM[1] : '?',
        dims: dimsM ? dimsM[1] : '?',
        size,
        note: ok ? 'valid container + video stream' : 'INVALID',
    };
}

async function main() {
    const argv = process.argv.slice(2);
    const resume = argv.includes('--resume');
    const parallelIdx = argv.indexOf('--parallel');
    const concurrency = parallelIdx >= 0 ? Math.max(1, Number(argv[parallelIdx + 1]) || 1) : 1;

    const inputs: BatchJobInput[] = TOPICS.map((t, i) => ({
        id: `agentic_${i}_${t.title.replace(/[^a-z0-9]+/gi, '_')}`.slice(0, 64),
        index: i,
        title: t.title,
    }));

    const executeJob = async (job: BatchJobInput): Promise<BatchJobResult> => {
        const spec = TOPICS[job.index];
        try {
            console.log(`\n──────── # ${job.index + 1} ${spec.title} (${spec.orientation}) ────────`);
            const res = await runAgenticPipeline({
                topic: spec.topic,
                title: spec.title,
                backend: 'agent',
                orientation: spec.orientation,
                preferVisual: 'image',
            });
            const mp4 = await renderAgenticSlideshow(res, {});
            const v = verifyVideo(mp4);
            console.log(`   gate=${res.gate.pass ? 'PASS' : 'BLOCKED'} | video=${v.video} audio=${v.audio} dur=${v.duration} codec=${v.codec} dims=${v.dims} size=${v.size}B`);
            console.log(`   → ${mp4}`);
            if (!v.ok) {
                return { outcome: 'failed', error: `verification failed: ${v.note}`, outputPath: mp4 };
            }
            return { outcome: 'completed', outputPath: mp4 };
        } catch (e: any) {
            console.error(`   ✗ ERROR: ${e?.message}`);
            return { outcome: 'failed', error: e?.message };
        }
    };

    console.log(`\n══════ AGENTIC BATCH (resume=${resume}, concurrency=${concurrency}) ══════`);
    const manifest = await runBatch(inputs, { executeJob, concurrency, resume });

    const okCount = manifest.jobs.filter((j) => j.outcome === 'completed').length;
    console.log(`\n════════ BATCH SUMMARY: ${okCount}/${manifest.jobs.length} completed ════════`);
    for (const j of manifest.jobs) {
        const mark = j.outcome === 'completed' ? '✅' : j.outcome === 'pending' ? '⏳' : '❌';
        console.log(`  ${mark} ${j.title} — ${j.outcome}${j.error ? ` (${j.error})` : ''}`);
    }
    if (okCount !== manifest.jobs.length) {
        console.log(`\n💡 Re-run with --resume to continue from where it stopped (manifest: ${BATCH_MANIFEST_PATH}).`);
        process.exitCode = 1;
    }
}

main();
