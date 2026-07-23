/**
 * Dynamic job generator — turns a topic list into a diverse set of
 * agentic-scripts.json entries that exercise the full pipeline.
 *
 * Instead of hand-writing 40 combinatorial test fixtures, this generator:
 * 1. Takes a list of topics (or a single topic)
 * 2. For each topic, generates N diverse scripts using the heuristic writer
 *    (writeScriptHeuristic) or the agent brain's writeScript() when a model is
 *    available
 * 3. Varies orientation, preset, videoType, platform, caption style per job
 * 4. Produces a JSON array ready to be written as agentic-scripts.json
 *
 * This is the "finfigure dynamically" piece — the pipeline discovers what to
 * generate based on the input topics, not a static fixture file.
 */

import { writeScriptHeuristic } from '../ai/agent.js';
import { AgentBrain } from '../ai/brain.js';
import type { AgenticCliJob } from '../../adapters/cli/cli-job.js';

export interface JobSpec {
    topic: string;
    title?: string;
    count?: number;          // how many variants to generate for this topic
    orientations?: ('portrait' | 'landscape')[];
    presets?: string[];
    videoTypes?: ('facts' | 'tutorial' | 'news' | 'story' | 'product' | 'motivational' | 'nature')[];
    platforms?: ('tiktok' | 'youtube' | 'instagram' | 'reels')[];
    captionThemes?: string[];
    captionStyles?: ('burned' | 'karaoke' | 'none')[];
    voices?: string[];
    grades?: ('neutral' | 'warm' | 'cool' | 'cinematic' | 'vivid')[];
    transitions?: ('fade' | 'slide' | 'zoomblur' | 'cut')[];
}

const DEFAULT_ORIENTATIONS: ('portrait' | 'landscape')[] = ['portrait', 'landscape'];
const DEFAULT_PRESETS = ['cinematic', 'reels', 'documentary', 'neutral'];
const DEFAULT_VIDEO_TYPES: ('facts' | 'tutorial' | 'news' | 'story' | 'product' | 'motivational' | 'nature')[] = [
    'facts', 'tutorial', 'story', 'product', 'nature',
];
const DEFAULT_PLATFORMS: ('tiktok' | 'youtube' | 'instagram' | 'reels')[] = ['tiktok', 'reels', 'instagram'];
const DEFAULT_CAPTION_THEMES = ['minimal', 'bold', 'neon', 'highContrast', 'softCard'];
const DEFAULT_CAPTION_STYLES: ('burned' | 'karaoke' | 'none')[] = ['burned', 'karaoke'];
const DEFAULT_VOICES = [
    'en-US-GuyNeural', 'en-GB-RyanNeural', 'en-IN-NeerjaNeural',
    'es-ES-AlvaroNeural', 'hi-IN-SwararaNeural', 'ta-IN-PallaviNeural',
    'fr-FR-DeniseNeural', 'de-DE-KatjaNeural',
];
const DEFAULT_GRADES: ('neutral' | 'warm' | 'cool' | 'cinematic' | 'vivid')[] = [
    'neutral', 'warm', 'cool', 'cinematic', 'vivid',
];
const DEFAULT_TRANSITIONS: ('fade' | 'slide' | 'zoomblur' | 'cut')[] = [
    'fade', 'slide', 'zoomblur', 'cut',
];

/**
 * Deterministic pseudo-random selection from a list using a seed.
 * Ensures reproducible job generation.
 */
function pick<T>(list: T[], seed: number): T {
    return list[Math.abs(seed) % list.length];
}

/**
 * Simple string hash for deterministic seeding.
 */
