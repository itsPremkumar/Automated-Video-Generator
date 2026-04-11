/**
 * Voice engine runtime: resolves the active Edge-TTS binary, probes fallbacks
 * (Windows SAPI, gTTS), runs Edge-TTS commands, and fetches dynamic voice lists.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { logError, logInfo, logWarn } from '../runtime';
import {
  EdgeTtsRuntime,
  VoiceEngineStatus,
  VoiceMetadata,
  WindowsSapiStatus,
} from './voice-types';

const console = {
  log: (...args: unknown[]) => logInfo(...args),
  warn: (...args: unknown[]) => logWarn(...args),
  error: (...args: unknown[]) => logError(...args),
};

// ─── Module-level caches ──────────────────────────────────────────────────────

let resolvedEdgeTtsRuntime: EdgeTtsRuntime | null = null;
let checkedGttsAvailability: boolean | null = null;
let cachedWindowsSapiStatus: WindowsSapiStatus | null = null;
let cachedVoices: Record<string, VoiceMetadata[]> | null = null;
let loggedEdgeTtsResolutionFailure = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileExists(filePath: string | undefined): boolean {
  return Boolean(filePath && fs.existsSync(filePath));
}

function pushCandidate(
  candidates: EdgeTtsRuntime[],
  seen: Set<string>,
  candidate: EdgeTtsRuntime
): void {
  const key = `${candidate.command}::${candidate.argsPrefix.join(' ')}`;
  if (!seen.has(key)) {
    seen.add(key);
    candidates.push(candidate);
  }
}

export function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

export function readSpawnOutput(output: string | Uint8Array | null | undefined): string {
  if (!output) return '';
  return typeof output === 'string'
    ? output.trim()
    : Buffer.from(output).toString('utf8').trim();
}

export function runPowerShellEncoded(
  script: string,
  envOverrides: NodeJS.ProcessEnv = process.env,
  timeout = 30000
): ReturnType<typeof spawnSync> {
  return spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShellCommand(script)],
    { encoding: 'utf-8', env: envOverrides, shell: false, stdio: 'pipe', timeout, windowsHide: true }
  );
}

export function runningInPackagedDesktopMode(): boolean {
  return process.env.ELECTRON_BACKEND_SERVER === '1' || Boolean(process.env.ELECTRON_RESOURCES_PATH);
}

// ─── Windows installed Python discovery ───────────────────────────────────────

function windowsInstalledPythonDirs(): string[] {
  if (process.platform !== 'win32') return [];

  const roots = new Set<string>();
  const localPrograms = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Python')
    : '';
  const userPrograms = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Programs', 'Python')
    : '';

  if (localPrograms) roots.add(localPrograms);
  if (userPrograms) roots.add(userPrograms);

  const pythonDirs: string[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && /^Python\d+/i.test(entry.name)) {
        pythonDirs.push(path.join(root, entry.name));
      }
    }
  }
  return pythonDirs.sort().reverse();
}

// ─── Edge-TTS candidate resolution ───────────────────────────────────────────

function edgeTtsCandidates(): EdgeTtsRuntime[] {
  const candidates: EdgeTtsRuntime[] = [];
  const seen = new Set<string>();
  const configuredPath = process.env.EDGE_TTS_PATH?.trim();

  if (configuredPath) {
    pushCandidate(candidates, seen, { command: configuredPath, argsPrefix: [], label: configuredPath });
  }

  const { resolveProjectPath, resolveResourcePath } = require('../runtime');
  const bundledPaths = [
    resolveProjectPath('portable-python', 'python.exe'),
    resolveResourcePath('app-bundle', 'portable-python', 'python.exe'),
    resolveResourcePath('portable-python', 'python.exe'),
    path.join((process as any).resourcesPath || '', 'app-bundle', 'portable-python', 'python.exe'),
    path.join((process as any).resourcesPath || '', 'portable-python', 'python.exe'),
  ];

  const checkedPythonPaths = new Set<string>();
  for (const bundledPython of bundledPaths) {
    if (!bundledPython || checkedPythonPaths.has(bundledPython)) continue;
    checkedPythonPaths.add(bundledPython);

    if (fileExists(bundledPython)) {
      console.log(`[VOICE-ENGINE] Found bundled Python at: ${bundledPython}`);
      const bundledEdgeTts = path.join(path.dirname(bundledPython), 'Scripts', 'edge-tts.exe');
      if (fileExists(bundledEdgeTts)) {
        pushCandidate(candidates, seen, { command: bundledEdgeTts, argsPrefix: [], label: `bundled: ${bundledEdgeTts}` });
      }
      pushCandidate(candidates, seen, { command: bundledPython, argsPrefix: ['-m', 'edge_tts'], label: `bundled: ${bundledPython} -m edge_tts` });
    }
  }

  pushCandidate(candidates, seen, { command: 'edge-tts', argsPrefix: [], label: 'edge-tts' });

  for (const pythonDir of windowsInstalledPythonDirs()) {
    const edgeExe = path.join(pythonDir, 'Scripts', 'edge-tts.exe');
    if (fileExists(edgeExe)) {
      pushCandidate(candidates, seen, { command: edgeExe, argsPrefix: [], label: edgeExe });
    }
    const pythonExe = path.join(pythonDir, 'python.exe');
    if (fileExists(pythonExe)) {
      pushCandidate(candidates, seen, { command: pythonExe, argsPrefix: ['-m', 'edge_tts'], label: `${pythonExe} -m edge_tts` });
    }
  }

  pushCandidate(candidates, seen, { command: 'py', argsPrefix: ['-m', 'edge_tts'], label: 'py -m edge_tts' });
  pushCandidate(candidates, seen, { command: 'python', argsPrefix: ['-m', 'edge_tts'], label: 'python -m edge_tts' });
  pushCandidate(candidates, seen, { command: 'python3', argsPrefix: ['-m', 'edge_tts'], label: 'python3 -m edge_tts' });

  return candidates;
}

export function resolveEdgeTtsRuntime(): EdgeTtsRuntime | null {
  if (resolvedEdgeTtsRuntime) return resolvedEdgeTtsRuntime;

  const allCandidates = edgeTtsCandidates();
  const diagnostics: string[] = [];

  for (const candidate of allCandidates) {
    const probe = spawnSync(candidate.command, [...candidate.argsPrefix, '--help'], {
      encoding: 'utf-8', stdio: 'pipe', shell: false,
    });

    if (probe.status === 0) {
      console.log(`[VOICE-ENGINE] Resolved edge-tts runtime: ${candidate.label}`);
      resolvedEdgeTtsRuntime = candidate;
      return candidate;
    }

    const reason = probe.error ? `spawn error: ${probe.error.message}` : `exit code ${probe.status}`;
    diagnostics.push(`  ✗ ${candidate.label} → ${reason}`);
  }

  if (!loggedEdgeTtsResolutionFailure) {
    loggedEdgeTtsResolutionFailure = true;
    console.error('[VOICE-ENGINE] ═══════ EDGE-TTS RESOLUTION FAILED ═══════');
    console.error('[VOICE-ENGINE] No working edge-tts runtime found.');
    console.error('[VOICE-ENGINE] Candidates tried:');
    for (const line of diagnostics) console.error(`[VOICE-ENGINE] ${line}`);
    console.error(`[VOICE-ENGINE] ELECTRON_BACKEND_SERVER=${process.env.ELECTRON_BACKEND_SERVER || 'unset'}`);
    console.error(`[VOICE-ENGINE] ELECTRON_RESOURCES_PATH=${process.env.ELECTRON_RESOURCES_PATH || 'unset'}`);
    console.error(`[VOICE-ENGINE] process.resourcesPath=${(process as any).resourcesPath || 'unset'}`);
    console.error(`[VOICE-ENGINE] __dirname=${__dirname}`);
    console.error(`[VOICE-ENGINE] cwd=${process.cwd()}`);
    console.error('[VOICE-ENGINE] ═══════════════════════════════════════════');
  }

  return null;
}

// ─── Fallback engine probes ───────────────────────────────────────────────────

export function canUseGttsFallback(): boolean {
  if (checkedGttsAvailability !== null) return checkedGttsAvailability;
  try {
    const Gtts = require('gtts');
    checkedGttsAvailability = typeof Gtts === 'function';
  } catch {
    checkedGttsAvailability = false;
  }
  return checkedGttsAvailability;
}

export function getWindowsSapiStatus(): WindowsSapiStatus {
  if (cachedWindowsSapiStatus) return cachedWindowsSapiStatus;

  if (process.platform !== 'win32') {
    cachedWindowsSapiStatus = { ready: false, detail: 'Windows offline speech is only available on Windows.' };
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
    cachedWindowsSapiStatus = { ready: true, detail: `Using Windows offline speech via ${voiceName}` };
    return cachedWindowsSapiStatus;
  }

  const detail = probe.error?.message
    || readSpawnOutput(probe.stderr)
    || readSpawnOutput(probe.stdout)
    || 'Windows offline speech is unavailable.';
  cachedWindowsSapiStatus = { ready: false, detail };
  return cachedWindowsSapiStatus;
}

// ─── Engine status ────────────────────────────────────────────────────────────

function buildVoiceEngineUnavailableMessage(): string {
  if (process.platform === 'win32' && runningInPackagedDesktopMode()) {
    return 'No working voice engine was found. Reinstall or repair the desktop app, or install at least one Windows text-to-speech voice in Settings > Time & language > Speech.';
  }
  if (runningInPackagedDesktopMode()) {
    return 'No working voice engine was found. Reinstall or repair the desktop app, or use the setup screen to restore the bundled voice engine.';
  }
  return 'No working voice engine was found. Install edge-tts with: pip install edge-tts';
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

// ─── Edge-TTS runner ──────────────────────────────────────────────────────────

export function runEdgeTts(args: string[], timeout = 60000): string {
  const runtime = resolveEdgeTtsRuntime();
  if (!runtime) throw new Error(buildVoiceEngineUnavailableMessage());

  const result = spawnSync(runtime.command, [...runtime.argsPrefix, ...args], {
    encoding: 'utf-8', stdio: 'pipe', shell: false, timeout,
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

// ─── Dynamic voice list ───────────────────────────────────────────────────────

export function getDynamicVoices(): Record<string, VoiceMetadata[]> {
  if (cachedVoices) return cachedVoices;

  try {
    const output = runEdgeTts(['--list-voices']);
    const lines = output.split('\n');
    const voicesByLang: Record<string, VoiceMetadata[]> = {};
    let matchedCount = 0;

    for (const line of lines) {
      const match = line.match(/^(\S+)\s+(Male|Female)\s+(\S+)\s*(.*)?$/);
      if (!match) {
        if (line.includes('Neural') && (line.includes('Male') || line.includes('Female'))) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            const name = parts[0];
            let gender: 'Male' | 'Female' | null = null;
            if (parts[1] === 'Male' || parts[1] === 'Female') gender = parts[1];
            else if (parts[2] === 'Male' || parts[2] === 'Female') gender = parts[2];
            if (name && gender) {
              const locale = name.split('-').slice(0, 2).join('-');
              if (!voicesByLang[locale]) voicesByLang[locale] = [];
              voicesByLang[locale].push({ name, gender, language: locale, tags: parts.slice(3) });
              matchedCount++;
            }
          }
        }
        continue;
      }

      const [, name, genderRaw, category, tags] = match;
      const gender = (genderRaw.charAt(0).toUpperCase() + genderRaw.slice(1).toLowerCase()) as 'Male' | 'Female';
      const locale = name.split('-').slice(0, 2).join('-');
      if (!voicesByLang[locale]) voicesByLang[locale] = [];
      voicesByLang[locale].push({
        name, gender, language: locale, category,
        tags: tags ? tags.split(',').map((t) => t.trim()) : [],
      });
      matchedCount++;
    }

    if (matchedCount === 0) {
      console.warn('[VOICE-ENGINE] Edge-TTS returned output but no voices were matched. Check output format.');
    } else {
      console.log(`[VOICE-ENGINE] Successfully parsed ${matchedCount} voices from Edge-TTS.`);
    }

    cachedVoices = voicesByLang;
    return voicesByLang;
  } catch (error: any) {
    console.error(`[VOICE-ENGINE] Failed to fetch dynamic voices: ${error.message}`);
    const fallback: Record<string, VoiceMetadata[]> = {
      'en-US': [
        { name: 'en-US-JennyNeural', gender: 'Female', language: 'en-US' },
        { name: 'en-US-GuyNeural', gender: 'Male', language: 'en-US' },
      ],
      'ta-IN': [
        { name: 'ta-IN-PallaviNeural', gender: 'Female', language: 'ta-IN' },
        { name: 'ta-IN-ValluvarNeural', gender: 'Male', language: 'ta-IN' },
      ],
      'hi-IN': [
        { name: 'hi-IN-SwaraNeural', gender: 'Female', language: 'hi-IN' },
        { name: 'hi-IN-MadhurNeural', gender: 'Male', language: 'hi-IN' },
      ],
    };
    cachedVoices = fallback;
    return fallback;
  }
}
