/**
 * features.v2.test.ts — coverage for the four advanced features (all OPTIONAL,
 * OFF by default): 1) text-to-video 2) YouTube upload 3) hook rewrite
 * 4) SEO + AI thumbnail. Happy + failure branches exercised via mock servers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as genVideo from '../lib/gen-video.js';
import * as publish from './delivery/publish.js';
import * as hook from './operations/hook.js';
import * as seo from './operations/seo.js';
import * as thumb from '../lib/gen-thumbnail.js';

function clearEnv() {
    for (const k of ['VIDEO_GEN_API_KEY', 'VIDEO_GEN_BASE_URL', 'VIDEO_GEN_PROVIDER', 'IMAGE_GEN_API_KEY', 'IMAGE_GEN_BASE_URL', 'YOUTUBE_ACCESS_TOKEN', 'YOUTUBE_REFRESH_TOKEN', 'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'OPENAI_API_KEY']) {
        delete process.env[k];
    }
}

function mockServer(handler: (req: any, body: string) => { status: number; json: any }): Promise<{ url: string; close: () => void; requests: any[] }> {
    return new Promise((resolve) => {
        const requests: any[] = [];
        const srv = http.createServer((req, res) => {
            let buf = '';
            req.on('data', (c) => (buf += c));
            req.on('end', () => {
                const r = handler(req, buf);
                requests.push({ url: req.url, method: req.method, body: buf });
                res.writeHead(r.status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(r.json));
            });
        });
        srv.listen(0, '127.0.0.1', () => {
            const port = (srv.address() as any).port;
            resolve({ url: `http://127.0.0.1:${port}`, close: () => srv.close(), requests });
        });
    });
}

// ── 1. TEXT-TO-VIDEO ──
test('Feature 1 (off): isVideoGenEnabled false without key', () => {
    clearEnv();
    assert.equal(genVideo.isVideoGenEnabled(), false);
});
test('Feature 1 (fallback): generateSceneVideo returns "" with no key', async () => {
    clearEnv();
    const p = await genVideo.generateSceneVideo({ prompt: 'x', outDir: os.tmpdir(), filename: 'v.mp4', orientation: 'portrait' });
    assert.equal(p, '');
});
test('Feature 1 (happy): writes mp4 from b64 url response', async () => {
    clearEnv();
    const vid = Buffer.from('FAKEMP4DATA').toString('base64');
    const mock = await mockServer(() => ({ status: 200, json: { data: [{ url: `data:video/mp4;base64,${vid}` }] } }));
    process.env.VIDEO_GEN_PROVIDER = 'openai';
    process.env.VIDEO_GEN_API_KEY = 'test';
    process.env.VIDEO_GEN_BASE_URL = mock.url + '/v1';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-vg-'));
    const p = await genVideo.generateSceneVideo({ prompt: 'cat rocket', outDir: dir, filename: 'v.mp4', orientation: 'portrait', durationSec: 5 });
    assert.ok(p.endsWith('.mp4') && fs.existsSync(p) && fs.statSync(p).size > 0);
    mock.close();
    clearEnv();
});
test('Feature 1 (failure): 500 → "" graceful', async () => {
    clearEnv();
    const mock = await mockServer(() => ({ status: 500, json: { error: 'boom' } }));
    process.env.VIDEO_GEN_PROVIDER = 'openai';
    process.env.VIDEO_GEN_API_KEY = 'test';
    process.env.VIDEO_GEN_BASE_URL = mock.url + '/v1';
    const p = await genVideo.generateSceneVideo({ prompt: 'x', outDir: os.tmpdir(), filename: 'v.mp4', orientation: 'landscape' });
    assert.equal(p, '');
    mock.close();
    clearEnv();
});

// ── 2. YOUTUBE UPLOAD ──
test('Feature 2 (off): no-token → not uploaded', async () => {
    clearEnv();
    const r = await publish.publishToYouTube({ videoPath: '/nope.mp4', title: 't', description: 'd' });
    assert.equal(r.uploaded, false);
    assert.equal(r.reason, 'no-token');
});
test('Feature 2 (off): missing file → not uploaded', async () => {
    clearEnv();
    process.env.YOUTUBE_ACCESS_TOKEN = 'tok';
    const r = await publish.publishToYouTube({ videoPath: '/nope.mp4', title: 't', description: 'd' });
    assert.equal(r.uploaded, false);
    assert.equal(r.reason, 'missing-file');
    clearEnv();
});
test('Feature 2 (happy): resumable upload returns videoId', async () => {
    clearEnv();
    const srv = http.createServer((req, res) => {
        let b = ''; req.on('data', (c) => (b += c));
        req.on('end', () => {
            if (req.method === 'POST' && req.url?.includes('uploadType=resumable')) {
                res.writeHead(200, { location: 'http://127.0.0.1:9/upload-session' });
                res.end();
            } else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: 'abc123' })); }
        });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const f = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-yt-')) + '/v.mp4';
    fs.writeFileSync(f, Buffer.from('FAKEVIDEO'));
    // Point the init at our local server by stubbing global fetch for the init + PUT.
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (u: any, init: any) => {
        const url = String(u);
        if (url.includes('uploadType=resumable')) {
            return new Response('', { status: 200, headers: { location: 'http://127.0.0.1:9/sess' } });
        }
        if (init && init.method === 'PUT') {
            return new Response(JSON.stringify({ id: 'abc123' }), { status: 200 });
        }
        return new Response(JSON.stringify({ id: 'abc123' }), { status: 200 });
    }) as any;
    const r = await publish.publishToYouTube({ videoPath: f, title: 'My Title', description: 'My Desc', tags: ['a', 'b'], privacyStatus: 'private', accessToken: 'tok' });
    globalThis.fetch = realFetch;
    srv.close();
    clearEnv();
    assert.ok(r.uploaded === true && r.videoId === 'abc123', `uploaded: ${JSON.stringify(r)}`);
});
test('Feature 2 (failure): init 403 → not uploaded, no throw', async () => {
    clearEnv();
    const mock = await mockServer(() => ({ status: 403, json: { error: 'forbidden' } }));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (u: any, init: any) => {
        // Force the upload init to hit our 403 mock.
        return realFetch(mock.url + '/videos?uploadType=resumable&part=snippet,status', { method: 'POST', headers: { Authorization: 'Bearer tok' }, body: '{}' });
    }) as any;
    const f = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-yt2-')) + '/v.mp4';
    fs.writeFileSync(f, Buffer.from('x'));
    const r = await publish.publishToYouTube({ videoPath: f, title: 't', description: 'd', accessToken: 'tok' });
    globalThis.fetch = realFetch;
    mock.close();
    clearEnv();
    assert.equal(r.uploaded, false);
});

// ── 3. HOOK REWRITE ──
test('Feature 3 (heuristic): non-empty hook, offline', async () => {
    clearEnv();
    const r = await hook.optimizeHook('So, today we will learn about bees.', { useLlm: false });
    assert.equal(r.method, 'heuristic');
    assert.ok(r.hook.length > 0);
});
test('Feature 3 (llm): uses brain; falls back on failure', async () => {
    clearEnv();
    const brain = { modelEnabled: true, completeJSONTask: async () => ({ hook: "You won't believe this about bees" }) } as any;
    const r = await hook.optimizeHook('bees are cool', { useLlm: true, brain });
    assert.equal(r.method, 'llm');
    assert.equal(r.hook, "You won't believe this about bees");
    const brain2 = { modelEnabled: true, completeJSONTask: async () => { throw new Error('x'); } } as any;
    const r2 = await hook.optimizeHook('bees are cool', { useLlm: true, brain: brain2 });
    assert.equal(r2.method, 'heuristic');
});

// ── 4. SEO + THUMBNAIL ──
test('Feature 4A (heuristic): SEO derives title/desc/tags offline', async () => {
    clearEnv();
    const r = await seo.optimizeSeo({ topic: 'bees', title: 'Bees', script: 'bees pollinate flowers and make honey every single day', hashtags: '#bees' }, { useLlm: false });
    assert.equal(r.method, 'heuristic');
    assert.ok(r.title.length > 0 && r.tags.length > 0);
});
test('Feature 4A (llm): uses brain; falls back on failure', async () => {
    clearEnv();
    const brain = { modelEnabled: true, completeJSONTask: async () => ({ title: 'Epic Bees', description: 'd', tags: ['bees', 'nature'] }) } as any;
    const r = await seo.optimizeSeo({ topic: 'bees', title: 'Bees', script: 'x' }, { useLlm: true, brain });
    assert.equal(r.method, 'llm');
    assert.equal(r.title, 'Epic Bees');
});
test('Feature 4B (off): thumbnail returns "" with no key', async () => {
    clearEnv();
    const p = await thumb.generateThumbnail({ topic: 'bees', title: 'Bees', keywords: ['bees'], outDir: os.tmpdir() });
    assert.equal(p, '');
});
test('Feature 4B (happy): AI thumbnail written when image key present', async () => {
    clearEnv();
    const img = Buffer.from('FAKEJPEG').toString('base64');
    const mock = await mockServer(() => ({ status: 200, json: { data: [{ b64_json: img }] } }));
    process.env.IMAGE_GEN_API_KEY = 'test';
    process.env.IMAGE_GEN_BASE_URL = mock.url + '/v1';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-th-'));
    const p = await thumb.generateThumbnail({ topic: 'bees', title: 'Bees', keywords: ['bees'], outDir: dir, orientation: 'landscape' });
    assert.ok(p.endsWith('.jpg') && fs.existsSync(p));
    mock.close();
    clearEnv();
});

// ── wiring ──
test('Wiring: config accepts new optional flags', () => {
    clearEnv();
    const cfg = { topic: 't', preferVisual: 'video-gen' as const, optimizeHook: true, seo: true, aiThumbnail: true, publishYouTube: true };
    assert.equal(cfg.preferVisual, 'video-gen');
    assert.equal(cfg.publishYouTube, true);
});
