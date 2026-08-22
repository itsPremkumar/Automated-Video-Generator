#!/usr/bin/env node
/**
 * bin/agentic-perspectives.ts — test MULTIPLE NARRATIVE PERSPECTIVES of one
 * topic in a single command.
 *
 *   npm run agentic:perspectives -- --topic "how volcanoes shape the Earth" --title "Volcano Power"
 *   npm run agentic:perspectives -- --topic "..." --perspectives mechanism,myths   # subset
 *   npm run agentic:perspectives -- --topic "..." --generate-only                  # just write the JSON
 *
 * Pipeline:
 *   1. generatePerspectiveJobs() writes N angle scripts (mechanism / history /
 *      impact / howto / myths) into input/scripts/agentic-scripts.json
 *   2. runBatchWaves() renders every job (RAM-aware waves)
 *   3. buildComparisonSheet() tiles one frame from each finished video into a
 *      single side-by-side image so the best perspective is obvious at a glance.
 */

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';

async function main() {
    const arg = (name: string, fallback = ''): string => {
        const i = process.argv.indexOf(`--${name}`);
        return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
    };
    const flag = (name: string) => process.argv.includes(`--${name}`);

    const topic = arg('topic');
    const title = arg('title', topic);
    if (!topic.trim()) {
        console.error('✖ --topic is required (e.g. --topic "how volcanoes shape the Earth")');
        process.exit(2);
    }
    const orientationArg = arg('orientation', 'landscape');
    if (!['portrait', 'landscape'].includes(orientationArg)) {
        console.error(`✖ --orientation must be portrait|landscape (got "${orientationArg}")`);
        process.exit(2);
    }

    // Lazy imports keep --help snappy and avoid loading the pipeline for --generate-only.
    const { generatePerspectiveJobs, PERSPECTIVES } = await import(
        '../src/agentic/services/perspective-generator.js'
    );
    const { AgentBrain } = await import('../src/agentic/ai/brain.js');

    let perspectives: string[] | undefined;
    const pArg = arg('perspectives');
    if (pArg) {
        perspectives = pArg
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter((s) => (PERSPECTIVES as string[]).includes(s));
        if (perspectives.length === 0) {
            console.error(`✖ no valid perspectives in "${pArg}" (choose from: ${PERSPECTIVES.join(', ')})`);
            process.exit(2);
        }
    }

    console.log(`\n╔═══════════════════════════════════════════════════╗`);
    console.log(`║   Perspective Matrix — one topic, N editorial angles ║`);
    console.log(`╚═══════════════════════════════════════════════════╝`);
    console.log(`  topic : ${topic}`);
    console.log(`  title : ${title}`);
    console.log(`  angles: ${perspectives?.join(', ') ?? 'all five'}\n`);

    const brain = new AgentBrain();
    const jobs = await generatePerspectiveJobs(topic, title, {
        perspectives: perspectives as any,
        orientation: orientationArg as 'portrait' | 'landscape',
        platform: (arg('platform') || undefined) as any,
        brain,
    });

    const scriptsPath = path.resolve('input/scripts/agentic-scripts.json');
    fs.mkdirSync(path.dirname(scriptsPath), { recursive: true });
    fs.writeFileSync(scriptsPath, JSON.stringify(jobs, null, 2));
    console.log(`📝 wrote ${jobs.length} jobs → ${scriptsPath}\n`);

    if (flag('generate-only')) {
        for (const j of jobs) {
            console.log(`  ── ${j.id} (${j.videoType}/${j.preset})`);
            console.log(`     ${(j.script || '').split('\n')[0].slice(0, 100)}…\n`);
        }
        return;
    }

    // ── Render all jobs through the wave scheduler ──
    const { runBatchWaves } = await import('../src/agentic/operations/wave-scheduler.js');
    const waveSize = Math.max(1, Math.min(Number(arg('parallel', '3')), 4)); // RAM-aware cap
    const results = await runBatchWaves(jobs, waveSize);

    const ok = results.filter((r) => r.success && r.outputPath);
    console.log(`\n📊 rendered ${ok.length}/${results.length} perspectives\n`);

    if (ok.length === 0) {
        console.error('✖ no renders succeeded — nothing to compare');
        process.exitCode = 1;
        return;
    }

    // ── Side-by-side comparison sheet ──
    const { buildComparisonSheet } = await import('../src/agentic/services/perspective-compare.js');
    const compare = await buildComparisonSheet(
        ok.map((r) => ({ label: r.title || r.jobId, mp4: r.outputPath! })),
        path.resolve('output', 'perspective-comparison.jpg'),
    );
    if (compare) {
        console.log(`\n🖼  comparison sheet → ${compare}`);
        console.log('   Judge the angles side by side, then keep the winner’s job id:');
        for (const r of ok) console.log(`     • ${r.jobId}: ${r.title}`);
    }
}

main().catch((e) => {
    console.error(`\n❌ Fatal: ${e?.message ?? e}`);
    process.exit(1);
});
