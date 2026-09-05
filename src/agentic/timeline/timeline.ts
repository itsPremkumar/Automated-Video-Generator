/**
 * timeline.ts — ADVANCED: true multi-track non-linear timeline IR.
 *
 * Replaces the flat `ScenePlan[]` mental model with a frame-accurate,
 * multi-track edit decision list. Plan stays the authoring view;
 * Timeline is the render view compiled just before compose/render.
 *
 * Tracks: V1 (base visuals) | V2 (b-roll overlay) | A1 (voice) |
 *         A2 (music) | A3 (sfx) | T1 (captions/text) | FX (adjustment)
 *
 * All times in seconds (float). fps + timebase give frame accuracy.
 * Pure functions — no ffmpeg, no network — fully unit-testable.
 */

export type TrackKind = 'video' | 'audio' | 'music' | 'sfx' | 'text' | 'effect';

export interface TimelineClip {
    id: string;
    trackId: string;
    sceneIndex: number;
    /** asset binding (localPath or candidate id). Empty = gap/slug. */
    assetId: string | null;
    localPath: string | null;
    /** timeline placement */
    startSec: number;
    durationSec: number;
    /** source in/out (for trim/speed) */
    inSec: number;
    outSec: number;
    speed: number;
    /** editorial transitions on head/tail */
    transitionIn: string | null;
    transitionOut: string | null;
    transitionDurSec: number;
    volume: number;
    /** true = gap filler (placeholder card / silence) */
    isGap: boolean;
}

export interface TimelineTrack {
    id: string;
    kind: TrackKind;
    name: string;
    muted: boolean;
    locked: boolean;
    clips: TimelineClip[];
}

export interface TimelineMarker {
    tSec: number;
    label: string;
    kind: 'scene' | 'beat' | 'hook' | 'cta';
}

export interface Timeline {
    jobId: string;
    fps: number;
    width: number;
    height: number;
    durationSec: number;
    tracks: TimelineTrack[];
    markers: TimelineMarker[];
    /** provenance: plan revision this timeline was compiled from */
    planRev: number;
}

export interface CompileOpts {
    fps?: number;
    width?: number;
    height?: number;
    jCutSec?: number;
    crossfadeSec?: number;
    broll?: { sceneIndex: number; localPath: string; startSec?: number; durationSec?: number }[];
    musicPath?: string | null;
    sfxByScene?: Record<number, string | null>;
}

function clipId(trackId: string, sceneIndex: number, suffix = ''): string {
    return `${trackId}_s${sceneIndex}${suffix ? '_' + suffix : ''}`;
}

function round3(n: number): number {
    return Math.round(n * 1000) / 1000;
}

/**
 * Compile a Plan (+ optional render manifest durations) into a Timeline.
 * - V1: one clip per scene, back-to-back (minus crossfade overlap).
 * - A1: voice clip per scene; J-cut shifts voice EARLIER by jCutSec (audio leads picture).
 * - A2: single music bed spanning full duration (or gap when no music).
 * - A3: sfx stingers on scene heads where provided.
 * - T1: caption cue per scene.
 * - V2: optional b-roll overlays.
 */
