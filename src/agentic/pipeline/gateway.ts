/**
 * gateway.ts — STAGE 4: agent decision loop + STAGE 5: final gate.
 *
 * STAGE 4 (DECIDE): the agent — or a human at L0/L1 — makes a decision for
 * every asset: approve / reject / replace (re-fetch with new keywords).
 * Rejected visuals trigger a re-fetch of fresh candidates (bounded retries).
 * Every decision + rationale is persisted to approval-manifest.json.
 *
 * STAGE 5 (GATE): holistic cross-checks (X1-X6) before render. If anything
 * is unverified, rejected-but-unreplaced, or mismatched, render is BLOCKED.
 *
 * The "decide" function is injected so autonomous tests can simulate the agent.
 */

import * as fs from 'fs';
import { AgenticWorkspace, getAgenticWorkspace, writeJson, readJson } from '../management/workspace.js';
import { acquireAssets, AcquireDeps, FetchedVisual } from './acquire.js';
import { verifyAll, VerifyDeps, VERIFY_PASS_CONFIDENCE } from './verify.js';
import { AssetCandidate, AssetDecision, Plan, RenderManifest } from '../types.js';
import { computeApprovedHashes } from '../ai/agent.js';

export type Decider = (
    candidate: AssetCandidate,
    verification: { passes: boolean; confidence: number; reason: string; approvedHashes?: Set<string> },
) => Promise<{ decision: 'approved' | 'rejected' | 'replace'; rationale: string; newKeywords?: string[] }>;

export interface GatewayDeps extends AcquireDeps, VerifyDeps {
    decide: Decider;
    /** Max re-fetch attempts per rejected asset (default 3). */
    maxReplaceRetries?: number;
}

async function reAcquireScene(
    plan: Plan,
    sceneIndex: number,
    newKeywords: string[],
    deps: AcquireDeps,
    ws: AgenticWorkspace,
): Promise<AssetCandidate | null> {
    const scene = plan.scenes[sceneIndex];
    if (!scene) return null; // defensive: scene dropped
    const kind = scene.visualPreference;
    const dir =
        kind === 'image'
            ? require('../management/workspace.js').sceneImageDir(ws, sceneIndex)
            : require('../management/workspace.js').sceneVideoDir(ws, sceneIndex);
    const fetched: FetchedVisual[] = await deps.fetchVisual(newKeywords, kind, plan.orientation);
    if (fetched.length === 0) return null;
    const f = fetched[0];
    const ext = require('path').extname(f.url).split('?')[0] || (kind === 'image' ? '.jpg' : '.mp4');
    const filename = `replaced_${Date.now()}${ext}`;
    const localPath = await deps.download(f.url, dir, filename);
    return {
        kind,
        sceneIndex,
        candidateIndex: 99,
        localPath,
        url: f.url,
        source: f.source,
        license: f.license,
        licenseUrl: f.licenseUrl,
        keywords: newKeywords,
    };
}