function hash(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/**
 * Generate a diverse set of jobs for a given topic.
 * Each job gets a unique combination of style parameters.
 */
export async function generateJobsForTopic(spec: JobSpec, brain?: AgentBrain): Promise<AgenticCliJob[]> {
    const count = spec.count ?? 3;
    const orientations = spec.orientations ?? DEFAULT_ORIENTATIONS;
    const presets = spec.presets ?? DEFAULT_PRESETS;
    const videoTypes = spec.videoTypes ?? DEFAULT_VIDEO_TYPES;
    const platforms = spec.platforms ?? DEFAULT_PLATFORMS;
    const captionThemes = spec.captionThemes ?? DEFAULT_CAPTION_THEMES;
    const captionStyles = spec.captionStyles ?? DEFAULT_CAPTION_STYLES;
    const voices = spec.voices ?? DEFAULT_VOICES;
    const grades = spec.grades ?? DEFAULT_GRADES;
    const transitions = spec.transitions ?? DEFAULT_TRANSITIONS;

    const topic = spec.topic;
    const title = spec.title ?? topic;
    const baseHash = hash(topic);

    const jobs: AgenticCliJob[] = [];

    for (let i = 0; i < count; i++) {
        const seed = baseHash + i * 1000;

        // Try to generate a script via the brain (if available), fall back to heuristic
        let script: string | undefined;
        if (brain?.modelEnabled) {
            try {
                const generated = await brain.writeScript(topic, `${title} variant ${i + 1}`);
                if (generated) script = generated;
            } catch {
                /* fall through to heuristic */
            }
        }
        if (!script) {
            script = writeScriptHeuristic(topic, `${title} variant ${i + 1}`);
        }

        const job: AgenticCliJob = {
            id: `gen_${hash(topic + i).toString(36).slice(0, 8)}`,
            title: `${title} v${i + 1}`,
            topic,
            script,
            orientation: pick(orientations, seed),
            voice: pick(voices, seed + 1),
            preset: pick(presets, seed + 2),
            videoType: pick(videoTypes, seed + 3),
            platform: pick(platforms, seed + 4),
            captionTheme: pick(captionThemes, seed + 5),
            captions: pick(captionStyles, seed + 6),
            grade: pick(grades, seed + 7),
            transition: pick(transitions, seed + 8),
            hookFirst: i % 2 === 0,  // alternate hook-first
            variablePacing: i % 3 !== 0,  // mostly on, occasionally off
            jCutSec: pick([0.2, 0.3, 0.4, 0.5, 0.6], seed + 9),
            kineticText: i % 2 === 0,
            vignette: i % 3 !== 0,
            sfx: i % 2 === 0,
            musicIntensity: pick(['calm', 'mid', 'energetic'], seed + 10),
            candidatesPerAsset: 4,
            maxAttempts: 3,
            pruneWorkspaces: 4,
        };

        // Add local assets for some jobs (to test the local asset path)
        if (i % 3 === 0) {
            job.localAssets = ['github-profile.png', 'logo-automation.png'];
        }

        // Add background music for some jobs
        if (i % 2 === 0) {
            job.backgroundMusic = pick([
                'lofi_chill.mp3', 'cinematic_drone.mp3', 'upbeat_electronic.mp3',
                'ambient_piano.mp3', 'ambient_nature.mp3',
            ], seed + 11);
            job.musicVolume = 0.15;
        }

        jobs.push(job);
    }

    return jobs;
}

/**
 * Generate jobs from a list of topics, producing a full agentic-scripts.json
 * array. Each topic gets `count` variants.
 */
export async function generateJobBatch(
    topics: string[],
    opts: { variantsPerTopic?: number; brain?: AgentBrain } = {},
): Promise<AgenticCliJob[]> {
    const allJobs: AgenticCliJob[] = [];
    const count = opts.variantsPerTopic ?? 3;

    for (const topic of topics) {
        const jobs = await generateJobsForTopic({ topic, count }, opts.brain);
        allJobs.push(...jobs);
    }

    return allJobs;
}

/**
 * Write a job batch to agentic-scripts.json.
 */
export function writeJobBatch(jobs: AgenticCliJob[], outputPath: string): void {
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(jobs, null, 2));
}
