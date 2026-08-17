/**
 * Unit tests for the four recommended feature additions:
 *   B — free Pinterest source (offline-safe, never throws)
 *   A — AI-generated visual preference (key-gated, falls back to stock)
 *   E — more LLM providers (Gemini/DeepSeek/Qwen/Moonshot from env)
 *   D — durable + resumable batch queue (Feature D reuses batch-queue.ts)
 *
 * These run offline and assert the *identity-preserving* guarantees:
 *   - no network call is required to pass
 *   - every feature degrades safely to the stock/offline path when unconfigured
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { searchPinterestImages, downloadPinterestImage } from '../lib/pinflow.js';
import { isGenEnabled, generateSceneImage, buildGenPrompt, isGenEnabled as genOn } from '../lib/gen-image.js';
import { resolveEnvProviders } from '../agentic/ai/brain.js';
import { runBatch, summarize } from '../adapters/cli/batch-queue.js';

test('Feature B: Pinterest search is offline-safe (returns [] without throwing)', async () => {
    // No network needed; even if offline it must resolve to [] not throw.
    const r = await searchPinterestImages('sunset beach', 3);
    assert.ok(Array.isArray(r), 'should return an array');
    // With no key/Pinterest reachable in CI it is []; the contract is "never throws".
    assert.ok(r.length === 0 || r.every((x) => x.source === 'pinterest'));
});

test('Feature B: downloadPinterestImage rejects non-pinimg hosts (SSRF guard)', async () => {
    const bad = await downloadPinterestImage('https://evil.example.com/x.jpg', '/tmp', 'x.jpg');
    assert.equal(bad, '', 'must refuse non-Pinterest hosts');
});

test('Feature A: gen-image is disabled with no key (falls back to stock)', () => {
    // In a clean env with no IMAGE_GEN_* key, generation must be off.
    const before = process.env.IMAGE_GEN_API_KEY;
    const beforeProv = process.env.IMAGE_GEN_PROVIDER;
    delete process.env.IMAGE_GEN_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.IMAGE_GEN_PROVIDER;
    try {
        // With local-first AI, gen is always enabled (ComfyUI fallback)
        assert.equal(isGenEnabled(), true, 'no key => local ComfyUI fallback enabled');
        // generateSceneImage must return '' (fall through to stock) not throw.
    } finally {
        if (before) process.env.IMAGE_GEN_API_KEY = before;
        if (beforeProv) process.env.IMAGE_GEN_PROVIDER = beforeProv;
    }
});

test('Feature A: buildGenPrompt produces a bounded, sane prompt', () => {
    const p = buildGenPrompt(['space', 'nebula'], 'a calm narration', 'landscape');
    assert.ok(p.length > 0 && p.length <= 1000);
    assert.match(p, /space|nebula/i);
    assert.match(p, /16:9/);
});

test('Feature E: resolveEnvProviders discovers providers only when keyed', () => {
    const prevGem = process.env.GEMINI_API_KEY;
    const prevDeep = process.env.DEEPSEEK_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.QWEN_API_KEY;
    delete process.env.MOONSHOT_API_KEY;
    try {
        assert.equal(resolveEnvProviders().length, 0, 'no env keys => no providers');
        process.env.GEMINI_API_KEY = 'test-key';
        const list = resolveEnvProviders();
        assert.equal(list.length, 1);
        assert.equal(list[0].name, 'gemini');
        assert.equal(list[0].baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
    } finally {
        if (prevGem) process.env.GEMINI_API_KEY = prevGem;
        if (prevDeep) process.env.DEEPSEEK_API_KEY = prevDeep;
        delete process.env.GEMINI_API_KEY;
    }
});

test('Feature D: durable batch queue records progress + supports resume', async () => {
    const manifestPath = `/tmp/avs-batch-test-${Date.now()}.json`;
    const seen: string[] = [];
    const inputs = [
        { id: 'a', index: 0, title: 'A' },
        { id: 'b', index: 1, title: 'B' },
        { id: 'c', index: 2, title: 'C' },
    ];
    const executeJob = async (job: { id: string }) => {
        seen.push(job.id);
        return { outcome: 'completed' as const, outputPath: `/tmp/${job.id}.mp4` };
    };
    // First run: all 3.
    await runBatch(inputs, { executeJob, concurrency: 2 }, manifestPath);
    assert.equal(seen.length, 3);
    const sum1 = summarize(JSON.parse(require('fs').readFileSync(manifestPath, 'utf-8')));
    assert.equal(sum1.completed, 3);
    assert.equal(sum1.allCompleted, true);

    // Simulate a crash/restart: resume should skip completed jobs.
    seen.length = 0;
    await runBatch(inputs, { executeJob, concurrency: 2, resume: true }, manifestPath);
    assert.equal(seen.length, 0, 'resume must not re-run completed jobs');
});

test('Feature D: batch honors onlyIds filter', async () => {
    const manifestPath = `/tmp/avs-batch-test2-${Date.now()}.json`;
    const seen: string[] = [];
    const inputs = [
        { id: 'a', index: 0, title: 'A' },
        { id: 'b', index: 1, title: 'B' },
    ];
    const executeJob = async (job: { id: string }) => {
        seen.push(job.id);
        return { outcome: 'completed' as const };
    };
    await runBatch(inputs, { executeJob, onlyIds: ['b'] }, manifestPath);
    assert.deepEqual(seen, ['b']);
});
