#!/usr/bin/env tsx
/**
 * agentic-batch.ts — BATCH CLI with wave scheduling, preview mode, and
 * dynamic job generation.
 *
 * Usage:
 *   npx tsx src/adapters/cli/agentic-batch.ts                    # Run all jobs in agentic-scripts.json
 *   npx tsx src/adapters/cli/agentic-batch.ts --parallel 3      # Run with 3 concurrent jobs per wave
 *   npx tsx src/adapters/cli/agentic-batch.ts --preview         # Preview without fetching/rendering
 *   npx tsx src/adapters/cli/agentic-batch.ts --generate        # Generate dynamic jobs from topics
 *   npx tsx src/adapters/cli/agentic-batch.ts --generate --topics "AI coding,Video editing,Photography"
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode download-images             # Fetch ONLY images
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode download-videos             # Fetch ONLY videos
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode download-music              # Fetch ONLY music
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode generate-voice-edgetts      # Voice ONLY via Edge-TTS
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode generate-voice-voicebox    # Voice ONLY via Voicebox/Kokoro
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode clone-voice --job <id>      # Clone a person's voice
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode plan                        # Plan ONLY (no network)
 *   npx tsx src/adapters/cli/agentic-batch.ts --mode download-images --job gen_3scene_hookfirst
 *   npx tsx src/adapters/cli/agentic-batch.ts --search "eagle" --count 10        # Download 10 eagle images (ad-hoc, no JSON)
 *   npx tsx src/adapters/cli/agentic-batch.ts --search "ocean waves" --count 5 --kind video
 *
 * Bulk fetch can ALSO be driven from agentic-scripts.json by setting
 *   "mode": "download-images", "searchQuery": "eagle", "downloadCount": 10
 * on a job — the bulk path ignores the script and pulls N distinct images of the subject.
 * Environment:
 *   AGENTIC_WAVE_SIZE=3           Override wave size
 *   AGENTIC_PREVIEW=1             Enable preview mode
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { runBatchWaves } from '../../agentic/operations/wave-scheduler.js';
import { generatePreview, printPreview, writePreview } from '../../agentic/operations/preview.js';
import { generateJobBatch, writeJobBatch } from '../../agentic/operations/job-generator.js';
import { AgentBrain } from '../../agentic/ai/brain.js';
import { buildPipelineRequest } from './cli-job.js';
import type { AgenticCliJob } from './cli-job.js';
import { runSingleFeature, type SingleFeatureMode } from '../../agentic/operations/single-feature.js';
import { normalizeJobId } from '../../shared/identifiers.js';
import {
    isUploadConfigured,
    uploadToAllPlatforms,
    type UploadResult,
} from '../../agentic/services/upload-post.js';

const INPUT_DIR = path.join(process.cwd(), 'input', 'scripts');
const SCRIPTS_FILE = path.join(INPUT_DIR, 'agentic-scripts.json');

function parseArgv(argv: string[]): { [key: string]: string | boolean | number } {
    const s = argv.slice(2);
    const args: { [key: string]: string | boolean | number } = {};
    for (let i = 0; i < s.length; i++) {
        const k = s[i];
        if (k.startsWith('--')) {
            const key = k.slice(2);
            const next = s[i + 1];
            if (next && !next.startsWith('--')) {
                args[key] = isNaN(Number(next)) ? next : Number(next);
                i++;
            } else {
                args[key] = true;
            }
        }
    }
    return args;
}

function readJobJson(): any[] {
    const filePath = (() => {
        const i = process.argv.indexOf('--file');
        return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
    })();
    const target = filePath ? path.resolve(filePath) : SCRIPTS_FILE;
    if (!fs.existsSync(target)) {
        console.error(`✖ No job file at ${target}`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(target, 'utf-8'));
}

async function main() {
    const args = parseArgv(process.argv);
    const parallel = Number(args.parallel || args.waveSize || process.env.AGENTIC_WAVE_SIZE || 3);
    const preview = args.preview === true || process.env.AGENTIC_PREVIEW === '1';
    const generate = args.generate === true;
    const postFlag = args.post === true || process.env.UPLOAD_POST_AUTO_UPLOAD === '1';
    const topics = args.topics
        ? String(args.topics)
              .split(',')
              .map((t) => t.trim())
        : undefined;
    const singleMode = args.mode ? String(args.mode) : undefined;
    const jobFilter = args.job ? String(args.job) : undefined;

    // ─── Generate mode: create dynamic jobs from topics ───
    if (generate) {
        const topicList = topics ?? ['AI coding', 'Video editing', 'Photography', 'Web development', 'Data science'];
        console.log(`\n🎯 Generating dynamic jobs for ${topicList.length} topics...`);

        const brain = new AgentBrain();
        const jobs = await generateJobBatch(topicList, { variantsPerTopic: 3, brain });

        const outputPath = path.join(INPUT_DIR, 'agentic-scripts.json');
        writeJobBatch(jobs, outputPath);
        console.log(`✅ Generated ${jobs.length} jobs → ${outputPath}`);

        if (preview) {
            console.log(`\n📋 Previewing generated jobs...\n`);
            for (const job of jobs) {
                const id = normalizeJobId(job.id || `job_${Date.now()}`);
                const topic = job.topic ?? job.title ?? 'Untitled video';
                const report = await generatePreview(job, id, topic);
                printPreview(report);
            }
            return;
        }
        return;
    }

    // ─── Ad-hoc bulk fetch: "download N <subject> images/videos" ───
    //   npx tsx src/adapters/cli/agentic-batch.ts --search "eagle" --count 10
    //   npx tsx src/adapters/cli/agentic-batch.ts --search "ocean waves" --count 5 --kind video
    // No JSON editing required — runs standalone from the CLI args.
    const searchQuery = args.search ? String(args.search) : undefined;
    if (searchQuery) {
        const count = Number(args.count || 10);
        const kind = (args.kind === 'video' ? 'video' : 'image') as 'image' | 'video';
        const { runBulkImageFetch } = await import('../../agentic/operations/bulk-fetch.js');
        const outDir = path.resolve(
            process.cwd(),
            'workspace',
            'bulk',
            kind === 'video' ? 'videos' : 'images',
            searchQuery
                .replace(/[^a-z0-9]+/gi, '_')
                .toLowerCase()
                .slice(0, 40),
        );
        fs.mkdirSync(outDir, { recursive: true });
        console.log(`\n🎯 Bulk ${kind} fetch: "${searchQuery}" × ${count} → ${outDir}`);
        const files = await runBulkImageFetch(searchQuery, count, outDir, (args.orientation as any) || '', kind);
        console.log(`  ✅ Downloaded ${files.length}/${count} distinct ${kind}(s):`);
        for (const f of files.slice(0, 10)) console.log(`     • ${f}`);
        if (files.length > 10) console.log(`     … +${files.length - 10} more`);
        return;
    }

    // ─── Single-feature mode: run ONLY one stage (download/voice/clone/plan) ───
    if (singleMode) {
        const jobs = readJobJson() as AgenticCliJob[];
        const filtered = jobFilter ? jobs.filter((j) => (j.id ?? j.title) === jobFilter) : jobs;
        if (filtered.length === 0) {
            console.error(`✖ No jobs matched filter "${jobFilter ?? ''}"`);
            process.exit(1);
        }

        // ─── Broadcast: apply ONE signal override to EVERY job in this run ───
        //   e.g.  --broadcast "exportFormat:gif"   (re-applies to all jobs)
        //   e.g.  --broadcast "filterByScene:{0:bw}" (real JSON value)
        // This is the "apply one signal to all jobs" iteration primitive that
        // goes BEYOND the --mode filter — it mutates each job's config before
        // dispatch, so a single command re-grades / re-exports the whole set.
        const broadcast = args.broadcast ? String(args.broadcast) : undefined;
        if (broadcast) {
            const colon = broadcast.indexOf(':');
            if (colon < 0) {
                console.error(`✖ --broadcast must be "field:value" (got "${broadcast}")`);
                process.exit(1);
            }
            const field = broadcast.slice(0, colon);
            const raw = broadcast.slice(colon + 1);
            let value: any = raw;
            // attempt JSON parse for objects/arrays/numbers/booleans
            try {
                value = JSON.parse(raw);
            } catch {
                /* keep string */
            }
            console.log(`  📡 Broadcasting ${field} = ${JSON.stringify(value)} → ${filtered.length} job(s)`);
            for (const j of filtered) (j as any)[field] = value;
        }

        console.log(
            `\n🎯 Single-feature mode: ${singleMode} | ${filtered.length} job(s)` +
                (jobFilter ? ` (filter: ${jobFilter})` : ''),
        );
        const validModes = [
            'plan',
            'visuals',
            'voice',
            'render',
            'download-images',
            'download-videos',
            'download-music',
            'download-sfx',
            'download-url',
            'generate-voice-edgetts',
            'generate-voice-voicebox',
            'clone-voice',
            'apply-advanced',
            'rerender',
            'render-gif',
            'render-poster',
            'render-contact-sheet',
            'compose',
        ];
        if (!validModes.includes(singleMode)) {
            console.error(`✖ Invalid --mode "${singleMode}". Valid: ${validModes.join(', ')}`);
            process.exit(1);
        }
        for (const job of filtered) {
            const id = (job.id || `job_${Date.now()}`)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .slice(0, 64);
            const topic = job.topic ?? job.title ?? 'Untitled video';
            try {
                const res = await runSingleFeature(job, id, singleMode as SingleFeatureMode);
                console.log(`  ✅ ${job.title}: ${res.summary}`);
                if (res.outputs.length > 0) {
                    console.log(`     outputs (${res.outputs.length}):`);
                    for (const o of res.outputs.slice(0, 8)) console.log(`       • ${o}`);
                    if (res.outputs.length > 8) console.log(`       … +${res.outputs.length - 8} more`);
                }
            } catch (e) {
                console.error(`  ❌ ${job.title}: ${(e as Error)?.message ?? e}`);
            }
        }
        return;
    }

    // ─── Preview mode: show what would be fetched without network ───
    if (preview) {
        const jobs = readJobJson();
        console.log(`\n📋 Preview mode: ${jobs.length} jobs (no network calls)\n`);

        const previewDir = path.join(process.cwd(), 'workspace', 'previews');
        fs.mkdirSync(previewDir, { recursive: true });

        for (const job of jobs) {
            const id = (job.id || `job_${Date.now()}`)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .slice(0, 64);
            const topic = job.topic ?? job.title ?? 'Untitled video';
            const report = await generatePreview(job, id, topic);
            printPreview(report);
            writePreview(report, path.join(previewDir, `${id}.json`));
        }

        console.log(`\n✅ Previews written to ${previewDir}/`);
        return;
    }

    // ─── Run mode: wave-scheduled batch ───
    const jobs: AgenticCliJob[] = readJobJson();
    console.log(`\n╔═══════════════════════════════════════════════════╗`);
    console.log(`║   Agentic Video Pipeline — Batch Mode               ║`);
    console.log(`║   ${jobs.length} jobs | wave size: ${parallel} | RAM-aware scheduling  ║`);
    console.log(`╚═══════════════════════════════════════════════════╝\n`);

    const results = await runBatchWaves(jobs, parallel, (report) => {
        console.log(
            `\n  📊 Wave ${report.waveNumber}/${report.totalWaves} complete: ${report.completed}✅ ${report.failed}❌`,
        );
    });

    // ─── Summary ───
    const completed = results.filter((r) => r.success).length;
    const failed = results.length - completed;
    console.log(`\n${'═'.repeat(55)}`);
    console.log(`  Batch Summary: ${completed}/${results.length} completed, ${failed} failed`);

    if (failed > 0) {
        console.log(`  Failed jobs:`);
        for (const r of results.filter((r) => !r.success)) {
            console.log(`    ❌ ${r.title}: ${r.error}`);
        }
        process.exitCode = 1;
    }

    // List output files
    const outputDir = path.join(process.cwd(), 'output');
    if (fs.existsSync(outputDir)) {
        const outputs = fs.readdirSync(outputDir).filter((f) => f.endsWith('.mp4'));
        if (outputs.length > 0) {
            console.log(`\n  Generated videos:`);
            for (const f of outputs) {
                const p = path.join(outputDir, f);
                const sizeKb = Math.round(fs.statSync(p).size / 1024);
                console.log(`    🎬 ${f} (${sizeKb}KB)`);
            }
        }
    }

    // ─── --post (opt-in cross-platform upload) ────────────────────────────────
    // Reads each successful job's *_metadata.txt (title / description / hashtags)
    // and calls upload-post.com to post to the configured platforms. Gated by
    // BOTH the --post flag and the UPLOAD_POST_ENABLED env var so a forgotten
    // flag never accidentally publishes a video.
    if (postFlag) {
        await runPostStep(results.filter((r) => r.success), outputDir);
    }
}

