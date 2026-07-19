#!/usr/bin/env node
/**
 * bin/driver-run.ts — Hermes (the DRIVER) writes the script; the pipeline
 * renders it. This is the "driver-first" mode: no external LLM key needed,
 * the driver supplies the creative content via req.agent.writeScript, and the
 * agentic pipeline acquires (offline placeholder) visuals, gates, and renders.
 */
import { runAgenticPipeline, renderAgenticSlideshow } from '../src/agentic/orchestrate.js';
import type { PipelineProgress } from '../src/agentic/orchestrate.js';

// ── The DRIVER's script (Hermes-authored) ────────────────────────────────
// Scenes are blank-line separated. The visual cue goes on the SAME line as
// the sentence inside [brackets]. preferVisual:'image' keeps each scene ~5-7s
// (image, not a long fetched video clip) so total lands in your 30-60s ask.
const SCRIPT = `Water makes up about 60 percent of your body, yet most people stay mildly dehydrated through the whole day. [glass of water on a table]

A single glass can sharpen your focus and lift that afternoon brain fog within just a few minutes. [glass of water]

Proper hydration supports concentration, steadier mood, and clearer memory across a busy working day. [person stretching in the morning]

Often what feels like hunger is actually thirst, so a glass before meals keeps your portions in check. [fresh fruits and vegetables]

Water cushions your joints and carries nutrients to the muscles that need them most when you move. [running shoes and a water bottle]

Hydrated skin stays plump and clear, making water the cheapest skincare step you will ever take. [glowing skin close up]

Sip steadily through the day and let these small habits build lasting natural energy. [glass of water with lemon]`;

const TOPIC = '5 benefits of drinking water daily';
const TITLE = 'Stay Hydrated';

async function main() {
    const onProgress = (p: PipelineProgress) => {
        process.stdout.write(`\r   [${p.stage}] ${p.percent}%  ${p.message}`.padEnd(90));
    };

    const res = await runAgenticPipeline(
        {
            topic: TOPIC,
            title: TITLE,
            backend: 'agent',
            orientation: 'portrait',
            preferVisual: 'image', // use stills so scene length = scripted ~8s, not fetched-clip length
            agent: {
                // DRIVER-FIRST: the driver's own script, not the offline heuristic.
                writeScript: async () => SCRIPT,
            },
        },
        onProgress,
    );
    console.log('');

    console.log(`\n🤖 Driver-script scenes: ${res.plan.scenes.length} | total ${res.plan.totalDurationSec}s`);
    console.log(`🚦 Gate: ${res.gate.pass ? 'PASS' : 'BLOCKED'}`);
    if (!res.gate.pass) {
        for (const c of res.gate.checks.filter((c: any) => !c.pass))
            console.log(`   ✗ ${c.id} ${c.label}: ${c.detail}`);
        process.exit(1);
    }

    const out = await renderAgenticSlideshow(res, {
        crossfadeSec: 0.5,
        burnCaptions: true,
        sfx: false,
        preset: 'cinematic',
        kinetic: true,
    });

    if (res.postRender) {
        console.log(`\n✅ POST-RENDER CHECKS`);
        for (const c of res.postRender.checks) console.log(`   ${c.pass ? '✓' : '✗'} ${c.id} ${c.label}: ${c.detail}`);
    }

    const ws = `agentic-pipeline/workspaces/${res.workspace.jobId}`;
    console.log(`\n🎉 DONE → ${out}`);
    console.log(`   backend=${res.backend} fullyAgentDriven=${res.fullyAgentDriven}`);
    console.log(`   🖼  contact-sheet: ${ws}/contact-sheet.png`);
    console.log(`   📝 decisions:     ${ws}/decisions-report.txt`);
    process.exit(0);
}

main().catch((e) => {
    console.error('❌ driver run failed:', e?.message ?? e);
    process.exit(1);
});
