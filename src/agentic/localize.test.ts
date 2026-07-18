import assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { localizeSrtSidecars } from './localize.js';
import { AgentBrain } from './brain.js';

const tmp = path.join(os.tmpdir(), `loc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
fs.mkdirSync(tmp, { recursive: true });

const NATIVE = `1
00:00:00,000 --> 00:00:02,000
Hello world

2
00:00:02,000 --> 00:00:04,000
This is a test
`;

test('offline (no model): sidecar emitted untranslated for each language', async () => {
    fs.mkdirSync(tmp, { recursive: true });
    const src = path.join(tmp, 'job_native.srt');
    fs.writeFileSync(src, NATIVE);
    const brain = new AgentBrain(); // no model configured -> offline
    const out = await localizeSrtSidecars({
        srcSrtPath: src,
        outDir: tmp,
        baseName: 'job',
        languages: ['es', 'fr'],
        brain,
    });
    assert.strictEqual(out.length, 2);
    const es = fs.readFileSync(path.join(tmp, 'job.es.srt'), 'utf8');
    const fr = fs.readFileSync(path.join(tmp, 'job.fr.srt'), 'utf8');
    // timing preserved
    assert.ok(es.includes('00:00:02,000 --> 00:00:04,000'));
    // text unchanged (offline fallback)
    assert.ok(es.includes('Hello world'));
    assert.ok(fr.includes('This is a test'));
});

test('returns empty when no languages or missing src', async () => {
    const brain = new AgentBrain();
    assert.deepStrictEqual(await localizeSrtSidecars({
        srcSrtPath: path.join(tmp, 'missing.srt'), outDir: tmp, baseName: 'job', languages: ['es'], brain,
    }), []);
    assert.deepStrictEqual(await localizeSrtSidecars({
        srcSrtPath: path.join(tmp, 'job_native.srt'), outDir: tmp, baseName: 'job', languages: [], brain,
    }), []);
});

fs.rmSync(tmp, { recursive: true, force: true });
