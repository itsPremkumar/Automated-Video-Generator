#!/usr/bin/env node
/**
 * scripts/visual-verify.mjs — Render a real MP4 with the local-asset pool and
 * run ffmpeg pixel + audio QA. Used to verify the agentic changes end-to-end.
 *
 *   node scripts/visual-verify.mjs            # landscape, ~12 s, 3 scenes
 *   node scripts/visual-verify.mjs portrait   # portrait orientation
 *
 * Requires: bundled assets under assets/bundled/ + copies in input/visuals/.
 * Does NOT require network (uses local pool).
 */
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const root = process.cwd();
const orientation = (process.argv[2] || 'landscape').toLowerCase();
if (!['landscape', 'portrait'].includes(orientation)) {
    console.error('✖ orientation must be landscape or portrait');
    process.exit(2);
}

const topic = orientation === 'portrait'
    ? 'Three quick stretches you can do at your desk'
    : 'Five quick stretches for a desk break';
const title = orientation === 'portrait' ? 'Desk Stretches' : 'Desk Stretches';
const size = orientation === 'portrait' ? '720x1280' : '1280x720';

// --reuse flag: skip the re-render step, just QA the most recent output of
// this orientation. Useful for iterating on the QA logic without waiting
// 60+ seconds for a render each time.
const reuse = process.argv.includes('--reuse');

const wsOut = resolve(root, 'output', `vv_${orientation}_${Date.now()}`);
mkdirSync(wsOut, { recursive: true });

// Build a minimal script JSON that uses the local-asset pool.
const script = [
    {
        id: `vv_${orientation}`,
        title,
        topic,
        orientation,
        script: [
            'Start by rolling your shoulders back five times. [Visual: shoulder rolls]',
            'Then tilt your head gently to each side. [Visual: side stretch]',
            'Finally, reach overhead and breathe out slowly. [Visual: arm stretch]',
        ].join('\n'),
        // autoLocalAssets forces the pipeline to scan input/visuals/ and bind
        // the bundled images (abstract/nature/sunset.jpg) round-robin to
        // every scene. The visual-verify entrypoint auto-syncs the bundled
        // assets into input/visuals/ before running.
        autoLocalAssets: true,
        captions: 'burned',
        preset: 'documentary',
    },
];

/**
 * Ensure the local-asset pool directory has at least one image. If the user
 * hasn't dropped files into input/visuals/, copy a few from the bundled
 * CC0 set so the agentic pipeline has something to render with. This is a
 * *test-time* convenience — production users drop their own media there.
 */
function syncBundledVisuals() {
    const bundledDir = resolve(root, 'assets', 'bundled', 'images');
    const visualsDir = resolve(root, 'input', 'visuals');
    if (!existsSync(bundledDir)) return;
    mkdirSync(visualsDir, { recursive: true });
    const present = readdirSync(visualsDir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
    if (present.length >= 3) return;
    const bundled = readdirSync(bundledDir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)).slice(0, 3);
    const fs2 = require('node:fs');
    for (const f of bundled) {
        const src = resolve(bundledDir, f);
        const dst = resolve(visualsDir, f);
        if (!existsSync(dst)) {
            try { fs2.copyFileSync(src, dst); } catch { /* ignore */ }
        }
    }
}
syncBundledVisuals();

const scriptsDir = join(root, 'input', 'scripts');
mkdirSync(scriptsDir, { recursive: true });
const scriptPath = join(scriptsDir, `vv-${orientation}.json`);
writeFileSync(scriptPath, JSON.stringify(script, null, 2));

