/**
 * output-cleanup.ts — automatic output directory management.
 *
 * Prevents disk from filling up by removing old rendered videos
 * and workspaces. Keeps the N most recent jobs per configuration.
 */

import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const WORKSPACE_DIR = path.join(process.cwd(), 'workspace', 'jobs');

export interface CleanupOptions {
    /** Keep this many recent jobs per output subdirectory. Default 5. */
    keepRecent?: number;
    /** Remove files older than this many days. Default 7. */
    maxAgeDays?: number;
}

export interface CleanupResult {
    removedFiles: number;
    removedDirs: number;
    freedBytes: number;
}

/**
 * Clean up old output files and workspaces.
 * Safe: only removes under output/ and workspace/jobs/, never touches source.
 */
export function cleanupOutput(opts: CleanupOptions = {}): CleanupResult {
    const keepRecent = opts.keepRecent ?? 5;
    const maxAgeMs = (opts.maxAgeDays ?? 7) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let removedFiles = 0;
    let removedDirs = 0;
    let freedBytes = 0;

    // Clean output/ subdirectories (p9x16_music, variety, etc.)
    if (fs.existsSync(OUTPUT_DIR)) {
        for (const subdir of fs.readdirSync(OUTPUT_DIR)) {
            const subpath = path.join(OUTPUT_DIR, subdir);
            if (!fs.statSync(subpath).isDirectory()) continue;

            // Get all files with timestamps
            const files: { path: string; mtime: number; size: number }[] = [];
            try {
                for (const f of fs.readdirSync(subpath)) {
                    const fp = path.join(subpath, f);
                    try {
                        const st = fs.statSync(fp);
                        files.push({ path: fp, mtime: st.mtimeMs, size: st.size });
                    } catch { /* skip */ }
                }
            } catch { /* skip */ }

            // Sort newest first
            files.sort((a, b) => b.mtime - a.mtime);

            // Remove old files beyond keepRecent and older than maxAgeDays
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                const tooOld = now - f.mtime > maxAgeMs;
                const beyondKeep = i >= keepRecent;
                if (tooOld || beyondKeep) {
                    try {
                        fs.rmSync(f.path, { force: true });
                        removedFiles++;
                        freedBytes += f.size;
                    } catch { /* ignore */ }
                }
            }
        }
    }

    // Clean workspace/jobs/ — remove completed job workspaces older than 1 day
    if (fs.existsSync(WORKSPACE_DIR)) {
        for (const job of fs.readdirSync(WORKSPACE_DIR)) {
            const jobpath = path.join(WORKSPACE_DIR, job);
            try {
                const st = fs.statSync(jobpath);
                if (now - st.mtimeMs > 24 * 60 * 60 * 1000) {
                    fs.rmSync(jobpath, { recursive: true, force: true });
                    removedDirs++;
                }
            } catch { /* ignore */ }
        }
    }

    return { removedFiles, removedDirs, freedBytes };
}

/** Human-readable summary of what cleanup found. */
export function cleanupPreview(opts: CleanupOptions = {}): {
    filesToRemove: number;
    dirsToRemove: number;
    bytesToFree: number;
} {
    const keepRecent = opts.keepRecent ?? 5;
    const maxAgeMs = (opts.maxAgeDays ?? 7) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let filesToRemove = 0;
    let dirsToRemove = 0;
    let bytesToFree = 0;

    if (fs.existsSync(OUTPUT_DIR)) {
        for (const subdir of fs.readdirSync(OUTPUT_DIR)) {
            const subpath = path.join(OUTPUT_DIR, subdir);
            if (!fs.statSync(subpath).isDirectory()) continue;

            const files: { mtime: number; size: number }[] = [];
            try {
                for (const f of fs.readdirSync(subpath)) {
                    const fp = path.join(subpath, f);
                    try {
                        const st = fs.statSync(fp);
                        files.push({ mtime: st.mtimeMs, size: st.size });
                    } catch { /* skip */ }
                }
            } catch { /* skip */ }

            files.sort((a, b) => b.mtime - a.mtime);
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                if (now - f.mtime > maxAgeMs || i >= keepRecent) {
                    filesToRemove++;
                    bytesToFree += f.size;
                }
            }
        }
    }

    if (fs.existsSync(WORKSPACE_DIR)) {
        for (const job of fs.readdirSync(WORKSPACE_DIR)) {
            const jobpath = path.join(WORKSPACE_DIR, job);
            try {
                const st = fs.statSync(jobpath);
                if (now - st.mtimeMs > 24 * 60 * 60 * 1000) {
                    dirsToRemove++;
                }
            } catch { /* ignore */ }
        }
    }

    return { filesToRemove, dirsToRemove, bytesToFree };
}
