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
  language?: string;
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

export interface VoiceEngineStatus {
  activeEngine: 'edge-tts' | 'windows-sapi-fallback' | 'gtts-fallback' | 'unavailable';
  detail: string;
  edgeTtsReady: boolean;
  fallbackReady: boolean;
  generationReady: boolean;
}

interface WindowsSapiStatus {
  ready: boolean;
  detail: string;
}

let resolvedEdgeTtsRuntime: EdgeTtsRuntime | null = null;
let checkedGttsAvailability: boolean | null = null;
let cachedWindowsSapiStatus: WindowsSapiStatus | null = null;
let loggedEdgeTtsResolutionFailure = false;

const GTTS_LANGUAGE_MAP: Record<string, string> = {
  arabic: 'ar',
  chinese: 'zh-cn',
  english: 'en',
  french: 'fr',
  german: 'de',
  hindi: 'hi',
  indonesian: 'id',
  italian: 'it',
  japanese: 'ja',
  korean: 'ko',
  portuguese: 'pt',
  russian: 'ru',
  spanish: 'es',
  tamil: 'ta',
  thai: 'th',
  turkish: 'tr',
  vietnamese: 'vi',
};

const WINDOWS_SAPI_LANGUAGE_MAP: Record<string, string> = {
  arabic: 'ar-SA',
  chinese: 'zh-CN',
  english: 'en-US',
  french: 'fr-FR',
  german: 'de-DE',
  hindi: 'hi-IN',
  italian: 'it-IT',
  japanese: 'ja-JP',
  korean: 'ko-KR',
  portuguese: 'pt-BR',
  russian: 'ru-RU',
  spanish: 'es-ES',
  tamil: 'ta-IN',
};

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

  // Check bundled portable-python in ALL possible locations (for packaged Electron app)
  const { resolveProjectPath, resolveResourcePath } = require('../runtime');
  const bundledPaths = [
    resolveProjectPath('portable-python', 'python.exe'),                          // dev mode: projectRoot/portable-python/
    resolveResourcePath('app-bundle', 'portable-python', 'python.exe'),           // packaged: resources/app-bundle/portable-python/
    resolveResourcePath('portable-python', 'python.exe'),                         // legacy fallback: resources/portable-python/
    path.join((process as any).resourcesPath || '', 'app-bundle', 'portable-python', 'python.exe'), // direct native path
    path.join((process as any).resourcesPath || '', 'portable-python', 'python.exe'),               // direct native legacy
  ];

  // Deduplicate and check each candidate
  const checkedPythonPaths = new Set<string>();
  for (const bundledPython of bundledPaths) {
    if (!bundledPython || checkedPythonPaths.has(bundledPython)) continue;
    checkedPythonPaths.add(bundledPython);

    if (fileExists(bundledPython)) {
      console.log(`[VOICE-GEN] Found bundled Python at: ${bundledPython}`);
      // Direct edge-tts.exe in Scripts folder
      const bundledEdgeTts = path.join(path.dirname(bundledPython), 'Scripts', 'edge-tts.exe');
      if (fileExists(bundledEdgeTts)) {
        pushCandidate(candidates, seen, {
          command: bundledEdgeTts,
          argsPrefix: [],
          label: `bundled: ${bundledEdgeTts}`,
        });
      }
      // Python module fallback
      pushCandidate(candidates, seen, {
        command: bundledPython,
        argsPrefix: ['-m', 'edge_tts'],
        label: `bundled: ${bundledPython} -m edge_tts`,
      });
    }
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

  const allCandidates = edgeTtsCandidates();
  const diagnostics: string[] = [];

  for (const candidate of allCandidates) {
    const probe = spawnSync(candidate.command, [...candidate.argsPrefix, '--help'], {
      encoding: 'utf-8',
      stdio: 'pipe',
      shell: false,
    });

    if (probe.status === 0) {
      console.log(`[VOICE-GEN] Resolved edge-tts runtime: ${candidate.label}`);
      resolvedEdgeTtsRuntime = candidate;
      return candidate;
    }

    // Collect diagnostic info for failure reporting
    const reason = probe.error
      ? `spawn error: ${probe.error.message}`
      : `exit code ${probe.status}`;
    diagnostics.push(`  ✗ ${candidate.label} → ${reason}`);
  }

  if (!loggedEdgeTtsResolutionFailure) {
    loggedEdgeTtsResolutionFailure = true;
    // Log all diagnostic info so it shows up in error details
  console.error('[VOICE-GEN] ═══════ EDGE-TTS RESOLUTION FAILED ═══════');
  console.error('[VOICE-GEN] No working edge-tts runtime found.');
  console.error('[VOICE-GEN] Candidates tried:');
  for (const line of diagnostics) {
    console.error(`[VOICE-GEN] ${line}`);
  }
  console.error(`[VOICE-GEN] ELECTRON_BACKEND_SERVER=${process.env.ELECTRON_BACKEND_SERVER || 'unset'}`);
  console.error(`[VOICE-GEN] ELECTRON_RESOURCES_PATH=${process.env.ELECTRON_RESOURCES_PATH || 'unset'}`);
  console.error(`[VOICE-GEN] process.resourcesPath=${(process as any).resourcesPath || 'unset'}`);
  console.error(`[VOICE-GEN] __dirname=${__dirname}`);
  console.error(`[VOICE-GEN] cwd=${process.cwd()}`);
  console.error('[VOICE-GEN] ═══════════════════════════════════════════');

  }

  return null;
}

