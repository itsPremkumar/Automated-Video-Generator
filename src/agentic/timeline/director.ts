/**
 * director.ts — ADVANCED: deterministic director brain.
 *
 * Turns flat scenes into a directed edit: beat role, energy curve,
 * shot size, camera move, pacing. Heuristic-first (offline, $0);
 * optional LLM hook via injected callback keeps pipeline never-blocked.
 *
 * Beat grammar: hook (scene 0 or picked) -> build -> payoff (last) -> bridge.
 * Energy: 0..1 sine + hook boost + payoff lift, normalized.
 */

export type BeatRole = 'hook' | 'build' | 'payoff' | 'bridge';
export type ShotSize = 'wide' | 'medium' | 'closeup' | 'extreme-closeup';
export type CameraMove = 'static' | 'push-in' | 'pull-out' | 'pan-left' | 'pan-right' | 'kenburns' | 'parallax';

export interface DirectorBeat {
    sceneIndex: number;
    beat: BeatRole;
    energy: number;
    shotSize: ShotSize;
    cameraMove: CameraMove;
    pacingSec: number;
    reasoning: string;
}

export interface DirectorOpts {
    hookFirst?: boolean;
    variablePacing?: boolean;
    /** Optional LLM rerank: (texts) => bestHookIndex */
    llmHook?: (texts: string[]) => Promise<number | null>;
}

const HOOK_RE =
    /\b(did you know|secret|surprising|shock|never|reveal|hidden|myth|trick|insane|unbelievable|fact|stop|warning|mistake)\b/i;
const CALM_RE = /\b(calm|relax|sleep|meditat|peace|gentle|slow|nature|ambient)\b/i;
const ENERGY_RE = /\b(workout|gym|run|fast|insane|epic|battle|win|urgent|now|fire|explode)\b/i;

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function baseEnergy(text: string, i: number, n: number): number {
    let e = 0.5 + 0.25 * Math.sin((i / Math.max(1, n)) * Math.PI * 2);
    if (HOOK_RE.test(text)) e += 0.25;
    if (ENERGY_RE.test(text)) e += 0.2;
    if (CALM_RE.test(text)) e -= 0.2;
    e += clamp(text.split(/\s+/).filter(Boolean).length / 60, 0, 0.15);
    return clamp(e, 0.05, 1);
}

function shotFor(energy: number, i: number): ShotSize {
    if (energy >= 0.8) return i % 2 === 0 ? 'closeup' : 'extreme-closeup';
    if (energy >= 0.6) return 'medium';
    if (energy >= 0.35) return i % 3 === 0 ? 'wide' : 'medium';
    return 'wide';
}

function cameraFor(energy: number, i: number, shot: ShotSize): CameraMove {
    if (shot === 'wide') return i % 2 === 0 ? 'kenburns' : 'parallax';
    if (energy >= 0.75) return i % 2 === 0 ? 'push-in' : 'pan-right';
    if (energy >= 0.5) return i % 2 === 0 ? 'push-in' : 'pan-left';
    if (energy >= 0.3) return 'pull-out';
    return 'static';
}

/** Synchronous deterministic pass (no LLM). */
export function directScenes(texts: string[], opts: DirectorOpts = {}): DirectorBeat[] {
    const n = texts.length;
    if (n === 0) return [];
    // Hook pick: highest hook-score text when hookFirst.
    let hookIdx = 0;
    if (opts.hookFirst !== false) {
        let best = -1;
        texts.forEach((t, i) => {
            let s = 0;
            if (HOOK_RE.test(t)) s += 100;
            s += t.split(/\s+/).filter(Boolean).length;
            if (s > best) {
                best = s;
                hookIdx = i;
            }
        });
    }
    return texts.map((t, i) => {
        const words = t.split(/\s+/).filter(Boolean).length;
        const wordDur = clamp(words / 2.5, 2, 8);
        let beat: BeatRole = 'build';
        if (i === hookIdx) beat = 'hook';
        else if (i === n - 1) beat = 'payoff';
        else if (n > 4 && i % 3 === 2) beat = 'bridge';
        const energy =
            beat === 'hook'
                ? clamp(baseEnergy(t, i, n) + 0.15, 0, 1)
                : beat === 'payoff'
                  ? clamp(baseEnergy(t, i, n) + 0.1, 0, 1)
                  : baseEnergy(t, i, n);
        const shotSize = shotFor(energy, i);
        const cameraMove = cameraFor(energy, i, shotSize);
        let pacingSec: number;
        if (opts.variablePacing === false) pacingSec = 4;
        else if (beat === 'hook') pacingSec = Math.round(clamp(Math.min(3.5, wordDur), 2, 5));
        else if (beat === 'payoff') pacingSec = Math.round(clamp(Math.max(5, wordDur), 3, 8));
        else pacingSec = Math.round(clamp(wordDur + (i % 2 === 1 ? 0.5 : -0.5), 2, 8));
        return {
            sceneIndex: i,
            beat,
            energy: Math.round(energy * 100) / 100,
            shotSize,
            cameraMove,
            pacingSec,
            reasoning: `${beat} e=${energy.toFixed(2)} ${shotSize}/${cameraMove} words=${words}`,
        };
    });
}

/** Async pass: LLM may override hook index, rest stays deterministic. Never throws. */
export async function directScenesAsync(texts: string[], opts: DirectorOpts = {}): Promise<DirectorBeat[]> {
    let beats = directScenes(texts, opts);
    if (opts.llmHook) {
        try {
            const picked = await opts.llmHook(texts);
            if (picked != null && picked >= 0 && picked < texts.length) {
                beats = beats.map((b) => ({ ...b, beat: b.beat === 'hook' ? ('build' as BeatRole) : b.beat }));
                beats[picked] = {
                    ...beats[picked],
                    beat: 'hook',
                    energy: clamp(beats[picked].energy + 0.1, 0, 1),
                    reasoning: beats[picked].reasoning + ' +llm-hook',
                };
            }
        } catch {
            /* heuristic stands */
        }
    }
    return beats;
}

/** Energy curve 0..1 per scene — drives music duck depth, sfx density, grade intensity. */
export function energyCurve(beats: DirectorBeat[]): number[] {
    return beats.map((b) => b.energy);
}

/** Cut density hint: high-energy scenes want shorter holds + punch-ins. */
export function cutHint(beat: DirectorBeat): { maxHoldSec: number; punchIn: boolean; sfx: boolean } {
    return {
        maxHoldSec: beat.energy >= 0.7 ? 3 : beat.energy >= 0.45 ? 4.5 : 6,
        punchIn: beat.energy >= 0.65,
        sfx: beat.energy >= 0.6,
    };
}
