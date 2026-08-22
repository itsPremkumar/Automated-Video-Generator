/**
 * perspective-generator.ts — one topic → N genuinely DIFFERENT narrative
 * perspectives, each rendered as its own job so the operator can A/B test
 * which angle lands best.
 *
 * This is NOT the seed-variant system (batch-variants.ts varies style knobs on
 * an identical script). Here every variant gets a distinct SCRIPT written from
 * a distinct editorial angle:
 *
 *   mechanism   — how/why it works (explainer)
 *   history     — origins and evolution over time
 *   impact      — human/economic/environmental consequences
 *   howto       — practical, actionable takeaways
 *   myths       — misconceptions vs reality (debunk format)
 *
 * All scripts are produced by deterministic key-free templates (same policy as
 * writeScriptHeuristic) with [Visual: ...] tags so the stock fetcher stays
 * keyword-driven. An AgentBrain may optionally rewrite each script; when no
 * model is configured the heuristics stand alone.
 */

import type { AgenticCliJob } from '../../adapters/cli/cli-job.js';
import { AgentBrain } from '../ai/brain.js';

export type PerspectiveKind = 'mechanism' | 'history' | 'impact' | 'howto' | 'myths';

export const PERSPECTIVES: PerspectiveKind[] = ['mechanism', 'history', 'impact', 'howto', 'myths'];

/** Runtime guard for CLI input. */
export function isPerspectiveKind(s: string): s is PerspectiveKind {
    return (PERSPECTIVES as string[]).includes(s);
}

export interface PerspectiveMeta {
    kind: PerspectiveKind;
    label: string;
    videoType: NonNullable<AgenticCliJob['videoType']>;
    preset: string;
}

export const PERSPECTIVE_META: Record<PerspectiveKind, PerspectiveMeta> = {
    mechanism: { kind: 'mechanism', label: 'How it works', videoType: 'tutorial', preset: 'documentary' },
    history: { kind: 'history', label: 'Origin story', videoType: 'story', preset: 'cinematic' },
    impact: { kind: 'impact', label: 'Why it matters', videoType: 'news', preset: 'reels' },
    howto: { kind: 'howto', label: 'Practical guide', videoType: 'tutorial', preset: 'neutral' },
    myths: { kind: 'myths', label: 'Myths vs facts', videoType: 'facts', preset: 'documentary' },
};

/** Deterministic hash (matches job-generator's approach). */
function hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
}

function pick<T>(arr: T[], seed: number): T {
    return arr[seed % arr.length];
}

const STOP = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'from',
    'is', 'are', 'was', 'were', 'be', 'how', 'why', 'what', 'that', 'this', 'you', 'your',
]);

/** Extract 2-4 clean content words from a topic for [Visual:] tags. */
export function topicKeywords(topic: string): string[] {
    const words = topic
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP.has(w));
    return words.slice(0, 4);
}

type ScriptFn = (topic: string, title: string) => { script: string; hookLine: string };

/**
 * The five deterministic angle templates. Each takes the raw topic + title and
 * returns a 4-6 line script with [Visual: ...] tags. Lines deliberately differ
 * in structure AND narration voice so downstream pacing/hook logic sees real
 * variety.
 */
