/**
 * bridge.ts — UNIFIED LLM BOUNDARY for the agentic pipeline.
 *
 * Why this exists
 * ---------------
 * Today the agentic system reaches an LLM through THREE scattered paths:
 *   - AgentBrain        (OpenRouter / Ollama free text + vision)
 *   - verifyMedia       (Gemini / Ollama vision, in lib/media-verifier)
 *   - inline completeJSON calls in plan.ts / orchestrate.ts
 * Each path has its own config, its own null-semantics, and its own fallback.
 * This module collapses them into ONE interface so every LLM-capable step has
 * a single, testable entry point and a single, predictable cascade:
 *
 *     DRIVER (the process that commanded the generation)  ->  highest priority
 *       then  CONFIGURED MODEL (OpenRouter/Ollama/Gemini)  ->  secondary
 *       then  NULL (signal gates X7–X15 / heuristics)      ->  guaranteed floor
 *
 * Driver priority (the user's standing rule)
 * --------------------------------------------
 * "By default, in agentic video generation, the higher priority is the DRIVER
 *  system that commands the video generation." So when the driver injects an
 *  LLM callback (only possible under MCP), the bridge uses it FIRST for every
 *  text + vision + audio decision. If the driver callback is absent or returns
 *  null/throws, the bridge transparently falls back to the configured model,
 *  and finally to the signal/heuristic floor. Nothing regresses offline: with
 *  no driver callback and no model keys, the bridge is exactly NullBridge.
 *
 * The MCP transport note
 * ----------------------
 * The MCP server runs as a stdio child process, so there is NO automatic
 * "the driver's LLM is just there" handle. The driver priority is realised by
 * injecting a `driverLLM` callback when the pipeline is launched under MCP
 * (see register-agentic-tools.ts). The callback is fulfilled by the driver
 * (e.g. via a provide_llm_result tool round-trip). Until that wiring exists,
 * `driverLLM` is simply undefined and the bridge behaves like today.
 *
 * Nothing here deletes the old paths — AgentBrain and verifyMedia are still
 * used internally by ModelBridge. This is purely additive.
 */

import { AgentBrain } from './brain.js';
import { verifyMedia } from '../lib/media-verifier.js';

/** A single structured score returned by vision/audio verification. */
export interface BridgeScore {
    pass: boolean;
    confidence: number; // 0-10
    reason: string;
}

/**
 * The driver-supplied LLM callback. Under MCP the driver process fulfils this.
 * Returns the model's structured output, or null if the driver declines /
 * is offline / the call fails. A null result triggers the next cascade tier.
 */
export type DriverLlmCallback = (req: DriverLlmRequest) => Promise<unknown | null>;

export type DriverLlmRequest =
    | { type: 'json'; system: string; prompt: string; schemaHint: string }
    | { type: 'vision'; filePath: string; keywords: string[] }
    | { type: 'audio'; transcript: string; expectation: string; flags: string[] };

/** The unified interface every LLM-capable step goes through. */
export interface LlmBridge {
    /** Text -> structured JSON. Returns null when unavailable. */
    completeJSON<T>(system: string, prompt: string, schemaHint: string): Promise<T | null>;
    /** Image/video bytes -> relevance/watermark/safety. Returns null when unavailable. */
    visionVerify(filePath: string, keywords: string[]): Promise<BridgeScore | null>;
    /** Audio transcript -> mood/clarity. Returns null when unavailable. */
    judgeAudio(transcript: string, expectation: string, flags: string[]): Promise<BridgeScore | null>;
    /** Human-readable label for logs/telemetry. */
    readonly name: string;
}

/** Floor: no model at all. Every method accepts (and ignores) the request and
 *  returns null -> caller uses signals / heuristics. Keeping the signatures
 *  identical to LlmBridge lets it drop in anywhere. */
export class NullBridge implements LlmBridge {
    readonly name = 'null';
    async completeJSON<T>(): Promise<T | null> {
        return null;
    }
    async visionVerify(): Promise<BridgeScore | null> {
        return null;
    }
    async judgeAudio(): Promise<BridgeScore | null> {
        return null;
    }
}

/**
 * Secondary tier: the configured free models (OpenRouter / Ollama / Gemini).
 * Wraps the EXISTING AgentBrain + verifyMedia so behaviour is unchanged from
 * today. This is what the pipeline used before the bridge existed.
 */
