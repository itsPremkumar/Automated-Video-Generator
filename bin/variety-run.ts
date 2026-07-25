#!/usr/bin/env tsx
/**
 * bin/variety-run.ts — run a chosen subset of agentic-scripts.json jobs through
 * the REAL batch wave scheduler, for production-readiness variety verification.
 *
 * Usage: tsx bin/variety-run.ts <id1> <id2> ...
 * (falls back to a default diverse trio if no ids given)
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { runBatchWaves } from '../src/agentic/operations/wave-scheduler.js';
import type { AgenticCliJob } from '../src/adapters/cli/cli-job.js';

const SCRIPTS = path.join(process.cwd(), 'input', 'scripts', 'agentic-scripts.json');

async function main() {
    const ids = process.argv.slice(2);
    const all: AgenticCliJob[] = JSON.parse(fs.readFileSync(SCRIPTS, 'utf-8'));
    const picked = ids.length ? all.filter((j) => ids.includes((j as any).id ?? (j as any).title)) : all.slice(0, 3);
    if (picked.length === 0) {
        console.error('No jobs matched:', ids.join(', '));
        process.exit(1);
    }
    console.log(`\n▶ Running ${picked.length} variety job(s): ${picked.map((j: any) => j.id).join(', ')}\n`);
    const t0 = Date.now();
    const results = await runBatchWaves(picked, Number(process.env.AGENTIC_WAVE_SIZE || 1), (r) => {
        console.log(`  📊 wave ${r.waveNumber}/${r.totalWaves}: ${r.completed}✅ ${r.failed}❌`);
    });
    console.log(`\n${'═'.repeat(60)}`);
    for (const r of results) {
        console.log(`  ${r.success ? '✅' : '❌'} ${(r as any).title ?? (r as any).id}: ${r.success ? (r as any).outputPath ?? '(ok)' : (r as any).error}`);
    }
    console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    process.exit(results.every((r) => r.success) ? 0 : 1);
}
main().catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
});
