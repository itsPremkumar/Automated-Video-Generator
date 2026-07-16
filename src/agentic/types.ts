/**
 * Shared types for the agentic video pipeline.
 *
 * These describe the data that flows between the six stages:
 *   Plan -> Acquire -> Verify -> Decide (gateway) -> Gate -> Render
 *
 * Everything is plain, JSON-serialisable data so an agent (or a human) can
 * inspect and edit it. No behavior is hidden.
 */

export type AssetKind = 'image' | 'video' | 'music';

export type AutonomyLevel = 'L0-manual' | 'L1-suggest' | 'L2-autonomous' | 'L3-self-improving';

export type Decision = 'approved' | 'rejected' | 'pending' | 'fallback';

export interface ScenePlan {
    sceneNumber: number;
    voiceoverText: string;
    /** Keywords used to fetch candidate visuals for this scene. */
    searchKeywords: string[];
    /** 'image' = prefer a still; 'video' = prefer motion. */
    visualPreference: 'image' | 'video';
    durationSec: number;
    /** User-supplied local media file (from input/input-assets/) bound to this
     *  scene. When set, the acquire stage uses this file directly instead of
     *  fetching stock (legacy localAsset behaviour, ported to agentic). */
    localAsset?: string;
}

export interface Plan {
    jobId: string;
    title: string;
    orientation: 'portrait' | 'landscape';
    voice: string;
    musicQuery: string;
    scenes: ScenePlan[];
    totalDurationSec: number;
}

export interface AssetCandidate {
    kind: AssetKind;
    /** Scene index this asset belongs to (music uses -1). */
    sceneIndex: number;
    candidateIndex: number;
    localPath: string;
    url: string;
    source: string;
    license?: string;
    licenseUrl?: string;
    /** Keywords this asset was fetched to satisfy (for verification). */
    keywords: string[];
}

export interface AssetVerification {
    assetId: string;
    kind: AssetKind;
    sceneIndex: number;
    passes: boolean;
    confidence: number; // 0-10
    reason: string;
    metrics?: Record<string, unknown>;
}

export interface AssetDecision {
    assetId: string;
    kind: AssetKind;
    sceneIndex: number;
    decision: Decision;
    rationale: string;
    decidedBy: 'agent' | 'human' | 'system';
    fallbackUsed: boolean;
}

export interface RenderManifestEntry {
    kind: AssetKind;
    sceneIndex: number;
    localPath: string;
    license?: string;
    licenseUrl?: string;
    /** Per-scene spoken voiceover (Phase 2). Present for image/video scenes. */
    audioPath?: string;
    /** Scene duration in seconds (driven by voiceover length when available). */
    durationSec?: number;
    /** Word-timed caption cues (Phase 4.2). */
    captionSegments?: { text: string; startMs: number; endMs: number }[];
}

export interface RenderManifest {
    jobId: string;
    title: string;
    orientation: 'portrait' | 'landscape';
    voice: string;
    musicQuery: string;
    assets: RenderManifestEntry[];
    /** True when real TTS produced the voiceover (false = agent tone fallback). */
    voiceoverDriven?: boolean;
    generatedAt: string;
}

export function assetId(kind: AssetKind, sceneIndex: number, candidateIndex: number): string {
    return `${kind}_s${sceneIndex}_c${candidateIndex}`;
}
