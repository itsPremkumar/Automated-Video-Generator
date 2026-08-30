/**
 * pipeline.ts — One-shot autonomous video generation pipeline.
 *
 * Orchestrates: research → script → style → plan → acquire → render → critique → self-fix → publish
 *
 * Reuses the existing agentic pipeline (runAgenticPipeline) for the heavy lifting,
 * wrapping it with research, style coherence, automatic critique, and self-fix.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logInfo, logWarn, logError } from '../../shared/logging/runtime-logging.js';
import { runAgenticPipeline } from '../orchestrate.js';
import { researchTopic, factsToScriptHints, factsToHashtags, factsToDescription, duckDuckGoProvider, type ResearchProvider } from './research.js';
import { pickStyleIntent } from './style.js';
import { critiqueRender } from './critique.js';
import { decideFix } from './self-fix.js';
import { uploadToAllPlatforms, isUploadConfigured } from '../services/upload-post.js';
import type { OnetakeRequest, OnetakeResult, OnetakeProgress, CritiqueVerdict } from './types.js';
import type { PipelineRequest } from '../orchestrator/types.js';

const DEFAULTS = {
    orientation: 'portrait' as const,
    voice: 'en-US-AriaNeural',
    musicQuery: 'ambient lofi',
    backend: 'agent' as const,
    selfFixAttempts: 3,
    reviewGate: false,
    maxResearchResults: 5,
    autoPublish: true,
};

/**
 * Main entrypoint: run the full onetake pipeline for a topic.
 */
