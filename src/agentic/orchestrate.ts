/**
 * orchestrate.ts — PUBLIC FACADE for the agentic pipeline.
 *
 * All implementation lives in src/agentic/orchestrate/ (split by concern).
 * This file re-exports everything for backward compatibility with importers
 * that reference './orchestrate.js'.
 *
 * Module structure:
 *   source.ts      — sourceFromUrl (URL→provider mapping)
 *   captions.ts    — chunkCues, mergeWordsToLines, fmtSrt, escapeFilterPath
 *   ffmpeg.ts      — runFfmpeg, estimateAudioDurationSafe, withTimeout, makePlaceholder, normalizeAudio
 *   types.ts       — PipelineRequest, PipelineResult, PipelineProgress
 *   pipeline.ts    — runAgenticPipeline (core orchestration)
 *   render.ts      — renderAgenticSlideshow, buildDuckExpression
 *   artifacts.ts   — makeContactSheet, writeDecisionsReport
 *   remotion.ts    — prepareRemotionAssets, renderAgenticWithRemotion
 */

export { sourceFromUrl } from './orchestrate/source.js';
export { chunkCues, mergeWordsToLines, fmtSrt, escapeFilterPath } from './orchestrate/captions.js';
export {
    withTimeout,
    estimateAudioDurationSafe,
    runFfmpeg,
    makePlaceholder,
    normalizeAudio,
} from './orchestrate/ffmpeg.js';
export type { PipelineRequest, PipelineResult, PipelineProgress } from './orchestrate/types.js';
export { runAgenticPipeline } from './orchestrate/pipeline.js';
export { renderAgenticSlideshow, buildDuckExpression } from './orchestrate/render.js';
export { makeContactSheet, writeDecisionsReport } from './orchestrate/artifacts.js';
export { prepareRemotionAssets, renderAgenticWithRemotion } from './orchestrate/remotion.js';
