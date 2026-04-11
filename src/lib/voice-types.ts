/**
 * Shared types and interfaces for the voice generation pipeline.
 */

/** Metadata for a single Edge-TTS voice entry */
export interface VoiceMetadata {
  name: string;
  gender: 'Male' | 'Female';
  language: string;
  category?: string;
  tags?: string[];
}

/** Runtime configuration passed to each voice generation call */
export interface VoiceConfig {
  voice: string;
  rate: string;   // e.g. '+0%', '-10%', '+20%'
  pitch: string;  // e.g. '+0Hz', '-5Hz', '+10Hz'
  language?: string;
}

/** Result returned after generating audio for a scene */
export interface AudioResult {
  path: string;
  duration: number;
}

/** Status snapshot of the active voice engine */
export interface VoiceEngineStatus {
  activeEngine: 'edge-tts' | 'windows-sapi-fallback' | 'gtts-fallback' | 'unavailable';
  detail: string;
  edgeTtsReady: boolean;
  fallbackReady: boolean;
  generationReady: boolean;
}

/** Internal: resolved Edge-TTS runtime command */
export interface EdgeTtsRuntime {
  command: string;
  argsPrefix: string[];
  label: string;
}

/** Internal: Windows SAPI availability probe result */
export interface WindowsSapiStatus {
  ready: boolean;
  detail: string;
}