/**
 * Walk the output dir for each successful job, find its rendered MP4 + the
 * generated *_metadata.txt, and post it through upload-post.com.
 *
 * Behaviour:
 *   - If UPLOAD_POST_ENABLED is not 'true', skip silently with a one-line
 *     informational message — the --post flag alone is NOT enough to publish.
 *   - For each job we read the metadata sidecar (TITLE / DESCRIPTION / HASHTAGS
 *     written by orchestrator/render.ts) and call uploadToAllPlatforms().
 *   - A publish-manifest.json is written per job so the caller has an audit
 *     trail of what was uploaded where.
 *   - Failures never throw — they are logged and recorded in the manifest so
 *     one bad job cannot kill the post step for the rest of the batch.
 */
async function runPostStep(successful: { jobId: string; outputPath?: string }[], outputDir: string): Promise<void> {
    if (!isUploadConfigured()) {
        console.log(`\n📤 --post: UPLOAD_POST_ENABLED != 'true' or credentials missing — skipping upload step.`);
        console.log(`   Set UPLOAD_POST_ENABLED=true, UPLOAD_POST_API_KEY=…, UPLOAD_POST_USERNAME=… in .env to enable.`);
        return;
    }
    if (successful.length === 0) {
        console.log(`\n📤 --post: no successful jobs to upload.`);
        return;
    }
    console.log(`\n📤 --post: uploading ${successful.length} job(s) via upload-post.com…`);
    for (const job of successful) {
        try {
            const jobOutDir = job.outputPath
                ? path.dirname(job.outputPath)
                : path.join(outputDir, job.jobId);
            const mp4 = job.outputPath && fs.existsSync(job.outputPath)
                ? job.outputPath
                : pickFirstMp4(jobOutDir);
            if (!mp4) {
                console.warn(`  ⚠ ${job.jobId}: no MP4 found in ${jobOutDir}; skipping.`);
                continue;
            }
            const { title, description, hashtags } = readMetadataSidecar(jobOutDir);
            const result = await uploadToAllPlatforms(
                mp4,
                title || path.basename(mp4, '.mp4'),
                description,
                hashtags,
            );
            writePublishManifest(jobOutDir, mp4, result);
            for (const r of result.results) {
                const tag = r.success ? '✅' : '❌';
                console.log(`    ${tag} ${job.jobId} → ${r.platform}${r.url ? ` (${r.url})` : r.error ? ` — ${r.error}` : ''}`);
            }
        } catch (e: any) {
            console.warn(`  ⚠ ${job.jobId}: post failed: ${e?.message ?? e}`);
        }
    }
}

