/**
 * voice/changer.ts — Voice changer / voice filter.
 * Changes voice pitch, tone, adds effects.
 * Identity-preserving: ffmpeg-based, no external deps.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../../shared/logging/runtime-logging.js';

export type VoiceEffect = 'none' | 'deep' | 'high' | 'robot' | 'echo' | 'chipmunk' | 'monster' | 'telephone';

export interface VoiceChangerOptions {
    inputPath: string;
    outputPath: string;
    effect?: VoiceEffect;
    pitchShift?: number;
    speed?: number;
    reverb?: boolean;
    echo?: boolean;
}

const VOICE_EFFECTS: Record<VoiceEffect, string> = {
    none: '',
    deep: 'asetrate=22050,aresample=44100,atempo=0.8',
    high: 'asetrate=88200,aresample=44100,atempo=1.2',
    robot: 'asetrate=16000,aresample=44100,vibrato=f=10:d=0.5',
    echo: 'aecho=0.8:0.9:1000:0.3',
    chipmunk: 'asetrate=66150,aresample=44100,atempo=1.5',
    monster: 'asetrate=11025,aresample=44100,atempo=0.6,vibrato=f=8:d=0.8',
    telephone: 'highpass=f=300,lowpass=f=3000',
};

export async function changeVoice(options: VoiceChangerOptions): Promise<string> {
    const { inputPath, outputPath, effect = 'none', pitchShift, speed, reverb, echo } = options;
    if (!fs.existsSync(inputPath)) throw new Error(`Input not found: ${inputPath}`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const filters: string[] = [];
    if (effect !== 'none' && VOICE_EFFECTS[effect]) filters.push(VOICE_EFFECTS[effect]);
    if (pitchShift) { const rate = Math.pow(2, pitchShift / 12); filters.push(`asetrate=44100*${rate},aresample=44100`); }
    if (speed && speed !== 1.0) filters.push(`atempo=${speed}`);
    if (reverb) filters.push('aecho=0.8:0.9:500:0.4');
    if (echo) filters.push('aecho=0.6:0.8:1500:0.5');

    const filterStr = filters.length > 0 ? filters.join(',') : 'anull';
    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', ['-i', inputPath, '-af', filterStr, '-c:a', 'aac', '-b:a', '192k', '-y', outputPath], { stdio: ['ignore', 'pipe', 'pipe'] });
        proc.on('close', (code) => { if (code !== 0) reject(new Error(`Voice change failed: ${code}`)); else resolve(outputPath); });
    });
}

export function listVoiceEffects(): VoiceEffect[] {
    return Object.keys(VOICE_EFFECTS) as VoiceEffect[];
}

export async function changeVideoVoice(videoPath: string, outputPath: string, effect: VoiceEffect): Promise<string> {
    if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const filter = VOICE_EFFECTS[effect] || 'anull';
    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', ['-i', videoPath, '-c:v', 'copy', '-af', filter, '-c:a', 'aac', '-b:a', '192k', '-y', outputPath], { stdio: ['ignore', 'pipe', 'pipe'] });
        proc.on('close', (code) => { if (code !== 0) reject(new Error(`Video voice change failed: ${code}`)); else resolve(outputPath); });
    });
}
