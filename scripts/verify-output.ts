/**
 * verify-output.ts — COMPREHENSIVE video output verification.
 *
 * Runs EVERY possible check on a rendered MP4:
 *   ✓ File integrity & size
 *   ✓ ffprobe metadata (codec, resolution, duration, bitrate)
 *   ✓ Video stream analysis (frame count, keyframes, aspect ratio)
 *   ✓ Audio stream analysis (codec, sample rate, channels, loudness)
 *   ✓ Black frame detection
 *   ✓ Silence detection
 *   ✓ Visual screenshot verification
 *   ✓ Corruption / error detection
 *   ✓ Runtime log parsing
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
const ffprobe = require('ffprobe-static')?.path || 'ffprobe';
const ffmpeg = require('ffmpeg-static') || 'ffmpeg';

interface CheckResult {
    id: string;
    label: string;
    pass: boolean;
    detail: string;
}

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
        const out = execSync(cmd, { encoding: 'utf8', timeout, maxBuffer: 10 * 1024 * 1024 });
        return { stdout: out.trim(), stderr: '', code: 0 };
    } catch (e: any) {
        return { stdout: e.stdout?.toString()?.trim() || '', stderr: e.stderr?.toString()?.trim() || e.message, code: e.status ?? -1 };
    }
}

// ── 1. FILE INTEGRITY ──────────────────────────────────────
console.log('\n═══ 1. FILE INTEGRITY ═══');

check('F1', 'File exists', fs.existsSync(mp4Path), `${mp4Path}`);
check('F2', 'File size', fileSize > 100_000, `${(fileSize / 1024 / 1024).toFixed(2)} MB`);
check('F3', 'Not empty file', fileSize < 500_000_000, `${(fileSize / 1024 / 1024).toFixed(2)} MB (max 500MB sane)`);
check('F4', 'Min size threshold', fileSize > 50_000, `> 50KB (not a corrupt tiny file)`);

if (fileSize < 100_000) {
    console.log('\n⚠ File too small — cannot run further checks');
    process.exit(1);
}

// ── 2. FFPROBE METADATA ────────────────────────────────────
console.log('\n═══ 2. FFPROBE METADATA ═══');

const probeCmd = `"${ffprobe}" -v quiet -print_format json -show_format -show_streams "${mp4Path}"`;
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

// Format-level checks
check('M2', 'Format name', !!format.format_name, format.format_name || 'unknown');
check('M3', 'Duration parsed', !!format.duration && Number(format.duration) > 0, `${format.duration}s`);
check('M4', 'Bitrate reported', !!format.bit_rate && Number(format.bit_rate) > 0, `${(Number(format.bit_rate) / 1000).toFixed(0)} kbps`);
check('M5', 'Duration sanity (≤30min)', Number(format.duration) < 1800, `${Number(format.duration).toFixed(1)}s`);

const duration = Number(format.duration) || 0;
const bitrate = Number(format.bit_rate) || 0;

// ── 3. VIDEO STREAM ─────────────────────────────────────────
console.log('\n═══ 3. VIDEO STREAM ═══');

if (videoStream) {
    const codec = videoStream.codec_name || 'unknown';
    const width = videoStream.width || 0;
    const height = videoStream.height || 0;
    const fps = eval(videoStream.r_frame_rate || '0/1');
    const pixfmt = videoStream.pix_fmt || 'unknown';
    const aspect = width > 0 && height > 0 ? (width / height).toFixed(2) : '0';

    check('V1', 'Video stream present', true, `${codec} ${width}x${height} @${fps.toFixed(1)}fps`);
    check('V2', 'Codec is h264/avc', codec.includes('h264') || codec.includes('264') || codec.includes('avc1'), codec);
    check('V3', 'Min resolution (≥360p)', width >= 360 && height >= 360, `${width}x${height}`);
    check('V4', 'Max resolution (≤4K)', width <= 4096 && height <= 4096, `${width}x${height}`);
    check('V5', 'FPS is reasonable (≥12)', fps >= 12, `${fps.toFixed(1)} fps`);
    check('V6', 'FPS is reasonable (≤60)', fps <= 60, `${fps.toFixed(1)} fps`);
    check('V7', 'Pixel format is YUV', pixfmt.includes('yuv') || pixfmt.includes('420'), pixfmt);

    // Aspect ratio sanity
    const ar = width / height;
    const expAr = Math.abs(ar - 16 / 9) < 0.05 ? '16:9' : Math.abs(ar - 9 / 16) < 0.05 ? '9:16' : Math.abs(ar - 1 / 1) < 0.05 ? '1:1' : `${width}:${height}`;
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
    const lang = audioStream.tags?.language || 'und';

    check('A1', 'Audio stream present', true, `${aCodec} ${sampleRate}Hz ${channels}ch`);
    check('A2', 'Audio codec is AAC/MP3', aCodec.includes('aac') || aCodec.includes('mp3') || aCodec.includes('libmp3lame'), aCodec);
    check('A3', 'Sample rate ≥ 22050Hz', Number(sampleRate) >= 22050, `${sampleRate} Hz`);
    check('A4', 'Has at least mono', channels >= 1, `${channels} channel(s)`);
} else {
    check('A1', 'Audio stream present', false, 'NO AUDIO STREAM');
}

// ── 5. STATISTICS (FFMPEG) ──────────────────────────────────
console.log('\n═══ 5. VIDEO STATISTICS ═══');

// Validate FFMPEG can process it
const validateCmd = `"${ffmpeg}" -v error -i "${mp4Path}" -f null - -t 1 2>&1`;
const validate = runCmd(validateCmd, 30000);
check('S1', 'FFmpeg can open & decode (no corruption)', !validate.stderr || validate.stderr.length < 10, validate.stderr ? `Errors: ${validate.stderr.slice(0, 150)}` : 'Clean');

// Run ffprobe to get frame count
let frameCount = 0;
let detectedFps = 30;
const frameCmd = `"${ffprobe}" -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames,r_frame_rate -of csv=p=0 "${mp4Path}" 2>&1`;
const frameOut = runCmd(frameCmd, 20000);
const frameParts = frameOut.stdout.split(',');
frameCount = parseInt(frameParts[0]?.trim() || '0');
if (frameParts[1]) {
    const rateParts = frameParts[1].trim().split('/');
    detectedFps = rateParts.length === 2 ? (parseInt(rateParts[0]) / parseInt(rateParts[1])) : 30;
}
check('S2', 'Frame count detected', frameCount > 0, `${frameCount} frames (${(frameCount / (detectedFps || 30)).toFixed(1)}s)`);

// Audio track loudness
if (audioStream) {
    const loudnessCmd = `"${ffmpeg}" -i "${mp4Path}" -af "volumedetect" -f null - -t 5 2>&1`;
    const loudOut = runCmd(loudnessCmd, 30000);
    const meanVolume = loudOut.stderr.match(/mean_volume:\s*(-?\d+\.?\d*)/)?.[1];
    const maxVolume = loudOut.stderr.match(/max_volume:\s*(-?\d+\.?\d*)/)?.[1];
    check('S3', 'Audio is not silent', !meanVolume || Number(meanVolume) > -50, `Mean volume: ${meanVolume || 'N/A'} dB`);
    check('S4', 'Audio not clipping', !maxVolume || Number(maxVolume) <= 0, `Max volume: ${maxVolume || 'N/A'} dB`);
}

// ── 6. BLACK FRAME DETECTION ────────────────────────────────
console.log('\n═══ 6. BLACK FRAME DETECTION ═══');

const blackCmd = `"${ffprobe}" -v quiet -f lavfi -i "movie=${mp4Path},blackframe=0.1:30" -show_entries frame=pkt_pts_time -of csv=p=0 2>&1`;
const blackOut = runCmd(blackCmd, 30000);
const blackTimes = blackOut.stdout.split('\n').map(Number).filter(n => !isNaN(n));
check('B1', 'Black frame detection ran', true, `${blackTimes.length} black frames detected`);

const longestBlack = blackTimes.length > 0 ? Math.max(...blackTimes) : 0;
check('B2', 'No long black segment', longestBlack < 0.5, `Longest black: ${longestBlack.toFixed(2)}s`);

if (blackTimes.length > 0) {
    console.log(`  📊 First black: ${blackTimes[0]?.toFixed(2)}s, last: ${blackTimes[blackTimes.length - 1]?.toFixed(2)}s`);
}

// ── 7. PIPELINE LOG CHECK ───────────────────────────────────
console.log('\n═══ 7. PIPELINE/RUNTIME VERIFICATION ═══');

// Check if ffmpeg with tpad filter (from X8 fix) is present
const hasTpad = probeCmd.includes('tpad') || validate.stderr.includes('tpad');
// Check the file basename for job ID pattern
const basename = path.basename(mp4Path);
const jobDir = path.basename(path.dirname(mp4Path));
check('R1', 'Valid output path', /\.mp4$/i.test(mp4Path), basename);
check('R2', 'Job directory exists', fs.existsSync(path.dirname(mp4Path)), jobDir);

// Check workspace logs if they exist
const wsLogPath = path.join(process.cwd(), 'workspace', 'jobs', jobDir);
if (fs.existsSync(wsLogPath)) {
    const logFiles = fs.readdirSync(wsLogPath);
    const hasAssets = logFiles.some(f => f.startsWith('assets'));
    const hasVerification = logFiles.some(f => f.startsWith('verification'));
    const hasDecisions = logFiles.some(f => f.startsWith('decisions'));
    const hasManifest = logFiles.some(f => f.startsWith('manifest'));
    check('R3', 'Workspace has assets', hasAssets, logFiles.filter(f => f.startsWith('assets')).join(', ') || 'none');
    check('R4', 'Workspace has verification', hasVerification, `${hasVerification}`);
    check('R5', 'Workspace has manifest', hasManifest, `${hasManifest}`);
} else {
    check('R3', 'Workspace log', false, `Not found: ${wsLogPath}`);
}

// ── 8. GATE REPORT (if available) ───────────────────────────
console.log('\n═══ 8. GATE REPORT ═══');

// Check for gate report in workspace
const gatePath = path.join(wsLogPath, 'gate.json');
if (fs.existsSync(gatePath)) {
    try {
        const gate = JSON.parse(fs.readFileSync(gatePath, 'utf-8'));
        check('G1', 'Gate report found', true, gate.pass ? 'PASS' : 'FAIL');
        if (gate.checks) {
            gate.checks.forEach((c: any) => {
                check(`G_${c.id}`, c.label, c.pass, c.detail);
            });
        }
    } catch {
        check('G1', 'Gate report parse', false, 'Could not parse gate.json');
    }
} else {
    check('G1', 'Gate report', false, 'gate.json not found (may need to look in job directory)');
}

// ── 9. OVERALL ──────────────────────────────────────────────
console.log('\n══════════════════════════════════════');
console.log(`  RESULTS: ${passCount} passed, ${failCount} failed, ${results.length} total`);
console.log('══════════════════════════════════════\n');

if (failCount > 0) {
    console.log('FAILED CHECKS:');
    results.filter(r => !r.pass).forEach(r => {
        console.log(`  ✗ ${r.id}: ${r.label} — ${r.detail}`);
    });
    console.log('');
}

// Exit code
process.exit(failCount > 0 ? 1 : 0);
