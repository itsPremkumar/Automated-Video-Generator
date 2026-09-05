/**
 * integrate.ts — ADVANCED: glue new timeline intelligence into existing pipeline.
 *
 * Additive only: called best-effort from pipeline/render paths inside try/catch.
 * Never throws, never blocks a render when timeline features are unavailable.
 */

import * as path from 'path';
import * as fs from 'fs';
import { compilePlanToTimeline, validateTimeline } from './timeline.js';
import { directScenes } from './director.js';
import { motionSpecFromScene } from './motion-spec.js';
import type { Plan } from '../types.js';

export interface TimelineArtifacts {
    timeline: ReturnType<typeof compilePlanToTimeline>;
    valid: boolean;
    issues: string[];
    beats: ReturnType<typeof directScenes>;
    motions: ReturnType<typeof motionSpecFromScene>[];
}

/** Build timeline + director + motion artifacts from a Plan. Pure, never throws. */
export function buildTimelineArtifacts(
    plan: Plan,
    manifest: { assets: { durationSec?: number; localPath: string; audioPath?: string }[] } | null = null,
    opts: {
        fps?: number;
        width?: number;
        height?: number;
        jCutSec?: number;
        crossfadeSec?: number;
        musicPath?: string | null;
    } = {},
): TimelineArtifacts | null {
    try {
        const timeline = compilePlanToTimeline(plan, manifest, opts);
        const { pass, issues } = validateTimeline(timeline);
        const texts = plan.scenes.map((s) => s.voiceoverText ?? '');
        const beats = directScenes(texts, { hookFirst: true, variablePacing: true });
        const motions = plan.scenes.map((s, i) => motionSpecFromScene(s as never, beats[i] as never, i));
        return { timeline, valid: pass, issues, beats, motions };
    } catch {
        return null;
    }
}

/** Persist timeline.json + director.json next to plan.json (best-effort). */
export function persistTimelineArtifacts(workspaceRoot: string, artifacts: TimelineArtifacts | null): void {
    if (!artifacts) return;
    try {
        fs.mkdirSync(workspaceRoot, { recursive: true });
        fs.writeFileSync(path.join(workspaceRoot, 'timeline.json'), JSON.stringify(artifacts.timeline, null, 2));
        fs.writeFileSync(
            path.join(workspaceRoot, 'director.json'),
            JSON.stringify(
                {
                    beats: artifacts.beats,
                    motions: artifacts.motions,
                    valid: artifacts.valid,
                    issues: artifacts.issues,
                },
                null,
                2,
            ),
        );
    } catch {
        /* ignore — observability only */
    }
}
