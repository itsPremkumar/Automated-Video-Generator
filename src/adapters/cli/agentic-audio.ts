#!/usr/bin/env tsx
/**
 * agentic-audio.ts — Single-AUDIO toolbox for the AVS pipeline.
 *
 * The speech backend (src/speech) only GENERATES voice (Kokoro/clone). There was
 * NO editor for existing audio files. This CLI fills that gap: trim/cut/merge/fade/
 * normalize/noise-reduce/speed/pitch a standalone .wav/.mp3 — all as thin ffmpeg
 * (`ffmpeg-static`) wrappers, backward-compatible (no existing code touched).
 *
 * USAGE:
 *   npx tsx src/adapters/cli/agentic-audio.ts <command> [options]
 *   npm run agentic:audio <command> -- --input <file> [options]
 *
 * COMMANDS (audio in → audio out):
 *   trim       Cut a segment by start/end/duration
 *   merge      Join multiple audio files (concat)
 *   fade       Fade in/out
 *   normalize  Loudness normalize (loudnorm, target LUFS)
 *   noise      Noise-reduce (afftdn / anlmdn)
 *   speed      Change playback speed (atempo)
 *   pitch      Shift pitch without changing speed (rubberband/asetrate)
 *   info       Show audio metadata
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ffmpegPath(): string {
  try {
    const p = require('ffmpeg-static');
    if (p && fs.existsSync(p)) return p;
  } catch {
    /* ffmpeg-static not available */
  }
  return 'ffmpeg';
}

function ffprobePath(): string {
  try {
    const p = require('ffprobe-static');
    if (p && p.path && fs.existsSync(p.path)) return p.path;
  } catch {
    /* ffprobe-static not available */
  }
  return 'ffprobe';
}

function runFfmpeg(args: string[], desc: string): { ok: boolean; stderr: string } {
  const ff = ffmpegPath();
  console.log(`  ⚡ ffmpeg ${args.slice(0, 8).join(' ')} ...`);
  const r = spawnSync(ff, args, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    console.error(`  ✖ ${desc} failed (exit ${r.status})`);
    console.error(r.stderr?.slice(-500));
    return { ok: false, stderr: r.stderr || '' };
  }
  console.log(`  ✅ ${desc}`);
  return { ok: true, stderr: '' };
}

function resolveInput(input?: string): string {
  if (!input) {
    console.error('  ✖ --input <path> is required');
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`  ✖ Input file not found: ${input}`);
    process.exit(1);
  }
  return input;
}

function resolveOutput(output?: string, fallback = 'output.wav'): string {
  return output || fallback;
}

