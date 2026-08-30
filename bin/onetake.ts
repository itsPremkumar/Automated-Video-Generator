#!/usr/bin/env node
/**
 * bin/onetake.ts — CLI entrypoint for one-shot autonomous video generation.
 *
 * Usage:
 *   npx tsx bin/onetake.ts --topic "How volcanoes shape the Earth" --orientation landscape
 *   npx tsx bin/onetake.ts --topic "AI tools for creators" --self-fix-attempts 2
 *   npx tsx bin/onetake.ts --topic "Cooking pasta" --review-gate
 */
import 'dotenv/config';
import { runOnetake } from '../src/agentic/onetake/pipeline.js';
import { duckDuckGoProvider } from '../src/agentic/onetake/research.js';

function parseArgv() {
    const args: Record<string, string | boolean | number> = {};
    const a = process.argv.slice(2);
    for (let i = 0; i < a.length; i++) {
        const k = a[i];
        if (!k.startsWith('--')) continue;
        const key = k.slice(2).replace(/-/g, '');
        const next = a[i + 1];
        if (next === undefined || next.startsWith('--')) {
            args[key] = true;
        } else {
            const num = Number(next);
            if (!isNaN(num) && next.trim() !== '') {
                args[key] = num;
                i++;
            } else {
                args[key] = next;
                i++;
            }
        }
    }
    return args;
}

function find<T>(args: Record<string, unknown>, ...keys: string[]): T | undefined {
    for (const k of keys) {
        if (args[k] !== undefined) return args[k] as T;
    }
    return undefined;
}

async function main() {
    const args = parseArgv();

    const topic = find<string>(args, 'topic', 't');
    if (!topic) {
        console.error('✖ --topic is required');
        console.error('Usage: npx tsx bin/onetake.ts --topic "..." [--orientation portrait|landscape|square] [--self-fix-attempts N] [--review-gate] [--force-grade cinematic|vivid|warm|cool|neutral|sunset|cyberpunk|noir] [--no-publish]');
        process.exit(2);
    }

    const orientation = find<string>(args, 'orientation', 'o') ?? 'portrait';
    if (!['portrait', 'landscape', 'square'].includes(orientation)) {
        console.error(`✖ --orientation must be portrait, landscape, or square (got "${orientation}")`);
        process.exit(2);
    }

    const selfFixAttempts = find<number>(args, 'selffixattempts', 'fixattempts', 's') ?? 3;
    const reviewGate = find<boolean>(args, 'reviewgate', 'review') ?? false;
    const forceGrade = find<string>(args, 'forcegrade', 'grade');
    const autoPublish = find<boolean>(args, 'publish', 'p') ?? true;

    const title = find<string>(args, 'title');
    const voice = find<string>(args, 'voice');
    const musicQuery = find<string>(args, 'musicquery', 'music');

    console.log(`\n╔══════════════════════════════════════════════════════╗`);
    console.log(`║   ONETAKE — One topic → one video, fully autonomous  ║`);
    console.log(`╚══════════════════════════════════════════════════════╝\n`);
    console.log(`  Topic:      ${topic}`);
    console.log(`  Title:      ${title ?? '(auto)'}`);
    console.log(`  Orientation: ${orientation}`);
    console.log(`  Self-fix:    ${selfFixAttempts} attempt(s)`);
    console.log(`  Publish:     ${autoPublish ? 'yes' : 'no'}`);
    console.log('');

    const start = Date.now();

    try {
        const result = await runOnetake(
            {
                topic,
                title,
                orientation,
                voice,
                musicQuery,
                selfFixAttempts,
                reviewGate,
                autoPublish,
                forceGrade,
            },
            (p) => {
                const bar = '█'.repeat(Math.floor(p.percent / 5)) + '░'.repeat(20 - Math.floor(p.percent / 5));
                process.stdout.write(`\r  [${bar}] ${p.percent}% ${p.phase}: ${p.message}`.slice(0, 100));
            },
            duckDuckGoProvider(),
        );

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        process.stdout.write('\n\n');

        console.log(`  ✅ DONE in ${elapsed}s`);
        console.log(`  MP4:          ${result.mp4}`);
        console.log(`  Job:          ${result.jobId}`);
        console.log(`  Research:     ${result.research.facts.length} facts ${result.research.offline ? '(offline mode)' : '(web)'}`);
        console.log(`  Style:        ${result.style.grade} / ${result.style.transition} / ${result.style.kinetic ? 'kinetic' : 'static'}`);
        console.log(`  Critique:     ${result.critique.passed ? 'PASS ✓' : 'NEEDS WORK ✗'} (${result.critique.attempts} attempt(s))`);
        for (const g of result.critique.gates) {
            console.log(`    ${g.pass ? '✓' : '✗'} ${g.label}: ${g.detail}`);
        }
        console.log(`  Publish:      ${result.publish.attempted ? (result.publish.success ? 'SUCCESS ✓' : `FAILED ✗ — ${result.publish.error}`) : 'skipped'}`);
        console.log(`  Metadata log: ${result.logPath}`);
        console.log('');

        process.exit(result.critique.passed ? 0 : 1);
    } catch (e: any) {
        process.stdout.write('\n\n');
        console.error(`  ✖ FATAL: ${e?.message ?? e}`);
        process.exit(2);
    }
}

main();