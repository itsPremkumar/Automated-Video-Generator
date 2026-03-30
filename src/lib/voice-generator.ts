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
// ... (skip down to getAudioDuration) ...

/**
 * Get actual audio duration using ffprobe
 * Falls back to estimation if ffprobe is not available
 */
function getAudioDuration(filePath: string, text: string): number {
  try {
    // Try using ffprobe-static (bundled binary) or system ffprobe
    const ffprobeCmd = ffprobePath.path || 'ffprobe';

    // console.log(`🎤 [DEBUG] Checking duration for: ${path.basename(filePath)}`);
    const result = execSync(
      `"${ffprobeCmd}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const duration = parseFloat(result.trim());
    if (!isNaN(duration) && duration > 0) {
      // console.log(`🎤 [DEBUG] Actual Duration: ${duration.toFixed(2)}s`);
      return Math.ceil(duration);
    }
  } catch (e: any) {
    // console.warn(`🎤 [WARNING] ffprobe failed: ${e.message}`);
    // ffprobe not available or failed, use estimation
  }

  // Fallback: estimate based on text
  // console.log(`🎤 [WARNING] Using fallback duration estimation for: "${text.substring(0, 20)}..."`);
  return estimateAudioDuration(text);
}

/**
 * Estimate audio duration based on text length
 * SAFER ESTIMATION: Assume slower speaking to avoid cutting off.
 * Average speaking rate: ~130 words per minute = ~2.2 words per second
 */
export function estimateAudioDuration(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  // Conservative estimate: 2.2 words per second (slower than average)
  const wordsPerSecond = 2.2;
  // Add 1.5s buffer for safety
  const duration = Math.max(3, Math.ceil(words / wordsPerSecond) + 1.5);
  return duration;
}

// Available Neural Voices
export const AVAILABLE_VOICES = {
  male: [
    'en-US-GuyNeural',          // Deep, authoritative ⭐ BEST
    'en-US-ChristopherNeural',  // Calm
    'en-GB-RyanNeural',         // British
    'en-IN-PrabhatNeural',      // Indian
  ],
  female: [
    'en-US-JennyNeural',        // Warm ⭐ BEST
    'en-US-AriaNeural',         // Friendly
    'en-US-SaraNeural',         // Cheerful
    'en-GB-SoniaNeural',        // British
  ],
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
 * Throws an error if Edge-TTS cannot be found or executed
 */
export function validateEdgeTTS(): boolean {
  try {
    // Check if file exists
    if (!fs.existsSync(EDGE_TTS_PATH)) {
      console.error(`\n❌ [VOICE-GEN] Edge-TTS not found at: ${EDGE_TTS_PATH}`);
      console.error(`💡 [VOICE-GEN] Install with: pip install edge-tts`);
      console.error(`💡 [VOICE-GEN] Or set EDGE_TTS_PATH environment variable`);
      return false;
    }

    // Try to run edge-tts --help to verify it works
    execSync(`"${EDGE_TTS_PATH}" --help`, { stdio: 'pipe' });
    return true;
  } catch (error: any) {
    console.error(`\n❌ [VOICE-GEN] Edge-TTS validation failed: ${error.message}`);
    console.error(`💡 [VOICE-GEN] Install with: pip install edge-tts`);
    return false;
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate voiceover for all scenes using Edge-TTS
 * Returns a Map with scene number -> { path, duration }
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

  // Validate Edge-TTS before starting
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

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    writeProgress(`\r🎤 [VOICE-GEN] Processing scene ${i + 1}/${scenes.length}...`);

    try {
      const result = await generateSceneVoiceoverWithRetry(scene, outputDir, config);
      audioFiles.set(scene.sceneNumber, result);

      if (result.path.endsWith('.mp3')) {
        successCount++;
      } else {
        failCount++;
        failedScenes.push(scene.sceneNumber);
      }
    } catch (error: any) {
      console.error(`\n❌ [VOICE-GEN] Scene ${scene.sceneNumber} failed after ${MAX_RETRIES} retries: ${error.message}`);
      failCount++;
      failedScenes.push(scene.sceneNumber);

      // Create fallback with estimated duration
      const fallbackDuration = estimateAudioDuration(scene.voiceoverText);
      audioFiles.set(scene.sceneNumber, {
        path: '', // No audio file
        duration: fallbackDuration
      });
    }
  }

  const elapsed = Date.now() - startTime;
  console.log('\n\n🎤 ════════════════════════════════════════════════');
  console.log('🎤 [VOICE-GEN] ✅ Voiceover Generation Complete');
  console.log(`🎤 [VOICE-GEN]    Total time: ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`🎤 [VOICE-GEN]    Successful: ${successCount}/${scenes.length}`);

  if (failCount > 0) {
    console.log(`🎤 [VOICE-GEN]    ⚠️ Failed: ${failCount}/${scenes.length} (scenes: ${failedScenes.join(', ')})`);
    console.log(`🎤 [VOICE-GEN]    ⚠️ These scenes will have NO audio in the video!`);
  }

  console.log('🎤 ════════════════════════════════════════════════\n');

  // If too many failures, throw an error
  if (failCount > scenes.length * 0.5) {
    throw new Error(`Too many voice generation failures: ${failCount}/${scenes.length} scenes failed. Check Edge-TTS installation.`);
  }

  return audioFiles;
}



/**
 * Generate voiceover for a single scene with retry logic
 */
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
        // Log retry attempt
        writeProgress(`\n   ⚠️ Scene ${scene.sceneNumber} attempt ${attempt} failed, retrying...`);
        await sleep(RETRY_DELAY_MS * attempt);  // Exponential backoff
      }
    }
  }

  // All retries failed
  throw lastError || new Error('Voice generation failed after all retries');
}

