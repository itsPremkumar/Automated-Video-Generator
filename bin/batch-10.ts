#!/usr/bin/env node
/**
 * bin/batch-10.ts — Production hardening sweep: generate 10 agentic videos
 * across varieties (topic / orientation / preset / caption theme / intro+outro
 * / kenBurns) to surface real runtime errors, then report PASS/FAIL per job.
 *
 * Each job uses the DRIVER-FIRST path: the driver (this script) supplies the
 * script via req.agent.writeScript, the pipeline renders offline (no keys).
 *
 * Usage: npm run batch:10   (or: npx tsx bin/batch-10.ts)
 */
import { runAgenticPipeline } from '../src/agentic/orchestrate.js';
import { renderAgenticSlideshow } from '../src/agentic/orchestrate.js';
import path from 'node:path';
import fs from 'node:fs';

type Job = {
    name: string;
    topic: string;
    title: string;
    script: string;
    orientation: 'portrait' | 'landscape';
    preset: string;
    captionTheme?: string;
    intro?: { title: string; subtitle?: string; durationSec?: number };
    outro?: { ctaText: string; showSubscribe?: boolean; hashtags?: string[]; durationSec?: number };
    kenBurns?: boolean;
};

const scriptFor = (lines: string[]) => lines.join('\n\n');

