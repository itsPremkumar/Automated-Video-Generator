/**
 * register-agentic-tools.ts
 *
 * Exposes the agentic pipeline to an AI agent (Hermes / OpenClaw / any MCP client)
 * as a set of tools covering the six stages + full control:
 *   agentic_plan, agentic_acquire, agentic_verify_all,
 *   list_pending_assets, get_asset_preview, approve_asset,
 *   reject_asset, replace_asset, agentic_gate, agentic_render
 *
 * This is the "agent has complete control" surface. The heavy fetchers are wired
 * to the project's real modules; vision verification uses verifyMedia (Ollama/Gemini).
 */

import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { buildPlan } from '../../agentic/pipeline/plan.js';
import { acquireAssets } from '../../agentic/pipeline/acquire.js';
import { verifyAll } from '../../agentic/pipeline/verify.js';
import { runGateway, GatewayDeps } from '../../agentic/pipeline/gateway.js';
import { runFinalGate } from '../../agentic/pipeline/gate.js';
import { runAgenticPipeline } from '../../agentic/orchestrate.js';
import { getDriverLlm } from './driver-llm.js';
import { AgenticWorkspace, workspaceRootFor, readJson } from '../../agentic/management/workspace.js';
import { AssetCandidate, AssetDecision } from '../../agentic/types.js';

import { parseScript } from '../../lib/script-parser.js';
import { fetchVisualsForScene, downloadMedia } from '../../lib/visual-fetcher.js';
import { verifyMedia } from '../../lib/media-verifier.js';
import { resolveFreeBackgroundMusic } from '../../lib/free-music.js';
import { textResponse, errorResponse } from './responses.js';

// In-memory working state per job (a production build would persist this; for the
// agentic control loop the agent polls these tools so in-memory is sufficient).
const state = new Map<
    string,
    {
        plan: any;
        workspace: AgenticWorkspace;
        candidates: AssetCandidate[];
        decisions: AssetDecision[];
    }
>();

function depsFor(): GatewayDeps {
    return {
        fetchVisual: async (keywords: string[], kind: 'image' | 'video', orientation: 'portrait' | 'landscape') => {
            const q = keywords.join(' ');
            const res = await fetchVisualsForScene(keywords, kind === 'video', orientation, q);
            if (!res) return [];
            const arr = Array.isArray(res) ? res : [res];
            return arr.map((a: any) => ({
                url: a.url,
                localPath: '',
                source: 'openverse/pexels',
                license: a.license,
                licenseUrl: a.licenseUrl,
            }));
        },
        download: async (url: string, dir: string, filename: string) => {
            const r = await downloadMedia(url, dir, filename);
            return r.path;
        },
        fetchMusic: async (query: string) => {
            const m = await resolveFreeBackgroundMusic({ query, enabled: true });
            if (!m) return [];
            return [
                {
                    url: '',
                    localPath: m.localPath,
                    source: m.track.provider,
                    license: m.track.license,
                    licenseUrl: m.track.licenseUrl,
                },
            ];
        },
        verifyImage: (p: string, kw: string[]) => verifyMedia(p, kw),
        verifyVideo: (p: string, kw: string[]) => verifyMedia(p, kw),
        decide: async (c: AssetCandidate) => ({ decision: 'approved', rationale: 'auto-approved (autonomy L2)' }),
    };
}