function parseArgs(argv: string[]): Record<string, any> {
  const args: Record<string, any> = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const key = k.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function getAudioInfo(file: string): any {
  const fp = ffprobePath();
  const r = spawnSync(fp, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

type CmdFn = (args: Record<string, any>) => void;
const COMMANDS: Record<string, CmdFn> = {};

// 1. TRIM — cut a segment by start/end/duration
COMMANDS['trim'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `trim_${path.basename(input)}`);
  const start = args.start || args.ss || '00:00';
  const end = args.end;
  const duration = args.duration || args.t;
  const ff: string[] = ['-i', input, '-ss', start];
  if (end) ff.push('-to', end);
  else if (duration) ff.push('-t', duration);
  ff.push('-c', 'copy', output, '-y');
  runFfmpeg(ff, `Trimmed (start=${start}${end ? ` end=${end}` : ` dur=${duration}`})`);
};

// 2. MERGE — join multiple audio files (comma-separated --files)
COMMANDS['merge'] = (args) => {
  const files: string[] = (args.files || args.input || '').split(',').filter(Boolean);
  if (files.length < 2) {
    console.error('  ✖ Provide at least 2 files via --files "a.mp3,b.mp3,..."');
    return;
  }
  const output = resolveOutput(args.output, `merged_${Date.now()}.wav`);
  const list = files.map((f: string) => path.resolve(f)).map((f: string) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
  const listPath = path.join(process.cwd(), 'workspace', `_audiolist_${Date.now()}.txt`);
  fs.mkdirSync(path.dirname(listPath), { recursive: true });
  fs.writeFileSync(listPath, list);
  const ff = ['-fflags', '+genpts', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', output, '-y'];
  const res = runFfmpeg(ff, `Merged ${files.length} files`);
  fs.rmSync(listPath, { force: true });
  if (res.ok) console.log(`     → ${output}`);
};

// 3. FADE — fade in/out
COMMANDS['fade'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `faded_${path.basename(input)}`);
  const fin = args.fadeIn || args['fade-in'] || '0';
  const fout = args.fadeOut || args['fade-out'] || '0';
  let af = '';
  if (parseFloat(fin) > 0) af += `afade=t=in:st=0:d=${fin},`;
  if (parseFloat(fout) > 0) af += `afade=t=out:st=${args.end || '0'}:d=${fout}`;
  af = af.replace(/,$/, '');
  if (!af) {
    console.error('  ✖ Provide --fade-in and/or --fade-out (seconds). Use --end for fade-out start.');
    return;
  }
  runFfmpeg(['-i', input, '-af', af, '-c:a', 'pcm_s16le', output, '-y'], `Faded (in=${fin}s out=${fout}s)`);
};

// 4. NORMALIZE — loudness normalize (loudnorm)
COMMANDS['normalize'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `norm_${path.basename(input)}`);
  const lufs = args.lufs || args.target || '-14';
  const af = `loudnorm=I=${lufs}:TP=-1.5:LRA=11`;
  runFfmpeg(['-i', input, '-af', af, '-ar', '44100', output, '-y'], `Normalized to ${lufs} LUFS`);
};

// 5. NOISE — noise reduction
COMMANDS['noise'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `denoised_${path.basename(input)}`);
  const amount = args.amount || '8';
  // anlmdn (Non-Local Means denoiser) — reliable broadband noise reduction
  const af = `anlmdn=s=${amount}`;
  runFfmpeg(['-i', input, '-af', af, '-c:a', 'pcm_s16le', output, '-y'], `Noise-reduced (anlmdn s=${amount})`);
};

// 6. SPEED — change playback speed (atempo chains for >2x)
COMMANDS['speed'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `sped_${path.basename(input)}`);
  const rate = parseFloat(args.rate || args.speed || '1.0');
  if (!(rate > 0)) {
    console.error('  ✖ --rate must be > 0 (e.g. 0.5 slow, 2.0 fast)');
    return;
  }
  // build atempo chain: factors of 2 (ffmpeg limit)
  const factors: string[] = [];
  let r = rate;
  while (r > 2.0001) { factors.push('atempo=2.0'); r /= 2; }
  while (r < 0.5) { factors.push('atempo=0.5'); r /= 0.5; }
  factors.push(`atempo=${r.toFixed(4)}`);
  runFfmpeg(['-i', input, '-af', factors.join(','), '-c:v', 'copy', output, '-y'], `Speed ${rate}x (${factors.join(',')})`);
};

// 7. PITCH — shift pitch without changing tempo (rubberband if present, else asetrate)
COMMANDS['pitch'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `pitched_${path.basename(input)}`);
  const semis = parseFloat(args.semitones || args.pitch || '0');
  if (!semis) {
    console.error('  ✖ --semitones <n> required (e.g. 2 = up 2 semitones, -3 = down)');
    return;
  }
  // rubberband is preferred; fall back to asetrate (changes speed slightly)
  const factor = Math.pow(2, semis / 12);
  const af = `rubberband=pitch=${factor.toFixed(4)}`;
  const probe = spawnSync(ffmpegPath(), ['-filters'], { encoding: 'utf-8' });
  const useRubber = probe.stdout.includes('rubberband');
  const finalAf = useRubber ? af : `asetrate=44100*${factor.toFixed(4)},aresample=44100`;
  const note = useRubber ? 'rubberband (tempo preserved)' : 'asetrate fallback (tempo shifts slightly)';
  runFfmpeg(['-i', input, '-af', finalAf, output, '-y'], `Pitch ${semis} semis (${note})`);
};

// 8. INFO — metadata
COMMANDS['info'] = (args) => {
  const input = resolveInput(args.input);
  const info = getAudioInfo(input);
  if (!info) {
    console.error('  ✖ Could not read audio metadata');
    return;
  }
  const fmt = info.format || {};
  const aud = (info.streams || []).find((s: any) => s.codec_type === 'audio') || {};
  console.log(`\n  🔊 ${path.basename(input)}`);
  console.log(`  ──────────────────────────────`);
  console.log(`  Format:    ${fmt.format_name || '?'}`);
  console.log(`  Duration:  ${fmt.duration || '?'}s`);
  console.log(`  Size:      ${fmt.size ? (parseInt(fmt.size) / 1024).toFixed(0) + ' KB' : '?'}`);
  console.log(`  Codec:     ${aud.codec_name || '?'}`);
  console.log(`  SampleRate:${aud.sample_rate || '?'} Hz`);
  console.log(`  Channels:  ${aud.channels || '?'}`);
};

// 9. CONVERT — change audio container/codec (wav/mp3/ogg/flac/m4a)
COMMANDS['convert'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `conv_${Date.now()}${path.extname(input) || '.wav'}`);
  const ext = path.extname(output).replace(/^\./, '').toLowerCase();
  const acodec =
    ext === 'mp3' ? 'libmp3lame' :
    ext === 'ogg' ? 'libopus' :
    ext === 'm4a' ? 'aac' :
    ext === 'flac' ? 'flac' : 'pcm_s16le';
  runFfmpeg(['-i', input, '-c:a', acodec, output, '-y'], `Converted audio → ${ext.toUpperCase()}`);
};

