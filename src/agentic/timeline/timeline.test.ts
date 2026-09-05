import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compilePlanToTimeline, validateTimeline, rippleDeleteScene, retimeScene, cutPoints } from './timeline.js';
import { directScenes, energyCurve, cutHint } from './director.js';
import {
    relevanceScore,
    aestheticScore,
    rankCandidates,
    dedupeAcrossScenes,
    hashDistance,
    faceSafeCropFilter,
} from './visual-intel.js';
import {
    loudnormFilter,
    masterChainFilter,
    snapCutsToBeats,
    duckGainsFromEnergy,
    lufsForPlatform,
    bpmForIntensity,
} from './audio-master.js';
import { motionSpecFromScene, toXfade, easeAt, gradeToEq, toRemotionProps } from './motion-spec.js';
import { critiqueVision, visionPass } from './critique-vision.js';
import { planRestitch, rerenderRanges } from './restitch-partial.js';
import { resolveProxyDims, segmentKey, proxyFfmpegArgs, finalFfmpegArgs } from './proxy.js';
import { buildTimelineArtifacts } from './integrate.js';

const plan = {
    jobId: 'test_job',
    scenes: [
        { durationSec: 4, voiceoverText: 'Did you know octopus has three hearts in the deep ocean' },
        { durationSec: 5, voiceoverText: 'Calm morning routine with gentle breathing and slow tea' },
        { durationSec: 4, voiceoverText: 'Epic workout finale push harder run faster win now' },
    ],
    totalDurationSec: 13,
};

describe('timeline IR', () => {
    it('compiles plan to 6-track timeline with J-cut + crossfade', () => {
        const tl = compilePlanToTimeline(plan as never, null, { jCutSec: 0.4, crossfadeSec: 0.5 });
        assert.equal(tl.tracks.length, 6);
        assert.equal(tl.tracks[0].clips.length, 3);
        assert.ok(tl.durationSec > 11 && tl.durationSec < 13);
        const a1 = tl.tracks.find((t) => t.id === 'A1')!;
        assert.ok(a1.clips[1].startSec < tl.tracks[0].clips[1].startSec);
        assert.ok(validateTimeline(tl).pass);
    });
    it('cutPoints / rippleDelete / retime keep timeline consistent', () => {
        const tl = compilePlanToTimeline(plan as never);
        assert.deepEqual(cutPoints(tl).length, 4);
        const del = rippleDeleteScene(tl, 1);
        assert.equal(del.tracks[0].clips.length, 2);
        assert.ok(del.durationSec < tl.durationSec);
        assert.ok(validateTimeline(del).pass);
        const ret = retimeScene(tl, 0, 6);
        assert.ok(ret.durationSec > tl.durationSec);
        assert.ok(validateTimeline(ret).pass);
    });
});

describe('director', () => {
    it('picks hook/build/payoff with energy + camera', () => {
        const beats = directScenes(plan.scenes.map((s) => s.voiceoverText));
        assert.equal(beats.length, 3);
        assert.ok(beats.some((b) => b.beat === 'hook'));
        assert.equal(beats[beats.length - 1].beat === 'payoff' || beats[beats.length - 1].beat === 'hook', true);
        assert.ok(beats.every((b) => b.energy >= 0 && b.energy <= 1));
        assert.deepEqual(energyCurve(beats).length, 3);
        assert.ok(cutHint(beats[0]).maxHoldSec > 0);
    });
});

