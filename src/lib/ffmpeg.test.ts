/**
 * ffmpeg.test.ts — single-runner util contract.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ffmpegPath, ffmpegCanRun, runFfmpegSync, FfmpegError } from './ffmpeg.js';

describe('ffmpeg runner', () => {
    test('ffmpegPath resolves the bundled binary', () => {
        const p = ffmpegPath();
        assert.ok(p && p.length > 0);
        assert.ok(p.includes('ffmpeg'));
    });

    test('ffmpegCanRun executes the binary (real probe)', () => {
        assert.equal(ffmpegCanRun(), true);
    });

    test('runFfmpegSync returns version output', () => {
        const out = runFfmpegSync(['-version']);
        assert.ok(Buffer.isBuffer(out));
        assert.ok(out.toString().includes('ffmpeg'));
    });

    test('invalid args reject with FfmpegError (structured, not swallowed)', async () => {
        await assert.rejects(
            async () => {
                const { runFfmpeg } = await import('./ffmpeg.js');
                await runFfmpeg(['-nonsense-flag-that-fails']);
            },
            (err: unknown) => err instanceof FfmpegError,
        );
    });
});
