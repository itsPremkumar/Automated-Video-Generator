/**
 * transitions/effects.ts — Video transition effects.
 *
 * Supports: glitch, light leak, whip pan, zoom blur, slide, fade, etc.
 * Identity-preserving: all effects are ffmpeg-based, no external deps.
 */

export type TransitionEffect = 'none' | 'fade' | 'slide' | 'zoomblur' | 'glitch' | 'lightleak' | 'whippan' | 'dissolve' | 'wipe' | 'push';

export interface TransitionConfig {
    name: string;
    duration: number;  // seconds
    ffmpegFilter: string;
}

export const TRANSITION_EFFECTS: Record<TransitionEffect, TransitionConfig> = {
    none: { name: 'None', duration: 0, ffmpegFilter: '' },
    fade: { name: 'Fade', duration: 1.0, ffmpegFilter: 'fade=t=in:st=0:d=1,fade=t=out:st=9:d=1' },
    slide: { name: 'Slide', duration: 0.5, ffmpegFilter: 'slide=side=left:duration=0.5' },
    zoomblur: { name: 'Zoom Blur', duration: 0.8, ffmpegFilter: 'zoompan=z='min(zoom+0.0015,1.5)':d=1:s=1080x1920:fps=30' },
    glitch: { name: 'Glitch', duration: 0.3, ffmpegFilter: 'noise=alls=20:allf=t+u,eq=brightness=0.1:contrast=1.5' },
    lightleak: { name: 'Light Leak', duration: 1.0, ffmpegFilter: 'colorchannelmixer=rr=1.2:gg=0.9:bb=0.8,eq=brightness=0.1:contrast=1.1' },
    whippan: { name: 'Whip Pan', duration: 0.4, ffmpegFilter: 'minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1' },
    dissolve: { name: 'Dissolve', duration: 1.0, ffmpegFilter: 'xfade=transition=dissolve:duration=1:offset=0' },
    wipe: { name: 'Wipe', duration: 0.5, ffmpegFilter: 'xfade=transition=wipeleft:duration=0.5:offset=0' },
    push: { name: 'Push', duration: 0.5, ffmpegFilter: 'xfade=transition=pushleft:duration=0.5:offset=0' },
};

/** Get transition config */
export function getTransitionConfig(effect: TransitionEffect): TransitionConfig {
    return TRANSITION_EFFECTS[effect] || TRANSITION_EFFECTS.none;
}

/** List all effects */
export function listTransitionEffects(): TransitionEffect[] {
    return Object.keys(TRANSITION_EFFECTS) as TransitionEffect[];
}

/** Generate ffmpeg xfade filter for two clips */
export function generateXfadeFilter(
    effect: TransitionEffect,
    duration: number,
    offset: number,
): string {
    const config = getTransitionConfig(effect);
    if (effect === 'none') return '';

    const transitionMap: Record<string, string> = {
        dissolve: 'dissolve',
        wipe: 'wipeleft',
        push: 'pushleft',
        slide: 'slideleft',
        glitch: 'rectcrop',
        lightleak: 'radial',
        whippan: 'diagtl',
        zoomblur: 'circlecrop',
        fade: 'fade',
    };

    const xfadeName = transitionMap[effect] || 'fade';
    return `xfade=transition=${xfadeName}:duration=${duration}:offset=${offset}`;
}

/** Generate glitch effect filter */
export function generateGlitchFilter(intensity: number = 1.0): string {
    const noise = Math.round(20 * intensity);
    return `noise=alls=${noise}:allf=t+u,eq=brightness=0.05*intensity:contrast=1.2`;
}

/** Generate light leak overlay filter */
export function generateLightLeakFilter(): string {
    return `colorchannelmixer=rr=1.3:gg=0.8:bb=0.7,eq=brightness=0.15:contrast=1.05`;
}

/** Generate whip pan motion blur filter */
export function generateWhipPanFilter(): string {
    return `minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,setpts=0.5*PTS`;
}

/** Generate zoom blur filter */
export function generateZoomBlurFilter(width: number, height: number): string {
    return `zoompan=z='min(zoom+0.002,1.4)':d=1:s=${width}x${height}:fps=30`;
}

/** Generate slide transition filter */
export function generateSlideFilter(direction: 'left' | 'right' | 'up' | 'down' = 'left'): string {
    return `xfade=transition=slide${direction}:duration=0.5:offset=0`;
}

/** Generate fade filter */
export function generateFadeFilter(duration: number = 1.0, startTime: number = 0): string {
    return `fade=t=in:st=${startTime}:d=${duration},fade=t=out:st=${startTime + 5}:d=${duration}`;
}

/** Build complete transition filter chain */
export function buildTransitionChain(
    effect: TransitionEffect,
    clipDuration: number,
    width: number = 1080,
    height: number = 1920,
): string {
    const config = getTransitionConfig(effect);
    if (effect === 'none') return '';

    const filters: string[] = [];

    switch (effect) {
        case 'glitch':
            filters.push(generateGlitchFilter());
            break;
        case 'lightleak':
            filters.push(generateLightLeakFilter());
            break;
        case 'whippan':
            filters.push(generateWhipPanFilter());
            break;
        case 'zoomblur':
            filters.push(generateZoomBlurFilter(width, height));
            break;
        case 'fade':
            filters.push(generateFadeFilter(config.duration));
            break;
        default:
            filters.push(generateXfadeFilter(effect, config.duration, clipDuration - config.duration));
    }

    return filters.filter(Boolean).join(',');
}
