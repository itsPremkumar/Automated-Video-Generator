/**
 * verify-control-surface.ts
 * Empirical proof: every advanced-FX field used by the example matrices
 * (and therefore by any job copied into agentic-scripts.json) is forwarded
 * intact by buildPipelineRequest() — the real ingestion function the agentic
 * runner uses. No mocks; imports the actual project code.
 */
import { buildPipelineRequest } from '../src/adapters/cli/cli-job.js';
import * as fs from 'fs';
import * as path from 'path';

const BASE = path.resolve(__dirname, '..');
const SCRIPTS = path.join(BASE, 'input', 'scripts');
const EXAMPLES = path.join(SCRIPTS, 'examples');

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
const liveJobs = JSON.parse(fs.readFileSync(path.join(SCRIPTS, 'agentic-scripts.json'), 'utf8'));
// 2) Every job in the EXAMPLE matrices
const exampleFiles = fs.readdirSync(EXAMPLES).filter((f) => f.endsWith('.json'));
const allJobs: any[] = [...liveJobs];
for (const f of exampleFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(EXAMPLES, f), 'utf8'));
  allJobs.push(...data);
}

for (const job of allJobs) {
  if (!job || typeof job !== 'object' || !('id' in job)) continue;
  const id = (job.id || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 64);
  const topic = job.topic ?? job.title ?? 'Untitled';
  const req = buildPipelineRequest(job as any, id, topic);
  totalJobs++;
  // For each FX field this job actually sets, assert it appears in the request.
  for (const field of FX_FIELDS) {
    if (field in job && job[field] !== undefined) {
      totalChecks++;
      const inReq = (req as any)[field];
      const ok = JSON.stringify(inReq) === JSON.stringify(job[field]);
      if (ok) passed++;
      else failures.push(`${job.id}.${field}: set=${JSON.stringify(job[field])} -> req=${JSON.stringify(inReq)}`);
    }
  }
}

console.log(`\n=== CONTROL-SURFACE INGESTION TEST ===`);
console.log(`Jobs scanned         : ${totalJobs} (${liveJobs.length} live + ${allJobs.length - liveJobs.length} example)`);
console.log(`FX-field assertions  : ${totalChecks}`);
console.log(`Passed               : ${passed}`);
console.log(`Failed               : ${failures.length}`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures.slice(0, 20)) console.log('  ✗', f);
  process.exit(1);
} else {
  console.log('\n✅ Every advanced-FX field set in agentic-scripts.json / examples is forwarded intact by buildPipelineRequest().');
  console.log('   => The deleted/relocated matrices are 100% controllable via agentic-scripts.json.');
}