export class ModelBridge implements LlmBridge {
    private brain: AgentBrain;
    readonly name: string;
    constructor(opts?: ConstructorParameters<typeof AgentBrain>[0]) {
        this.brain = new AgentBrain(opts);
        this.name = 'model';
    }
    async completeJSON<T>(system: string, prompt: string, schemaHint: string): Promise<T | null> {
        return this.brain.completeJSON<T>(system, prompt, schemaHint);
    }
    async visionVerify(filePath: string, keywords: string[]): Promise<BridgeScore | null> {
        // If the brain reports no running model, there is no AI vision -> null
        // (signal gates decide). Mirrors the pre-bridge `!brain.modelEnabled` guard.
        const enabled = (this.brain as unknown as { modelEnabled?: boolean }).modelEnabled;
        if (enabled === false) return null;
        // Prefer the brain's OWN vision method (multimodal agent model). It
        // returns { passes, confidence, reason }. Fall back to the standalone
        // verifyMedia (Gemini/Ollama) only when the brain has no vision result.
        try {
            const bv = await (
                this.brain as unknown as {
                    visionVerify?: (
                        f: string,
                        k: string[],
                    ) => Promise<{ passes: boolean; confidence?: number; reason?: string } | null>;
                }
            ).visionVerify?.(filePath, keywords);
            if (bv) return { pass: bv.passes, confidence: bv.confidence ?? 0, reason: bv.reason ?? '' };
        } catch {
            /* fall through to verifyMedia */
        }
        const r = await verifyMedia(filePath, keywords);
        if (!r) return null;
        return { pass: r.passes, confidence: r.confidence, reason: r.reason };
    }
    async judgeAudio(transcript: string, expectation: string, flags: string[]): Promise<BridgeScore | null> {
        // Delegate to the agent's text model on the transcript (zero audio-decode cost).
        const r = await this.brain.completeJSON<BridgeScore>(
            'You judge whether audio matches the expected mood/clarity. Reply ONLY JSON {"pass":bool,"confidence":0-10,"reason":"..."}.',
            `Expectation: ${expectation}\nFlags: ${flags.join(', ')}\nTranscript: ${transcript}`,
            '{"pass":true,"confidence":8,"reason":"..."}',
        );
        return r;
    }
}

/**
 * Primary tier: the DRIVER's own LLM, with transparent fallback to a ModelBridge
 * (and ultimately the signal floor). This is the user's standing rule realised:
 * the system that commanded the generation gets first say on every decision.
 *
 * If `driverLLM` is undefined (e.g. plain CLI run, or MCP without the callback
 * wired yet), this bridge degrades to exactly `fallback` — i.e. today's behaviour.
 */
export class McpDriverBridge implements LlmBridge {
    readonly name = 'driver';
    private driver: DriverLlmCallback | undefined;
    private fallback: LlmBridge;
    constructor(driver?: DriverLlmCallback, fallback: LlmBridge = new ModelBridge()) {
        this.driver = driver;
        this.fallback = fallback;
    }
    /** Swap/replace the driver callback at runtime (MCP layer calls this). */
    setDriver(driver?: DriverLlmCallback): void {
        this.driver = driver;
    }

    async completeJSON<T>(system: string, prompt: string, schemaHint: string): Promise<T | null> {
        if (this.driver) {
            try {
                const r = await this.driver({ type: 'json', system, prompt, schemaHint });
                if (r != null) return r as T;
            } catch {
                /* fall through to model */
            }
        }
        return this.fallback.completeJSON<T>(system, prompt, schemaHint);
    }

    async visionVerify(filePath: string, keywords: string[]): Promise<BridgeScore | null> {
        if (this.driver) {
            try {
                const r = await this.driver({ type: 'vision', filePath, keywords });
                if (r != null) {
                    const s = r as Partial<BridgeScore>;
                    if (typeof s.pass === 'boolean') {
                        return { pass: s.pass, confidence: s.confidence ?? 5, reason: s.reason ?? '' };
                    }
                }
            } catch {
                /* fall through to model */
            }
        }
        return this.fallback.visionVerify(filePath, keywords);
    }

    async judgeAudio(transcript: string, expectation: string, flags: string[]): Promise<BridgeScore | null> {
        if (this.driver) {
            try {
                const r = await this.driver({ type: 'audio', transcript, expectation, flags });
                if (r != null) {
                    const s = r as Partial<BridgeScore>;
                    if (typeof s.pass === 'boolean') {
                        return { pass: s.pass, confidence: s.confidence ?? 5, reason: s.reason ?? '' };
                    }
                }
            } catch {
                /* fall through to model */
            }
        }
        return this.fallback.judgeAudio(transcript, expectation, flags);
    }
}

/**
 * Single entry point. Picks the bridge by availability, honouring the cascade:
 *   driver callback present  ->  McpDriverBridge (driver first, model fallback)
 *   model keys present       ->  ModelBridge
 *   neither                  ->  NullBridge (signal floor)
 *
 * `driverLLM` is only provided when the pipeline is launched under MCP with the
 * driver callback wired. `modelOpts` lets callers scope the model budget.
 */
export function resolveBridge(
    opts: {
        hasModelKeys?: boolean;
        driverLLM?: DriverLlmCallback;
        modelOpts?: ConstructorParameters<typeof AgentBrain>[0];
    } = {},
): LlmBridge {
    const model = opts.hasModelKeys ? new ModelBridge(opts.modelOpts) : new NullBridge();
    if (opts.driverLLM) return new McpDriverBridge(opts.driverLLM, model);
    return model;
}

/**
 * Normalise a value that may be a bridge OR a legacy AgentBrain into an
 * LlmBridge. This keeps existing callers that still pass an AgentBrain working
 * unchanged while routing them through the unified interface (model tier).
 * A null/undefined input becomes a NullBridge (signal floor).
 */
export function toBridge(x: LlmBridge | AgentBrain | null | undefined): LlmBridge {
    if (!x) return new NullBridge();
    // Duck-type: a bridge has a `name` string and completeJSON; a ModelBridge
    // wrapper is created for a raw AgentBrain.
    if (typeof (x as LlmBridge).name === 'string' && 'visionVerify' in x && 'judgeAudio' in x) {
        return x as LlmBridge;
    }
    const b = new ModelBridge();
    // @ts-expect-error inject the legacy brain instance
    b.brain = x;
    return b;
}
