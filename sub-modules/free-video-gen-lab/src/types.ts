export type ProviderStatus = 'available' | 'unavailable' | 'error';
export type ProviderPriority = number; // lower = higher priority

export interface ProviderResult<T> {
  success: boolean;
  data: T | null;
  provider: string;
  error?: string;
  latencyMs: number;
}

export interface ProviderCapabilities {
  canGenerateVideo: boolean;
  canGenerateImage: boolean;
  canGenerateAudio: boolean;
  canGenerateScript: boolean;
  canLipSync: boolean;
  canEditVideo: boolean;
  needsGpu: boolean;
  needsApiKey: boolean;
  needsModelDownload: boolean;
  maxVideoLengthSeconds: number;
  supportedResolutions: string[];
}

export interface VideoGenRequest {
  prompt: string;
  negativePrompt?: string;
  duration?: number;
  resolution?: { width: number; height: number };
  fps?: number;
  imageUrl?: string; // For image-to-video
  numFrames?: number;
}

export interface VideoGenResult {
  filePath: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  provider: string;
}

export interface ScriptGenRequest {
  topic: string;
  style?: string;
  language?: string;
  duration?: number; // Target video duration in seconds
  additionalContext?: string;
}

export interface ScriptGenResult {
  title: string;
  scenes: ScriptScene[];
  fullScript: string;
  provider: string;
}

export interface ScriptScene {
  sceneNumber: number;
  narration: string;
  duration: number;
  keywords: string[];
  visualPrompt: string;
  cameraAngle?: string;
  transitions?: string;
}

export interface StoryboardRequest {
  scenes: ScriptScene[];
  style?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

export interface StoryboardResult {
  scenes: StoryboardScene[];
  provider: string;
}

export interface StoryboardScene {
  sceneNumber: number;
  imagePath: string;
  narration: string;
  visualPrompt: string;
}

export interface LipSyncRequest {
  audioFilePath: string;
  imageFilePath: string;
  outputPath?: string;
}

export interface LipSyncResult {
  videoFilePath: string;
  durationSeconds: number;
  provider: string;
}

export interface MusicGenRequest {
  mood: string;
  genre?: string;
  duration?: number;
  tempo?: 'slow' | 'medium' | 'fast';
}

export interface MusicGenResult {
  filePath: string;
  durationSeconds: number;
  provider: string;
}

export interface TTSRequest {
  text: string;
  voice?: string;
  language?: string;
  speed?: number;
}

export interface TTSResult {
  filePath: string;
  durationSeconds: number;
  provider: string;
  voice: string;
}

export interface PipelineRequest {
  topic: string;
  style?: string;
  duration?: number;
  resolution?: { width: number; height: number };
  aspectRatio?: '16:9' | '9:16' | '1:1';
  fps?: number;
  outputDir?: string;
}

export interface PipelineResult {
  videoPath: string;
  script: ScriptGenResult;
  storyboard: StoryboardResult;
  audioPath?: string;
  musicPath?: string;
  scenes: number;
  totalDuration: number;
  providersUsed: string[];
  errors: string[];
}