describe('visual-intel', () => {
    it('scores relevance/aesthetic and dedupes', () => {
        assert.ok(
            relevanceScore(['octopus', 'ocean'], ['octopus deep ocean']) > relevanceScore(['octopus'], ['city car']),
        );
        assert.ok(aestheticScore(1920, 1080, 500000) > aestheticScore(320, 240, 5000));
        assert.equal(hashDistance('abcd', 'abcd'), 0);
        assert.ok(faceSafeCropFilter(1920, 1080, 720, 1280).includes('crop='));
        const r = rankCandidates(
            ['octopus ocean'],
            [
                { id: 'a', sceneIndex: 0, keywords: ['octopus ocean'] },
                { id: 'b', sceneIndex: 0, keywords: ['city car'] },
            ],
        );
        assert.equal(r[0].id, 'a');
        const picks = dedupeAcrossScenes([
            [
                {
                    id: 'a',
                    sceneIndex: 0,
                    keywords: [],
                    relevance: 9,
                    aesthetic: 8,
                    hash: 'aaaaaaaaaaaaaaaa',
                    total: 9,
                } as never,
            ],
            [
                {
                    id: 'b',
                    sceneIndex: 1,
                    keywords: [],
                    relevance: 9,
                    aesthetic: 8,
                    hash: 'aaaaaaaaaaaaaaaa',
                    total: 9,
                } as never,
                {
                    id: 'c',
                    sceneIndex: 1,
                    keywords: [],
                    relevance: 7,
                    aesthetic: 7,
                    hash: 'bbbbbbbbbbbbbbbb',
                    total: 7,
                } as never,
            ],
        ]);
        assert.equal(picks[1]?.id, 'c');
    });
});

describe('audio-master', () => {
    it('builds loudnorm + sidechain + beat snap', () => {
        assert.ok(loudnormFilter().includes('loudnorm'));
        assert.ok(masterChainFilter().includes('sidechaincompress'));
        assert.deepEqual(snapCutsToBeats([0, 4.07, 8.02, 12], 120).length, 4);
        assert.equal(duckGainsFromEnergy([0.2, 0.8]).length, 2);
        assert.equal(lufsForPlatform('youtube'), -14);
        assert.equal(bpmForIntensity('calm'), 80);
    });
});

describe('motion-spec', () => {
    it('maps scene+beat to unified spec with fallbacks', () => {
        const spec = motionSpecFromScene(
            { transition: 'whippan', grade: 'cinematic' },
            { energy: 0.9, cameraMove: 'push-in' } as never,
            0,
        );
        assert.equal(spec.transitionIn, 'whippan');
        assert.equal(toXfade('whippan'), 'slideleft');
        assert.equal(toXfade('nope'), 'fade');
        assert.ok(easeAt('easeInOut', 0.5) > 0.4 && easeAt('easeInOut', 0.5) < 0.6);
        assert.ok(gradeToEq('cinematic').includes('vignette'));
        assert.equal(toRemotionProps(spec).transitionIn, 'slide');
    });
});

describe('critique-vision + restitch + proxy + integrate', () => {
    it('flags pacing/duplicates/audio and plans partial restitch', () => {
        const sug = critiqueVision({
            plan: plan as never,
            hashes: ['a', 'a', 'b'],
            energies: [0.5, 0.52, 0.51],
            signals: { blackCount: 0, peakDb: -8 },
        });
        assert.ok(sug.some((s) => /reuses/.test(s.issue)));
        assert.ok(sug.some((s) => /flat energy/.test(s.issue)));
        assert.equal(visionPass(sug), true);
        const blockers = critiqueVision({ plan: { scenes: [] } });
        assert.equal(visionPass(blockers), false);
        const rp = planRestitch(5, [2], [0, 4, 8, 12, 16, 20]);
        assert.ok(rp.rerender.includes(2));
        assert.ok(rp.estimatedSaving >= 0);
        assert.ok(rerenderRanges(rp.rerender).length >= 1);
        assert.deepEqual(resolveProxyDims(720, 1280), { w: 360, h: 640 });
        assert.equal(segmentKey({ a: 1 }).length, 16);
        assert.ok(proxyFfmpegArgs().length > 0 && finalFfmpegArgs().length > 0);
        const art = buildTimelineArtifacts(plan as never, null, {});
        assert.ok(art && art.timeline.tracks.length === 6 && art.beats.length === 3 && art.motions.length === 3);
    });
});
