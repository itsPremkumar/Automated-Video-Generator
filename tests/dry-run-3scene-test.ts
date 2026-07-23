import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { runAgenticPipeline } from '../src/agentic/orchestrator/pipeline.js';

async function main() {
    const jobs = JSON.parse(fs.readFileSync('input/scripts/agentic-scripts.json', 'utf-8'));
    
    // Find the 3-scene hook-first job
    const job = jobs.find((j: any) => j.id === 'gen_3scene_hookfirst');
    if (!job) {
        console.log('Job not found');
        return;
    }
    
    console.log(`\n🧪 Testing: ${job.title}`);
    
    const topic = job.topic ?? job.title ?? 'Untitled video';
    const id = (job.id || `job_${Date.now()}`).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 64);
    
    const req: any = {
        script: job.script,
        topic,
        title: job.title || topic,
        jobId: id,
        orientation: job.orientation ?? 'portrait',
        voice: job.voice,
        hookFirst: job.hookFirst ?? true,
        variablePacing: job.variablePacing ?? true,
        backend: job.backend ?? 'agent',
        candidatesPerAsset: job.candidatesPerAsset ?? 4,
        dryRun: true,
        captionTheme: job.captionTheme,
        captions: job.captions,
        sfx: job.sfx,
        jCutSec: job.jCutSec,
        vignette: job.vignette,
        kineticText: job.kineticText,
        musicIntensity: job.musicIntensity,
        preset: job.preset,
        videoType: job.videoType,
        platform: job.platform,
        intro: job.intro,
        outro: job.outro,
        aiVerify: job.aiVerify,
        pruneWorkspaces: job.pruneWorkspaces,
        brain: job.brain,
        defaultVisual: job.defaultVisual,
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
    const durations: number[] = [];
    for (const s of result.plan.scenes) {
        console.log(`    [${s.sceneNumber}] [${s.durationSec}s] ${(s.voiceoverText || '…').slice(0, 60)}`);
        console.log(`      Keywords: ${s.searchKeywords?.join(', ')}`);
        console.log(`      Grade: ${s.grade || 'none'} | Transition: ${s.transition || 'none'}`);
        durations.push(s.durationSec);
    }
    
    // Verify hook-first reordering worked
    const firstSceneText = result.plan.scenes[0]?.voiceoverText || '';
    const hookWords = ['did you know', 'surprising', 'secret', 'hidden', 'myth', 'trick', 'insane', 'unbelievable', 'fact'];
    const hasHookWord = hookWords.some(w => firstSceneText.toLowerCase().includes(w));
    console.log(`\n  Hook-first check: ${hasHookWord ? '✅ First scene has hook word' : '⚠️ First scene may not have hook word'}`);
    console.log(`  First scene: "${firstSceneText.slice(0, 60)}..."`);
    
    // Verify variable pacing
    const uniqueDurations = new Set(durations);
    console.log(`  Variable pacing check: ${uniqueDurations.size > 1 ? '✅ Durations vary' : '⚠️ Durations are uniform'}`);
    console.log(`  Durations: ${durations.join(', ')}s`);
    
    // Verify control surface extension
    console.log(`\n  Control surface extension:`);
    console.log(`    Caption theme: ${result.plan.scenes[0]?.captionTheme || 'none'}`);
    console.log(`    J-cut: ${result.plan.scenes[0]?.jCutSec || 'none'}s`);
    console.log(`    Vignette: ${result.plan.scenes[0]?.vignette !== undefined ? result.plan.scenes[0].vignette : 'none'}`);
    console.log(`    Kinetic text: ${result.plan.scenes[0]?.kineticText !== undefined ? result.plan.scenes[0].kineticText : 'none'}`);
    console.log(`    Music intensity: ${result.plan.scenes[0]?.musicIntensity || 'none'}`);
}

main().catch((e) => {
    console.error(`\n❌ Fatal: ${e.message ?? e}`);
    process.exit(1);
});
