import express, { NextFunction, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { generateVideo } from './video-generator';
import { renderVideo } from './render';
import { ensureProjectRootCwd, jobStore, resolveProjectPath } from './runtime';
import { AVAILABLE_VOICES } from './lib/voice-generator';
import type { JobStatus } from './runtime';


ensureProjectRootCwd();
config({ path: resolveProjectPath('.env') });

const app = express();
app.set('trust proxy', true);

const PORT = Number(process.env.PORT || 3001);
const OUTPUT_ROOT = resolveProjectPath('output');
const DEFAULT_TITLE = 'Generated Video';
const DEFAULT_VOICE = 'en-US-JennyNeural';
const DEFAULT_FALLBACK_VIDEO = 'default.mp4';
const MAX_TITLE_LENGTH = 80;
const PROJECT_NAME = 'Automated Video Generator';
const PROJECT_REPOSITORY_URL = 'https://github.com/itsPremkumar/Automated-Video-Generator';
const PROJECT_LICENSE_URL = 'https://opensource.org/licenses/MIT';
const DEFAULT_SITE_DESCRIPTION = 'Free and open-source AI text-to-video generator built with Remotion, Edge-TTS, stock footage APIs, and a local web portal for YouTube Shorts, TikTok videos, explainers, and marketing content.';
const DEFAULT_SITE_KEYWORDS = 'free video generator, open-source video generator, ai video generator, text to video, remotion video generator, self-hosted video generator, youtube shorts generator, tiktok video generator, mcp video automation';
const BRAND_COLOR = '#d8642a';

type Orientation = 'portrait' | 'landscape';

interface VideoRecord {
    id: string;
    title: string;
    createdAt: string;
    orientation: string;
    durationSeconds: number | null;
    description: string | null;
    fileSizeMB: string;
    videoFilename: string;
    videoPath: string;
    thumbnailPath: string | null;
    watchUrl: string;
    downloadUrl: string;
    videoUrl: string;
    thumbnailUrl: string | null;
}

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        next();
        return;
    }

    if (record.count >= RATE_LIMIT_MAX) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        res.set('Retry-After', String(retryAfter));
        res.status(429).json({ success: false, error: 'Too many requests', retryAfter });
        return;
    }

    record.count += 1;
    next();
}

function validateScript(script: unknown): { valid: boolean; error?: string } {
    if (!script || typeof script !== 'string') {
        return { valid: false, error: 'Script is required and must be a string.' };
    }

    const trimmed = script.trim();
    if (trimmed.length < 10) {
        return { valid: false, error: 'Script is too short. Minimum 10 characters.' };
    }

    if (trimmed.length > 5000) {
        return { valid: false, error: 'Script is too long. Maximum 5000 characters.' };
    }

    return { valid: true };
}

function validateTitle(title: unknown): { valid: boolean; error?: string } {
    if (title === undefined || title === null || title === '') {
        return { valid: true };
    }

    if (typeof title !== 'string') {
        return { valid: false, error: 'Title must be a string.' };
    }

    if (title.trim().length === 0) {
        return { valid: false, error: 'Title cannot be empty.' };
    }

    if (title.trim().length > MAX_TITLE_LENGTH) {
        return { valid: false, error: `Title is too long. Maximum ${MAX_TITLE_LENGTH} characters.` };
    }

    return { valid: true };
}

function normalizeTitle(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return DEFAULT_TITLE;
    }

    return value.trim().slice(0, MAX_TITLE_LENGTH);
}

