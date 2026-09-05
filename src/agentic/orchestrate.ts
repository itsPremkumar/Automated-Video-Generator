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

export { sourceFromUrl } from './orchestrator/source.js';
export { chunkCues, mergeWordsToLines, fmtSrt, escapeFilterPath } from './orchestrator/captions.js';
export {
    withTimeout,
    estimateAudioDurationSafe,
    runFfmpeg,
    makePlaceholder,
    normalizeAudio,
} from './orchestrator/ffmpeg.js';
export type { PipelineRequest, PipelineResult, PipelineProgress } from './orchestrator/types.js';
export { runAgenticPipeline } from './orchestrator/pipeline.js';
export { renderAgenticSlideshow, buildDuckExpression } from './orchestrator/render.js';
export * from './timeline/timeline.js';
export * from './timeline/director.js';
export * from './timeline/visual-intel.js';
export * from './timeline/audio-master.js';
export * from './timeline/motion-spec.js';
export * from './timeline/critique-vision.js';
export * from './timeline/restitch-partial.js';
export * from './timeline/proxy.js';
export * from './timeline/edit-ops.js';
export { makeContactSheet, writeDecisionsReport } from './orchestrator/artifacts.js';
export { prepareRemotionAssets, renderAgenticWithRemotion } from './orchestrator/remotion.js';
