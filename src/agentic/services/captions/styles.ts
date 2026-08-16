/**
 * captions/styles.ts — Dynamic caption style presets.
 *
 * Supports multiple caption styles: typewriter, lower-third, karaoke, etc.
 * Identity-preserving: all styles are built-in, no external deps.
 */

export type CaptionStyle = 'basic' | 'typewriter' | 'lowerthird' | 'karaoke' | 'minimal' | 'bold' | 'neon' | 'softCard';

export interface CaptionStyleConfig {
    name: string;
    font?: string;
    fontSize?: number;
    color?: string;
    strokeColor?: string;
    strokeWidth?: number;
    backgroundColor?: string;
    position?: 'top' | 'center' | 'bottom' | 'custom';
    positionY?: number;
    padding?: number;
    borderRadius?: number;
    animation?: 'none' | 'typewriter' | 'fade' | 'slide' | 'pop';
    align?: 'left' | 'center' | 'right';
    maxWidth?: number;
}

export const CAPTION_STYLES: Record<CaptionStyle, CaptionStyleConfig> = {
    basic: {
        name: 'Basic',
        fontSize: 48,
        color: 'white',
        strokeColor: 'black',
        strokeWidth: 2,
        position: 'bottom',
        animation: 'none',
        align: 'center',
    },
    typewriter: {
        name: 'Typewriter',
        fontSize: 48,
        color: 'white',
        strokeColor: 'black',
        strokeWidth: 2,
        position: 'bottom',
        animation: 'typewriter',
        align: 'center',
    },
    lowerthird: {
        name: 'Lower Third',
        fontSize: 36,
        color: 'white',
        backgroundColor: 'rgba(0,0,0,0.7)',
        position: 'bottom',
        padding: 20,
        borderRadius: 8,
        animation: 'slide',
        align: 'left',
        maxWidth: 80,
    },
    karaoke: {
        name: 'Karaoke',
        fontSize: 52,
        color: '#888888',
        strokeColor: 'white',
        strokeWidth: 3,
        position: 'bottom',
        animation: 'none',
        align: 'center',
    },
    minimal: {
        name: 'Minimal',
        fontSize: 42,
        color: 'white',
        strokeColor: 'rgba(0,0,0,0.5)',
        strokeWidth: 1,
        position: 'bottom',
        animation: 'fade',
        align: 'center',
    },
    bold: {
        name: 'Bold',
        fontSize: 56,
        color: 'white',
        strokeColor: 'black',
        strokeWidth: 3,
        position: 'bottom',
        animation: 'pop',
        align: 'center',
    },
    neon: {
        name: 'Neon',
        fontSize: 48,
        color: '#00ffff',
        strokeColor: '#0066ff',
        strokeWidth: 2,
        position: 'bottom',
        animation: 'none',
        align: 'center',
    },
    softCard: {
        name: 'Soft Card',
        fontSize: 44,
        color: 'white',
        backgroundColor: 'rgba(0,0,0,0.5)',
        position: 'bottom',
        padding: 16,
        borderRadius: 12,
        animation: 'fade',
        align: 'center',
        maxWidth: 85,
    },
};

/** Get style config */
export function getCaptionStyle(style: CaptionStyle): CaptionStyleConfig {
    return CAPTION_STYLES[style] || CAPTION_STYLES.basic;
}

/** List all available styles */
export function listCaptionStyles(): CaptionStyle[] {
    return Object.keys(CAPTION_STYLES) as CaptionStyle[];
}

/** Generate ASS subtitle style string */
export function generateAssStyle(style: CaptionStyle, width: number = 1080, height: number = 1920): string {
    const config = getCaptionStyle(style);
    const align = config.align === 'left' ? 1 : config.align === 'right' ? 3 : 2;
    const marginV = config.position === 'top' ? 60 : config.position === 'center' ? height / 2 : height - 120;

    return `[Script Info]
Title: ${config.name} Style
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Default,${config.font || 'Arial'},${config.fontSize || 48},&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,${config.strokeWidth || 2},0,${align},100,100,${marginV}
`;
}

/** Generate ffmpeg drawtext filter string */
export function generateDrawtextFilter(
    style: CaptionStyle,
    text: string,
    width: number = 1080,
    height: number = 1920,
): string {
    const config = getCaptionStyle(style);
    const x = config.align === 'left' ? '(w-text_w)/20' : config.align === 'right' ? '(w-text_w)*19/20' : '(w-text_w)/2';
    const y = config.position === 'top' ? '80' : config.position === 'center' ? '(h-text_h)/2' : 'h-th-100';

    const fontcolor = (config.color || 'white').replace('#', '&H00');
    const bordercolor = (config.strokeColor || 'black').replace('#', '&H00');
    const borderw = config.strokeWidth || 2;

    return `drawtext=text='${text.replace(/'/g, "\\'")}':fontsize=${config.fontSize || 48}:fontcolor=${fontcolor}:bordercolor=${bordercolor}:borderw=${borderw}:x=${x}:y=${y}`;
}
