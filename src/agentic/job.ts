/**
 * job.ts — PHASE 8 (job state machine + audit) and PHASE 11 (metrics).
 *
 * Tracks each agentic run through its lifecycle and persists a small metrics
 * summary. Kept dependency-free and in-memory (with optional JSON persistence)
 * so it works offline and under test.
 *
 *   pending → processing → awaiting_review → processing → completed
 *                                  ↘ cancelled                ↘ failed
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgenticWorkspace } from './workspace.js';

export type JobState =
    | 'pending'
    | 'processing'
    | 'awaiting_review'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface JobRecord {
    jobId: string;
    state: JobState;
    workspace: AgenticWorkspace;
    topic?: string;
    title?: string;
    backend?: string;
    gatePass?: boolean;
    voiceoverDriven?: boolean;
    rendered?: boolean;
    videoPath?: string;
    createdAt: string;
    updatedAt: string;
    error?: string;
}

export interface JobMetrics {
    totalJobs: number;
    completed: number;
    failed: number;
    gatePassRate: number;
    voiceoverDrivenRate: number;
    avgScenes: number;
}

const jobs = new Map<string, JobRecord>();

export function createJob(jobId: string, ws: AgenticWorkspace, meta: Partial<JobRecord> = {}): JobRecord {
    const now = new Date().toISOString();
    const rec: JobRecord = {
        jobId,
        state: 'processing',
        workspace: ws,
        createdAt: now,
        updatedAt: now,
        ...meta,
    };
    jobs.set(jobId, rec);
    return rec;
}

const TRANSITIONS: Record<JobState, JobState[]> = {
    pending: ['processing', 'cancelled'],
    processing: ['awaiting_review', 'completed', 'failed', 'cancelled'],
    awaiting_review: ['processing', 'completed', 'cancelled', 'failed'],
    completed: ['processing'],
    failed: ['pending', 'processing'],
    cancelled: ['pending'],
};

export function transition(jobId: string, next: JobState): JobRecord {
    const rec = jobs.get(jobId);
    if (!rec) throw new Error('job not found: ' + jobId);
    if (!TRANSITIONS[rec.state].includes(next)) {
        throw new Error(`illegal transition ${rec.state} -> ${next}`);
    }
    rec.state = next;
    rec.updatedAt = new Date().toISOString();
    return rec;
}

export function updateJob(jobId: string, patch: Partial<JobRecord>): JobRecord {
    const rec = jobs.get(jobId);
    if (!rec) throw new Error('job not found: ' + jobId);
    Object.assign(rec, patch, { updatedAt: new Date().toISOString() });
    return rec;
}

export function getJob(jobId: string): JobRecord | undefined {
    return jobs.get(jobId);
}

export function computeMetrics(sceneCounts: number[] = []): JobMetrics {
    const all = [...jobs.values()];
    const total = all.length;
    const completed = all.filter((j) => j.state === 'completed').length;
    const failed = all.filter((j) => j.state === 'failed').length;
    const gatePass = all.filter((j) => j.gatePass).length;
    const voDriven = all.filter((j) => j.voiceoverDriven).length;
    const avg = sceneCounts.length ? sceneCounts.reduce((a, b) => a + b, 0) / sceneCounts.length : 0;
    return {
        totalJobs: total,
        completed,
        failed,
        gatePassRate: total ? gatePass / total : 0,
        voiceoverDrivenRate: total ? voDriven / total : 0,
        avgScenes: avg,
    };
}

/** Persist a job record + metrics to the workspace (Phase 11 audit trail). */
export function persistJob(rec: JobRecord): void {
    try {
        fs.writeFileSync(path.join(rec.workspace.root, 'job.json'), JSON.stringify(rec, null, 2), 'utf8');
    } catch { /* best-effort */ }
}