/**
 * Generate voiceover for a single scene using Edge-TTS CLI
 */
async function generateSceneVoiceover(
  scene: Scene,
  outputDir: string,
  config: VoiceConfig
): Promise<AudioResult> {
  const filename = `scene_${scene.sceneNumber}_voice.mp3`;
  const outputPath = path.join(outputDir, filename);

  // RESUME OPTIMIZATION: Check if file already exists and is valid
  if (fs.existsSync(outputPath)) {
    try {
      const stats = fs.statSync(outputPath);
      if (stats.size > 1000) { // > 1KB
        // console.log(`   ⏩ [VOICE] Skipping existing file: ${filename}`);
        const duration = getAudioDuration(outputPath, scene.voiceoverText);
        return { path: outputPath, duration };
      }
    } catch (e) {
      // File check failed, regenerate
    }
  }

  // Clean text for CLI - handle special characters
  const cleanText = scene.voiceoverText
    .replace(/"/g, "'")      // Replace double quotes
    .replace(/\n/g, ' ')     // Remove newlines
    .replace(/\r/g, '')      // Remove carriage returns
    .replace(/`/g, "'")      // Replace backticks
    .replace(/\$/g, '')      // Remove dollar signs
    .replace(/[<>|&^]/g, '') // Remove shell special chars
    .trim();

  if (!cleanText || cleanText.length < 2) {
    throw new Error(`Scene ${scene.sceneNumber} has empty or invalid text`);
  }

  // Build Edge-TTS command
  const command = `"${EDGE_TTS_PATH}" --voice "${config.voice}" --rate="${config.rate}" --pitch="${config.pitch}" --text "${cleanText}" --write-media "${outputPath}"`;

  try {
    execSync(command, {
      stdio: 'pipe',
      timeout: 60000,  // 60 second timeout per scene
    });

    // Verify the file was created and has content
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Output file not created: ${outputPath}`);
    }

    const stats = fs.statSync(outputPath);
    if (stats.size < 1000) {  // Less than 1KB is likely corrupted
      fs.unlinkSync(outputPath);  // Delete corrupted file
      throw new Error(`Output file too small (${stats.size} bytes), likely corrupted`);
    }

    // Get actual audio duration
    const duration = getAudioDuration(outputPath, scene.voiceoverText);

    return { path: outputPath, duration };

  } catch (error: any) {
    // Clean up partial file if it exists
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch { }
    }

    // Re-throw with more context
    throw new Error(`Edge-TTS failed for scene ${scene.sceneNumber}: ${error.message}`);
  }
}


