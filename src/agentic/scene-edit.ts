/**
 * scene-edit.ts — P1c: agent-editable scene plan.
 *
 * Ports the legacy `scene-editor.ts` capability (reorder / delete / update
 * scenes) into the agentic system, but operates on the agentic workspace's
 * `plan.json` + `candidates.json` instead of the legacy `scene-data.json`.
 *
 * A new Hermes agent can call these to reshape a generated video WITHOUT
 * re-running the whole pipeline. After editing, re-render with
 * `renderAgenticSlideshow(workspace, ...)` (or `runAgenticPipeline` again with
 * the edited plan injected).
 *
 * All functions are pure on the workspace files: they read → mutate → rewrite
 * `plan.json` (and prune matching candidates from `candidates.json`).
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgenticWorkspace, readJson, writeJson } from './workspace.js';
import { Plan, ScenePlan, AssetCandidate } from './types.js';

function planPath(ws: AgenticWorkspace): string {
    return path.join(ws.root, 'plan.json');
}
function candidatesPath(ws: AgenticWorkspace): string {
    return path.join(ws.root, 'candidates.json');
}

export function readPlan(ws: AgenticWorkspace): Plan {
    const p = readJson<Plan>(ws, 'plan.json');
    if (!p) throw new Error(`plan.json not found in workspace ${ws.jobId} — run a pipeline first`);
    return p;
}

function writePlan(ws: AgenticWorkspace, plan: Plan): Plan {
    // Keep sceneNumber sequential after any structural edit.
    plan.scenes.forEach((s, i) => { s.sceneNumber = i + 1; });
    plan.totalDurationSec = plan.scenes.reduce((acc, s) => acc + (s.durationSec || 0), 0);
    writeJson(ws, 'plan.json', plan);
    return plan;
}

/** Reorder a scene from one index to another (0-based). Returns the new plan. */
export function reorderScenes(ws: AgenticWorkspace, fromIndex: number, toIndex: number): Plan {
    const plan = readPlan(ws);
    if (!plan.scenes[fromIndex] || toIndex < 0 || toIndex >= plan.scenes.length) {
        throw new Error(`Invalid reorder indices (from=${fromIndex}, to=${toIndex}, len=${plan.scenes.length})`);
    }
    const [moved] = plan.scenes.splice(fromIndex, 1);
    plan.scenes.splice(toIndex, 0, moved);
    return writePlan(ws, plan);
}

/** Delete a scene by 0-based index. Returns the new plan. */
export function deleteScene(ws: AgenticWorkspace, index: number): Plan {
    const plan = readPlan(ws);
    if (!plan.scenes[index]) throw new Error(`Scene ${index} not found`);
    plan.scenes.splice(index, 1);
    // Also drop that scene's candidates so the render manifest stays consistent.
    const cands = readJson<AssetCandidate[]>(ws, 'candidates.json') ?? [];
    writeJson(ws, 'candidates.json', cands.filter((c) => c.sceneIndex !== index)
        .map((c) => (c.sceneIndex > index ? { ...c, sceneIndex: c.sceneIndex - 1 } : c)));
    return writePlan(ws, plan);
}

/** Patch a scene's editable fields (text, keywords, duration, localAsset). */
export function updateScene(
    ws: AgenticWorkspace,
    index: number,
    patch: Partial<Pick<ScenePlan, 'voiceoverText' | 'searchKeywords' | 'durationSec' | 'localAsset' | 'visualPreference'>>,
): Plan {
    const plan = readPlan(ws);
    const scene = plan.scenes[index];
    if (!scene) throw new Error(`Scene ${index} not found`);
    if (patch.voiceoverText !== undefined) scene.voiceoverText = patch.voiceoverText;
    if (patch.searchKeywords !== undefined) scene.searchKeywords = patch.searchKeywords;
    if (patch.durationSec !== undefined) scene.durationSec = patch.durationSec;
    if (patch.localAsset !== undefined) scene.localAsset = patch.localAsset;
    if (patch.visualPreference !== undefined) scene.visualPreference = patch.visualPreference;
    return writePlan(ws, plan);
}

/**
 * Insert a brand-new scene (e.g. an agent decides to add a closing CTA scene).
 * The new scene is appended at `index` (default: end) with a localAsset or
 * empty keywords so the next acquire can fill it.
 */
export function insertScene(ws: AgenticWorkspace, scene: Partial<ScenePlan> & { voiceoverText: string }, index?: number): Plan {
    const plan = readPlan(ws);
    const built: ScenePlan = {
        sceneNumber: 0,
        voiceoverText: scene.voiceoverText,
        searchKeywords: scene.searchKeywords ?? [scene.voiceoverText.split(' ').slice(0, 2).join(' ')],
        visualPreference: scene.visualPreference ?? 'image',
        durationSec: scene.durationSec ?? 4,
        localAsset: scene.localAsset,
    };
    if (index === undefined || index >= plan.scenes.length) plan.scenes.push(built);
    else plan.scenes.splice(index, 0, built);
    return writePlan(ws, plan);
}
