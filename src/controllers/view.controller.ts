import { Request, Response } from 'express';
import { homePage } from '../views/home.view';
import { watchPage } from '../views/watch.view';
import { jobPage } from '../views/job-status.view';
import { layout } from '../views/layout.view';
import { listVideos, getVideo, listMusicFiles } from '../services/video.service';
import { getSetupStatus } from '../services/env.service';
import { PROJECT_NAME, BRAND_COLOR, PROJECT_REPOSITORY_URL, DEFAULT_SITE_DESCRIPTION, DEFAULT_SITE_KEYWORDS } from '../constants/config';
import { absoluteUrl } from '../services/video.service';
import { resolveProjectPath } from '../runtime';

export const renderHome = (req: Request, res: Response) => {
    const videos = listVideos(req);
    const setup = getSetupStatus();
    const musicFiles = listMusicFiles();
    res.type('html').send(homePage(req, videos, setup, musicFiles, res.locals.cspNonce));
};

export const renderWatch = (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video) {
        res.status(404).type('html').send(
            layout(
                `Video Not Found | ${PROJECT_NAME}`,
                '<section><h1>Video not found</h1><p class="muted">The requested video is not available.</p><a class="button secondary" href="/">Back to Portal</a></section>',
                {
                    cspNonce: res.locals.cspNonce,
                    description: 'The requested video page could not be found.',
                    ogType: 'website',
                    robots: 'noindex, nofollow',
                },
            )
        );
        return;
    }
    res.type('html').send(watchPage(req, video, res.locals.cspNonce));
};

export const renderJob = (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    res.type('html').send(jobPage(req, jobId, res.locals.cspNonce));
};

export const renderRobots = (req: Request, res: Response) => {
    res.type('text/plain').send(
        `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /download/\nDisallow: /files/\nDisallow: /health\nDisallow: /jobs/\nSitemap: ${absoluteUrl(req, '/sitemap.xml')}\n`
    );
};

export const renderSitemap = (req: Request, res: Response) => {
    // Note: sitemapXml logic would normally be a service too.
    // Keeping it simple for now as it relies on listVideos
    const videos = listVideos(req);
    const items = [
        {
            changefreq: 'daily',
            lastmod: videos[0]?.createdAt || new Date().toISOString(),
            loc: absoluteUrl(req, '/'),
            priority: '1.0',
        },
        ...videos.map((video) => ({
            changefreq: 'weekly',
            lastmod: video.createdAt,
            loc: video.watchUrl,
            priority: '0.8',
        })),
    ];
    const xmlEscape = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const urls = items
        .map((item) => `<url><loc>${xmlEscape(item.loc)}</loc><lastmod>${xmlEscape(item.lastmod)}</lastmod><changefreq>${item.changefreq}</changefreq><priority>${item.priority}</priority></url>`)
        .join('');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
};

export const renderOgImage = (req: Request, res: Response) => {
    const xmlEscape = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#F5E9DA"/>
  <rect x="44" y="44" width="1112" height="542" rx="28" fill="#FFF9F2" stroke="#E8D6C1" stroke-width="4"/>
  <rect x="88" y="94" width="230" height="48" rx="24" fill="${BRAND_COLOR}"/>
  <text x="203" y="125" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="#FFFFFF">COMPLETELY FREE</text>
  <text x="88" y="220" font-family="Segoe UI, Arial, sans-serif" font-size="66" font-weight="800" fill="#172033">${xmlEscape(PROJECT_NAME)}</text>
  <text x="88" y="290" font-family="Segoe UI, Arial, sans-serif" font-size="32" font-weight="500" fill="#516074">Open-source AI text-to-video with Remotion, Edge-TTS,</text>
  <text x="88" y="334" font-family="Segoe UI, Arial, sans-serif" font-size="32" font-weight="500" fill="#516074">stock visuals, a local portal, and MCP automation.</text>
  <rect x="88" y="404" width="184" height="54" rx="27" fill="#172033"/>
  <text x="180" y="438" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="#FFFFFF">No watermark</text>
  <rect x="292" y="404" width="316" height="54" rx="27" fill="#FFFFFF" stroke="#D7C2AB" stroke-width="2"/>
  <text x="450" y="438" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="#172033">Self-hosted and MIT licensed</text>
  <rect x="804" y="118" width="260" height="332" rx="24" fill="#172033"/>
  <rect x="832" y="148" width="204" height="120" rx="18" fill="${BRAND_COLOR}"/>
  <text x="934" y="218" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="800" fill="#FFFFFF">MP4</text>
  <rect x="832" y="288" width="204" height="24" rx="12" fill="#314257"/>
  <rect x="832" y="328" width="170" height="18" rx="9" fill="#5F728C"/>
  <rect x="832" y="358" width="136" height="18" rx="9" fill="#5F728C"/>
  <rect x="832" y="400" width="94" height="30" rx="15" fill="#FFF9F2"/>
  <text x="879" y="420" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700" fill="#172033">Remotion</text>
  <rect x="942" y="400" width="94" height="30" rx="15" fill="#FFF9F2"/>
  <text x="989" y="420" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700" fill="#172033">Edge-TTS</text>
  <text x="88" y="540" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="600" fill="#516074">github.com/itsPremkumar/Automated-Video-Generator</text>
</svg>`;
    res.type('image/svg+xml').send(svg);
};

export const renderLlmsTxt = (req: Request, res: Response) => {
    res.type('text/plain').sendFile(resolveProjectPath('llms.txt'));
};

export const renderLlmsFullTxt = (req: Request, res: Response) => {
    res.type('text/plain').sendFile(resolveProjectPath('llms-full.txt'));
};
