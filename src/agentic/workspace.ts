/**
 * Per-job workspace helpers.
 *
 * Every agentic job gets an isolated, auditable folder under
 * agentic-pipeline/workspaces/<jobId>/ so an agent (or human) can inspect
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

const WORKSPACES_ROOT = resolveProjectPath('agentic-pipeline', 'workspaces');

export function workspaceRootFor(jobId: string): string {
    return path.join(WORKSPACES_ROOT, jobId);
}

export function createAgenticWorkspace(jobId: string): AgenticWorkspace {
    const root = workspaceRootFor(jobId);
    const assetsDir = path.join(root, 'assets');
    const imagesDir = path.join(assetsDir, 'images');
    const videosDir = path.join(assetsDir, 'videos');
    const musicDir = path.join(assetsDir, 'music');
    const verificationDir = path.join(root, 'verification');

    for (const dir of [root, assetsDir, imagesDir, videosDir, musicDir, verificationDir]) {
        fs.mkdirSync(dir, { recursive: true });
    }

    return {
        jobId,
        root,
        assetsDir,
        imagesDir,
        videosDir,
        musicDir,
        verificationDir,
    };
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
