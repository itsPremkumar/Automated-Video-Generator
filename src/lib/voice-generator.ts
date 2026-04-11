/**
 * Voice generation pipeline: generates MP3/WAV audio for each scene using
 * Edge-TTS, Windows SAPI fallback, or gTTS fallback.
 *
 * Data    → voice-data.ts
 * Types   → voice-types.ts
 * Engine  → voice-engine.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { logError, logInfo, logWarn, writeProgress } from '../runtime';
import { Scene } from './script-parser';

// @ts-ignore - ffprobe-static types
import ffprobePath from 'ffprobe-static';

import { AudioResult, VoiceConfig, VoiceEngineStatus } from './voice-types';
import {
  getVoiceEngineStatus,
  getWindowsSapiStatus,
  runEdgeTts,
  runPowerShellEncoded,
  readSpawnOutput,
} from './voice-engine';
import { GTTS_LANGUAGE_MAP, WINDOWS_SAPI_LANGUAGE_MAP } from './voice-data';

const console = {
  log: (...args: unknown[]) => logInfo(...args),
  warn: (...args: unknown[]) => logWarn(...args),
  error: (...args: unknown[]) => logError(...args),
};

// ─── Re-exports for backward compatibility ────────────────────────────────────

export { LOCALE_TO_LANGUAGE_NAME, AVAILABLE_VOICES, LANGUAGE_DEFAULTS } from './voice-data';
export { getDynamicVoices } from './voice-engine';
export { getVoiceEngineStatus } from './voice-engine';
export type { VoiceMetadata, VoiceConfig, AudioResult, VoiceEngineStatus } from './voice-types';

// ─── Default config ───────────────────────────────────────────────────────────

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  voice: process.env.VIDEO_VOICE || 'en-US-GuyNeural',
  rate: '+0%',
  pitch: '+0Hz',
};

// ─── Retry config ─────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ─── Duration helpers ─────────────────────────────────────────────────────────

export function estimateAudioDuration(text: string): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0).length;
  return Math.max(3, Math.ceil(words / 2.2) + 1.5);
}

function getAudioDuration(filePath: string, text: string): number {
  try {
    const ffprobeCmd = ffprobePath.path || 'ffprobe';
    const result = execSync(
      `"${ffprobeCmd}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const duration = parseFloat(result.trim());
    if (!isNaN(duration) && duration > 0) return Math.ceil(duration);
  } catch {
    // fall through to estimate
  }
  return estimateAudioDuration(text);
}

// ─── Text / file helpers ──────────────────────────────────────────────────────

function cleanVoiceoverText(text: string): string {
  return text
    .replace(/"/g, "'")
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/`/g, "'")
    .replace(/\$/g, '')
    .replace(/[<>|&^]/g, '')
    .trim();
}

function resolveExistingAudio(outputPath: string, text: string): AudioResult | null {
  if (!fs.existsSync(outputPath)) return null;
  try {
    const stats = fs.statSync(outputPath);
    if (stats.size > 1000) return { path: outputPath, duration: getAudioDuration(outputPath, text) };
  } catch {
    // re-generate if cached file looks broken
  }
  return null;
}

function assertGeneratedAudioFile(outputPath: string): void {
  if (!fs.existsSync(outputPath)) throw new Error(`Output file not created: ${outputPath}`);
  const stats = fs.statSync(outputPath);
  if (stats.size < 1000) {
    fs.unlinkSync(outputPath);
    throw new Error(`Output file too small (${stats.size} bytes), likely corrupted`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Engine-specific language helpers ────────────────────────────────────────

function getGttsLanguage(config: VoiceConfig): string {
  const requested = (config.language || '').toLowerCase().trim();
  if (requested && GTTS_LANGUAGE_MAP[requested]) return GTTS_LANGUAGE_MAP[requested];

  const voicePrefix = config.voice.split('-').slice(0, 2).join('-').toLowerCase();
  if (voicePrefix.startsWith('ta-')) return 'ta';
  if (voicePrefix.startsWith('hi-')) return 'hi';
  if (voicePrefix.startsWith('es-')) return 'es';
  if (voicePrefix.startsWith('fr-')) return 'fr';
  if (voicePrefix.startsWith('de-')) return 'de';
  if (voicePrefix.startsWith('pt-')) return 'pt';
  if (voicePrefix.startsWith('ja-')) return 'ja';
  if (voicePrefix.startsWith('ko-')) return 'ko';
  if (voicePrefix.startsWith('it-')) return 'it';
  if (voicePrefix.startsWith('ru-')) return 'ru';
  return 'en';
}

function getWindowsVoiceCulture(config: VoiceConfig): string {
  const requested = (config.language || '').toLowerCase().trim();
  if (requested && WINDOWS_SAPI_LANGUAGE_MAP[requested]) return WINDOWS_SAPI_LANGUAGE_MAP[requested];

  const voicePrefix = config.voice.split('-').slice(0, 2).join('-');
  if (/^[a-z]{2}-[A-Z]{2}$/.test(voicePrefix)) return voicePrefix;
  return WINDOWS_SAPI_LANGUAGE_MAP.english;
}

function getWindowsSapiRate(config: VoiceConfig): number {
  const numericRate = Number.parseInt(config.rate.replace('%', ''), 10);
  if (!Number.isFinite(numericRate)) return 0;
  return Math.max(-10, Math.min(10, Math.round(numericRate / 10)));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function validateEdgeTTS(): boolean {
  try {
    const status = getVoiceEngineStatus();
    if (!status.edgeTtsReady) {
      console.error(`\n[VOICE-GEN] Edge-TTS not found. ${status.detail}`);
      return false;
    }
    runEdgeTts(['--help']);
    return true;
  } catch (error: any) {
    console.error(`\n[VOICE-GEN] Edge-TTS validation failed: ${error.message}`);
    return false;
  }
}

export function isVoiceGenerationReady(): boolean {
  return getVoiceEngineStatus().generationReady;
}

export async function generateVoiceovers(
  scenes: Scene[],
  outputDir: string,
  config: VoiceConfig = DEFAULT_VOICE_CONFIG
): Promise<Map<number, AudioResult>> {
  const voiceEngine = getVoiceEngineStatus();

  console.log('\n[VOICE-GEN] ================================================');
  console.log('[VOICE-GEN] Starting voiceover generation...');
  console.log(`[VOICE-GEN] Total scenes: ${scenes.length}`);
  console.log(`[VOICE-GEN] Voice: ${config.voice}`);
  console.log(`[VOICE-GEN] Engine: ${voiceEngine.activeEngine}`);
  console.log(`[VOICE-GEN] Detail: ${voiceEngine.detail}`);
  console.log('[VOICE-GEN] ================================================\n');

  if (!voiceEngine.generationReady) throw new Error(voiceEngine.detail);

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const audioFiles = new Map<number, AudioResult>();
  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;
  let silentCount = 0;
  const failedScenes: number[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    writeProgress(`\r[VOICE-GEN] Processing scene ${i + 1}/${scenes.length}...`);

    try {
      const sceneConfig = { ...config };
      if (scene.voiceConfig) {
        if (scene.voiceConfig.voice) sceneConfig.voice = scene.voiceConfig.voice;
        if (scene.voiceConfig.rate !== undefined) {
          sceneConfig.rate = (scene.voiceConfig.rate >= 0 ? '+' : '') + scene.voiceConfig.rate + '%';
        }
        if (scene.voiceConfig.pitch !== undefined) {
          sceneConfig.pitch = (scene.voiceConfig.pitch >= 0 ? '+' : '') + scene.voiceConfig.pitch + 'Hz';
        }
      }

      const result = await generateSceneVoiceoverWithRetry(scene, outputDir, sceneConfig, voiceEngine);
      audioFiles.set(scene.sceneNumber, result);

      if (result.path) {
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
      audioFiles.set(scene.sceneNumber, { path: '', duration: estimateAudioDuration(scene.voiceoverText) });
    }
  }

  const elapsed = Date.now() - startTime;
  console.log('\n\n[VOICE-GEN] ================================================');
  console.log('[VOICE-GEN] Voiceover generation complete');
  console.log(`[VOICE-GEN] Total time: ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`[VOICE-GEN] Successful: ${successCount}/${scenes.length}`);
  if (silentCount > 0) console.log(`[VOICE-GEN] Silent scenes: ${silentCount}`);
  if (failedScenes.length > 0) console.log(`[VOICE-GEN] Failed scene numbers: ${failedScenes.join(', ')}`);
  console.log('[VOICE-GEN] ================================================\n');

  if (failCount > scenes.length * 0.5) {
    throw new Error(`Too many voice generation failures: ${failCount}/${scenes.length} scenes failed.`);
  }

  return audioFiles;
}

// ─── Scene-level generation with retry ───────────────────────────────────────

async function generateSceneVoiceoverWithRetry(
  scene: Scene,
  outputDir: string,
  config: VoiceConfig,
  voiceEngine: VoiceEngineStatus
): Promise<AudioResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (voiceEngine.activeEngine === 'edge-tts') return await generateSceneVoiceover(scene, outputDir, config);
      if (voiceEngine.activeEngine === 'windows-sapi-fallback') return await generateSceneVoiceoverWithWindowsSapi(scene, outputDir, config);
      return await generateSceneVoiceoverWithGtts(scene, outputDir, config);
    } catch (error: any) {
      lastError = error;
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  if (voiceEngine.activeEngine === 'edge-tts' && voiceEngine.fallbackReady) {
    const windowsSapi = getWindowsSapiStatus();
    if (windowsSapi.ready) {
      console.log(`[VOICE-GEN] Falling back to Windows offline speech for scene ${scene.sceneNumber} after Edge-TTS retries failed.`);
      return generateSceneVoiceoverWithWindowsSapi(scene, outputDir, config);
    }
    console.log(`[VOICE-GEN] Falling back to Google TTS for scene ${scene.sceneNumber} after Edge-TTS retries failed.`);
    return generateSceneVoiceoverWithGtts(scene, outputDir, config);
  }

  throw lastError || new Error('Voice generation failed after all retries');
}

// ─── Edge-TTS scene generation ────────────────────────────────────────────────

async function generateSceneVoiceover(
  scene: Scene,
  outputDir: string,
  config: VoiceConfig
): Promise<AudioResult> {
  const outputPath = path.join(outputDir, `scene_${scene.sceneNumber}_voice.mp3`);
  const existingAudio = resolveExistingAudio(outputPath, scene.voiceoverText);
  if (existingAudio) return existingAudio;

  const cleanText = cleanVoiceoverText(scene.voiceoverText);
  if (!cleanText) return { path: '', duration: Math.max(3, scene.duration || 3) };
  if (cleanText.length < 2) throw new Error(`Scene ${scene.sceneNumber} has empty or invalid text`);

  try {
    runEdgeTts([
      '--voice', config.voice,
      `--rate=${config.rate}`,
      `--pitch=${config.pitch}`,
      '--text', cleanText,
      '--write-media', outputPath,
    ]);
    assertGeneratedAudioFile(outputPath);
    return { path: outputPath, duration: getAudioDuration(outputPath, scene.voiceoverText) };
  } catch (error: any) {
    if (fs.existsSync(outputPath)) try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
    throw new Error(`Edge-TTS failed for scene ${scene.sceneNumber}: ${error.message}`);
  }
}

// ─── Windows SAPI scene generation ───────────────────────────────────────────

async function generateSceneVoiceoverWithWindowsSapi(
  scene: Scene,
  outputDir: string,
  config: VoiceConfig
): Promise<AudioResult> {
  const outputPath = path.join(outputDir, `scene_${scene.sceneNumber}_voice.wav`);
  const existingAudio = resolveExistingAudio(outputPath, scene.voiceoverText);
  if (existingAudio) return existingAudio;

  const cleanText = cleanVoiceoverText(scene.voiceoverText);
  if (!cleanText) return { path: '', duration: Math.max(3, scene.duration || 3) };

  const inputTextPath = path.join(outputDir, `scene_${scene.sceneNumber}_voice.txt`);

  try {
    fs.writeFileSync(inputTextPath, cleanText, 'utf8');

    const result = runPowerShellEncoded(
      `
Add-Type -AssemblyName System.Speech
$textPath = $env:AVGEN_TTS_TEXT_PATH
$outputPath = $env:AVGEN_TTS_OUTPUT_PATH
$preferredCulture = $env:AVGEN_TTS_CULTURE
$rateValue = [int]$env:AVGEN_TTS_RATE
if (-not (Test-Path -LiteralPath $textPath)) {
  throw "Voice text file is missing: $textPath"
}
$text = [System.IO.File]::ReadAllText($textPath)
if ([string]::IsNullOrWhiteSpace($text)) {
  throw 'Voice text is empty.'
}
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled })
  if ($voices.Count -le 0) {
    throw 'No enabled Windows speech voices are installed.'
  }
  $selected = $null
  if (-not [string]::IsNullOrWhiteSpace($preferredCulture)) {
    $preferredLanguage = $preferredCulture.Split('-')[0].ToLowerInvariant()
    $selected = $voices | Where-Object {
      $_.VoiceInfo.Culture.Name -eq $preferredCulture -or $_.VoiceInfo.Culture.TwoLetterISOLanguageName.ToLowerInvariant() -eq $preferredLanguage
    } | Select-Object -First 1
  }
  if (-not $selected) {
    $selected = $voices | Select-Object -First 1
  }
  $synth.SelectVoice($selected.VoiceInfo.Name)
  $synth.Rate = [Math]::Max(-10, [Math]::Min(10, $rateValue))
  $outputDir = Split-Path -Parent $outputPath
  if (-not (Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
  }
  $synth.SetOutputToWaveFile($outputPath)
  $synth.Speak($text)
  Write-Output $selected.VoiceInfo.Name
} finally {
  $synth.Dispose()
}
      `,
      {
        ...process.env,
        AVGEN_TTS_TEXT_PATH: inputTextPath,
        AVGEN_TTS_OUTPUT_PATH: outputPath,
        AVGEN_TTS_CULTURE: getWindowsVoiceCulture(config),
        AVGEN_TTS_RATE: String(getWindowsSapiRate(config)),
      },
      120000
    );

    if (result.error) throw result.error;
    if (result.status !== 0) {
      const detail = readSpawnOutput(result.stderr) || readSpawnOutput(result.stdout) || `PowerShell exited with status ${result.status}`;
      throw new Error(detail);
    }

    assertGeneratedAudioFile(outputPath);
    return { path: outputPath, duration: getAudioDuration(outputPath, scene.voiceoverText) };
  } catch (error: any) {
    if (fs.existsSync(outputPath)) try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
    throw new Error(`Windows offline speech failed for scene ${scene.sceneNumber}: ${error.message}`);
  } finally {
    if (fs.existsSync(inputTextPath)) try { fs.unlinkSync(inputTextPath); } catch { /* ignore */ }
  }
}