export function compilePlanToTimeline(
    plan: {
        jobId: string;
        scenes: { durationSec: number; voiceoverText?: string }[];
        totalDurationSec: number;
    },
    manifest?: { assets: { durationSec?: number; localPath: string; audioPath?: string }[] } | null,
    opts: CompileOpts = {},
): Timeline {
    const fps = opts.fps ?? 30;
    const scenes = plan.scenes;
    const xf = Math.max(0, Math.min(1.5, opts.crossfadeSec ?? 0.5));
    const jCut = Math.max(0, Math.min(1.5, opts.jCutSec ?? 0));

    // Resolve per-scene display durations: manifest wins, else plan.
    const durs = scenes.map((s, i) => {
        const m = manifest?.assets?.[i]?.durationSec;
        const d = typeof m === 'number' && m > 0 ? m : s.durationSec || 4;
        return round3(Math.max(0.5, Math.min(30, d)));
    });

    // Timeline starts: scene i starts at sum(prev) - xf*i (crossfade overlap).
    const starts: number[] = [];
    let acc = 0;
    for (let i = 0; i < durs.length; i++) {
        starts.push(round3(Math.max(0, acc - xf * i > 0 ? acc - (i === 0 ? 0 : xf) : acc)));
        // recompute acc as end of this clip ignoring overlap for next start
        acc = round3(starts[i] + durs[i]);
        if (i < durs.length - 1) acc = round3(acc); // overlap applied on next iter via -xf
    }
    // Fix: starts computed with single-xf overlap (standard NLE crossfade).
    // Re-derive cleanly:
    let t = 0;
    for (let i = 0; i < durs.length; i++) {
        starts[i] = round3(t);
        t = round3(t + durs[i] - (i < durs.length - 1 ? xf : 0));
    }
    const total = durs.length === 0 ? 0 : round3(starts[durs.length - 1] + durs[durs.length - 1]);

    const v1: TimelineTrack = { id: 'V1', kind: 'video', name: 'Base visuals', muted: false, locked: false, clips: [] };
    const v2: TimelineTrack = {
        id: 'V2',
        kind: 'video',
        name: 'B-roll overlay',
        muted: false,
        locked: false,
        clips: [],
    };
    const a1: TimelineTrack = { id: 'A1', kind: 'audio', name: 'Voiceover', muted: false, locked: false, clips: [] };
    const a2: TimelineTrack = { id: 'A2', kind: 'music', name: 'Music bed', muted: false, locked: false, clips: [] };
    const a3: TimelineTrack = { id: 'A3', kind: 'sfx', name: 'SFX stingers', muted: false, locked: false, clips: [] };
    const t1: TimelineTrack = { id: 'T1', kind: 'text', name: 'Captions', muted: false, locked: false, clips: [] };

    scenes.forEach((s, i) => {
        const localPath = manifest?.assets?.[i]?.localPath ?? null;
        v1.clips.push({
            id: clipId('V1', i),
            trackId: 'V1',
            sceneIndex: i,
            assetId: localPath ? `visual_s${i}` : null,
            localPath,
            startSec: starts[i],
            durationSec: durs[i],
            inSec: 0,
            outSec: durs[i],
            speed: 1,
            transitionIn: i === 0 ? null : 'xfade',
            transitionOut: i === durs.length - 1 ? null : 'xfade',
            transitionDurSec: i === 0 ? 0 : xf,
            volume: 1,
            isGap: !localPath,
        });
        const audioPath = manifest?.assets?.[i]?.audioPath ?? null;
        const voiceStart = round3(Math.max(0, starts[i] - (i === 0 ? 0 : jCut)));
        a1.clips.push({
            id: clipId('A1', i),
            trackId: 'A1',
            sceneIndex: i,
            assetId: audioPath ? `voice_s${i}` : null,
            localPath: audioPath,
            startSec: voiceStart,
            durationSec: durs[i],
            inSec: 0,
            outSec: durs[i],
            speed: 1,
            transitionIn: null,
            transitionOut: null,
            transitionDurSec: 0,
            volume: 1,
            isGap: !audioPath,
        });
        t1.clips.push({
            id: clipId('T1', i),
            trackId: 'T1',
            sceneIndex: i,
            assetId: `caption_s${i}`,
            localPath: null,
            startSec: starts[i],
            durationSec: durs[i],
            inSec: 0,
            outSec: durs[i],
            speed: 1,
            transitionIn: i === 0 ? null : 'xfade',
            transitionOut: null,
            transitionDurSec: i === 0 ? 0 : xf,
            volume: 1,
            isGap: false,
        });
        const sfx = opts.sfxByScene?.[i];
        if (sfx) {
            a3.clips.push({
                id: clipId('A3', i, 'sting'),
                trackId: 'A3',
                sceneIndex: i,
                assetId: `sfx_s${i}`,
                localPath: sfx,
                startSec: starts[i],
                durationSec: 1.2,
                inSec: 0,
                outSec: 1.2,
                speed: 1,
                transitionIn: null,
                transitionOut: null,
                transitionDurSec: 0,
                volume: 0.8,
                isGap: false,
            });
        }
    });

    if (opts.musicPath) {
        a2.clips.push({
            id: 'A2_bed',
            trackId: 'A2',
            sceneIndex: -1,
            assetId: 'music_bed',
            localPath: opts.musicPath,
            startSec: 0,
            durationSec: total,
            inSec: 0,
            outSec: total,
            speed: 1,
            transitionIn: null,
            transitionOut: null,
            transitionDurSec: 0,
            volume: 0.15,
            isGap: false,
        });
    }

    for (const b of opts.broll ?? []) {
        const si = b.sceneIndex;
        if (si < 0 || si >= scenes.length) continue;
        const dur = Math.max(0.5, Math.min(durs[si], b.durationSec ?? Math.min(3, durs[si] / 2)));
        const st = round3(starts[si] + (b.startSec ?? durs[si] / 4));
        v2.clips.push({
            id: clipId('V2', si, 'broll'),
            trackId: 'V2',
            sceneIndex: si,
            assetId: `broll_s${si}`,
            localPath: b.localPath,
            startSec: st,
            durationSec: dur,
            inSec: 0,
            outSec: dur,
            speed: 1,
            transitionIn: 'fade',
            transitionOut: 'fade',
            transitionDurSec: 0.25,
            volume: 1,
            isGap: false,
        });
    }

    const markers: TimelineMarker[] = scenes.map((_, i) => ({
        tSec: starts[i] ?? 0,
        label: i === 0 ? 'hook' : `scene ${i + 1}`,
        kind: i === 0 ? 'hook' : 'scene',
    }));

    // Orientation default 720x1280 portrait unless overridden.
    const width = opts.width ?? 720;
    const height = opts.height ?? 1280;

    return {
        jobId: plan.jobId,
        fps,
        width,
        height,
        durationSec: total,
        tracks: [v1, v2, a1, a2, a3, t1],
        markers,
        planRev: 1,
    };
}

