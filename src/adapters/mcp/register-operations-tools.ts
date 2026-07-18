/**
 * register-operations-tools.ts
 *
 * Exposes the SINGLE-TASK operations layer to any MCP client (Hermes, OpenClaw,
 * a normal person) as discrete tools. Each tool does EXACTLY ONE thing by reusing
 * the matching part of the project — never the whole pipeline unless asked.
 *
 * Plus a `do_task` router: a normal user types one plain sentence and the agent
 * classifies + runs ONLY the matching task.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mergeVideos, trimVideo, cropVideo, resizeVideo, rotateVideo, extractAudio } from '../../agentic/operations/edit.js';
import { generateVoiceoverOnly } from '../../agentic/operations/voiceover.js';
import { downloadImageByKeyword, downloadVideoByKeyword } from '../../agentic/operations/download-media.js';
import { doTask } from '../../agentic/operations/dispatch.js';
import { textResponse, errorResponse } from './responses.js';

export function registerOperationsTools(server: McpServer) {
    // ── Router: plain-language -> single task ─────────────────────────────
    server.registerTool(
        'do_task',
        {
            title: 'Do Task (natural-language router)',
            description:
                'Classify a plain request and run ONLY the matching single task: merge, trim, crop, resize, rotate, extract-audio, voiceover, download-image, download-video, or full-video. No paid key needed (heuristic routing; free model optional).',
            inputSchema: z.object({
                prompt: z.string().describe('What the user wants, in plain language, e.g. "merge a.mp4 and b.mp4"'),
                files: z.array(z.string()).optional().describe('Input file paths when the task needs them (merge: 2+, else 1)'),
                out: z.string().optional().describe('Optional output path'),
                voice: z.string().optional().describe('Voice id for voiceover (default en-US-AriaNeural)'),
                orientation: z.enum(['portrait', 'landscape']).optional(),
            }) as any,
        },
        async (args: any) => {
            const res = await doTask(args.prompt, {
                files: args.files,
                out: args.out,
                voice: args.voice,
                orientation: args.orientation,
            });
            return res.ok ? textResponse(`${res.summary}\n→ ${res.output}\n${res.detail}`) : errorResponse(`${res.summary}\n${res.detail}`);
        },
    );

    // ── Granular single-task tools (power users / other agents) ──────────
    server.registerTool(
        'merge_videos',
        { title: 'Merge Videos', description: 'Concatenate two or more video files into one.', inputSchema: z.object({ files: z.array(z.string()).min(2), out: z.string().optional(), orientation: z.enum(['portrait', 'landscape']).default('portrait') }) as any },
        async (a: any) => { const r = await mergeVideos(a.files, a.out, a.orientation); return r.ok ? textResponse(`→ ${r.output}\n${r.detail}`) : errorResponse(r.detail); },
    );

    server.registerTool(
        'trim_video',
        { title: 'Trim Video', description: 'Cut a clip to [start,end] seconds.', inputSchema: z.object({ file: z.string(), out: z.string().optional(), start: z.number().default(0), end: z.number().optional() }) as any },
        async (a: any) => { const r = await trimVideo(a.file, a.out, a.start, a.end); return r.ok ? textResponse(`→ ${r.output}\n${r.detail}`) : errorResponse(r.detail); },
    );

    server.registerTool(
        'crop_video',
        { title: 'Crop Video', description: 'Crop to a target aspect (9:16 / 16:9 / 1:1) or explicit box.', inputSchema: z.object({ file: z.string(), out: z.string().optional(), preset: z.enum(['9:16', '16:9', '1:1']).optional(), w: z.number().optional(), h: z.number().optional(), x: z.number().optional(), y: z.number().optional() }) as any },
        async (a: any) => { const r = await cropVideo(a.file, a.out, { preset: a.preset, w: a.w, h: a.h, x: a.x, y: a.y }); return r.ok ? textResponse(`→ ${r.output}\n${r.detail}`) : errorResponse(r.detail); },
    );

    server.registerTool(
        'resize_video',
        { title: 'Resize Video', description: 'Scale a video to WxH.', inputSchema: z.object({ file: z.string(), out: z.string().optional(), w: z.number().default(720), h: z.number().default(-2) }) as any },
        async (a: any) => { const r = await resizeVideo(a.file, a.out, a.w, a.h); return r.ok ? textResponse(`→ ${r.output}\n${r.detail}`) : errorResponse(r.detail); },
    );

    server.registerTool(
        'rotate_video',
        { title: 'Rotate Video', description: 'Rotate 90/180/270 degrees.', inputSchema: z.object({ file: z.string(), out: z.string().optional(), deg: z.enum(['90', '180', '270']).default('90') }) as any },
        async (a: any) => { const r = await rotateVideo(a.file, a.out, a.deg); return r.ok ? textResponse(`→ ${r.output}\n${r.detail}`) : errorResponse(r.detail); },
    );

    server.registerTool(
        'extract_audio',
        { title: 'Extract Audio', description: 'Pull the audio track out of a video as mp3.', inputSchema: z.object({ file: z.string(), out: z.string().optional() }) as any },
        async (a: any) => { const r = await extractAudio(a.file, a.out); return r.ok ? textResponse(`→ ${r.output}\n${r.detail}`) : errorResponse(r.detail); },
    );

    server.registerTool(
        'make_voiceover',
        { title: 'Make Voiceover', description: 'Generate an mp3 voiceover from text using Edge-TTS (free). Returns just the audio.', inputSchema: z.object({ text: z.string().min(1), voice: z.string().optional(), out: z.string().optional() }) as any },
        async (a: any) => { const r = await generateVoiceoverOnly(a.text.split(/(?:\n|;\s*)/).filter(Boolean), a.voice ?? 'en-US-AriaNeural', a.out); return r.ok ? textResponse(`→ ${r.output}\n${r.detail}`) : errorResponse(r.detail); },
    );

    server.registerTool(
        'download_image',
        { title: 'Download Image by Keyword', description: 'Fetch a free CC image for a keyword and return the file.', inputSchema: z.object({ keyword: z.string().min(1), out: z.string().optional() }) as any },
        async (a: any) => { const r = await downloadImageByKeyword(a.keyword, a.out); return r.ok ? textResponse(`→ ${r.output}\n${r.detail}`) : errorResponse(r.detail); },
    );

    server.registerTool(
        'download_video',
        { title: 'Download Video by Keyword', description: 'Fetch a free CC video for a keyword and return the file.', inputSchema: z.object({ keyword: z.string().min(1), out: z.string().optional() }) as any },
        async (a: any) => { const r = await downloadVideoByKeyword(a.keyword, a.out); return r.ok ? textResponse(`→ ${r.output}\n${r.detail}`) : errorResponse(r.detail); },
    );
}
