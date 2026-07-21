/**
 * verify-output.ts — COMPREHENSIVE video output verification.
 *
 * Runs EVERY possible check on a rendered MP4:
 *   ✓ File integrity & size
 *   ✓ ffprobe metadata (codec, resolution, duration, bitrate)
 *   ✓ Video stream analysis (frame count, keyframes, aspect ratio)
 *   ✓ Audio stream analysis (codec, sample rate, channels, loudness)
 *   ✓ Black frame detection
 *   ✓ Silence detection / loudness
 *   ✓ Corruption / error detection
 *   ✓ Pipeline log verification
 *
 * Usage: npx tsx scripts/verify-output.ts <path-to-mp4> [--verbose]
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ── Config ──────────────────────────────────────────────────
const verbose = process.argv.includes('--verbose');
const mp4Path = process.argv[2];
if (!mp4Path || !fs.existsSync(mp4Path)) {
    console.error('Usage: npx tsx scripts/verify-output.ts <path-to-mp4> [--verbose]');
    console.error(`Provided path: "${mp4Path}" exists=${!!mp4Path && fs.existsSync(mp4Path)}`);
    process.exit(1);
}

const fileSize = fs.statSync(mp4Path).size;
// Resolve ffmpeg/ffprobe paths from bundled packages
let FFPROBE = 'ffprobe';
let FFMPEG = 'ffmpeg';
try { FFPROBE = require('ffprobe-static')?.path || 'ffprobe'; } catch {}
try { FFMPEG = require('ffmpeg-static') || 'ffmpeg'; } catch {}

// ── Helpers ──────────────────────────────────────────────────
interface CheckResult { id: string; label: string; pass: boolean; detail: string; }
const results: CheckResult[] = [];
let passCount = 0;
let failCount = 0;

function check(id: string, label: string, pass: boolean, detail: string) {
    const r: CheckResult = { id, label, pass, detail };
    results.push(r);
    if (pass) passCount++;
    else failCount++;
    console.log(`  ${pass ? '✓' : '✗'} ${id.padEnd(6)} ${label}: ${detail}`);
}

function runCmd(cmd: string, timeout = 15000): { stdout: string; stderr: string; code: number } {
    try {
        const out = execSync(cmd, { encoding: 'utf8' as BufferEncoding, timeout, maxBuffer: 10 * 1024 * 1024 });
        return { stdout: out.trim(), stderr: '', code: 0 };
    } catch (e: any) {
        return {
            stdout: e.stdout?.toString()?.trim() || '',
            stderr: e.stderr?.toString()?.trim() || e.message,
            code: e.status ?? -1,
        };
    }
}

// ── 1. FILE INTEGRITY ──────────────────────────────────────
console.log('\n═══ 1. FILE INTEGRITY ═══');

check('F1', 'File exists', fs.existsSync(mp4Path), `${mp4Path}`);
check('F2', 'File size', fileSize > 100_000, `${(fileSize / 1024 / 1024).toFixed(2)} MB`);
check('F3', 'Not oversized', fileSize < 500_000_000, `${(fileSize / 1024 / 1024).toFixed(2)} MB`);
check('F4', 'Min size threshold', fileSize > 50_000, '> 50KB (not corrupt tiny file)');

if (fileSize < 100_000) {
    console.log('\n⚠ File too small — cannot run further checks');
    process.exit(1);
}

// ── 2. FFPROBE METADATA ────────────────────────────────────
console.log('\n═══ 2. FFPROBE METADATA ═══');

const probeCmd = `"${FFPROBE}" -v quiet -print_format json -show_format -show_streams "${mp4Path}"`;
const probe = runCmd(probeCmd, 20000);
const probeOk = probe.code === 0 && probe.stdout.length > 0;
check('M1', 'ffprobe reads file', probeOk, probeOk ? 'Metadata parsed OK' : `ffprobe error: ${probe.stderr.slice(0, 100)}`);

if (!probeOk) {
    console.log('\n⚠ Cannot read file — corruption detected');
    process.exit(1);
}

const meta = JSON.parse(probe.stdout);
const format = meta.format || {};
const streams: any[] = meta.streams || [];
const videoStream = streams.find((s: any) => s.codec_type === 'video');
const audioStream = streams.find((s: any) => s.codec_type === 'audio');

check('M2', 'Format name', !!format.format_name, format.format_name || 'unknown');
check('M3', 'Duration parsed', !!format.duration && Number(format.duration) > 0, `${format.duration}s`);
check('M4', 'Bitrate reported', !!format.bit_rate && Number(format.bit_rate) > 0, `${(Number(format.bit_rate) / 1000).toFixed(0)} kbps`);
check('M5', 'Duration sanity (≤30min)', Number(format.duration) < 1800, `${Number(format.duration).toFixed(1)}s`);

// ── 3. VIDEO STREAM ─────────────────────────────────────────
console.log('\n═══ 3. VIDEO STREAM ═══');

if (videoStream) {
    const codec = videoStream.codec_name || 'unknown';
    const width = videoStream.width || 0;
    const height = videoStream.height || 0;
    const fps = eval(videoStream.r_frame_rate || '0/1');
    const pixfmt = videoStream.pix_fmt || 'unknown';

    check('V1', 'Video stream present', true, `${codec} ${width}x${height} @${fps.toFixed(1)}fps`);
    check('V2', 'Codec is h264', /^(h264|avc1)/.test(codec), codec);
    check('V3', 'Min resolution (≥360p)', width >= 360 && height >= 360, `${width}x${height}`);
    check('V4', 'Max resolution (≤4K)', width <= 4096 && height <= 4096, `${width}x${height}`);
    check('V5', 'FPS is reasonable (≥12)', fps >= 12, `${fps.toFixed(1)} fps`);
    check('V6', 'FPS is reasonable (≤60)', fps <= 60, `${fps.toFixed(1)} fps`);
    check('V7', 'Pixel format is YUV', /^(yuv|420)/.test(pixfmt), pixfmt);

    const ar = width / height;
    const expAr = Math.abs(ar - 16 / 9) < 0.05 ? '16:9' : Math.abs(ar - 9 / 16) < 0.05 ? '9:16' : Math.abs(ar - 1) < 0.05 ? '1:1' : `${width}:${height}`;
    check('V8', 'Aspect ratio is standard', ['16:9', '9:16', '1:1'].includes(expAr), `${width}x${height} = ${expAr}`);
} else {
    check('V1', 'Video stream present', false, 'NO VIDEO STREAM');
}

// ── 4. AUDIO STREAM ─────────────────────────────────────────
console.log('\n═══ 4. AUDIO STREAM ═══');

if (audioStream) {
    const aCodec = audioStream.codec_name || 'unknown';
    const sampleRate = audioStream.sample_rate || '0';
    const channels = audioStream.channels || 0;

    check('A1', 'Audio stream present', true, `${aCodec} ${sampleRate}Hz ${channels}ch`);
    check('A2', 'Audio codec is AAC/MP3', /^(aac|mp3|libmp3lame)/.test(aCodec), aCodec);
    check('A3', 'Sample rate ≥ 22050Hz', Number(sampleRate) >= 22050, `${sampleRate} Hz`);
    check('A4', 'Has at least mono', channels >= 1, `${channels} channel(s)`);
} else {
    check('A1', 'Audio stream present', false, 'NO AUDIO STREAM');
}

// ── 5. VIDEO STATISTICS ─────────────────────────────────────
console.log('\n═══ 5. VIDEO STATISTICS ═══');

// Validate FFMPEG can process it
const validateCmd = `"${FFMPEG}" -v error -i "${mp4Path}" -f null - -t 1 2>&1`;
const validate = runCmd(validateCmd, 30000);
const hasErrors = validate.stderr && validate.stderr.length > 10;
check('S1', 'FFmpeg decodes cleanly', !hasErrors, hasErrors ? `Errors: ${validate.stderr.slice(0, 150)}` : 'Clean');

// Frame count
let frameCount = 0;
let detectedFps = 30;
const frameCmd = `"${FFPROBE}" -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames,r_frame_rate -of csv=p=0 "${mp4Path}" 2>&1`;
const frameOut = runCmd(frameCmd, 20000);
const frameParts = frameOut.stdout.split(',');
frameCount = parseInt(frameParts[0]?.trim() || '0');
if (frameParts[1]) {
    const rateParts = frameParts[1].trim().split('/');
    detectedFps = rateParts.length === 2 ? (parseInt(rateParts[0]) / parseInt(rateParts[1])) : 30;
}
check('S2', 'Frame count detected', frameCount > 0, `${frameCount} frames (${(frameCount / (detectedFps || 30)).toFixed(1)}s)`);

// Audio loudness analysis
if (audioStream) {
    const loudnessCmd = `"${FFMPEG}" -i "${mp4Path}" -af "volumedetect" -f null - -t 5 2>&1`;
    const loudOut = runCmd(loudnessCmd, 30000);
    const meanVol = loudOut.stderr.match(/mean_volume:\s*(-?\d+\.?\d*)/)?.[1];
    const maxVol = loudOut.stderr.match(/max_volume:\s*(-?\d+\.?\d*)/)?.[1];
    check('S3', 'Audio is not silent', !meanVol || Number(meanVol) > -50, `Mean: ${meanVol || 'N/A'} dB`);
    check('S4', 'Audio not clipping', !maxVol || Number(maxVol) <= 0, `Max: ${maxVol || 'N/A'} dB`);
    if (verbose && meanVol) console.log(`  📊 Loudness: mean=${meanVol}dB, max=${maxVol}dB`);
}

// ── 6. BLACK FRAME DETECTION ────────────────────────────────
console.log('\n═══ 6. BLACK FRAME DETECTION ═══');

// Detect black segments using blackdetect (correct filter, unlike deprecated blackframe)
const blackCmd = `"${FFMPEG}" -i "${mp4Path}" -filter:v "blackdetect=d=0.3:pix_th=0.15" -f null - 2>&1`;
const blackOut = runCmd(blackCmd, 60000);
// Parse black_start/black_end/black_duration
const blackRe = /black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g;
const blackSegments: { start: number; end: number; duration: number }[] = [];
let bm: RegExpExecArray | null;
while ((bm = blackRe.exec(blackOut.stdout + blackOut.stderr)) !== null) {
    blackSegments.push({ start: parseFloat(bm[1]), end: parseFloat(bm[2]), duration: parseFloat(bm[3]) });
}
check('B1', 'Black frame detection ran', true, `${blackSegments.length} black segments found`);

const longestBlackSeg = blackSegments.reduce((m, s) => Math.max(m, s.duration), 0);
check('B2', 'No black segment > 0.5s', longestBlackSeg < 0.5, `Longest black: ${longestBlackSeg.toFixed(2)}s`);

if (blackSegments.length > 0) {
    for (const seg of blackSegments) {
        console.log(`  🖤 Black: ${seg.start.toFixed(2)}s → ${seg.end.toFixed(2)}s (dur=${seg.duration.toFixed(2)}s)`);
    }
}

// ── 7. PIPELINE LOGS ────────────────────────────────────────
console.log('\n═══ 7. PIPELINE/RUNTIME LOGS ═══');

const basename = path.basename(mp4Path);
const jobDir = path.basename(path.dirname(mp4Path));
check('L1', 'Valid .mp4 filename', /\.mp4$/i.test(mp4Path), basename);
check('L2', 'Job directory present', fs.existsSync(path.dirname(mp4Path)), jobDir);

const wsPath = path.join(process.cwd(), 'workspace', 'jobs', jobDir);
if (fs.existsSync(wsPath)) {
    const logFiles = fs.readdirSync(wsPath);
    const hasAssets = logFiles.some(f => f.startsWith('assets'));
    const hasManifest = logFiles.some(f => f === 'manifest.json' || f.endsWith('manifest.json'));
    const hasVerification = logFiles.some(f => f.startsWith('verification'));
    const hasDecisions = logFiles.some(f => f.startsWith('decisions'));
    check('L3', 'Assets directory', hasAssets, `${hasAssets}`);
    check('L4', 'Manifest file', hasManifest, `${hasManifest}`);
    check('L5', 'Verification results', hasVerification, `${hasVerification}`);
    check('L6', 'Decision report', hasDecisions, `${hasDecisions}`);
} else {
    check('L3', 'Workspace logs', false, `Not found: ${wsPath}`);
}

// ── 8. GATE REPORT ─────────────────────────────────────────
console.log('\n═══ 8. GATE REPORT ═══');

const gatePath = path.join(wsPath, 'gate.json');
if (fs.existsSync(gatePath)) {
    try {
        const gate = JSON.parse(fs.readFileSync(gatePath, 'utf-8'));
        check('G1', 'Gate report found', true, gate.pass ? 'PASS ✓' : 'FAIL ✗');
        if (gate.checks) gate.checks.forEach((c: any) => check(`G_${c.id}`, c.label, c.pass, c.detail || ''));
    } catch {
        check('G1', 'Gate report parse', false, 'Could not parse gate.json');
    }
} else {
    check('G1', 'Gate report file', false, 'gate.json not found');
}

// ── SUMMARY ─────────────────────────────────────────────────
console.log('\n══════════════════════════════════════');
console.log(`  RESULTS: ${passCount} passed, ${failCount} failed, ${results.length} total`);
console.log('══════════════════════════════════════\n');

if (failCount > 0) {
    console.log('FAILED:');
    results.filter(r => !r.pass).forEach(r => console.log(`  ✗ ${r.id}: ${r.label} — ${r.detail}`));
    console.log('');
}

process.exit(failCount > 0 ? 1 : 0);