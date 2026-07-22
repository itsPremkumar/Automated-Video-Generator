import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runBatch, readManifestSafe, summarize, type BatchJobInput, type BatchJobResult } from './batch-queue';
import { makeWorkspaceTempDir, resolveWorkspaceTempPath } from '../../shared/runtime/paths.js';

function makeInputs(count: number): BatchJobInput[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `job_${index}`,
        index,
        title: `Job ${index}`,
    }));
}

function tmpManifestPath(): string {
    return path.join(makeWorkspaceTempDir('avg-batch-'), 'batch-manifest.json');
}

test('caps active jobs at N (concurrency)', async () => {
    const maxActive = 2;
    let active = 0;
    let peak = 0;

    const manifest = await runBatch(
        makeInputs(6),
        {
            concurrency: maxActive,
            maxRetries: 0,
            executeJob: async () => {
                active += 1;
                peak = Math.max(peak, active);
                await new Promise((r) => setTimeout(r, 10));
                active -= 1;
                return { outcome: 'completed' as const };
            },
        },
        tmpManifestPath(),
    );

    assert.equal(peak, maxActive, 'peak active concurrency never exceeds the cap');
    assert.equal(manifest.jobs.length, 6);
    assert.ok(manifest.jobs.every((j) => j.outcome === 'completed'));
});

test('honors MAX_CONCURRENT_JOBS default when no concurrency passed', async () => {
    const prev = process.env.MAX_CONCURRENT_JOBS;
    process.env.MAX_CONCURRENT_JOBS = '3';
    try {
        let active = 0;
        let peak = 0;
        await runBatch(
            makeInputs(5),
            {
                maxRetries: 0,
                executeJob: async () => {
                    active += 1;
                    peak = Math.max(peak, active);
                    await new Promise((r) => setTimeout(r, 5));
                    active -= 1;
                    return { outcome: 'completed' as const };
                },
            },
            tmpManifestPath(),
        );
        assert.equal(peak, 3, 'defaults to MAX_CONCURRENT_JOBS');
    } finally {
        if (prev === undefined) {
            delete process.env.MAX_CONCURRENT_JOBS;
        } else {
            process.env.MAX_CONCURRENT_JOBS = prev;
        }
    }
});

test('retries transient failures up to AVG_BATCH_MAX_RETRIES then marks failed', async () => {
    process.env.AVG_BATCH_MAX_RETRIES = '2';
    try {
        const attemptsByJob = new Map<string, number>();
        const manifest = await runBatch(
            makeInputs(1),
            {
                concurrency: 1,
                executeJob: async (job) => {
                    const n = (attemptsByJob.get(job.id) ?? 0) + 1;
                    attemptsByJob.set(job.id, n);
                    return { outcome: 'failed' as const, error: 'transient network error' };
                },
            },
            tmpManifestPath(),
        );

        assert.equal(manifest.jobs[0].attempts, 3, '1 initial + 2 retries');
        assert.equal(manifest.jobs[0].outcome, 'failed');
        assert.match(manifest.jobs[0].error ?? '', /transient/i);
    } finally {
        delete process.env.AVG_BATCH_MAX_RETRIES;
    }
});

test('marks permanent (schema) failures without retrying', async () => {
    process.env.AVG_BATCH_MAX_RETRIES = '3';
    try {
        const attemptsByJob = new Map<string, number>();
        const manifest = await runBatch(
            makeInputs(1),
            {
                concurrency: 1,
                executeJob: async (job) => {
                    const n = (attemptsByJob.get(job.id) ?? 0) + 1;
                    attemptsByJob.set(job.id, n);
                    return { outcome: 'failed' as const, error: 'Schema validation failed' };
                },
            },
            tmpManifestPath(),
        );

        assert.equal(manifest.jobs[0].attempts, 1, 'permanent failures are not retried');
        assert.equal(manifest.jobs[0].outcome, 'failed');
    } finally {
        delete process.env.AVG_BATCH_MAX_RETRIES;
    }
});

