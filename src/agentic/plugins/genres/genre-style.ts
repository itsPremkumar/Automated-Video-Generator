/**
 * Genre Style Plugin
 * Applies complete style packages for different video genres (reels, documentary, cinematic, etc.)
 * Each genre defines: transitions, grades, pacing, captions, audio, overlays
 */

import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';

interface GenreConfig {
    /** Genre to apply (overrides videoType from main config) */
    genre?: 'reels' | 'tiktok' | 'documentary' | 'cinematic' | 'news' | 'tutorial' | 'vlog' | 'product' | 'motivational' | 'nature' | 'corporate' | 'wedding' | 'gaming' | 'realestate';
    /** Allow genre to override main config */
    overrideConfig?: boolean;
    /** Custom genre definitions */
    custom?: Record<string, GenreStyle>;
}

/** Complete style definition for a genre */
export interface GenreStyle {
    name: string;
    preset: string;
    orientation: 'portrait' | 'landscape';
    aspect: '9:16' | '1:1' | '16:9' | '4:5';

    // Transitions
    defaultTransition: string;
    transitionPool: string[];
    transitionDuration: number;

    // Color
    gradePool: string[];
    defaultGrade: string;
    lut?: string;

    // Pacing
    variablePacing: boolean;
    hookFirst: boolean;
    jCutSec: number;
    minSceneDur: number;
    maxSceneDur: number;

    // Captions
    captions: 'burned' | 'karaoke' | 'none' | 'dynamic';
    captionStyle: Record<string, unknown>;
    kineticText: boolean;
    lowerThirds: boolean;

    // Motion
    kenBurns: boolean;
    kenBurnsIntensity: number;
    punchIn: boolean;
    speedRamp: boolean;

    // Audio
    musicIntensity: 'calm' | 'mid' | 'energetic';
    sfx: boolean;
    ducking: boolean;
    beatSync: boolean;

    // Overlays
    watermark: boolean;
    safeZones: boolean;
    progressBar: boolean;
    lowerThirdBar: boolean;

    // Output
    platforms: string[];
    maxDuration?: number;
    thumbnail: boolean;
}