function normalizeString(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeOrientation(value: unknown): Orientation {
    return value === 'landscape' ? 'landscape' : 'portrait';
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function sanitizeFolderTitle(value: string): string {
    return value
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 50);
}

function baseUrl(req: Request): string {
    const configured = process.env.PUBLIC_BASE_URL?.trim();
    if (configured) {
        return configured.replace(/\/+$/, '');
    }

    return `${req.protocol}://${req.get('host') || `localhost:${PORT}`}`;
}

function absoluteUrl(req: Request, pathname: string): string {
    return `${baseUrl(req)}${pathname}`;
}

function safePublicId(publicId: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(publicId);
}

function outputFolder(publicId: string): string | null {
    if (!safePublicId(publicId)) {
        return null;
    }

    const folder = path.join(OUTPUT_ROOT, publicId);
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
        return null;
    }

    return folder;
}

function findVideoFile(folder: string): string | null {
    const files = fs.readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.mp4') && !name.startsWith('segment'));
    return files[0] || null;
}

function readSceneData(folder: string): { orientation: string; durationSeconds: number | null } {
    const file = path.join(folder, 'scene-data.json');
    if (!fs.existsSync(file)) {
        return { orientation: 'unknown', durationSeconds: null };
    }

    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        return {
            orientation: data.orientation === 'landscape' ? 'landscape' : data.orientation === 'portrait' ? 'portrait' : 'unknown',
            durationSeconds: typeof data.totalDuration === 'number' ? data.totalDuration : null,
        };
    } catch {
        return { orientation: 'unknown', durationSeconds: null };
    }
}

function readDescription(folder: string): string | null {
    const file = fs.readdirSync(folder).find((name) => name.toLowerCase().endsWith('.txt'));
    if (!file) {
        return null;
    }

    const text = fs.readFileSync(path.join(folder, file), 'utf8').trim();
    return text.length > 0 ? text : null;
}

function getVideo(publicId: string, req: Request): VideoRecord | null {
    const folder = outputFolder(publicId);
    if (!folder) {
        return null;
    }

    const videoFilename = findVideoFile(folder);
    if (!videoFilename) {
        return null;
    }

    const videoPath = path.join(folder, videoFilename);
    const stats = fs.statSync(videoPath);
    const thumbnailPath = path.join(folder, 'thumbnail.jpg');
    const scene = readSceneData(folder);

    return {
        id: publicId,
        title: path.basename(videoFilename, path.extname(videoFilename)).replace(/_/g, ' '),
        createdAt: new Date(stats.mtimeMs).toISOString(),
        orientation: scene.orientation,
        durationSeconds: scene.durationSeconds,
        description: readDescription(folder),
        fileSizeMB: (stats.size / (1024 * 1024)).toFixed(2),
        videoFilename,
        videoPath,
        thumbnailPath: fs.existsSync(thumbnailPath) ? thumbnailPath : null,
        watchUrl: absoluteUrl(req, `/videos/${encodeURIComponent(publicId)}`),
        downloadUrl: absoluteUrl(req, `/download/${encodeURIComponent(publicId)}`),
        videoUrl: absoluteUrl(req, `/files/${encodeURIComponent(publicId)}/video`),
        thumbnailUrl: fs.existsSync(thumbnailPath) ? absoluteUrl(req, `/files/${encodeURIComponent(publicId)}/thumbnail`) : null,
    };
}

function listMusicFiles(): string[] {
    const musicDir = resolveProjectPath('input', 'music');
    if (!fs.existsSync(musicDir)) {
        return [];
    }

    return fs.readdirSync(musicDir).filter((name) => name.toLowerCase().endsWith('.mp3'));
}

