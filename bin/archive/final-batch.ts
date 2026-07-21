#!/usr/bin/env node
/** Final verification batch: 5 varied topics, agentic, verify each end-to-end. */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { runAgenticPipeline, renderAgenticSlideshow } from '../src/agentic/orchestrate.js';

const ffmpeg: string = require('ffmpeg-static');

const TOPICS = [
    { topic: '5 simple home workout exercises for beginners', title: 'Home Workout', orientation: 'landscape' as const },
    { topic: '3 easy vegan dinner recipes you can cook in 15 minutes', title: 'Vegan Dinners', orientation: 'portrait' as const },
    { topic: 'how to stay focused while studying: 4 proven techniques', title: 'Study Focus', orientation: 'landscape' as const },
    { topic: 'top 5 travel destinations to visit in 2026', title: 'Travel 2026', orientation: 'portrait' as const },
    { topic: 'a quick guide to saving money: 3 budgeting habits', title: 'Save Money', orientation: 'landscape' as const },
];

function verifyVideo(mp4: string) {
    const size = fs.statSync(mp4).size;
    let raw = '';
    try { raw = execFileSync(ffmpeg, ['-i', mp4], { stderr: 'pipe' }).toString(); } catch (e: any) { raw = (e.stderr || '').toString(); }
    const hasVideo = /Stream #0:\d+.*Video:/.test(raw);
    const hasAudio = /Stream #0:\d+.*Audio:/.test(raw);
    const dur = (raw.match(/Duration:\s*([\d:.]+)/) || [])[1] || '?';
    const codec = (raw.match(/Video:\s*(\w+)/) || [])[1] || '?';
    const dims = (raw.match(/(\d{3,4}x\d{3,4})/) || [])[1] || '?';
    return { ok: hasVideo && size > 1000, hasVideo, hasAudio, dur, codec, dims, size };
}

async function main() {
    const results = [];
    for (let i = 0; i < TOPICS.length; i++) {
        const t = TOPICS[i];
        try {
            console.log(`\n──────── #${i + 1} ${t.title} (${t.orientation}) ────────`);
            const res = await runAgenticPipeline({ topic: t.topic, title: t.title, backend: 'agent', orientation: t.orientation, preferVisual: 'image' });
            const mp4 = await renderAgenticSlideshow(res, { });
            const v = verifyVideo(mp4);
            results.push({ title: t.title, ok: v.ok, ...v, gate: res.gate.pass });
            console.log(`   gate=${res.gate.pass ? 'PASS' : 'BLOCKED'} video=${v.hasVideo} audio=${v.hasAudio} dur=${v.dur} codec=${v.codec} dims=${v.dims} size=${v.size}B`);
        } catch (e: any) {
            results.push({ title: t.title, ok: false, error: e?.message });
            console.error(`   ✗ ${e?.message}`);
        }
    }
    const ok = results.filter((r) => r.ok).length;
    console.log(`\n════════ AGENTIC BATCH: ${ok}/${results.length} valid ════════`);
    for (const r of results) console.log(`  ${r.ok ? '✅' : '❌'} ${r.title} gate=${r.gate} (${r.codec} ${r.dims} ${r.dur} v=${r.hasVideo} a=${r.hasAudio})`);
    if (ok !== results.length) process.exitCode = 1;
}
main();
