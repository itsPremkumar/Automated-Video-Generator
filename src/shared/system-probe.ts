/**
 * system-probe.ts — hardware capability detection.
 *
 * Detects GPU encoding support, available RAM, and disk space
 * so the pipeline can auto-configure for the current machine.
 */

import { execSync } from 'child_process';
import * as os from 'os';

export interface SystemCapabilities {
    platform: string;
    arch: string;
    totalRAMMB: number;
    freeRAMMB: number;
    diskFreeGB: number;
    ffmpeg: {
        version: string;
        hardwareEncode: boolean;
        encoderName?: string;
    };
    optimalConcurrency: number;
    optimalQuality: 'draft' | 'medium' | 'high';
}

function detectFFmpeg(): { version: string; hardwareEncode: boolean; encoderName?: string } {
    try {
        const v = execSync('ffmpeg -version 2>&1 | head -1', { encoding: 'utf8' });
        const version = v.trim().split(' ')[2] || 'unknown';
        
        // Check for hardware encoders
        const encoders = execSync('ffmpeg -hide_banner -encoders 2>&1', { encoding: 'utf8' });
        let hardwareEncode = false;
        let encoderName: string | undefined;
        
        if (encoders.includes('h264_nvenc')) {
            hardwareEncode = true;
            encoderName = 'h264_nvenc';
        } else if (encoders.includes('h264_qsv')) {
            hardwareEncode = true;
            encoderName = 'h264_qsv';
        } else if (encoders.includes('h264_amf')) {
            hardwareEncode = true;
            encoderName = 'h264_amf';
        } else if (encoders.includes('h264_mf')) {
            hardwareEncode = true;
            encoderName = 'h264_mf';
        }
        
        return { version, hardwareEncode, encoderName };
    } catch {
        return { version: 'unknown', hardwareEncode: false };
    }
}

function detectDiskFreeGB(): number {
    try {
        if (process.platform === 'win32') {
            const out = execSync('powershell -Command "(Get-PSDrive -Name C).Free / 1GB"', { encoding: 'utf8' });
            return Math.round(parseFloat(out.trim()) * 10) / 10;
        } else {
            const out = execSync('df -BG . | tail -1 | awk \'{print $4}\'', { encoding: 'utf8' });
            return parseInt(out.trim().replace('G', ''), 10);
        }
    } catch {
        return 0;
    }
}

export function probeSystem(): SystemCapabilities {
    const totalRAMMB = Math.round(os.totalmem() / 1024 / 1024);
    const freeRAMMB = Math.round(os.freemem() / 1024 / 1024);
    const diskFreeGB = detectDiskFreeGB();
    const ffmpeg = detectFFmpeg();
    
    // Determine optimal settings based on hardware
    let optimalConcurrency = 1;
    if (freeRAMMB > 4000) optimalConcurrency = 3;
    else if (freeRAMMB > 2000) optimalConcurrency = 2;
    
    let optimalQuality: 'draft' | 'medium' | 'high' = 'medium';
    if (freeRAMMB < 1500) optimalQuality = 'draft';
    else if (freeRAMMB > 6000 && ffmpeg.hardwareEncode) optimalQuality = 'high';
    
    return {
        platform: process.platform,
        arch: process.arch,
        totalRAMMB,
        freeRAMMB,
        diskFreeGB,
        ffmpeg,
        optimalConcurrency,
        optimalQuality,
    };
}

export function shouldRender(freeRAMMBMin = 500): { ok: boolean; reason?: string } {
    const freeRAMMB = Math.round(os.freemem() / 1024 / 1024);
    if (freeRAMMB < freeRAMMBMin) {
        return { ok: false, reason: `Insufficient RAM: ${freeRAMMB}MB free (need ${freeRAMMBMin}MB)` };
    }
    return { ok: true };
}
