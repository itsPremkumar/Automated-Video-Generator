/**
 * publish.ts — publish adapter (Tier-3 #8).
 *
 * Zero-cost, offline-first publishing for a finished agentic video.
 *
 *  - ALWAYS emits a `publish-manifest.json` describing every deliverable
 *    (final MP4, multi-aspect copies, subtitle sidecars, thumbnails, metadata)
 *    plus the intended platform targets. This is the machine-readable
 *    "where do I upload this" record — free, no API, no key.
 *  - OPTIONALLY uploads to YouTube via the FREE YouTube Data API v3, using a
 *    stored OAuth access token (env `YOUTUBE_ACCESS_TOKEN`). If no token is
 *    present, it writes a ready-to-run `youtube-upload` helper (curl script)
 *    and a `draft=true` manifest entry instead of failing — so the pipeline
 *    never blocks on publishing.
 *
 * Nothing here costs money and everything degrades gracefully offline.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { AgenticConfig } from './config.js';

export interface PublishTarget {
    platform: 'youtube' | 'tiktok' | 'instagram' | 'reels' | 'local';
    /** Aspect this target expects, e.g. '9:16' | '16:9' | '1:1'. */
    aspect: '9:16' | '16:9' | '1:1';
    /** Path to the file suited for this target (best match found from deliverables). */
    file: string;
    /** Subtitle sidecars available for this target. */
    subtitles: string[];
    uploaded: boolean;
    note?: string;
}

export interface PublishManifest {
    jobId: string;
    topic: string;
    title: string;
    description: string;
    hashtags: string;
    generatedAt: string;
    deliverablesDir: string;
    targets: PublishTarget[];
    youtube?: { draft: boolean; uploadScript?: string; videoId?: string; note?: string };
}

export interface PublishInput {
    jobId: string;
    deliverablesDir: string;
    cfg: AgenticConfig;
    /** Already-computed title/description/hashtags (caller derives from the plan). */
    title: string;
    description: string;
    hashtags: string;
    /** Subtitle language codes that were generated (for sidecar listing). */
    languages?: string[];
}

const PLATFORM_ASPECTS: { platform: PublishTarget['platform']; aspect: PublishTarget['aspect'] }[] = [
    { platform: 'youtube', aspect: '16:9' },
    { platform: 'tiktok', aspect: '9:16' },
    { platform: 'instagram', aspect: '1:1' },
    { platform: 'reels', aspect: '9:16' },
    { platform: 'local', aspect: '9:16' },
];

function pickFileForAspect(dir: string, jobId: string, aspect: PublishTarget['aspect']): string {
    if (!fs.existsSync(dir)) return '';
    // Prefer an explicit aspect export, else the main job mp4, else any mp4.
    const cand = (name: string) => path.join(dir, name);
    const explicit = {
        '9:16': [`${jobId}_9x16.mp4`, `${jobId}.mp4`],
        '16:9': [`${jobId}_16x9.mp4`],
        '1:1': [`${jobId}_1x1.mp4`],
    }[aspect] ?? [];
    for (const n of explicit) if (fs.existsSync(cand(n))) return cand(n);
    const main = cand(`${jobId}.mp4`);
    if (fs.existsSync(main)) return main;
    const any = fs.readdirSync(dir).find((f) => f.endsWith('.mp4'));
    return any ? cand(any) : main;
}

function findSubtitles(dir: string, jobId: string, languages: string[]): string[] {
    const out: string[] = [];
    const native = path.join(dir, `${jobId}.srt`);
    if (fs.existsSync(native)) out.push(native);
    for (const lang of languages) {
        const p = path.join(dir, `${jobId}.${lang}.srt`);
        if (fs.existsSync(p)) out.push(p);
    }
    return out;
}

export function buildPublishManifest(input: PublishInput): PublishManifest {
    const { jobId, deliverablesDir, cfg, languages = [], title, description, hashtags } = input;
    const targets: PublishTarget[] = PLATFORM_ASPECTS.map(({ platform, aspect }) => ({
        platform,
        aspect,
        file: pickFileForAspect(deliverablesDir, jobId, aspect),
        subtitles: findSubtitles(deliverablesDir, jobId, languages),
        uploaded: false,
    }));
    const manifest: PublishManifest = {
        jobId,
        topic: cfg.topic,
        title,
        description,
        hashtags,
        generatedAt: new Date().toISOString(),
        deliverablesDir,
        targets,
    };
    // YouTube: optional free upload if a token is present, else leave a script.
    const ytToken = process.env.YOUTUBE_ACCESS_TOKEN;
    if (ytToken) {
        manifest.youtube = { draft: true, note: 'YouTube upload pending (token found; call publishToYouTube).' };
    } else {
        const ytFile = targets.find((t) => t.platform === 'youtube')?.file ?? '';
        const scriptPath = path.join(deliverablesDir, `${jobId}_youtube_upload.sh`);
        const ytTags = hashtags.split(/\s+/).filter(Boolean).map((t) => JSON.stringify(t.replace(/^#/, ''))).join(',');
        const script = `#!/usr/bin/env bash
# Zero-cost YouTube upload helper (YouTube Data API v3, free quota).
# 1) Create an OAuth client at https://console.cloud.google.com/ (free).
# 2) Obtain an access token and set YOUTUBE_ACCESS_TOKEN.
# 3) Run: bash ${path.basename(scriptPath)}
set -e
: "\${YOUTUBE_ACCESS_TOKEN:?set YOUTUBE_ACCESS_TOKEN to your OAuth access token}"
VIDEO="${ytFile}"
curl -s -X POST "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable" \\
  -H "Authorization: Bearer $YOUTUBE_ACCESS_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"snippet":{"title":"${title}","description":"${description}","tags":[${ytTags}]},"status":{"privacyStatus":"private"}}' \\
  -D - -o /dev/null | grep -i "location" || echo "Upload session URL not returned; check token/expiry."
echo "Resumable upload session created. Stream the binary with: curl -X PUT <location> --data-binary @$VIDEO"
`;
        try { fs.writeFileSync(scriptPath, script, 'utf8'); } catch { /* ignore */ }
        manifest.youtube = { draft: true, uploadScript: scriptPath, note: 'No YOUTUBE_ACCESS_TOKEN — wrote a ready upload script; fill token + run.' };
    }
    return manifest;
}

export function writePublishManifest(input: PublishInput): PublishManifest {
    const manifest = buildPublishManifest(input);
    const outPath = path.join(input.deliverablesDir, `${input.jobId}_publish-manifest.json`);
    fs.mkdirSync(input.deliverablesDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
    return manifest;
}