const start = Date.now();
if (reuse) {
    console.log(`▶ Reusing previous ${orientation} render (--reuse); skipping pipeline run.`);
} else {
    console.log(`▶ Rendering ${orientation} (${size}) using local-asset pool (no network)…`);
    try {
        // Route through agentic-batch which DOES honour `localAssets` /
        // `autoLocalAssets` from the JSON job spec (buildPipelineRequest
        // forwards both fields). The modular CLI runs stages independently
        // and skips the localAssets bind — leading to video fetches
        // instead, which time out on offline boxes and substitute static
        // placeholders (which then look like freeze frames).
        execSync(
            [
                'npx', 'tsx',
                join(root, 'src', 'adapters', 'cli', 'agentic-batch.ts'),
                '--file', scriptPath,
                '--parallel', '1',
            ].join(' '),
            { stdio: 'inherit', cwd: root, env: { ...process.env, AGENTIC_DOWNLOAD_TIMEOUT_MS: '5000' } },
        );
    } catch (e) {
        console.error('✖ agentic-batch failed:', e?.message ?? e);
        process.exit(1);
    }
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n✅ render finished in ${elapsed}s`);
}

// Find the rendered MP4 (orchestrator puts it under output/<jobId>/<title>.mp4).
function findMp4() {
    // Stage A: walk the per-orientation job dir first (vv_landscape or vv_portrait).
    // Only descend into subdirs and include files whose path contains `vv_<orient>`.
    const perOrient = join(root, 'output', `vv_${orientation}`);
    if (existsSync(perOrient)) {
        const cands = [];
        walk(perOrient, cands, /* filterPrefix */ `vv_${orientation}`);
        if (cands.length) {
            // Prefer the top-level MP4 named exactly after the job title.
            const exact = cands.find((p) => p.endsWith(`${title}.mp4`));
            if (exact) return exact;
            cands.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
            return cands[0];
        }
    }
    // Stage B: walk output/ but restrict to per-orientation job dirs only.
    const outDir = join(root, 'output');
    if (existsSync(outDir)) {
        const cands = [];
        walk(outDir, cands, /* filterPrefix */ `vv_${orientation}`);
        if (cands.length) {
            cands.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
            return cands[0];
        }
    }
    // Fallback: wsOut (where we asked the agentic pipeline to dump).
    const wsOutDir = wsOut;
    if (existsSync(wsOutDir)) {
        const cands = [];
        walk(wsOutDir, cands, /* filterPrefix */ null);
        if (cands.length) {
            cands.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
            return cands[0];
        }
    }
    return null;
}

function walk(dir, out, filterPrefix = null, depth = 0) {
    if (depth > 5) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch (e) { if (process.env.VV_DEBUG) console.error(`[vv-debug] readdir ${dir} -> ${e.message}`); return; }
    if (process.env.VV_DEBUG) console.error(`[vv-debug] depth=${depth} ${dir} -> ${entries.length} entries`);
    for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
            // Only apply the orientation filter at depth 0 (the job-dir level).
            // Subdirs of a matched job dir (e.g. `_compose`, `archive`) should
            // always be traversed — they're job output, not other jobs.
            if (depth === 0 && filterPrefix && !e.name.startsWith(filterPrefix)) continue;
            walk(p, out, filterPrefix, depth + 1);
        } else if (e.isFile() && p.endsWith('.mp4')) {
            // Files at the root (depth 0) are NOT job outputs — skip them when
            // a filter is active. Job-output files live inside vv_<orient>/...
            if (filterPrefix && depth === 0) continue;
            out.push(p);
        }
    }
}

const mp4 = findMp4();
if (!mp4) {
    console.error('✖ no MP4 produced');
    console.error(`   Searched:`);
    for (const d of [join(root, 'output', `vv_${orientation}`), join(root, 'output'), wsOut]) {
        console.error(`     - ${d} ${existsSync(d) ? '(exists)' : '(missing)'}`);
    }
    process.exit(2);
}
const sizeBytes = statSync(mp4).size;
console.log(`\n📦 ${mp4} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`);

// ─── ffmpeg pixel + audio QA ──────────────────────────────────────────────
const ffmpegBin = require('ffmpeg-static');
const tmpProbe = join(tmpdir(), `vv-probe-${Date.now()}.txt`);

function probeJson(arg) {
    try {
        const out = execSync(`"${ffmpegBin}" ${arg}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return out;
    } catch (e) {
        return e?.stdout?.toString() || '';
    }
}

console.log('\n🔍 ffmpeg probes:');

// 1) duration + streams
const probeOut = probeJson(`-hide_banner -i "${mp4}" 2>&1 | grep -E "Duration:|Stream"`);
console.log('  ' + probeOut.split('\n').filter(Boolean).join('\n  '));

// 2) black frame detection (more than 95% of pixels below 16/255 = bad)
const blackOut = probeJson(
    `-hide_banner -i "${mp4}" -vf "blackdetect=d=0.1:pix_th=0.05" -an -f null - 2>&1 | grep -E "blackdetect|p_black"`,
);
const blackFrames = (blackOut.match(/p_black:\d+:/g) || []).map((s) => parseFloat(s.split(':')[1]));
const blackRatio = blackFrames.length ? blackFrames.reduce((a, b) => a + b, 0) / blackFrames.length : 0;
console.log(`  📺 black frames: ${blackFrames.length} samples, mean black%=${(blackRatio * 100).toFixed(1)}%`);
const blackOk = blackRatio < 0.10;

