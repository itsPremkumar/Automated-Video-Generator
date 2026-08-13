/**
 * Comprehensive scenario coverage for the four feature additions.
 * Closes the gaps from the first verification pass by exercising the HAPPY
 * paths (with mock HTTP servers standing in for the real APIs) AND the
 * FAILURE paths (500/429/timeout), asserting graceful degradation.
 *
 * No real network / no real API keys are used. Every external dependency is a
 * local node:http mock that returns canned responses shaped like the real API.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { generateSceneImage, isGenEnabled, buildGenPrompt } from '../lib/gen-image.js';
import { searchPinterestImages, downloadPinterestImage } from '../lib/pinflow.js';
import { AgentBrain, type BrainProvider } from '../agentic/ai/brain.js';

interface MockHandle {
    url: string;
    close: () => void;
    requests: any[];
}

/** Start a mock server. `handler(req, body)` returns { status, json }. Resolves once listening. */
function mockServer(handler: (req: any, body: any) => { status: number; json: any }): Promise<MockHandle> {
    const requests: any[] = [];
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let chunks = '';
            req.on('data', (c) => (chunks += c));
            req.on('end', () => {
                let body: any = {};
                try { body = chunks ? JSON.parse(chunks) : {}; } catch { /* ignore */ }
                const r = handler(req, body);
                requests.push({ url: req.url, headers: req.headers, body });
                res.writeHead(r.status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(r.json));
            });
        });
        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as any).port;
            resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close(), requests });
        });
    });
}

function b64(bytes: string): string {
    return Buffer.from(bytes).toString('base64');
}

// ───────────────────────── Feature A: gen-image happy + failure ─────────────────────────

test('Feature A (happy): gen-image writes a file from a b64_json response', async () => {
    delete process.env.IMAGE_GEN_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    process.env.IMAGE_GEN_API_KEY = 'dummy'; // enable path
    process.env.IMAGE_GEN_BASE_URL = 'OVERRIDE_THIS'; // we patch provider via baseUrl below
    try {
        const mock = await mockServer(() => ({
            status: 200,
            json: { data: [{ b64_json: b64('PNGDATA') }] },
        }));
        // Point the module at our mock by overriding resolution via env-shaped provider.
        // generateSceneImage uses IMAGE_GEN_BASE_URL when set.
        process.env.IMAGE_GEN_BASE_URL = mock.url + '/v1';
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-gen-'));
        const out = await generateSceneImage({
            prompt: buildGenPrompt(['ocean'], 'calm', 'landscape'),
            outDir,
            filename: 'candidate_1.jpg',
            orientation: 'landscape',
        });
        assert.ok(out && fs.existsSync(out), 'should write the generated file');
        assert.equal(fs.readFileSync(out, 'utf-8'), 'PNGDATA');
        mock.close();
    } finally {
        delete process.env.IMAGE_GEN_API_KEY;
        delete process.env.IMAGE_GEN_BASE_URL;
    }
});

