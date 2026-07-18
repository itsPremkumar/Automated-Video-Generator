/**
 * register-operations-tools.ts
 *
 * Exposes the SINGLE-TASK operations layer to any MCP client as discrete tools.
 * Each tool does EXACTLY ONE thing by reusing the matching part of the
 * project. Plus `do_task` (plain-language router, supports 2-step chains)
 * and `batch_operation` (one op across a folder).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mergeVideos, trimVideo, cropVideo, resizeVideo, rotateVideo, extractAudio } from '../../agentic/operations/edit.js';
import { generateVoiceoverOnly } from '../../agentic/operations/voiceover.js';
import { downloadImageByKeyword, downloadVideoByKeyword } from '../../agentic/operations/download-media.js';
import { splitVideoEqual, splitVideoAt } from '../../agentic/operations/split.js';
import { addCaptionsFromText, addCaptionsFromSrt } from '../../agentic/operations/captions.js';
import { addMusic, addAudioTrack } from '../../agentic/operations/audio-track.js';
import { localizeVideo } from '../../agentic/operations/localize.js';
import { gradeVideo } from '../../agentic/operations/grade.js';
import { slowMotion, speedRamp } from '../../agentic/operations/motion.js';
import { addWatermark, addLowerThird, addProgressBar } from '../../agentic/operations/overlay.js';
import { deriveFromVideo } from '../../agentic/operations/derivative.js';
import { removeSilence } from '../../agentic/operations/silence.js';
import { detectScenes } from '../../agentic/operations/scene.js';
import { autoReframe } from '../../agentic/operations/reframe.js';
import { reduceNoise } from '../../agentic/operations/noise.js';
import { applyBrandKit } from '../../agentic/operations/brand.js';
import { doTask } from '../../agentic/operations/dispatch.js';
import * as fs from 'fs';
import * as path from 'path';
import { textResponse, errorResponse } from './responses.js';

const okr = (ok: boolean, out: string | undefined, detail: string) =>
    ok ? textResponse(`-> ${out ?? ''}\n${detail}`) : errorResponse(detail);

export function registerOperationsTools(server: McpServer) {
    server.registerTool(
        'do_task',
        {
            title: 'Do Task (natural-language router)',
            description: 'Classify a plain request and run ONLY the matching single task (merge, trim, crop, resize, rotate, extract-audio, split, add-captions, add-music, localize, grade, slow-motion, speed-ramp, watermark, lower-third, progress-bar, derive, voiceover, download-image/video, full-video). Supports chains: "crop to 9:16 then add music". No paid key needed.',
            inputSchema: z.object({
                prompt: z.string().describe('What the user wants, in plain language'),
                files: z.array(z.string()).optional().describe('Input file paths (merge: 2+, else 1)'),
                out: z.string().optional().describe('Optional output path'),
                voice: z.string().optional(),
                orientation: z.enum(['portrait', 'landscape']).optional(),
            }) as any,
        },
        async (args: any) => {
            const res = await doTask(args.prompt, { files: args.files, out: args.out, voice: args.voice, orientation: args.orientation });
            const primary = res.output ?? (res.outputs && res.outputs[0]);
            return okr(res.ok, primary, `${res.summary}\n${res.detail}`);
        },
    );

    server.registerTool('merge_videos', { title: 'Merge Videos', description: 'Concatenate two or more video files into one.', inputSchema: z.object({ files: z.array(z.string()).min(2), out: z.string().optional(), orientation: z.enum(['portrait', 'landscape']).default('portrait') }) as any },
        async (a: any) => { const r = await mergeVideos(a.files, a.out, a.orientation); return okr(r.ok, r.output, r.detail); });
    server.registerTool('trim_video', { title: 'Trim Video', description: 'Cut a clip to [start,end] seconds.', inputSchema: z.object({ file: z.string(), out: z.string().optional(), start: z.number().default(0), end: z.number().optional() }) as any },
        async (a: any) => { const r = await trimVideo(a.file, a.out, a.start, a.end); return okr(r.ok, r.output, r.detail); });
    server.registerTool('crop_video', { title: 'Crop Video', description: 'Crop to a target aspect (9:16 / 16:9 / 1:1).', inputSchema: z.object({ file: z.string(), out: z.string().optional(), preset: z.enum(['9:16', '16:9', '1:1']).optional() }) as any },
        async (a: any) => { const r = await cropVideo(a.file, a.out, { preset: a.preset }); return okr(r.ok, r.output, r.detail); });
    server.registerTool('resize_video', { title: 'Resize Video', description: 'Scale a video to WxH.', inputSchema: z.object({ file: z.string(), out: z.string().optional(), w: z.number().default(720), h: z.number().default(-2) }) as any },
        async (a: any) => { const r = await resizeVideo(a.file, a.out, a.w, a.h); return okr(r.ok, r.output, r.detail); });
    server.registerTool('rotate_video', { title: 'Rotate Video', description: 'Rotate 90/180/270 degrees.', inputSchema: z.object({ file: z.string(), out: z.string().optional(), deg: z.enum(['90', '180', '270']).default('90') }) as any },
        async (a: any) => { const r = await rotateVideo(a.file, a.out, a.deg); return okr(r.ok, r.output, r.detail); });
    server.registerTool('extract_audio', { title: 'Extract Audio', description: 'Pull the audio track out of a video as mp3.', inputSchema: z.object({ file: z.string(), out: z.string().optional() }) as any },
        async (a: any) => { const r = await extractAudio(a.file, a.out); return okr(r.ok, r.output, r.detail); });

    server.registerTool('split_video', { title: 'Split Video', description: 'Split into N equal parts, or at explicit time marks (seconds).', inputSchema: z.object({ file: z.string(), parts: z.number().optional(), marks: z.array(z.number()).optional(), out: z.string().optional() }) as any },
        async (a: any) => { const r = a.parts ? await splitVideoEqual(a.file, a.parts, a.out) : await splitVideoAt(a.file, a.marks ?? [], a.out); return okr(r.ok, r.outputs && r.outputs[0], r.detail); });
    server.registerTool('add_captions', { title: 'Add Captions', description: 'Burn captions onto a video (from text or an existing .srt).', inputSchema: z.object({ file: z.string(), text: z.string().optional(), srt: z.string().optional(), out: z.string().optional() }) as any },
        async (a: any) => { const r = a.srt ? await addCaptionsFromSrt(a.file, a.srt, a.out) : await addCaptionsFromText(a.file, a.text ?? '', a.out); return okr(r.ok, r.output, r.detail); });
    server.registerTool('add_music', { title: 'Add Music', description: 'Add a free background music track under a video (auto-ducked).', inputSchema: z.object({ file: z.string(), query: z.string().optional(), out: z.string().optional() }) as any },
        async (a: any) => { const r = await addMusic(a.file, a.query ?? 'ambient lofi', a.out); return okr(r.ok, r.output, r.detail); });
    server.registerTool('add_audio_track', { title: 'Add Audio Track', description: 'Mux a user-supplied audio (voiceover/narration) onto a video.', inputSchema: z.object({ file: z.string(), audio: z.string(), volume: z.number().default(1.0), out: z.string().optional() }) as any },
        async (a: any) => { const r = await addAudioTrack(a.file, a.audio, a.out, a.volume); return okr(r.ok, r.output, r.detail); });
    server.registerTool('localize_video', { title: 'Localize Video', description: 'Produce translated subtitle sidecars (es/fr/hi/ta/...). Reuses free-model translation, offline-safe.', inputSchema: z.object({ file: z.string().optional(), text: z.string().optional(), languages: z.array(z.string()), outDir: z.string().optional() }) as any },
        async (a: any) => { const r = await localizeVideo(a.file ?? null, a.text ?? null, a.languages, a.outDir); return okr(r.ok, r.outputs && r.outputs[0], r.detail); });
    server.registerTool('grade_video', { title: 'Grade Video', description: "Apply a cinematic color grade (cinematic/vivid/neon/teal-orange/bleach-bypass/warm/cool/neutral).", inputSchema: z.object({ file: z.string(), preset: z.enum(['cinematic', 'vivid', 'neon', 'teal-orange', 'bleach-bypass', 'neutral', 'warm', 'cool']).default('cinematic'), out: z.string().optional() }) as any },
        async (a: any) => { const r = await gradeVideo(a.file, a.preset, a.out); return okr(r.ok, r.output, r.detail); });
    server.registerTool('slow_motion', { title: 'Slow Motion', description: 'Slow the whole clip by a factor (2 = half speed).', inputSchema: z.object({ file: z.string(), factor: z.number().default(2), out: z.string().optional() }) as any },
        async (a: any) => { const r = await slowMotion(a.file, a.factor, a.out); return okr(r.ok, r.output, r.detail); });
    server.registerTool('speed_ramp', { title: 'Speed Ramp', description: 'Slow a middle window of the clip, normal elsewhere.', inputSchema: z.object({ file: z.string(), rampStart: z.number().default(1), rampEnd: z.number().default(3), slowFactor: z.number().default(3), out: z.string().optional() }) as any },
        async (a: any) => { const r = await speedRamp(a.file, a.rampStart, a.rampEnd, a.slowFactor, a.out); return okr(r.ok, r.output, r.detail); });
    server.registerTool('add_watermark', { title: 'Add Watermark', description: 'Burn a corner watermark/logo text onto a video.', inputSchema: z.object({ file: z.string(), label: z.string().default('MyBrand'), out: z.string().optional() }) as any },
        async (a: any) => { const r = await addWatermark(a.file, a.label, a.out); return okr(r.ok, r.output, r.detail); });
    server.registerTool('add_lower_third', { title: 'Add Lower-Third', description: 'Burn a lower-third name/title bar.', inputSchema: z.object({ file: z.string(), text: z.string().default('Title'), out: z.string().optional() }) as any },
        async (a: any) => { const r = await addLowerThird(a.file, a.text, a.out); return okr(r.ok, r.output, r.detail); });
    server.registerTool('add_progress_bar', { title: 'Add Progress Bar', description: 'Burn a progress bar at the bottom of a video.', inputSchema: z.object({ file: z.string(), out: z.string().optional() }) as any },
        async (a: any) => { const r = await addProgressBar(a.file, a.out); return okr(r.ok, r.output, r.detail); });
    server.registerTool('derive_outputs', { title: 'Derive Multi-Aspect + Thumbnail', description: 'Produce 9:16 / 16:9 / 1:1 versions + thumbnail from an existing video.', inputSchema: z.object({ file: z.string(), aspects: z.array(z.enum(['9:16', '16:9', '1:1'])).default(['9:16', '16:9', '1:1']), thumbnail: z.boolean().default(true), outDir: z.string().optional() }) as any },
        async (a: any) => { const r = await deriveFromVideo(a.file, a.aspects, a.thumbnail, a.outDir); return okr(r.ok, r.outputs && r.outputs[0], r.detail); });

    server.registerTool('make_voiceover', { title: 'Make Voiceover', description: 'Generate an mp3 voiceover from text using Edge-TTS (free).', inputSchema: z.object({ text: z.string().min(1), voice: z.string().optional(), out: z.string().optional() }) as any },
        async (a: any) => { const r = await generateVoiceoverOnly(a.text.split(/\n|;\s*/).filter(Boolean), a.voice ?? 'en-US-AriaNeural', a.out); return okr(r.ok, r.output, r.detail); });
    server.registerTool('download_image', { title: 'Download Image by Keyword', description: 'Fetch a free CC image for a keyword.', inputSchema: z.object({ keyword: z.string().min(1), out: z.string().optional() }) as any },
        async (a: any) => { const r = await downloadImageByKeyword(a.keyword, a.out); return okr(r.ok, r.output, r.detail); });
    server.registerTool('download_video', { title: 'Download Video by Keyword', description: 'Fetch a free CC video for a keyword.', inputSchema: z.object({ keyword: z.string().min(1), out: z.string().optional() }) as any },
        async (a: any) => { const r = await downloadVideoByKeyword(a.keyword, a.out); return okr(r.ok, r.output, r.detail); });
    server.registerTool('remove_silence', { title: 'Remove Silence', description: 'Cut silent gaps from a video/audio using ffmpeg silencedetect (free, CPU-only).', inputSchema: z.object({ file: z.string(), out: z.string().optional(), noise: z.number().default(-35), minDur: z.number().default(0.5) }) as any },
        async (a: any) => { const r = await removeSilence(a.file, a.out, { noise: a.noise, minDur: a.minDur }); return okr(r.ok, r.output, r.detail); });
    server.registerTool('detect_scenes', { title: 'Detect Scenes', description: 'Detect scene cuts / build chapters from a video (free, CPU-only).', inputSchema: z.object({ file: z.string(), out: z.string().optional() }) as any },
        async (a: any) => { const r = await detectScenes(a.file, a.out); return okr(r.ok, r.output, r.detail); });
    server.registerTool('auto_reframe', { title: 'Auto Reframe', description: 'Crop/reframe to a target aspect (9:16 / 1:1 / 16:9) focusing on the active region (free, CPU-only).', inputSchema: z.object({ file: z.string(), out: z.string().optional(), preset: z.enum(['9:16', '1:1', '16:9']).default('9:16') }) as any },
        async (a: any) => { const r = await autoReframe(a.file, a.out, { preset: a.preset }); return okr(r.ok, r.output, r.detail); });
    server.registerTool('reduce_noise', { title: 'Reduce Noise', description: 'Light denoise / smoothing for audio+video (free, CPU-only).', inputSchema: z.object({ file: z.string(), out: z.string().optional(), audio: z.enum(['off', 'light', 'medium', 'heavy']).default('medium'), video: z.number().default(0) }) as any },
        async (a: any) => { const r = await reduceNoise(a.file, a.out, { audio: a.audio, video: a.video }); return okr(r.ok, r.output, r.detail); });
    server.registerTool('apply_brand_kit', { title: 'Apply Brand Kit', description: 'Burn-in a brand kit (logo + color + name/handle) onto a video (free, CPU-only).', inputSchema: z.object({ file: z.string(), out: z.string().optional(), logo: z.string().optional(), color: z.string().default('#101010'), name: z.string().optional() }) as any },
        async (a: any) => { const r = await applyBrandKit(a.file, { name: a.name, logo: a.logo, color: a.color }, a.out); return okr(r.ok, r.output, r.detail); });
}