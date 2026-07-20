import type { AgenticBackend, AgentBackendConfig } from '../ai/agent.js';
import type { AssetCandidate, AssetDecision, Plan, RenderManifest } from '../types.js';
import type { DriverLlmCallback } from '../ai/bridge.js';

export interface PipelineRequest {
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

export interface PipelineResult {
    backend: AgenticBackend;
    plan: Plan;
    workspace: import('../management/workspace.js').AgenticWorkspace;
    candidates: AssetCandidate[];
    decisions: AssetDecision[];
    gate: { pass: boolean; checks: { id: string; pass: boolean; label: string; detail: string }[] };
    manifest: RenderManifest;
    voiceovers: import('../media/tts.js').VoiceoverResult | null;
    fullyAgentDriven: boolean;
    postRender?: import('../pipeline/gate.js').PostRenderCheck;
    aiVerify?: import('../config.js').AgenticConfig['aiVerify'];
}

export interface PipelineProgress {
    stage: 'plan' | 'acquire' | 'verify' | 'decide' | 'gate' | 'voiceover' | 'render';
    percent: number;
    message: string;
    sceneIndex?: number;
    candidateIndex?: number;
}