test('--resume reprocesses only failed/pending, skipping completed', async () => {
    const manifestPath = tmpManifestPath();

    // First run: job_0 completes, job_1 fails.
    const first = await runBatch(
        makeInputs(2),
        {
            concurrency: 1,
            maxRetries: 0,
            executeJob: async (job) =>
                job.id === 'job_0'
                    ? ({ outcome: 'completed' as const, outputPath: '/out/0.mp4' } as BatchJobResult)
                    : ({ outcome: 'failed' as const, error: 'boom' } as BatchJobResult),
        },
        manifestPath,
    );
    assert.equal(first.jobs.find((j) => j.id === 'job_0')!.outcome, 'completed');
    assert.equal(first.jobs.find((j) => j.id === 'job_1')!.outcome, 'failed');

    let job0Executions = 0;
    let job1Executions = 0;
    const second = await runBatch(
        makeInputs(2),
        {
            concurrency: 1,
            maxRetries: 0,
            resume: true,
            executeJob: async (job) => {
                if (job.id === 'job_0') {
                    job0Executions += 1;
                    return { outcome: 'completed' as const, outputPath: '/out/0.mp4' };
                }
                job1Executions += 1;
                return { outcome: 'completed' as const, outputPath: '/out/1.mp4' };
            },
        },
        manifestPath,
    );

    assert.equal(job0Executions, 0, 'completed job_0 is skipped on resume');
    assert.equal(job1Executions, 1, 'failed job_1 is re-run on resume');
    assert.equal(second.jobs.find((j) => j.id === 'job_0')!.outcome, 'completed');
    assert.equal(second.jobs.find((j) => j.id === 'job_1')!.outcome, 'completed');
});

test('persists an accurate machine-readable manifest + summary', async () => {
    const manifestPath = tmpManifestPath();
    const manifest = await runBatch(
        makeInputs(3),
        {
            concurrency: 2,
            maxRetries: 0,
            executeJob: async (job) =>
                job.index === 2
                    ? ({ outcome: 'failed' as const, error: 'nope' } as BatchJobResult)
                    : ({ outcome: 'completed' as const, outputPath: `/out/${job.index}.mp4` } as BatchJobResult),
        },
        manifestPath,
    );

    // Re-read from disk.
    const fromDisk = readManifestSafe(manifestPath);
    assert.ok(fromDisk, 'manifest written to disk');
    assert.equal(fromDisk!.jobs.length, 3);
    const summary = summarize(fromDisk!);
    assert.equal(summary.completed, 2);
    assert.equal(summary.failed, 1);
    assert.equal(summary.pending, 0);
    assert.equal(summary.total, 3);

    const failedEntry = fromDisk!.jobs.find((j) => j.id === 'job_2')!;
    assert.equal(failedEntry.attempts, 1);
    assert.equal(failedEntry.error, 'nope');
    assert.ok(failedEntry.startedAt && failedEntry.finishedAt);
});

test('--only restricts the batch to named ids', async () => {
    const manifestPath = tmpManifestPath();
    const seen = new Set<string>();
    await runBatch(
        makeInputs(3),
        {
            concurrency: 1,
            maxRetries: 0,
            onlyIds: ['job_1'],
            executeJob: async (job) => {
                seen.add(job.id);
                return { outcome: 'completed' as const };
            },
        },
        manifestPath,
    );
    assert.deepEqual([...seen], ['job_1']);
});

test('--fail-fast stops the batch after the first failure', async () => {
    const manifestPath = tmpManifestPath();
    let executions = 0;
    await runBatch(
        makeInputs(4),
        {
            concurrency: 2,
            maxRetries: 0,
            failFast: true,
            executeJob: async (job) => {
                executions += 1;
                await new Promise((r) => setTimeout(r, 5));
                return job.id === 'job_1'
                    ? ({ outcome: 'failed' as const, error: 'stop' } as BatchJobResult)
                    : ({ outcome: 'completed' as const } as BatchJobResult);
            },
        },
        manifestPath,
    );
    assert.ok(executions < 4, 'not every job ran because fail-fast aborted the queue');
});
