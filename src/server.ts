import express, { NextFunction, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { generateVideo } from './video-generator';
import { renderVideo } from './render';
import { ensureProjectRootCwd, jobStore, resolveProjectPath } from './runtime';
import type { JobStatus } from './runtime';

ensureProjectRootCwd();
config({ path: resolveProjectPath('.env') });

const app = express();
const PORT = Number(process.env.PORT || 3001);
const OUTPUT_ROOT = resolveProjectPath('output');
const DEFAULT_TITLE = 'Generated Video';
const DEFAULT_VOICE = 'en-US-JennyNeural';
const DEFAULT_FALLBACK_VIDEO = 'default.mp4';
const MAX_TITLE_LENGTH = 80;

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

function html(title: string, body: string, script = ''): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>
body{margin:0;font:16px/1.5 "Segoe UI",sans-serif;background:#f6efe5;color:#1b2333}main{max-width:960px;margin:0 auto;padding:24px}section{background:#fff;border:1px solid #e6dccd;border-radius:18px;padding:24px;margin-bottom:20px;box-shadow:0 12px 30px rgba(0,0,0,.05)}h1,h2,h3{margin:0 0 12px}p{margin:0 0 10px}.muted{color:#5d6572}.grid{display:grid;gap:16px}.cards{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.card{display:block;text-decoration:none;color:inherit;border:1px solid #eadfce;border-radius:16px;overflow:hidden;background:#fff}.thumb{aspect-ratio:9/16;background:#e9edf3 center/cover no-repeat}.card-body{padding:14px}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.pill{padding:6px 10px;border-radius:999px;background:#eef3f8;font-size:12px}.button,button{border:0;border-radius:999px;padding:12px 18px;background:#d8642a;color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}a.secondary{background:#edf1f5;color:#1b2333}input,textarea,select{width:100%;padding:12px 14px;border:1px solid #d8dce2;border-radius:12px;font:inherit}textarea{min-height:180px;resize:vertical}.form{display:grid;gap:14px}.video{width:100%;border-radius:16px;background:#000}.bar{height:14px;background:#edf1f5;border-radius:999px;overflow:hidden}.bar>div{height:100%;width:0;background:#d8642a;transition:width .2s}.status{padding:14px;border-radius:14px;background:#fff5ee;border:1px solid #f1d2bf}.meta{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}@media(max-width:640px){main{padding:14px}section{padding:18px}}</style></head><body><main>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;
}

function homePage(videos: VideoRecord[]): string {
    const cards = videos.length > 0
        ? videos.map((video) => `<a class="card" href="${video.watchUrl}"><div class="thumb"${video.thumbnailUrl ? ` style="background-image:url('${video.thumbnailUrl}')"` : ''}></div><div class="card-body"><h3>${escapeHtml(video.title)}</h3><p class="muted">${escapeHtml(video.orientation)} - ${video.fileSizeMB} MB</p><div class="row">${video.durationSeconds ? `<span class="pill">${Math.round(video.durationSeconds)} sec</span>` : ''}<span class="pill">${escapeHtml(new Date(video.createdAt).toLocaleString())}</span></div></div></a>`).join('')
        : '<p class="muted">No completed videos yet. Start one below and it will appear here automatically.</p>';

    return html(
        'Video Portal',
        `<section><h1>Automated Video Generator</h1><p class="muted">Start a render, share the status page, then send the final watch or download link to the end user.</p></section><section><h2>Create a video</h2><form id="generate-form" class="form"><input id="title" placeholder="Video title" maxlength="${MAX_TITLE_LENGTH}" required><textarea id="script" placeholder="[Visual: futuristic robotics lab] AI is changing how people and robots work together." required></textarea><div class="grid cards"><select id="orientation"><option value="portrait">Portrait (9:16)</option><option value="landscape">Landscape (16:9)</option></select><select id="voice"><option value="en-US-JennyNeural">Jenny Neural</option><option value="en-US-AriaNeural">Aria Neural</option><option value="en-US-GuyNeural">Guy Neural</option><option value="en-US-ChristopherNeural">Christopher Neural</option></select></div><div class="grid cards"><input id="defaultVideo" value="${DEFAULT_FALLBACK_VIDEO}" placeholder="Fallback asset"><label class="row" style="padding-top:12px"><input id="showText" type="checkbox" checked style="width:auto"> Show subtitles</label></div><div class="row"><button type="submit">Generate Video</button><span class="muted">You will be redirected to a live job page.</span></div></form><div id="form-status" class="status" hidden></div></section><section><h2>Completed videos</h2><div class="grid cards">${cards}</div></section>`,
        `const form=document.getElementById('generate-form');const status=document.getElementById('form-status');form.addEventListener('submit',async(e)=>{e.preventDefault();status.hidden=false;status.textContent='Starting render...';const payload={title:document.getElementById('title').value,script:document.getElementById('script').value,orientation:document.getElementById('orientation').value,voice:document.getElementById('voice').value,defaultVideo:document.getElementById('defaultVideo').value,showText:document.getElementById('showText').checked};try{const res=await fetch('/generate-video',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const json=await res.json();if(!res.ok||!json.success)throw new Error(json.error||'Unable to start render.');window.location.href=json.data.statusPageUrl;}catch(err){status.textContent=err instanceof Error?err.message:'Unable to start render.';}});`,
    );
}

function jobPage(jobId: string): string {
    return html(
        `Job ${jobId}`,
        `<section><h1 id="title">Render in progress</h1><p id="message" class="muted">This page refreshes automatically until the video is ready.</p><div class="bar"><div id="progress"></div></div><div class="meta"><div><strong>Status</strong><p id="status" class="muted">pending</p></div><div><strong>Progress</strong><p id="percent" class="muted">0%</p></div><div><strong>Job ID</strong><p class="muted">${escapeHtml(jobId)}</p></div></div><div id="actions" class="row" style="margin-top:14px"></div><div id="error" class="status" hidden></div></section>`,
        `const id=${JSON.stringify(jobId)};const title=document.getElementById('title');const message=document.getElementById('message');const status=document.getElementById('status');const percent=document.getElementById('percent');const progress=document.getElementById('progress');const actions=document.getElementById('actions');const error=document.getElementById('error');async function refresh(){try{const res=await fetch('/api/jobs/'+encodeURIComponent(id),{cache:'no-store'});const json=await res.json();if(!res.ok||!json.success)throw new Error(json.error||'Unable to load job.');const data=json.data;title.textContent=data.title||'Render in progress';message.textContent=data.message||'Working on your video.';status.textContent=String(data.status);percent.textContent=String(data.progress)+'%';progress.style.width=Math.max(0,Math.min(100,Number(data.progress)||0))+'%';if(data.status==='completed'){actions.innerHTML='<a class="button" href="'+data.watchUrl+'">Open Watch Page</a><a class="button secondary" href="'+data.downloadUrl+'">Download MP4</a><a class="button secondary" href="/">Back to Portal</a>';window.clearInterval(timer);}if(data.status==='failed'){error.hidden=false;error.textContent=data.error||'Render failed.';window.clearInterval(timer);}}catch(err){error.hidden=false;error.textContent=err instanceof Error?err.message:'Unable to load job.';}}const timer=window.setInterval(refresh,3000);refresh();`,
    );
}

function watchPage(video: VideoRecord): string {
    return html(video.title, `<section><h1>${escapeHtml(video.title)}</h1><p class="muted">This is the end-user delivery page. Stream the video here or download the MP4.</p><div class="row"><span class="pill">${escapeHtml(video.orientation)}</span>${video.durationSeconds ? `<span class="pill">${Math.round(video.durationSeconds)} sec</span>` : ''}<span class="pill">${video.fileSizeMB} MB</span></div></section><section><video class="video" controls playsinline preload="metadata"${video.thumbnailUrl ? ` poster="${video.thumbnailUrl}"` : ''}><source src="${video.videoUrl}" type="video/mp4"></video><div class="row" style="margin-top:14px"><a class="button" href="${video.downloadUrl}">Download MP4</a><a class="button secondary" href="/">Back to Portal</a></div></section>${video.description ? `<section><h2>Video details</h2><p>${escapeHtml(video.description).replace(/\n/g, '<br>')}</p></section>` : ''}`);
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
    const voice = normalizeString(req.body?.voice, DEFAULT_VOICE);
    const showText = normalizeBoolean(req.body?.showText, true);
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
                voice,
                showText,
                defaultVideo,
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
        res.status(404).send(html('Video Not Found', '<section><h1>Video not found</h1><p class="muted">The requested video is not available.</p><a class="button secondary" href="/">Back to Portal</a></section>'));
        return;
    }

    res.type('html').send(watchPage(video));
});

app.get('/jobs/:jobId', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    res.type('html').send(jobPage(jobId));
});

app.get('/', (req: Request, res: Response) => {
    res.type('html').send(homePage(listVideos(req)));
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`Video Generator portal running on http://localhost:${PORT}`);
});
