/**
 * archive.ts — STAGE 18 (archive / consolidation) for the agentic pipeline.
 *
 * A professional editor consolidates every deliverable + source asset into one
 * self-contained, auditable package and writes a manifest so the project can be
 * reopened or revised months later. This is the zero-cost, offline equivalent:
 *
 *   - gather the final MP4(s), thumbnails, sidecar subtitles (.srt/.vtt),
 *     metadata, contact sheet, and the per-scene source assets
 *   - copy them into <workspace>/archive/ (no move — originals stay intact)
 *   - write <workspace>/archive/archive-manifest.json describing every file,
 *     its role, size, and sha1 so nothing is silently lost
 *
 * Pure fs + crypto (node built-ins), no ffmpeg, no network, no keys.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { AgenticWorkspace } from '../management/workspace.js';

export interface ArchiveFile {
    role:
        | 'final_video'
        | 'multi_aspect'
        | 'thumbnail'
        | 'subtitles'
        | 'metadata'
        | 'contact_sheet'
        | 'source_asset'
        | 'audit';
    src: string;
    dest: string;
    sizeBytes: number;
    sha1: string;
}

export interface ArchiveManifest {
    jobId: string;
    archivedAt: string;
    archiveDir: string;
    totalFiles: number;
    totalBytes: number;
    files: ArchiveFile[];
}

function sha1File(p: string): string {
    try {
        const h = createHash('sha1');
        h.update(fs.readFileSync(p));
        return h.digest('hex');
    } catch {
        return '';
    }
}

const VIDEO_RE = /\.(mp4|mov|webm|mkv)$/i;
const SUB_RE = /\.(srt|vtt)$/i;

/**
 * Consolidate a finished job into <workspace>/archive/.
 *
 * @param ws         the job's workspace
 * @param rootMp4    the primary rendered MP4 (e.g. res.workspace.root/render/<job>.mp4)
 * @returns the written ArchiveManifest, or null if nothing could be packaged
 */
export function archiveJob(ws: AgenticWorkspace, rootMp4: string): ArchiveManifest | null {
    const archiveDir = path.join(ws.root, 'archive');
    try {
        fs.mkdirSync(archiveDir, { recursive: true });
    } catch {
        return null;
    }

    const files: ArchiveFile[] = [];
    const copy = (src: string, role: ArchiveFile['role']) => {
        if (!src || !fs.existsSync(src)) return;
        const name = path.basename(src);
        const dest = path.join(archiveDir, name);
        try {
            fs.copyFileSync(src, dest);
            const st = fs.statSync(dest);
            files.push({ role, src, dest, sizeBytes: st.size, sha1: sha1File(dest) });
        } catch {
            /* skip unreadable */
        }
    };

    // 1. Final video(s) — primary + any multi-aspect siblings.
    const renderDir = path.join(ws.root, 'render');
    if (fs.existsSync(renderDir)) {
        for (const f of fs.readdirSync(renderDir)) {
            const full = path.join(renderDir, f);
            if (!fs.statSync(full).isFile()) continue;
            if (VIDEO_RE.test(f)) {
                const isPrimary = rootMp4 && path.resolve(full) === path.resolve(rootMp4);
                copy(full, isPrimary ? 'final_video' : 'multi_aspect');
            } else if (SUB_RE.test(f)) {
                copy(full, 'subtitles');
            } else if (/\.(jpg|jpeg|png)$/i.test(f)) {
                copy(full, 'thumbnail');
            } else if (/\.(txt|json)$/i.test(f) && /(meta|detail|plan|decision|approval|render-manifest)/i.test(f)) {
                copy(full, 'audit');
            }
        }
    }

    // 2. Contact sheet (audit visibility artefact).
    const cs = path.join(ws.root, 'contact-sheet.png');
    copy(cs, 'contact_sheet');

    // 3. Audio sidecars (subtitles.srt/.vtt live next to voiceovers).
    const audioDir = path.join(ws.root, 'audio');
    if (fs.existsSync(audioDir)) {
        for (const f of fs.readdirSync(audioDir)) {
            if (SUB_RE.test(f)) copy(path.join(audioDir, f), 'subtitles');
            else if (VIDEO_RE.test(f)) copy(path.join(audioDir, f), 'source_asset');
        }
    }

    // 4. Source assets (downloaded stock, per-scene) — the "raw footage" record.
    const assetsDir = ws.assetsDir;
    if (fs.existsSync(assetsDir)) {
        const walk = (dir: string) => {
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) walk(full);
                else if (VIDEO_RE.test(ent.name) || /\.(jpg|jpeg|png|gif|webp)$/i.test(ent.name)) {
                    copy(full, 'source_asset');
                }
            }
        };
        walk(assetsDir);
    }

    const totalBytes = files.reduce((a, f) => a + f.sizeBytes, 0);
    const manifest: ArchiveManifest = {
        jobId: ws.jobId,
        archivedAt: new Date().toISOString(),
        archiveDir,
        totalFiles: files.length,
        totalBytes,
        files,
    };

    try {
        fs.writeFileSync(path.join(archiveDir, 'archive-manifest.json'), JSON.stringify(manifest, null, 2));
    } catch {
        /* manifest is best-effort */
    }

    return manifest;
}

/** Verify an archive manifest is intact (all referenced files present + matching sha1). */
export function verifyArchive(manifestPath: string): { ok: boolean; missing: string[]; corrupted: string[] } {
    try {
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ArchiveManifest;
        const missing: string[] = [];
        const corrupted: string[] = [];
        for (const f of m.files) {
            if (!fs.existsSync(f.dest)) {
                missing.push(f.dest);
                continue;
            }
            if (f.sha1 && sha1File(f.dest) !== f.sha1) corrupted.push(f.dest);
        }
        return { ok: missing.length === 0 && corrupted.length === 0, missing, corrupted };
    } catch {
        return { ok: false, missing: [manifestPath], corrupted: [] };
    }
}