function listVideos(req: Request): VideoRecord[] {
    if (!fs.existsSync(OUTPUT_ROOT)) {
        return [];
    }

    return fs.readdirSync(OUTPUT_ROOT)
        .map((name) => getVideo(name, req))
        .filter((video): video is VideoRecord => Boolean(video))
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function publicVideo(video: VideoRecord) {
    return {
        id: video.id,
        title: video.title,
        createdAt: video.createdAt,
        orientation: video.orientation,
        durationSeconds: video.durationSeconds,
        description: video.description,
        fileSizeMB: video.fileSizeMB,
        watchUrl: video.watchUrl,
        downloadUrl: video.downloadUrl,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
    };
}

function jobData(job: JobStatus, req: Request) {
    const publicId = job.publicId || (job.outputPath ? path.basename(path.dirname(job.outputPath)) : null);
    const data: Record<string, unknown> = {
        jobId: job.id,
        title: job.title || null,
        publicId,
        status: job.status,
        progress: job.progress,
        message: job.message,
        error: job.error || null,
        startedAt: new Date(job.startTime).toISOString(),
        finishedAt: job.endTime ? new Date(job.endTime).toISOString() : null,
        statusUrl: absoluteUrl(req, `/api/jobs/${encodeURIComponent(job.id)}`),
        statusPageUrl: absoluteUrl(req, `/jobs/${encodeURIComponent(job.id)}`),
    };

    if (publicId) {
        data.watchUrl = absoluteUrl(req, `/videos/${encodeURIComponent(publicId)}`);
        data.downloadUrl = absoluteUrl(req, `/download/${encodeURIComponent(publicId)}`);
    }

    if (publicId && job.status === 'completed') {
        const video = getVideo(publicId, req);
        if (video) {
            data.video = publicVideo(video);
            data.watchUrl = video.watchUrl;
            data.downloadUrl = video.downloadUrl;
            data.videoUrl = video.videoUrl;
        }
    }

    return data;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

interface HtmlOptions {
    canonical?: string;
    description?: string;
    imageUrl?: string | null;
    jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
    keywords?: string;
    ogType?: string;
    robots?: string;
}

function normalizeMetaText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function truncateText(value: string, maxLength: number): string {
    const normalized = normalizeMetaText(value);
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function toIsoDuration(durationSeconds: number | null): string | undefined {
    if (!durationSeconds || durationSeconds <= 0) {
        return undefined;
    }

    return `PT${Math.max(1, Math.round(durationSeconds))}S`;
}

function serializeJsonLd(jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>): string {
    if (!jsonLd) {
        return '';
    }

    const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    return items
        .map((item) => `<script type="application/ld+json">${JSON.stringify(item).replace(/</g, '\\u003c')}</script>`)
        .join('');
}

function videoMetaDescription(video: VideoRecord): string {
    const fallback = `${video.title} is a video published with ${PROJECT_NAME}, a free and open-source Remotion-based text-to-video generator.`;
    return truncateText(video.description || fallback, 160);
}

function xmlEscape(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function noIndex(res: Response): void {
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
}

function socialPreviewSvg(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
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
}

function sitemapXml(req: Request): string {
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

    const urls = items
        .map((item) => `<url><loc>${xmlEscape(item.loc)}</loc><lastmod>${xmlEscape(item.lastmod)}</lastmod><changefreq>${item.changefreq}</changefreq><priority>${item.priority}</priority></url>`)
        .join('');

    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

function html(title: string, body: string, options: HtmlOptions = {}, script = ''): string {
    const description = options.description || DEFAULT_SITE_DESCRIPTION;
    const keywords = options.keywords || DEFAULT_SITE_KEYWORDS;
    const robots = options.robots || 'index,follow,max-image-preview:large';
    const ogType = options.ogType || 'website';
    const canonical = options.canonical ? `<link rel="canonical" href="${escapeHtml(options.canonical)}">` : '';
    const ogUrl = options.canonical ? `<meta property="og:url" content="${escapeHtml(options.canonical)}">` : '';
    const imageMeta = options.imageUrl
        ? `<meta property="og:image" content="${escapeHtml(options.imageUrl)}"><meta name="twitter:image" content="${escapeHtml(options.imageUrl)}">`
        : '';
    const twitterCard = options.imageUrl ? 'summary_large_image' : 'summary';
    const jsonLd = serializeJsonLd(options.jsonLd);

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="keywords" content="${escapeHtml(keywords)}"><meta name="robots" content="${escapeHtml(robots)}"><meta name="theme-color" content="${BRAND_COLOR}"><meta name="generator" content="${PROJECT_NAME}"><meta property="og:site_name" content="${PROJECT_NAME}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="${escapeHtml(ogType)}">${ogUrl}${imageMeta}<meta name="twitter:card" content="${twitterCard}"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><link rel="alternate" type="text/plain" href="/llms.txt" title="LLMs summary">${canonical}${jsonLd}<style>
body{margin:0;font:16px/1.5 "Segoe UI",sans-serif;background:#f6efe5;color:#1b2333}main{max-width:960px;margin:0 auto;padding:24px}section{background:#fff;border:1px solid #e6dccd;border-radius:18px;padding:24px;margin-bottom:20px;box-shadow:0 12px 30px rgba(0,0,0,.05)}h1,h2,h3{margin:0 0 12px}p{margin:0 0 10px}.muted{color:#5d6572}.grid{display:grid;gap:16px}.cards{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.card{display:block;text-decoration:none;color:inherit;border:1px solid #eadfce;border-radius:16px;overflow:hidden;background:#fff}.thumb{aspect-ratio:9/16;background:#e9edf3 center/cover no-repeat}.card-body{padding:14px}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.pill{padding:6px 10px;border-radius:999px;background:#eef3f8;font-size:12px}.button,button{border:0;border-radius:999px;padding:12px 18px;background:${BRAND_COLOR};color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}a.secondary{background:#edf1f5;color:#1b2333}input,textarea,select{width:100%;padding:12px 14px;border:1px solid #d8dce2;border-radius:12px;font:inherit}textarea{min-height:180px;resize:vertical}.form{display:grid;gap:14px}.video{width:100%;border-radius:16px;background:#000}.bar{height:14px;background:#edf1f5;border-radius:999px;overflow:hidden}.bar>div{height:100%;width:0;background:${BRAND_COLOR};transition:width .2s}.status{padding:14px;border-radius:14px;background:#fff5ee;border:1px solid #f1d2bf}.meta{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}.hero{display:grid;gap:14px}.note{background:#fff8f2;border-color:#f2d7c4}.footer-note{font-size:14px}ul{margin:0;padding-left:20px}@media(max-width:640px){main{padding:14px}section{padding:18px}}</style></head><body><main>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;
}

function homePage(req: Request, videos: VideoRecord[]): string {
    const defaultOgImage = absoluteUrl(req, '/og-image.svg');
    const cards = videos.length > 0
        ? videos.map((video) => `<a class="card" href="${video.watchUrl}"><div class="thumb"${video.thumbnailUrl ? ` style="background-image:url('${video.thumbnailUrl}')"` : ''}></div><div class="card-body"><h3>${escapeHtml(video.title)}</h3><p class="muted">${escapeHtml(video.orientation)} - ${video.fileSizeMB} MB</p><div class="row">${video.durationSeconds ? `<span class="pill">${Math.round(video.durationSeconds)} sec</span>` : ''}<span class="pill">${escapeHtml(new Date(video.createdAt).toLocaleString())}</span></div></div></a>`).join('')
        : '<p class="muted">No completed videos yet. Start one below and it will appear here automatically.</p>';

    const musicFiles = listMusicFiles();
    const musicOptions = musicFiles.length > 0
        ? musicFiles.map((file) => `<option value="${escapeHtml(file)}">${escapeHtml(file)}</option>`).join('')
        : '<option value="">No music found in input/music</option>';

    const voiceOptions = Object.entries(AVAILABLE_VOICES).map(([lang, voices]) => {
        const langName = lang.charAt(0).toUpperCase() + lang.slice(1);
        const maleOptions = voices.male.map(v => `<option value="${v}">${v} (Male)</option>`).join('');
        const femaleOptions = voices.female.map(v => `<option value="${v}">${v} (Female)</option>`).join('');
        return `<optgroup label="${langName}">${femaleOptions}${maleOptions}</optgroup>`;
    }).join('');

    const languageOptions = Object.keys(AVAILABLE_VOICES).map(lang => {
        const langName = lang.charAt(0).toUpperCase() + lang.slice(1);
        return `<option value="${lang}">${langName}</option>`;
    }).join('');

    return html(
        `Free Automated Video Generator | Open-Source Remotion Text-to-Video Tool`,
        `<section class="hero"><h1>${PROJECT_NAME}</h1><p>Free and open-source AI text-to-video generator for creating YouTube Shorts, TikTok videos, explainers, and marketing content with Remotion, Edge-TTS, and stock media APIs.</p><p class="muted">Start a render, share the status page, then send the final watch or download link to the end user.</p><div class="row"><a class="button" href="${PROJECT_REPOSITORY_URL}" target="_blank" rel="noreferrer">Star on GitHub</a><a class="button secondary" href="/llms.txt">Read AI summary</a></div></section><section class="note"><h2>Completely free and open source</h2><p>This project is MIT-licensed and free to use. There is no repo-owned paid tier and no watermark added by this codebase. If you use optional third-party providers such as Pexels or Pixabay, their own limits still apply.</p></section><section><h2>Why creators use it</h2><div class="grid cards"><div class="card"><div class="card-body"><h3>YouTube Shorts and TikTok</h3><p class="muted">Generate portrait videos from scripts with narration, stock visuals, and local assets.</p></div></div><div class="card"><div class="card-body"><h3>Self-hosted pipeline</h3><p class="muted">Run locally with your own APIs, assets, and workflow control instead of relying on closed platforms.</p></div></div><div class="card"><div class="card-body"><h3>MCP-ready automation</h3><p class="muted">Let Claude Desktop, Claude Code, or other MCP clients generate and manage videos through tools.</p></div></div></div></section><section><h2>Create a video</h2><form id="generate-form" class="form"><input id="title" placeholder="Video title" maxlength="${MAX_TITLE_LENGTH}" required><textarea id="script" placeholder="[Visual: futuristic robotics lab] AI is changing how people and robots work together." required></textarea><div class="grid cards"><select id="orientation"><option value="portrait">Portrait (9:16)</option><option value="landscape">Landscape (16:9)</option></select><select id="language"><option value="">Select Language (Default: English)</option>${languageOptions}</select><select id="voice"><option value="">Select Voice (Optional Override)</option>${voiceOptions}</select></div><div class="grid cards"><select id="backgroundMusic"><option value="">No Background Music</option>${musicOptions}</select><input id="defaultVideo" value="${DEFAULT_FALLBACK_VIDEO}" placeholder="Fallback asset"></div><div class="grid cards"><label class="row" style="padding-top:12px"><input id="showText" type="checkbox" checked style="width:auto"> Show subtitles</label></div><div class="row"><button type="submit">Generate Video</button><span class="muted">You will be redirected to a live job page.</span></div></form><div id="form-status" class="status" hidden></div></section><section><h2>Completed videos</h2><div class="grid cards">${cards}</div></section>`,
        {
            canonical: absoluteUrl(req, '/'),
            description: DEFAULT_SITE_DESCRIPTION,
            imageUrl: videos[0]?.thumbnailUrl || defaultOgImage,
            jsonLd: [
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
                    operatingSystem: 'Windows, macOS, Linux',
                    sameAs: PROJECT_REPOSITORY_URL,
                    url: absoluteUrl(req, '/'),
                },
                {
                    '@context': 'https://schema.org',
                    '@type': 'SoftwareSourceCode',
                    codeRepository: PROJECT_REPOSITORY_URL,
                    description: DEFAULT_SITE_DESCRIPTION,
                    license: PROJECT_LICENSE_URL,
                    name: PROJECT_NAME,
                    programmingLanguage: ['TypeScript', 'React'],
                    runtimePlatform: 'Node.js',
                },
            ],
            keywords: DEFAULT_SITE_KEYWORDS,
            ogType: 'website',
        },
        `const form=document.getElementById('generate-form');const status=document.getElementById('form-status');form.addEventListener('submit',async(e)=>{e.preventDefault();status.hidden=false;status.textContent='Starting render...';const payload={title:document.getElementById('title').value,script:document.getElementById('script').value,orientation:document.getElementById('orientation').value,language:document.getElementById('language').value,voice:document.getElementById('voice').value || undefined,backgroundMusic:document.getElementById('backgroundMusic').value,defaultVideo:document.getElementById('defaultVideo').value,showText:document.getElementById('showText').checked};try{const res=await fetch('/generate-video',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const json=await res.json();if(!res.ok||!json.success)throw new Error(json.error||'Unable to start render.');window.location.href=json.data.statusPageUrl;}catch(err){status.textContent=err instanceof Error?err.message:'Unable to start render.';}});`,
    );
}

function jobPage(req: Request, jobId: string): string {
    return html(
        `Render Job ${jobId} | ${PROJECT_NAME}`,
        `<section><h1 id="title">Render in progress</h1><p id="message" class="muted">This page refreshes automatically until the video is ready.</p><div class="bar"><div id="progress"></div></div><div class="meta"><div><strong>Status</strong><p id="status" class="muted">pending</p></div><div><strong>Progress</strong><p id="percent" class="muted">0%</p></div><div><strong>Job ID</strong><p class="muted">${escapeHtml(jobId)}</p></div></div><div id="actions" class="row" style="margin-top:14px"></div><div id="error" class="status" hidden></div></section>`,
        {
            canonical: absoluteUrl(req, `/jobs/${encodeURIComponent(jobId)}`),
            description: 'Track a video rendering job in Automated Video Generator.',
            ogType: 'website',
            robots: 'noindex, nofollow',
        },
        `const id=${JSON.stringify(jobId)};const title=document.getElementById('title');const message=document.getElementById('message');const status=document.getElementById('status');const percent=document.getElementById('percent');const progress=document.getElementById('progress');const actions=document.getElementById('actions');const error=document.getElementById('error');async function refresh(){try{const res=await fetch('/api/jobs/'+encodeURIComponent(id),{cache:'no-store'});const json=await res.json();if(!res.ok||!json.success)throw new Error(json.error||'Unable to load job.');const data=json.data;title.textContent=data.title||'Render in progress';message.textContent=data.message||'Working on your video.';status.textContent=String(data.status);percent.textContent=String(data.progress)+'%';progress.style.width=Math.max(0,Math.min(100,Number(data.progress)||0))+'%';if(data.status==='completed'){actions.innerHTML='<a class="button" href="'+data.watchUrl+'">Open Watch Page</a><a class="button secondary" href="'+data.downloadUrl+'">Download MP4</a><a class="button secondary" href="/">Back to Portal</a>';window.clearInterval(timer);}if(data.status==='failed'){error.hidden=false;error.textContent=data.error||'Render failed.';window.clearInterval(timer);}}catch(err){error.hidden=false;error.textContent=err instanceof Error?err.message:'Unable to load job.';}}const timer=window.setInterval(refresh,3000);refresh();`,
    );
}

function watchPage(req: Request, video: VideoRecord): string {
    const description = videoMetaDescription(video);

    return html(
        `${video.title} | ${PROJECT_NAME}`,
        `<section><h1>${escapeHtml(video.title)}</h1><p class="muted">Stream the video here or download the MP4. This delivery page is generated by ${PROJECT_NAME}.</p><div class="row"><span class="pill">${escapeHtml(video.orientation)}</span>${video.durationSeconds ? `<span class="pill">${Math.round(video.durationSeconds)} sec</span>` : ''}<span class="pill">${video.fileSizeMB} MB</span></div></section><section><video class="video" controls playsinline preload="metadata"${video.thumbnailUrl ? ` poster="${video.thumbnailUrl}"` : ''}><source src="${video.videoUrl}" type="video/mp4"></video><div class="row" style="margin-top:14px"><a class="button" href="${video.downloadUrl}">Download MP4</a><a class="button secondary" href="/">Back to Portal</a></div></section>${video.description ? `<section><h2>Video details</h2><p>${escapeHtml(video.description).replace(/\n/g, '<br>')}</p></section>` : ''}<section><h2>Built with ${PROJECT_NAME}</h2><p class="muted footer-note">This video was published using a free and open-source Remotion-based text-to-video generator.</p><div class="row"><a class="button secondary" href="${PROJECT_REPOSITORY_URL}" target="_blank" rel="noreferrer">View on GitHub</a></div></section>`,
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
        },
    );
}

async function startJob(req: Request, res: Response) {
    const titleCheck = validateTitle(req.body?.title);
    if (!titleCheck.valid) {
        res.status(400).json({ success: false, error: titleCheck.error });
        return;
    }

    const scriptCheck = validateScript(req.body?.script);
    if (!scriptCheck.valid) {
        res.status(400).json({ success: false, error: scriptCheck.error });
        return;
    }

    const title = normalizeTitle(req.body?.title);
    const script = normalizeString(req.body?.script, '').trim();
    const orientation = normalizeOrientation(req.body?.orientation);
    const language = normalizeString(req.body?.language, '');
    const voice = normalizeString(req.body?.voice, '');
    const showText = normalizeBoolean(req.body?.showText, true);

    const backgroundMusic = normalizeString(req.body?.backgroundMusic, '');
    const defaultVideo = normalizeString(req.body?.defaultVideo, DEFAULT_FALLBACK_VIDEO);
    const publicId = `${sanitizeFolderTitle(title) || 'video'}_${Date.now()}`;
    const jobId = `job_${Date.now()}_${title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'video'}`;
    const outputDir = resolveProjectPath('output', publicId);

    fs.mkdirSync(outputDir, { recursive: true });

    jobStore.set(jobId, {
        title,
        publicId,
        status: 'pending',
        progress: 0,
        message: 'Queued for processing.',
    });

    void (async () => {
        try {
            jobStore.set(jobId, { status: 'processing', progress: 5, message: 'Generating assets and voiceover.' });

            const result = await generateVideo(script, outputDir, {
                title,
                orientation,
                language,
                voice: voice || undefined,
                showText,

                defaultVideo,
                backgroundMusic,
                onProgress: (step: string, percent: number, message: string) => {
                    jobStore.set(jobId, {
                        status: 'processing',
                        progress: 5 + Math.round((percent / 100) * 60),
                        message: `${step}: ${message}`,
                    });
                },
            });

            if (!result.success) {
                jobStore.set(jobId, {
                    status: 'failed',
                    progress: 100,
                    message: 'Generation failed before render.',
                    error: result.error || 'Unknown generation error.',
                    endTime: Date.now(),
                });
                return;
            }

            jobStore.set(jobId, { status: 'processing', progress: 75, message: 'Rendering final MP4.' });
            await renderVideo(outputDir);

            const finalVideo = findVideoFile(outputDir);
            if (!finalVideo) {
                jobStore.set(jobId, {
                    status: 'failed',
                    progress: 100,
                    message: 'Render finished without a final MP4.',
                    error: 'No final video file found.',
                    endTime: Date.now(),
                });
                return;
            }

            jobStore.set(jobId, {
                status: 'completed',
                progress: 100,
                message: 'Video ready for playback and download.',
                outputPath: path.join(outputDir, finalVideo),
                endTime: Date.now(),
            });
        } catch (error: any) {
            jobStore.set(jobId, {
                status: 'failed',
                progress: 100,
                message: 'A fatal error occurred while processing the job.',
                error: error?.message || 'Unknown server error.',
                endTime: Date.now(),
            });
        }
    })();

    res.status(202).json({
        success: true,
        data: {
            jobId,
            title,
            publicId,
            statusUrl: absoluteUrl(req, `/api/jobs/${encodeURIComponent(jobId)}`),
            statusPageUrl: absoluteUrl(req, `/jobs/${encodeURIComponent(jobId)}`),
        },
    });
}

app.use((req: Request, res: Response, next: NextFunction) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-XSS-Protection', '1; mode=block');
    next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    next();
});

app.use(express.json({ limit: '10kb' }));

app.use((req: Request, res: Response, next: NextFunction) => {
    if (
        req.path === '/generate-video' ||
        req.path === '/health' ||
        req.path.startsWith('/api/') ||
        req.path.startsWith('/download/') ||
        req.path.startsWith('/files/') ||
        req.path.startsWith('/jobs/')
    ) {
        noIndex(res);
    }

    next();
});

app.get('/robots.txt', (req: Request, res: Response) => {
    res.type('text/plain').send(
        `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /download/\nDisallow: /files/\nDisallow: /health\nDisallow: /jobs/\nSitemap: ${absoluteUrl(req, '/sitemap.xml')}\n`
    );
});

app.get('/sitemap.xml', (req: Request, res: Response) => {
    res.type('application/xml').send(sitemapXml(req));
});

app.get('/og-image.svg', (req: Request, res: Response) => {
    res.type('image/svg+xml').send(socialPreviewSvg());
});

app.get('/llms.txt', (req: Request, res: Response) => {
    res.type('text/plain').sendFile(resolveProjectPath('llms.txt'));
});

app.get('/llms-full.txt', (req: Request, res: Response) => {
    res.type('text/plain').sendFile(resolveProjectPath('llms-full.txt'));
});

app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'video-generator', publishedVideos: listVideos(req).length, jobsTracked: jobStore.all().length });
});

