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
    <section class="hero-surface" style="padding:56px">
        <div class="hero-grid">
            <div class="stack" style="gap:24px">
                <div class="stack" style="gap:12px">
                    <span class="eyebrow"><i data-lucide="check-circle" style="width:12px;height:12px;margin-right:2px"></i> Video Generation Complete</span>
                    <h1 style="margin:4px 0">${escapeHtml(video.title)}</h1>
                    <p class="lead" style="color:var(--muted)">
                        Preview your production in the high-fidelity player, then download the master file or return to create more versions.
                    </p>
                </div>
                <div class="row" style="gap:12px">
                    <span class="pill" style="background:var(--brand-soft); color:var(--brand); border:1px solid hsla(var(--brand-h), var(--brand-s), var(--brand-l), 0.1); padding:8px 20px; font-weight:700">
                        <i data-lucide="layers" style="width:14px;height:14px;margin-right:6px;vertical-align:middle"></i>${escapeHtml(video.orientation)}
                    </span>
                    ${video.durationSeconds ? `<span class="pill" style="background:var(--success-soft); color:var(--success); border:1px solid hsla(142, 70%, 45%, 0.1); padding:8px 20px; font-weight:700">
                        <i data-lucide="clock" style="width:14px;height:14px;margin-right:6px;vertical-align:middle"></i>${Math.round(video.durationSeconds)} sec
                    </span>` : ''}
                    <span class="pill" style="background:var(--surface-soft); color:var(--ink); border:1px solid var(--line); padding:8px 20px; font-weight:700">
                        <i data-lucide="hard-drive" style="width:14px;height:14px;margin-right:6px;vertical-align:middle"></i>${video.fileSizeMB} MB
                    </span>
                    <span class="pill" style="background:var(--surface-soft); color:var(--ink); border:1px solid var(--line); padding:8px 20px; font-weight:700">
                        <i data-lucide="calendar" style="width:14px;height:14px;margin-right:6px;vertical-align:middle"></i>${escapeHtml(new Date(video.createdAt).toLocaleDateString())}
                    </span>
                </div>
            </div>

            <!-- Output File Info -->
            <div class="panel glass stack" style="justify-content:center; padding:40px; border-radius:var(--radius-xl); box-shadow:var(--shadow-lg)">
                <span class="eyebrow" style="background:var(--brand); color:#fff; border:none; padding:4px 12px">Master Production</span>
                <div class="info-list" style="margin-top:20px">
                    <div class="info-row" style="border-bottom:1px solid var(--glass-border); padding:12px 0">
                        <strong style="font-family:'Outfit'; font-size:14px">Filename</strong>
                        <span class="muted" style="font-family:monospace; font-size:12px; opacity:0.8">${escapeHtml(video.videoFilename)}</span>
                    </div>
                </div>
                <div class="toolbar" style="margin-top:28px; flex-direction:column; align-items:stretch; gap:12px">
                    <a class="button" href="${video.downloadUrl}" style="height:56px; gap:12px">
                        <i data-lucide="download-cloud" style="width:20px;height:20px"></i> Download Master MP4
                    </a>
                    <a class="button secondary" href="/" style="height:56px; gap:12px">
                        <i data-lucide="arrow-left" style="width:20px;height:20px"></i> Return to Studio
                    </a>
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
        <div class="stack" style="gap:24px">
            <!-- Delivery Summary -->
            <div class="panel glass" style="border-radius:var(--radius-xl)">
                <span class="eyebrow">Production Details</span>
                <h2 style="margin:12px 0; font-size:1.5rem">Metadata</h2>
                <div class="info-list" style="gap:12px">
                    <div class="info-row" style="border-bottom:1px solid var(--glass-border); padding:10px 0">
                        <strong style="font-family:'Outfit'; font-size:14px"><i data-lucide="layers" style="width:14px;height:14px;margin-right:8px;vertical-align:middle"></i>Orientation</strong>
                        <span class="muted">${escapeHtml(video.orientation)}</span>
                    </div>
                    ${video.durationSeconds ? `
                    <div class="info-row" style="border-bottom:1px solid var(--glass-border); padding:10px 0">
                        <strong style="font-family:'Outfit'; font-size:14px"><i data-lucide="clock" style="width:14px;height:14px;margin-right:8px;vertical-align:middle"></i>Duration</strong>
                        <span class="muted">${Math.round(video.durationSeconds)} seconds</span>
                    </div>` : ''}
                    <div class="info-row" style="border-bottom:1px solid var(--glass-border); padding:10px 0">
                        <strong style="font-family:'Outfit'; font-size:14px"><i data-lucide="hard-drive" style="width:14px;height:14px;margin-right:8px;vertical-align:middle"></i>File Size</strong>
                        <span class="muted">${video.fileSizeMB} MB</span>
                    </div>
                    <div class="info-row" style="padding:10px 0">
                        <strong style="font-family:'Outfit'; font-size:14px"><i data-lucide="calendar" style="width:14px;height:14px;margin-right:8px;vertical-align:middle"></i>Created At</strong>
                        <span class="muted" style="font-size:13px">${escapeHtml(new Date(video.createdAt).toLocaleString())}</span>
                    </div>
                </div>
            </div>

            ${video.description ? `
            <!-- Video Description -->
            <div class="panel soft" style="border-radius:var(--radius-xl)">
                <span class="eyebrow">Project Notes</span>
                <h2 style="margin:12px 0; font-size:1.5rem">Notes & Description</h2>
                <p style="opacity:0.9; font-size:15px">${escapeHtml(video.description).replace(/\n/g, '<br>')}</p>
            </div>` : ''}

            <!-- Next Step -->
            <div class="panel" style="border-radius:var(--radius-xl)">
                <span class="eyebrow">Up Next</span>
                <h2 style="margin:12px 0; font-size:1.5rem">Iterate Production</h2>
                <p class="muted footer-note">
                    Return to the portal if you want to change the script, voice, orientation, music, or subtitle settings and render a new MP4.
                </p>
                <div class="toolbar" style="margin-top:20px; gap:12px">
                    <a class="button secondary" href="/" style="flex:1; gap:8px"><i data-lucide="terminal" style="width:18px;height:18px"></i> Open Studio</a>
                    <a class="button ghost" href="${PROJECT_REPOSITORY_URL}" target="_blank" rel="noreferrer" style="flex:1; gap:8px"><i data-lucide="github" style="width:18px;height:18px"></i> Source</a>
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
