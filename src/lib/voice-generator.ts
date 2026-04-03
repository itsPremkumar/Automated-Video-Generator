import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { Scene } from './script-parser';
import { logError, logInfo, writeProgress } from '../runtime';

// @ts-ignore - ffprobe-static types
import ffprobePath from 'ffprobe-static';

const console = {
  log: (...args: unknown[]) => logInfo(...args),
  error: (...args: unknown[]) => logError(...args),
};

/**
 * Voice configuration for Edge-TTS
 */
export interface VoiceConfig {
  voice: string;
  rate: string;   // e.g., '+0%', '-10%', '+20%'
  pitch: string;  // e.g., '+0Hz', '-5Hz', '+10Hz'
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  voice: process.env.VIDEO_VOICE || 'en-US-GuyNeural',  // Deep, authoritative male voice
  rate: '+0%',
  pitch: '+0Hz',
};

/**
 * Get actual audio duration using ffprobe
 * Falls back to estimation if ffprobe is not available
 */
function getAudioDuration(filePath: string, text: string): number {
  try {
    // Try using ffprobe-static (bundled binary) or system ffprobe
    const ffprobeCmd = ffprobePath.path || 'ffprobe';

    const result = execSync(
      `"${ffprobeCmd}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const duration = parseFloat(result.trim());
    if (!isNaN(duration) && duration > 0) {
      return Math.ceil(duration);
    }
  } catch (e: any) {
    // ffprobe not available or failed, use estimation
  }

  return estimateAudioDuration(text);
}

/**
 * Estimate audio duration based on text length
 */
export function estimateAudioDuration(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  // Conservative estimate: 2.2 words per second (slower than average)
  const wordsPerSecond = 2.2;
  // Add 1.5s buffer for safety
  const duration = Math.max(3, Math.ceil(words / wordsPerSecond) + 1.5);
  return duration;
}

// Available Neural Voices grouped by language
export const AVAILABLE_VOICES: Record<string, { male: string[], female: string[] }> = {
  english: {
    male: ['en-US-GuyNeural', 'en-US-ChristopherNeural', 'en-GB-RyanNeural', 'en-IN-PrabhatNeural'],
    female: ['en-US-JennyNeural', 'en-US-AriaNeural', 'en-US-SaraNeural', 'en-GB-SoniaNeural'],
  },
  tamil: {
    male: ['ta-IN-ValluvarNeural'],
    female: ['ta-IN-PallaviNeural'],
  },
  hindi: {
    male: ['hi-IN-MadhurNeural'],
    female: ['hi-IN-SwararaNeural'],
  },
  spanish: {
    male: ['es-ES-AlvaroNeural'],
    female: ['es-ES-ElviraNeural'],
  },
  french: {
    male: ['fr-FR-HenriNeural'],
    female: ['fr-FR-DeniseNeural'],
  },
  german: {
    male: ['de-DE-ConradNeural'],
    female: ['de-DE-KatjaNeural'],
  },
};

// Default voice mapping for specific language keys
export const LANGUAGE_DEFAULTS: Record<string, string> = {
  tamil: 'ta-IN-PallaviNeural',
  hindi: 'hi-IN-SwararaNeural',
  spanish: 'es-ES-ElviraNeural',
  french: 'fr-FR-DeniseNeural',
  german: 'de-DE-KatjaNeural',
  english: 'en-US-JennyNeural',
};

// Edge-TTS path - configurable via environment variable
const EDGE_TTS_PATH = process.env.EDGE_TTS_PATH ||
  `C:\\Users\\PREM KUMAR\\AppData\\Local\\Programs\\Python\\Python312\\Scripts\\edge-tts.exe`;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Audio result with path and actual duration
 */
export interface AudioResult {
  path: string;
  duration: number;  // Actual duration in seconds
}

/**
 * Validate that Edge-TTS is accessible
 */
export function validateEdgeTTS(): boolean {
  try {
    if (!fs.existsSync(EDGE_TTS_PATH)) {
      console.error(`\n❌ [VOICE-GEN] Edge-TTS not found at: ${EDGE_TTS_PATH}`);
      return false;
    }
    execSync(`"${EDGE_TTS_PATH}" --help`, { stdio: 'pipe' });
    return true;
  } catch (error: any) {
    console.error(`\n❌ [VOICE-GEN] Edge-TTS validation failed: ${error.message}`);
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate voiceover for all scenes using Edge-TTS
 */
export async function generateVoiceovers(
  scenes: Scene[],
  outputDir: string,
  config: VoiceConfig = DEFAULT_VOICE_CONFIG
): Promise<Map<number, AudioResult>> {
  console.log('\n🎤 ════════════════════════════════════════════════');
  console.log('🎤 [VOICE-GEN] Starting voiceover generation (Edge-TTS)...');
  console.log(`🎤 [VOICE-GEN] Total scenes: ${scenes.length}`);
  console.log(`🎤 [VOICE-GEN] Voice: ${config.voice}`);
  console.log('🎤 ════════════════════════════════════════════════\n');

  if (!validateEdgeTTS()) {
    throw new Error('Edge-TTS is not available. Please install it with: pip install edge-tts');
  }

  const audioFiles = new Map<number, AudioResult>();
  const startTime = Date.now();

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let successCount = 0;
  let failCount = 0;
  const failedScenes: number[] = [];
  let silentCount = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    writeProgress(`\r🎤 [VOICE-GEN] Processing scene ${i + 1}/${scenes.length}...`);

    try {
      const result = await generateSceneVoiceoverWithRetry(scene, outputDir, config);
      audioFiles.set(scene.sceneNumber, result);

      if (result.path.endsWith('.mp3')) {
        successCount++;
      } else if (!scene.voiceoverText.trim()) {
        silentCount++;
      } else {
        failCount++;
        failedScenes.push(scene.sceneNumber);
      }
    } catch (error: any) {
      console.error(`\n❌ [VOICE-GEN] Scene ${scene.sceneNumber} failed after ${MAX_RETRIES} retries: ${error.message}`);
      failCount++;
      failedScenes.push(scene.sceneNumber);

      const fallbackDuration = estimateAudioDuration(scene.voiceoverText);
      audioFiles.set(scene.sceneNumber, {
        path: '',
        duration: fallbackDuration
      });
    }
  }

  const elapsed = Date.now() - startTime;
  console.log('\n\n🎤 ════════════════════════════════════════════════');
  console.log('🎤 [VOICE-GEN] ✅ Voiceover Generation Complete');
  console.log(`🎤 [VOICE-GEN]    Total time: ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`🎤 [VOICE-GEN]    Successful: ${successCount}/${scenes.length}`);
  console.log('🎤 ════════════════════════════════════════════════\n');

  if (failCount > scenes.length * 0.5) {
    throw new Error(`Too many voice generation failures: ${failCount}/${scenes.length} scenes failed.`);
  }

  return audioFiles;
}

async function generateSceneVoiceoverWithRetry(
  scene: Scene,
  outputDir: string,
  config: VoiceConfig
): Promise<AudioResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await generateSceneVoiceover(scene, outputDir, config);
    } catch (error: any) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastError || new Error('Voice generation failed after all retries');
}