export function registerAgenticTools(server: McpServer) {
    server.registerTool(
        'agentic_plan',
        {
            title: 'Agentic Plan',
            description: 'STAGE 1: turn a script into a director plan (scenes + music query).',
            inputSchema: z.object({
                jobId: z.string(),
                title: z.string(),
                script: z.string().min(10),
                orientation: z.enum(['portrait', 'landscape']).default('portrait'),
                voice: z.string().optional(),
                musicQuery: z.string().optional(),
            }) as any,
        },
        async (args: any) => {
            const plan = await buildPlan(
                args.script,
                {
                    jobId: args.jobId,
                    title: args.title,
                    orientation: args.orientation,
                    voice: args.voice,
                    musicQuery: args.musicQuery,
                },
                parseScript,
            );
            return textResponse(
                `Planned ${plan.scenes.length} scenes. Music query: "${plan.musicQuery}". orientation=${plan.orientation}.`,
            );
        },
    );

    server.registerTool(
        'agentic_acquire',
        {
            title: 'Agentic Acquire',
            description: 'STAGE 2: download candidate images/videos/music into per-type folders.',
            inputSchema: z.object({
                jobId: z.string(),
                candidatesPerAsset: z.number().min(1).max(5).default(2),
            }) as any,
        },
        async (args: any) => {
            const plan = readPlan(args.jobId);
            if (!plan) return errorResponse('Plan not found; run agentic_plan first.');
            const { workspace, candidates } = await acquireAssets(plan, depsFor(), args.candidatesPerAsset);
            state.set(args.jobId, { plan, workspace, candidates, decisions: [] });
            return textResponse(`Acquired ${candidates.length} candidates into ${workspace.root}.`);
        },
    );

    server.registerTool(
        'agentic_verify_all',
        {
            title: 'Agentic Verify All',
            description: 'STAGE 3: run the full verification matrix on all candidates.',
            inputSchema: z.object({ jobId: z.string() }) as any,
        },
        async (args: any) => {
            const s = state.get(args.jobId);
            if (!s) return errorResponse('No acquisition for this job.');
            const verifications = await verifyAll(s.candidates, s.workspace, depsFor());
            const pass = verifications.filter((v: any) => v.passes).length;
            return textResponse(
                `Verified ${verifications.length} assets: ${pass} pass, ${verifications.length - pass} fail. Details in verification/*.json.`,
            );
        },
    );

    server.registerTool(
        'list_pending_assets',
        {
            title: 'List Pending Assets',
            description: 'Show every candidate + its verification score for agent review.',
            inputSchema: z.object({ jobId: z.string() }) as any,
        },
        async (args: any) => {
            const s = state.get(args.jobId);
            if (!s) return errorResponse('No job state.');
            const rows = s.candidates.map((c) => {
                const v = readJson<any>(s.workspace, 'verification/all_checks.json')?.find(
                    (x: any) => x.assetId === `${c.kind}_s${c.sceneIndex}_c${c.candidateIndex}`,
                );
                return `| ${c.kind} s${c.sceneIndex} c${c.candidateIndex} | ${v?.passes ? 'PASS' : 'FAIL'} ${v?.confidence ?? '-'}/10 | ${v?.reason ?? ''} | ${c.localPath} |`;
            });
            return textResponse(`| asset | verdict | path |\n| :--- | :--- | :--- |\n${rows.join('\n')}`);
        },
    );

    server.registerTool(
        'get_asset_preview',
        {
            title: 'Get Asset Preview',
            description: 'Return a base64 thumbnail/frame so the agent can SEE the asset.',
            inputSchema: z.object({ jobId: z.string(), assetId: z.string() }) as any,
        },
        async (args: any) => {
            const s = state.get(args.jobId);
            if (!s) return errorResponse('No job state.');
            const c = s.candidates.find(
                (x: AssetCandidate) => `${x.kind}_s${x.sceneIndex}_c${x.candidateIndex}` === args.assetId,
            );
            if (!c || !fs.existsSync(c.localPath)) return errorResponse('Asset not found.');
            const b64 = fs.readFileSync(c.localPath).toString('base64');
            // Derive MIME from the real file type (assets may be video, not jpeg).
            const ext = path.extname(c.localPath).toLowerCase();
            const mime =
                ext === '.png'
                    ? 'image/png'
                    : ext === '.gif'
                      ? 'image/gif'
                      : ext === '.webp'
                        ? 'image/webp'
                        : ext === '.mp4' || ext === '.webm' || ext === '.mov'
                          ? 'video/mp4'
                          : 'image/jpeg';
            return { content: [{ type: 'image', data: b64, mimeType: mime }] } as any;
        },
    );

    server.registerTool(
        'approve_asset',
        {
            title: 'Approve Asset',
            description: 'Agent approves a candidate (full control).',
            inputSchema: z.object({ jobId: z.string(), assetId: z.string(), rationale: z.string().optional() }) as any,
        },
        async (args: any) => recordDecision(args, 'approved'),
    );

    server.registerTool(
        'reject_asset',
        {
            title: 'Reject Asset',
            description: 'Agent rejects a candidate; triggers re-fetch (gateway handles retries).',
            inputSchema: z.object({ jobId: z.string(), assetId: z.string(), rationale: z.string().optional() }) as any,
        },
        async (args: any) => recordDecision(args, 'rejected'),
    );

    server.registerTool(
        'agentic_gate',
        {
            title: 'Agentic Gate',
            description: 'STAGE 5: run final holistic gate (X1-X6). Blocks render if anything unverified.',
            inputSchema: z.object({ jobId: z.string() }) as any,
        },
        async (args: any) => {
            const s = state.get(args.jobId);
            if (!s) return errorResponse('No job state.');
            const { manifest } = await runGateway(s.plan, s.candidates, depsFor());
            const gate = runFinalGate(s.plan, s.candidates, s.decisions, manifest);
            const fails = gate.checks.filter((c) => !c.pass);
            return gate.pass
                ? textResponse(`GATE PASS. Render manifest ready (${manifest?.assets.length} assets).`)
                : errorResponse(`GATE BLOCKED:\n${fails.map((c) => `- ${c.id} ${c.label}: ${c.detail}`).join('\n')}`);
        },
    );

    server.registerTool(
        'agentic_run',
        {
            title: 'Agentic Run (Hermes drives everything)',
            description:
                'One-shot: Hermes writes the script, expands keywords, acquires, verifies and DECIDES every asset — no external AI needed when backend=agent.',
            inputSchema: z.object({
                topic: z.string().min(5),
                title: z.string(),
                backend: z.enum(['agent', 'vision']).default('agent'),
                orientation: z.enum(['portrait', 'landscape']).default('portrait'),
                voice: z.string().optional(),
                candidatesPerAsset: z.number().min(1).max(5).default(2),
            }) as any,
        },
        async (args: any) => {
            const res = await runAgenticPipeline({
                topic: args.topic,
                title: args.title,
                backend: args.backend,
                orientation: args.orientation,
                voice: args.voice,
                candidatesPerAsset: args.candidatesPerAsset,
                // Driver-first: if a host registered its LLM callback, every
                // LLM-capable step is routed to the DRIVER first (per the
                // standing rule), then the configured model, then the signal
                // floor. Undefined here -> behaves exactly as before.
                driverLLM: getDriverLlm(),
            });
            const approved = res.decisions.filter((d: any) => d.decision === 'approved').length;
            return res.gate.pass
                ? textResponse(
                      `DONE (backend=${res.backend}, fullyAgentDriven=${res.fullyAgentDriven}). ${approved} assets approved. GATE PASS — ready to render ${res.manifest.assets.length} assets.`,
                  )
                : errorResponse(
                      `DONE but GATE BLOCKED (backend=${res.backend}).\n${res.gate.checks
                          .filter((c: any) => !c.pass)
                          .map((c: any) => `- ${c.id} ${c.label}: ${c.detail}`)
                          .join('\n')}`,
                  );
        },
    );

    server.registerTool(
        'agentic_revise',
        {
            title: 'Agentic Revise (close the feedback loop)',
            description:
                'Re-edit a delivered job from a change request. Opens a revision round on the review thread, re-renders a NEW jobId (non-destructive), and binds it back. Use after agentic_run / agentic_render.',
            inputSchema: z.object({
                jobId: z.string(),
                notes: z.string().min(3),
                hints: z
                    .array(
                        z.object({
                            scope: z.enum(['script', 'music', 'visuals', 'captions', 'color', 'other']),
                            scene: z.number().optional(),
                            detail: z.string(),
                        }),
                    )
                    .optional(),
                autoCritique: z.boolean().optional().describe('If true, critique the rendered MP4 first and auto-apply fixes'),
            }) as any,
        },
        async (args: any) => {
            const { reviseJob, critiqueAndRevise } = await import('../../agentic/operations/revise.js');
            const wsRoot = workspaceRootFor(args.jobId);
            const planPath = path.join(wsRoot, 'plan.json');
            let report;
            if (args.autoCritique) {
                const candidates = fs.existsSync(path.join(process.cwd(), 'output', args.jobId))
                    ? fs.readdirSync(path.join(process.cwd(), 'output', args.jobId)).filter((f: string) => f.endsWith('.mp4'))
                    : [];
                const mp4 = candidates[0] ? path.join(process.cwd(), 'output', args.jobId, candidates[0]) : '';
                if (!mp4) return errorResponse('No rendered MP4 found to critique for ' + args.jobId);
                report = await critiqueAndRevise(args.jobId, mp4, planPath, args.notes);
            } else {
                report = await reviseJob(args.jobId, args.notes, args.hints ?? []);
            }
            if (!report.ok) return errorResponse(`Revise failed: ${report.detail}`);
            return textResponse(
                `REVISED (round ${report.round}). New job: ${report.revisionJobId}\nOutput: ${report.outputPath}\n${report.detail}`,
            );
        },
    );

    server.registerTool(
        'agentic_critique',
        {
            title: 'Agentic Critique (Director’s Critique)',
            description:
                'Watch the rendered MP4 and return structured edit suggestions (black frames, clipping, aspect, caption overlaps). Offline; opt-in vision model when configured.',
            inputSchema: z.object({ jobId: z.string(), mp4Path: z.string().optional() }) as any,
        },
        async (args: any) => {
            const { critiqueVideo } = await import('../../agentic/operations/critique.js');
            const wsRoot = workspaceRootFor(args.jobId);
            const planPath = path.join(wsRoot, 'plan.json');
            let mp4 = args.mp4Path;
            if (!mp4 && fs.existsSync(path.join(process.cwd(), 'output', args.jobId))) {
                const cands = fs
                    .readdirSync(path.join(process.cwd(), 'output', args.jobId))
                    .filter((f: string) => f.endsWith('.mp4'));
                mp4 = cands[0] ? path.join(process.cwd(), 'output', args.jobId, cands[0]) : '';
            }
            if (!mp4 || !fs.existsSync(mp4)) return errorResponse('No rendered MP4 found for ' + args.jobId);
            const rep = await critiqueVideo(mp4, { planPath });
            const lines = rep.suggestions.length
                ? rep.suggestions.map((s: any) => `- [${s.severity}] ${s.scope === 'global' ? 'GLOBAL' : 'scene ' + (s.scope + 1)}: ${s.issue}`).join('\n')
                : 'No issues found — video looks clean.';
            return textResponse(`Critique (${rep.ok ? 'PASS' : 'NEEDS WORK'}):\n${lines}`);
        },
    );

    async function recordDecision(args: any, decision: 'approved' | 'rejected') {
        const s = state.get(args.jobId);
        if (!s) return errorResponse('No job state.');
        const [kind, , sIdx, , cIdx] = args.assetId.split(/_s|_c/);
        s.decisions.push({
            assetId: args.assetId,
            kind: kind as any,
            sceneIndex: Number(sIdx),
            decision,
            rationale: args.rationale ?? 'agent decision',
            decidedBy: 'agent',
            fallbackUsed: false,
        });
        return textResponse(`Asset ${args.assetId} ${decision}.`);
    }
}

function readPlan(jobId: string): any {
    const p = path.join(workspaceRootFor(jobId), 'plan.json');
    if (!fs.existsSync(p)) return null;
    try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
        return null;
    }
}