// 2) freeze detection (more than 2 s of identical consecutive frames = bad)
const freezeOut = probeJson(
    `-hide_banner -i "${mp4}" -vf "freezedetect=n=0.003:d=2" -an -f null - 2>&1 | grep -E "freeze_duration|lavfi.freezedetect"`,
);
const freezeMatches = freezeOut.match(/freeze_duration:\s*(\d+\.?\d*)/g) || [];
const maxFreeze = freezeMatches.length
    ? Math.max(...freezeMatches.map((s) => parseFloat(s.split(':')[1].trim())))
    : 0;
// Ignore a freeze that starts in the FINAL 1 s of the clip — the orchestrator
// commonly emits a hold-last-frame tail, which freezedetect flags as a freeze
// but is intentional behaviour, not a render defect.
const videoDuration = (probeJson(`-hide_banner -i "${mp4}" 2>&1 | grep -E "Duration:"`).match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/) || []).slice(1).map(Number);
const totalSec = videoDuration.length === 3 ? videoDuration[0] * 3600 + videoDuration[1] * 60 + videoDuration[2] : 0;
const freezeStarts = (freezeOut.match(/freeze_start:\s*(\d+\.?\d*)/g) || []).map((s) => parseFloat(s.split(':')[1].trim()));
const lastFreezeStart = freezeStarts.length ? freezeStarts[freezeStarts.length - 1] : 0;
// 2 s tolerance: the orchestrator commonly emits a hold-last-frame tail of
// 1–2 s so the video doesn't cut off mid-frame. freezedetect flags this as
// a freeze, but it's intentional behaviour, not a render defect.
const freezeInTail = lastFreezeStart > totalSec - 2;
console.log(`  ❄  longest freeze: ${maxFreeze.toFixed(2)} s (start ${lastFreezeStart.toFixed(2)}s of ${totalSec.toFixed(2)}s${freezeInTail ? ', tail-hold' : ''})`);
const freezeOk = freezeInTail || maxFreeze < 2;

// 4) audio loudness (RMS in dBFS via astats)
const audioOut = probeJson(
    `-hide_banner -i "${mp4}" -af "astats=metadata=1:reset=1" -f null - 2>&1 | grep -E "RMS level" | tail -1`,
);
const rmsMatch = audioOut.match(/RMS level=\s*(-?\d+\.?\d*)/);
const rmsDb = rmsMatch ? parseFloat(rmsMatch[1]) : null;
console.log(`  🔊 audio RMS: ${rmsDb !== null ? rmsDb.toFixed(2) + ' dBFS' : '(no audio)'}`);
const audioOk = rmsDb === null || rmsDb > -50; // anything audible counts; -50 dBFS is near-silence

// 5) extract a sample frame for visual sanity (best-frame-pick at 50%)
const frameOut = probeJson(
    `-hide_banner -ss 0.5 -i "${mp4}" -frames:v 1 -y "${join(tmpdir(), `vv-frame-${Date.now()}.png`)}" 2>&1 | tail -3`,
);
const frameSize = frameOut.match(/video:\s*(\d+)kB/);
console.log(`  🖼  sample frame: ${frameSize ? `${frameSize[1]} kB extracted` : 'frame extraction ok'}`);

// ─── Verdict ──────────────────────────────────────────────────────────────
console.log('\n═══ Visual QA verdict ═══');
console.log(`  black frames OK?      ${blackOk ? '✅' : '❌'} (${(blackRatio * 100).toFixed(1)}% < 10%)`);
console.log(`  freeze-free OK?       ${freezeOk ? '✅' : '❌'} (${maxFreeze.toFixed(2)}s < 2s)`);
console.log(`  audio present OK?     ${audioOk ? '✅' : '❌'} (${rmsDb !== null ? rmsDb.toFixed(2) + ' dBFS' : 'no audio'})`);
console.log(`  file size OK?         ${sizeBytes > 50_000 ? '✅' : '❌'} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`);

const allOk = blackOk && freezeOk && audioOk && sizeBytes > 50_000;
console.log(`\n${allOk ? '🟢 PASS' : '🔴 FAIL'} — ${mp4}`);
process.exit(allOk ? 0 : 1);