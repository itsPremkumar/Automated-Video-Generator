/**
 * overlays.ts — Typography & on-screen overlay configuration.
 *
 * Maps to agentic-scripts.json (all optional, off by default):
 *   lowerThird  → name tag on scene 1 ("John — Expert")
 *   titleCard   → head title card {title, subtitle, durationSec}
 *   endCta      → end-screen call-to-action text
 *   watermark   → logo image pinned bottom-right (file in input/visuals/)
 *   fontFamily / fontColor / fontWeight → text styling
 *   emojiByScene → per-scene emoji/sticker overlay
 *
 * This is a CONFIG LAYER returning a structured OverlayPlan the Remotion
 * composition reads. No rendering happens here; safe to unit test offline.
 */

export interface OverlayPlan {
    lowerThird?: string;
    titleCard?: { title: string; subtitle?: string; durationSec?: number };
    endCta?: string;
    watermark?: string;
    font: { family: string; color: string; weight: number; shadow?: boolean };
    emojiByScene: Record<number, string>;
    /** Animated progress bar (grows left→right over the clip). */
    progressBar?: boolean;
    /** Caption theme preset name (e.g. 'neon', 'softCard'). */
    captionTheme?: string;
}

/**
 * Caption theme presets. Each resolves to a concrete {color, weight, shadow}
 * applied to ALL burned captions (title card, lower-third, CTA, emoji,
 * kinetic). Previously `captionTheme` was declared in jobs/scripts but
 * silently ignored — this makes it real, high-control typography.
 *
 * Color is a raw ffmpeg name ('white','yellow') or 0xRRGGBB hex.
 * `shadow` adds a drop shadow so text survives busy backgrounds.
 */
export const CAPTION_THEMES: Record<string, { color: string; weight: number; shadow: boolean }> = {
    neon:        { color: '0x39ff14', weight: 800, shadow: true }, // electric green
    softCard:    { color: 'white',    weight: 700, shadow: true },
    highContrast: { color: 'yellow',   weight: 800, shadow: true },
    minimal:     { color: 'white',    weight: 400, shadow: false },
    bold:        { color: 'white',    weight: 800, shadow: true },
    default:     { color: 'white',    weight: 700, shadow: false },
};

export function resolveCaptionTheme(name?: string): { color: string; weight: number; shadow: boolean } {
    if (!name) return CAPTION_THEMES.default;
    return CAPTION_THEMES[name.toLowerCase()] ?? CAPTION_THEMES.default;
}

export function buildOverlayPlan(job: {
    lowerThird?: string;
    titleCard?: { title: string; subtitle?: string; durationSec?: number };
    endCta?: string;
    watermark?: string;
    fontFamily?: string;
    fontColor?: string;
    fontWeight?: number;
    emojiByScene?: Record<number, string>;
    progressBar?: boolean;
    captionTheme?: string;
}): OverlayPlan {
    const theme = resolveCaptionTheme(job.captionTheme);
    return {
        lowerThird: job.lowerThird,
        titleCard: job.titleCard,
        endCta: job.endCta,
        watermark: job.watermark,
        font: {
            family: job.fontFamily ?? 'Inter, sans-serif',
            // captionTheme overrides explicit fontColor when set (theme wins)
            color: job.captionTheme ? theme.color : (job.fontColor ?? theme.color),
            weight: job.fontWeight ?? theme.weight,
            shadow: theme.shadow,
        },
        emojiByScene: job.emojiByScene ?? {},
        progressBar: job.progressBar ?? false,
        captionTheme: job.captionTheme,
    };
}

/** Validate a watermark path exists in input/visuals/ (best-effort). */
export function resolveWatermark(watermark: string | undefined, inputDir: string): string | undefined {
    if (!watermark) return undefined;
    const p = `${inputDir}/${watermark}`;
    return require('fs').existsSync(p) ? p : undefined;
}