export async function runOnetake(
    request: OnetakeRequest,
    onProgress?: (p: OnetakeProgress) => void,
    researchProvider?: ResearchProvider,
): Promise<OnetakeResult> {
    const req = { ...DEFAULTS, ...request };
    const jobId = `onetake_${Date.now()}`;
    const emit = (phase: OnetakeProgress['phase'], percent: number, message: string) =>
        onProgress?.({ phase, percent, message, jobId });

    const logPath = path.resolve(process.cwd(), 'output', jobId, 'onetake-log.json');
    const log: Record<string, unknown>[] = [];
    const logEvent = (event: string, data: Record<string, unknown> = {}) => {
        log.push({ ts: new Date().toISOString(), event, ...data });
    };

    try {
        // ─── Phase 1: Research ──────────────────────────────────────────
        emit('research', 5, `Researching "${req.topic}"`);
        logEvent('research_start', { topic: req.topic });

        const research = await researchTopic(req.topic, researchProvider, req.maxResearchResults);
        logEvent('research_complete', { facts: research.facts.length, offline: research.offline });

        // ─── Phase 2: Style intent ──────────────────────────────────────
        emit('script', 15, 'Picking director\'s intent + writing script');
        const style = pickStyleIntent(req.topic, research.facts, req.orientation, req.forceGrade);
        logEvent('style_picked', style as unknown as Record<string, unknown>);

        // Build the script from research facts + heuristic
        const scriptHints = factsToScriptHints(research.facts);
        const script = buildScript(req.topic, scriptHints, research.offline);

        // ─── Phase 3: Plan → Acquire → Render ───────────────────────────
        emit('plan', 25, 'Building plan');
        emit('acquire', 40, 'Acquiring media');

        // Inject the director's intent into the script as inline tags
        // so the existing per-scene grade parser picks them up coherently.
        const styledScript = [
            `[Grade: ${style.grade}]`,
            `[Transition: ${style.transition}]`,
            `[Kinetic: ${style.kinetic ? 'on' : 'off'}]`,
            `[CaptionTheme: ${style.captionTheme}]`,
            '',
            script,
        ].join('\n');

        const pipelineReq: PipelineRequest = {
            jobId,
            title: req.title ?? req.topic,
            topic: req.topic,
            orientation: req.orientation,
            voice: req.voice,
            musicQuery: req.musicQuery,
            backend: req.backend,
            script: styledScript,
            driverLLM: req.driverLLM,
            personalAudio: req.personalAudio ? [req.personalAudio] : undefined,
        };

        logEvent('pipeline_start', { title: pipelineReq.title, orientation: req.orientation });

        // ─── Phase 4: Critique → Self-fix loop ──────────────────────────
        let critiqueResult: CritiqueVerdict = {
            passed: false,
            gates: [],
            fixAction: 'none',
        };
        let renderAttempts = 0;
        const maxAttempts = req.selfFixAttempts;

        for (let attempt = 0; attempt <= maxAttempts; attempt++) {
            renderAttempts = attempt + 1;
            emit('render', 60, `Rendering (attempt ${renderAttempts})`);

            const result = await runAgenticPipeline(pipelineReq, (p) => {
                emit('render', 60 + Math.min(p.percent * 0.2, 20), `[${p.stage}] ${p.message}`);
            });

            // Derive MP4 path from workspace + title (PipelineResult doesn't carry it directly)
            const mp4Path = path.resolve(process.cwd(), 'output', jobId, `${result.manifest.title}.mp4`);
            const durationSec = result.manifest.assets?.reduce((s, a) => s + (a.durationSec ?? 0), 0) ?? 0;

            logEvent('render_complete', { attempt: renderAttempts, mp4: mp4Path });

            // Run critique
            emit('critique', 85, `Running QA gates (attempt ${renderAttempts})`);
            critiqueResult = critiqueRender({
                mp4: mp4Path,
                expectedDurationSec: durationSec,
                expectedOrientation: req.orientation,
            });

            logEvent('critique_complete', { passed: critiqueResult.passed, gates: critiqueResult.gates });

            if (critiqueResult.passed) {
                emit('critique', 90, 'All QA gates passed');
                break;
            }

            // Decide + apply fix
            if (attempt < maxAttempts) {
                const fix = decideFix(critiqueResult);
                logEvent('self_fix', { action: fix.action, reason: fix.reason });
                emit('self-fix', 88, `Self-fix: ${fix.reason.slice(0, 80)}...`);

                // Apply the fix to the pipeline request for the next iteration
                Object.assign(pipelineReq, fix.requestPatch);
            } else {
                logEvent('self_fix_exhausted', { attempts: renderAttempts });
                logWarn(`[ONETAKE] Max self-fix attempts (${maxAttempts}) reached — delivering best effort`);
            }
        }

        // ─── Phase 5: Publish ───────────────────────────────────────────
        let publishResult = { attempted: false, success: false, error: undefined as string | undefined, manifestPath: undefined as string | undefined };

        if (req.autoPublish && isUploadConfigured()) {
            emit('publish', 92, 'Publishing to social platforms');
            logEvent('publish_start', {});

            const mp4Path = path.resolve(process.cwd(), 'output', jobId, `${request.title ?? request.topic}.mp4`);

            try {
                const upload = await uploadToAllPlatforms(
                    mp4Path,
                    request.title ?? request.topic,
                    factsToDescription(research.facts, request.topic),
                    factsToHashtags(research.facts),
                );
                publishResult = {
                    attempted: true,
                    success: upload.success,
                    manifestPath: path.resolve(process.cwd(), 'output', jobId, 'publish-manifest.json'),
                    error: upload.failed > 0 ? `${upload.failed} platform(s) failed` : undefined,
                };
                logEvent('publish_complete', publishResult);
            } catch (e: any) {
                publishResult = { attempted: true, success: false, error: e?.message ?? String(e), manifestPath: undefined };
                logEvent('publish_failed', publishResult);
            }
        } else if (req.autoPublish) {
            logInfo('[ONETAKE] autoPublish=true but upload-post not configured — skipping publish');
            publishResult = { attempted: false, success: false, error: 'Upload posting not configured (set UPLOAD_POST_ENABLED=true)', manifestPath: undefined };
        }

        // ─── Phase 6: Build result ──────────────────────────────────────
        emit('done', 100, 'Complete');

        const result: OnetakeResult = {
            jobId,
            mp4: path.resolve(process.cwd(), 'output', jobId, `${request.title ?? request.topic}.mp4`),
            title: request.title ?? request.topic,
            orientation: req.orientation,
            durationSec: 0,
            research,
            style,
            critique: {
                passed: critiqueResult.passed,
                attempts: renderAttempts,
                gates: critiqueResult.gates,
            },
            publish: publishResult,
            metadata: {
                title: request.title ?? request.topic,
                description: factsToDescription(research.facts, request.topic),
                hashtags: factsToHashtags(research.facts),
                facts: research.facts.map(f => f.snippet),
            },
            logPath,
        };

        // Write the structured log
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.writeFileSync(logPath, JSON.stringify({
            jobId,
            request: req,
            result: {
                mp4: result.mp4,
                critique: result.critique,
                publish: result.publish,
                style: result.style,
            },
            log,
        }, null, 2));

        logEvent('complete', { passed: critiqueResult.passed, attempts: renderAttempts });
        return result;

    } catch (e: any) {
        logEvent('fatal_error', { error: e?.message ?? String(e) });
        logError(`[ONETAKE] Fatal: ${e?.message ?? e}`);
        emit('done', 100, `Failed: ${e?.message ?? e}`);
        throw e;
    }
}

/**
 * Build a script from research facts.
 * Uses a hook → build → CTA structure with cited facts.
 */
function buildScript(topic: string, facts: string[], offline: boolean): string {
    const hook = offline
        ? `Ever wonder about ${topic}? Here's what most people miss.`
        : `Ever wonder about ${topic}? ${facts[0] ?? 'Here are the key facts.'}`;

    const build = facts.slice(1, 4).map((f, i) => {
        const line = f.length > 100 ? f.slice(0, 97) + '...' : f;
        return `Fact ${i + 2}: ${line}`;
    }).join('\n');

    const cta = `If this was helpful, like and subscribe for more.`;

    return [hook, build, cta].filter(Boolean).join('\n');
}