// ─── gTTS scene generation ────────────────────────────────────────────────────

async function generateSceneVoiceoverWithGtts(
  scene: Scene,
  outputDir: string,
  config: VoiceConfig
): Promise<AudioResult> {
  const outputPath = path.join(outputDir, `scene_${scene.sceneNumber}_voice.mp3`);
  const existingAudio = resolveExistingAudio(outputPath, scene.voiceoverText);
  if (existingAudio) return existingAudio;

  const cleanText = cleanVoiceoverText(scene.voiceoverText);
  if (!cleanText) return { path: '', duration: Math.max(3, scene.duration || 3) };

  const language = getGttsLanguage(config);

  try {
    const Gtts = require('gtts');
    await new Promise<void>((resolve, reject) => {
      const tts = new Gtts(cleanText, language);
      const outputStream = fs.createWriteStream(outputPath);
      const inputStream = tts.stream();
      let settled = false;

      const finish = (error?: Error | null) => {
        if (settled) return;
        settled = true;
        error ? reject(error) : resolve();
      };

      inputStream.on('error', finish);
      outputStream.on('error', finish);
      outputStream.on('finish', () => finish());
      inputStream.pipe(outputStream);
    });

    assertGeneratedAudioFile(outputPath);
    return { path: outputPath, duration: getAudioDuration(outputPath, scene.voiceoverText) };
  } catch (error: any) {
    if (fs.existsSync(outputPath)) try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
    throw new Error(`Fallback Google TTS failed for scene ${scene.sceneNumber}: ${error.message}`);
  }
}
