import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
// @ts-ignore
import ffmpeg from 'ffmpeg-static';
// @ts-ignore
import ffprobe from 'ffprobe-static';
import { logInfo, logError } from '../runtime';

const console = {
  log: (...args: any[]) => logInfo(...args),
  error: (...args: any[]) => logError(...args),
};

// Use type casting since ffmpeg-static usually exports the path string directly
const FFMPEG_PATH = typeof ffmpeg === 'string' ? ffmpeg : (ffmpeg as any)?.path;
const FFPROBE_PATH = typeof ffprobe === 'string' ? ffprobe : (ffprobe as any)?.path;

/**
 * Get accurate audio duration using ffprobe
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  try {
    const cmd = `"${FFPROBE_PATH}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`;
    const result = execSync(cmd, { encoding: 'utf-8' });
    const duration = parseFloat(result.trim());
    
    if (isNaN(duration)) {
      throw new Error(`Could not parse duration for ${filePath}`);
    }
    
    return duration;
  } catch (error: any) {
    logError(`[AUDIO-PROC] Failed to get duration for ${filePath}: ${error.message}`);
    throw error;
  }
}

/**
 * Split a single audio file into multiple chunks based on durations
 */
export async function splitAudioFile(
  filePath: string,
  durations: number[],
  outputDir: string
): Promise<Map<number, { path: string; duration: number }>> {
  const audioFiles = new Map<number, { path: string; duration: number }>();
  let currentTime = 0;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (let i = 0; i < durations.length; i++) {
    const sceneNumber = i + 1;
    const duration = durations[i];
    const outputPath = path.join(outputDir, `scene_${sceneNumber}.mp3`);

    // Extract segment
    const cmd = `"${FFMPEG_PATH}" -y -i "${filePath}" -ss ${currentTime} -t ${duration} -ac 1 -ar 44100 -b:a 128k "${outputPath}"`;
    execSync(cmd, { stdio: 'ignore' });

    audioFiles.set(sceneNumber, { path: outputPath, duration });
    currentTime += duration;
  }

  return audioFiles;
}

/**
 * Generate a silent audio file of specific duration
 */
export async function generateSilence(
  duration: number,
  outputDir: string,
  sceneNumber: number
): Promise<string> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `silence_${sceneNumber}.mp3`);
  
  // Create silence using lavfi anullsrc
  const cmd = `"${FFMPEG_PATH}" -y -f lavfi -i anullsrc=r=44100:cl=mono -t ${duration} -acodec libmp3lame -b:a 128k "${outputPath}"`;
  execSync(cmd, { stdio: 'ignore' });

  return outputPath;
}

/**
 * Apply auto-ducking to background music based on voiceover tracks
 */
export async function applyAutoDucking(
  musicPath: string,
  voicePaths: string[],
  outputDir: string
): Promise<string> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'ducked-bgm.mp3');
  const tempCombinedVoice = path.join(outputDir, 'temp_combined_voice.mp3');

  try {
    // 1. Combine all voiceover tracks into one continuous track
    const inputArgs = voicePaths.map(p => `-i "${p}"`).join(' ');
    const filterParts = voicePaths.map((_, i) => `[${i}:a]`).join('');
    const concatFilter = `${filterParts}concat=n=${voicePaths.length}:v=0:a=1[out]`;
    
    execSync(`"${FFMPEG_PATH}" -y ${inputArgs} -filter_complex "${concatFilter}" -map "[out]" "${tempCombinedVoice}"`, { stdio: 'ignore' });

    // 2. Apply sidechain compression (ducking)
    const duckingFilter = `[1:a]asplit[sc][voice];[0:a][sc]sidechaincompress=threshold=0.03:ratio=20:attack=100:release=1000[bg];[bg][voice]amix=inputs=2:duration=first[mix]`;
    
    execSync(`"${FFMPEG_PATH}" -y -i "${musicPath}" -i "${tempCombinedVoice}" -filter_complex "${duckingFilter}" -map "[mix]" -b:a 192k "${outputPath}"`, { stdio: 'ignore' });

  } catch (error: any) {
    logError(`[AUDIO-PROC] Sidechain ducking failed: ${error.message}`);
    // Fallback: Just mix them normally if ducking fails
    try {
      execSync(`"${FFMPEG_PATH}" -y -i "${musicPath}" -i "${tempCombinedVoice}" -filter_complex "amix=inputs=2:duration=first" -b:a 192k "${outputPath}"`, { stdio: 'ignore' });
    } catch (fallbackError: any) {
      logError(`[AUDIO-PROC] Fallback mix also failed: ${fallbackError.message}`);
      throw fallbackError;
    }
  } finally {
    if (fs.existsSync(tempCombinedVoice)) {
      try { fs.unlinkSync(tempCombinedVoice); } catch (e) {}
    }
  }

  return outputPath;
}
