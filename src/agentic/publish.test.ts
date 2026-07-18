import assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { buildPublishManifest, writePublishManifest } from './publish.js';
import type { AgenticConfig } from './config.js';

const tmp = path.join(os.tmpdir(), `pub-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const jobId = 'job_test';

function setupDeliverables(): void {
    fs.mkdirSync(tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, `${jobId}.mp4`), 'x'.repeat(2000));
    fs.writeFileSync(path.join(tmp, `${jobId}_16x9.mp4`), 'x'.repeat(2000));
    fs.writeFileSync(path.join(tmp, `${jobId}.srt`), '1\n00:00:00,000 --> 00:00:01,000\nHi\n');
    fs.writeFileSync(path.join(tmp, `${jobId}.es.srt`), '1\n00:00:00,000 --> 00:00:01,000\nHola\n');
}

const cfg: AgenticConfig = { topic: 't', title: 'My Video' } as AgenticConfig;

test('buildPublishManifest lists all 5 platform targets with correct aspect files', () => {
    setupDeliverables();
    const m = buildPublishManifest({
        jobId, deliverablesDir: tmp, cfg,
        title: 'My Video', description: 'desc', hashtags: '#ai #video', languages: ['es'],
    });
    assert.strictEqual(m.targets.length, 5);
    const yt = m.targets.find((t) => t.platform === 'youtube')!;
    assert.strictEqual(yt.aspect, '16:9');
    assert.ok(yt.file.endsWith('_16x9.mp4'));
    assert.strictEqual(yt.subtitles.length, 2);
    assert.strictEqual(m.youtube?.draft, true);
    assert.ok(m.youtube?.uploadScript);
});

test('writePublishManifest writes a JSON file', () => {
    setupDeliverables();
    writePublishManifest({
        jobId, deliverablesDir: tmp, cfg,
        title: 'My Video', description: 'desc', hashtags: '#ai', languages: [],
    });
    const p = path.join(tmp, `${jobId}_publish-manifest.json`);
    assert.ok(fs.existsSync(p));
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.strictEqual(parsed.jobId, jobId);
    assert.strictEqual(parsed.targets.length, 5);
});

fs.rmSync(tmp, { recursive: true, force: true });
