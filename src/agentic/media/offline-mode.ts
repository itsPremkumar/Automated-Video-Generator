/**
 * offline-mode.ts — production-grade offline fallback.
 *
 * When network sources fail (rate-limited, offline, no API key), this module
 * provides a deterministic fallback path that ALWAYS produces a video using
 * bundled assets. The pipeline never wedges and never ships garbage.
 *
 * Usage: import { createOfflinePlan } and pass it to renderAgenticSlideshow
 * when the main pipeline's gate fails due to missing visuals.
 */

import * as fs from 'fs';
import * as path from 'path';
import { bundledImages, bundledVideos, bundledMusic } from './bundled-media.js';
import type { PipelineRequest } from '../orchestrator/types.js';
import type { Plan } from '../types.js';

/**
 * Build a minimal Plan from bundled assets — enough for renderAgenticSlideshow
 * to produce a watchable video with KenBurns on static images.
 */
export function createOfflinePlan(req: PipelineRequest, script: string): Plan {
    const images = bundledImages();
    const videos = bundledVideos();
    const music = bundledMusic();

    // Parse script into scenes (one per sentence, max 5)
    const sentences = script
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 10)
        .slice(0, 5);

    if (sentences.length === 0) {
        sentences.push(req.title || 'Welcome');
    }

    const scenes = sentences.map((text, i) => {
        const visual = videos.length > 0
            ? videos[i % videos.length].path
            : images[i % images.length].path;
        return {
            idx: i,
            sceneNumber: i + 1,
            voiceoverText: text,
            searchKeywords: [req.topic, req.title],
            visualPreference: videos.length > 0 ? 'video' as const : 'image' as const,
            localAsset: visual,
            durationSec: 5,
            kenBurns: true,
            kinetic: [],
            caption: '',
        };
    });

    return {
        jobId: `offline_${Date.now()}`,
        title: req.title,
        topic: req.topic,
        orientation: req.orientation ?? 'portrait',
        voice: req.voice ?? 'en-US-JennyNeural',
        scenes,
        totalDurationSec: scenes.length * 5,
        musicQuery: req.musicQuery ?? 'ambient',
    } as unknown as Plan;
}

/**
 * Get a bundled music track for offline mode, or null if music is disabled.
 */
export function getOfflineMusic(req: PipelineRequest): string | null {
    if (req.music === false) return null;
    const music = bundledMusic();
    if (music.length === 0) return null;
    return music[0].path;
}

/**
 * Check if offline mode is available (bundled assets exist).
 */
export function isOfflineModeAvailable(): boolean {
    return bundledImages().length > 0;
}

/**
 * Status for diagnostics/logging.
 */
export function offlineModeStatus(): {
    available: boolean;
    images: number;
    videos: number;
    music: number;
} {
    return {
        available: isOfflineModeAvailable(),
        images: bundledImages().length,
        videos: bundledVideos().length,
        music: bundledMusic().length,
    };
}