async function generateSceneVoiceover(
  scene: Scene,
  outputDir: string,
  config: VoiceConfig
): Promise<AudioResult> {
  const filename = `scene_${scene.sceneNumber}_voice.mp3`;
  const outputPath = path.join(outputDir, filename);

  if (fs.existsSync(outputPath)) {
    try {
      const stats = fs.statSync(outputPath);
      if (stats.size > 1000) {
        const duration = getAudioDuration(outputPath, scene.voiceoverText);
        return { path: outputPath, duration };
      }
    } catch (e) {
    }
  }

  const cleanText = scene.voiceoverText
    .replace(/"/g, "'")
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/`/g, "'")
    .replace(/\$/g, '')
    .replace(/[<>|&^]/g, '')
    .trim();

  if (!cleanText) {
    return {
      path: '',
      duration: Math.max(3, scene.duration || 3),
    };
  }

  if (cleanText.length < 2) {
    throw new Error(`Scene ${scene.sceneNumber} has empty or invalid text`);
  }

  const command = `"${EDGE_TTS_PATH}" --voice "${config.voice}" --rate="${config.rate}" --pitch="${config.pitch}" --text "${cleanText}" --write-media "${outputPath}"`;

  try {
    execSync(command, { stdio: 'pipe', timeout: 60000 });
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Output file not created: ${outputPath}`);
    }
    const stats = fs.statSync(outputPath);
    if (stats.size < 1000) {
      fs.unlinkSync(outputPath);
      throw new Error(`Output file too small (${stats.size} bytes), likely corrupted`);
    }
    const duration = getAudioDuration(outputPath, scene.voiceoverText);
    return { path: outputPath, duration };
  } catch (error: any) {
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch { }
    }
    throw new Error(`Edge-TTS failed for scene ${scene.sceneNumber}: ${error.message}`);
  }
}
