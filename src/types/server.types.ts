import { JobStatus } from '../runtime';
import { EDITABLE_ENV_KEYS } from '../constants/config';

export type EditableEnvKey = typeof EDITABLE_ENV_KEYS[number];

export type Orientation = 'portrait' | 'landscape';

export interface VideoRecord {
    id: string;
    title: string;
    createdAt: string;
    orientation: string;
    durationSeconds: number | null;
    description: string | null;
    fileSizeMB: string;
    videoFilename: string;
    videoPath: string;
    thumbnailPath: string | null;
    watchUrl: string;
    downloadUrl: string;
    videoUrl: string;
    thumbnailUrl: string | null;
}

export interface HtmlOptions {
    canonical?: string;
    description?: string;
    imageUrl?: string | null;
    jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
    keywords?: string;
    ogType?: string;
    robots?: string;
}

export interface SetupStatus {
    envFileExists: boolean;
    hasPexelsKey: boolean;
    hasPixabayKey: boolean;
    hasGeminiKey: boolean;
    hasPublicBaseUrl: boolean;
    edgeTtsReady: boolean;
    readyForGeneration: boolean;
}
