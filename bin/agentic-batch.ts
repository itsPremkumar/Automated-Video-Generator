#!/usr/bin/env node
/**
 * bin/agentic-batch.ts — generate AND end-to-end verify MULTIPLE agentic videos.
 *
 *   npx tsx bin/agentic-batch.ts
 *
 * Runs the full agentic pipeline (backend=agent, no external AI) for several
 * topics, renders a real MP4 for each, then verifies every output with the
 * bundled ffmpeg (video/audio streams, duration, codec, dimensions, size).
 */
import dotenv from 'dotenv';
// Load .env from project root before anything else
dotenv.config();

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { runAgenticPipeline, renderAgenticSlideshow } from '../src/agentic/orchestrate.js';

const ffmpeg: string = require('ffmpeg-static');

interface TopicSpec {
    topic: string;
    title: string;
    orientation: 'portrait' | 'landscape';
}

const TOPICS: TopicSpec[] = [
    { topic: '5 simple home workout exercises for beginners', title: 'Home Workout', orientation: 'landscape' },
    { topic: '3 easy vegan dinner recipes you can cook in 15 minutes', title: 'Quick Vegan Dinners', orientation: 'portrait' },
    { topic: 'how to stay focused while studying: 4 proven techniques', title: 'Study Focus', orientation: 'landscape' },
];

/** Verify a rendered MP4 using the bundled ffmpeg (tolerant of its non-zero exit). */
function verifyVideo(mp4: string): { ok: boolean; video: boolean; audio: boolean; duration: string; codec: string; dims: string; size: number; note: string } {
    const size = fs.statSync(mp4).size;
    let raw = '';
    try {
        raw = execFileSync(ffmpeg, ['-i', mp4], { stderr: 'pipe' }).toString();
    } catch (e: any) {
        raw = (e.stderr || '').toString();
    }
    const hasVideo = /Stream #0:\d+.*Video:/.test(raw);
    const hasAudio = /Stream #0:\d+.*Audio:/.test(raw);
    const durM = raw.match(/Duration:\s*([\d:.]+)/);
    const codecM = raw.match(/Video:\s*(\w+)/);
    const dimsM = raw.match(/(\d{3,4}x\d{3,4})/);
    const ok = hasVideo && size > 1000 && !!durM;
    return {
        ok,
        video: hasVideo,
        audio: hasAudio,
        duration: durM ? durM[1] : '?',
        codec: codecM ? codecM[1] : '?',
        dims: dimsM ? dimsM[1] : '?',
        size,
        note: ok ? 'valid container + video stream' : 'INVALID',
    };
}

async function main() {
    const results: Array<{ title: string; mp4?: string; gate: string; v?: any; error?: string }> = [];
    for (const t of TOPICS) {
        try {
            console.log(`\n──────── # ${(results.length + 1)} ${t.title} (${t.orientation}) ────────`);
            const res = await runAgenticPipeline({
                topic: t.topic,
                title: t.title,
                backend: 'agent',
                orientation: t.orientation,
                preferVisual: 'image',
            });
            const mp4 = await renderAgenticSlideshow(res, { });
            const v = verifyVideo(mp4);
            results.push({ title: t.title, mp4, gate: res.gate.pass ? 'PASS' : 'BLOCKED', v });
            console.log(`   gate=${res.gate.pass ? 'PASS' : 'BLOCKED'} | video=${v.video} audio=${v.audio} dur=${v.duration} codec=${v.codec} dims=${v.dims} size=${v.size}B`);
            console.log(`   → ${mp4}`);
        } catch (e: any) {
            results.push({ title: t.title, gate: 'ERROR', error: e?.message });
            console.error(`   ✗ ERROR: ${e?.message}`);
        }
    }

    const okCount = results.filter((r) => r.v?.ok).length;
    console.log(`\n════════ BATCH SUMMARY: ${okCount}/${results.length} valid videos ════════`);
    for (const r of results) {
        console.log(`  ${r.v?.ok ? '✅' : '❌'} ${r.title} — gate=${r.gate} ${r.v ? `(${r.v.codec} ${r.v.dims} ${r.v.duration} video=${r.v.video} audio=${r.v.audio})` : r.error}`);
    }
    if (okCount !== results.length) process.exitCode = 1;
}

main();