/** Validate timeline: overlaps on same track, out-of-range, A/V drift. */
export function validateTimeline(tl: Timeline): { pass: boolean; issues: string[] } {
    const issues: string[] = [];
    if (tl.durationSec <= 0) issues.push('zero duration');
    if (tl.fps <= 0 || tl.fps > 120) issues.push(`bad fps ${tl.fps}`);
    for (const tr of tl.tracks) {
        const sorted = [...tr.clips].sort((a, b) => a.startSec - b.startSec);
        for (let i = 0; i < sorted.length; i++) {
            const c = sorted[i];
            if (c.durationSec <= 0) issues.push(`${c.id}: non-positive duration`);
            if (c.startSec < 0) issues.push(`${c.id}: negative start`);
            if (c.startSec + c.durationSec > tl.durationSec + 0.05) issues.push(`${c.id}: exceeds timeline`);
            // Audio tracks (voice/music/sfx) are mixed, not exclusive: J-cut leads
            // and bed overlaps are intentional, so only video/text tracks enforce
            // no-overlap. V2 b-roll is overlay by design (always overlaps V1).
            if (i > 0 && (tr.id === 'V1' || tr.id === 'T1')) {
                const prev = sorted[i - 1];
                const prevEnd = prev.startSec + prev.durationSec;
                // Allow crossfade overlap up to transitionDurSec, else flag.
                const allowed = Math.max(prev.transitionDurSec, c.transitionDurSec, 0) + 0.01;
                if (c.startSec < prevEnd - allowed - 0.01)
                    issues.push(`${c.id}: overlaps ${prev.id} by ${(prevEnd - c.startSec).toFixed(2)}s`);
            }
        }
    }
    // A1 vs V1 drift: voice should roughly cover its scene.
    const v1 = tl.tracks.find((x) => x.id === 'V1');
    const a1 = tl.tracks.find((x) => x.id === 'A1');
    if (v1 && a1 && v1.clips.length === a1.clips.length) {
        v1.clips.forEach((v, i) => {
            const a = a1.clips[i];
            if (a && Math.abs(v.durationSec - a.durationSec) > 2.5)
                issues.push(`A/V drift scene ${i}: V=${v.durationSec}s A=${a.durationSec}s`);
        });
    }
    return { pass: issues.length === 0, issues };
}

/** Cut points (scene boundaries) in seconds — for restitch/concat. */
export function cutPoints(tl: Timeline): number[] {
    const v1 = tl.tracks.find((x) => x.id === 'V1');
    if (!v1) return [0, tl.durationSec];
    const pts = v1.clips.map((c) => c.startSec);
    pts.push(tl.durationSec);
    return [...new Set(pts.map((n) => round3(n)))].sort((a, b) => a - b);
}

