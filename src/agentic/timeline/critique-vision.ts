/**
 * critique-vision.ts — ADVANCED: director-level critique beyond black/freeze/dB.
 *
 * Deterministic + offline. Adds pacing, diversity, energy, caption-safety
 * heuristics on top of existing signal critique. Output shape is compatible
 * with CritiqueSuggestion { scope, issue, severity, fix } so revise.ts can
 * consume it without changes.
 */

export interface VisionSuggestion {
    scope: number | 'global';
    issue: string;
    severity: 'blocker' | 'major' | 'minor';
    fix: Record<string, unknown>;
}

export interface VisionCritiqueInput {
    plan: { scenes: { durationSec: number; voiceoverText?: string; searchKeywords?: string[] }[] };
    timeline?: { durationSec: number } | null;
    signals?: { blackCount?: number; freezeCount?: number; peakDb?: number; width?: number; height?: number } | null;
    hashes?: (string | null)[];
    energies?: number[];
}

export function critiqueVision(input: VisionCritiqueInput): VisionSuggestion[] {
    const out: VisionSuggestion[] = [];
    const scenes = input.plan.scenes;
    if (scenes.length === 0) {
        out.push({ scope: 'global', issue: 'empty plan: no scenes', severity: 'blocker', fix: {} });
        return out;
    }
    // 1. Pacing: flag back-to-back long static scenes (boring) or strobe shorts.
    scenes.forEach((s, i) => {
        if (s.durationSec > 8)
            out.push({
                scope: i,
                issue: `scene ${i + 1} too long (${s.durationSec}s) — split or add b-roll`,
                severity: 'major',
                fix: { maxHoldSec: 5 },
            });
        if (s.durationSec < 1.5)
            out.push({
                scope: i,
                issue: `scene ${i + 1} too short (${s.durationSec}s) — strobe risk`,
                severity: 'minor',
                fix: { minDurationSec: 2 },
            });
        const words = (s.voiceoverText ?? '').split(/\s+/).filter(Boolean).length;
        if (words > 0) {
            const wps = words / Math.max(0.5, s.durationSec);
            if (wps > 4)
                out.push({
                    scope: i,
                    issue: `scene ${i + 1} overstuffed (${wps.toFixed(1)} wps) — trim text or extend to ${Math.ceil(words / 2.5)}s`,
                    severity: 'major',
                    fix: { durationSec: Math.ceil(words / 2.5) },
                });
            if (wps < 0.8)
                out.push({
                    scope: i,
                    issue: `scene ${i + 1} thin narration (${wps.toFixed(1)} wps) — tighten visual hold`,
                    severity: 'minor',
                    fix: {},
                });
        }
    });
    // 2. Diversity: same-hash neighbours = slideshow look.
    const hashes = input.hashes ?? [];
    for (let i = 1; i < hashes.length; i++) {
        if (hashes[i] && hashes[i] === hashes[i - 1])
            out.push({
                scope: i,
                issue: `scene ${i + 1} reuses scene ${i} visual — pick distinct b-roll`,
                severity: 'major',
                fix: { dedupe: true },
            });
    }
    // 3. Energy arc: flat energy = monotonous.
    const energies = input.energies ?? [];
    if (energies.length >= 3) {
        const spread = Math.max(...energies) - Math.min(...energies);
        if (spread < 0.15)
            out.push({
                scope: 'global',
                issue: 'flat energy arc — vary shot size / pacing / music intensity',
                severity: 'minor',
                fix: { variablePacing: true },
            });
    }
    // 4. Caption safety: very long lines risk overflow on 9:16.
    scenes.forEach((s, i) => {
        const longest = Math.max(0, ...(s.voiceoverText ?? '').split('\n').map((l) => l.length));
        if (longest > 90)
            out.push({
                scope: i,
                issue: `scene ${i + 1} caption line too long (${longest} chars) — wrap or shorten`,
                severity: 'minor',
                fix: { captionStyle: 'bottom' },
            });
    });
    // 5. Signal escalations.
    const sig = input.signals ?? {};
    if ((sig.blackCount ?? 0) > 0)
        out.push({
            scope: 'global',
            issue: `black frames detected (${sig.blackCount}) — check placeholder/grade`,
            severity: 'blocker',
            fix: {},
        });
    if ((sig.freezeCount ?? 0) > 2)
        out.push({
            scope: 'global',
            issue: `frozen frames (${sig.freezeCount}) — re-encode source or add motion`,
            severity: 'major',
            fix: { kenBurns: true },
        });
    if (sig.peakDb != null && sig.peakDb > -1)
        out.push({
            scope: 'global',
            issue: `audio hot (peak ${sig.peakDb}dB) — apply loudnorm`,
            severity: 'major',
            fix: { normalize: true },
        });
    if (sig.peakDb != null && sig.peakDb < -30)
        out.push({
            scope: 'global',
            issue: `audio quiet (peak ${sig.peakDb}dB) — raise voice gain`,
            severity: 'major',
            fix: { voiceGainDb: 6 },
        });
    return out;
}

/** Pass/fail summary for gates. Blockers fail. */
export function visionPass(suggestions: VisionSuggestion[]): boolean {
    return !suggestions.some((s) => s.severity === 'blocker');
}
