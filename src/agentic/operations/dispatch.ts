/**
 * dispatch.ts — executes a single routed task using ONLY the matching op.
 *
 * This is the bridge between route.ts (classify) and the operations library
 * (edit/voiceover/download-media). It runs exactly ONE thing and returns its
 * result. It never triggers the full pipeline unless the task is 'full_video'.
 *
 * Reuses the existing runAgenticPipeline for 'full_video' so the agentic
 * pipeline stays the single source of truth for end-to-end generation.
 */

import { mergeVideos, trimVideo, cropVideo, resizeVideo, rotateVideo, extractAudio, EditResult } from './edit.js';
import { generateVoiceoverOnly, VoiceoverResult } from './voiceover.js';
import { downloadImageByKeyword, downloadVideoByKeyword, MediaResult } from './download-media.js';
import { routeTask, RoutedTask } from './route.js';
import { runAgenticPipeline } from '../orchestrate.js';
import * as path from 'path';

export interface DispatchResult {
    kind: string;
    summary: string;
    output?: string;
    detail: string;
    ok: boolean;
}

/** Run a single op by RoutedTask. `inputs` lets the caller supply file paths. */
export async function dispatchTask(task: RoutedTask, inputs: { files?: string[]; out?: string; voice?: string; orientation?: 'portrait' | 'landscape' } = {}): Promise<DispatchResult> {
    const a = task.args;
    switch (task.kind) {
        case 'merge': {
            const files = inputs.files && inputs.files.length >= 2 ? inputs.files : a.files;
            if (!files || files.length < 2) return { kind: task.kind, summary: task.summary, ok: false, detail: 'merge needs at least 2 video files (pass them as inputs.files)' };
            const r: EditResult = await mergeVideos(files, inputs.out, inputs.orientation ?? 'portrait');
            return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
        }
        case 'trim': {
            const f = inputs.files?.[0] ?? a.file;
            if (!f) return { kind: task.kind, summary: task.summary, ok: false, detail: 'trim needs an input file (inputs.files[0])' };
            const r = await trimVideo(f, inputs.out, a.start ?? 0, a.end);
            return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
        }
        case 'crop': {
            const f = inputs.files?.[0] ?? a.file;
            if (!f) return { kind: task.kind, summary: task.summary, ok: false, detail: 'crop needs an input file' };
            const r = await cropVideo(f, inputs.out, { preset: a.preset });
            return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
        }
        case 'resize': {
            const f = inputs.files?.[0] ?? a.file;
            if (!f) return { kind: task.kind, summary: task.summary, ok: false, detail: 'resize needs an input file' };
            const r = await resizeVideo(f, inputs.out, a.w ?? 720, a.h ?? -2);
            return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
        }
        case 'rotate': {
            const f = inputs.files?.[0] ?? a.file;
            if (!f) return { kind: task.kind, summary: task.summary, ok: false, detail: 'rotate needs an input file' };
            const r = await rotateVideo(f, inputs.out, a.deg ?? 90);
            return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
        }
        case 'extract_audio': {
            const f = inputs.files?.[0] ?? a.file;
            if (!f) return { kind: task.kind, summary: task.summary, ok: false, detail: 'extract_audio needs an input video file' };
            const r = await extractAudio(f, inputs.out);
            return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
        }
        case 'voiceover': {
            const text = a.text || '';
            if (!text) return { kind: task.kind, summary: task.summary, ok: false, detail: 'voiceover needs text (args.text or prompt)' };
            const r: VoiceoverResult = await generateVoiceoverOnly(text.split(/(?:\n|;\s*)/).filter(Boolean), inputs.voice ?? 'en-US-AriaNeural', inputs.out);
            return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
        }
        case 'download_image': {
            const r: MediaResult = await downloadImageByKeyword(a.keyword, inputs.out);
            return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
        }
        case 'download_video': {
            const r: MediaResult = await downloadVideoByKeyword(a.keyword, inputs.out);
            return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
        }
        case 'full_video': {
            // The ONLY path that touches the full pipeline.
            const res = await runAgenticPipeline({ topic: a.topic || 'video', title: a.topic || 'Video', backend: 'agent', orientation: inputs.orientation ?? 'portrait' });
            // renderAgenticSlideshow returns the output mp4 path directly (string).
            const out = (res as any).outputPath ?? (res as any).manifest?.outputPath ?? res.workspace?.root;
            return { kind: task.kind, summary: task.summary, ok: !!out, output: out, detail: `full video pipeline done (backend=${res.backend}, fullyAgentDriven=${res.fullyAgentDriven})` };
        }
        default:
            return { kind: 'unknown', summary: task.summary, ok: false, detail: 'Could not classify the request into a single task.' };
    }
}

/** Convenience: classify + dispatch in one call. */
export async function doTask(
    prompt: string,
    inputs: { files?: string[]; out?: string; voice?: string; orientation?: 'portrait' | 'landscape' } = {},
): Promise<DispatchResult> {
    const task = routeTask(prompt);
    return dispatchTask(task, inputs);
}
