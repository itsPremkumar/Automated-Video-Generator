/**
 * autopilot.ts — the autonomous, self-healing controller for the agentic
 * pipeline. This is the "monitor logs, find the problem, fix it, retry" layer
 * the project needs to be fully automated: a user (or another agent) only says
 * "make me a <topic> video" and this drives the whole thing to a valid output,
 * diagnosing and recovering from the known failure classes instead of crashing.
 *
 * It wraps runAgenticPipeline + renderAgenticSlideshow and:
 *   1. runs the pipeline, capturing a structured event log
 *   2. checks the post-render X7/X8/X9 verification
 *   3. on failure, applies the matching auto-fix and retries (bounded)
 *   4. emits an AutoRunReport (what happened, what was fixed, final output)
 *
 * No external AI required — the "intelligence" is deterministic diagnosis of the
 * observed failure signature, exactly like the rest of the agentic backend.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runAgenticPipeline, PipelineRequest, PipelineProgress, renderAgenticSlideshow, renderAgenticWithRemotion } from './orchestrate.js';
import { PipelineResult } from './orchestrate.js';

export interface AutoRunEvent {
    t: number;
    level: 'info' | 'warn' | 'error' | 'fix';
    msg: string;
}

export interface AutoRunReport {
    topic: string;
    success: boolean;
    outputPath: string | null;
    attempts: number;
    events: AutoRunEvent[];
    fixesApplied: string[];
    postRender?: import('./gate.js').PostRenderCheck;
}

const VIDEO_CACHE = path.resolve(process.cwd(), 'agentic-pipeline/.video-cache.json');

function now() { return Date.now(); }

/**
 * Analyze a failed pipeline/render and return the auto-fix(es) to apply before
 * the next attempt. Each fix is a pure side-effect on the environment (clear
 * cache, flip an env var) — never mutates the user's source.
 */
export function diagnose(events: AutoRunEvent[]): { fixes: { name: string; apply: () => void }[] } {
    const log = events.map((e) => e.msg).join('\n');
    const fixes: { name: string; apply: () => void }[] = [];

    // 1. Stale cache returning flickr/placeholder under a video: key.
    if (/Found video on|flickr|placeholder/i.test(log) && !/GATE PASS/.test(log)) {
        fixes.push({ name: 'clear-stale-video-cache', apply: () => { try { fs.rmSync(VIDEO_CACHE, { force: true }); } catch { /* ignore */ } } });
    }
    // 2. Transient 5xx / network from a CDN.
    if (/502|503|504|ETIMEDOUT|ECONNRESET|fetchVisual failed/i.test(log)) {
        fixes.push({ name: 'clear-video-cache-and-retry', apply: () => { try { fs.rmSync(VIDEO_CACHE, { force: true }); } catch { /* ignore */ } } });
    }
    // 3. Render produced no/short/invalid file. Require an explicit ffmpeg /
    // post-render failure signature — NOT a bare "X7" which can appear in many
    // benign contexts (e.g. a check id printed elsewhere).
    if (/ffmpeg failed|ffmpeg exited|Invalid argument|No option name|post-render checks failed|Output file valid: missing|Duration matches plan: no output/i.test(log)) {
        // Soft render fallback: disable kinetic text + use draft; Remotion path
        // already self-falls-back to ffmpeg in the CLI, but here we force ffmpeg.
        fixes.push({ name: 'render-soften', apply: () => { process.env.AGENTIC_RENDER_SOFTEN = '1'; } });
    }
    return { fixes };
}

export interface AutoRunOptions {
    renderer?: 'ffmpeg' | 'remotion';
    preset?: string;
    sfx?: boolean;
    maxAttempts?: number;
    onEvent?: (e: AutoRunEvent) => void;
    /** Test/deterministic override: replaces the real pipeline+render run. */
    runner?: (req: PipelineRequest) => Promise<{ out: string; post: import('./gate.js').PostRenderCheck | undefined; gatePass: boolean }>;
    /** Full customization surface (overrides the individual knobs above). */
    config?: import('./config.js').AgenticConfig;
}

/**
 * Fully autonomous run: topic in, valid MP4 out (or a detailed failure report).
 * Recovers from the known failure classes; bounds retries so it can't loop.
 */
