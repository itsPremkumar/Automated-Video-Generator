import express, { NextFunction, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { config, parse } from 'dotenv';
import { generateVideo } from './video-generator';
import { renderVideo } from './render';
import { ensureProjectRootCwd, jobStore, resolveProjectPath } from './runtime';
import { AVAILABLE_VOICES, getDynamicVoices, validateEdgeTTS, VoiceMetadata } from './lib/voice-generator';
import type { JobStatus } from './runtime';



ensureProjectRootCwd();
config({ path: resolveProjectPath('.env') });

const app = express();
app.set('trust proxy', true);

const PORT = Number(process.env.PORT || 3001);
const OUTPUT_ROOT = resolveProjectPath('output');
const ENV_FILE = resolveProjectPath('.env');
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
const DEMO_SCRIPT = `[Visual: sunrise city skyline drone]
Artificial intelligence is no longer a distant idea. It already helps cities, schools, hospitals, and businesses work faster and smarter.

[Visual: software engineer coding on laptop]
Behind the scenes, machine learning systems organize huge amounts of information, detect patterns, and turn messy data into useful decisions.

[Visual: doctor reviewing digital health monitor]
In healthcare, AI can support doctors by highlighting unusual scans, tracking patient risk, and reducing the time needed to review critical cases.

[Visual: teacher using tablet in classroom]
In education, adaptive tools can help teachers explain difficult topics, personalize lessons, and give students more confidence as they learn step by step.

[Visual: warehouse robots moving packages]
Inside factories and warehouses, intelligent software coordinates robots, predicts maintenance, and keeps products moving smoothly from one station to the next.

[Visual: cybersecurity analyst monitoring screens]
Security teams also use AI to detect unusual behavior, respond to threats faster, and monitor systems that would be impossible to review manually all day.

[Visual: diverse team discussing ethics in office]
The next challenge is not only building more powerful systems, but using them responsibly, transparently, and in ways that genuinely improve human life.`;

const EDITABLE_ENV_KEYS = ['PEXELS_API_KEY', 'PIXABAY_API_KEY', 'GEMINI_API_KEY', 'PUBLIC_BASE_URL'] as const;
type EditableEnvKey = typeof EDITABLE_ENV_KEYS[number];

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

function readEnvValues(): Record<string, string> {
    if (!fs.existsSync(ENV_FILE)) {
        return {};
    }

    try {
        return parse(fs.readFileSync(ENV_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function normalizeEnvValue(value: unknown): string {
    return typeof value === 'string' ? value.trim().replace(/\r?\n/g, ' ') : '';
}

function setEnvFileValue(contents: string, key: EditableEnvKey, value: string): string {
    const normalizedLine = `${key}=${value}`;
    const matcher = new RegExp(`^\\s*#?\\s*${key}=.*$`, 'm');

    if (matcher.test(contents)) {
        return contents.replace(matcher, () => normalizedLine);
    }

    const suffix = contents.trimEnd().length > 0 ? '\n' : '';
    return `${contents.trimEnd()}${suffix}${normalizedLine}\n`;
}

function updateEnvValues(updates: Partial<Record<EditableEnvKey, string>>): void {
    let contents = fs.existsSync(ENV_FILE)
        ? fs.readFileSync(ENV_FILE, 'utf8')
        : (fs.existsSync(resolveProjectPath('.env.example')) ? fs.readFileSync(resolveProjectPath('.env.example'), 'utf8') : '');

    for (const key of EDITABLE_ENV_KEYS) {
        if (!(key in updates)) {
            continue;
        }

        const value = normalizeEnvValue(updates[key]);
        contents = setEnvFileValue(contents, key, value);
        process.env[key] = value;
    }

    fs.writeFileSync(ENV_FILE, contents);
}

function setupStatus() {
    const envValues = readEnvValues();
    const hasPexelsKey = Boolean(envValues.PEXELS_API_KEY?.trim());
    const hasPixabayKey = Boolean(envValues.PIXABAY_API_KEY?.trim());
    const hasGeminiKey = Boolean(envValues.GEMINI_API_KEY?.trim());
    const hasPublicBaseUrl = Boolean(envValues.PUBLIC_BASE_URL?.trim());
    const edgeTtsReady = validateEdgeTTS();

    return {
        envFileExists: fs.existsSync(ENV_FILE),
        hasPexelsKey,
        hasPixabayKey,
        hasGeminiKey,
        hasPublicBaseUrl,
        edgeTtsReady,
        readyForGeneration: hasPexelsKey && edgeTtsReady,
    };
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
        console.log(`[SERVER] ERROR: Output folder not found for publicId: ${publicId}`);
        return null;
    }

    const videoFilename = findVideoFile(folder);
    if (!videoFilename) {
        console.log(`[SERVER] ERROR: No video file found in folder: ${folder}`);
        return null;
    }

    const videoPath = path.join(folder, videoFilename);
    const stats = fs.statSync(videoPath);
    
    if (stats.size === 0) {
        console.log(`[SERVER] ERROR: Video file is empty (0 bytes): ${videoPath}`);
        return null;
    }

    const thumbnailPath = path.join(folder, 'thumbnail.jpg');
    const scene = readSceneData(folder);

    const record: VideoRecord = {
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

    return record;
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
:root{--shell:#f4ead9;--cream:#fff9ef;--surface:#fffdf8;--surface-soft:#fff7ec;--line:#e6d6be;--line-strong:#d9c3a8;--ink:#172033;--muted:#5c6677;--brand:${BRAND_COLOR};--brand-strong:#cf6b36;--accent:#1f3a56;--success:#2f7d5d;--shadow:0 24px 60px rgba(31,22,10,.08);--radius-xl:28px;--radius-lg:22px;--radius-md:16px}
*{box-sizing:border-box}
html{background:linear-gradient(180deg,#f8efe2 0%,#f5ebde 100%)}
body{margin:0;font:16px/1.6 "Aptos","Trebuchet MS","Segoe UI",sans-serif;color:var(--ink);background:radial-gradient(circle at top left,rgba(212,125,55,.16),transparent 28%),radial-gradient(circle at top right,rgba(23,58,86,.12),transparent 28%),linear-gradient(180deg,#f8efe2 0%,#f3eadf 40%,#f8f5ef 100%);min-height:100vh}
body::before{content:"";position:fixed;inset:0;background-image:linear-gradient(rgba(255,255,255,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.12) 1px,transparent 1px);background-size:64px 64px;opacity:.16;pointer-events:none}
main{max-width:1180px;margin:0 auto;padding:32px 20px 56px;position:relative}
section{margin-bottom:22px}
a{color:inherit}
h1,h2,h3{margin:0 0 10px;font-family:"Georgia","Times New Roman",serif;letter-spacing:-.02em;line-height:1.08}
h1{font-size:clamp(2.4rem,4vw,4.35rem)}
h2{font-size:clamp(1.6rem,2.8vw,2.35rem)}
h3{font-size:1.18rem}
p{margin:0 0 10px}
.hero-surface,.panel{background:rgba(255,251,244,.9);backdrop-filter:blur(10px);border:1px solid var(--line);box-shadow:var(--shadow);border-radius:var(--radius-xl)}
.hero-surface{padding:28px}
.panel{padding:22px}
.panel.soft{background:rgba(255,247,236,.94)}
.panel.tint{background:linear-gradient(135deg,rgba(255,248,238,.98),rgba(243,235,225,.95))}
.hero-grid,.layout-split,.watch-grid,.cards,.metric-grid,.field-grid,.status-board,.feature-list,.recent-grid{display:grid;gap:14px}
.hero-grid{grid-template-columns:minmax(0,1.45fr) minmax(320px,.95fr);align-items:start}
.layout-split{grid-template-columns:minmax(0,1.35fr) minmax(300px,.9fr)}
.watch-grid{grid-template-columns:minmax(0,1.5fr) minmax(320px,.8fr);align-items:start}
.cards{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.metric-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.feature-list{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.field-grid.two-up{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.status-board{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.stack,.form,.form-panel,.field,.script-shell,.progress-shell,.timeline,.info-list{display:grid;gap:16px}
.eyebrow{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:#fff3e4;border:1px solid #f1d2b7;color:#9a4716;text-transform:uppercase;letter-spacing:.08em;font-size:12px;font-weight:700}
.lead{font-size:1.08rem;max-width:58ch;color:#314157}
.lead.small{font-size:1rem}
.muted{color:var(--muted)}
.toolbar,.row,.script-toolbar,.panel-head,.toggle-row,.info-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.panel-head,.script-toolbar,.info-row{justify-content:space-between}
.button,button{appearance:none;border:0;border-radius:999px;padding:12px 18px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;box-shadow:0 10px 24px rgba(202,106,43,.24);transition:transform .16s ease,box-shadow .16s ease}
.button:hover,button:hover{transform:translateY(-1px);box-shadow:0 14px 30px rgba(202,106,43,.28)}
.button.secondary,button.secondary,a.secondary{background:#edf2f7;color:var(--ink);box-shadow:none}
.button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line-strong);box-shadow:none}
.status-chip,.pill,.helper-badge{display:inline-flex;align-items:center;padding:7px 12px;border-radius:999px;background:#fff;border:1px solid var(--line);font-size:12px;font-weight:700;color:#324156}
.helper-badge{padding:6px 10px;background:#f5efe7;border-color:#eadac3;color:#5d6572}
.status-chip.ok{border-color:#c8e3d4;background:#eef9f2;color:#1d684b}
.status-chip.warn{border-color:#f3d4be;background:#fff2e7;color:#9a4716}
.metric-card,.status-card,.highlight-box{padding:18px;border-radius:20px;border:1px solid var(--line);background:linear-gradient(180deg,#fffdf8,#fff5e9)}
.metric-card strong,.status-card strong{display:block;margin-bottom:4px;font-size:1.45rem;font-family:"Georgia","Times New Roman",serif}
.card{display:block;text-decoration:none;color:inherit;border:1px solid var(--line);border-radius:22px;overflow:hidden;background:rgba(255,253,248,.92);box-shadow:0 12px 32px rgba(34,23,11,.06)}
.thumb{aspect-ratio:9/16;background:#e9edf3 center/cover no-repeat}
.card-body{padding:16px}
.card-body h3{margin-bottom:6px}
.small-card{display:grid;grid-template-columns:110px 1fr;gap:14px;padding:12px;border:1px solid var(--line);border-radius:20px;background:#fff}
.small-thumb{aspect-ratio:9/16;border-radius:14px;background:#edf1f5 center/cover no-repeat}
.field label{font-weight:700;color:#223048}
.field-help{font-size:14px;color:var(--muted);margin:0}
input,textarea,select{width:100%;padding:13px 15px;border:1px solid #d8ccb9;border-radius:16px;font:inherit;background:#fffdf9;color:var(--ink);box-shadow:inset 0 1px 2px rgba(0,0,0,.02)}
input:focus,textarea:focus,select:focus{outline:none;border-color:#cf7a46;box-shadow:0 0 0 4px rgba(207,122,70,.12)}
textarea{min-height:250px;resize:vertical}
.script-guide{display:grid;gap:10px;padding:16px;border-radius:18px;background:#fff7ee;border:1px dashed #e9c9ac}
.voice-search{font-size:14px;padding:10px 12px;border-color:#e1d2bc;background:#fffaf5}
.toggle-row{padding:14px 16px;border-radius:18px;background:#fff8ef;border:1px solid var(--line)}
.toggle-row input{width:auto}
.status{padding:14px 16px;border-radius:16px;background:#fff4eb;border:1px solid #efcfb8}
.status.success{background:#eef9f2;border-color:#c8e3d4}
.empty-state{padding:20px;border-radius:20px;background:#fff9f1;border:1px dashed #e4ccb0}
.compact-list,.checklist{margin:0;padding-left:18px;color:#354459}
.compact-list li,.checklist li{margin:0 0 8px}
.bar{height:16px;background:#eadfce;border-radius:999px;overflow:hidden}
.bar>div{height:100%;width:0;background:linear-gradient(90deg,var(--brand),#f09a62);border-radius:inherit;transition:width .25s ease}
.timeline-step{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:18px;background:#fff;border:1px solid var(--line);transition:border-color .2s ease,transform .2s ease,box-shadow .2s ease}
.timeline-step span{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#edf2f7;font-weight:800;color:#516074;flex:0 0 auto}
.timeline-step.active{border-color:#efbb96;background:#fff7ef;transform:translateX(4px);box-shadow:0 10px 24px rgba(202,106,43,.12)}
.timeline-step.active span{background:var(--brand);color:#fff}
.timeline-step.done{border-color:#c8e3d4;background:#eef9f2}
.timeline-step.done span{background:var(--success);color:#fff}
.video-stage{padding:18px;border-radius:26px;background:linear-gradient(180deg,#1c2638,#0c1220);box-shadow:0 24px 55px rgba(15,20,31,.26)}
.video{width:100%;display:block;border:0;border-radius:18px;background:#000}
.info-row{padding:12px 0;border-bottom:1px solid #eee0cf}
.info-row:last-child{border-bottom:0}
.footer-note{font-size:14px}
.browser-modal{position:fixed;inset:0;background:rgba(23,32,51,.8);backdrop-filter:blur(8px);z-index:1000;display:grid;place-items:center;padding:20px;opacity:0;pointer-events:none;transition:opacity .2s ease}
.browser-modal.open{opacity:1;pointer-events:auto}
.browser-content{background:var(--cream);width:100%;max-width:1000px;height:85vh;border-radius:var(--radius-xl);display:grid;grid-template-columns:250px 1fr;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.4);border:1px solid var(--line)}
.browser-sidebar{background:var(--surface-soft);border-right:1px solid var(--line);padding:20px 0;display:flex;flex-direction:column;gap:16px;overflow-y:auto}
.sidebar-section{padding:0 20px}
.sidebar-title{font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}
.sidebar-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;transition:background .16s ease}
.sidebar-item:hover{background:#fff3e4}
.sidebar-item.active{background:var(--brand);color:#fff}
.browser-main{display:flex;flex-direction:column;overflow:hidden}
.browser-header{padding:22px;border-bottom:1px solid var(--line);background:var(--surface);display:flex;justify-content:space-between;align-items:center}
.browser-path-wrapper{display:flex;align-items:center;padding:12px 20px;background:var(--surface-soft);border-bottom:1px solid var(--line)}
.browser-path{font-family:monospace;font-size:13px;padding:8px 12px;background:#fff;border-radius:8px;border:1px solid var(--line);flex:1}
.browser-list{flex:1;overflow-y:auto;padding:12px}
.browser-item{display:grid;grid-template-columns:32px 1fr 100px;align-items:center;padding:10px 14px;border-radius:12px;cursor:pointer;transition:background .16s ease}
.browser-item:hover{background:#fff3e4}
.browser-icon{font-size:18px}
.browser-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.browser-size{font-size:12px;color:var(--muted);text-align:right}
.browser-footer{padding:18px;border-top:1px solid var(--line);background:var(--surface-soft);display:flex;justify-content:flex-end;gap:12px}
@media(max-width:800px){.browser-content{grid-template-columns:1fr}.browser-sidebar{display:none}}
.asset-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;margin-top:10px}
.asset-item{padding:8px;border:1px solid var(--line);border-radius:14px;background:#fff;position:relative;text-align:center}
.asset-item .tag-copy{font-size:11px;font-family:monospace;background:#f5efe7;padding:4px;border-radius:4px;display:block;margin-top:4px;cursor:pointer}
.asset-item .tag-copy:hover{background:#efdfcf}
.browser-item.disabled{opacity:.5;cursor:not-allowed}
@media(max-width:980px){.hero-grid,.layout-split,.watch-grid{grid-template-columns:1fr}main{padding:24px 16px 48px}}
@media(max-width:640px){body{font-size:15px}.hero-surface,.panel{padding:18px;border-radius:22px}h1{font-size:2.15rem}.small-card{grid-template-columns:1fr}.script-toolbar,.panel-head,.info-row{align-items:flex-start}}
</style></head><body><main>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;

}

function homePage(req: Request, videos: VideoRecord[]): string {
    const defaultOgImage = absoluteUrl(req, '/og-image.svg');
    const cards = videos.length > 0
        ? videos.map((video) => `<a class="card" href="${video.watchUrl}"><div class="thumb"${video.thumbnailUrl ? ` style="background-image:url('${video.thumbnailUrl}')"` : ''}></div><div class="card-body"><h3>${escapeHtml(video.title)}</h3><p class="muted">${escapeHtml(video.orientation)} - ${video.fileSizeMB} MB</p><div class="row">${video.durationSeconds ? `<span class="pill">${Math.round(video.durationSeconds)} sec</span>` : ''}<span class="pill">${escapeHtml(new Date(video.createdAt).toLocaleString())}</span></div></div></a>`).join('')
        : '<div class="empty-state"><h3>No completed videos yet</h3><p class="muted">Your finished videos will appear here automatically after the first render.</p></div>';
    const recentCards = videos.length > 0
        ? videos.slice(0, 3).map((video) => `<a class="small-card" href="${video.watchUrl}"><div class="small-thumb"${video.thumbnailUrl ? ` style="background-image:url('${video.thumbnailUrl}')"` : ''}></div><div><h3>${escapeHtml(video.title)}</h3><p class="muted">${escapeHtml(video.orientation)} - ${video.fileSizeMB} MB</p><div class="row">${video.durationSeconds ? `<span class="pill">${Math.round(video.durationSeconds)} sec</span>` : ''}<span class="pill">${escapeHtml(new Date(video.createdAt).toLocaleDateString())}</span></div></div></a>`).join('')
        : '<div class="empty-state"><p class="muted">Start with a sample script and the first finished MP4 will show up here.</p></div>';

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

    const setup = setupStatus();
    const setupSummary = [
        `<span class="status-chip ${setup.hasPexelsKey ? 'ok' : 'warn'}">Pexels key: ${setup.hasPexelsKey ? 'Saved' : 'Missing'}</span>`,
        `<span class="status-chip ${setup.edgeTtsReady ? 'ok' : 'warn'}">Voice engine: ${setup.edgeTtsReady ? 'Ready' : 'Not ready'}</span>`,
        `<span class="status-chip ok">Portal workflow: Browser first</span>`,
    ].join('');
    const totalVoicePresets = Object.values(AVAILABLE_VOICES).reduce((count, group) => count + group.male.length + group.female.length, 0);

    return html(
                `Free Automated Video Generator | Open-Source Remotion Text-to-Video Tool`,
        `<section class="hero-surface"><div class="hero-grid"><div class="stack"><span class="eyebrow">Local AI Video Studio</span><div><h1>Create videos from a script, not from folders</h1><p class="lead">Paste your idea, shape the voice and layout, then let the portal handle stock visuals, narration, subtitles, rendering, and delivery in one place.</p><p class="muted">This screen is designed for normal users. No need to manually edit the input or output folders during everyday use.</p></div><div class="toolbar"><a class="button" href="#workspace">Open the workspace</a><a class="button secondary" href="${PROJECT_REPOSITORY_URL}" target="_blank" rel="noreferrer">View on GitHub</a><a class="button ghost" href="/llms.txt">Read AI summary</a></div><div class="metric-grid"><div class="metric-card"><strong>${videos.length}</strong><span class="muted">videos created in this portal</span></div><div class="metric-card"><strong>${totalVoicePresets}+</strong><span class="muted">voice presets available before dynamic loading</span></div><div class="metric-card"><strong>3 steps</strong><span class="muted">setup, create, watch or download</span></div></div></div><div class="highlight-box stack"><span class="eyebrow">Simple Flow</span><h2>What users do here</h2><div class="row">${setupSummary}</div><ol class="checklist"><li>Save the API keys once for this computer.</li><li>Paste or edit the script in the workspace below.</li><li>Choose voice, layout, music, and subtitle options.</li><li>Start the render and wait on the live status page.</li><li>Watch or download the MP4 from the final delivery page.</li></ol></div></div></section><section class="layout-split"><div class="panel tint stack"><div><span class="eyebrow">One-Time Setup</span><h2>Prepare this device once</h2><p class="muted">Most users only need a Pexels API key. Save it here and the browser portal becomes the main way to use the project.</p></div><div class="row">${setupSummary}</div><div id="setup-readiness" class="status-board"></div></div><div class="panel"><form id="setup-form" class="form"><div class="field-grid two-up"><div class="field"><label for="setup-pexels">Pexels API key</label><input id="setup-pexels" type="password" placeholder="Recommended for stock video search"><p class="field-help">Best source for usable portrait and landscape stock footage.</p></div><div class="field"><label for="setup-pixabay">Pixabay API key</label><input id="setup-pixabay" type="password" placeholder="Optional backup provider"><p class="field-help">Optional secondary image and video source.</p></div><div class="field"><label for="setup-gemini">Gemini API key</label><input id="setup-gemini" type="password" placeholder="Optional AI helper"><p class="field-help">Only needed if your workflows use Gemini-powered helpers.</p></div><div class="field"><label for="setup-public-base-url">Public base URL</label><input id="setup-public-base-url" placeholder="Optional when you deploy beyond localhost"><p class="field-help">Leave empty for local-only use.</p></div></div><div class="toolbar"><button type="submit">Save Setup</button><span class="muted">Launcher users can open this page from <strong>Start-Automated-Video-Generator.bat</strong>.</span></div></form><div id="setup-feedback" class="status" hidden></div></div></section><section id="workspace" class="layout-split"><div class="stack"><form id="generate-form" class="form"><div class="panel form-panel"><div class="panel-head"><div><span class="eyebrow">Step 1</span><h2>Write the story and visual instructions</h2><p class="muted">Use plain sentences. Add <strong>[Visual: ...]</strong> when you want to guide the stock footage for a scene.</p></div><button type="button" id="fill-sample" class="secondary">Use Sample Script</button></div><div class="field"><label for="title">Video title</label><input id="title" placeholder="How AI Is Changing Everyday Life" maxlength="${MAX_TITLE_LENGTH}" required><p class="field-help">This title is used on the output page and for the final video filename.</p></div><div class="field"><label for="script">Input script</label><div class="script-shell"><div class="script-toolbar"><span class="muted">Editable input area for the full spoken script</span><div id="script-metrics" class="row"><span class="helper-badge">0 words</span><span class="helper-badge">0 sec est.</span></div></div><textarea id="script" placeholder="[Visual: futuristic robotics lab] AI is changing how people and robots work together.&#10;&#10;[Visual: doctor reviewing an AI dashboard] In healthcare, it helps spot patterns faster and supports earlier decisions." required></textarea><div class="script-guide"><strong>Good script format</strong><p class="muted">Short paragraphs and clear scene cues work best. One idea per line makes subtitles cleaner and helps the generator find stronger visuals.</p></div></div></div></div><div class="panel form-panel"><div><span class="eyebrow">Step 2</span><h2>Choose voice and video layout</h2><p class="muted">You can let the app detect the language automatically or lock the language and voice yourself.</p></div><div class="field-grid two-up"><div class="field"><label for="orientation">Output orientation</label><select id="orientation"><option value="portrait">Portrait (9:16)</option><option value="landscape">Landscape (16:9)</option></select><p class="field-help">Portrait is best for Shorts, Reels, and TikTok. Landscape is better for YouTube and presentations.</p></div><div class="field"><label for="language">Language</label><select id="language"><option value="">Detect language automatically</option>${languageOptions}</select><p class="field-help">Pick a language when you want more predictable voice selection.</p></div><div class="field"><label for="voice-search">Search voice</label><input type="text" id="voice-search" class="voice-search" placeholder="Search voices by name, language, or gender"><p id="voice-hint" class="field-help">The full voice list loads from Edge-TTS when available.</p></div><div class="field"><label for="voice">Voice override</label><select id="voice"><option value="">Select Voice (Optional Override)</option>${voiceOptions}</select><p class="field-help">Leave this empty if you want the app to choose a matching voice automatically.</p></div></div></div><div class="panel form-panel"><div><span class="eyebrow">Step 3</span><h2>Finish the output settings</h2><p class="muted">These options shape the final MP4 and help the generator recover cleanly when a stock video cannot be downloaded.</p></div><div class="field-grid two-up"><div class="field"><label for="backgroundMusic">Background music</label><div class="row" style="flex-wrap:nowrap"><select id="backgroundMusic"><option value="">No background music</option>${musicOptions}</select><button type="button" class="secondary" onclick="openSystemBrowser('music')">Browse</button></div><p class="field-help">Choose from <strong>input/music</strong> or click Browse to pick from your computer.</p></div><div class="field"><label for="defaultVideo">Fallback video asset</label><input id="defaultVideo" value="${escapeHtml(DEFAULT_FALLBACK_VIDEO)}" placeholder="Fallback asset"><p class="field-help">Used if stock video cannot be fetched for a scene. Keep a known-good local clip here.</p></div></div><div class="stack" style="margin-top:10px"><strong>Local Media Assets</strong><p class="muted small">Quickly add images or videos from your computer and use them in the script.</p><div class="toolbar"><button type="button" class="secondary" onclick="openSystemBrowser('media')">Add Local Media File</button></div><div id="asset-gallery" class="asset-gallery"></div></div><label class="toggle-row" for="showText" style="margin-top:16px"><input id="showText" type="checkbox" checked> <div><strong>Show subtitles</strong><p class="field-help">Keep this on for Shorts-style videos where readable captions matter.</p></div></label><div id="form-status" class="status" hidden></div><div class="toolbar"><button type="submit">Generate Video</button><span class="muted">After clicking generate, this page sends you to a live render status screen automatically.</span></div></div></form></div><div class="stack"><div class="panel soft"><span class="eyebrow">Editing Tips</span><h2>Make changes without confusion</h2><ul class="compact-list"><li>Use one clear idea per sentence so voiceover and subtitles stay readable.</li><li>Add scene hints like <strong>[Visual: busy modern factory]</strong> when you want stronger video search results.</li><li>Choose portrait for social shorts and landscape for traditional videos.</li><li>If a voice feels wrong, keep the same script and only change the voice override.</li><li>Fallback video is safer than image fallback when a stock clip fails to download.</li></ul></div><div class="panel"><span class="eyebrow">Latest Outputs</span><h2>Recent finished videos</h2><p class="muted">Users can return here anytime and open the delivery page again.</p><div class="recent-grid">${recentCards}</div></div></div></section><section id="recent-videos" class="panel"><div class="panel-head"><div><span class="eyebrow">Library</span><h2>Completed videos</h2><p class="muted">Each card opens a dedicated watch page with the final player and MP4 download button.</p></div><a class="button secondary" href="#workspace">Create another video</a></div><div class="cards">${cards}</div></section>
        <div id="browser-modal" class="browser-modal">
            <div class="browser-content">
                <div class="browser-sidebar">
                    <div class="sidebar-section">
                        <div class="sidebar-title">Quick Access</div>
                        <div id="quick-access-list" class="stack" style="gap:4px">
                            <!-- JS populated -->
                        </div>
                    </div>
                    <div class="sidebar-section">
                        <div class="sidebar-title">Drives / This PC</div>
                        <div id="drives-list" class="stack" style="gap:4px">
                            <!-- JS populated -->
                        </div>
                    </div>
                </div>
                <div class="browser-main">
                    <div class="browser-header">
                        <h3 id="browser-title">Select File</h3>
                        <div class="row">
                            <button type="button" class="ghost" onclick="loadPath(currentParentPath)" title="Go up one level">⤴ Up</button>
                            <button type="button" class="secondary" onclick="closeSystemBrowser()">✕</button>
                        </div>
                    </div>
                    <div class="browser-path-wrapper">
                        <input id="browser-path" class="browser-path" placeholder="Path\To\Folder..." title="Type path and press Enter">
                        <button type="button" class="secondary" onclick="loadPath(document.getElementById('browser-path').value)" style="padding:6px 12px;margin-left:8px">Go</button>
                    </div>
                    <div id="browser-list" class="browser-list"></div>
                    <div class="browser-footer">
                        <button type="button" class="secondary" onclick="closeSystemBrowser()">Cancel</button>
                    </div>
                </div>
            </div>
        </div>`,
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
        `const sampleScript=${JSON.stringify(DEMO_SCRIPT)};
const form=document.getElementById('generate-form');
const status=document.getElementById('form-status');
const setupForm=document.getElementById('setup-form');
const setupFeedback=document.getElementById('setup-feedback');
const setupReadiness=document.getElementById('setup-readiness');
const fillSample=document.getElementById('fill-sample');
const voiceSelect=document.getElementById('voice');
const voiceSearch=document.getElementById('voice-search');
const voiceHint=document.getElementById('voice-hint');
const langSelect=document.getElementById('language');
const scriptField=document.getElementById('script');
const titleField=document.getElementById('title');
const scriptMetrics=document.getElementById('script-metrics');
let allVoices={};
function setMessage(element,text,isSuccess){
    element.hidden=false;
    element.textContent=text;
    element.classList.toggle('success',Boolean(isSuccess));
}
function estimateWordCount(text){
    return text.trim()?text.trim().split(/\\s+/).filter(Boolean).length:0;
}
function estimateSceneCount(text){
    const visualCount=(text.match(/\\[visual:/ig)||[]).length;
    const paragraphCount=text.split(/\\n+/).map((line)=>line.trim()).filter(Boolean).length;
    return Math.max(visualCount,Math.min(Math.max(paragraphCount,1),12));
}
function estimateDurationSeconds(text){
    const words=estimateWordCount(text);
    return words===0?0:Math.max(5,Math.round(words/2.6));
}
function updateScriptMetrics(){
    const text=scriptField.value||'';
    const words=estimateWordCount(text);
    const scenes=estimateSceneCount(text);
    const seconds=estimateDurationSeconds(text);
    scriptMetrics.innerHTML=[
        '<span class="helper-badge">'+words+' words</span>',
        '<span class="helper-badge">'+scenes+' scenes est.</span>',
        '<span class="helper-badge">'+seconds+' sec est.</span>'
    ].join('');
}
function renderSetupStatus(data){
    const items=[
        ['Pexels API',data.hasPexelsKey,'Needed for the strongest video search'],
        ['Voice engine',data.edgeTtsReady,'Needed for narration'],
        ['Ready to render',data.readyForGeneration,'Main requirements satisfied'],
        ['Public URL',data.hasPublicBaseUrl,'Optional for sharing beyond localhost']
    ];
    setupReadiness.innerHTML=items.map(([label,ok,help])=>'<div class="status-card"><strong>'+label+'</strong><p class="muted">'+(ok?'Ready':'Not set')+'</p><p class="field-help">'+help+'</p></div>').join('');
}
async function loadSetupStatus(){
    try{
        const res=await fetch('/api/setup/status',{cache:'no-store'});
        const json=await res.json();
        if(json.success){
            renderSetupStatus(json.data);
        }
    }catch(e){
        console.error('Failed to load setup status',e);
    }
}
function renderVoices(filter=''){
    if(!Object.keys(allVoices).length){
        voiceHint.textContent='Using the built-in voice list. Dynamic voices were not loaded yet.';
        return;
    }
    voiceSelect.innerHTML='<option value="">Select Voice (Optional Override)</option>';
    const query=filter.toLowerCase().trim();
    let results=0;
    Object.entries(allVoices).forEach(([lang,voices])=>{
        const filtered=voices.filter((v)=>v.name.toLowerCase().includes(query)||lang.toLowerCase().includes(query)||v.gender.toLowerCase().includes(query));
        if(filtered.length>0){
            const group=document.createElement('optgroup');
            group.label=lang;
            filtered.forEach((v)=>{
                const opt=document.createElement('option');
                opt.value=v.name;
                opt.textContent=\`\${v.name} (\${v.gender})\`;
                group.appendChild(opt);
            });
            voiceSelect.appendChild(group);
            results+=filtered.length;
        }
    });
    voiceHint.textContent=results>0?results+' voices match your search.':'No voices match that search yet.';
}
async function loadAllVoices(){
    try{
        const res=await fetch('/api/voices');
        const json=await res.json();
        if(json.success){
            allVoices=json.data;
            Object.keys(allVoices).sort().forEach((lang)=>{
                const opt=document.createElement('option');
                opt.value=lang;
                opt.textContent=lang;
                if(![...langSelect.options].some((o)=>o.value===lang)){
                    langSelect.appendChild(opt);
                }
            });
            renderVoices(voiceSearch.value||'');
            const total=Object.values(allVoices).reduce((count,list)=>count+list.length,0);
            voiceHint.textContent=total+' dynamic voices loaded from Edge-TTS.';
        }
    }catch(e){
        console.error('Failed to load voices',e);
        voiceHint.textContent='Dynamic voice loading is unavailable right now. You can still use the built-in voice list.';
    }
}
voiceSearch.addEventListener('input',(e)=>renderVoices(e.target.value));
scriptField.addEventListener('input',updateScriptMetrics);
fillSample.addEventListener('click',()=>{
    if(!titleField.value){
        titleField.value='How AI Is Changing Everyday Life';
    }
    scriptField.value=sampleScript;
    langSelect.value='english';
    renderVoices(voiceSearch.value||'');
    updateScriptMetrics();
    window.scrollTo({top:form.offsetTop-20,behavior:'smooth'});
});
setupForm.addEventListener('submit',async(e)=>{
    e.preventDefault();
    setMessage(setupFeedback,'Saving setup...',false);
    const payload={
        PEXELS_API_KEY:document.getElementById('setup-pexels').value,
        PIXABAY_API_KEY:document.getElementById('setup-pixabay').value,
        GEMINI_API_KEY:document.getElementById('setup-gemini').value,
        PUBLIC_BASE_URL:document.getElementById('setup-public-base-url').value
    };
    try{
        const res=await fetch('/api/setup/env',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const json=await res.json();
        if(!res.ok||!json.success){
            throw new Error(json.error||'Unable to save setup.');
        }
        setMessage(setupFeedback,'Setup saved. This browser workspace is ready to use.',true);
        renderSetupStatus(json.data);
    }catch(err){
        setMessage(setupFeedback,err instanceof Error?err.message:'Unable to save setup.',false);
    }
});
form.addEventListener('submit',async(e)=>{
    e.preventDefault();
    setMessage(status,'Starting render...',false);
    const payload={
        title:document.getElementById('title').value,
        script:document.getElementById('script').value,
        orientation:document.getElementById('orientation').value,
        language:document.getElementById('language').value,
        voice:document.getElementById('voice').value||undefined,
        backgroundMusic:document.getElementById('backgroundMusic').value,
        defaultVideo:document.getElementById('defaultVideo').value,
        showText:document.getElementById('showText').checked
    };
    try{
        const res=await fetch('/generate-video',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const json=await res.json();
        if(!res.ok||!json.success){
            throw new Error(json.error||'Unable to start render.');
        }
        window.location.href=json.data.statusPageUrl;
    }catch(err){
        setMessage(status,err instanceof Error?err.message:'Unable to start render.',false);
    }
});
updateScriptMetrics();
loadSetupStatus();
loadAllVoices();

const browserModal = document.getElementById('browser-modal');
const browserPath = document.getElementById('browser-path');
const browserList = document.getElementById('browser-list');
const assetGallery = document.getElementById('asset-gallery');
const musicSelect = document.getElementById('backgroundMusic');
const quickAccessList = document.getElementById('quick-access-list');
const drivesList = document.getElementById('drives-list');
let currentBrowserType = 'media';
let currentParentPath = '';

window.openSystemBrowser = (type) => {
    currentBrowserType = type;
    browserModal.classList.add('open');
    loadSidebar();
    loadPath();
};
window.closeSystemBrowser = () => browserModal.classList.remove('open');

browserPath.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadPath(e.target.value);
});

async function loadSidebar() {
    try {
        // Load Home Folders
        const homeRes = await fetch('/api/fs/home');
        const homeJson = await homeRes.json();
        if (homeJson.success) {
            const h = homeJson.data;
            const items = [
                { name: 'Home', path: h.home, icon: '🏠' },
                { name: 'Desktop', path: h.desktop, icon: '🖥️' },
                { name: 'Downloads', path: h.downloads, icon: '⬇️' },
                { name: 'Videos', path: h.videos, icon: '🎬' },
                { name: 'Pictures', path: h.pictures, icon: '🖼️' }
            ];
            quickAccessList.innerHTML = items.map(i => \`<div class="sidebar-item" onclick="loadPath('\${i.path.replace(/\\\\/g, '\\\\\\\\')}')"><span>\${i.icon}</span> \${i.name}</div>\`).join('');
        }

        // Load Drives
        const drivesRes = await fetch('/api/fs/drives');
        const drivesJson = await drivesRes.json();
        if (drivesJson.success) {
            drivesList.innerHTML = drivesJson.data.map(d => \`<div class="sidebar-item" onclick="loadPath('\${d}\\\\\\\\')"><span>💽</span> \${d} Drive</div>\`).join('');
        }
    } catch (e) {
        console.error('Sidebar load failed', e);
    }
}

async function loadPath(path = '') {
    browserList.innerHTML = '<div class="muted" style="padding:20px">Loading...</div>';
    try {
        const res = await fetch('/api/fs/ls?path=' + encodeURIComponent(path));
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        
        const data = json.data;
        browserPath.value = data.currentPath;
        currentParentPath = data.parentPath;
        browserList.innerHTML = '';
        
        if (data.items.length === 0) {
            browserList.innerHTML = '<div class="empty-state" style="margin:20px"><p class="muted">This folder is empty.</p></div>';
            return;
        }

        data.items.forEach(item => {
            const div = document.createElement('div');
            const isSelectable = currentBrowserType === 'music' ? item.ext === '.mp3' : ['.mp4', '.mov', '.jpg', '.png', '.jpeg'].includes(item.ext);
            
            div.className = 'browser-item' + (!item.isDir && !isSelectable ? ' disabled' : '');
            div.innerHTML = \`
                <span class="browser-icon">\${item.isDir ? '📁' : (item.ext === '.mp4' || item.ext === '.mov' ? '🎬' : '🖼️')}</span> 
                <span class="browser-name">\${item.name}</span>
                <span class="browser-size">\${item.isDir ? '' : 'File'}</span>
            \`;
            
            if (item.isDir) {
                div.onclick = () => loadPath(item.path);
            } else if (isSelectable) {
                div.onclick = () => pickFile(item.path);
            }
            browserList.appendChild(div);
        });
    } catch (e) {
        browserList.innerHTML = '<div class="status" style="margin:20px"><strong>Error:</strong> ' + e.message + '</div>';
    }
}

async function pickFile(path) {
    try {
        const res = await fetch('/api/fs/pick', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({sourcePath: path, type: currentBrowserType})
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        
        if (currentBrowserType === 'music') {
            const opt = document.createElement('option');
            opt.value = json.data.filename;
            opt.textContent = json.data.filename;
            musicSelect.appendChild(opt);
            musicSelect.value = json.data.filename;
        } else {
            addAssetToGallery(json.data);
        }
        closeSystemBrowser();
    } catch (e) {
        alert('Pick failed: ' + e.message);
    }
}

function addAssetToGallery(data) {
    const div = document.createElement('div');
    div.className = 'asset-item';
    div.innerHTML = \`
        <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${data.filename}</div>
        <div class="tag-copy" title="Click to insert into script">\${data.tag}</div>
    \`;
    div.querySelector('.tag-copy').onclick = () => {
        const script = document.getElementById('script');
        const pos = script.selectionStart;
        const text = script.value;
        script.value = text.slice(0, pos) + data.tag + text.slice(pos);
        updateScriptMetrics();
        script.focus();
    };
    assetGallery.appendChild(div);
}
`,
    );
}

function jobPage(req: Request, jobId: string): string {
    return html(
        `Render Job ${jobId} | ${PROJECT_NAME}`,
        `<section class="hero-surface"><div class="hero-grid"><div class="stack"><span class="eyebrow">Live Render Status</span><div><h1 id="title">Render in progress</h1><p id="message" class="lead small">This page refreshes automatically while the generator downloads assets, creates voiceover, and renders the final MP4.</p></div><div class="bar"><div id="progress"></div></div><div class="metric-grid"><div class="metric-card"><strong id="percent">0%</strong><span class="muted">overall progress</span></div><div class="metric-card"><strong id="status">pending</strong><span class="muted">current status</span></div><div class="metric-card"><strong>3 sec</strong><span class="muted">auto refresh interval</span></div></div></div><div class="highlight-box stack"><span class="eyebrow">Job Details</span><div class="row"><span class="status-chip ok">Watching live</span><span class="pill">${escapeHtml(jobId)}</span></div><p class="muted">Keep this tab open. When the job finishes, the watch page and MP4 download button will appear here automatically.</p><div id="actions" class="toolbar"></div><div id="error" class="status" hidden></div></div></div></section><section class="layout-split"><div class="panel"><span class="eyebrow">Pipeline</span><h2>What the app is doing now</h2><div class="timeline"><div class="timeline-step" data-step="queued"><span>1</span><div><strong>Queued</strong><p class="muted">The job has been accepted and is waiting to begin.</p></div></div><div class="timeline-step" data-step="assets"><span>2</span><div><strong>Assets and voiceover</strong><p class="muted">The generator prepares scenes, downloads stock footage, and creates narration.</p></div></div><div class="timeline-step" data-step="render"><span>3</span><div><strong>Final render</strong><p class="muted">Remotion assembles the scenes into a single MP4 file.</p></div></div><div class="timeline-step" data-step="ready"><span>4</span><div><strong>Ready to watch</strong><p class="muted">Your delivery page and download link are prepared.</p></div></div></div></div><div class="panel soft"><span class="eyebrow">While You Wait</span><h2>Helpful notes</h2><ul class="compact-list"><li>The longest step is usually stock download and video rendering.</li><li>You can leave this tab open instead of watching the terminal.</li><li>If a stock clip fails, the generator can use fallback video before falling back to an image.</li><li>When finished, you will get a watch page and a direct MP4 download button.</li></ul></div></section>`,
        {
            canonical: absoluteUrl(req, `/jobs/${encodeURIComponent(jobId)}`),
            description: 'Track a video rendering job in Automated Video Generator.',
            ogType: 'website',
            robots: 'noindex, nofollow',
        },
        `const id=${JSON.stringify(jobId)};
const title=document.getElementById('title');
const message=document.getElementById('message');
const status=document.getElementById('status');
const percent=document.getElementById('percent');
const progress=document.getElementById('progress');
const actions=document.getElementById('actions');
const error=document.getElementById('error');
const steps=[...document.querySelectorAll('[data-step]')];
function setStepState(current){
    const order=['queued','assets','render','ready'];
    const currentIndex=order.indexOf(current);
    steps.forEach((step)=>{
        const index=order.indexOf(step.dataset.step);
        step.classList.toggle('active',index===currentIndex);
        step.classList.toggle('done',currentIndex>index);
    });
}
function mapStep(data){
    if(data.status==='completed'){
        return 'ready';
    }
    if(data.status==='pending'){
        return 'queued';
    }
    if(data.progress>=75){
        return 'render';
    }
    return 'assets';
}
async function refresh(){
    try{
        const res=await fetch('/api/jobs/'+encodeURIComponent(id),{cache:'no-store'});
        const json=await res.json();
        if(!res.ok||!json.success){
            throw new Error(json.error||'Unable to load job.');
        }
        const data=json.data;
        title.textContent=data.title||'Render in progress';
        message.textContent=data.message||'Working on your video.';
        status.textContent=String(data.status);
        percent.textContent=String(data.progress)+'%';
        progress.style.width=Math.max(0,Math.min(100,Number(data.progress)||0))+'%';
        setStepState(mapStep(data));
        if(data.status==='completed'){
            actions.innerHTML='<a class="button" href="'+data.watchUrl+'">Open Watch Page</a><a class="button secondary" href="'+data.downloadUrl+'">Download MP4</a><a class="button ghost" href="/">Back to Portal</a>';
            window.clearInterval(timer);
        }
        if(data.status==='failed'){
            error.hidden=false;
            error.textContent=data.error||'Render failed.';
            window.clearInterval(timer);
        }
    }catch(err){
        error.hidden=false;
        error.textContent=err instanceof Error?err.message:'Unable to load job.';
    }
}
const timer=window.setInterval(refresh,3000);
refresh();`,
    );
}

function watchPage(req: Request, video: VideoRecord): string {
    const description = videoMetaDescription(video);

    return html(
        `${video.title} | ${PROJECT_NAME}`,
        `<section class="hero-surface"><div class="hero-grid"><div class="stack"><span class="eyebrow">Video Ready</span><div><h1>${escapeHtml(video.title)}</h1><p class="lead small">Preview the result in the browser, then download the MP4 or return to the workspace to make another version.</p></div><div class="row"><span class="pill">${escapeHtml(video.orientation)}</span>${video.durationSeconds ? `<span class="pill">${Math.round(video.durationSeconds)} sec</span>` : ''}<span class="pill">${video.fileSizeMB} MB</span><span class="pill">${escapeHtml(new Date(video.createdAt).toLocaleString())}</span></div></div><div class="highlight-box stack"><span class="eyebrow">Output File</span><div class="info-list"><div class="info-row"><strong>Filename</strong><span class="muted">${escapeHtml(video.videoFilename)}</span></div><div class="info-row"><strong>Delivery page</strong><span class="muted">Ready for watching and download</span></div><div class="info-row"><strong>Generator</strong><span class="muted">${PROJECT_NAME}</span></div></div><div class="toolbar"><a class="button" href="${video.downloadUrl}">Download MP4</a><a class="button secondary" href="/">Back to Portal</a></div></div></div></section><section class="watch-grid"><div class="video-stage"><video class="video" controls playsinline preload="metadata"${video.thumbnailUrl ? ` poster="${video.thumbnailUrl}"` : ''}><source src="${video.videoUrl}" type="video/mp4"></video></div><div class="stack"><div class="panel"><span class="eyebrow">Delivery Summary</span><h2>What this output contains</h2><div class="info-list"><div class="info-row"><strong>Orientation</strong><span class="muted">${escapeHtml(video.orientation)}</span></div>${video.durationSeconds ? `<div class="info-row"><strong>Duration</strong><span class="muted">${Math.round(video.durationSeconds)} seconds</span></div>` : ''}<div class="info-row"><strong>File size</strong><span class="muted">${video.fileSizeMB} MB</span></div><div class="info-row"><strong>Created</strong><span class="muted">${escapeHtml(new Date(video.createdAt).toLocaleString())}</span></div></div></div>${video.description ? `<div class="panel soft"><span class="eyebrow">Video Details</span><h2>Notes and description</h2><p>${escapeHtml(video.description).replace(/\n/g, '<br>')}</p></div>` : ''}<div class="panel"><span class="eyebrow">Next Step</span><h2>Create another version</h2><p class="muted footer-note">Return to the portal if you want to change the script, voice, orientation, music, or subtitle settings and render a new MP4.</p><div class="toolbar"><a class="button secondary" href="/">Open Workspace</a><a class="button ghost" href="${PROJECT_REPOSITORY_URL}" target="_blank" rel="noreferrer">Project Repository</a></div></div></div></section>`,
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


app.get('/api/voices', (req: Request, res: Response) => {
    try {
        const voices = getDynamicVoices();
        res.json({ success: true, data: voices });
    } catch (error: any) {
        res.status(500).json({ success: false, error: 'Failed to fetch voices' });
    }
});

/**
 * FILE SYSTEM API: List files and directories
 */
app.get('/api/fs/ls', (req: Request, res: Response) => {
    const queryPath = String(req.query.path || process.cwd());
    try {
        if (!fs.existsSync(queryPath)) {
            res.status(404).json({ success: false, error: 'Path not found' });
            return;
        }

        const stats = fs.statSync(queryPath);
        if (!stats.isDirectory()) {
            res.status(400).json({ success: false, error: 'Not a directory' });
            return;
        }

        const items = fs.readdirSync(queryPath, { withFileTypes: true })
            .map(item => ({
                name: item.name,
                isDir: item.isDirectory(),
                path: path.join(queryPath, item.name),
                ext: path.extname(item.name).toLowerCase()
            }))
            .sort((a, b) => {
                if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

        res.json({
            success: true,
            data: {
                currentPath: queryPath,
                parentPath: path.dirname(queryPath),
                items
            }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * FILE SYSTEM API: Pick a file and copy it to the project's input assets
 */
app.post('/api/fs/pick', (req: Request, res: Response) => {
    const { sourcePath, type } = req.body;
    if (!sourcePath || !fs.existsSync(sourcePath)) {
        res.status(400).json({ success: false, error: 'Invalid source path' });
        return;
    }

    try {
        const filename = path.basename(sourcePath);
        const targetDir = type === 'music' 
            ? resolveProjectPath('input', 'music') 
            : resolveProjectPath('input', 'input-assests');
        
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const targetPath = path.join(targetDir, filename);
        fs.copyFileSync(sourcePath, targetPath);

        res.json({ 
            success: true, 
            data: { 
                filename, 
                targetPath,
                tag: type === 'music' ? filename : `[Visual: ${filename}]`
            } 
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * FILE SYSTEM API: List available logical drives (Windows focused)
 */
app.get('/api/fs/drives', (req: Request, res: Response) => {
    if (process.platform !== 'win32') {
        res.json({ success: true, data: ['/'] });
        return;
    }

    const { exec } = require('child_process');
    exec('powershell "get-psdrive -psprovider filesystem | select -expand name"', (err: any, stdout: string) => {
        if (err) {
            // Fallback: try A-Z if powershell fails
            const drives = [];
            for (let i = 65; i <= 90; i++) {
                const drive = String.fromCharCode(i) + ':';
                if (fs.existsSync(drive + '\\')) drives.push(drive);
            }
            res.json({ success: true, data: drives });
            return;
        }

        const drives = stdout.split(/\r?\n/).map(s => s.trim()).filter(s => s.length === 1).map(s => s + ':');
        res.json({ success: true, data: drives });
    });
});

/**
 * FILE SYSTEM API: Get common system shortcuts
 */
app.get('/api/fs/home', (req: Request, res: Response) => {
    const home = process.env.USERPROFILE || process.env.HOME || process.cwd();
    res.json({
        success: true,
        data: {
            home,
            desktop: path.join(home, 'Desktop'),
            documents: path.join(home, 'Documents'),
            downloads: path.join(home, 'Downloads'),
            pictures: path.join(home, 'Pictures'),
            videos: path.join(home, 'Videos')
        }
    });
});

app.get('/api/setup/status', (req: Request, res: Response) => {
    res.json({ success: true, data: setupStatus() });
});

app.post('/api/setup/env', (req: Request, res: Response) => {
    try {
        const updates: Partial<Record<EditableEnvKey, string>> = {};

        for (const key of EDITABLE_ENV_KEYS) {
            if (key in (req.body || {})) {
                updates[key] = normalizeEnvValue(req.body?.[key]);
            }
        }

        updateEnvValues(updates);
        res.json({ success: true, data: setupStatus() });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.message || 'Unable to save setup.' });
    }
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
    const url = `http://localhost:${PORT}`;
    console.log(`Video Generator portal running on ${url}`);
    
    // Automatically open the browser
    const start = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${start} ${url}`);
});
