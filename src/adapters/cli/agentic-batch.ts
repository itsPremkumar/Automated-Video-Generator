#!/usr/bin/env tsx
/**
 * agentic-batch.ts — BATCH CLI with wave scheduling, preview mode, and
 * dynamic job generation.
 *
 * Usage:
 *   npx tsx src/adapters/cli/agentic-batch.ts                    # Run all jobs in agentic-scripts.json
 *   npx tsx src/adapters/cli/agentic-batch.ts --parallel 3      # Run with 3 concurrent jobs per wave
 *   npx tsx src/adapters/cli/agentic-batch.ts --preview         # Preview without fetching/rendering
 *   npx tsx src/adapters/cli/agentic-batch.ts --generate        # Generate dynamic jobs from topics
 *   npx tsx src/adapters/cli/agentic-batch.ts --generate --topics "AI coding,Video editing,Photography"
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode download-images             # Fetch ONLY images
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode download-videos             # Fetch ONLY videos
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode download-music              # Fetch ONLY music
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode generate-voice-edgetts      # Voice ONLY via Edge-TTS
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode generate-voice-voicebox    # Voice ONLY via Voicebox/Kokoro
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode clone-voice --job <id>      # Clone a person's voice
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode plan                        # Plan ONLY (no network)
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode download-images --job gen_3scene_hookfirst
 *   npx tsx src/adapters/cli/agentic-batch.ts --search "eagle" --count 10        # Download 10 eagle images (ad-hoc, no JSON)
 *   npx tsx src/adapters/cli/agentic-batch.ts --search "ocean waves" --count 5 --kind video
 *
 * Bulk fetch can ALSO be driven from agentic-scripts.json by setting
 *   "mode": "download-images", "searchQuery": "eagle", "downloadCount": 10
 * on a job — the bulk path ignores the script and pulls N distinct images of the subject.
 * Environment:
 *   AGENTIC_WAVE_SIZE=3           Override wave size
 *   AGENTIC_PREVIEW=1             Enable preview mode
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { runBatchWaves } from '../../agentic/operations/wave-scheduler.js';
import { generatePreview, printPreview, writePreview } from '../../agentic/operations/preview.js';
import { generateJobBatch, writeJobBatch } from '../../agentic/operations/job-generator.js';
import { AgentBrain } from '../../agentic/ai/brain.js';
import { buildPipelineRequest } from './cli-job.js';
import type { AgenticCliJob } from './cli-job.js';
import { runSingleFeature, type SingleFeatureMode } from '../../agentic/operations/single-feature.js';

const INPUT_DIR = path.join(process.cwd(), 'input', 'scripts');
const SCRIPTS_FILE = path.join(INPUT_DIR, 'agentic-scripts.json');

function parseArgv(argv: string[]): { [key: string]: string | boolean | number } {
    const s = argv.slice(2);
    const args: { [key: string]: string | boolean | number } = {};
    for (let i = 0; i < s.length; i++) {
        const k = s[i];
        if (k.startsWith('--')) {
            const key = k.slice(2);
            const next = s[i + 1];
            if (next && !next.startsWith('--')) {
                args[key] = isNaN(Number(next)) ? next : Number(next);
                i++;
            } else {
                args[key] = true;
            }
        }
    }
    return args;
}

function readJobJson(): any[] {
    if (!fs.existsSync(SCRIPTS_FILE)) {
        console.error(`✖ No job file at ${SCRIPTS_FILE}`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(SCRIPTS_FILE, 'utf-8'));
}

async function main() {
    const args = parseArgv(process.argv);
    const parallel = Number(args.parallel || args.waveSize || process.env.AGENTIC_WAVE_SIZE || 3);
    const preview = args.preview === true || process.env.AGENTIC_PREVIEW === '1';
    const generate = args.generate === true;
    const topics = args.topics ? String(args.topics).split(',').map((t) => t.trim()) : undefined;
    const singleMode = args.mode ? String(args.mode) : undefined;
    const jobFilter = args.job ? String(args.job) : undefined;

    // ─── Generate mode: create dynamic jobs from topics ───
    if (generate) {
        const topicList = topics ?? ['AI coding', 'Video editing', 'Photography', 'Web development', 'Data science'];
        console.log(`\n🎯 Generating dynamic jobs for ${topicList.length} topics...`);

        const brain = new AgentBrain();
        const jobs = await generateJobBatch(topicList, { variantsPerTopic: 3, brain });

        const outputPath = path.join(INPUT_DIR, 'agentic-scripts.json');
        writeJobBatch(jobs, outputPath);
        console.log(`✅ Generated ${jobs.length} jobs → ${outputPath}`);

        if (preview) {
            console.log(`\n📋 Previewing generated jobs...\n`);
            for (const job of jobs) {
                const id = (job.id || `job_${Date.now()}`).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 64);
                const topic = job.topic ?? job.title ?? 'Untitled video';
                const report = await generatePreview(job, id, topic);
                printPreview(report);
            }
            return;
        }
        return;
    }

    // ─── Ad-hoc bulk fetch: "download N <subject> images/videos" ───
    //   npx tsx src/adapters/cli/agentic-batch.ts --search "eagle" --count 10
    //   npx tsx src/adapters/cli/agentic-batch.ts --search "ocean waves" --count 5 --kind video
    // No JSON editing required — runs standalone from the CLI args.
    const searchQuery = args.search ? String(args.search) : undefined;
    if (searchQuery) {
        const count = Number(args.count || 10);
        const kind = (args.kind === 'video' ? 'video' : 'image') as 'image' | 'video';
        const { runBulkImageFetch } = await import('../../agentic/operations/bulk-fetch.js');
        const outDir = path.resolve(process.cwd(), 'workspace', 'bulk', kind === 'video' ? 'videos' : 'images', searchQuery.replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 40));
        fs.mkdirSync(outDir, { recursive: true });
        console.log(`\n🎯 Bulk ${kind} fetch: "${searchQuery}" × ${count} → ${outDir}`);
        const files = await runBulkImageFetch(searchQuery, count, outDir, (args.orientation as any) || '', kind);
        console.log(`  ✅ Downloaded ${files.length}/${count} distinct ${kind}(s):`);
        for (const f of files.slice(0, 10)) console.log(`     • ${f}`);
        if (files.length > 10) console.log(`     … +${files.length - 10} more`);
        return;
    }

    // ─── Single-feature mode: run ONLY one stage (download/voice/clone/plan) ───
    if (singleMode) {
        const jobs = readJobJson() as AgenticCliJob[];
        const filtered = jobFilter ? jobs.filter((j) => (j.id ?? j.title) === jobFilter) : jobs;
        if (filtered.length === 0) {
            console.error(`✖ No jobs matched filter "${jobFilter ?? ''}"`);
            process.exit(1);
        }

        // ─── Broadcast: apply ONE signal override to EVERY job in this run ───
        //   e.g.  --broadcast "exportFormat:gif"   (re-applies to all jobs)
        //   e.g.  --broadcast "filterByScene:{0:bw}" (real JSON value)
        // This is the "apply one signal to all jobs" iteration primitive that
        // goes BEYOND the --mode filter — it mutates each job's config before
        // dispatch, so a single command re-grades / re-exports the whole set.
        const broadcast = args.broadcast ? String(args.broadcast) : undefined;
        if (broadcast) {
            const colon = broadcast.indexOf(':');
            if (colon < 0) {
                console.error(`✖ --broadcast must be "field:value" (got "${broadcast}")`);
                process.exit(1);
            }
            const field = broadcast.slice(0, colon);
            const raw = broadcast.slice(colon + 1);
            let value: any = raw;
            // attempt JSON parse for objects/arrays/numbers/booleans
            try { value = JSON.parse(raw); } catch { /* keep string */ }
            console.log(`  📡 Broadcasting ${field} = ${JSON.stringify(value)} → ${filtered.length} job(s)`);
            for (const j of filtered) (j as any)[field] = value;
        }

        console.log(
            `\n🎯 Single-feature mode: ${singleMode} | ${filtered.length} job(s)` +
                (jobFilter ? ` (filter: ${jobFilter})` : ''),
        );
        const validModes = [
            'plan', 'visuals', 'voice', 'render', 'download-images', 'download-videos',
            'download-music', 'download-sfx', 'download-url', 'generate-voice-edgetts',
            'generate-voice-voicebox', 'clone-voice', 'apply-advanced', 'rerender',
            'render-gif', 'render-poster', 'render-contact-sheet', 'compose',
        ];
        if (!validModes.includes(singleMode)) {
            console.error(`✖ Invalid --mode "${singleMode}". Valid: ${validModes.join(', ')}`);
            process.exit(1);
        }
        for (const job of filtered) {
            const id = (job.id || `job_${Date.now()}`).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 64);
            const topic = job.topic ?? job.title ?? 'Untitled video';
            try {
                const res = await runSingleFeature(job, id, singleMode as SingleFeatureMode);
                console.log(`  ✅ ${job.title}: ${res.summary}`);
                if (res.outputs.length > 0) {
                    console.log(`     outputs (${res.outputs.length}):`);
                    for (const o of res.outputs.slice(0, 8)) console.log(`       • ${o}`);
                    if (res.outputs.length > 8) console.log(`       … +${res.outputs.length - 8} more`);
                }
            } catch (e) {
                console.error(`  ❌ ${job.title}: ${(e as Error)?.message ?? e}`);
            }
        }
        return;
    }

    // ─── Preview mode: show what would be fetched without network ───
    if (preview) {
        const jobs = readJobJson();
        console.log(`\n📋 Preview mode: ${jobs.length} jobs (no network calls)\n`);

        const previewDir = path.join(process.cwd(), 'workspace', 'previews');
        fs.mkdirSync(previewDir, { recursive: true });

        for (const job of jobs) {
            const id = (job.id || `job_${Date.now()}`).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 64);
            const topic = job.topic ?? job.title ?? 'Untitled video';
            const report = await generatePreview(job, id, topic);
            printPreview(report);
            writePreview(report, path.join(previewDir, `${id}.json`));
        }

        console.log(`\n✅ Previews written to ${previewDir}/`);
        return;
    }

    // ─── Run mode: wave-scheduled batch ───
    const jobs: AgenticCliJob[] = readJobJson();
    console.log(`\n╔═══════════════════════════════════════════════════╗`);
    console.log(`║   Agentic Video Pipeline — Batch Mode               ║`);
    console.log(`║   ${jobs.length} jobs | wave size: ${parallel} | RAM-aware scheduling  ║`);
    console.log(`╚═══════════════════════════════════════════════════╝\n`);

    const results = await runBatchWaves(jobs, parallel, (report) => {
        console.log(`\n  📊 Wave ${report.waveNumber}/${report.totalWaves} complete: ${report.completed}✅ ${report.failed}❌`);
    });

    // ─── Summary ───
    const completed = results.filter((r) => r.success).length;
    const failed = results.length - completed;
    console.log(`\n${'═'.repeat(55)}`);
    console.log(`  Batch Summary: ${completed}/${results.length} completed, ${failed} failed`);

    if (failed > 0) {
        console.log(`  Failed jobs:`);
        for (const r of results.filter((r) => !r.success)) {
            console.log(`    ❌ ${r.title}: ${r.error}`);
        }
        process.exitCode = 1;
    }

    // List output files
    const outputDir = path.join(process.cwd(), 'output');
    if (fs.existsSync(outputDir)) {
        const outputs = fs.readdirSync(outputDir).filter((f) => f.endsWith('.mp4'));
        if (outputs.length > 0) {
            console.log(`\n  Generated videos:`);
            for (const f of outputs) {
                const p = path.join(outputDir, f);
                const sizeKb = Math.round(fs.statSync(p).size / 1024);
                console.log(`    🎬 ${f} (${sizeKb}KB)`);
            }
        }
    }
}

main().catch((e) => {
    console.error(`\n❌ Fatal: ${e.message ?? e}`);
    process.exit(1);
});
