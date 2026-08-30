/**
 * types.ts — Onetake request/result/progress contracts.
 *
 * The onetake pipeline extends the existing PipelineRequest with
 * research, self-fix, and publish phases that run automatically.
 */
export interface OnetakeRequest {
    topic: string;
    title?: string;
    orientation?: 'portrait' | 'landscape' | 'square';
    voice?: string;
    musicQuery?: string;
    backend?: 'agent' | 'vision';
    /** Number of self-fix attempts after a failed critique (default 3) */
    selfFixAttempts?: number;
    /** If true, pause before publish for human approval (default false) */
    reviewGate?: boolean;
    /** Research: max web-search results to gather (default 5) */
    maxResearchResults?: number;
    /** Style: force a specific grade (auto-picked if omitted) */
    forceGrade?: string;
    /** Publish: if true, attempt to post when upload-post is configured */
    autoPublish?: boolean;
    /** Extra driver LLM callback (advanced) */
    driverLLM?: import('../ai/bridge.js').DriverLlmCallback;
}

export interface ResearchFact {
    url: string;
    title: string;
    snippet: string;
    source: string;
}

export interface OnetakeResult {
    jobId: string;
    mp4: string;
    title: string;
    orientation: string;
    durationSec: number;
    research: {
        facts: ResearchFact[];
        offline: boolean;
        query: string;
    };
    style: {
        grade: string;
        transition: string;
        kinetic: boolean;
        captionTheme: string;
        rationale: string;
    };
    critique: {
        passed: boolean;
        attempts: number;
        gates: { id: string; label: string; pass: boolean; detail: string }[];
    };
    publish: {
        attempted: boolean;
        success: boolean;
        manifestPath?: string;
        error?: string;
    };
    metadata: {
        title: string;
        description: string;
        hashtags: string[];
        facts: string[];
    };
    logPath: string;
}

export type OnetakePhase =
    | 'research'
    | 'script'
    | 'plan'
    | 'acquire'
    | 'render'
    | 'critique'
    | 'self-fix'
    | 'publish'
    | 'done';

export interface OnetakeProgress {
    phase: OnetakePhase;
    percent: number;
    message: string;
    jobId: string;
}

export interface CritiqueVerdict {
    passed: boolean;
    gates: { id: string; label: string; pass: boolean; detail: string }[];
    /** Suggested fix action for self-fix loop */
    fixAction?: 're-render' | 're-acquire' | 're-grade' | 'none';
    fixTarget?: string;
}

export interface StyleIntent {
    grade: string;
    transition: string;
    /** true = kinetic text on, false = static text */
    kinetic: boolean;
    captionTheme: string;
    rationale: string;
}

export interface CritiqueVerdict {
    passed: boolean;
    gates: { id: string; label: string; pass: boolean; detail: string }[];
    /** Suggested fix action for self-fix loop */
    fixAction?: 're-render' | 're-acquire' | 're-grade' | 'none';
    fixTarget?: string;
}