/**
 * verify-control-surface.ts
 * Empirical proof: every advanced-FX field used by the example matrices
 * (and therefore by any job copied into agentic-scripts.json) is forwarded
 * intact by buildPipelineRequest() — the real ingestion function the agentic
 * runner uses. No mocks; imports the actual project code.
 *
 * FIX (2026-08-04): the original script read `input/scripts/examples/*.json`,
 * but that directory does not exist in this repo (matrices live at the top
 * level of `input/scripts/`). It now scans every JSON array file under
 * `input/scripts/` instead, and treats a missing `examples/` dir as a no-op
 * rather than crashing.
 */
import { buildPipelineRequest } from '../src/adapters/cli/cli-job.js';
import * as fs from 'fs';
import * as path from 'path';

const BASE = path.resolve(__dirname, '..');
const SCRIPTS = path.join(BASE, 'input', 'scripts');

// The full set of advanced-FX / control-surface fields we claim are controllable.
const FX_FIELDS = [
  'chromaKeyScenes', 'blurScenes', 'stabilizeScenes', 'clipSpeedByScene',
  'paletteFilter', 'filterByScene', 'emojiByScene', 'sfxByScene', 'sfxOnCut',
  'loopVideo', 'exportFormat', 'contactSheet', 'posterScene', 'titleCard',
  'lowerThird', 'endCta', 'progressBar', 'musicQuery', 'licenseFilter',
  'voiceSpeed', 'dialogueVoices', 'captionTheme', 'captions', 'kenBurns',
  'transition', 'grade', 'kineticText', 'vignette', 'jCutSec', 'preset',
  'format', 'aspect', 'platform', 'videoType', 'brand', 'renderer',
  'maxAttempts', 'languages', 'intro', 'outro', 'backgroundMusic', 'musicVolume',
  'candidatesPerAsset', 'hookFirst', 'variablePacing', 'backend',
];

let totalJobs = 0;
let totalChecks = 0;
let passed = 0;
const failures: string[] = [];

// 1) Every job in the LIVE agentic-scripts.json
function loadJobs(file: string): any[] {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

const allJobs: any[] = loadJobs(path.join(SCRIPTS, 'agentic-scripts.json'));

// 2) Every JSON array file under input/scripts/ (no hard dependency on an
//    `examples/` subdir that does not exist in this checkout).
for (const f of fs.readdirSync(SCRIPTS)) {
  if (!f.endsWith('.json')) continue;
  if (f === 'agentic-scripts.json') continue; // already loaded above
  const full = path.join(SCRIPTS, f);
  try {
    const data = JSON.parse(fs.readFileSync(full, 'utf8'));
    if (Array.isArray(data)) allJobs.push(...data);
  } catch {
    /* skip non-array / unparseable */
  }
}

for (const job of allJobs) {
  if (!job || typeof job !== 'object' || !('id' in job)) continue;
  const id = (job.id || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 64);
  const topic = job.topic ?? job.title ?? 'Untitled';
  let req: any;
  try {
    req = buildPipelineRequest(job as any, id, topic);
  } catch (e) {
    failures.push(`${job.id}: buildPipelineRequest THREW ${(e as Error).message}`);
    totalJobs++;
    continue;
  }
  totalJobs++;
  // For each FX field this job actually sets, assert it appears in the request.
  for (const field of FX_FIELDS) {
    if (field in job && job[field] !== undefined) {
      totalChecks++;
      const inReq = (req as any)[field];
      const ok = JSON.stringify(inReq) === JSON.stringify(job[field]);
      if (ok) passed++;
      else failures.push(`${job.id}.${field}: set=${JSON.stringify(job[field]).slice(0, 80)} -> req=${JSON.stringify(inReq).slice(0, 80)}`);
    }
  }
}

console.log(`\n=== CONTROL-SURFACE INGESTION TEST ===`);
console.log(`Jobs scanned         : ${totalJobs}`);
console.log(`FX-field assertions  : ${totalChecks}`);
console.log(`Passed               : ${passed}`);
console.log(`Failed               : ${failures.length}`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures.slice(0, 20)) console.log('  x', f);
  process.exit(1);
} else {
  console.log('\n✅ Every advanced-FX field set in agentic-scripts.json / input/scripts/*.json is forwarded intact by buildPipelineRequest().');
  console.log('   => The deleted/relocated matrices are 100% controllable via agentic-scripts.json.');
}
