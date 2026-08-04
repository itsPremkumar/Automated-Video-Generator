/**
 * verify-visual.ts — post-batch VISUAL gate scanner.
 *
 * Walks a directory tree of rendered mp4s (default output/variety, or any dir
 * passed as argv[1]) and for each final mp4:
 *   - ffprobe streams: confirm video + (optional) audio, read WxH + SAR.
 *   - extracts ONE late frame (-ss AFTER -i, the AVS-safe seek per G8) to
 *     <dir>/verify-frames/<name>.jpg for a human / vision_analyze spot-check.
 *   - reports aspect mismatch (a _9x16 variant NOT 9:16, etc.) and any
 *     non-1:1 SAR (the G70 setsar bug class).
 *
 * It does NOT substitute for the per-file empirical checks in avs-verify.sh
 * (black/freeze/volume/speech) — run that on individual finals for the full
 * gate. This scanner is the cheap first pass over a whole campaign.
 *
 * Usage:
 *   npx tsx scripts/verify-visual.ts [rootDir]
 * Exit code 0 if every mp4 decodes + dimensions look sane; 1 if any file is
 * missing/corrupt or aspect-declared-but-wrong.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const FF = require('ffmpeg-static');
const FP = require('ffprobe-static').path;

function ffprobe(file: string): { w: number; h: number; sar: string; hasVideo: boolean; hasAudio: boolean } | null {
  try {
    const out = execFileSync(FP, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,sample_aspect_ratio',
      '-of', 'csv=p=0',
      file,
    ]).toString().trim();
    const [w, h, sar] = out.split(',');
    const audioOut = execFileSync(FP, [
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=index', '-of', 'csv=p=0', file,
    ]).toString().trim();
    return {
      w: parseInt(w, 10) || 0,
      h: parseInt(h, 10) || 0,
      sar: sar || '1:1',
      hasVideo: !!(w && h),
      hasAudio: audioOut.length > 0,
    };
  } catch {
    return null;
  }
}

// Authoritative aspect dimensions — mirrors src/agentic/operations/advanced-fx.ts
// resolveAspectSizes (9:16=720x1280, 16:9=1280x720, 1:1=1080x1080).
// Match the TRAILING variant suffix (_9x16/_1x1/_16x9) FIRST; a base file with
// no suffix is a portrait primary (720x1280). We must NOT match a substring of
// the job id (e.g. "p9x16" in "p9x16_silent_16x9.mp4") — that would mis-classify.
function expectedAspect(name: string): { w: number; h: number } | null {
  const base = name.replace(/\.mp4$/i, '');
  if (/_16x9$/i.test(base)) return { w: 1280, h: 720 };
  if (/_9x16$/i.test(base)) return { w: 720, h: 1280 };
  if (/_1x1$/i.test(base)) return { w: 1080, h: 1080 };
  // No variant suffix → PRIMARY render. The primary uses the job's `dimensions`
  // (which gen-variety.ts sets to 720x720 for square, 1280x720 for landscape,
  // 720x1280 for portrait), NOT the variant canonical sizes. So only assert the
  // 16:9/9:16 primaries from the orientation hint; for square/portrait primaries
  // we accept the job's chosen dimensions and do NOT over-assert.
  if (/landscape|l16x9/i.test(base)) return { w: 1280, h: 720 };
  return null; // portrait/square primaries: dimensions are job-defined, skip strict assert
}

function extractFrame(file: string, outDir: string): string | null {
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(file, '.mp4');
  const out = path.join(outDir, `${base}.jpg`);
  try {
    execFileSync(FF, ['-y', '-v', 'error', '-i', file, '-ss', '5', '-frames:v', '1', out]);
    return fs.existsSync(out) && fs.statSync(out).size > 1000 ? out : null;
  } catch {
    return null;
  }
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.mp4')) acc.push(p);
  }
  return acc;
}

function main() {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'output', 'variety');
  if (!fs.existsSync(root)) {
    console.error(`No such dir: ${root}`);
    process.exit(1);
  }
  const framesDir = path.join(root, 'verify-frames');
  const files = walk(root);
  if (!files.length) {
    console.error(`No mp4 files under ${root}`);
    process.exit(1);
  }
  let fail = 0;
  console.log(`Scanning ${files.length} mp4(s) under ${root}\n`);
  for (const f of files) {
    const name = path.basename(f);
    const info = ffprobe(f);
    if (!info || !info.hasVideo) {
      console.log(`✗ ${name}  — UNDECODEABLE / no video stream`);
      fail++;
      continue;
    }
    const exp = expectedAspect(name);
    const aspectOk = exp ? (info.w === exp.w && info.h === exp.h) : true;
    const sarOk = info.sar === '1:1';
    const flags: string[] = [];
    if (!aspectOk && exp) flags.push(`ASPECT ${info.w}x${info.h}!=${exp.w}x${exp.h}`);
    if (!sarOk) flags.push(`SAR=${info.sar}`);
    const fr = extractFrame(f, framesDir);
    const mark = flags.length ? '⚠' : '✅';
    console.log(`${mark} ${name}  ${info.w}x${info.h} sar=${info.sar} audio=${info.hasAudio ? 'Y' : 'n'}${flags.length ? '  [' + flags.join(', ') + ']' : ''}${fr ? `  frame→${path.basename(fr)}` : ''}`);
    if (flags.length) fail++;
  }
  console.log(`\nRESULT: ${fail === 0 ? 'PASS' : `FAIL (${fail})`}`);
  if (fail === 0) console.log(`Frames for vision spot-check: ${framesDir}`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
