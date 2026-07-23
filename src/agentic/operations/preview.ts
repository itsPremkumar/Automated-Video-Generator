/**
 * Dry-run preview mode — shows what WOULD be fetched and rendered
 * without making any network calls or producing any output.
 *
 * This is the "finfigure dynamically" preview: given a job spec, it:
 * 1. Builds the plan (script → scenes → keywords)
 * 2. Shows what keywords would be searched for each scene
 * 3. Shows what sources would be used (local, stock, fallback)
 * 4. Estimates total duration, scene count, and expected file sizes
 * 5. Outputs a JSON preview that can be inspected before committing to a render
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseScript } from '../../lib/script-parser.js';
import { buildPlan } from '../pipeline/plan.js';
import { expandKeywordsHeuristic } from '../ai/agent.js';
import { inputAssetPath } from '../../lib/path-safety.js';
import type { AgenticCliJob } from '../../adapters/cli/cli-job.js';
import type { Plan } from '../types.js';

export interface ScenePreview {
    sceneNumber: number;
    voiceoverText: string;
    durationSec: number;
    searchKeywords: string[];
    visualPreference: 'image' | 'video';
    localAsset?: string;
    localAssetExists: boolean;
    estimatedFileSizeKb: number;
    source: 'local-asset' | 'stock-fetch' | 'fallback';
}

export interface PreviewReport {
    jobId: string;
    title: string;
    topic: string;
    orientation: string;
    totalScenes: number;
    totalDurationSec: number;
    estimatedTotalFileSizeKb: number;
    estimatedRenderTimeSec: number;
    scenes: ScenePreview[];
    voice: string;
    preset: string;
    videoType?: string;
    platform?: string;
    captionTheme?: string;
    captions: string;
    musicQuery: string;
    backgroundMusic?: string;
    hasLocalAssets: boolean;
    hasBackgroundMusic: boolean;
    aiVerify?: any;
    warnings: string[];
}

/**
 * Generate a preview report for a job WITHOUT fetching assets or rendering.
 */
export async function generatePreview(job: AgenticCliJob, id: string, topic: string): Promise<PreviewReport> {
    const warnings: string[] = [];
    const script = job.script || `[Visual: ${topic}] ${job.title || topic}`;

    // Build the plan (same as the real pipeline)
    const plan: Plan = await buildPlan(
        script,
        {
            jobId: id,
            title: job.title || topic,
            orientation: job.orientation ?? 'portrait',
            voice: job.voice ?? 'en-US-JennyNeural',
            musicQuery: job.musicQuery,
        },
        parseScript,
    );

    // Expand keywords for each scene (using heuristic, no model needed)
    for (const s of plan.scenes) {
        const base = s.voiceoverText || s.searchKeywords.join(' ');
        const expanded = expandKeywordsHeuristic(s, plan.title);
        s.searchKeywords = [...new Set([...s.searchKeywords, ...expanded])];
    }

    // Build scene previews
    const scenes: ScenePreview[] = [];
    let totalFileSize = 0;

    for (const s of plan.scenes) {
        const localAssetPath = s.localAsset ? inputAssetPath(s.localAsset) : null;
        const localAssetExists = localAssetPath ? fs.existsSync(localAssetPath) : false;

        let source: 'local-asset' | 'stock-fetch' | 'fallback';
        let estimatedSize = 0;

        if (s.localAsset && localAssetExists) {
            source = 'local-asset';
            try {
                estimatedSize = Math.round(fs.statSync(localAssetPath!).size / 1024);
            } catch {
                estimatedSize = 500; // fallback estimate
            }
        } else if (s.localAsset && !localAssetExists) {
            source = 'fallback';
            warnings.push(`Local asset "${s.localAsset}" not found in input/visuals/ — will use fallback`);
            estimatedSize = 100; // placeholder image
        } else {
            source = 'stock-fetch';
            estimatedSize = 500; // typical stock photo size
        }

        // For video scenes, estimate larger
        if (s.visualPreference === 'video') {
            estimatedSize *= 5; // videos are ~5x larger than images
        }

        totalFileSize += estimatedSize;

        scenes.push({
            sceneNumber: s.sceneNumber,
            voiceoverText: s.voiceoverText,
            durationSec: s.durationSec,
            searchKeywords: s.searchKeywords,
            visualPreference: s.visualPreference,
            localAsset: s.localAsset,
            localAssetExists,
            estimatedFileSizeKb: estimatedSize,
            source,
        });
    }

    // Estimate render time (rough: 1s of video = ~2s of render time on CPU)
    const estimatedRenderTime = Math.round(plan.totalDurationSec * 2);

    // Check for background music
    const bgmPath = job.backgroundMusic ? inputAssetPath(job.backgroundMusic) : null;
    const hasBgm = bgmPath ? fs.existsSync(bgmPath) : false;
    if (job.backgroundMusic && !hasBgm) {
        warnings.push(`Background music "${job.backgroundMusic}" not found in input/visuals/ — will use stock music`);
    }

    // Check local assets array
    const hasLocalAssets = !!(job.localAssets && job.localAssets.length > 0);
    if (hasLocalAssets) {
        for (const asset of job.localAssets!) {
            const p = inputAssetPath(asset);
            if (!fs.existsSync(p)) {
                warnings.push(`Local asset "${asset}" from localAssets array not found in input/visuals/`);
            }
        }
    }

    return {
        jobId: id,
        title: job.title || topic,
        topic,
        orientation: job.orientation ?? 'portrait',
        totalScenes: plan.scenes.length,
        totalDurationSec: plan.totalDurationSec,
        estimatedTotalFileSizeKb: totalFileSize,
        estimatedRenderTimeSec: estimatedRenderTime,
        scenes,
        voice: job.voice ?? 'en-US-JennyNeural',
        preset: job.preset ?? 'cinematic',
        videoType: job.videoType,
        platform: job.platform,
        captionTheme: job.captionTheme,
        captions: job.captions ?? 'burned',
        musicQuery: plan.musicQuery,
        backgroundMusic: job.backgroundMusic,
        hasLocalAssets,
        hasBackgroundMusic: !!job.backgroundMusic,
        aiVerify: job.aiVerify,
        warnings,
    };
}