const JOBS: Job[] = [
    {
        name: 'hydration-portrait',
        topic: '5 benefits of drinking water daily',
        title: 'Stay Hydrated',
        orientation: 'portrait',
        preset: 'cinematic',
        captionTheme: 'minimal-white',
        script: scriptFor([
            'Water makes up about 60 percent of your body, yet most people stay mildly dehydrated through the day. [glass of water on a table]',
            'A single glass can sharpen your focus and lift that afternoon brain fog within a few minutes. [glass of water]',
            'Proper hydration supports concentration, steadier mood, and clearer memory across a busy day. [person stretching in the morning]',
            'Often what feels like hunger is actually thirst, so a glass before meals keeps portions in check. [fresh fruits and vegetables]',
            'Water cushions your joints and carries nutrients to the muscles that need them most. [running shoes and a water bottle]',
            'Hydrated skin stays plump and clear, making water the cheapest skincare step you will take. [glowing skin close up]',
            'Sip steadily through the day and let these small habits build lasting natural energy. [glass of water with lemon]',
        ]),
    },
    {
        name: 'morning-landscape',
        topic: 'morning routine for productivity',
        title: 'Win Your Morning',
        orientation: 'landscape',
        preset: 'vibrant',
        captionTheme: 'bold-yellow',
        intro: { title: 'Win Your Morning', subtitle: 'A 60 second reset', durationSec: 2.5 },
        outro: { ctaText: 'Subscribe', showSubscribe: true, hashtags: ['#productivity'], durationSec: 3 },
        script: scriptFor([
            'A calm morning starts the night before, with a phone parked far from the pillow. [phone on a nightstand]',
            'Open the curtains within five minutes of waking to reset your body clock. [sunlight through a window]',
            'Drink a full glass of water before the first coffee to rehydrate. [glass of water]',
            'Ten minutes of movement beats an hour of scrolling later on. [person stretching]',
            'Write the single most important task so the day has a clear target. [notebook and pen]',
            'Protect the first hour from meetings and noise. [quiet desk]',
        ]),
    },
    {
        name: 'coding-portrait',
        topic: 'how to learn coding fast',
        title: 'Learn to Code',
        orientation: 'portrait',
        preset: 'minimal',
        captionTheme: 'minimal-white',
        kenBurns: true,
        script: scriptFor([
            'Pick one language and one small project, then ship it before chasing the next course. [laptop with code]',
            'Read code more than you write; great programmers are great readers first. [code on a screen]',
            'Break every bug into the smallest failing case you can reproduce. [debugging terminal]',
            'Build in public so feedback finds the gaps you cannot see. [github pull request]',
            'Consistency beats intensity; twenty minutes daily compounds fast. [calendar checkmarks]',
        ]),
    },
    {
        name: 'fitness-landscape',
        topic: 'home workout without equipment',
        title: 'No Gear, No Excuse',
        orientation: 'landscape',
        preset: 'vibrant',
        captionTheme: 'bold-yellow',
        intro: { title: 'No Gear, No Excuse', subtitle: 'Home workout', durationSec: 2.5 },
        script: scriptFor([
            'A workout needs no gym when your own body is the equipment. [person doing pushups]',
            'Start with a minute of jumping jacks to raise the heart rate. [jumping jacks]',
            'Squats build real strength using only your bodyweight. [bodyweight squats]',
            'A plank a day trains the core that protects your back. [plank pose]',
            'Cool down with slow stretches so tomorrow stays pain free. [stretching floor]',
        ]),
    },
    {
        name: 'food-portrait',
        topic: 'easy healthy dinner ideas',
        title: 'Eat Well, Fast',
        orientation: 'portrait',
        preset: 'cinematic',
        captionTheme: 'minimal-white',
        script: scriptFor([
            'A healthy dinner can take less time than ordering takeout. [cutting vegetables]',
            'Roast a tray of vegetables with olive oil and a pinch of salt. [roasted vegetables]',
            'Add a protein like eggs, beans, or tofu to stay full. [cooked beans bowl]',
            'Finish with lemon and herbs instead of heavy sauce. [lemon and herbs]',
            'One tray, ten minutes of prep, zero guilt. [plated healthy meal]',
        ]),
    },
    {
        name: 'money-landscape',
        topic: 'simple personal finance rules',
        title: 'Money That Sticks',
        orientation: 'landscape',
        preset: 'minimal',
        captionTheme: 'minimal-white',
        outro: { ctaText: 'Like & Subscribe', showSubscribe: true, hashtags: ['#finance'], durationSec: 3 },
        script: scriptFor([
            'Pay yourself first by moving savings the day you are paid. [piggy bank]',
            'Spend on what you use, not what you wish you used. [shopping cart]',
            'Kill high interest debt before chasing risky returns. [credit card crossed out]',
            'An emergency fund of three months changes every decision. [savings jar]',
            'Automate the boring parts so discipline is not required. [recurring transfer]',
        ]),
    },
    {
        name: 'travel-portrait',
        topic: 'budget travel tips',
        title: 'Travel For Less',
        orientation: 'portrait',
        preset: 'vibrant',
        captionTheme: 'bold-yellow',
        kenBurns: true,
        script: scriptFor([
            'Travel light and you move free, both in body and on the wallet. [backpack on a train]',
            'Book stays near transit, not near the landmarks. [city map]',
            'Eat where the locals eat and the prices drop fast. [street food stall]',
            'Walk the first day to learn the shape of a city. [walking a street]',
            'The best views are usually the ones without a ticket. [hilltop viewpoint]',
        ]),
    },
    {
        name: 'sleep-landscape',
        topic: 'how to sleep better tonight',
        title: 'Sleep Is A Skill',
        orientation: 'landscape',
        preset: 'cinematic',
        captionTheme: 'minimal-white',
        intro: { title: 'Sleep Is A Skill', subtitle: 'Tonight', durationSec: 2.5 },
        outro: { ctaText: 'Subscribe', showSubscribe: true, hashtags: ['#sleep'], durationSec: 3 },
        script: scriptFor([
            'A cool, dark room is the cheapest sleep upgrade you will ever make. [dark bedroom]',
            'Same wake time every day anchors your internal clock. [alarm clock]',
            'Screens an hour before bed steal the sleep you need. [phone face down]',
            'Caffeine has a half life of hours, so stop it by early afternoon. [coffee cup]',
            'A slow breath routine tells the body it is safe to rest. [calm breathing]',
        ]),
    },
    {
        name: 'focus-portrait',
        topic: 'deep work in a distracted world',
        title: 'Find Deep Focus',
        orientation: 'portrait',
        preset: 'minimal',
        captionTheme: 'minimal-white',
        script: scriptFor([
            'Deep work is the rare skill of doing one hard thing for a long stretch. [quiet desk]',
            'Kill notifications before they kill your attention. [muted phone]',
            'Use a single visible timer so the block has a shape. [kitchen timer]',
            'One tab, one task, one goal for the next fifty minutes. [single browser tab]',
            'Protect the result, not the hours, and quality follows. [completed work]',
        ]),
    },
    {
        name: 'nature-landscape',
        topic: 'benefits of spending time in nature',
        title: 'Go Outside',
        orientation: 'landscape',
        preset: 'vibrant',
        captionTheme: 'bold-yellow',
        kenBurns: true,
        outro: { ctaText: 'Subscribe', showSubscribe: true, hashtags: ['#nature'], durationSec: 3 },
        script: scriptFor([
            'Twenty minutes outside lowers stress in ways a screen never will. [forest path]',
            'Daylight resets the clock that decides when you sleep. [sunlight leaves]',
            'A walk clears the thoughts a chair keeps circling. [park bench]',
            'Green space lifts mood even on an ordinary afternoon. [green field]',
            'The cure for a busy mind is often just a quiet trail. [mountain trail]',
        ]),
    },
];

