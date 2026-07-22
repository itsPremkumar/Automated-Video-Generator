/**
 * dispatch.ts — executes a single routed task (or a short chain) using ONLY the
 * matching op(s). This is the bridge between route.ts (classify) and the
 * operations library. It runs exactly the requested task(s) and returns the
 * result. It never triggers the full pipeline unless the task is 'full_video'.
 *
 * Reuses the existing runAgenticPipeline for 'full_video' so the agentic
 * pipeline stays the single source of truth for end-to-end generation.
 *
 * Quality gate: every single-task result that produces a video is verified
 * with verifyRenderedVideo (the same post-render check the pipeline uses) so a
 * broken merge/trim/crop is caught and reported — not silently shipped.
 */

import { mergeVideos, trimVideo, cropVideo, resizeVideo, rotateVideo, extractAudio, EditResult } from './edit.js';
import { generateVoiceoverOnly, VoiceoverResult } from './voiceover.js';
import { downloadImageByKeyword, downloadVideoByKeyword, MediaResult } from './download-media.js';
import { splitVideoEqual, splitVideoAt, SplitResult } from './split.js';
import { addCaptionsFromText, addCaptionsFromSrt, CaptionResult } from './captions.js';
import { addMusic, addAudioTrack, AudioTrackResult } from './audio-track.js';
import { localizeVideo, LocalizeResult } from './localize.js';
import { gradeVideo, GradeResult } from './grade.js';
import { slowMotion, speedRamp, MotionResult } from './motion.js';
import { addWatermark, addLowerThird, addProgressBar, OverlayResult } from './overlay.js';
import { deriveFromVideo, DerivativeResult } from './derivative.js';
import { removeSilence } from './silence.js';
import { detectScenes } from './scene.js';
import { autoReframe } from './reframe.js';
import { reduceNoise } from './noise.js';
import { applyBrandKit } from './brand.js';
import { convertFormat, toGif, convertAudio, ConvertResult } from './convert.js';
import { imagesToVideo, videoToImages } from './image-video.js';
import { separateAudio, separateVideo, muteVideo } from './demux.js';
import { downloadSocial } from './social-dl.js';
import { writeScript } from './script.js';
import * as path from 'path';
import { RouteResult, RoutedTask, RoutedChain, isChain, routeTask } from './route.js';
import { runAgenticPipeline } from '../orchestrate.js';
import { verifyRenderedVideo } from '../pipeline/gate.js';
import { AgentBrain } from '../ai/brain.js';
import * as fs from 'fs';
import { safeOutputPath } from './security.js';

export interface DispatchResult {
    kind: string;
    summary: string;
    output?: string;
    outputs?: string[];
    detail: string;
    ok: boolean;
    /** Quality-gate result for video outputs (x7-x9). */
    gate?: { pass: boolean; checks: { id: string; pass: boolean; label: string; detail: string }[] };
}

interface RunInput {
    files?: string[];
    out?: string;
    voice?: string;
    orientation?: 'portrait' | 'landscape';
    /** extra op-specific args (captions text, music query, grade preset, etc.) */
    extra?: Record<string, any>;
}

