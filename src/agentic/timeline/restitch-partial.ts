/**
 * restitch-partial.ts — ADVANCED: re-render only changed scenes, concat rest.
 *
 * Full re-render on every caption tweak wastes minutes. This planner takes
 * a Timeline + changed scene indices and returns reuse/rerender sets +
 * cut points so the caller can render only dirty segments then concat
 * with the cached per-scene segments.
 *
 * Pure (no ffmpeg) — executor lives in operations/restitch.ts.
 */

export interface RestitchPlan {
    reuse: number[];
    rerender: number[];
    cutPoints: number[];
    estimatedSaving: number;
}

export function planRestitch(totalScenes: number, changed: number[], cutPts: number[]): RestitchPlan {
    const dirty = new Set(changed.filter((i) => i >= 0 && i < totalScenes));
    // Transitions bleed ±1 scene: dirty scene's neighbours need re-xfade.
    // Mark neighbour tails as rerender when crossfade > 0 (conservative).
    const rerenderSet = new Set<number>(dirty);
    for (const d of dirty) {
        if (d - 1 >= 0) rerenderSet.add(d - 1);
        if (d + 1 < totalScenes) rerenderSet.add(d + 1);
    }
    const rerender = [...rerenderSet].sort((a, b) => a - b);
    const reuse = Array.from({ length: totalScenes }, (_, i) => i).filter((i) => !rerenderSet.has(i));
    const estimatedSaving = totalScenes === 0 ? 0 : Math.round((reuse.length / totalScenes) * 100);
    return { reuse, rerender, cutPoints: [...cutPts], estimatedSaving };
}

/** Contiguous ranges from rerender list (for segment renders). */
export function rerenderRanges(rerender: number[]): { from: number; to: number }[] {
    if (rerender.length === 0) return [];
    const sorted = [...rerender].sort((a, b) => a - b);
    const out: { from: number; to: number }[] = [];
    let s = sorted[0];
    let p = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === p + 1) p = sorted[i];
        else {
            out.push({ from: s, to: p });
            s = sorted[i];
            p = sorted[i];
        }
    }
    out.push({ from: s, to: p });
    return out;
}
