/**
 * FLUX 3 option — pure decision helpers for the optional video backend.
 *
 * A job opts in via `flux3: "off" | "auto" | "on"` (default off, pipeline
 * untouched) and optionally `flux3Prompts[]` (per-scene prompt overrides).
 * "auto" falls back to the stock visuals stage on any failure; "on" requires
 * FLUX 3 and fails loud. These helpers are pure so the option logic is unit-
 * testable without spawning the bridge.
 */

export type Flux3Mode = 'off' | 'auto' | 'on';

export function flux3Mode(job: any): Flux3Mode {
    return job.flux3 === 'on' || job.flux3 === 'auto' ? job.flux3 : 'off';
}

export function flux3Aspect(orientation?: string): string {
    switch (orientation) {
        case 'portrait': return '9:16';
        case 'square': return '1:1';
        case 'landscape': return '16:9';
        default: return '16:9';
    }
}

export function flux3PromptForScene(
    scene: any,
    prompts: string[],
    sceneIndexZeroBased: number,
    titleFallback: string,
): string {
    const override = prompts[sceneIndexZeroBased];
    if (override && override.trim()) return override.trim();
    const narration = scene?.voiceoverText;
    if (narration && narration.trim()) return narration.trim();
    const keywords = scene?.searchKeywords;
    if (Array.isArray(keywords) && keywords.length > 0) return keywords.join(', ');
    return (titleFallback || '').trim();
}

/** FLUX 3 accepts 5..20s whole seconds; clamp whatever the plan asks for. */
export function flux3Duration(seconds: number): number {
    const n = Number.isFinite(seconds) ? seconds : 8;
    return Math.min(20, Math.max(5, Math.round(n)));
}