async function runOne(job: Job): Promise<{ name: string; ok: boolean; detail: string; out?: string }> {
    const jobId = 'batch_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const req: any = {
        jobId,
        topic: job.topic,
        title: job.title,
        backend: 'agent',
        orientation: job.orientation,
        preferVisual: 'image',
        agent: {
            writeScript: async () => job.script,
        },
    };
    try {
        const res = await runAgenticPipeline(req, (p) => {
            // Light progress signal; the heavy logs are filtered by the runner.
            if (p.percent === 100) process.stdout.write('.');
        });
        if (!res.gate.pass) {
            return { name: job.name, ok: false, detail: 'GATE FAIL: ' + (res.gate.reasons || []).join('; ') };
        }
        const out = await renderAgenticSlideshow(res, {
            preset: job.preset,
            captionTheme: job.captionTheme,
            intro: job.intro,
            outro: job.outro,
            kenBurns: job.kenBurns,
        });
        const exists = fs.existsSync(out);
        if (!exists) return { name: job.name, ok: false, detail: 'no output file', out };
        const v = verifyMp4(out);
        if (!v.ok) return { name: job.name, ok: false, detail: 'verify failed: ' + v.note, out };
        return { name: job.name, ok: true, detail: `rendered ${path.basename(out)} (${v.duration}s, ${v.dims}, aac=${v.audio})`, out };
    } catch (e: any) {
        return { name: job.name, ok: false, detail: e?.stack ? e.stack.split('\n').slice(0, 4).join('\n') : String(e) };
    }
}

/** Verify a rendered MP4 with the bundled ffprobe (streams, duration, codec). */
function verifyMp4(mp4: string): { ok: boolean; video: boolean; audio: boolean; duration: string; codec: string; dims: string; note: string } {
    const ffprobe: string = require('ffprobe-static').path;
    let raw = '';
    try {
        raw = require('child_process').execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_type', '-of', 'default=noprint_wrappers=1', mp4]).toString();
    } catch (e: any) {
        raw = (e.stderr || e.stdout || '').toString();
    }
    const hasVideo = /codec_type=video/.test(raw);
    const hasAudio = /codec_type=audio/.test(raw);
    const durM = raw.match(/duration=([\d.]+)/);
    const dimsM = raw.match(/width=(\d+)\s*\n?height=(\d+)/);
    const duration = durM ? durM[1] : '?';
    const dims = dimsM ? `${dimsM[1]}x${dimsM[2]}` : '?';
    const ok = hasVideo && fs.statSync(mp4).size > 1000;
    return { ok, video: hasVideo, audio: hasAudio, duration, codec: '', dims, note: ok ? '' : 'missing video stream or empty file' };
}

async function main() {
    const results: { name: string; ok: boolean; detail: string }[] = [];
    for (const job of JOBS) {
        process.stdout.write(`▶ ${job.name} ... `);
        const r = await runOne(job);
        console.log(r.ok ? 'OK' : 'FAIL');
        if (!r.ok) console.log('   ' + r.detail.split('\n').join('\n   '));
        results.push(r);
    }
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n=== BATCH RESULT: ${pass}/${results.length} passed ===`);
    for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name} — ${r.ok ? 'ok' : r.detail.split('\n')[0]}`);
    if (pass < results.length) process.exit(1);
}

main().catch((e) => {
    console.error('BATCH CRASHED:', e);
    process.exit(2);
});
