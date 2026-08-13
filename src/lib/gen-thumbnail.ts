/**
 * gen-thumbnail.ts — AI-attractive thumbnail (Feature 4, part B).
 *
 * Reuses the key-gated image generator (gen-image.ts) to produce a click-worthy
 * thumbnail instead of a plain frame-grab. OPTIONAL + OFF by default: returns ''
 * when no key is set OR generation fails, so the caller keeps its frame-grab.
 *
 * Identity-preserving: never throws; falls back to '' (caller uses frame-grab).
 */
import * as fs from 'fs';
import * as path from 'path';
import { generateSceneImage, isGenEnabled, buildGenPrompt } from './gen-image.js';

export interface GenThumbnailOptions {
    topic: string;
    title: string;
    keywords: string[];
    outDir: string;
    filename?: string;
    orientation?: 'portrait' | 'landscape' | 'square';
}

/** Build a thumbnail-focused prompt (face/hook-forward, bold, clickable). */
export function buildThumbnailPrompt(title: string, keywords: string[], orientation: string): string {
    const kw = (keywords || []).filter(Boolean).slice(0, 5).join(', ');
    const aspect = orientation === 'landscape' ? '16:9' : orientation === 'square' ? '1:1' : '9:16';
    const base = `A bold, high-contrast YouTube thumbnail: ${kw || title}, large readable focal subject, vibrant color, no small text, cinematic ${aspect}, clickable and emotionally striking.`;
    return base.slice(0, 1000);
}

/**
 * Generate an AI thumbnail. Returns the local path or '' when unavailable.
 * Never throws.
 */
export async function generateThumbnail(opts: GenThumbnailOptions): Promise<string> {
    if (!isGenEnabled()) return '';
    const filename = opts.filename || `${Date.now()}_thumb.jpg`;
    const dest = await generateSceneImage({
        prompt: buildThumbnailPrompt(opts.title, opts.keywords, opts.orientation ?? 'landscape'),
        outDir: opts.outDir,
        filename,
        orientation: opts.orientation ?? 'landscape',
    });
    return fs.existsSync(dest) ? dest : '';
}
