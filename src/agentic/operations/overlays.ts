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
    font: { family: string; color: string; weight: number };
    emojiByScene: Record<number, string>;
    /** Animated progress bar (grows left→right over the clip). */
    progressBar?: boolean;
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
}): OverlayPlan {
    return {
        lowerThird: job.lowerThird,
        titleCard: job.titleCard,
        endCta: job.endCta,
        watermark: job.watermark,
        font: {
            family: job.fontFamily ?? 'Inter, sans-serif',
            color: job.fontColor ?? 'white',
            weight: job.fontWeight ?? 700,
        },
        emojiByScene: job.emojiByScene ?? {},
        progressBar: job.progressBar ?? false,
    };
}

/** Validate a watermark path exists in input/visuals/ (best-effort). */
export function resolveWatermark(watermark: string | undefined, inputDir: string): string | undefined {
    if (!watermark) return undefined;
    const p = `${inputDir}/${watermark}`;
    return require('fs').existsSync(p) ? p : undefined;
}
