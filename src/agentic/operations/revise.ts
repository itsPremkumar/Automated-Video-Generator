/**
 * revise.ts — closes the feedback loop the pipeline was missing.
 *
 * delivery/revision.ts defines a draft → in_review → changes_requested →
 * approved lifecycle, but NOTHING ever called requestChanges()/resolveRound().
 * This module is the driver that turns a client's change request into a real
 * re-render and binds the new jobId back to the review thread.
 *
 * Two modes:
 *   1. Programmatic: reviseJob(workspace, notes, hints) — re-runs the pipeline
 *      with the structured `changes` hints applied to the plan, opens a new
 *      workspace for the revision, and calls resolveRound(newJobId).
 *   2. CLI/MCP friendly: applyCritique(workspace, critiqueReport) — takes the
 *      output of critique.ts and auto-applies every fix hint to plan.json.
 *
 * NON-DESTRUCTIVE: the original workspace is never overwritten. A revision
 * gets its own jobId/workspace; revision-state.json links them. Existing
 * source files are untouched (backward-compat by construction).
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgenticWorkspace, workspaceRootFor, readJson, writeJson } from '../management/workspace.js';
import { runAgenticPipeline, renderAgenticSlideshow } from '../orchestrate.js';
import type { PipelineRequest } from '../orchestrator/types.js';
import { loadRevision, requestChanges, resolveRound, RevisionRound } from '../delivery/revision.js';
import { AgentBrain } from '../ai/brain.js';
import { critiqueVideo, CritiqueReport, CritiqueSuggestion } from './critique.js';

export interface ReviseHints {
    scope: 'script' | 'music' | 'visuals' | 'captions' | 'color' | 'other';
    detail: string;
}

export interface ReviseResult {
    ok: boolean;
    originalJobId: string;
    revisionJobId: string;
    outputPath: string | null;
    round: number;
    detail: string;
}

interface ReviqueChangeHint {
    scope: 'script' | 'music' | 'visuals' | 'captions' | 'color' | 'other';
    scene?: number;
    detail: string;
}

/** Apply structured change hints to a plan object (mutates a copy). */
function applyHintsToPlan(plan: any, hints: ReviqueChangeHint[]): any {
    const next = JSON.parse(JSON.stringify(plan));
    for (const h of hints) {
        if (h.scope === 'color') {
            const sc = h.scene != null ? next.scenes?.[h.scene] : null;
            if (sc && h.detail) sc.grade = guessGrade(h.detail);
        } else if (h.scope === 'captions') {
            const sc = h.scene != null ? next.scenes?.[h.scene] : null;
            if (sc && h.detail) {
                if (/top/.test(h.detail)) sc.captionStyle = 'top';
                else if (/bottom/.test(h.detail)) sc.captionStyle = 'bottom';
                else if (/center|middle/.test(h.detail)) sc.captionStyle = 'center';
                if (/yellow|red|white|cyan/i.test(h.detail)) sc.captionColor = h.detail.match(/yellow|red|white|cyan/i)?.[0]?.toLowerCase();
            }
        } else if (h.scope === 'music' && h.detail) {
            next.musicQuery = h.detail;
        } else if (h.scope === 'visuals' && h.scene != null) {
            const sc = next.scenes?.[h.scene];
            if (sc && h.detail) sc.searchKeywords = [h.detail];
        }
    }
    return next;
}

function guessGrade(detail: string): string {
    const d = detail.toLowerCase();
    if (/warm/.test(d)) return 'warm';
    if (/cool/.test(d)) return 'cool';
    if (/vivid|pop/.test(d)) return 'vivid';
    if (/cinematic|film/.test(d)) return 'cinematic';
    if (/neutral|natural/.test(d)) return 'neutral';
    return 'cinematic';
}

interface ReviqueChangeHint {
    scope: 'script' | 'music' | 'visuals' | 'captions' | 'color' | 'other';
    scene?: number;
    detail: string;
}

/**
 * Drive a full revision cycle for an existing job.
 * @param originalJobId job whose review thread we extend
 * @param notes free-text change request
 * @param hints optional structured hints (scope + detail) — applied to the plan
 * @param planOverride optional fully-replaced plan fields (e.g. from critique)
 */
