#!/usr/bin/env node
/**
 * bin/doctor.ts — one-command production health check.
 *
 *   npm run doctor
 *
 * Aggregates every pre-flight signal an operator needs before a render run:
 * ffmpeg/ffprobe binaries, RAM, disk, network reachability of the free media
 * providers, voice/TTS backend status, bundled offline pack, cache state.
 * Exit code 0 = ready to render; 1 = at least one BLOCKER found.
 */

import dotenv from 'dotenv';
dotenv.config();

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface Check {
    id: string;
    label: string;
    pass: boolean;
    /** blocker = must fix before rendering; warn = degraded but usable */
    severity: 'blocker' | 'warn' | 'info';
    detail: string;
}

function checkFfmpeg(): Check {
    try {
        const ff: string = require('ffmpeg-static');
        if (!ff || !fs.existsSync(ff)) return { id: 'FFMPEG', label: 'ffmpeg binary', pass: false, severity: 'blocker', detail: 'ffmpeg-static missing — npm install required' };
        const r = spawnSync(ff, ['-version'], { timeout: 15000 });
        const v = (r.stdout?.toString() || '').split('\n')[0] ?? '';
        return { id: 'FFMPEG', label: 'ffmpeg binary', pass: r.status === 0, severity: 'blocker', detail: v.slice(0, 80) || `exit ${r.status}` };
    } catch (e: any) {
        return { id: 'FFMPEG', label: 'ffmpeg binary', pass: false, severity: 'blocker', detail: e?.message ?? String(e) };
    }
}

function checkFfprobe(): Check {
    try {
        const fp: string = require('ffprobe-static').path;
        const ok = fp && fs.existsSync(fp);
        return { id: 'FFPROBE', label: 'ffprobe binary', pass: !!ok, severity: 'blocker', detail: ok ? fp : 'ffprobe-static missing' };
    } catch (e: any) {
        return { id: 'FFPROBE', label: 'ffprobe binary', pass: false, severity: 'blocker', detail: e?.message ?? String(e) };
    }
}

function checkRam(): Check {
    const totalGb = os.totalmem() / 1024 ** 3;
    const freeGb = os.freemem() / 1024 ** 3;
    // Rendering needs ~2GB headroom on this project's ffmpeg filter chains.
    const pass = freeGb >= 1.5;
    return {
        id: 'RAM',
        label: 'free memory',
        pass,
        severity: pass ? 'info' : 'warn',
        detail: `${freeGb.toFixed(1)}GB free / ${totalGb.toFixed(1)}GB total${pass ? '' : ' — close other apps (Chrome is the usual hog)'}`,
    };
}

function checkDisk(): Check {
    let stat: any = {};
    try {
        // Node has no native statfs; use a write probe + rough df via fs only on POSIX. Windows: assume OK if cwd writable.
        const probe = path.join(process.cwd(), '.doctor-write-probe');
        fs.writeFileSync(probe, 'x');
        fs.rmSync(probe, { force: true });
        stat.writable = true;
    } catch {
        stat.writable = false;
    }
    const pass = stat.writable === true;
    return { id: 'DISK', label: 'workspace writable', pass, severity: 'blocker', detail: pass ? process.cwd() : 'cannot write to project directory' };
}

function checkNetwork(): Check {
    const targets = ['commons.wikimedia.org', 'api.openverse.org', 'ccmixter.org'];
    let reachable = 0;
    for (const host of targets) {
        try {
            execFileSync('node', ['-e', `require('dns').lookup('${host}',()=>process.exit(0))`], { timeout: 6000 });
            reachable++;
        } catch { /* unreachable */ }
    }
    const all = reachable === targets.length;
    return {
        id: 'NETWORK',
        label: 'free media providers reachable',
        pass: reachable > 0,
        severity: all ? 'info' : 'warn',
        detail: `${reachable}/${targets.length} DNS-reachable${reachable === 0 ? ' — runs will use the bundled offline pack' : ''}`,
    };
}

function checkOfflinePack(): Check {
    try {
        const { bundledStatus } = require('../src/agentic/media/bundled-media.js');
        const s = bundledStatus();
        const enough = s.videos >= 5 && s.images >= 3;
        return {
            id: 'OFFLINE',
            label: 'bundled offline pack',
            pass: s.videos > 0,
            severity: enough ? 'info' : 'warn',
            detail: `${s.videos} videos, ${s.images} images, ${s.music} music${enough ? '' : ' — thin pack: offline renders will look repetitive'}`,
        };
    } catch (e: any) {
        return { id: 'OFFLINE', label: 'bundled offline pack', pass: false, severity: 'warn', detail: e?.message ?? String(e) };
    }
}

function checkTts(): Check {
    const edge = !!process.env.AGENTIC_TTS_PROVIDER && process.env.AGENTIC_TTS_PROVIDER !== 'none';
    // Edge-TTS needs network; offline fallback (Windows SAPI) always exists on win32.
    const sapi = process.platform === 'win32';
    const pass = edge || sapi;
    return {
        id: 'VOICE',
        label: 'voice/TTS backend',
        pass,
        severity: pass ? 'info' : 'warn',
        detail: sapi ? 'Edge-TTS (online) + Windows SAPI fallback available' : 'no TTS backend detected — set AGENTIC_TTS_PROVIDER or run on Windows for SAPI fallback',
    };
}

function main() {
    console.log('\n🩺 AVS Doctor — production readiness check\n');
    const checks: Check[] = [
        checkFfmpeg(),
        checkFfprobe(),
        checkRam(),
        checkDisk(),
        checkNetwork(),
        checkOfflinePack(),
        checkTts(),
    ];
    for (const c of checks) {
        const icon = c.pass ? '✓' : c.severity === 'blocker' ? '✗' : '⚠';
        console.log(`  ${icon} ${c.id.padEnd(8)} ${c.label}: ${c.detail}`);
    }
    const blockers = checks.filter((c) => !c.pass && c.severity === 'blocker');
    const warns = checks.filter((c) => !c.pass && c.severity !== 'blocker');
    console.log(`\n  ${checks.length - blockers.length - warns.length}/${checks.length} healthy · ${warns.length} warnings · ${blockers.length} blockers\n`);
    process.exit(blockers.length > 0 ? 1 : 0);
}

main();
