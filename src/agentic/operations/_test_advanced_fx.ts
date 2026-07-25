/**
 * Local-only smoke test for the new advanced FX consumption.
 * Uses only local assets (input/visuals/*.png) so it runs with zero network.
 * Verifies that composeVideo produces a video (and extra aspects) when the
 * advanced fields are set.
 */
import * as fs from 'fs';
import * as path from 'path';
import { composeVideo, ComposeInput } from './compose.js';
import type { AgenticCliJob } from '../../adapters/cli/cli-job.js';

const ROOT = process.cwd();
const VISUALS = path.join(ROOT, 'input', 'visuals');
const assets = ['logo-automation.png', 'brand_cover.jpg', 'github-profile.png']
  .map((f) => path.join(VISUALS, f))
  .filter((p) => fs.existsSync(p));

if (assets.length < 2) {
  console.error('Need >=2 local assets in input/visuals/; found', assets.length);
  process.exit(2);
}

const job: AgenticCliJob = {
  id: 'test_adv',
  title: 'Advanced FX Smoke Test',
  script: 'A. Scene one. [Visual: logo-automation.png]\nB. Scene two. [Visual: brand_cover.jpg]\nC. Scene three. [Visual: github-profile.png]',
  mode: 'compose',
  orientation: 'portrait',
  // Phase 2 advanced fields (a representative subset of each cluster):
  transitionInByScene: { '0': 'fade', '1': 'zoomblur', '2': 'slide' },
  transitionOutByScene: { '0': 'slide', '1': 'fade', '2': 'zoomblur' },
  transitionDurationByScene: { '0': 0.5, '1': 0.3, '2': 0.7 },
  transitionCurve: 'linear',
  contrastByScene: { '0': 1.2, '1': 1.1, '2': 1.3 },
  saturationByScene: { '0': 1.1, '1': 1.3, '2': 1.5 },
  brightnessByScene: { '0': 0.05, '1': 0.1, '2': 0.0 },
  colorTempByScene: { '0': 6500, '1': 5500, '2': 8000 },
  highlightsByScene: { '0': 1.1 },
  shadowsByScene: { '1': 0.1 },
  colorWheelsByScene: { '2': { shadows: '#101020', midtones: '#202000', highlights: '#002020' } },
  toneCurveByScene: { '0': 'cinematic' },
  mirrorByScene: { '0': 'horizontal' },
  zoomByScene: { '0': { start: 1.0, end: 1.2 } },
  panByScene: { '1': { startX: 0, startY: 0, endX: 10, endY: 10 } },
  opacityByScene: { '1': 0.9 },
  blendModeByScene: { '2': 'screen' },
  textOverlayByScene: { '0': { text: 'ADV TEST', x: '(w-text_w)/2', y: '40', fontSize: 48, color: 'yellow', duration: 3 } },
  emojiOverlayByScene: { '0': { emoji: '🧪', x: 'W-96-24', y: '24', size: 96 } },
  ctaButtonByScene: { '2': { text: 'DONE', x: '(w-text_w)/2', y: 'H-th-60', width: 200, height: 60, color: '#FF6B35', borderColor: 'white' } },
  watermarkByScene: { '0': { image: 'logo-automation.png', rotation: 5 } },
  brandTintByScene: { '0': '#FF6B35@0.1' },
  parallaxDepthByScene: { '0': 4 },
  particlesByScene: { '2': 'sparkles' },
  duckDepth: 0.6,
  voiceVolumeByScene: { '0': 1.2 },
  eqByScene: { '1': [{ freq: 1000, gain: 3, q: 1 }] },
  compressorByScene: { '0': { threshold: -20, ratio: 3, attack: 5, release: 80, makeup: 2 } },
  reverbByScene: { '2': 'small' },
  pitchShiftByScene: { '1': 0.5 },
  exportAspects: ['9:16', '1:1', '16:9'],
  outputQuality: 'high',
  frameRate: 30,
  keyframeInterval: 2,
  hardwareEncode: false,
  outputName: 'adv_fx_smoke',
  contactSheet: true,
} as unknown as AgenticCliJob;

async function main() {
  const outDir = path.join(ROOT, 'workspace', 'adv_fx_test');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const input: ComposeInput = {
    job,
    sceneVisuals: [assets[0], assets[1], assets[2]],
    sceneAudio: [],
    outDir,
    inputDir: VISUALS,
    scenes: [
      { voiceoverText: 'Scene one', transition: 'fade' },
      { voiceoverText: 'Scene two', transition: 'slide' },
      { voiceoverText: 'Scene three', transition: 'zoomblur' },
    ] as any,
  };
  const res = await composeVideo(input);
  console.log('RESULT video:', res.video);
  console.log('RESULT extraAspects:', JSON.stringify(res.extraAspects ?? {}));
  console.log('RESULT contactSheet:', res.contactSheet);
  if (!res.video || !fs.existsSync(res.video)) {
    console.error('FAIL: no video produced');
    process.exit(1);
  }
  const st = fs.statSync(res.video);
  console.log('OK video bytes:', st.size);
  if (st.size < 1000) { console.error('FAIL: video too small'); process.exit(1); }
  console.log('SMOKE TEST PASSED');
}
main().catch((e) => { console.error('THREW:', e); process.exit(1); });
