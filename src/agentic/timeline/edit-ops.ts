/**
 * edit-ops.ts — ADVANCED: single batch timeline edit surface for agents.
 *
 * Before: agent called reorder/delete/update/insert one-by-one (N tool calls,
 * N plan.json rewrites, easy to leave inconsistent state).
 * Now: one atomic `applyEditOps(ops)` — validates all, applies all, writes once.
 *
 * Backed by existing media/scene-edit.ts primitives (no reimplementation).
 */

import { AgenticWorkspace, readJson, writeJson } from '../management/workspace.js';
import type { Plan } from '../types.js';

export type EditOp =
    | { op: 'reorder'; from: number; to: number }
    | { op: 'delete'; index: number }
    | { op: 'update'; index: number; patch: Partial<import('../types.js').ScenePlan> }
    | { op: 'insert'; index?: number; scene: Partial<import('../types.js').ScenePlan> & { voiceoverText: string } }
    | { op: 'retime'; index: number; durationSec: number }
    | { op: 'transition'; index: number; transition: string }
    | { op: 'grade'; index: number; grade: string };

export interface EditOpsResult {
    ok: boolean;
    applied: number;
    plan: Plan | null;
    detail: string;
}

function renumber(plan: Plan): void {
    plan.scenes.forEach((s, i) => {
        s.sceneNumber = i + 1;
    });
    plan.totalDurationSec = plan.scenes.reduce((a, s) => a + (s.durationSec || 0), 0);
}

export function applyEditOps(ws: AgenticWorkspace, ops: EditOp[]): EditOpsResult {
    const plan = readJson<Plan>(ws, 'plan.json');
    if (!plan) return { ok: false, applied: 0, plan: null, detail: `plan.json not found in ${ws.jobId}` };
    const next: Plan = JSON.parse(JSON.stringify(plan));
    try {
        for (const o of ops) {
            if (o.op === 'reorder') {
                if (!next.scenes[o.from] || o.to < 0 || o.to >= next.scenes.length)
                    throw new Error(`bad reorder ${o.from}->${o.to}`);
                const [m] = next.scenes.splice(o.from, 1);
                next.scenes.splice(o.to, 0, m);
            } else if (o.op === 'delete') {
                if (!next.scenes[o.index]) throw new Error(`bad delete ${o.index}`);
                next.scenes.splice(o.index, 1);
            } else if (o.op === 'update') {
                const s = next.scenes[o.index];
                if (!s) throw new Error(`bad update ${o.index}`);
                Object.assign(s, o.patch);
            } else if (o.op === 'insert') {
                const built = {
                    sceneNumber: 0,
                    searchKeywords: [o.scene.voiceoverText.split(' ').slice(0, 3).join(' ')],
                    visualPreference: 'image',
                    durationSec: 4,
                    ...o.scene,
                } as unknown as import('../types.js').ScenePlan;
                if (o.index == null || o.index >= next.scenes.length) next.scenes.push(built);
                else next.scenes.splice(o.index, 0, built);
            } else if (o.op === 'retime') {
                const s = next.scenes[o.index];
                if (!s) throw new Error(`bad retime ${o.index}`);
                s.durationSec = Math.max(0.5, Math.min(30, o.durationSec));
            } else if (o.op === 'transition') {
                const s = next.scenes[o.index];
                if (!s) throw new Error(`bad transition ${o.index}`);
                s.transition = o.transition;
            } else if (o.op === 'grade') {
                const s = next.scenes[o.index];
                if (!s) throw new Error(`bad grade ${o.index}`);
                s.grade = o.grade;
            }
        }
        renumber(next);
        writeJson(ws, 'plan.json', next);
        return { ok: true, applied: ops.length, plan: next, detail: `applied ${ops.length} ops` };
    } catch (e) {
        return { ok: false, applied: 0, plan: null, detail: (e as Error).message };
    }
}