function canUseGttsFallback(): boolean {
  if (checkedGttsAvailability !== null) {
    return checkedGttsAvailability;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Gtts = require('gtts');
    checkedGttsAvailability = typeof Gtts === 'function';
  } catch {
    checkedGttsAvailability = false;
  }

  return checkedGttsAvailability;
}

function runningInPackagedDesktopMode(): boolean {
  return process.env.ELECTRON_BACKEND_SERVER === '1' || Boolean(process.env.ELECTRON_RESOURCES_PATH);
}

function buildVoiceEngineUnavailableMessage(): string {
  if (process.platform === 'win32' && runningInPackagedDesktopMode()) {
    return 'No working voice engine was found. Reinstall or repair the desktop app, or install at least one Windows text-to-speech voice in Settings > Time & language > Speech.';
  }

  if (runningInPackagedDesktopMode()) {
    return 'No working voice engine was found. Reinstall or repair the desktop app, or use the setup screen to restore the bundled voice engine.';
  }

  return 'No working voice engine was found. Install edge-tts with: pip install edge-tts';
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function readSpawnOutput(output: string | Uint8Array | null | undefined): string {
  if (!output) {
    return '';
  }

  return typeof output === 'string'
    ? output.trim()
    : Buffer.from(output).toString('utf8').trim();
}

function runPowerShellEncoded(
  script: string,
  envOverrides: NodeJS.ProcessEnv = process.env,
  timeout = 30000
): ReturnType<typeof spawnSync> {
  return spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShellCommand(script)],
    {
      encoding: 'utf-8',
      env: envOverrides,
      shell: false,
      stdio: 'pipe',
      timeout,
      windowsHide: true,
    }
  );
}

function getWindowsSapiStatus(): WindowsSapiStatus {
  if (cachedWindowsSapiStatus) {
    return cachedWindowsSapiStatus;
  }

  if (process.platform !== 'win32') {
    cachedWindowsSapiStatus = {
      ready: false,
      detail: 'Windows offline speech is only available on Windows.',
    };
    return cachedWindowsSapiStatus;
  }

  const probe = runPowerShellEncoded(`
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled })
  if ($voices.Count -le 0) {
    throw 'No enabled Windows speech voices are installed.'
  }
  Write-Output $voices[0].VoiceInfo.Name
} finally {
  $synth.Dispose()
}
  `);

  if (probe.status === 0) {
    const voiceName = readSpawnOutput(probe.stdout) || 'Windows offline speech voice';
    cachedWindowsSapiStatus = {
      ready: true,
      detail: `Using Windows offline speech via ${voiceName}`,
    };
    return cachedWindowsSapiStatus;
  }

  const detail = probe.error?.message
    || readSpawnOutput(probe.stderr)
    || readSpawnOutput(probe.stdout)
    || 'Windows offline speech is unavailable.';
  cachedWindowsSapiStatus = {
    ready: false,
    detail,
  };
  return cachedWindowsSapiStatus;
}