/** Run one task. Returns the primary output path (string) or paths (string[]). */
async function runOne(task: RoutedTask, input: RunInput): Promise<DispatchResult> {
    const a = task.args;
    const f = input.files?.[0];
    const files = input.files && input.files.length >= 2 ? input.files : a.files;
    const extra = input.extra ?? {};

    const gate = async (out?: string): Promise<DispatchResult['gate']> => {
        if (!out || !fs.existsSync(out)) return undefined;
        try {
            const c = await verifyRenderedVideo(out, 1, { keywords: [] });
            return { pass: c.pass, checks: c.checks };
        } catch {
            return undefined;
        }
    };

    // SECURITY: sanitize any caller-supplied output path (blocks `../` traversal
    // from MCP / API / programmatic callers). Throws -> caught below as a clean
    // structured failure rather than writing outside output/.
    let safeOut: string | undefined;
    try {
        safeOut = safeOutputPath(input.out);
    } catch (e) {
        return { kind: task.kind, summary: task.summary, ok: false, detail: (e as Error).message };
    }
    const out = safeOut;

    try {
        switch (task.kind) {
            case 'merge': {
                if (!files || files.length < 2)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'merge needs ≥2 video files' };
                const r: EditResult = await mergeVideos(files, input.out, input.orientation ?? 'portrait');
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'trim': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'trim needs an input file' };
                const r = await trimVideo(f, input.out, a.start ?? 0, a.end);
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'crop': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'crop needs an input file' };
                const r = await cropVideo(f, input.out, { preset: a.preset });
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'resize': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'resize needs an input file' };
                const r = await resizeVideo(f, input.out, a.w ?? 720, a.h ?? -2);
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'rotate': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'rotate needs an input file' };
                const r = await rotateVideo(f, input.out, a.deg ?? 90);
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'extract_audio': {
                if (!f)
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'extract_audio needs an input video',
                    };
                const r = await extractAudio(f, input.out);
                return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
            }
            case 'split': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'split needs an input file' };
                const r: SplitResult = a.parts
                    ? await splitVideoEqual(f, a.parts, input.out)
                    : await splitVideoAt(f, a.marks ?? [], input.out);
                return { kind: task.kind, summary: task.summary, ok: r.ok, outputs: r.outputs, detail: r.detail };
            }
            case 'add_captions': {
                if (!f)
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'add_captions needs an input video',
                    };
                const r: CaptionResult = a.srt
                    ? await addCaptionsFromSrt(f, a.srt, input.out)
                    : await addCaptionsFromText(f, extra.text || a.text || '', input.out);
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'add_music': {
                if (!f)
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'add_music needs an input video',
                    };
                const r: AudioTrackResult = await addMusic(f, extra.query || a.query || 'ambient lofi', input.out);
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'localize': {
                if (!f && !(extra.text || a.text))
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'localize needs a video/srt or source text',
                    };
                const r: LocalizeResult = await localizeVideo(
                    f ? f : null,
                    extra.text || a.text || null,
                    a.languages || ['es'],
                    undefined,
                    new AgentBrain(),
                );
                return { kind: task.kind, summary: task.summary, ok: r.ok, outputs: r.outputs, detail: r.detail };
            }
            case 'grade': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'grade needs an input file' };
                const r: GradeResult = await gradeVideo(f, a.preset || 'cinematic', input.out);
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'slow_motion': {
                if (!f)
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'slow_motion needs an input file',
                    };
                const r: MotionResult = await slowMotion(f, a.factor ?? 2, input.out);
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'speed_ramp': {
                if (!f)
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'speed_ramp needs an input file',
                    };
                const r: MotionResult = await speedRamp(
                    f,
                    a.rampStart ?? 1,
                    a.rampEnd ?? 3,
                    a.slowFactor ?? 3,
                    input.out,
                );
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'watermark': {
                if (!f)
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'watermark needs an input file',
                    };
                const r: OverlayResult = await addWatermark(f, extra.label || a.label || 'MyBrand', input.out);
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'lower_third': {
                if (!f)
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'lower_third needs an input file',
                    };
                const r: OverlayResult = await addLowerThird(f, extra.text || a.text || 'Title', input.out);
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'progress_bar': {
                if (!f)
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'progress_bar needs an input file',
                    };
                const r: OverlayResult = await addProgressBar(f, input.out);
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'derive': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'derive needs an input file' };
                const r: DerivativeResult = await deriveFromVideo(
                    f,
                    a.aspects || ['9:16', '16:9', '1:1'],
                    a.thumbnail !== false,
                    input.out ? path.dirname(input.out) : undefined,
                );
                return { kind: task.kind, summary: task.summary, ok: r.ok, outputs: r.outputs, detail: r.detail };
            }
            case 'voiceover': {
                const text = extra.text || a.text || '';
                if (!text) return { kind: task.kind, summary: task.summary, ok: false, detail: 'voiceover needs text' };
                const r: VoiceoverResult = await generateVoiceoverOnly(
                    text.split(/(?:\n|;\s*)/).filter(Boolean),
                    input.voice ?? 'en-US-AriaNeural',
                    input.out,
                );
                return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
            }
            case 'download_image': {
                const r: MediaResult = await downloadImageByKeyword(a.keyword, input.out);
                return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
            }
            case 'download_video': {
                const r: MediaResult = await downloadVideoByKeyword(a.keyword, input.out);
                return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
            }
            case 'remove_silence': {
                if (!f)
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'remove_silence needs an input file',
                    };
                const r = await removeSilence(f, input.out, { noise: a.noise, minDur: a.minDur });
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'detect_scenes': {
                if (!f)
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'detect_scenes needs an input file',
                    };
                const r = await detectScenes(f, input.out, { mode: a.mode ?? 'detect', duration: a.duration });
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail + (r.cuts ? ` (${r.cuts.length} cuts)` : ''),
                };
            }
            case 'auto_reframe': {
                if (!f)
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'auto_reframe needs an input file',
                    };
                const r = await autoReframe(f, input.out, { preset: a.preset ?? a.aspect ?? '9:16' });
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'reduce_noise': {
                if (!f)
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'reduce_noise needs an input file',
                    };
                const r = await reduceNoise(f, input.out, {
                    audio: a.strength ?? a.audio ?? 'medium',
                    video: a.video ?? 0,
                });
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'apply_brand_kit': {
                if (!f)
                    return {
                        kind: task.kind,
                        summary: task.summary,
                        ok: false,
                        detail: 'apply_brand_kit needs an input file',
                    };
                const r = await applyBrandKit(
                    f,
                    {
                        name: a.name ?? a.handle,
                        color: a.color,
                        logo: a.logo,
                        tagline: a.tagline,
                        intro: a.intro,
                        outro: a.outro,
                        bars: a.bars,
                    },
                    input.out,
                );
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: r.ok,
                    output: r.output,
                    detail: r.detail,
                    gate: await gate(r.output),
                };
            }
            case 'convert': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'convert needs an input file' };
                const r: ConvertResult = await convertFormat(f, a.target || 'mp4', input.out);
                return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
            }
            case 'to_gif': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'to_gif needs an input file' };
                const r: ConvertResult = await toGif(f, input.out, a.fps ?? 15, a.width ?? 480);
                return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
            }
            case 'convert_audio': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'convert_audio needs an input file' };
                const r: ConvertResult = await convertAudio(f, a.target || 'mp3', input.out);
                return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
            }
            case 'images_to_video': {
                const folder = f ?? a.folder ?? (input.files && input.files[0]);
                if (!folder)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'images_to_video needs a folder/files' };
                const r = await imagesToVideo(folder, input.out, {
                    durationPerImage: a.durationPerImage,
                });
                return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
            }
            case 'video_to_images': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'video_to_images needs an input file' };
                const r = await videoToImages(f, input.out ? path.dirname(input.out) : undefined, a.everyNthFrame ?? a.fps ? Math.round(25 / (a.fps || 1)) : 30);
                return { kind: task.kind, summary: task.summary, ok: r.ok, outputs: r.outputs, detail: r.detail };
            }
            case 'separate_audio': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'separate_audio needs an input file' };
                const r = await separateAudio(f, input.out);
                return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
            }
            case 'separate_video': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'separate_video needs an input file' };
                const r = await separateVideo(f, input.out);
                return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
            }
            case 'mute_video': {
                if (!f)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'mute_video needs an input file' };
                const r = await muteVideo(f, input.out);
                return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
            }
            case 'social_download': {
                const url = a.url;
                if (!url)
                    return { kind: task.kind, summary: task.summary, ok: false, detail: 'social_download needs a URL' };
                const r = await downloadSocial(url, a.mode ?? 'both', input.out);
                return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.output, detail: r.detail };
            }
            case 'write_script': {
                const topic = a.topic || extra.text || '';
                if (!topic) return { kind: task.kind, summary: task.summary, ok: false, detail: 'write_script needs a topic' };
                const r = await writeScript(topic, input.voice);
                return { kind: task.kind, summary: task.summary, ok: r.ok, output: r.script, detail: r.detail };
            }
            case 'full_video': {
                const res = await runAgenticPipeline({
                    topic: a.topic || 'video',
                    title: a.topic || 'Video',
                    backend: 'agent',
                    orientation: input.orientation ?? 'portrait',
                });
                const out = (res as any).outputPath ?? (res as any).manifest?.outputPath ?? res.workspace?.root;
                return {
                    kind: task.kind,
                    summary: task.summary,
                    ok: !!out,
                    output: out,
                    detail: `full video pipeline done (backend=${res.backend}, fullyAgentDriven=${res.fullyAgentDriven})`,
                };
            }
            default:
                return {
                    kind: 'unknown',
                    summary: task.summary,
                    ok: false,
                    detail: 'Could not classify the request into a single task.',
                };
        }
    } catch (err) {
        // Never let a single op crash doTask. Return a structured failure.
        const msg = err instanceof Error ? err.message : String(err);
        return { kind: task.kind, summary: task.summary, ok: false, detail: `operation failed: ${msg}` };
    }
}

function primaryOutput(r: DispatchResult): string | undefined {
    return r.output ?? (r.outputs && r.outputs[0]);
}

/** Run a chain: each step's primary output feeds the next step's input file. */
async function runChain(chain: RoutedChain, input: RunInput): Promise<DispatchResult> {
    let currentInput: RunInput = input;
    let last: DispatchResult | null = null;
    for (const step of chain.chain) {
        const r = await runOne(step, currentInput);
        last = r;
        if (!r.ok) return { ...r, summary: `${chain.summary} — failed at: ${step.summary}` };
        const nextIn = primaryOutput(r);
        if (nextIn) currentInput = { ...currentInput, files: [nextIn], out: undefined };
    }
    return last!;
}

/** Classify + dispatch in one call. Accepts a pre-classified RouteResult too. */
export async function doTask(promptOrRoute: string | RouteResult, inputs: RunInput = {}): Promise<DispatchResult> {
    const routed: RouteResult = typeof promptOrRoute === 'string' ? routeTask(promptOrRoute) : promptOrRoute;
    if (isChain(routed)) return runChain(routed, inputs);
    return runOne(routed, inputs);
}
