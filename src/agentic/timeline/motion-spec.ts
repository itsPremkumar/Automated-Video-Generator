/**
 * motion-spec.ts — ADVANCED: single motion IR for FFmpeg + Remotion.
 *
 * Before: transition/grade strings scattered across ScenePlan, config,
 * style-engine, compose.ts, AgenticVideo.tsx with silent downgrades.
 * Now: one MotionSpec per scene, compiled to either renderer.
 */

export type EaseName = 'linear' | 'easeInOut' | 'easeOut' | 'spring' | 'snap';
export type TransitionName =
    | 'fade'
    | 'slide'
    | 'cut'
    | 'dissolve'
    | 'wipeleft'
    | 'wiperight'
    | 'wipeup'
    | 'wipedown'
    | 'circlecrop'
    | 'radial'
    | 'zoomin'
    | 'zoomout'
    | 'glitch'
    | 'whippan'
    | 'lightleak'
    | 'morphcut';
export type GradeName = 'neutral' | 'warm' | 'cool' | 'cinematic' | 'vivid';

export interface MotionSpec {
    sceneIndex: number;
    transitionIn: TransitionName;
    transitionDurSec: number;
    ease: EaseName;
    zoomFrom: number;
    zoomTo: number;
    panX: number;
    panY: number;
    grade: GradeName;
    kenBurns: boolean;
    shake: number;
    punchIn: boolean;
    speed: number;
}

/** FFmpeg xfade table. Unknown -> fade (documented fallback). */
const XFADE_MAP: Record<string, string> = {
    fade: 'fade',
    dissolve: 'fade',
    slide: 'slideleft',
    wipeleft: 'wipeleft',
    wiperight: 'wiperight',
    wipeup: 'wipeup',
    wipedown: 'wipedown',
    circlecrop: 'circlecrop',
    radial: 'radial',
    zoomin: 'fade',
    zoomout: 'fade',
    glitch: 'fade',
    whippan: 'slideleft',
    lightleak: 'fade',
    morphcut: 'smoothleft',
    cut: 'fade',
};

export function toXfade(name: string): string {
    return XFADE_MAP[name] ?? 'fade';
}

export function easeAt(ease: EaseName, t: number): number {
    const c = Math.max(0, Math.min(1, t));
    if (ease === 'linear') return c;
    if (ease === 'easeOut') return 1 - Math.pow(1 - c, 3);
    if (ease === 'spring')
        return c < 0.7 ? (1 - Math.pow(1 - c / 0.7, 2)) * 1.05 : 1 + Math.sin((c - 0.7) * 20) * 0.02 * (1 - c);
    if (ease === 'snap') return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
    return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2; // easeInOut
}

export function motionSpecFromScene(
    scene: { transition?: string; grade?: string; kenBurns?: boolean; speed?: number },
    beat: { energy: number; cameraMove: string } | null,
    sceneIndex: number,
): MotionSpec {
    const raw = (scene.transition ?? 'fade').toLowerCase();
    const known: TransitionName[] = [
        'fade',
        'slide',
        'cut',
        'dissolve',
        'wipeleft',
        'wiperight',
        'wipeup',
        'wipedown',
        'circlecrop',
        'radial',
        'zoomin',
        'zoomout',
        'glitch',
        'whippan',
        'lightleak',
        'morphcut',
    ];
    const transitionIn = (known.includes(raw as TransitionName) ? raw : 'fade') as TransitionName;
    const gradeRaw = (scene.grade ?? 'cinematic').toLowerCase();
    const grades: GradeName[] = ['neutral', 'warm', 'cool', 'cinematic', 'vivid'];
    const grade = (grades.includes(gradeRaw as GradeName) ? gradeRaw : 'cinematic') as GradeName;
    const energy = beat?.energy ?? 0.5;
    const move = beat?.cameraMove ?? 'kenburns';
    const kenBurns = scene.kenBurns ?? (move === 'kenburns' || move === 'push-in' || move === 'pull-out');
    const zoomFrom = move === 'pull-out' ? 1.15 : 1.0;
    const zoomTo =
        move === 'push-in' || move === 'kenburns' ? (energy >= 0.7 ? 1.18 : 1.1) : move === 'pull-out' ? 1.0 : 1.08;
    return {
        sceneIndex,
        transitionIn,
        transitionDurSec: transitionIn === 'cut' ? 0 : energy >= 0.7 ? 0.35 : 0.5,
        ease: energy >= 0.7 ? 'snap' : energy >= 0.45 ? 'easeInOut' : 'easeOut',
        zoomFrom,
        zoomTo,
        panX: move === 'pan-right' ? 40 : move === 'pan-left' ? -40 : 0,
        panY: 0,
        grade,
        kenBurns,
        shake: energy >= 0.85 ? 0.6 : 0,
        punchIn: energy >= 0.65,
        speed: scene.speed ?? 1,
    };
}

/** Remotion fragment for AgenticVideoAsset. */
export function toRemotionProps(spec: MotionSpec): { transitionIn: 'fade' | 'slide' | 'cut'; grade: GradeName } {
    const t =
        spec.transitionIn === 'slide' || spec.transitionIn === 'whippan'
            ? 'slide'
            : spec.transitionIn === 'cut'
              ? 'cut'
              : 'fade';
    return { transitionIn: t, grade: spec.grade };
}

/** Grade -> ffmpeg eq params (single source of truth). */
export function gradeToEq(grade: GradeName): string {
    if (grade === 'warm') return 'eq=brightness=0.02:saturation=1.25:contrast=1.05';
    if (grade === 'cool') return 'eq=brightness=0.0:saturation=1.05:contrast=1.08';
    if (grade === 'vivid') return 'eq=brightness=0.01:saturation=1.5:contrast=1.12';
    if (grade === 'cinematic') return 'eq=brightness=-0.02:saturation=1.15:contrast=1.12,vignette=PI/4.5';
    return 'eq=brightness=0.0:saturation=1.0:contrast=1.0';
}
