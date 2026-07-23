import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { runAgenticPipeline } from '../src/agentic/orchestrator/pipeline.js';

async function main() {
    const jobs = JSON.parse(fs.readFileSync('input/scripts/agentic-scripts.json', 'utf-8'));
    
    // Find the dry-run job or use the first job
    const dryRunJob = jobs.find((j: any) => j.dryRun === true) || jobs[0];
    if (!dryRunJob) {
        console.log('No dry-run job found');
        return;
    }
    
    console.log(`\n🧪 Testing dry-run job: ${dryRunJob.title}`);
    
    const topic = dryRunJob.topic ?? dryRunJob.title ?? 'Untitled video';
    const id = (dryRunJob.id || `job_${Date.now()}`).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 64);
    
    const req: any = {
        script: dryRunJob.script,
        topic,
        title: dryRunJob.title || topic,
        jobId: id,
        orientation: dryRunJob.orientation ?? 'portrait',
        voice: dryRunJob.voice,
        hookFirst: dryRunJob.hookFirst ?? true,
        variablePacing: dryRunJob.variablePacing ?? true,
        backend: dryRunJob.backend ?? 'agent',
        candidatesPerAsset: dryRunJob.candidatesPerAsset ?? 4,
        dryRun: true,
        captionTheme: dryRunJob.captionTheme,
        captions: dryRunJob.captions,
        sfx: dryRunJob.sfx,
        jCutSec: dryRunJob.jCutSec,
        vignette: dryRunJob.vignette,
        kineticText: dryRunJob.kineticText,
        musicIntensity: dryRunJob.musicIntensity,
        preset: dryRunJob.preset,
        videoType: dryRunJob.videoType,
        platform: dryRunJob.platform,
        intro: dryRunJob.intro,
        outro: dryRunJob.outro,
        aiVerify: dryRunJob.aiVerify,
        pruneWorkspaces: dryRunJob.pruneWorkspaces,
        brain: dryRunJob.brain,
        defaultVisual: dryRunJob.defaultVisual,
    };
    
    const result = await runAgenticPipeline(req, (progress) => {
        const pct = progress.percent?.toFixed(0) ?? '??';
        const stage = progress.stage ?? '?';
        console.log(`  [${pct}%] ${stage}: ${progress.message ?? ''}`);
    });
    
    console.log(`\n✅ Dry run complete!`);
    console.log(`  Scenes: ${result.plan.scenes.length}`);
    console.log(`  Duration: ${result.plan.totalDurationSec}s`);
    console.log(`  Voice: ${result.plan.voice}`);
    console.log(`  Orientation: ${result.plan.orientation}`);
    console.log(`  Music Query: ${result.plan.musicQuery}`);
    console.log(`  Gate: ${result.gate.pass ? 'PASS' : 'FAIL'}`);
    
    console.log(`\n  Scene breakdown (hook-first + variable pacing):`);
    for (const s of result.plan.scenes) {
        console.log(`    [${s.sceneNumber}] [${s.durationSec}s] ${(s.voiceoverText || '…').slice(0, 60)}`);
        console.log(`      Keywords: ${s.searchKeywords?.join(', ')}`);
        console.log(`      Grade: ${s.grade || 'none'} | Transition: ${s.transition || 'none'}`);
    }
    
    // Verify hook-first reordering worked
    const firstSceneText = result.plan.scenes[0]?.voiceoverText || '';
    const hasHookWord = /did you know|surprising|secret|hidden|myth|trick|insane|unbelievable|fact/i.test(firstSceneText);
    console.log(`\n  Hook-first check: ${hasHookWord ? '✅ First scene has hook word' : '⚠️ First scene may not have hook word'}`);
    console.log(`  Variable pacing check: ${result.plan.scenes.every((s, i) => s.durationSec !== result.plan.scenes[0]?.durationSec) ? '✅ Durations vary' : '⚠️ Durations may be uniform'}`);
    
    // Verify the control surface extension worked
    if (result.plan.scenes[0]?.captionTheme) {
        console.log(`  Caption theme: ${result.plan.scenes[0].captionTheme}`);
    }
    if (result.plan.scenes[0]?.jCutSec) {
        console.log(`  J-cut: ${result.plan.scenes[0].jCutSec}s`);
    }
    if (result.plan.scenes[0]?.vignette !== undefined) {
        console.log(`  Vignette: ${result.plan.scenes[0].vignette}`);
    }
}

main().catch((e) => {
    console.error(`\n❌ Fatal: ${e.message ?? e}`);
    process.exit(1);
});