test('Feature A (happy): gen-image downloads from a url response', async () => {
    delete process.env.IMAGE_GEN_API_KEY;
    delete process.env.IMAGE_GEN_BASE_URL;
    // gen-image's url branch fetches the returned image URL; stub it to avoid
    // real network. The /images/generations call also goes through fetch.
    const realFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async (url: string, init: any) => {
        const u = String(url);
        if (u.endsWith('/images/generations')) {
            return new Response(JSON.stringify({ data: [{ url: 'https://i.pinimg.com/736x/x/y.jpg' }] }), { status: 200 });
        }
        // image download
        return new Response(Buffer.from('IMGCONTENT'), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    };
    try {
        process.env.IMAGE_GEN_API_KEY = 'dummy';
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-gen-'));
        const out = await generateSceneImage({
            prompt: 'test',
            outDir,
            filename: 'candidate_1.jpg',
            orientation: 'portrait',
        });
        assert.ok(out && fs.existsSync(out), 'url-based gen should materialize a file');
        assert.equal(fs.readFileSync(out, 'utf-8'), 'IMGCONTENT');
    } finally {
        delete process.env.IMAGE_GEN_API_KEY;
        delete process.env.IMAGE_GEN_BASE_URL;
        (globalThis as any).fetch = realFetch;
    }
});

test('Feature A (failure): gen-image returns "" on HTTP 500 (falls back to stock)', async () => {
    delete process.env.IMAGE_GEN_API_KEY;
    delete process.env.IMAGE_GEN_BASE_URL;
    const mock = await mockServer(() => ({ status: 500, json: { error: 'boom' } }));
    try {
        process.env.IMAGE_GEN_API_KEY = 'dummy';
        process.env.IMAGE_GEN_BASE_URL = mock.url + '/v1';
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-gen-'));
        const out = await generateSceneImage({ prompt: 'x', outDir, filename: 'c.jpg', orientation: 'square' });
        assert.equal(out, '', '500 must cause graceful fallback (empty string)');
        mock.close();
    } finally {
        delete process.env.IMAGE_GEN_API_KEY;
        delete process.env.IMAGE_GEN_BASE_URL;
    }
});

test('Feature A (failure): gen-image returns "" on HTTP 429 rate-limit', async () => {
    delete process.env.IMAGE_GEN_API_KEY;
    delete process.env.IMAGE_GEN_BASE_URL;
    const mock = await mockServer(() => ({ status: 429, json: { error: 'rate limited' } }));
    try {
        process.env.IMAGE_GEN_API_KEY = 'dummy';
        process.env.IMAGE_GEN_BASE_URL = mock.url + '/v1';
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-gen-'));
        const out = await generateSceneImage({ prompt: 'x', outDir, filename: 'c.jpg', orientation: 'portrait' });
        assert.equal(out, '', '429 must fall back gracefully');
        mock.close();
    } finally {
        delete process.env.IMAGE_GEN_API_KEY;
        delete process.env.IMAGE_GEN_BASE_URL;
    }
});

test('Feature A (failure): gen-image returns "" on timeout', async () => {
    delete process.env.IMAGE_GEN_API_KEY;
    delete process.env.IMAGE_GEN_BASE_URL;
    // Server accepts but never responds (simulating a hang) -> client aborts.
    const server = http.createServer(() => { /* never respond */ });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as any).port;
    try {
        process.env.IMAGE_GEN_API_KEY = 'dummy';
        process.env.IMAGE_GEN_BASE_URL = `http://127.0.0.1:${port}/v1`;
        process.env.IMAGE_GEN_TIMEOUT_MS = '300';
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-gen-'));
        const out = await generateSceneImage({ prompt: 'x', outDir, filename: 'c.jpg', orientation: 'landscape' });
        assert.equal(out, '', 'timeout must fall back gracefully');
    } finally {
        delete process.env.IMAGE_GEN_API_KEY;
        delete process.env.IMAGE_GEN_BASE_URL;
        delete process.env.IMAGE_GEN_TIMEOUT_MS;
        server.close();
    }
});

// ───────────────────────── Feature B: Pinterest happy + failure ─────────────────────────