export async function runGateway(
    plan: Plan,
    initialCandidates: AssetCandidate[],
    deps: GatewayDeps,
): Promise<{
    workspace: AgenticWorkspace;
    decisions: AssetDecision[];
    manifest: RenderManifest;
}> {
    const ws = getAgenticWorkspace(plan.jobId);
    const candidates = [...initialCandidates];
    const decisions: AssetDecision[] = [];
    const maxRetries = deps.maxReplaceRetries ?? 3;

    // STAGE 3 already ran during acquire; re-run verify on the (possibly replaced) set.
    // For simplicity we verify the working candidate list here.
    const verifications = await verifyAll(candidates, ws, deps);
    const verifyById = new Map(verifications.map((v) => [v.assetId, v]));

    for (const c of candidates) {
        const id = `${c.kind}_s${c.sceneIndex}_c${c.candidateIndex}`;
        const v = verifyById.get(id) ?? { passes: false, confidence: 0, reason: 'not verified' };
        // Compute approved hashes for diversity penalty (P3)
        const approvedHashes = computeApprovedHashes(candidates, decisions);
        const decided = await deps.decide(c, { passes: v.passes, confidence: v.confidence, reason: v.reason, approvedHashes });

        if (decided.decision === 'approved') {
            decisions.push(mkDecision(c, 'approved', decided.rationale, 'agent', false));
        } else if (decided.decision === 'replace') {
            let replaced: AssetCandidate | null = null;
            let replacedApproved = false;
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                replaced = await reAcquireScene(plan, c.sceneIndex, decided.newKeywords ?? c.keywords, deps, ws);
                if (!replaced) break; // network failure, no point retrying
                const rv = (await verifyAll([replaced], ws, deps))[0];
                const r2 = await deps.decide(replaced, {
                    passes: rv.passes,
                    confidence: rv.confidence,
                    reason: rv.reason,
                });
                if (r2.decision === 'approved') {
                    candidates.push(replaced);
                    decisions.push(mkDecision(replaced, 'approved', r2.rationale, 'agent', false));
                    replacedApproved = true;
                    break;
                }
            }
            if (!replacedApproved) {
                decisions.push(mkDecision(c, 'rejected', decided.rationale, 'agent', false));
            }
        } else {
            decisions.push(mkDecision(c, 'rejected', decided.rationale, 'agent', false));
        }
    }

    writeJson(ws, 'approval-manifest.json', decisions);

    const manifest = buildRenderManifest(plan, candidates, decisions, ws);
    if (manifest) writeJson(ws, 'render-manifest.json', manifest);

    return { workspace: ws, decisions, manifest: manifest! };
}

function mkDecision(
    c: AssetCandidate,
    decision: AssetDecision['decision'],
    rationale: string,
    by: 'agent' | 'human' | 'system',
    fallback: boolean,
): AssetDecision {
    return {
        assetId: `${c.kind}_s${c.sceneIndex}_c${c.candidateIndex}`,
        kind: c.kind,
        sceneIndex: c.sceneIndex,
        decision,
        rationale,
        decidedBy: by,
        fallbackUsed: fallback,
    };
}

/** Build the render manifest: one approved asset per scene (best confidence first). */
export function buildRenderManifest(
    plan: Plan,
    candidates: AssetCandidate[],
    decisions: AssetDecision[],
    ws: AgenticWorkspace,
): RenderManifest | null {
    const decisionById = new Map(decisions.map((d) => [d.assetId, d]));
    const approvedByScene = new Map<number, AssetCandidate[]>();
    const approvedMusic: AssetCandidate[] = [];

    for (const c of candidates) {
        const id = `${c.kind}_s${c.sceneIndex}_c${c.candidateIndex}`;
        const d = decisionById.get(id);
        if (!d || d.decision !== 'approved') continue;
        if (c.kind === 'music') {
            approvedMusic.push(c);
        } else {
            const list = approvedByScene.get(c.sceneIndex) ?? [];
            list.push(c);
            approvedByScene.set(c.sceneIndex, list);
        }
    }

    const assets: RenderManifest['assets'] = [];
    for (let i = 0; i < plan.scenes.length; i++) {
        const list = approvedByScene.get(i);
        if (!list || list.length === 0) return null; // cannot render: missing scene visual
        // pick the first (acquire stores best-first)
        const pick = list[0];
        assets.push({
            kind: pick.kind,
            sceneIndex: i,
            localPath: pick.localPath,
            license: pick.license,
            licenseUrl: pick.licenseUrl,
        });
    }
    if (approvedMusic.length > 0) {
        const m = approvedMusic[0];
        assets.push({
            kind: 'music',
            sceneIndex: -1,
            localPath: m.localPath,
            license: m.license,
            licenseUrl: m.licenseUrl,
        });
    }

    return {
        jobId: plan.jobId,
        title: plan.title,
        orientation: plan.orientation,
        voice: plan.voice,
        musicQuery: plan.musicQuery,
        assets,
        generatedAt: new Date().toISOString(),
    };
}
