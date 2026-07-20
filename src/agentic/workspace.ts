/**
 * Per-job workspace helpers.
 *
 * Every agentic job gets an isolated, auditable folder under
 * workspace/runs/<jobId>/ so an agent (or human) can inspect
 * every downloaded asset, every verification result, and every decision.
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath } from '../shared/runtime/paths.js';

export interface AgenticWorkspace {
    jobId: string;
    root: string;
    assetsDir: string;
    imagesDir: string;
    videosDir: string;
    musicDir: string;
    verificationDir: string;
}

const WORKSPACES_ROOT = resolveProjectPath('workspace', 'runs');
export const AGENTIC_OUTPUT_DIR = resolveProjectPath('workspace', 'output');
export const AGENTIC_TMP_DIR = resolveProjectPath('workspace', 'tmp');

export function workspaceRootFor(jobId: string): string {
    return path.join(WORKSPACES_ROOT, jobId);
}

function buildWorkspacePaths(jobId: string): AgenticWorkspace {
    const root = workspaceRootFor(jobId);
    const assetsDir = path.join(root, 'assets');
    const imagesDir = path.join(assetsDir, 'images');
    const videosDir = path.join(assetsDir, 'videos');
    const musicDir = path.join(assetsDir, 'music');
    const verificationDir = path.join(root, 'verification');
    return { jobId, root, assetsDir, imagesDir, videosDir, musicDir, verificationDir };
}

/**
 * getAgenticWorkspace — return the workspace for an EXISTING job WITHOUT
 * touching its downloaded assets. Used by later pipeline stages (gateway,
 * render) that must read the assets acquire.ts already populated. Calling the
 * wiping createAgenticWorkspace() here would DELETE those assets and force a
 * broken "file missing" verify → a network re-fetch hang.
 */
export function getAgenticWorkspace(jobId: string): AgenticWorkspace {
    const ws = buildWorkspacePaths(jobId);
    for (const dir of [ws.root, ws.assetsDir, ws.imagesDir, ws.videosDir, ws.musicDir, ws.verificationDir]) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return ws;
}

export function createAgenticWorkspace(jobId: string): AgenticWorkspace {
    const ws = buildWorkspacePaths(jobId);
    const { imagesDir, videosDir } = ws;

    // Clean stale scene-asset dirs from any previous run so each job
    // starts from a truly isolated asset set (prevents leftover candidate
    // files from a prior job poisoning the new render).
    for (const base of [imagesDir, videosDir]) {
        try {
            if (fs.existsSync(base)) {
                for (const sub of fs.readdirSync(base)) {
                    const full = path.join(base, sub);
                    try {
                        fs.rmSync(full, { recursive: true, force: true });
                    } catch {
                        /* ignore */
                    }
                }
            }
        } catch {
            /* ignore */
        }
    }

    for (const dir of [ws.root, ws.assetsDir, ws.imagesDir, ws.videosDir, ws.musicDir, ws.verificationDir]) {
        fs.mkdirSync(dir, { recursive: true });
    }

    return ws;
}

/** Per-scene image/video folder, e.g. assets/images/scene_01/ */
export function sceneImageDir(ws: AgenticWorkspace, sceneIndex: number): string {
    const dir = path.join(ws.imagesDir, `scene_${String(sceneIndex + 1).padStart(2, '0')}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

export function sceneVideoDir(ws: AgenticWorkspace, sceneIndex: number): string {
    const dir = path.join(ws.videosDir, `scene_${String(sceneIndex + 1).padStart(2, '0')}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

export function writeJson(ws: AgenticWorkspace, relativePath: string, data: unknown): string {
    const full = path.join(ws.root, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(data, null, 2));
    return full;
}

export function readJson<T = any>(ws: AgenticWorkspace, relativePath: string): T | null {
    const full = path.join(ws.root, relativePath);
    if (!fs.existsSync(full)) return null;
    try {
        return JSON.parse(fs.readFileSync(full, 'utf-8')) as T;
    } catch {
        return null;
    }
}

/**
 * Prune old workspaces so workspace/runs never grows unbounded.
 * Keeps the N most-recent jobs (default 25) and deletes the rest. Safe to call
 * at the start of every run. Returns the number of workspaces removed.
 */
export function pruneWorkspaces(maxKeep = 25, root: string = WORKSPACES_ROOT): number {
    try {
        if (!fs.existsSync(root)) return 0;
        const dirs = fs
            .readdirSync(root)
            .map((d) => path.join(root, d))
            .filter((d) => fs.statSync(d).isDirectory());
        // Sort oldest-first by mtime.
        dirs.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
        const toRemove = dirs.slice(0, Math.max(0, dirs.length - maxKeep));
        for (const d of toRemove) fs.rmSync(d, { recursive: true, force: true });
        return toRemove.length;
    } catch {
        return 0;
    }
}