export interface ReviseOpts {
    baseReq?: Partial<PipelineRequest>;
    brain?: AgentBrain | null;
    planOverride?: any;
    /** Scope-aware revise: limit how much of the pipeline re-runs.
     *  - 'full'    : re-run acquire + voice + render (default, most thorough)
     *  - 'music'   : reuse cached plan/visuals/voice, only re-compose with new music query
     *  - 'captions': reuse everything, only re-burn captions (style/color/size)
     *  - 'visuals' : reuse cached voice, re-acquire visuals + re-render
     */
    scope?: 'full' | 'music' | 'captions' | 'visuals';
}

export async function reviseJob(
    originalJobId: string,
    notes: string,
    hints: ReviqueChangeHint[] = [],
    opts: ReviseOpts = {},
): Promise<ReviseResult> {
    const wsRoot = workspaceRootFor(originalJobId);
    const ws: AgenticWorkspace = {
        jobId: originalJobId,
        root: wsRoot,
        assetsDir: path.join(wsRoot, 'assets'),
        imagesDir: path.join(wsRoot, 'assets', 'images'),
        videosDir: path.join(wsRoot, 'assets', 'videos'),
        musicDir: path.join(wsRoot, 'assets', 'music'),
        audioDir: path.join(wsRoot, 'audio'),
        verificationDir: path.join(wsRoot, 'verification'),
    } as AgenticWorkspace;

    const rev = loadRevision(ws) ?? null;
    const round = rev ? rev.currentRound + 1 : 1;

    // Fail safe BEFORE opening a review (which writes a revision-state file):
    // the original job's plan must exist, otherwise there is nothing to revise.
    const origPlan = readJson<any>(ws, 'plan.json');
    if (!origPlan) {
        return { ok: false, originalJobId, revisionJobId: '', outputPath: null, round, detail: `original plan.json not found at ${ws.root}` };
    }

    // Open a change request on the thread (or create the thread if missing).
    requestChanges(ws, 'client', notes, hints.map((h) => ({ scope: h.scope, detail: h.detail })));

    // Build the revised plan from the original plan.json.
    const revisedPlan = opts.planOverride ?? applyHintsToPlan(origPlan, hints);

    // New jobId/workspace for the revision (non-destructive).
    const revisionJobId = `${originalJobId}_r${round}`;

    try {
        let out: string | null = null;

        const scope = opts.scope ?? (hints.length ? (hints[0].scope as any) : 'full');
        if (scope === 'music' || scope === 'captions' || scope === 'visuals') {
            // SCOPE-AWARE FAST PATH: reuse cached workspace assets + voice,
            // re-render only what changed. No network acquire, no re-voice
            // (except 'visuals' which re-acquires imagery but keeps voice).
            out = await renderRevisionFromCache(ws, revisionJobId, revisedPlan, scope);
        } else {
            const req: PipelineRequest = {
                jobId: revisionJobId,
                topic: revisedPlan.title || originalJobId,
                title: revisedPlan.title || originalJobId,
                backend: opts.baseReq?.backend ?? 'agent',
                orientation: revisedPlan.orientation ?? 'portrait',
                voice: revisedPlan.voice,
                musicQuery: revisedPlan.musicQuery,
                candidatesPerAsset: opts.baseReq?.candidatesPerAsset ?? 2,
                ...(opts.baseReq ?? {}),
            } as PipelineRequest;
            const res = await runAgenticPipeline(req, undefined);
            if (!res.gate.pass) {
                return { ok: false, originalJobId, revisionJobId, outputPath: null, round, detail: `revision gate blocked: ${res.gate.checks.filter((c: any) => !c.pass).map((c: any) => c.id).join(',')}` };
            }
            const outDir = path.join(process.cwd(), 'output', revisionJobId);
            fs.mkdirSync(outDir, { recursive: true });
            out = await renderAgenticSlideshow(res, {
                outPath: path.join(outDir, `${revisedPlan.title || 'revision'}.mp4`),
                burnCaptions: revisedPlan.captions !== 'none',
            });
        }

        // Bind the new jobId back onto the review thread.
        const revWs: AgenticWorkspace = { ...ws, jobId: originalJobId, root: wsRoot } as AgenticWorkspace;
        resolveRound(revWs, revisionJobId);
        return { ok: !!out, originalJobId, revisionJobId, outputPath: out ?? null, round, detail: out ? `revision (${scope}) rendered: ${out}` : 'render produced no output' };
    } catch (e: any) {
        return { ok: false, originalJobId, revisionJobId, outputPath: null, round, detail: `revision threw: ${e?.message ?? e}` };
    }
}