// 10. REVERSE — play audio backwards
COMMANDS['reverse'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `rev_${path.basename(input)}`);
  runFfmpeg(['-i', input, '-af', 'areverse', '-c:a', 'pcm_s16le', output, '-y'], `Reversed audio`);
};

// 11. REVERB — add reverberation (aecho)
COMMANDS['reverb'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `reverb_${path.basename(input)}`);
  const inGain = args.inGain || '0.8';
  const outGain = args.outGain || '0.6';
  const d1 = parseInt(args.delays || '60', 10);
  const decay1 = args.decays || '0.5';
  // single echo (widely compatible): in:out:delay:decay
  const af = `aecho=${inGain}:${outGain}:${d1}:${decay1}`;
  runFfmpeg(['-i', input, '-af', af, '-c:a', 'pcm_s16le', output, '-y'], `Reverb (aecho)`);
};

// 12. ECHO — simple echo (concentric delays)
COMMANDS['echo'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `echo_${path.basename(input)}`);
  const delay = args.delay || '500';
  const decay = args.decay || '0.5';
  const af = `adelay=${delay}|${delay},aecho=0.8:0.9:${delay}:${decay}`;
  runFfmpeg(['-i', input, '-af', af, '-c:a', 'pcm_s16le', output, '-y'], `Echo (delay=${delay}ms)`);
};

// 13. EQUALIZE — 2/3-band EQ (equalizer filter)
COMMANDS['equalize'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `eq_${path.basename(input)}`);
  const bass = args.bass || '0';
  const treble = args.treble || '0';
  const mid = args.mid || '0';
  const af = `equalizer=f=100:width_type=h:width=50:g=${bass},equalizer=f=1000:width_type=h:width=200:g=${mid},equalizer=f=8000:width_type=h:width=1000:g=${treble}`;
  runFfmpeg(['-i', input, '-af', af, '-c:a', 'pcm_s16le', output, '-y'], `EQ (bass=${bass} mid=${mid} treble=${treble})`);
};

// 14. PAN — remix channels (stereo↔mono, L/R swap, balance)
COMMANDS['pan'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `pan_${path.basename(input)}`);
  const mode = args.mode || args.layout || 'mono';
  let af: string;
  switch (mode) {
    case 'mono':
    case 'downmix':
      af = `pan=mono|c0=0.5*c0+0.5*c1`;
      break;
    case 'stereo':
    case 'upmix':
      af = `pan=stereo|c0=c0|c1=c1`;
      break;
    case 'left':
    case 'l':
      af = `pan=mono|c0=c0`;
      break;
    case 'right':
    case 'r':
      af = `pan=mono|c0=c1`;
      break;
    case 'swap':
    case 'lr-swap':
      af = `pan=stereo|c0=c1|c1=c0`;
      break;
    default:
      // custom expression, e.g. "stereo|c0=0.7*c0+0.3*c1|c1=0.3*c0+0.7*c1"
      af = mode;
      break;
  }
  runFfmpeg(['-i', input, '-af', af, '-c:a', 'pcm_s16le', output, '-y'], `Pan (${mode})`);
};

// 15. COMPAND — dynamics (compressor/limiter via compand + alimiter)
COMMANDS['compand'] = (args) => {
  const input = resolveInput(args.input);
  const output = resolveOutput(args.output, `dyn_${path.basename(input)}`);
  const attack = args.attack || '0.005';
  const decay = args.decay || '0.2';
  const threshold = args.threshold || '0.01';
  const ratio = args.ratio || '2';
  const af = `compand=attacks=${attack}:decays=${decay}:points=-80/-80|-30/-20|0/0|20/20,alimiter=limit=0.8:asc=1`;
  runFfmpeg(['-i', input, '-af', af, '-c:a', 'pcm_s16le', output, '-y'], `Dynamics (compand+limiter, ratio=${ratio})`);
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);
  const subcommand = process.argv[2] || '';

  console.log(`\n  🔊 AVS Audio Toolbox`);
  console.log(`  ───────────────────\n`);

  if (!COMMANDS[subcommand]) {
    console.log('  Available commands:');
    for (const cmd of Object.keys(COMMANDS).sort()) console.log(`    ${cmd}`);
    console.log(`\n  Run: npx tsx src/adapters/cli/agentic-audio.ts <command> --input <file> [options]`);
    console.log(`  Or:  npm run agentic:audio <command> -- --input <file>`);
    return;
  }

  COMMANDS[subcommand](args);
}

main();