function pickFirstMp4(dir: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const matches = fs.readdirSync(dir).filter((f) => f.endsWith('.mp4'));
    return matches.length ? path.join(dir, matches[0]) : null;
}

/**
 * Parse the *_metadata.txt sidecar produced by the orchestrator's render step.
 * Format:
 *   TITLE:
 *   <text>
 *   DESCRIPTION:
 *   <text>
 *   HASHTAGS:
 *   #tag1 #tag2 …
 */
function readMetadataSidecar(dir: string): { title: string; description: string; hashtags: string[] } {
    const empty = { title: '', description: '', hashtags: [] as string[] };
    if (!fs.existsSync(dir)) return empty;
    const sidecar = fs.readdirSync(dir).find((f) => f.endsWith('_metadata.txt'));
    if (!sidecar) return empty;
    const text = fs.readFileSync(path.join(dir, sidecar), 'utf8');
    const sections: Record<string, string> = {};
    const re = /^(TITLE|DESCRIPTION|HASHTAGS|TAGS):\s*([\s\S]*?)(?=\n[A-Z]+:|$)/gm;
    let m: RegExpExecArray | null = null;
    while ((m = re.exec(text)) !== null) {
        sections[m[1]] = (m[2] || '').trim();
    }
    const hashtagsRaw = (sections.HASHTAGS || sections.TAGS || '').trim();
    const hashtags = hashtagsRaw
        .split(/\s+/)
        .map((s) => s.replace(/^#/, '').trim())
        .filter(Boolean);
    return { title: sections.TITLE || '', description: sections.DESCRIPTION || '', hashtags };
}

function writePublishManifest(dir: string, mp4: string, result: { results: UploadResult[] }): void {
    try {
        const manifest = {
            mp4,
            timestamp: new Date().toISOString(),
            platforms: result.results.map((r) => ({
                platform: r.platform,
                success: r.success,
                url: r.url ?? null,
                error: r.error ?? null,
            })),
            summary: {
                total: result.results.length,
                passed: result.results.filter((r) => r.success).length,
                failed: result.results.filter((r) => !r.success).length,
            },
        };
        const manifestPath = path.join(dir, 'publish-manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    } catch (e: any) {
        console.warn(`  ⚠ failed to write publish-manifest: ${e?.message ?? e}`);
    }
}

main().catch((e) => {
    console.error(`\n❌ Fatal: ${e.message ?? e}`);
    process.exit(1);
});
