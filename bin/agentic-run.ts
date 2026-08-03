#!/usr/bin/env node
/**
 * bin/agentic-run.ts — generate a video purely with the agentic system.
 *
 *   npx tsx bin/agentic-run.ts --topic "5 home workouts" --title "Home Workout"
 */
import dotenv from 'dotenv';

// Load .env from project root before anything else
dotenv.config();

import { runAgenticPipeline, renderAgenticSlideshow, renderAgenticWithRemotion, PipelineProgress } from '../src/agentic/orchestrate.js';

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`);
    // `!== undefined` (not truthiness): an explicit empty value ("--topic ''")
    // must reach validation instead of silently becoming the fallback.
    return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
const bool = (name: string) => process.argv.includes(`--${name}`);

async function main() {
    const topic = arg('topic', '5 simple home workouts you can do daily');
    const title = arg('title', 'Home Workout');
    const backend = arg('backend', 'agent') as 'agent' | 'vision';
    const orientation = arg('orientation', 'portrait') as 'portrait' | 'landscape';
    const format = arg('format', 'none') as 'none' | 'square';

    // ── Input validation (fail fast with a clear message, not a silent default)
    if (process.argv.includes('--topic') && !topic.trim()) {
        console.error('✖ --topic must not be empty');
        process.exit(2);
    }
    if (!['portrait', 'landscape'].includes(orientation)) {
        console.error(`✖ --orientation must be "portrait" or "landscape" (got "${orientation}"). Use --format square for 1:1.`);
        process.exit(2);
    }
    if (!['agent', 'vision'].includes(backend)) {
        console.error(`✖ --backend must be "agent" or "vision" (got "${backend}")`);
        process.exit(2);
    }
    if (!['none', 'square'].includes(format)) {
        console.error(`✖ --format must be "none" or "square" (got "${format}")`);
        process.exit(2);
    }
    const preferVisual = bool('images') ? 'image' : bool('videos') ? 'video' : undefined;
    const renderer = arg('renderer', 'ffmpeg') as 'ffmpeg' | 'remotion';
    const quality = arg('quality', 'medium') as 'draft' | 'medium' | 'high';
    const introMode = arg('intro', 'none') as 'none' | 'auto' | 'custom';
    const outroMode = arg('outro', 'none') as 'none' | 'auto' | 'custom';
    const transition = arg('transition', 'auto');
    const sfx = bool('sfx');
    const noDucking = bool('no-ducking');
    const noKenBurns = bool('no-ken-burns');
    const dryRun = bool('dry-run');
    const preset = arg('preset', 'cinematic');
    const noKinetic = bool('no-kinetic');

    if (noDucking) process.env.AUDIO_DUCK_LEVEL = ''; // empty => ducking expr skipped
    console.log(`\n🎬 Agentic run | backend=${backend} renderer=${renderer} quality=${quality} intro=${introMode} outro=${outroMode}`);
    console.log(`   kenBurns=${!noKenBurns} ducking=${!noDucking} sfx=${sfx} transition=${transition}`);
    if (!process.env.PEXELS_API_KEY) {
        console.log(`   ⚠ Keyless mode: Pexels (recommended provider) skipped — using free CC sources only.`);
        console.log(`     Set PEXELS_API_KEY for higher-relevance stock (free key: https://www.pexels.com/api/).`);
    }

    const onProgress = (p: PipelineProgress) => {
        // single-line progress within the pipeline (Phase 8.3)
        process.stdout.write(`\r   [${p.stage}] ${p.percent}%  ${p.message}`.padEnd(80));
        if (p.stage === 'voiceover') process.stdout.write('\n');
    };

    // ── Global watchdog: no run may wedge silently forever. QA found hang
    // modes where a provider request stalled with no timeout in the path;
    // per-call bounds cover known sites, this covers the unknown ones.
    // Override with AGENTIC_MAX_RUN_MS (0 disables).
    const maxRunMs = Number(process.env.AGENTIC_MAX_RUN_MS ?? 30 * 60 * 1000);
    if (maxRunMs > 0) {
        const watchdog = setTimeout(() => {
            console.error(`\n✖ WATCHDOG: run exceeded ${Math.round(maxRunMs / 60000)} min — aborting (set AGENTIC_MAX_RUN_MS to change).`);
            process.exit(3);
        }, maxRunMs);
        watchdog.unref?.();
    }

    const res = await runAgenticPipeline({ topic, title, backend, orientation, preferVisual, dryRun }, onProgress);
    console.log('');

    if (dryRun) {
        console.log(`\n🔍 DRY RUN — no assets fetched, nothing rendered.`);
        console.log(`   Title:    ${res.plan.title}`);
        console.log(`   Scenes:   ${res.plan.scenes.length}  (${res.plan.orientation}, ${res.plan.totalDurationSec}s)`);
        console.log(`   Per-scene plan:`);
        for (const s of res.plan.scenes) {
            console.log(`     #${s.sceneNumber} [${s.visualPreference}] kw: ${s.searchKeywords.join(', ')}`);
            console.log(`        "${s.voiceoverText}"`);
        }
        return;
    }

    console.log(`\n🤖 Agent decided: ${res.decisions.length} assets`);
    for (const d of res.decisions) console.log(`   ${d.assetId}: ${d.decision} — ${d.rationale}`);
    console.log(`\n🚦 Gate: ${res.gate.pass ? 'PASS' : 'BLOCKED'}`);
    if (!res.gate.pass) {
        for (const c of res.gate.checks.filter((c) => !c.pass)) console.log(`   ✗ ${c.id} ${c.label}: ${c.detail}`);
        process.exit(1);
    }

    const intro = introMode === 'none' ? undefined : { title, subtitle: topic, durationSec: 3 };
    const outro = outroMode === 'none' ? undefined : { ctaText: 'Subscribe for more', showSubscribe: true, hashtags: res.plan.scenes.flatMap((s) => s.searchKeywords).slice(0, 5).map((k) => '#' + k.replace(/\s+/g, '')), durationSec: 4 };

    const renderOrientation = (res.plan.orientation ?? 'portrait') as 'portrait' | 'landscape';
    // Map orientation/format -> render resolution so --orientation / --format are
    // honoured end-to-end.
    const dimensions =
        format === 'square'
            ? { w: 1080, h: 1080 }
            : renderOrientation === 'landscape'
              ? { w: 1280, h: 720 }
              : { w: 720, h: 1280 };

    let out: string;
    if (renderer === 'remotion') {
        console.log(`\n🎞  Rendering MP4 (Remotion, ${quality})...`);
        try {
            out = await renderAgenticWithRemotion(res, { intro, outro, kenBurns: !noKenBurns, quality, dimensions });
        } catch (e: any) {
            console.warn(`⚠ Remotion render failed (${e?.message ?? e}); falling back to ffmpeg.`);
            out = await renderAgenticSlideshow(res, { crossfadeSec: 0.5, burnCaptions: true, sfx, preset, kinetic: !noKinetic, dimensions });
        }
    } else {
        console.log(`\n🎞  Rendering MP4 (ffmpeg-static)...`);
        out = await renderAgenticSlideshow(res, { crossfadeSec: 0.5, burnCaptions: true, sfx, preset, kinetic: !noKinetic, dimensions });
    }

    // Phase 8.4 — print post-render verification (X7-X9)
    if (res.postRender) {
        console.log(`\n✅ POST-RENDER CHECKS`);
        for (const c of res.postRender.checks) console.log(`   ${c.pass ? '✓' : '✗'} ${c.id} ${c.label}: ${c.detail}`);
    }
    const cs = `workspace/jobs/${res.workspace.jobId}/contact-sheet.png`;

    const dr = `workspace/jobs/${res.workspace.jobId}/decisions-report.txt`;
    console.log(`\n🎉 DONE → ${out}\n   backend=${res.backend} fullyAgentDriven=${res.fullyAgentDriven}`);
    console.log(`   🖼  See every approved asset: ${cs}`);
    console.log(`   📝 Decision report:         ${dr}`);
}

main().catch((e) => {
    console.error('❌ agentic run failed:', e?.message ?? e);
    process.exit(1);
});