export function getVoiceEngineStatus(): VoiceEngineStatus {
  const edgeRuntime = resolveEdgeTtsRuntime();
  const windowsSapi = getWindowsSapiStatus();
  const gttsReady = canUseGttsFallback();

  if (edgeRuntime) {
    return {
      activeEngine: 'edge-tts',
      detail: `Using Edge-TTS via ${edgeRuntime.label}`,
      edgeTtsReady: true,
      fallbackReady: windowsSapi.ready || gttsReady,
      generationReady: true,
    };
  }

  if (windowsSapi.ready) {
    return {
      activeEngine: 'windows-sapi-fallback',
      detail: `Edge-TTS is unavailable, so the app will fall back to ${windowsSapi.detail.replace(/^Using\s+/i, '')}.`,
      edgeTtsReady: false,
      fallbackReady: true,
      generationReady: true,
    };
  }

  if (gttsReady) {
    return {
      activeEngine: 'gtts-fallback',
      detail: 'Edge-TTS is unavailable, so the app will fall back to Google TTS.',
      edgeTtsReady: false,
      fallbackReady: true,
      generationReady: true,
    };
  }

  return {
    activeEngine: 'unavailable',
    detail: buildVoiceEngineUnavailableMessage(),
    edgeTtsReady: false,
    fallbackReady: false,
    generationReady: false,
  };
}

function runEdgeTts(args: string[], timeout = 60000): string {
  const runtime = resolveEdgeTtsRuntime();
  if (!runtime) {
    throw new Error(buildVoiceEngineUnavailableMessage());
  }

  const result = spawnSync(runtime.command, [...runtime.argsPrefix, ...args], {
    encoding: 'utf-8',
    stdio: 'pipe',
    shell: false,
    timeout,
  });

  if (result.error) {
    const cmdStr = `${runtime.command} ${runtime.argsPrefix.join(' ')} ${args.join(' ')}`;
    throw new Error(`Failed to spawn Edge-TTS: ${result.error.message}\nCommand: ${cmdStr}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const cmdStr = `${runtime.command} ${runtime.argsPrefix.join(' ')} ${args.join(' ')}`;
    throw new Error(`Edge-TTS failed (status ${result.status}).\nCommand: ${cmdStr}\nSTDERR: ${stderr}\nSTDOUT: ${stdout}`);
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
      console.error(`\n[VOICE-GEN] Edge-TTS not found. ${buildVoiceEngineUnavailableMessage()}`);
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

function getGttsLanguage(config: VoiceConfig): string {
  const requested = (config.language || '').toLowerCase().trim();
  if (requested && GTTS_LANGUAGE_MAP[requested]) {
    return GTTS_LANGUAGE_MAP[requested];
  }

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
  if (requested && WINDOWS_SAPI_LANGUAGE_MAP[requested]) {
    return WINDOWS_SAPI_LANGUAGE_MAP[requested];
  }

  const voicePrefix = config.voice.split('-').slice(0, 2).join('-');
  if (/^[a-z]{2}-[A-Z]{2}$/.test(voicePrefix)) {
    return voicePrefix;
  }

  return WINDOWS_SAPI_LANGUAGE_MAP.english;
}

function getWindowsSapiRate(config: VoiceConfig): number {
  const numericRate = Number.parseInt(config.rate.replace('%', ''), 10);
  if (!Number.isFinite(numericRate)) {
    return 0;
  }

  return Math.max(-10, Math.min(10, Math.round(numericRate / 10)));
}

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
  if (!fs.existsSync(outputPath)) {
    return null;
  }

  try {
    const stats = fs.statSync(outputPath);
    if (stats.size > 1000) {
      const duration = getAudioDuration(outputPath, text);
      return { path: outputPath, duration };
    }
  } catch {
    // Re-generate if cached file looks broken
  }

  return null;
}

function assertGeneratedAudioFile(outputPath: string): void {
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Output file not created: ${outputPath}`);
  }

  const stats = fs.statSync(outputPath);
  if (stats.size < 1000) {
    fs.unlinkSync(outputPath);
    throw new Error(`Output file too small (${stats.size} bytes), likely corrupted`);
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
  const voiceEngine = getVoiceEngineStatus();

  console.log('\n[VOICE-GEN] ================================================');
  console.log('[VOICE-GEN] Starting voiceover generation...');
  console.log(`[VOICE-GEN] Total scenes: ${scenes.length}`);
  console.log(`[VOICE-GEN] Voice: ${config.voice}`);
  console.log(`[VOICE-GEN] Engine: ${voiceEngine.activeEngine}`);
  console.log(`[VOICE-GEN] Detail: ${voiceEngine.detail}`);
  console.log('[VOICE-GEN] ================================================\n');

  if (!voiceEngine.generationReady) {
    throw new Error(voiceEngine.detail);
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
      // Determine scene-specific config
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
  config: VoiceConfig,
  voiceEngine: VoiceEngineStatus
): Promise<AudioResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (voiceEngine.activeEngine === 'edge-tts') {
        return await generateSceneVoiceover(scene, outputDir, config);
      }

      if (voiceEngine.activeEngine === 'windows-sapi-fallback') {
        return await generateSceneVoiceoverWithWindowsSapi(scene, outputDir, config);
      }

      return await generateSceneVoiceoverWithGtts(scene, outputDir, config);
    } catch (error: any) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
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

async function generateSceneVoiceoverWithWindowsSapi(
  scene: Scene,
  outputDir: string,
  config: VoiceConfig
): Promise<AudioResult> {
  const filename = `scene_${scene.sceneNumber}_voice.wav`;
  const outputPath = path.join(outputDir, filename);
  const existingAudio = resolveExistingAudio(outputPath, scene.voiceoverText);
  if (existingAudio) {
    return existingAudio;
  }

  const cleanText = cleanVoiceoverText(scene.voiceoverText);
  if (!cleanText) {
    return {
      path: '',
      duration: Math.max(3, scene.duration || 3),
    };
  }

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

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      const detail = readSpawnOutput(result.stderr) || readSpawnOutput(result.stdout) || `PowerShell exited with status ${result.status}`;
      throw new Error(detail);
    }

    assertGeneratedAudioFile(outputPath);
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

    throw new Error(`Windows offline speech failed for scene ${scene.sceneNumber}: ${error.message}`);
  } finally {
    if (fs.existsSync(inputTextPath)) {
      try {
        fs.unlinkSync(inputTextPath);
      } catch {
        // Ignore cleanup failure
      }
    }
  }
}

