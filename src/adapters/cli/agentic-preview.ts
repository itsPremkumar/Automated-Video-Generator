#!/usr/bin/env tsx
/**
 * agentic-preview.ts — Generate preview thumbnails (sprite sheet) for a rendered job.
 *
 * Reads plan.json from the job's workspace to find the rendered MP4, extracts
 * 5 equally-spaced frames using ffmpeg, and produces a 5×1 sprite sheet in
 * output/<jobId>/preview/.
 *
 * USAGE:
 *   npx tsx src/adapters/cli/agentic-preview.ts [--file <path>] [--job <jobId>]
 *
 * EXAMPLES:
 *   npm run agentic:preview
 *   npm run agentic:preview -- --file input/scripts/custom.json
 *   npm run agentic:preview -- --job my_job_id
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { normalizeJobId } from '../../shared/identifiers.js';
import { getAgenticWorkspace } from '../../agentic/management/workspace.js';

// ─── Consts ──────────────────────────────────────────────────────────────────

const INPUT_DIR = path.join(process.cwd(), 'input', 'scripts');
const SCRIPTS_FILE = path.join(INPUT_DIR, 'agentic-scripts.json');
const OUTPUT_DIR = path.join(process.cwd(), 'output');
const N_FRAMES = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readJobJson(): any[] {
    const fileArg = (() => {
        const i = process.argv.indexOf('--file');
        return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
    })();
    const target = fileArg ? path.resolve(fileArg) : SCRIPTS_FILE;
    if (!fs.existsSync(target)) {
        console.error(`✖ No job file at ${target}`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(target, 'utf-8'));
}

function readJson(dir: string, file: string): any {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function outputFor(jobId: string): string {
    return path.join(OUTPUT_DIR, jobId);
}

/**
 * Get the total number of frames in a video using ffprobe.
 */
function getTotalFrames(videoPath: string): number {
    try {
        const ffprobe: string = (() => {
            try { return require('ffprobe-static').path; }
            catch { return 'ffprobe'; }
        })();
        const out = execFileSync(ffprobe, [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-count_packets',
            '-show_entries', 'stream=nb_read_packets',
            '-of', 'csv=p=0',
            videoPath,
        ], { encoding: 'utf-8', timeout: 15000 }).trim();
        const frames = parseInt(out, 10);
        return isNaN(frames) ? 0 : frames;
    } catch {
        return 0;
    }
}

/**
 * Find the best candidate MP4 file in the job's output directory.
 * Prefers a title-based file, falls back to any MP4 that isn't a scene edit.
 */
function findOutputMp4(jobId: string, title?: string): string | null {
    const dir = outputFor(jobId);
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter(
        (f) => f.endsWith('.mp4') && !f.includes('scene_') && !f.startsWith('_'),
    );
    if (files.length === 0) return null;
    // Prefer the title-based file
    if (title) {
        const exact = files.find((f) => f.startsWith(title));
        if (exact) return path.join(dir, exact);
    }
    return path.join(dir, files[0]);
}

/**
 * Build a sprite sheet from the rendered video.
 * Extracts N_FRAMES equally-spaced frames and tiles them 5×1.
 */
function buildSpriteSheet(
    videoPath: string,
    outputDir: string,
    totalFrames: number,
): string | null {
    const ffmpeg: string = require('ffmpeg-static') || 'ffmpeg';
    const step = Math.max(1, Math.floor(totalFrames / N_FRAMES));

    // Use the select filter to pick equally-spaced frames
    const selectFilter = `select='not(mod(n,${step}))',tile=${N_FRAMES}x1`;

    // Ensure output dir exists
    fs.mkdirSync(outputDir, { recursive: true });

    const spritePath = path.join(outputDir, 'sprite.jpg');

    try {
        execFileSync(ffmpeg, [
            '-i', videoPath,
            '-vf', selectFilter,
            '-frames:v', '1',
            '-y',
            spritePath,
        ], { stdio: 'ignore', timeout: 60000 });

        if (fs.existsSync(spritePath) && fs.statSync(spritePath).size > 0) {
            return spritePath;
        }
        return null;
    } catch {
        return null;
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n  🖼 AVS Preview Thumbnails\n  ─────────────────────────\n`);

    // Read job ID from --job arg or from the jobs list
    const jobArg = (() => {
        const i = process.argv.indexOf('--job');
        return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
    })();

    const jobs = readJobJson();
    const filtered = jobArg
        ? jobs.filter((j: any) => normalizeJobId(j.id || '') === normalizeJobId(jobArg))
        : jobs;

    if (filtered.length === 0) {
        console.error(`✖ No matching job${jobArg ? ` for --job "${jobArg}"` : ''}`);
        process.exit(1);
    }

    for (const job of filtered) {
        const id = normalizeJobId(job.id || `job_${Date.now()}`);
        const ws = getAgenticWorkspace(id);
        const plan = readJson(ws.root, 'plan.json');
        const title = job.title || id;

        console.log(`  Job: ${title} (${id})`);

        if (!plan) {
            console.log(`  ⏳ No plan.json found. Run "plan" stage first:`);
            console.log(`     npm run agentic:modular plan`);
            continue;
        }

        const mp4 = findOutputMp4(id, job.title);
        if (!mp4) {
            console.log(`  ⏳ No rendered MP4 found in ${outputFor(id)}. Run "render" stage first:`);
            console.log(`     npm run agentic:modular render`);
            continue;
        }

        console.log(`  📹 Source video: ${path.basename(mp4)}`);

        // Probe total frames for equally-spaced selection
        const totalFrames = getTotalFrames(mp4);
        if (totalFrames === 0) {
            console.error(`  ✖ Could not probe frame count for ${mp4}`);
            continue;
        }
        console.log(`  🎞  ${totalFrames} total frames`);

        // Build sprite sheet
        const previewDir = path.join(outputFor(id), 'preview');
        const spritePath = buildSpriteSheet(mp4, previewDir, totalFrames);

        if (spritePath) {
            const size = (fs.statSync(spritePath).size / 1024).toFixed(0);
            console.log(`  ✅ Sprite sheet: ${spritePath} (${size} KB)`);
        } else {
            console.error(`  ✖ Failed to generate sprite sheet`);
        }
    }

    console.log(`\n  ✅ Done.\n`);
}

main().catch((e) => {
    console.error(`✖ Fatal: ${e.message}`);
    process.exit(1);
});