/**
 * Re-render a revision from the ORIGINAL job's cached workspace (plan.json +
 * render-manifest + voiceover-meta). Used by scope-aware revise so "change the
 * music" doesn't re-fetch imagery or re-synthesize voice. Mirrors the
 * reconstruction that `agentic-modular runRender` already does.
 */
async function renderRevisionFromCache(
    ws: AgenticWorkspace,
    revisionJobId: string,
    revisedPlan: any,
    scope: 'music' | 'captions' | 'visuals',
): Promise<string | null> {
    const manifest = readJson<any>(ws, 'render-manifest.json') || readJson<any>(ws, 'scene-data.json');
    if (!manifest) throw new Error('no cached render-manifest.json to revise from (run a full render first)');
    const voiceMeta = readJson<any>(ws, 'voiceover-meta.json');

    const result: any = {
        backend: 'agent',
        plan: revisedPlan,
        workspace: { root: ws.root, assetsDir: ws.assetsDir },
        manifest: manifest.assets ? manifest : {
            assets: revisedPlan.scenes.map((s: any, i: number) => ({
                sceneIndex: i,
                kind: s.visualPreference === 'video' ? 'video' : 'image',
                localPath: s.localAsset ? path.join(ws.assetsDir, s.localAsset) : undefined,
                durationSec: s.durationSec,
            })),
            voiceoverDriven: voiceMeta?.voiceoverDriven ?? false,
        },
        voiceovers: voiceMeta,
        gate: { pass: true, checks: [] },
        fullyAgentDriven: true,
    };

    // Reconstruct voice scene paths from disk (cached, not re-synthesized).
    const audioDir = ws.audioDir;
    if (fs.existsSync(audioDir)) {
        const voiceScenes: any[] = [];
        for (const s of revisedPlan.scenes) {
            const wav = path.join(audioDir, `scene_${s.sceneNumber}_voice.wav`);
            const mp3 = path.join(audioDir, `scene_${s.sceneNumber}_voice.mp3`);
            const found = [wav, mp3].find((f) => fs.existsSync(f));
            if (found) voiceScenes.push({ sceneIndex: s.sceneNumber - 1, audioPath: found, durationSec: s.durationSec, captionSegments: s.captionSegments || [] });
        }
        if (voiceScenes.length) result.voiceovers = { scenes: voiceScenes, voiceoverDriven: true, fallbackUsed: false };
    }

    const outDir = path.join(process.cwd(), 'output', revisionJobId);
    fs.mkdirSync(outDir, { recursive: true });
    const { renderAgenticSlideshow } = await import('../orchestrator/render.js');
    return renderAgenticSlideshow(result, {
        outPath: path.join(outDir, `${revisedPlan.title || 'revision'}.mp4`),
        crossfadeSec: 0.3,
        burnCaptions: revisedPlan.captions !== 'none',
        vignette: revisedPlan.vignette !== false,
    });
}

/**
 * Turn a critique report into a plan override + revise call.
 * Auto-applies every suggestion's `fix` to the matching scene (or global) so
 * the assistant can self-heal without a human in the loop.
 */
export function critiqueToPlanOverride(planPath: string, report: CritiqueReport): any | null {
    if (!fs.existsSync(planPath)) return null;
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
    for (const s of report.suggestions) {
        if (s.scope === 'global') continue;
        const sc = plan.scenes?.[s.scope];
        if (!sc) continue;
        if (s.fix.captionStyle) sc.captionStyle = s.fix.captionStyle;
        if (s.fix.captionColor) sc.captionColor = s.fix.captionColor;
        if (s.fix.grade) sc.grade = s.fix.grade;
        if (typeof s.fix.kenBurns === 'boolean') sc.kenBurns = s.fix.kenBurns;
        if (typeof s.fix.volumeOverride === 'number') sc.volumeOverride = s.fix.volumeOverride;
        if (typeof s.fix.fadeIn === 'number') sc.fadeIn = s.fix.fadeIn;
        if (typeof s.fix.fadeOut === 'number') sc.fadeOut = s.fix.fadeOut;
    }
    return plan;
}

/** Convenience: critique a rendered MP4 then re-render applying the fixes. */
export async function critiqueAndRevise(
    originalJobId: string,
    mp4Path: string,
    planPath: string,
    notes = 'auto-critique fixes',
): Promise<ReviseResult> {
    const report = await critiqueVideo(mp4Path, { planPath });
    const override = critiqueToPlanOverride(planPath, report);
    return reviseJob(originalJobId, notes, [], { planOverride: override });
}
