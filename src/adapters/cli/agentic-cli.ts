#!/usr/bin/env tsx
/**
 * agentic-cli.ts — SIMPLE JSON-INPUT CLI for the agentic pipeline.
 *
 * Reads `input/agentic-scripts.json`, processes each job through the
 * full agentic pipeline (plan → acquire → verify → decide → gate → render).
 *
 * Supports:
 *   - Custom scripts with [Visual: filename] (local assets) tags
 *   - Custom scripts with [Visual: search keywords] (online stock) tags
 *   - localAssets/videoClips arrays for explicit asset binding
 *   - All agentic pipeline benefits (gates, AI brain, plugins, operations)
 *
 * Usage:  npx tsx src/adapters/cli/agentic-cli.ts
 *         npm run generate:agentic
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { runAgenticPipeline } from '../../agentic/orchestrator/pipeline.js';
import { renderAgenticSlideshow } from '../../agentic/orchestrator/render.js';
import type { PipelineRequest } from '../../agentic/orchestrator/types.js';
import type { AgenticBackend } from '../../agentic/ai/agent.js';
import { AgenticCliJob, buildPipelineRequest } from './cli-job.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const INPUT_DIR = path.join(process.cwd(), 'input', 'scripts');
const SCRIPTS_FILE = path.join(INPUT_DIR, 'agentic-scripts.json');

// ─── Config ──────────────────────────────────────────────────────────────────

// ─── CLI Entry ──────────────────────────────────────────────────────────────

async function main() {
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║   Agentic Video Pipeline CLI                      ║');
    console.log('╚═══════════════════════════════════════════════════╝');
    console.log();

    if (!fs.existsSync(SCRIPTS_FILE)) {
        console.error(`❌ Input file not found: ${SCRIPTS_FILE}`);
        console.error('   Create an agentic-scripts.json file in input/');
        console.error('   See input/agentic-scripts.example.json for format.');
        process.exit(1);
    }

    const raw = fs.readFileSync(SCRIPTS_FILE, 'utf-8');
    let jobs: AgenticCliJob[];
    try {
        jobs = JSON.parse(raw);
        if (!Array.isArray(jobs) || jobs.length === 0) {
            console.error('❌ agentic-scripts.json must be a non-empty array.');
            process.exit(1);
        }
    } catch {
        console.error(`❌ JSON parse error in ${SCRIPTS_FILE}`);
        process.exit(1);
    }

    let completed = 0;
    let failed = 0;

    for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const jobLabel = job.title || `Job ${i + 1}`;
        console.log(`\n${'─'.repeat(55)}`);
        console.log(`  Job ${i + 1}/${jobs.length}: "${jobLabel}"`);
        console.log(`${'─'.repeat(55)}`);

        const topic = job.topic ?? job.title ?? 'Untitled video';
        const id = sanitizeId(job.id ?? job.title ?? `job_${Date.now()}`);

        const req = buildPipelineRequest(job, id, topic);

        try {
            const result = await runAgenticPipeline(
                req,
                (progress) => {
                    const pct = progress.percent?.toFixed(0) ?? '??';
                    const stage = progress.stage ?? '?';
                    const msg = (progress.message ?? '').substring(0, 80);
                    if (pct === '100') {
                        process.stdout.write(`\r  ✅ [${stage}] ${msg}\n`);
                    } else {
                        process.stdout.write(`\r  ⏳ [${pct}%] ${stage}: ${msg}  `);
                    }
                },
            );

            if (result.gate.pass && result.manifest) {
                completed++;
                console.log(`\n  ✅ Gate PASS — ${result.plan.scenes.length} scenes, ${result.plan.totalDurationSec}s`);
                console.log(`  📁 Workspace: ${result.workspace.root}`);
                console.log(`  🎬 Rendering video...`);

                // Render the final video using the agentic slideshow renderer
                const outPath = path.resolve(process.cwd(), 'output', id);
                fs.mkdirSync(outPath, { recursive: true });

                const finalMp4 = await renderAgenticSlideshow(result, {
                    outPath: path.join(outPath, `${job.title || 'output'}.mp4`),
                    crossfadeSec: 0.3,
                    burnCaptions: job.captions !== 'none',
                    intro: job.intro,
                    outro: job.outro,
                    // Phase 1 — extended render opts
                    sfx: job.sfx,
                    captions: job.captions,
                    captionTheme: job.captionTheme,
                    kinetic: job.kineticText,
                    kenBurns: job.kenBurns,
                    preset: job.preset,
                    jCutSec: job.jCutSec,
                });

                if (fs.existsSync(finalMp4)) {
                    const sizeKb = Math.round(fs.statSync(finalMp4).size / 1024);
                    console.log(`  🎬 Output: ${finalMp4} (${sizeKb} KB)`);
                } else {
                    console.log(`  ⏳ Output pending — check workspace: ${result.workspace.root}/render/`);
                }
            } else {
                failed++;
                const failReasons = result.gate.checks
                    .filter((c) => !c.pass)
                    .map((c) => `    ❌ ${c.id}: ${c.label} — ${c.detail}`)
                    .join('\n');
                console.log(`\n  ❌ Gate FAIL — ${result.plan.scenes.length} scenes`);
                if (failReasons) console.log(failReasons);
            }
        } catch {
            failed++;
            console.error(`\n  ❌ Job failed with error`);
        }
    }

    // ─── Summary ────────────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(55)}`);
    console.log(`  Summary: ${completed} completed, ${failed} failed out of ${jobs.length} job(s)`);
    if (failed > 0) process.exitCode = 1;
}

function sanitizeId(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 64) || `job_${Date.now()}`;
}

main().catch((e) => {
    console.error(`\n❌ Fatal: ${e.message ?? e}`);
    process.exit(1);
});
