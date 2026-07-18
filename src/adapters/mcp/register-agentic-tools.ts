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

import { buildPlan } from '../../agentic/plan.js';
import { acquireAssets } from '../../agentic/acquire.js';
import { verifyAll } from '../../agentic/verify.js';
import { runGateway, GatewayDeps } from '../../agentic/gateway.js';
import { runFinalGate } from '../../agentic/gate.js';
import { runAgenticPipeline } from '../../agentic/orchestrate.js';
import { AgenticWorkspace, workspaceRootFor, readJson } from '../../agentic/workspace.js';
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
            return { content: [{ type: 'image', data: b64, mimeType: 'image/jpeg' }] } as any;
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
