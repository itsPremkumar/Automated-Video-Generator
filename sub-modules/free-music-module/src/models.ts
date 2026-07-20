export interface MusicTrack {
    id: string;
    title: string;
    creator: string;
    license: string;
    licenseUrl: string;
    provider: string;
    downloadUrl: string;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
    genre: string;
    format: string;
    bpm: number | null;
    tags: string[];
    sourcePageUrl: string;
}

export interface MusicGenerationRequest {
    prompt: string;
    duration?: number;
    genre?: string;
    bpm?: number;
    lyrics?: string;
    style?: string;
}

export interface MusicGenerationResult {
    id: string;
    prompt: string;
    downloadUrl: string;
    localPath: string | null;
    durationSeconds: number;
    title: string;
    success: boolean;
    error: string | null;
}

export interface AceMusicStatus {
    running: boolean;
    port: number;
    version: string | null;
    message: string;
}

export interface FreeMusicLabTrack {
    id: string;
    title: string;
    genre: string;
    mood: string[];
    type: string;
    duration: number;
    downloadUrl: string;
    waveformUrl: string;
    creator: string;
    license: string;
}
