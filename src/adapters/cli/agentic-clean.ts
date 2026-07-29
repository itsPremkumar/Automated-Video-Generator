#!/usr/bin/env tsx
/**
 * agentic-clean.ts — Workspace temp file cleanup command.
 *
 * Scans workspace/jobs/{id}/render/ for transient render artifacts older than
 * 1 hour and removes them. Also cleans up contact-sheet directories under
 * workspace/jobs/{id}/verification/scene_*_sheet/.
 *
 * Transient patterns:
 *   _av_*.mp4      — Agentic-video segments
 *   _seg_*         — Scene segments (partial renders)
 *   _concat_*      — Concatenation intermediates
 *   _intro_*       — Intro segment
 *   _outro_*       — Outro segment
 *
 * Usage:  npx tsx src/adapters/cli/agentic-clean.ts
 *         npm run agentic:clean
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Constants ──────────────────────────────────────────────────────────────

const JOBS_DIR = path.join(process.cwd(), 'workspace', 'jobs');
const ONE_HOUR_MS = 60 * 60 * 1000;

/** Glob-like prefixes for transient render artifacts. */
const TRANSIENT_PREFIXES = ['_av_', '_seg_', '_concat_', '_intro_', '_outro_'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface CleanResult {
    deletedFiles: number;
    freedBytes: number;
    removedDirs: number;
    scannedJobs: number;
}

function cleanJobDir(jobDir: string): CleanResult {
    const result: CleanResult = { deletedFiles: 0, freedBytes: 0, removedDirs: 0, scannedJobs: 0 };
    const renderDir = path.join(jobDir, 'render');
    const verificationDir = path.join(jobDir, 'verification');

    // ── Clean transient render files ───────────────────────────────────────
    if (fs.existsSync(renderDir)) {
        const now = Date.now();
        let entries: string[];
        try {
            entries = fs.readdirSync(renderDir);
        } catch {
            entries = [];
        }

        for (const entry of entries) {
            const fullPath = path.join(renderDir, entry);
            let stat: fs.Stats;
            try {
                stat = fs.statSync(fullPath);
            } catch {
                continue;
            }

            if (!stat.isFile()) continue;

            // Check if filename matches any transient prefix
            const isTransient = TRANSIENT_PREFIXES.some((p) => entry.startsWith(p));
            if (!isTransient) continue;

            // Only delete files older than 1 hour
            if (now - stat.mtimeMs < ONE_HOUR_MS) continue;

            try {
                fs.rmSync(fullPath);
                result.deletedFiles++;
                result.freedBytes += stat.size;
            } catch {
                // Best-effort per file
            }
        }
    }

    // ── Clean contact-sheet directories ────────────────────────────────────
    if (fs.existsSync(verificationDir)) {
        let entries: string[];
        try {
            entries = fs.readdirSync(verificationDir);
        } catch {
            entries = [];
        }

        for (const entry of entries) {
            const fullPath = path.join(verificationDir, entry);
            let stat: fs.Stats;
            try {
                stat = fs.statSync(fullPath);
            } catch {
                continue;
            }

            if (!stat.isDirectory()) continue;
            // Only match scene_*_sheet/ directories
            if (!/^scene_\d+_sheet$/.test(entry)) continue;

            // Recursively remove the directory and sum its size
            let dirSize = 0;
            try {
                dirSize = dirSizeRecursive(fullPath);
                fs.rmSync(fullPath, { recursive: true, force: true });
                result.removedDirs++;
                result.freedBytes += dirSize;
            } catch {
                // Best-effort per directory
            }
        }
    }

    return result;
}

function dirSizeRecursive(dirPath: string): number {
    let total = 0;
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            try {
                if (entry.isDirectory()) {
                    total += dirSizeRecursive(fullPath);
                } else if (entry.isFile()) {
                    total += fs.statSync(fullPath).size;
                }
            } catch {
                // Best-effort per entry
            }
        }
    } catch {
        // Best-effort
    }
    return total;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): void {
    if (!fs.existsSync(JOBS_DIR)) {
        console.log('  ℹ No workspace/jobs directory found — nothing to clean.');
        process.exit(0);
    }

    let jobDirs: string[];
    try {
        jobDirs = fs.readdirSync(JOBS_DIR)
            .map((name) => path.join(JOBS_DIR, name))
            .filter((p) => fs.statSync(p).isDirectory());
    } catch (e: any) {
        console.error(`  ✖ Failed to scan jobs directory: ${e.message}`);
        process.exit(1);
    }

    const totals: CleanResult = { deletedFiles: 0, freedBytes: 0, removedDirs: 0, scannedJobs: 0 };

    for (const jobDir of jobDirs) {
        const jobName = path.basename(jobDir);
        const result = cleanJobDir(jobDir);
        totals.scannedJobs++;

        if (result.deletedFiles > 0 || result.removedDirs > 0) {
            console.log(`  🧹 ${jobName}: ${result.deletedFiles} file(s) deleted, ${result.removedDirs} dir(s) removed (${formatBytes(result.freedBytes)})`);
        }

        totals.deletedFiles += result.deletedFiles;
        totals.freedBytes += result.freedBytes;
        totals.removedDirs += result.removedDirs;
    }

    if (totals.deletedFiles === 0 && totals.removedDirs === 0) {
        console.log(`  ✅ Scanned ${totals.scannedJobs} job(s) — nothing to clean.`);
    } else {
        console.log(`  ✅ Cleaned ${totals.deletedFiles} file(s) + ${totals.removedDirs} dir(s) across ${totals.scannedJobs} job(s), freed ${formatBytes(totals.freedBytes)}`);
    }

    process.exit(0);
}

main();
