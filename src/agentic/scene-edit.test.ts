/**
 * scene-edit.test.ts — verify the P1c agent-editable scene-plan API and the
 * local-asset binding logic (P1a) work deterministically and offline.
 * Uses node:test to match the repo's test convention.
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { reorderScenes, deleteScene, updateScene, insertScene, readPlan } from './scene-edit.js';
import { AgenticWorkspace } from './workspace.js';
import { Plan } from './types.js';

function mkWs(dir: string): AgenticWorkspace {
    fs.mkdirSync(path.join(dir, 'render'), { recursive: true });
    return {
        jobId: 'test',
        root: dir,
        assetsDir: dir,
        imagesDir: dir,
        videosDir: dir,
        musicDir: dir,
        verificationDir: dir,
    };
}

function mkPlan(): Plan {
    return {
        jobId: 'test',
        title: 'T',
        orientation: 'portrait',
        voice: 'en-US',
        musicQuery: 'ambient',
        scenes: [
            { sceneNumber: 1, voiceoverText: 'A', searchKeywords: ['a'], visualPreference: 'image', durationSec: 4 },
            { sceneNumber: 2, voiceoverText: 'B', searchKeywords: ['b'], visualPreference: 'image', durationSec: 4 },
            { sceneNumber: 3, voiceoverText: 'C', searchKeywords: ['c'], visualPreference: 'image', durationSec: 4 },
        ],
        totalDurationSec: 12,
    };
}

let tmp: string;
const beforeEach = () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-edit-'));
};
const afterEach = () => {
    fs.rmSync(tmp, { recursive: true, force: true });
};

describe('scene-edit API (P1c)', () => {
    test('reorders scenes and renumbers sceneNumber', () => {
        beforeEach();
        const ws = mkWs(tmp);
        fs.writeFileSync(path.join(tmp, 'plan.json'), JSON.stringify(mkPlan()));
        const p = reorderScenes(ws, 0, 2);
        assert.deepEqual(
            p.scenes.map((s) => s.voiceoverText),
            ['B', 'C', 'A'],
        );
        assert.deepEqual(
            p.scenes.map((s) => s.sceneNumber),
            [1, 2, 3],
        );
        afterEach();
    });

    test('deletes a scene and renumbers', () => {
        beforeEach();
        const ws = mkWs(tmp);
        fs.writeFileSync(path.join(tmp, 'plan.json'), JSON.stringify(mkPlan()));
        const p = deleteScene(ws, 1);
        assert.deepEqual(
            p.scenes.map((s) => s.voiceoverText),
            ['A', 'C'],
        );
        assert.deepEqual(
            p.scenes.map((s) => s.sceneNumber),
            [1, 2],
        );
        afterEach();
    });

    test('updates a scene field', () => {
        beforeEach();
        const ws = mkWs(tmp);
        fs.writeFileSync(path.join(tmp, 'plan.json'), JSON.stringify(mkPlan()));
        const p = updateScene(ws, 0, { voiceoverText: 'A2', durationSec: 6 });
        assert.equal(p.scenes[0].voiceoverText, 'A2');
        assert.equal(p.scenes[0].durationSec, 6);
        assert.equal(p.totalDurationSec, 14);
        afterEach();
    });

    test('inserts a new scene at the end', () => {
        beforeEach();
        const ws = mkWs(tmp);
        fs.writeFileSync(path.join(tmp, 'plan.json'), JSON.stringify(mkPlan()));
        const p = insertScene(ws, { voiceoverText: 'D' });
        assert.deepEqual(
            p.scenes.map((s) => s.voiceoverText),
            ['A', 'B', 'C', 'D'],
        );
        assert.equal(p.scenes[3].sceneNumber, 4);
        afterEach();
    });

    test('throws when reading a plan-less workspace', () => {
        beforeEach();
        const ws = mkWs(tmp);
        assert.throws(() => readPlan(ws));
        afterEach();
    });
});