async function generateSceneVoiceoverWithGtts(
  scene: Scene,
  outputDir: string,
  config: VoiceConfig
): Promise<AudioResult> {
  const filename = `scene_${scene.sceneNumber}_voice.mp3`;
  const outputPath = path.join(outputDir, filename);
  const existingAudio = resolveExistingAudio(outputPath, scene.voiceoverText);
  if (existingAudio) {
    return existingAudio;
  }

  const cleanText = cleanVoiceoverText(scene.voiceoverText);

  if (!cleanText) {
    return {
      path: '',
      duration: Math.max(3, scene.duration || 3),
    };
  }

  const language = getGttsLanguage(config);

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Gtts = require('gtts');
    await new Promise<void>((resolve, reject) => {
      const tts = new Gtts(cleanText, language);
      const outputStream = fs.createWriteStream(outputPath);
      const inputStream = tts.stream();
      let settled = false;

      const finish = (error?: Error | null) => {
        if (settled) {
          return;
        }

        settled = true;
        if (error) {
          reject(error);
          return;
        }

        resolve();
      };

      inputStream.on('error', finish);
      outputStream.on('error', finish);
      outputStream.on('finish', () => finish());
      inputStream.pipe(outputStream);
    });

    assertGeneratedAudioFile(outputPath);
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

    throw new Error(`Fallback Google TTS failed for scene ${scene.sceneNumber}: ${error.message}`);
  }
}

async function generateSceneVoiceover(
  scene: Scene,
  outputDir: string,
  config: VoiceConfig
): Promise<AudioResult> {
  const filename = `scene_${scene.sceneNumber}_voice.mp3`;
  const outputPath = path.join(outputDir, filename);
  const existingAudio = resolveExistingAudio(outputPath, scene.voiceoverText);
  if (existingAudio) {
    return existingAudio;
  }

  const cleanText = cleanVoiceoverText(scene.voiceoverText);

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

    assertGeneratedAudioFile(outputPath);
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
