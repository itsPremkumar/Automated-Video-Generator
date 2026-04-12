import { Request } from 'express';
import { PROJECT_NAME, PROJECT_REPOSITORY_URL, DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_KEYWORDS } from '../constants/config';
import { VideoRecord } from '../types/server.types';
import { absoluteUrl } from '../shared/http/public-url';
import { layout, escapeHtml, truncateText } from './layout.view';

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

export function watchPage(req: Request, video: VideoRecord, cspNonce?: string): string {
    const description = videoMetaDescription(video);

    // ─── Page Body HTML ────────────────────────────────────────────────────────

    const body = `
    <!-- ═══════════════════════════════════════════════════════════════════════
         HERO: Video Summary
         ═══════════════════════════════════════════════════════════════════════ -->
    <section class="hero-surface" style="padding:48px">
        <div class="hero-grid">
            <div class="stack">
                <span class="eyebrow">Video Delivery</span>
                <div>
                    <h1 style="margin-top:12px">${escapeHtml(video.title)}</h1>
                    <p class="lead small" style="margin-top:12px">
                        Preview your production in the high-fidelity player, then download the master file or return to create more versions.
                    </p>
                </div>
                <div class="row" style="margin-top:20px; gap:12px">
                    <span class="pill" style="background:var(--brand-soft); color:var(--brand); border:none; padding:6px 16px">${escapeHtml(video.orientation)}</span>
                    ${video.durationSeconds ? `<span class="pill" style="background:var(--brand-soft); color:var(--brand); border:none; padding:6px 16px">${Math.round(video.durationSeconds)} sec</span>` : ''}
                    <span class="pill" style="background:var(--slate-100); color:var(--slate-600); border:none; padding:6px 16px">${video.fileSizeMB} MB</span>
                    <span class="pill" style="background:var(--slate-100); color:var(--slate-600); border:none; padding:6px 16px">${escapeHtml(new Date(video.createdAt).toLocaleDateString())}</span>
                </div>
            </div>

            <!-- Output File Info -->
            <div class="panel glass stack" style="justify-content:center; padding:32px">
                <span class="eyebrow" style="background:var(--brand); color:white; border:none">Master File</span>
                <div class="info-list" style="margin-top:16px">
                    <div class="info-row" style="border-bottom:1px solid var(--glass-border)">
                        <strong>Filename</strong>
                        <span class="muted" style="font-family:monospace; font-size:12px">${escapeHtml(video.videoFilename)}</span>
                    </div>
                </div>
                <div class="toolbar" style="margin-top:24px; flex-direction:column; align-items:stretch">
                    <a class="button" href="${video.downloadUrl}" style="height:56px">Download Master MP4</a>
                    <a class="button secondary" href="/" style="height:56px">Return to Studio</a>
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
                <span class="eyebrow">Delivery Data</span>
                <h2 style="margin-top:12px">Metadata</h2>
                <div class="info-list" style="margin-top:16px">
                    <div class="info-row" style="border-bottom:1px solid var(--line)">
                        <strong>Orientation</strong>
                        <span class="muted">${escapeHtml(video.orientation)}</span>
                    </div>
                    ${video.durationSeconds ? `
                    <div class="info-row" style="border-bottom:1px solid var(--line)">
                        <strong>Duration</strong>
                        <span class="muted">${Math.round(video.durationSeconds)} seconds</span>
                    </div>` : ''}
                    <div class="info-row" style="border-bottom:1px solid var(--line)">
                        <strong>File size</strong>
                        <span class="muted">${video.fileSizeMB} MB</span>
                    </div>
                    <div class="info-row">
                        <strong>Timestamp</strong>
                        <span class="muted" style="font-size:13px">${escapeHtml(new Date(video.createdAt).toLocaleString())}</span>
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
            cspNonce,
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
