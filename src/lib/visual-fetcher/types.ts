import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath, resolveWorkspacePath, resolveRuntimePublicPath } from '../../runtime';

export interface MediaAsset {
    type: 'image' | 'video';
    url: string;
    width: number;
    height: number;
    photographer?: string;
    localPath?: string;
    videoDuration?: number;
    videoTrimAfterFrames?: number;
    /** License label, e.g. 'CC-BY 4.0' — used downstream for attribution. */
    license?: string;
    /** URL to the full license text. */
    licenseUrl?: string;
    /** Quality label from Pexels video_files (sd/hd/uhd) for ranking. */
    quality?: string;
}

export interface VideoMetadata {
    durationSeconds: number;
    trimAfterFrames: number;
}

export interface DownloadResult {
    path: string;
    width: number;
    height: number;
    videoDuration: number;
    videoTrimAfterFrames: number;
}

export interface VideoCache {
    [keywords: string]: MediaAsset;
}

export type CachedMediaType = MediaAsset['type'];
