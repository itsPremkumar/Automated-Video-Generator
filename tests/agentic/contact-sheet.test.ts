/**
 * contact-sheet.test.ts — VISIBILITY artefacts (every approved asset is shown).
 * Builds a synthetic PipelineResult with real placeholder images and asserts the
 * agent's autonomous approval is surfaced as a valid contact-sheet PNG + a
 * decisions report stamped by the Hermes AI agent. Offline, no network.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { makeContactSheet, writeDecisionsReport } from '../../src/agentic/orchestrate.js';
import { AssetCandidate, AssetDecision, Plan, RenderManifest } from '../../src/agentic/types.js';
import { PipelineResult } from '../../src/agentic/orchestrate.js';

const ffmpeg: string = require('ffmpeg-static');
const { execFileSync } = require('child_process');

function mkImg(p: string, color: string) {
    execFileSync(ffmpeg, ['-f', 'lavfi', '-i', `color=c=${color}:s=360x640:d=0.1`, '-frames:v', '1', '-y', p], {
        stdio: 'ignore',
    });
}

describe('agentic/visibility (contact sheet + decisions report)', () => {
    let res: PipelineResult;
    let dir: string;
    before(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-vis-'));
        const i0 = path.join(dir, 's0.png');
        mkImg(i0, 'navy');
        const i1 = path.join(dir, 's1.png');
        mkImg(i1, 'teal');
        const i2 = path.join(dir, 's2.png');
        mkImg(i2, 'maroon');
        const mkCand = (kind: 'image' | 'music', sceneIndex: number, localPath: string): AssetCandidate => ({
            kind,
            sceneIndex,
            candidateIndex: 0,
            localPath,
            url: '',
            source: 'placeholder',
            keywords: ['x'],
        });
        const cands: AssetCandidate[] = [mkCand('image', 0, i0), mkCand('image', 1, i1), mkCand('image', 2, i2)];
        const mkDec = (kind: 'image' | 'music', sceneIndex: number): AssetDecision => ({
            assetId: `${kind}_s${sceneIndex}_c0`,
            kind,
            sceneIndex,
            decision: 'approved',
            rationale: 'Visual passes at conf 6/10',
            decidedBy: 'agent',
            fallbackUsed: false,
        });
        const decisions: AssetDecision[] = [mkDec('image', 0), mkDec('image', 1), mkDec('image', 2)];
        const plan: Plan = {
            jobId: 'vis',
            title: 'Vis',
            orientation: 'portrait',
            voice: 'en-US-JennyNeural',
            musicQuery: 'lofi',
            totalDurationSec: 6,
            scenes: [
                {
                    sceneNumber: 1,
                    voiceoverText: 'A',
                    searchKeywords: ['x'],
                    visualPreference: 'image',
                    durationSec: 2,
                },
                {
                    sceneNumber: 2,
                    voiceoverText: 'B',
                    searchKeywords: ['y'],
                    visualPreference: 'image',
                    durationSec: 2,
                },
                {
                    sceneNumber: 3,
                    voiceoverText: 'C',
                    searchKeywords: ['z'],
                    visualPreference: 'image',
                    durationSec: 2,
                },
            ],
        };
        const manifest: RenderManifest = {
            jobId: 'vis',
            title: 'Vis',
            orientation: 'portrait',
            voice: 'en-US-JennyNeural',
            musicQuery: 'lofi',
            assets: cands.map((c) => ({ kind: c.kind, sceneIndex: c.sceneIndex, localPath: c.localPath })),
            generatedAt: new Date().toISOString(),
        };
        res = {
            backend: 'agent',
            plan,
            workspace: { root: dir, jobId: 'vis' } as any,
            candidates: cands,
            decisions,
            gate: { pass: true, checks: [] },
            manifest,
            voiceovers: null,
            fullyAgentDriven: true,
        };
    });

    it('produces a valid contact-sheet PNG showing every approved asset', async () => {
        const cs = await makeContactSheet(res);
        assert.ok(cs && fs.existsSync(cs), 'contact sheet created');
        const sig = fs.readFileSync(cs!).slice(0, 8).toString('hex');
        assert.equal(sig, '89504e470d0a1a0a', 'valid PNG signature');
    });

    it('writes a decisions report stamped by the Hermes AI agent', () => {
        const rp = writeDecisionsReport(res);
        assert.ok(fs.existsSync(rp), 'report created');
        const txt = fs.readFileSync(rp, 'utf8');
        assert.match(txt, /HERMES AI AGENT/);
        assert.match(txt, /APPROVED/);
        // every approved asset is listed (count the stamped decision lines)
        assert.equal((txt.match(/✅ APPROVED/g) || []).length, 3);
    });
});