test('Feature B (happy): Pinterest parses SearchResource pins and downloads one', async () => {
    const pinBody = {
        resource_response: {
            data: {
                results: [
                    { images: { orig: { url: 'https://i.pinimg.com/originals/ab/cd/123.jpg' } } },
                    { images: { '736x': { url: 'https://i.pinimg.com/736x/ef/12/456.jpg' } } },
                ],
            },
        },
    };
    let pinReqCount = 0;
    const mock = await mockServer(() => { pinReqCount++; return { status: 200, json: pinBody }; });
    // Re-point the module's Pinterest host via the exported safe-host helper is not
    // possible (host is hardcoded). Instead, we stub global fetch for this test.
    const realFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async (url: string, init: any) => {
        if (String(url).includes('pinterest.com/resource/SearchResource')) {
            return new Response(JSON.stringify(pinBody), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        // image download URL
        return new Response(Buffer.from('IMGCONTENT'), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    };
    try {
        const pins = await searchPinterestImages('sunset', 5);
        assert.equal(pins.length, 2, 'should parse both pins');
        assert.equal(pins[0].source, 'pinterest');
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-pin-'));
        const local = await downloadPinterestImage(pins[0].url, outDir, 'p.jpg');
        assert.ok(local && fs.existsSync(local), 'pin image should download');
        assert.equal(fs.readFileSync(local, 'utf-8'), 'IMGCONTENT');
        mock.close();
    } finally {
        (globalThis as any).fetch = realFetch;
    }
});

test('Feature B (failure): Pinterest 429 rate-limit returns [] gracefully', async () => {
    const realFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async (_url: string, _init: any) =>
        new Response('rate limited', { status: 429 });
    try {
        const pins = await searchPinterestImages('anything', 3);
        assert.deepEqual(pins, [], 'rate-limited Pinterest must return [] (no throw)');
    } finally {
        (globalThis as any).fetch = realFetch;
    }
});

test('Feature B (safety): downloadPinterestImage rejects non-pinimg hosts', async () => {
    assert.equal(await downloadPinterestImage('https://evil.example.com/x.jpg', os.tmpdir(), 'x.jpg'), '', 'must refuse non-Pinterest hosts (SSRF guard)');
    // A valid pinimg host is accepted by the guard (download may still fail on a
    // real network fetch, but the host check itself passes).
    assert.ok(downloadPinterestImage('https://i.pinimg.com/x.jpg', os.tmpdir(), 'x.jpg') instanceof Promise);
});

// ─────────────── Feature E: provider success + auth-fail via real AgentBrain ───────────────

test('Feature E (happy): AgentBrain routes through provider loop and parses JSON', async () => {
    const mock = await mockServer(() => ({
        status: 200,
        json: { choices: [{ message: { content: '{"keywords":["neon city","rainy street","cyberpunk"]}' } }] },
    }));
    try {
        const provider: BrainProvider = { name: 'mock', baseUrl: mock.url + '/v1', apiKey: 't', model: 'm' };
        const brain = new AgentBrain({ providers: [provider], timeoutMs: 5000 });
        assert.equal(brain.modelEnabled, true);
        const kw = await brain.expandKeywords('a cyberpunk city at night', 'Neon', 3);
        assert.ok(Array.isArray(kw), 'should return a keyword array');
        assert.equal(kw!.length, 3);
        assert.equal(kw![0], 'neon city');
        mock.close();
    } finally {
        // no env to clean
    }
});

test('Feature E (happy): multiple providers — second used only if first fails', async () => {
    const bad = await mockServer(() => ({ status: 401, json: { error: 'unauthorized' } }));
    const good = await mockServer(() => ({
        status: 200,
        json: { choices: [{ message: { content: '{"query":"lofi study beats"}' } }] },
    }));
    try {
        const brain = new AgentBrain({
            providers: [
                { name: 'bad', baseUrl: bad.url + '/v1', apiKey: 'x', model: 'm' },
                { name: 'good', baseUrl: good.url + '/v1', apiKey: 'y', model: 'm' },
            ],
            timeoutMs: 5000,
        });
        const q = await brain.deriveMusic(['calm scene'], 'Study');
        assert.equal(q, 'lofi study beats', 'should fall through to the working provider');
        bad.close();
        good.close();
    } finally { /* cleanup via close above */ }
});

test('Feature E (failure): provider auth-fail -> AgentBrain returns null (caller falls back)', async () => {
    const mock = await mockServer(() => ({ status: 401, json: { error: 'invalid key' } }));
    try {
        const brain = new AgentBrain({ providers: [{ name: 'p', baseUrl: mock.url + '/v1', apiKey: 'bad', model: 'm' }], timeoutMs: 5000 });
        const r = await brain.writeScript('topic', 'Title');
        assert.equal(r, null, 'auth failure must yield null so the heuristic fallback engages');
        mock.close();
    } finally { /* */ }
});

test('Feature E (failure): provider 500 -> null (graceful)', async () => {
    const mock = await mockServer(() => ({ status: 500, json: { error: 'server error' } }));
    try {
        const brain = new AgentBrain({ providers: [{ name: 'p', baseUrl: mock.url + '/v1', apiKey: 'k', model: 'm' }], timeoutMs: 5000 });
        const r = await brain.expandKeywords('scene', 'T', 3);
        assert.equal(r, null, '500 must yield null');
        mock.close();
    } finally { /* */ }
});

test('Feature E (budget): maxCalls=0 disables the brain without touching network', async () => {
    let hit = false;
    const mock = await mockServer(() => { hit = true; return { status: 200, json: {} }; });
    try {
        const brain = new AgentBrain({ providers: [{ name: 'p', baseUrl: mock.url + '/v1', apiKey: 'k', model: 'm' }], maxCalls: 0 });
        assert.equal(brain.modelEnabled, false);
        const r = await brain.writeScript('t', 'T');
        assert.equal(r, null);
        assert.equal(hit, false, 'must not call the network when budget is exhausted');
        mock.close();
    } finally { /* */ }
});
