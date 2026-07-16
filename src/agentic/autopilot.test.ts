/**
 * autopilot.test.ts — verifies the self-healing diagnosis logic and the
 * retry/auto-fix loop WITHOUT network or ffmpeg (deterministic, offline).
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { autoRunVideo, autoRunBatch, diagnose, AutoRunEvent } from './autopilot.js';

function ev(msgs: string[]): AutoRunEvent[] {
    return msgs.map((m, i) => ({ t: i, level: 'error', msg: m }));
}

// A PostRenderCheck-like object for the injectable runner.
function check(pass: boolean, ids: string[]): any {
    return {
        path: 'x.mp4',
        pass,
        checks: ids.map((id) => ({ id, label: id, pass, detail: id })),
    };
}

describe('autopilot diagnose', () => {
    test('stale cache / flickr -> clear-stale-video-cache', () => {
        const { fixes } = diagnose(ev(['Found video on flickr', 'assets degraded']));
        assert.ok(fixes.some((f) => f.name === 'clear-stale-video-cache'));
    });
    test('CDN 5xx -> clear-video-cache-and-retry', () => {
        const { fixes } = diagnose(ev(['fetchVisual failed: 503', 'ETIMEDOUT']));
        assert.ok(fixes.some((f) => f.name === 'clear-video-cache-and-retry'));
    });
    test('render failure -> render-soften', () => {
        const { fixes } = diagnose(ev(['ffmpeg failed', 'X8 duration mismatch']));
        assert.ok(fixes.some((f) => f.name === 'render-soften'));
    });
    test('unknown error -> no fix (stops retries)', () => {
        const { fixes } = diagnose(ev(['some totally unrelated crash xyz']));
        assert.equal(fixes.length, 0);
    });
});

describe('autopilot retry loop (offline, injected runner)', () => {
    test('first attempt fails render -> diagnose applies render-soften -> second attempt succeeds', async () => {
        let calls = 0;
        const report = await autoRunVideo(
            { topic: 't', title: 'x', backend: 'agent' },
            {
                maxAttempts: 3,
                runner: async () => {
                    calls++;
                    if (calls === 1) return { out: 'bad.mp4', post: check(false, ['X7', 'X8', 'X9']), gatePass: true };
                    return { out: 'good.mp4', post: check(true, ['X7', 'X8', 'X9']), gatePass: true };
                },
                onEvent: () => {},
            },
        );
        assert.equal(report.success, true);
        assert.equal(report.attempts, 2);
        assert.ok(report.fixesApplied.includes('render-soften'));
        assert.equal(report.outputPath, 'good.mp4');
    });

    test('no known fix -> stops after first attempt, reports failure', async () => {
        const report = await autoRunVideo(
            { topic: 't', title: 'x', backend: 'agent' },
            {
                maxAttempts: 3,
                // Throw an unrelated error (does NOT match any diagnose rule) so
                // the loop must stop after one attempt, not retry.
                runner: async () => { throw new Error('unrelated purple elephant error'); },
                onEvent: () => {},
            },
        );
        assert.equal(report.success, false);
        assert.equal(report.attempts, 1);
        assert.equal(report.fixesApplied.length, 0);
    });

    test('gate fails -> retries with cache clear, then succeeds', async () => {
        let calls = 0;
        const report = await autoRunVideo(
            { topic: 't', title: 'x', backend: 'agent' },
            {
                maxAttempts: 3,
                runner: async () => {
                    calls++;
                    if (calls === 1) return { out: 'x.mp4', post: undefined, gatePass: false };
                    return { out: 'good.mp4', post: check(true, ['X7', 'X8', 'X9']), gatePass: true };
                },
                onEvent: () => {},
            },
        );
        assert.equal(report.success, true);
        assert.equal(report.attempts, 2);
    });
});

describe('autopilot batch (offline, injected runner)', () => {
    test('runs multiple varieties, reports per-item success', async () => {
        const batch = await autoRunBatch(
            [
                { topic: 'lions', videoType: 'nature' as any },
                { topic: 'coffee', videoType: 'tutorial' as any },
                { topic: 'news', videoType: 'news' as any },
            ],
            {
                maxAttempts: 2,
                runner: async () => ({ out: 'ok.mp4', post: check(true, ['X7', 'X8', 'X9']), gatePass: true }),
                onEvent: () => {},
            },
        );
        assert.equal(batch.total, 3);
        assert.equal(batch.succeeded, 3);
        assert.equal(batch.failed, 0);
        assert.equal(batch.items.length, 3);
        assert.ok(batch.items.every((i) => i.success && i.outputPath === 'ok.mp4'));
    });

    test('one bad variety does not kill the batch', async () => {
        let n = 0;
        const batch = await autoRunBatch(
            [
                { topic: 'good', videoType: 'facts' as any },
                { topic: 'bad', videoType: 'story' as any },
            ],
            {
                maxAttempts: 1,
                runner: async () => {
                    n++;
                    // Make the 2nd item always fail post-render (triggers soften, but maxAttempts=1 stops).
                    if (n === 2) return { out: 'bad.mp4', post: check(false, ['X7']), gatePass: true };
                    return { out: 'good.mp4', post: check(true, ['X7', 'X8', 'X9']), gatePass: true };
                },
                onEvent: () => {},
            },
        );
        assert.equal(batch.total, 2);
        assert.equal(batch.succeeded, 1);
        assert.equal(batch.failed, 1);
    });
});