/** Ripple-delete scene i: remove its clips on all tracks, re-layout gap. */
export function rippleDeleteScene(tl: Timeline, sceneIndex: number): Timeline {
    const next: Timeline = JSON.parse(JSON.stringify(tl));
    const v1 = next.tracks.find((x) => x.id === 'V1');
    const target = v1?.clips.find((c) => c.sceneIndex === sceneIndex);
    if (!target) return next;
    const removedDur = target.durationSec;
    for (const tr of next.tracks) {
        tr.clips = tr.clips.filter((c) => c.sceneIndex !== sceneIndex || (tr.id === 'A2' && c.sceneIndex === -1));
    }
    // Re-layout remaining V1 clips back-to-back with crossfade overlap so the
    // timeline stays valid (old shift-by-gapDur broke on xf-overlapped starts).
    const v1After = next.tracks.find((x) => x.id === 'V1');
    if (v1After) {
        const ordered = [...v1After.clips].sort((a, b) => a.startSec - b.startSec);
        const xf = Math.max(0, ...ordered.map((c) => c.transitionDurSec ?? 0));
        const oldStarts = new Map<number, number>(ordered.map((c) => [c.sceneIndex, c.startSec]));
        let t = 0;
        const newStarts = new Map<number, number>();
        ordered.forEach((c, idx) => {
            newStarts.set(c.sceneIndex, round3(t));
            t = round3(t + c.durationSec - (idx < ordered.length - 1 ? xf : 0));
        });
        const total =
            ordered.length === 0
                ? 0
                : round3(
                      newStarts.get(ordered[ordered.length - 1].sceneIndex)! + ordered[ordered.length - 1].durationSec,
                  );
        for (const tr of next.tracks) {
            for (const c of tr.clips) {
                if (tr.id === 'A2' && c.sceneIndex === -1) {
                    c.durationSec = total;
                    c.outSec = total;
                    continue;
                }
                const ns = newStarts.get(c.sceneIndex);
                const os = oldStarts.get(c.sceneIndex);
                if (ns != null && os != null) c.startSec = round3(c.startSec + (ns - os));
            }
        }
        next.durationSec = total;
        void removedDur;
    } else {
        next.durationSec = round3(Math.max(0, next.durationSec - removedDur));
    }
    // Rebuild markers from new V1 layout.
    if (v1After) {
        const ordered = [...v1After.clips].sort((a, b) => a.startSec - b.startSec);
        next.markers = ordered.map((c, idx) => ({
            tSec: c.startSec,
            label: idx === 0 ? 'hook' : `scene ${idx + 1}`,
            kind: idx === 0 ? ('hook' as const) : ('scene' as const),
        }));
    }
    next.planRev += 1;
    return next;
}

/** Retime scene i to newDur (ripple subsequent clips). */
export function retimeScene(tl: Timeline, sceneIndex: number, newDur: number): Timeline {
    const next: Timeline = JSON.parse(JSON.stringify(tl));
    const clamped = Math.max(0.5, Math.min(30, newDur));
    const v1 = next.tracks.find((x) => x.id === 'V1');
    const target = v1?.clips.find((c) => c.sceneIndex === sceneIndex);
    if (!target) return next;
    const delta = round3(clamped - target.durationSec);
    if (Math.abs(delta) < 1e-6) return next;
    // Subsequent = scenes ordered after target in V1 (not startSec comparison,
    // which breaks under crossfade overlap where next.start < prev.end).
    const ordered = [...(v1?.clips ?? [])].sort((a, b) => a.startSec - b.startSec);
    const pos = ordered.findIndex((c) => c.sceneIndex === sceneIndex);
    const after = new Set(ordered.slice(pos + 1).map((c) => c.sceneIndex));
    for (const tr of next.tracks) {
        for (const c of tr.clips) {
            if (c.sceneIndex === sceneIndex && tr.id !== 'A2') {
                c.durationSec = round3(c.durationSec + delta);
                c.outSec = round3(c.outSec + delta);
            } else if (after.has(c.sceneIndex)) {
                c.startSec = round3(c.startSec + delta);
            }
        }
    }
    const a2 = next.tracks.find((x) => x.id === 'A2');
    if (a2) for (const c of a2.clips) c.durationSec = round3(Math.max(0, next.durationSec + delta));
    next.durationSec = round3(Math.max(0, next.durationSec + delta));
    next.planRev += 1;
    return next;
}
