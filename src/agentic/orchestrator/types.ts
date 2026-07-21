export type { PipelineResult, PipelineProgress } from '../types.js';

import type { AgenticBackend, AgentBackendConfig } from '../ai/agent.js';
import type { DriverLlmCallback } from '../ai/bridge.js';

export interface PipelineRequest {
    /** Custom script with [Visual: ...] and [Text: ...] tags.
     *  When provided, the agentic pipeline uses this script directly instead of
     *  auto-generating one from `topic`/`title`. Supports both local assets
     *  ([Visual: logo.png]) and online stock keywords ([Visual: ai coding]).
     *  Local files are resolved from input/visuals/ (same as legacy pipeline). */
    script?: string;
    topic: string;
    title: string;
    jobId?: string;
    orientation?: 'portrait' | 'landscape';
    voice?: string;
    musicQuery?: string;
    candidatesPerAsset?: number;
    backend?: AgenticBackend;
    preferVisual?: 'image' | 'video';
    agent?: Partial<AgentBackendConfig>;
    dryRun?: boolean;
    localAssets?: string[];
    videoClips?: string[];
    personalAudio?: string[];
    defaultVisual?: string;
    hookFirst?: boolean;
    variablePacing?: boolean;
    driverLLM?: DriverLlmCallback;
}
