import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawnSync } from 'child_process';
import { Scene } from './script-parser';
import { logError, logInfo, writeProgress } from '../runtime';

// @ts-ignore - ffprobe-static types
import ffprobePath from 'ffprobe-static';

const console = {
  log: (...args: unknown[]) => logInfo(...args),
  error: (...args: unknown[]) => logError(...args),
};

/**
 * Metadata for an Edge-TTS voice
 */
export interface VoiceMetadata {
  name: string;
  gender: 'Male' | 'Female';
  language: string;
  category?: string;
  tags?: string[];
}

/**
 * Voice configuration for Edge-TTS
 */
export interface VoiceConfig {
  voice: string;
  rate: string;   // e.g., '+0%', '-10%', '+20%'
  pitch: string;  // e.g., '+0Hz', '-5Hz', '+10Hz'
}

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  voice: process.env.VIDEO_VOICE || 'en-US-GuyNeural',
  rate: '+0%',
  pitch: '+0Hz',
};

/**
 * Get actual audio duration using ffprobe
 * Falls back to estimation if ffprobe is not available
 */
function getAudioDuration(filePath: string, text: string): number {
  try {
    const ffprobeCmd = ffprobePath.path || 'ffprobe';
    const result = execSync(
      `"${ffprobeCmd}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const duration = parseFloat(result.trim());
    if (!isNaN(duration) && duration > 0) {
      return Math.ceil(duration);
    }
  } catch {
    // Fall back to text-based estimate
  }

  return estimateAudioDuration(text);
}

/**
 * Estimate audio duration based on text length
 */
export function estimateAudioDuration(text: string): number {
  const words = text.split(/\s+/).filter((word) => word.length > 0).length;
  const wordsPerSecond = 2.2;
  return Math.max(3, Math.ceil(words / wordsPerSecond) + 1.5);
}

// Available Neural Voices grouped by language
export const AVAILABLE_VOICES: Record<string, { male: string[]; female: string[] }> = {
  english: {
    male: ['en-US-GuyNeural', 'en-US-ChristopherNeural', 'en-GB-RyanNeural', 'en-IN-PrabhatNeural'],
    female: ['en-US-JennyNeural', 'en-US-AriaNeural', 'en-US-SaraNeural', 'en-GB-SoniaNeural'],
  },
  tamil: {
    male: ['ta-IN-ValluvarNeural'],
    female: ['ta-IN-PallaviNeural'],
  },
};

// Internal cache for dynamic voices
let cachedVoices: Record<string, VoiceMetadata[]> | null = null;

// Default voice mapping for specific language keys
export const LANGUAGE_DEFAULTS: Record<string, string> = {
  tamil: 'ta-IN-PallaviNeural',
  hindi: 'hi-IN-SwararaNeural',
  spanish: 'es-ES-ElviraNeural',
  french: 'fr-FR-DeniseNeural',
  german: 'de-DE-KatjaNeural',
  english: 'en-US-JennyNeural',
};

interface EdgeTtsRuntime {
  command: string;
  argsPrefix: string[];
  label: string;
}

let resolvedEdgeTtsRuntime: EdgeTtsRuntime | null = null;

function fileExists(filePath: string | undefined): boolean {
  return Boolean(filePath && fs.existsSync(filePath));
}

function pushCandidate(
  candidates: EdgeTtsRuntime[],
  seen: Set<string>,
  candidate: EdgeTtsRuntime
): void {
  const key = `${candidate.command}::${candidate.argsPrefix.join(' ')}`;
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  candidates.push(candidate);
}

function windowsInstalledPythonDirs(): string[] {
  if (process.platform !== 'win32') {
    return [];
  }

  const roots = new Set<string>();
  const localPrograms = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Python')
    : '';
  const userPrograms = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Programs', 'Python')
    : '';

  if (localPrograms) {
    roots.add(localPrograms);
  }
  if (userPrograms) {
    roots.add(userPrograms);
  }

  const pythonDirs: string[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      continue;
    }

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && /^Python\d+/i.test(entry.name)) {
        pythonDirs.push(path.join(root, entry.name));
      }
    }
  }

  return pythonDirs.sort().reverse();
}

function edgeTtsCandidates(): EdgeTtsRuntime[] {
  const candidates: EdgeTtsRuntime[] = [];
  const seen = new Set<string>();
  const configuredPath = process.env.EDGE_TTS_PATH?.trim();

  if (configuredPath) {
    pushCandidate(candidates, seen, {
      command: configuredPath,
      argsPrefix: [],
      label: configuredPath,
    });
  }

  pushCandidate(candidates, seen, { command: 'edge-tts', argsPrefix: [], label: 'edge-tts' });

  for (const pythonDir of windowsInstalledPythonDirs()) {
    const edgeExe = path.join(pythonDir, 'Scripts', 'edge-tts.exe');
    if (fileExists(edgeExe)) {
      pushCandidate(candidates, seen, {
        command: edgeExe,
        argsPrefix: [],
        label: edgeExe,
      });
    }

    const pythonExe = path.join(pythonDir, 'python.exe');
    if (fileExists(pythonExe)) {
      pushCandidate(candidates, seen, {
        command: pythonExe,
        argsPrefix: ['-m', 'edge_tts'],
        label: `${pythonExe} -m edge_tts`,
      });
    }
  }

  pushCandidate(candidates, seen, { command: 'py', argsPrefix: ['-m', 'edge_tts'], label: 'py -m edge_tts' });
  pushCandidate(candidates, seen, { command: 'python', argsPrefix: ['-m', 'edge_tts'], label: 'python -m edge_tts' });
  pushCandidate(candidates, seen, { command: 'python3', argsPrefix: ['-m', 'edge_tts'], label: 'python3 -m edge_tts' });

  return candidates;
}

function resolveEdgeTtsRuntime(): EdgeTtsRuntime | null {
  if (resolvedEdgeTtsRuntime) {
    return resolvedEdgeTtsRuntime;
  }

  for (const candidate of edgeTtsCandidates()) {
    const probe = spawnSync(candidate.command, [...candidate.argsPrefix, '--help'], {
      encoding: 'utf-8',
      stdio: 'pipe',
      shell: false,
    });

    if (probe.status === 0) {
      resolvedEdgeTtsRuntime = candidate;
      return candidate;
    }
  }

  return null;
}

function runEdgeTts(args: string[], timeout = 60000): string {
  const runtime = resolveEdgeTtsRuntime();
  if (!runtime) {
    throw new Error('Edge-TTS is not installed. Install it with: pip install edge-tts');
  }

  const result = spawnSync(runtime.command, [...runtime.argsPrefix, ...args], {
    encoding: 'utf-8',
    stdio: 'pipe',
    shell: false,
    timeout,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(stderr || stdout || `Edge-TTS exited with status ${result.status}`);
  }

  return result.stdout || '';
}

/**
 * Fetch and parse all available voices from Edge-TTS CLI
 */
export function getDynamicVoices(): Record<string, VoiceMetadata[]> {
  if (cachedVoices) {
    return cachedVoices;
  }

  try {
    const output = runEdgeTts(['--list-voices']);
    const lines = output.split('\n');
    const voicesByLang: Record<string, VoiceMetadata[]> = {};

    for (const line of lines) {
      const match = line.match(/^(\S+)\s+(Male|Female)\s+(\S+)\s*(.*)?$/);
      if (!match) {
        continue;
      }

      const [, name, gender, category, tags] = match;
      const locale = name.split('-').slice(0, 2).join('-');
      if (!voicesByLang[locale]) {
        voicesByLang[locale] = [];
      }

      voicesByLang[locale].push({
        name,
        gender: gender as 'Male' | 'Female',
        language: locale,
        category,
        tags: tags ? tags.split(',').map((tag) => tag.trim()) : [],
      });
    }

    if (Object.keys(voicesByLang).length === 0) {
      throw new Error('Edge-TTS returned no parseable voices.');
    }

    cachedVoices = voicesByLang;
    return voicesByLang;
  } catch (error: any) {
    console.error(`[VOICE-GEN] Failed to fetch dynamic voices: ${error.message}`);
    return {
      'en-US': [
        { name: 'en-US-JennyNeural', gender: 'Female', language: 'en-US' },
        { name: 'en-US-GuyNeural', gender: 'Male', language: 'en-US' },
      ],
    };
  }
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Audio result with path and actual duration
 */
export interface AudioResult {
  path: string;
  duration: number;
}

/**
 * Validate that Edge-TTS is accessible
 */
export function validateEdgeTTS(): boolean {
  try {
    const runtime = resolveEdgeTtsRuntime();
    if (!runtime) {
      console.error('\n[VOICE-GEN] Edge-TTS not found. Install it with: pip install edge-tts');
      return false;
    }

    runEdgeTts(['--help']);
    return true;
  } catch (error: any) {
    console.error(`\n[VOICE-GEN] Edge-TTS validation failed: ${error.message}`);
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate voiceover for all scenes using Edge-TTS
 */
export async function generateVoiceovers(
  scenes: Scene[],
  outputDir: string,
  config: VoiceConfig = DEFAULT_VOICE_CONFIG
): Promise<Map<number, AudioResult>> {
  console.log('\n[VOICE-GEN] ================================================');
  console.log('[VOICE-GEN] Starting voiceover generation (Edge-TTS)...');
  console.log(`[VOICE-GEN] Total scenes: ${scenes.length}`);
  console.log(`[VOICE-GEN] Voice: ${config.voice}`);
  console.log('[VOICE-GEN] ================================================\n');

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
  let silentCount = 0;
  const failedScenes: number[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    writeProgress(`\r[VOICE-GEN] Processing scene ${i + 1}/${scenes.length}...`);

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
      console.error(`\n[VOICE-GEN] Scene ${scene.sceneNumber} failed after ${MAX_RETRIES} retries: ${error.message}`);
      failCount++;
      failedScenes.push(scene.sceneNumber);

      const fallbackDuration = estimateAudioDuration(scene.voiceoverText);
      audioFiles.set(scene.sceneNumber, {
        path: '',
        duration: fallbackDuration,
      });
    }
  }

  const elapsed = Date.now() - startTime;
  console.log('\n\n[VOICE-GEN] ================================================');
  console.log('[VOICE-GEN] Voiceover generation complete');
  console.log(`[VOICE-GEN] Total time: ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`[VOICE-GEN] Successful: ${successCount}/${scenes.length}`);
  if (silentCount > 0) {
    console.log(`[VOICE-GEN] Silent scenes: ${silentCount}`);
  }
  if (failedScenes.length > 0) {
    console.log(`[VOICE-GEN] Failed scene numbers: ${failedScenes.join(', ')}`);
  }
  console.log('[VOICE-GEN] ================================================\n');

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
    } catch {
      // Re-generate if cached file looks broken
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

  try {
    runEdgeTts([
      '--voice', config.voice,
      `--rate=${config.rate}`,
      `--pitch=${config.pitch}`,
      '--text', cleanText,
      '--write-media', outputPath,
    ]);

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
      try {
        fs.unlinkSync(outputPath);
      } catch {
        // Ignore cleanup failure
      }
    }

    throw new Error(`Edge-TTS failed for scene ${scene.sceneNumber}: ${error.message}`);
  }
}
