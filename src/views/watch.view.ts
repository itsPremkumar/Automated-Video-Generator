import { Request } from 'express';
import { PROJECT_NAME, PROJECT_REPOSITORY_URL, DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_KEYWORDS } from '../constants/config';
import { VideoRecord } from '../types/server.types';
import { layout, escapeHtml, truncateText } from './layout.view';
import { absoluteUrl } from '../services/video.service';

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function toIsoDuration(durationSeconds: number | null): string | undefined {
    if (!durationSeconds || durationSeconds <= 0) {
        return undefined;
    }
    return `PT${Math.max(1, Math.round(durationSeconds))}S`;
}

export function videoMetaDescription(video: VideoRecord): string {
    const fallback = `${video.title} is a video published with ${PROJECT_NAME}, a free and open-source Remotion-based text-to-video generator.`;
    return truncateText(video.description || fallback, 160);
}

// ═══════════════════════════════════════════════════════════════════════════════
// WATCH PAGE — Final video delivery & download
// ═══════════════════════════════════════════════════════════════════════════════

export function watchPage(req: Request, video: VideoRecord): string {
    const description = videoMetaDescription(video);

    // ─── Page Body HTML ────────────────────────────────────────────────────────

    const body = `
    <!-- ═══════════════════════════════════════════════════════════════════════
         HERO: Video Summary
         ═══════════════════════════════════════════════════════════════════════ -->
    <section class="hero-surface">
        <div class="hero-grid">
            <div class="stack">
                <span class="eyebrow">Video Ready</span>
                <div>
                    <h1>${escapeHtml(video.title)}</h1>
                    <p class="lead small">
                        Preview the result in the browser, then download the MP4 or return to the workspace to make another version.
                    </p>
                </div>
                <div class="row">
                    <span class="pill">${escapeHtml(video.orientation)}</span>
                    ${video.durationSeconds ? `<span class="pill">${Math.round(video.durationSeconds)} sec</span>` : ''}
                    <span class="pill">${video.fileSizeMB} MB</span>
                    <span class="pill">${escapeHtml(new Date(video.createdAt).toLocaleString())}</span>
                </div>
            </div>

            <!-- Output File Info -->
            <div class="highlight-box stack">
                <span class="eyebrow">Output File</span>
                <div class="info-list">
                    <div class="info-row">
                        <strong>Filename</strong>
                        <span class="muted">${escapeHtml(video.videoFilename)}</span>
                    </div>
                    <div class="info-row">
                        <strong>Delivery page</strong>
                        <span class="muted">Ready for watching and download</span>
                    </div>
                    <div class="info-row">
                        <strong>Generator</strong>
                        <span class="muted">${PROJECT_NAME}</span>
                    </div>
                </div>
                <div class="toolbar">
                    <a class="button" href="${video.downloadUrl}">Download MP4</a>
                    <a class="button secondary" href="/">Back to Portal</a>
                </div>
            </div>
        </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════════
         VIDEO PLAYER & DETAILS
         ═══════════════════════════════════════════════════════════════════════ -->
    <section class="watch-grid">
        <!-- Video Player -->
        <div class="video-stage">
            <video class="video" controls playsinline preload="metadata"${video.thumbnailUrl ? ` poster="${video.thumbnailUrl}"` : ''}>
                <source src="${video.videoUrl}" type="video/mp4">
            </video>
        </div>

        <!-- Details Sidebar -->
        <div class="stack">
            <!-- Delivery Summary -->
            <div class="panel">
                <span class="eyebrow">Delivery Summary</span>
                <h2>What this output contains</h2>
                <div class="info-list">
                    <div class="info-row">
                        <strong>Orientation</strong>
                        <span class="muted">${escapeHtml(video.orientation)}</span>
                    </div>
                    ${video.durationSeconds ? `
                    <div class="info-row">
                        <strong>Duration</strong>
                        <span class="muted">${Math.round(video.durationSeconds)} seconds</span>
                    </div>` : ''}
                    <div class="info-row">
                        <strong>File size</strong>
                        <span class="muted">${video.fileSizeMB} MB</span>
                    </div>
                    <div class="info-row">
                        <strong>Created</strong>
                        <span class="muted">${escapeHtml(new Date(video.createdAt).toLocaleString())}</span>
                    </div>
                </div>
            </div>

            ${video.description ? `
            <!-- Video Description -->
            <div class="panel soft">
                <span class="eyebrow">Video Details</span>
                <h2>Notes and description</h2>
                <p>${escapeHtml(video.description).replace(/\n/g, '<br>')}</p>
            </div>` : ''}

            <!-- Next Step -->
            <div class="panel">
                <span class="eyebrow">Next Step</span>
                <h2>Create another version</h2>
                <p class="muted footer-note">
                    Return to the portal if you want to change the script, voice, orientation, music, or subtitle settings and render a new MP4.
                </p>
                <div class="toolbar">
                    <a class="button secondary" href="/">Open Workspace</a>
                    <a class="button ghost" href="${PROJECT_REPOSITORY_URL}" target="_blank" rel="noreferrer">Project Repository</a>
                </div>
            </div>
        </div>
    </section>`;

    // ─── Return the assembled page ─────────────────────────────────────────────

    return layout(
        `${video.title} | ${PROJECT_NAME}`,
        body,
        {
            canonical: video.watchUrl,
            description,
            imageUrl: video.thumbnailUrl || absoluteUrl(req, '/og-image.svg'),
            jsonLd: [
                {
                    '@context': 'https://schema.org',
                    '@type': 'VideoObject',
                    contentUrl: video.videoUrl,
                    description,
                    duration: toIsoDuration(video.durationSeconds),
                    embedUrl: video.watchUrl,
                    isAccessibleForFree: true,
                    name: video.title,
                    thumbnailUrl: video.thumbnailUrl ? [video.thumbnailUrl] : undefined,
                    uploadDate: video.createdAt,
                    url: video.watchUrl,
                },
                {
                    '@context': 'https://schema.org',
                    '@type': 'SoftwareApplication',
                    applicationCategory: 'MultimediaApplication',
                    description: DEFAULT_SITE_DESCRIPTION,
                    isAccessibleForFree: true,
                    name: PROJECT_NAME,
                    offers: {
                        '@type': 'Offer',
                        price: '0',
                        priceCurrency: 'USD',
                    },
                    sameAs: PROJECT_REPOSITORY_URL,
                    url: absoluteUrl(req, '/'),
                },
            ],
            keywords: DEFAULT_SITE_KEYWORDS,
            ogType: 'video.other',
        }
    );
}
