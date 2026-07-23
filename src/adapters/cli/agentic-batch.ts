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
 *
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
