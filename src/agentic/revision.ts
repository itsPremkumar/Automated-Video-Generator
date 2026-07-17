/**
 * revision.ts — STAGE 16 (client review / revision loop) for the agentic pipeline.
 *
 * Turns the one-shot generator into a real production tool: the agent delivers a
 * draft, a human/client reviews it, requests changes, and the agent produces a
 * new revision — with every round tracked and persisted. No media work here; it
 * is pure state + audit, fully offline, dependency-free.
 *
 * Lifecycle:
 *   draft → in_review → approved
 *                  ↘ changes_requested → draft (re-edited) → in_review …
 *
 * Each RevisionRound records: round number, what was requested, who by, when,
 * and the resulting jobId (so a revision links to its own workspace artefacts).
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgenticWorkspace } from './workspace.js';

export type ReviewState = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'cancelled';

export interface RevisionRound {
    round: number;
    requestedBy: string;        // e.g. 'client', 'producer', 'agent'
    requestedAt: string;        // ISO timestamp
    notes: string;              // free-text change requests
    /** Structured change hints the next run can read (optional). */
    changes?: { scope: 'script' | 'music' | 'visuals' | 'captions' | 'color' | 'other'; detail: string }[];
    resultJobId?: string;       // jobId of the re-render produced from this round
    resolvedAt?: string;
}

export interface RevisionState {
    jobId: string;              // the ORIGINAL job this review thread belongs to
    title: string;
    state: ReviewState;
    currentRound: number;
    rounds: RevisionRound[];
    updatedAt: string;
}

const FILE = 'revision-state.json';

export function loadRevision(ws: AgenticWorkspace): RevisionState | null {
    try {
        const p = path.join(ws.root, FILE);
        if (!fs.existsSync(p)) return null;
        return JSON.parse(fs.readFileSync(p, 'utf-8')) as RevisionState;
    } catch {
        return null;
    }
}

function save(ws: AgenticWorkspace, st: RevisionState): RevisionState {
    st.updatedAt = new Date().toISOString();
    fs.writeFileSync(path.join(ws.root, FILE), JSON.stringify(st, null, 2));
    return st;
}

/** Create a fresh review thread for a just-rendered draft. */
export function openReview(ws: AgenticWorkspace, jobId: string, title: string): RevisionState {
    const st: RevisionState = {
        jobId,
        title,
        state: 'in_review',
        currentRound: 0,
        rounds: [],
        updatedAt: new Date().toISOString(),
    };
    return save(ws, st);
}

/** Client submits change requests; agent will re-edit and call resolveRound with a new jobId. */
export function requestChanges(
    ws: AgenticWorkspace,
    requestedBy: string,
    notes: string,
    changes?: RevisionRound['changes'],
): RevisionState {
    const st = loadRevision(ws) ?? openReview(ws, ws.jobId, ws.jobId);
    st.state = 'changes_requested';
    st.currentRound += 1;
    st.rounds.push({
        round: st.currentRound,
        requestedBy,
        requestedAt: new Date().toISOString(),
        notes,
        changes,
    });
    return save(ws, st);
}

/** Agent finished the re-edit; bind the new jobId and put it back in review. */
export function resolveRound(ws: AgenticWorkspace, resultJobId: string): RevisionState {
    const st = loadRevision(ws);
    if (!st) throw new Error('no revision thread open for ' + ws.jobId);
    const round = st.rounds[st.rounds.length - 1];
    if (round) {
        round.resultJobId = resultJobId;
        round.resolvedAt = new Date().toISOString();
    }
    st.state = 'in_review';
    return save(ws, st);
}

/** Client approves the current draft — production complete. */
export function approve(ws: AgenticWorkspace, by = 'client'): RevisionState {
    const st = loadRevision(ws);
    if (!st) throw new Error('no revision thread open for ' + ws.jobId);
    st.currentRound += st.rounds.length === 0 ? 1 : 0;
    if (st.rounds.length === 0) {
        st.rounds.push({ round: st.currentRound, requestedBy: by, requestedAt: new Date().toISOString(), notes: 'approved' });
    } else {
        st.rounds[st.rounds.length - 1].resolvedAt = new Date().toISOString();
    }
    st.state = 'approved';
    return save(ws, st);
}

export function cancel(ws: AgenticWorkspace): RevisionState {
    const st = loadRevision(ws) ?? openReview(ws, ws.jobId, ws.jobId);
    st.state = 'cancelled';
    return save(ws, st);
}

/** Convenience: did this job reach final approval? */
export function isApproved(ws: AgenticWorkspace): boolean {
    return loadRevision(ws)?.state === 'approved';
}