const GENRE_STYLES: Record<string, GenreStyle> = {
    reels: {
        name: 'Instagram Reels',
        preset: 'reels',
        orientation: 'portrait',
        aspect: '9:16',
        defaultTransition: 'slide',
        transitionPool: ['slide', 'cut', 'whip-pan', 'glitch'],
        transitionDuration: 0.3,
        gradePool: ['vivid', 'cinematic', 'warm'],
        defaultGrade: 'vivid',
        variablePacing: true,
        hookFirst: true,
        jCutSec: 0.3,
        minSceneDur: 1.5,
        maxSceneDur: 3.5,
        captions: 'karaoke',
        captionStyle: { fontSize: 42, boxColor: 'black@0.6', highlightColor: 'yellow' },
        kineticText: true,
        lowerThirds: false,
        kenBurns: true,
        kenBurnsIntensity: 1.2,
        punchIn: true,
        speedRamp: true,
        musicIntensity: 'energetic',
        sfx: true,
        ducking: true,
        beatSync: true,
        watermark: true,
        safeZones: true,
        progressBar: true,
        lowerThirdBar: false,
        platforms: ['instagram', 'facebook'],
        maxDuration: 90,
        thumbnail: true,
    },

    tiktok: {
        name: 'TikTok',
        preset: 'reels',
        orientation: 'portrait',
        aspect: '9:16',
        defaultTransition: 'cut',
        transitionPool: ['cut', 'whip-pan', 'zoom-blur', 'glitch', 'spin'],
        transitionDuration: 0.2,
        gradePool: ['vivid', 'cyberpunk', 'neon'],
        defaultGrade: 'vivid',
        variablePacing: true,
        hookFirst: true,
        jCutSec: 0.2,
        minSceneDur: 1.0,
        maxSceneDur: 3.0,
        captions: 'dynamic',
        captionStyle: { fontSize: 48, boxColor: 'black@0.7', highlightColor: '#FF0050', animation: 'bounce' },
        kineticText: true,
        lowerThirds: false,
        kenBurns: false,
        kenBurnsIntensity: 1.0,
        punchIn: true,
        speedRamp: true,
        musicIntensity: 'energetic',
        sfx: true,
        ducking: true,
        beatSync: true,
        watermark: true,
        safeZones: true,
        progressBar: true,
        lowerThirdBar: false,
        platforms: ['tiktok'],
        maxDuration: 180,
        thumbnail: true,
    },

    documentary: {
        name: 'Documentary',
        preset: 'documentary',
        orientation: 'landscape',
        aspect: '16:9',
        defaultTransition: 'fade',
        transitionPool: ['fade', 'cross-dissolve', 'morph-cut'],
        transitionDuration: 1.0,
        gradePool: ['neutral', 'cinematic', 'cool'],
        defaultGrade: 'neutral',
        lut: 'kodak-2383.cube',
        variablePacing: false,
        hookFirst: false,
        jCutSec: 0.8,
        minSceneDur: 5.0,
        maxSceneDur: 15.0,
        captions: 'burned',
        captionStyle: { fontSize: 28, boxColor: 'black@0.5', font: 'Georgia' },
        kineticText: false,
        lowerThirds: true,
        kenBurns: true,
        kenBurnsIntensity: 0.8,
        punchIn: false,
        speedRamp: false,
        musicIntensity: 'calm',
        sfx: false,
        ducking: true,
        beatSync: false,
        watermark: true,
        safeZones: false,
        progressBar: false,
        lowerThirdBar: true,
        platforms: ['youtube', 'vimeo'],
        thumbnail: true,
    },

    cinematic: {
        name: 'Cinematic Short Film',
        preset: 'cinematic',
        orientation: 'landscape',
        aspect: '16:9',
        defaultTransition: 'fade',
        transitionPool: ['fade', 'dip-to-color', 'morph-cut'],
        transitionDuration: 0.8,
        gradePool: ['cinematic', 'teal-orange', 'bleach-bypass'],
        defaultGrade: 'cinematic',
        lut: 'fuji-400h.cube',
        variablePacing: true,
        hookFirst: true,
        jCutSec: 0.5,
        minSceneDur: 3.0,
        maxSceneDur: 8.0,
        captions: 'burned',
        captionStyle: { fontSize: 32, boxColor: 'black@0.4', font: 'Cinzel' },
        kineticText: false,
        lowerThirds: false,
        kenBurns: true,
        kenBurnsIntensity: 1.0,
        punchIn: true,
        speedRamp: true,
        musicIntensity: 'mid',
        sfx: true,
        ducking: true,
        beatSync: false,
        watermark: false,
        safeZones: false,
        progressBar: false,
        lowerThirdBar: false,
        platforms: ['youtube', 'vimeo', 'film-festival'],
        thumbnail: true,
    },

    news: {
        name: 'News / Breaking',
        preset: 'neutral',
        orientation: 'landscape',
        aspect: '16:9',
        defaultTransition: 'cut',
        transitionPool: ['cut', 'hard-cut'],
        transitionDuration: 0.1,
        gradePool: ['cool', 'neutral'],
        defaultGrade: 'cool',
        variablePacing: false,
        hookFirst: true,
        jCutSec: 0.1,
        minSceneDur: 2.0,
        maxSceneDur: 5.0,
        captions: 'burned',
        captionStyle: { fontSize: 36, boxColor: 'red@0.9', font: 'Arial Bold', color: 'white' },
        kineticText: false,
        lowerThirds: true,
        kenBurns: false,
        kenBurnsIntensity: 0,
        punchIn: false,
        speedRamp: false,
        musicIntensity: 'mid',
        sfx: false,
        ducking: true,
        beatSync: false,
        watermark: true,
        safeZones: true,
        progressBar: false,
        lowerThirdBar: true,
        platforms: ['youtube', 'broadcast'],
        maxDuration: 300,
        thumbnail: true,
    },

    tutorial: {
        name: 'Tutorial / How-To',
        preset: 'documentary',
        orientation: 'landscape',
        aspect: '16:9',
        defaultTransition: 'slide',
        transitionPool: ['slide', 'fade', 'push'],
        transitionDuration: 0.5,
        gradePool: ['neutral', 'warm'],
        defaultGrade: 'neutral',
        variablePacing: false,
        hookFirst: true,
        jCutSec: 0.3,
        minSceneDur: 4.0,
        maxSceneDur: 20.0,
        captions: 'burned',
        captionStyle: { fontSize: 30, boxColor: 'black@0.6', font: 'Roboto' },
        kineticText: true,
        lowerThirds: true,
        kenBurns: false,
        kenBurnsIntensity: 0,
        punchIn: true,
        speedRamp: false,
        musicIntensity: 'calm',
        sfx: true,
        ducking: true,
        beatSync: false,
        watermark: true,
        safeZones: true,
        progressBar: true,
        lowerThirdBar: true,
        platforms: ['youtube', 'udemy', 'skillshare'],
        thumbnail: true,
    },

    vlog: {
        name: 'Vlog / Personal',
        preset: 'cinematic',
        orientation: 'portrait',
        aspect: '9:16',
        defaultTransition: 'whip-pan',
        transitionPool: ['whip-pan', 'cut', 'zoom-blur', 'shake'],
        transitionDuration: 0.3,
        gradePool: ['warm', 'vivid', 'cinematic'],
        defaultGrade: 'warm',
        variablePacing: true,
        hookFirst: true,
        jCutSec: 0.4,
        minSceneDur: 2.0,
        maxSceneDur: 6.0,
        captions: 'dynamic',
        captionStyle: { fontSize: 38, boxColor: 'black@0.5', animation: 'typewriter' },
        kineticText: true,
        lowerThirds: false,
        kenBurns: true,
        kenBurnsIntensity: 1.1,
        punchIn: true,
        speedRamp: true,
        musicIntensity: 'mid',
        sfx: true,
        ducking: true,
        beatSync: false,
        watermark: true,
        safeZones: true,
        progressBar: false,
        lowerThirdBar: false,
        platforms: ['youtube', 'instagram', 'tiktok'],
        maxDuration: 600,
        thumbnail: true,
    },

    product: {
        name: 'Product Demo / Showcase',
        preset: 'reels',
        orientation: 'landscape',
        aspect: '16:9',
        defaultTransition: 'slide',
        transitionPool: ['slide', 'push', 'cube', 'fade'],
        transitionDuration: 0.4,
        gradePool: ['vivid', 'cinematic', 'cool'],
        defaultGrade: 'vivid',
        variablePacing: false,
        hookFirst: true,
        jCutSec: 0.3,
        minSceneDur: 3.0,
        maxSceneDur: 10.0,
        captions: 'burned',
        captionStyle: { fontSize: 36, boxColor: 'black@0.7', highlightColor: 'brand' },
        kineticText: true,
        lowerThirds: true,
        kenBurns: true,
        kenBurnsIntensity: 0.9,
        punchIn: true,
        speedRamp: false,
        musicIntensity: 'energetic',
        sfx: true,
        ducking: true,
        beatSync: false,
        watermark: true,
        safeZones: true,
        progressBar: false,
        lowerThirdBar: true,
        platforms: ['youtube', 'instagram', 'website'],
        thumbnail: true,
    },

    motivational: {
        name: 'Motivational / Quotes',
        preset: 'cinematic',
        orientation: 'portrait',
        aspect: '9:16',
        defaultTransition: 'fade',
        transitionPool: ['fade', 'zoom-blur', 'dip-to-black'],
        transitionDuration: 0.6,
        gradePool: ['cinematic', 'teal-orange', 'noir'],
        defaultGrade: 'cinematic',
        variablePacing: true,
        hookFirst: true,
        jCutSec: 0.5,
        minSceneDur: 3.0,
        maxSceneDur: 7.0,
        captions: 'karaoke',
        captionStyle: { fontSize: 52, boxColor: 'black@0.7', highlightColor: 'gold', font: 'Montserrat Bold' },
        kineticText: true,
        lowerThirds: false,
        kenBurns: true,
        kenBurnsIntensity: 1.3,
        punchIn: false,
        speedRamp: false,
        musicIntensity: 'energetic',
        sfx: false,
        ducking: true,
        beatSync: true,
        watermark: true,
        safeZones: true,
        progressBar: false,
        lowerThirdBar: false,
        platforms: ['instagram', 'tiktok', 'youtube-shorts'],
        maxDuration: 60,
        thumbnail: true,
    },

    nature: {
        name: 'Nature / Travel',
        preset: 'documentary-cool',
        orientation: 'landscape',
        aspect: '16:9',
        defaultTransition: 'fade',
        transitionPool: ['fade', 'cross-dissolve', 'morph-cut'],
        transitionDuration: 1.2,
        gradePool: ['cinematic', 'cool', 'neutral'],
        defaultGrade: 'cinematic',
        lut: 'kodak-ektar100.cube',
        variablePacing: false,
        hookFirst: false,
        jCutSec: 1.0,
        minSceneDur: 6.0,
        maxSceneDur: 20.0,
        captions: 'none',
        captionStyle: {},
        kineticText: false,
        lowerThirds: true,
        kenBurns: true,
        kenBurnsIntensity: 0.7,
        punchIn: false,
        speedRamp: false,
        musicIntensity: 'calm',
        sfx: false,
        ducking: false,
        beatSync: false,
        watermark: false,
        safeZones: false,
        progressBar: false,
        lowerThirdBar: true,
        platforms: ['youtube', 'vimeo', '500px'],
        thumbnail: true,
    },

    corporate: {
        name: 'Corporate / Brand',
        preset: 'neutral',
        orientation: 'landscape',
        aspect: '16:9',
        defaultTransition: 'slide',
        transitionPool: ['slide', 'fade', 'push'],
        transitionDuration: 0.5,
        gradePool: ['neutral', 'cool', 'cinematic'],
        defaultGrade: 'neutral',
        variablePacing: false,
        hookFirst: true,
        jCutSec: 0.4,
        minSceneDur: 4.0,
        maxSceneDur: 12.0,
        captions: 'burned',
        captionStyle: { fontSize: 32, boxColor: 'brand@0.8', font: 'Inter' },
        kineticText: true,
        lowerThirds: true,
        kenBurns: false,
        kenBurnsIntensity: 0,
        punchIn: true,
        speedRamp: false,
        musicIntensity: 'mid',
        sfx: true,
        ducking: true,
        beatSync: false,
        watermark: true,
        safeZones: true,
        progressBar: false,
        lowerThirdBar: true,
        platforms: ['linkedin', 'youtube', 'website'],
        thumbnail: true,
    },

    wedding: {
        name: 'Wedding / Event',
        preset: 'cinematic',
        orientation: 'landscape',
        aspect: '16:9',
        defaultTransition: 'cross-dissolve',
        transitionPool: ['cross-dissolve', 'fade', 'dip-to-white'],
        transitionDuration: 1.5,
        gradePool: ['warm', 'cinematic', 'vintage'],
        defaultGrade: 'warm',
        lut: 'portra-400.cube',
        variablePacing: true,
        hookFirst: false,
        jCutSec: 0.8,
        minSceneDur: 4.0,
        maxSceneDur: 15.0,
        captions: 'burned',
        captionStyle: { fontSize: 28, boxColor: 'black@0.3', font: 'Great Vibes' },
        kineticText: false,
        lowerThirds: true,
        kenBurns: true,
        kenBurnsIntensity: 0.9,
        punchIn: false,
        speedRamp: true,
        musicIntensity: 'calm',
        sfx: false,
        ducking: true,
        beatSync: false,
        watermark: false,
        safeZones: false,
        progressBar: false,
        lowerThirdBar: true,
        platforms: ['youtube', 'vimeo', 'private'],
        thumbnail: true,
    },

    gaming: {
        name: 'Gaming / Let\'s Play',
        preset: 'reels',
        orientation: 'landscape',
        aspect: '16:9',
        defaultTransition: 'cut',
        transitionPool: ['cut', 'glitch', 'slide', 'push'],
        transitionDuration: 0.2,
        gradePool: ['vivid', 'cyberpunk', 'neon', 'cool'],
        defaultGrade: 'vivid',
        variablePacing: true,
        hookFirst: true,
        jCutSec: 0.2,
        minSceneDur: 5.0,
        maxSceneDur: 30.0,
        captions: 'dynamic',
        captionStyle: { fontSize: 36, boxColor: 'black@0.7', animation: 'bounce', font: 'Orbitron' },
        kineticText: true,
        lowerThirds: true,
        kenBurns: false,
        kenBurnsIntensity: 0,
        punchIn: true,
        speedRamp: true,
        musicIntensity: 'energetic',
        sfx: true,
        ducking: true,
        beatSync: true,
        watermark: true,
        safeZones: true,
        progressBar: false,
        lowerThirdBar: true,
        platforms: ['youtube', 'twitch', 'tiktok'],
        maxDuration: 3600,
        thumbnail: true,
    },

    realestate: {
        name: 'Real Estate Tour',
        preset: 'documentary',
        orientation: 'landscape',
        aspect: '16:9',
        defaultTransition: 'morph-cut',
        transitionPool: ['morph-cut', 'fade', 'push'],
        transitionDuration: 1.0,
        gradePool: ['vivid', 'warm', 'neutral'],
        defaultGrade: 'vivid',
        lut: 'real-estate-hdr.cube',
        variablePacing: false,
        hookFirst: true,
        jCutSec: 0.5,
        minSceneDur: 5.0,
        maxSceneDur: 20.0,
        captions: 'burned',
        captionStyle: { fontSize: 30, boxColor: 'black@0.6', font: 'Montserrat' },
        kineticText: false,
        lowerThirds: true,
        kenBurns: true,
        kenBurnsIntensity: 1.1,
        punchIn: true,
        speedRamp: false,
        musicIntensity: 'calm',
        sfx: false,
        ducking: true,
        beatSync: false,
        watermark: true,
        safeZones: true,
        progressBar: true,
        lowerThirdBar: true,
        platforms: ['youtube', 'website', 'zillow', 'realtor'],
        thumbnail: true,
    },
};