export const PERSPECTIVE_SCRIPTS: Record<PerspectiveKind, ScriptFn> = {
    mechanism: (topic, title) => {
        const kw = topicKeywords(topic);
        return {
            hookLine: `Ever wondered how ${topic} actually works?`,
            script:
                `Ever wondered how ${topic} actually works? [Visual: ${kw.join(' ') || topic}]\n` +
                `It comes down to one simple mechanism hiding in plain sight. [Visual: ${kw[0] || topic} close up]\n` +
                `Step by step, the process repeats — and each step makes the next one easier. [Visual: ${kw[1] || kw[0] || topic} process]\n` +
                `Once you see the pattern, you notice it everywhere. [Visual: ${kw[2] || kw[0] || topic} detail]\n` +
                `That's the whole trick behind ${title}. [Visual: ${kw[0] || topic} overview]`,
        };
    },
    history: (topic, title) => {
        const kw = topicKeywords(topic);
        return {
            hookLine: `${cap(title)} has a stranger past than most people realize.`,
            script:
                `${cap(title)} has a stranger past than most people realize. [Visual: ${kw.join(' ') || topic} historic]\n` +
                `It started small — almost nobody paid attention at first. [Visual: ${kw[0] || topic} old archive]\n` +
                `Then everything changed in a single generation. [Visual: ${kw[1] || kw[0] || topic} transformation]\n` +
                `The world we know today was shaped by that turning point. [Visual: ${kw[2] || kw[0] || topic} landscape]\n` +
                `And the story is still being written right now. [Visual: ${kw[0] || topic} future]`,
        };
    },
    impact: (topic, title) => {
        const kw = topicKeywords(topic);
        return {
            hookLine: `${cap(title)} affects your life more than you think.`,
            script:
                `${cap(title)} affects your life more than you think. [Visual: ${kw.join(' ') || topic}]\n` +
                `It changes what things cost, where people live, and what work gets done. [Visual: ${kw[0] || topic} city]\n` +
                `Whole industries rise or fall based on it. [Visual: ${kw[1] || kw[0] || topic} industry]\n` +
                `Communities adapt faster than the systems around them. [Visual: ${kw[2] || kw[0] || topic} people]\n` +
                `Understanding it today means fewer surprises tomorrow. [Visual: ${kw[0] || topic} horizon]`,
        };
    },
    howto: (topic, title) => {
        const kw = topicKeywords(topic);
        return {
            hookLine: `Here's how to understand ${topic} in under a minute.`,
            script:
                `Here's how to understand ${topic} in under a minute. [Visual: ${kw.join(' ') || topic}]\n` +
                `First, ignore the jargon — the core idea fits in one sentence. [Visual: ${kw[0] || topic} simple]\n` +
                `Second, look at one real example instead of ten abstract ones. [Visual: ${kw[1] || kw[0] || topic} example]\n` +
                `Third, try predicting what happens next before it happens. [Visual: ${kw[2] || kw[0] || topic} practice]\n` +
                `Do that three times and ${title} will just make sense. [Visual: ${kw[0] || topic} success]`,
        };
    },
    myths: (topic, title) => {
        const kw = topicKeywords(topic);
        return {
            hookLine: `Almost everyone gets ${topic} wrong — here's the truth.`,
            script:
                `Almost everyone gets ${topic} wrong — here's the truth. [Visual: ${kw.join(' ') || topic}]\n` +
                `Myth one: it's too complicated for normal people. Reality: the basics fit on a napkin. [Visual: ${kw[0] || topic} basics]\n` +
                `Myth two: nothing ever changes. Reality: it transforms every decade. [Visual: ${kw[1] || kw[0] || topic} change]\n` +
                `Myth three: experts agree on everything. They don't — and that's useful to know. [Visual: ${kw[2] || kw[0] || topic} research]\n` +
                `Now you know ${title} better than most. [Visual: ${kw[0] || topic} reveal]`,
        };
    },
};

function cap(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export interface PerspectiveOptions {
    /** Which angles to include (default: all five). */
    perspectives?: PerspectiveKind[];
    orientation?: 'portrait' | 'landscape';
    platform?: 'tiktok' | 'youtube' | 'instagram' | 'reels';
    /** Optional LLM rewrite of each heuristic script (falls back silently). */
    brain?: AgentBrain;
}

/**
 * Build the full agentic-scripts.json array for one topic across N perspectives.
 * Job ids are stable (`persp_<kind>_<hash8>`), titles carry the angle label, and
 * videoType/preset are chosen per-angle so style matches the narrative voice.
 */
export async function generatePerspectiveJobs(
    topic: string,
    title: string,
    opts: PerspectiveOptions = {},
): Promise<AgenticCliJob[]> {
    const kinds = opts.perspectives ?? PERSPECTIVES;
    const baseHash = hash(`${topic}|${title}`);
    const jobs: AgenticCliJob[] = [];

    for (let i = 0; i < kinds.length; i++) {
        const kind = kinds[i];
        if (!PERSPECTIVE_SCRIPTS[kind]) continue;
        const meta = PERSPECTIVE_META[kind];
        const seed = baseHash + i * 777;

        let script = PERSPECTIVE_SCRIPTS[kind](topic, title).script;
        // Optional model polish — never required, never blocking.
        if (opts.brain?.modelEnabled) {
            try {
                const rewritten = await opts.brain.writeScript(
                    `${topic} (${meta.label} angle)`,
                    `${title} — ${meta.label}`,
                );
                if (rewritten && rewritten.trim().length > 40) script = rewritten;
            } catch {
                /* heuristic stands */
            }
        }

        const job: AgenticCliJob = {
            id: `persp_${kind}_${baseHash.toString(36).slice(0, 8)}`,
            title: `${title} — ${meta.label}`,
            topic,
            script,
            orientation: opts.orientation ?? 'landscape',
            platform: opts.platform ?? pick(['tiktok', 'youtube', 'instagram'] as const, seed),
            videoType: meta.videoType,
            preset: meta.preset,
            captions: 'burned',
            captionTheme: pick(['bold', 'minimal', 'highContrast'] as const, seed + 1),
            musicIntensity: pick(['calm', 'mid', 'mid', 'energetic'] as const, seed + 2),
            hookFirst: true,
            variablePacing: true,
            candidatesPerAsset: 4,
            maxAttempts: 3,
            pruneWorkspaces: 5,
            description: `Perspective test: ${meta.label}`,
            tags: ['perspective-test', kind],
        };
        jobs.push(job);
    }
    return jobs;
}