app.get('/api/videos', (req: Request, res: Response) => {
    res.json({ success: true, data: listVideos(req).map(publicVideo) });
});

app.get('/api/videos/:videoId', (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video) {
        res.status(404).json({ success: false, error: 'Video not found.' });
        return;
    }

    res.json({ success: true, data: publicVideo(video) });
});

app.get('/api/jobs/:jobId', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const job = jobStore.get(jobId);
    if (!job) {
        res.status(404).json({ success: false, error: 'Job not found.' });
        return;
    }

    res.json({ success: true, data: jobData(job, req) });
});

app.post('/generate-video', rateLimiter, startJob);
app.post('/api/jobs', rateLimiter, startJob);

app.get('/files/:videoId/video', (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video) {
        res.status(404).send('Video not found.');
        return;
    }

    res.type('video/mp4').sendFile(video.videoPath);
});

app.get('/files/:videoId/thumbnail', (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video || !video.thumbnailPath) {
        res.status(404).send('Thumbnail not found.');
        return;
    }

    res.sendFile(video.thumbnailPath);
});

app.get('/download/:videoId', (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video) {
        res.status(404).send('Video not found.');
        return;
    }

    res.download(video.videoPath, video.videoFilename);
});

app.get('/videos/:videoId', (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video) {
        res.status(404).type('html').send(
            html(
                `Video Not Found | ${PROJECT_NAME}`,
                '<section><h1>Video not found</h1><p class="muted">The requested video is not available.</p><a class="button secondary" href="/">Back to Portal</a></section>',
                {
                    description: 'The requested video page could not be found.',
                    ogType: 'website',
                    robots: 'noindex, nofollow',
                },
            )
        );
        return;
    }

    res.type('html').send(watchPage(req, video));
});

app.get('/jobs/:jobId', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    res.type('html').send(jobPage(req, jobId));
});

app.get('/', (req: Request, res: Response) => {
    res.type('html').send(homePage(req, listVideos(req)));
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Video Generator portal running on http://localhost:${PORT}`);
});