export const genreStylePlugin: AgenticPlugin = {
    metadata: {
        name: 'genre-style',
        version: '1.0.0',
        description: 'Complete genre style packages (reels, documentary, cinematic, etc.)',
        author: 'Agentic Video Team',
        tags: ['genre', 'style', 'template', 'reels', 'documentary', 'cinematic', 'tiktok'],
    },

    capabilities: [
        Capability.GENRE_TEMPLATE,
        Capability.CONFIG_OVERRIDE,
    ],

    category: PluginCategory.GENRE,

    defaultConfig: {
        genre: 'cinematic',
        overrideConfig: true,
        custom: {},
    },

    hooks: {
        onLoad: async (ctx) => {
            const cfg = ctx.getConfig<GenreConfig>('genre-style');
            // Merge custom genres
            for (const [key, style] of Object.entries(cfg.custom ?? {})) {
                GENRE_STYLES[key] = style;
            }
        },

        onPlan: async (plan, ctx) => {
            const cfg = ctx.getConfig<GenreConfig>('genre-style');
            const genre = (cfg.genre ?? plan.metadata?.videoType ?? 'cinematic') as string;
            const style = GENRE_STYLES[genre];

            if (!style) {
                console.warn(`[genre-style] Unknown genre: ${genre}, using cinematic`);
                return plan;
            }

            // Apply style to plan
            const enhanced = { ...plan };
            enhanced.metadata = { ...plan.metadata, genreStyle: style };
            enhanced.orientation = style.orientation;
            enhanced.aspect = style.aspect;

            // Apply to scenes
            for (let i = 0; i < enhanced.scenes.length; i++) {
                const scene = enhanced.scenes[i];
                scene.genreStyle = style;
                // Set duration based on style pacing
                if (style.variablePacing) {
                    const variation = 0.7 + Math.random() * 0.6; // 0.7-1.3
                    scene.durationSec = Math.min(
                        style.maxSceneDur,
                        Math.max(style.minSceneDur, (scene.durationSec ?? 4) * variation)
                    );
                }
            }

            return enhanced;
        },

        onStyle: async (stylePlan, ctx) => {
            const genreStyle = ctx.getShared('genreStyle') as GenreStyle;
            if (!genreStyle) return stylePlan;

            // Override style plan with genre settings
            return {
                ...stylePlan,
                preset: genreStyle.preset,
                transitions: genreStyle.transitionPool.map((t, i) => ({
                    sceneIndex: i,
                    type: t,
                    durationSec: genreStyle.transitionDuration,
                    params: {},
                })),
                grades: genreStyle.gradePool.map((g, i) => ({
                    sceneIndex: i,
                    type: g,
                    filter: `eq=contrast=1.05:saturation=1.1`,
                    params: {},
                })),
                metadata: {
                    ...stylePlan.metadata,
                    genre: genreStyle.name,
                    genreConfig: genreStyle,
                },
            };
        },
    },
};

export function getGenreStyle(genre: string): GenreStyle | undefined {
    return GENRE_STYLES[genre];
}

export function listGenres(): string[] {
    return Object.keys(GENRE_STYLES);
}

export function registerGenreStyle(registry: any, config?: Partial<GenreConfig>, enabled = true): void {
    registry.register(genreStylePlugin, config, enabled);
}