export async function autoRunVideo(
    req: PipelineRequest,
    opts: AutoRunOptions = {},
): Promise<AutoRunReport> {
    // Start clean: a prior run may have left AGENTIC_RENDER_SOFTEN=1 (our own
    // self-heal fix). Each run must begin from the requested quality, otherwise
    // the soften fallback would leak across independent runs / tests.
    delete process.env.AGENTIC_RENDER_SOFTEN;
    // Resolve the full customization surface (preset + overrides) into concrete knobs.
    const { resolveConfig } = await import('./config.js');
    const cfg = resolveConfig({ ...(opts.config ?? {}), topic: req.topic, title: req.title });
    if (cfg.pruneWorkspaces) process.env.AGENTIC_KEEP_WORKSPACES = String(cfg.pruneWorkspaces);
    const events: AutoRunEvent[] = [];
    const fixesApplied: string[] = [];
    const emit = (level: AutoRunEvent['level'], msg: string) => {
        const e = { t: now(), level, msg };
        events.push(e);
        opts.onEvent?.(e);
    };
    const maxAttempts = opts.maxAttempts ?? 3;

    let lastResult: PipelineResult | null = null;
    let lastOut: string | null = null;
    let post: AutoRunReport['postRender'] | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        emit('info', `attempt ${attempt}/${maxAttempts} — pipeline start`);
        try {
            // Injectable runner (tests / deterministic harness) — replaces the
            // real network+ffmpeg pipeline so the self-heal loop can be proven
            // offline without downloading stock media.
            if (opts.runner) {
                const r = await opts.runner(req);
                if (!r.gatePass) {
                    emit('warn', 'GATE did not pass — retrying with cache clear');
                    try { fs.rmSync(VIDEO_CACHE, { force: true }); } catch { /* ignore */ }
                    continue;
                }
                lastOut = r.out;
                post = r.post;
                const ok = !!post?.pass;
                if (ok) {
                    emit('info', `SUCCESS → ${r.out}`);
                    return { topic: req.topic, success: true, outputPath: r.out, attempts: attempt, events, fixesApplied, postRender: post };
                }
                const failed = post?.checks?.filter((c: any) => !c.pass).map((c: any) => c.id + ':' + c.detail).join('; ') ?? 'unknown';
                emit('error', `post-render checks failed: ${failed}`);
            } else {
            const res = await runAgenticPipeline(
                { ...req, preferVisual: req.preferVisual ?? cfg.preferVisual, candidatesPerAsset: req.candidatesPerAsset ?? cfg.candidatesPerAsset, voice: req.voice ?? cfg.voice, musicQuery: req.musicQuery ?? cfg.musicQuery, localAssets: req.localAssets ?? cfg.localAssets, defaultVisual: req.defaultVisual ?? cfg.defaultVisual },
                (p: PipelineProgress) => {
                if (p.stage === 'gate') emit(p.message.includes('PASS') ? 'info' : 'warn', `gate: ${p.message}`);
            });
            lastResult = res;
            if (!res.gate.pass) {
                emit('warn', 'GATE did not pass — retrying with cache clear');
                // A failed gate usually means no usable assets; clear cache + retry.
                try { fs.rmSync(VIDEO_CACHE, { force: true }); } catch { /* ignore */ }
                continue;
            }
            emit('info', `pipeline OK — rendering (${opts.renderer ?? cfg.renderer ?? 'ffmpeg'}, preset ${cfg.preset ?? 'cinematic'})`);
            const soften = process.env.AGENTIC_RENDER_SOFTEN === '1';
            const renderOpts = {
                preset: cfg.preset ?? 'cinematic',
                sfx: cfg.sfx,
                kinetic: cfg.kineticText !== false && !soften,
                kenBurns: cfg.kenBurns !== false,
                crossfadeSec: soften ? 0.3 : 0.5,
            };
            let out: string;
            if ((opts.renderer ?? cfg.renderer) === 'remotion' && !soften) {
                try {
                    out = await renderAgenticWithRemotion(res, { kenBurns: true, quality: 'draft' });
                } catch (e: any) {
                    emit('warn', `Remotion failed (${e?.message ?? e}); ffmpeg fallback`);
                    out = await renderAgenticSlideshow(res, renderOpts);
                }
            } else {
                out = await renderAgenticSlideshow(res, renderOpts);
            }
            lastOut = out;
            // PostRenderCheck exposes `.pass` (all X7/X8/X9) and `.checks`; it has
            // no `.x7/.x8/.x9/.detail` flat fields — read it correctly.
            post = (res.postRender as any) ?? undefined;
            const ok = !!post?.pass;
            if (ok) {
                const detail = post?.checks?.map((c: any) => c.id + ':' + (c.pass ? '✓' : '✗')).join(' ') ?? '';
                emit('info', `SUCCESS → ${out} [${detail}]`);
                return { topic: req.topic, success: true, outputPath: out, attempts: attempt, events, fixesApplied, postRender: post };
            }
            const failed = post?.checks?.filter((c: any) => !c.pass).map((c: any) => c.id + ':' + c.detail).join('; ') ?? 'unknown';
            emit('error', `post-render checks failed: ${failed}`);
            }
        } catch (e: any) {
            emit('error', `run threw: ${e?.message ?? e}`);
        }

        // Diagnose + apply fixes, then loop.
        const { fixes } = diagnose(events);
        if (fixes.length === 0) {
            emit('warn', 'no known auto-fix applies — stopping retries');
            return { topic: req.topic, success: false, outputPath: lastOut, attempts: attempt, events, fixesApplied, postRender: post };
        }
        for (const f of fixes) { f.apply(); fixesApplied.push(f.name); emit('fix', `applied fix: ${f.name}`); }
    }

    emit('error', 'exhausted attempts without a valid output');
    return { topic: req.topic, success: false, outputPath: lastOut, attempts: maxAttempts, events, fixesApplied, postRender: post };
}

export interface BatchItem {
    topic: string;
    videoType?: import('./config.js').VideoType;
    preset?: string;
    preferVisual?: 'image' | 'video';
}
export interface BatchReport {
    total: number;
    succeeded: number;
    failed: number;
    items: { topic: string; success: boolean; outputPath: string | null; fixes: string[] }[];
}

/**
 * Generate MULTIPLE video varieties from a set of (topic, perspective) specs —
 * the "different perspectives / all types of video" requirement. Each item is
 * run through the same self-healing autopilot, so one bad variety can't kill the
 * batch. Returns a compact summary for the operator.
 */
export async function autoRunBatch(
    items: BatchItem[],
    opts: AutoRunOptions = {},
): Promise<BatchReport> {
    const out: BatchReport = { total: items.length, succeeded: 0, failed: 0, items: [] };
    for (const it of items) {
        const report = await autoRunVideo(
            { topic: it.topic, title: it.topic, backend: 'agent' },
            {
                ...opts,
                config: {
                    topic: it.topic,
                    videoType: it.videoType,
                    preset: it.preset,
                    preferVisual: it.preferVisual,
                } as import('./config.js').AgenticConfig,
            },
        );
        if (report.success) out.succeeded++; else out.failed++;
        out.items.push({ topic: it.topic, success: report.success, outputPath: report.outputPath, fixes: report.fixesApplied });
    }
    return out;
}
