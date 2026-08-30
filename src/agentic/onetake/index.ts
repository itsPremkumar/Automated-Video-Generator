/**
 * index.ts — Onetake module exports.
 */
export { runOnetake } from './pipeline.js';
export type { OnetakeRequest, OnetakeResult, OnetakeProgress, CritiqueVerdict, StyleIntent } from './types.js';
export { pickStyleIntent } from './style.js';
export { critiqueRender } from './critique.js';
export { decideFix, applyFix } from './self-fix.js';
export { researchTopic, duckDuckGoProvider, factsToScriptHints, factsToHashtags, factsToDescription } from './research.js';