/**
 * Write a preview report to disk as JSON.
 */
export function writePreview(report: PreviewReport, outPath: string): void {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
}

/**
 * Print a human-readable preview to the console.
 */
export function printPreview(report: PreviewReport): void {
    console.log(`\n  📋 Preview: ${report.title}`);
    console.log(`  ─────────────────────────────────`);
    console.log(`  Topic:       ${report.topic}`);
    console.log(`  Orientation: ${report.orientation}`);
    console.log(`  Scenes:      ${report.totalScenes}`);
    console.log(`  Duration:    ${report.totalDurationSec.toFixed(1)}s`);
    console.log(`  Voice:       ${report.voice}`);
    console.log(`  Preset:      ${report.preset}`);
    if (report.videoType) console.log(`  Video Type:  ${report.videoType}`);
    if (report.platform) console.log(`  Platform:    ${report.platform}`);
    console.log(`  Captions:    ${report.captions}${report.captionTheme ? ` (${report.captionTheme})` : ''}`);
    console.log(`  Music:       ${report.musicQuery}${report.hasBackgroundMusic ? ` [local: ${report.backgroundMusic}]` : ''}`);
    console.log(`  Est. Size:   ${(report.estimatedTotalFileSizeKb / 1024).toFixed(1)}MB`);
    console.log(`  Est. Time:   ${report.estimatedRenderTimeSec}s`);
    console.log(`  AI Verify:   ${report.aiVerify?.enabled ? 'enabled' : 'disabled'}`);
    console.log(`  `);
    console.log(`  Scenes:`);
    for (const s of report.scenes) {
        const src = s.source === 'local-asset' ? '📁' : s.source === 'stock-fetch' ? '🌐' : '🔲';
        console.log(`    ${src} Scene ${s.sceneNumber}: [${s.durationSec}s] ${s.voiceoverText.slice(0, 50)}...`);
        console.log(`       Keywords: ${s.searchKeywords.join(', ')}`);
        if (s.localAsset) {
            console.log(`       Local: ${s.localAsset} ${s.localAssetExists ? '✅' : '❌ not found'}`);
        }
    }
    if (report.warnings.length > 0) {
        console.log(`  `);
        console.log(`  ⚠️  Warnings:`);
        for (const w of report.warnings) {
            console.log(`    - ${w}`);
        }
    }
    console.log(`  ─────────────────────────────────\n`);
}
