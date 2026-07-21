/**
 * agentic-auto.ts — the ONE command a human (or another agent) runs:
 *
 *     npx tsx bin/agentic-auto.ts --topic "majestic lions in the wild"
 *     npx tsx bin/agentic-auto.ts --config my-video.json
 *
 * It loads the full customization surface (config file or CLI flags), resolves
 * the preset, and calls the autonomous self-healing controller (autopilot.ts)
 * which drives the full plan→acquire→verify→decide→gate→render pipeline,
 * watches the logs, diagnoses any failure, applies a known fix, and retries —
 * until a valid MP4 comes out or the attempt budget is exhausted.
 */
import dotenv from 'dotenv';
// Load .env from project root before anything else
dotenv.config();

import { autoRunVideo, AutoRunEvent } from '../src/agentic/autopilot.js';
import { loadConfig, AgenticConfig } from '../src/agentic/config.js';

function arg(name: string, def: string): string {
    const m = process.argv.findIndex((a) => a === '--' + name);
    return m >= 0 && process.argv[m + 1] ? process.argv[m + 1] : def;
}
function bool(name: string): boolean {
    return process.argv.includes('--' + name);
}

async function main() {
    const configPath = arg('config', '');
    const base: Partial<AgenticConfig> = configPath ? loadConfig(configPath) : {};

    // CLI flags override the config file (so you can tweak one knob quickly).
    const cfg: Partial<AgenticConfig> = {
        ...base,
        topic: arg('topic', base.topic ?? '5 fascinating facts about nature'),
        title: arg('title', base.title ?? ''),
        preset: arg('preset', base.preset ?? 'cinematic'),
        renderer: (arg('renderer', base.renderer ?? 'ffmpeg')) as any,
        preferVisual: bool('videos') ? 'video' : bool('images') ? 'image' : base.preferVisual,
        sfx: bool('sfx') ? true : base.sfx,
        kenBurns: bool('no-ken-burns') ? false : base.kenBurns,
        kineticText: bool('no-kinetic') ? false : base.kineticText,
        captions: (arg('captions', base.captions ?? 'burned')) as any,
        maxAttempts: Number(arg('max-attempts', String(base.maxAttempts ?? 3))),
        musicIntensity: (arg('music-intensity', base.musicIntensity ?? 'mid')) as any,
        videoType: (arg('video-type', base.videoType ?? '')) as any || undefined,
    };
    // P1a/P1b — local media reuse + default-visual fallback.
    if (arg('local-assets', '')) cfg.localAssets = arg('local-assets', '').split(',').map((s) => s.trim()).filter(Boolean);
    if (arg('default-visual', '')) cfg.defaultVisual = arg('default-visual', '');
    // C6 / C2: user-supplied video clips + personal voiceover audio (per-scene, comma-separated).
    if (arg('video-clips', '')) cfg.videoClips = arg('video-clips', '').split(',').map((s) => s.trim()).filter(Boolean);
    if (arg('personal-audio', '')) cfg.personalAudio = arg('personal-audio', '').split(',').map((s) => s.trim()).filter(Boolean);
    if (bool('no-sfx')) cfg.sfx = false;
    if (arg('grade', '')) cfg.grade = arg('grade', '') as any;
    if (arg('transition', '')) cfg.transition = arg('transition', '') as any;
    if (bool('landscape')) { cfg.orientation = 'landscape'; cfg.aspect = '16:9'; }
    if (arg('aspect', '')) cfg.aspect = arg('aspect', '') as any;
    if (bool('karaoke')) cfg.captions = 'karaoke';
    if (bool('no-captions')) cfg.captions = 'none';

    console.log(`\n🤖 AUTOPILOT — fully autonomous: "${cfg.topic}" (preset ${cfg.preset})`);
    const report = await autoRunVideo(
        { topic: cfg.topic!, title: cfg.title || cfg.topic!, backend: 'agent' },
        { config: cfg as AgenticConfig, maxAttempts: cfg.maxAttempts,
            onEvent: (e: AutoRunEvent) => {
                const tag = e.level === 'error' ? '✗' : e.level === 'fix' ? '🔧' : e.level === 'warn' ? '⚠' : '·';
                console.log(`  ${tag} ${e.msg}`);
            } },
    );

    console.log('\n════════ AUTONOMOUS RUN REPORT ════════');
    console.log(`  topic:        ${report.topic}`);
    console.log(`  success:      ${report.success ? 'YES ✅' : 'NO ❌'}`);
    console.log(`  attempts:     ${report.attempts}`);
    console.log(`  fixes tried:  ${report.fixesApplied.join(', ') || 'none'}`);
    console.log(`  output:       ${report.outputPath ?? '(none)'}`);
    if (report.postRender) {
        const p = report.postRender;
        const detail = p.checks?.map((c: any) => `${c.id}:${c.pass ? '✓' : '✗'}`).join(' ') ?? (p.pass ? 'all pass' : 'some failed');
        console.log(`  X7/X8/X9:     ${detail}`);
    }
    console.log('══════════════════════════════════════');
    process.exit(report.success ? 0 : 1);
}

main().catch((e) => { console.error('autopilot crashed:', e); process.exit(2); });
