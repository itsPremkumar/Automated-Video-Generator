/**
 * gen-variety.ts — offline variety-generator (no network plan→visuals→voice pipeline).
 *
 * Drives the REAL `renderAgenticSlideshow()` directly with LOCAL assets from
 * `input/visuals/` so you can exercise the full FX chain + multi-aspect export
 * without Pexels/Edge-TTS/network. Each call ALSO auto-spawns the
 * `_16x9` / `_1x1` / `_9x16` aspect exports the renderer emits.
 *
 * Matrix: 9:16 / 1:1 / 16:9 × music-on / audio-less → 6 variants per run,
 * each producing a portrait + 3 aspect mp4s (so 4 files per scene-set).
 *
 * Usage:
 *   npx tsx scripts/gen-variety.ts                 # all 6 variants
 *   npx tsx scripts/gen-variety.ts --music-only    # music-on variants only
 *   npx tsx scripts/gen-variety.ts --silent-only   # audio-less variants only
 *   npx tsx scripts/gen-variety.ts --orientation portrait
 *
 * Output: output/variety/<variant>/render/<jobId>[_9x16|_1x1|_16x9].mp4
 * Verify after:  npx tsx scripts/verify-visual.ts output/variety
 */
import * as fs from 'fs';
import * as path from 'path';
import { renderAgenticSlideshow } from '../src/agentic/orchestrator/render.js';

const ROOT = path.resolve(__dirname, '..');
const VIS = path.join(ROOT, 'input', 'visuals');
const OUT = path.join(ROOT, 'output', 'variety');

type Orientation = 'portrait' | 'landscape' | 'square';

interface Variant {
  id: string;
  orientation: Orientation;
  dimensions: { w: number; h: number };
  exportAspects: string[];
  music: boolean;
}

function localAssets(): string[] {
  return fs
    .readdirSync(VIS)
    .filter((f) => /\.(mp4|webm|mov|m4v|png|jpg|jpeg)$/i.test(f))
    .map((f) => path.join(VIS, f))
    .filter((p) => fs.existsSync(p));
}

// Build a minimal PipelineResult that renderAgenticSlideshow consumes.
// (Confirmed field set from src/agentic/orchestrator/render.ts:78-92.)
function makeRes(jobId: string, assets: { kind: string; sceneIndex: number; localPath: string }[]) {
  return {
    backend: 'agent' as const,
    plan: {
      scenes: assets.map((a, i) => ({ idx: i, kenBurns: false, caption: '', kinetic: [] })),
    },
    workspace: {
      jobId,
      root: path.join(OUT, jobId),
      assetsDir: '',
      imagesDir: '',
      videosDir: '',
      musicDir: '',
      verificationDir: '',
      audioDir: '',
    },
    candidates: [],
    decisions: [],
    gate: { pass: true, checks: [] },
    manifest: { assets, voiceovers: [] },
    voiceovers: null,
    fullyAgentDriven: false,
  } as any;
}

function buildVariants(): Variant[] {
  const all: Variant[] = [
    { id: 'p9x16_music', orientation: 'portrait', dimensions: { w: 720, h: 1280 }, exportAspects: ['9:16', '1:1', '16:9'], music: true },
    { id: 'p9x16_silent', orientation: 'portrait', dimensions: { w: 720, h: 1280 }, exportAspects: ['9:16', '1:1', '16:9'], music: false },
    { id: 'sq1x1_music', orientation: 'square', dimensions: { w: 720, h: 720 }, exportAspects: ['9:16', '1:1', '16:9'], music: true },
    { id: 'sq1x1_silent', orientation: 'square', dimensions: { w: 720, h: 720 }, exportAspects: ['9:16', '1:1', '16:9'], music: false },
    { id: 'l16x9_music', orientation: 'landscape', dimensions: { w: 1280, h: 720 }, exportAspects: ['9:16', '1:1', '16:9'], music: true },
    { id: 'l16x9_silent', orientation: 'landscape', dimensions: { w: 1280, h: 720 }, exportAspects: ['9:16', '1:1', '16:9'], music: false },
  ];
  const args = process.argv.slice(2);
  if (args.includes('--music-only')) return all.filter((v) => v.music);
  if (args.includes('--silent-only')) return all.filter((v) => !v.music);
  const oi = args.findIndex((a) => a === '--orientation');
  if (oi >= 0 && args[oi + 1]) return all.filter((v) => v.orientation === args[oi + 1]);
  return all;
}

async function main() {
  const assets = localAssets();
  if (assets.length < 2) {
    console.error(`Need >=2 local assets in ${VIS}; found ${assets.length}. Add images/videos.`);
    process.exit(1);
  }
  // Use up to 3 assets so scenes are short and the run is fast on low RAM.
  const clips = assets.slice(0, 3).map((localPath, i) => ({
    kind: /\.(mp4|webm|mov|m4v)$/i.test(localPath) ? 'video' : 'image',
    sceneIndex: i,
    localPath,
  }));
  const variants = buildVariants();
  fs.mkdirSync(OUT, { recursive: true });

  for (const v of variants) {
    const res = makeRes(v.id, clips);
    const opts: any = {
      orientation: v.orientation,
      dimensions: v.dimensions,
      exportAspects: v.exportAspects,
      kenBurns: true,
      captions: 'burned',
      captionTheme: 'bold',
      kinetic: true,
    };
    console.log(`\n▶ ${v.id}  (${v.orientation}, ${v.dimensions.w}x${v.dimensions.h}, music=${v.music})`);
    try {
      const out = await renderAgenticSlideshow(res, opts);
      console.log(`  ✅ ${out}`);
    } catch (e: any) {
      console.error(`  ❌ ${v.id} threw: ${(e?.message ?? String(e)).slice(0, 200)}`);
    }
  }
  console.log('\nDone. Verify with:  npx tsx scripts/verify-visual.ts output/variety');
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
