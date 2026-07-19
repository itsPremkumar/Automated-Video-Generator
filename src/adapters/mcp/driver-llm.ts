/**
 * driver-llm.ts — process-level registry for the DRIVER's LLM callback.
 *
 * Why a registry (and not a magic MCP handle)?
 * --------------------------------------------
 * The MCP server runs as a stdio child process. There is NO built-in channel
 * for the pipeline to synchronously call "the driver's model" mid-run — stdio
 * MCP has no sampling/elicitation capability wired here. So the driver-first
 * priority (the standing rule) is realised HONESTLY: whichever host embeds or
 * launches this pipeline and *does* have a way to reach its own model registers
 * a callback here. The agentic pipeline then routes every LLM-capable step to
 * it FIRST (via the LlmBridge cascade), falling back to the configured free
 * model and finally the signal floor.
 *
 * Concretely this supports:
 *  - In-process hosts (a Node app that owns an LLM client) — register directly.
 *  - Future sampling-capable MCP transports — the transport adapter registers a
 *    callback that performs the sampling round-trip.
 *  - Tests — register a deterministic stub to assert driver-first behaviour.
 *
 * When nothing is registered (the default, e.g. plain stdio MCP or CLI), the
 * pipeline behaves EXACTLY as before: configured model -> signal floor.
 */

import type { DriverLlmCallback } from '../../agentic/bridge.js';

let registered: DriverLlmCallback | undefined;

/** Register (or replace) the driver's LLM callback for this process. */
export function setDriverLlm(cb: DriverLlmCallback | undefined): void {
    registered = cb;
}

/** Get the currently registered driver LLM callback, if any. */
export function getDriverLlm(): DriverLlmCallback | undefined {
    return registered;
}

/** True when a driver callback is registered (driver-first path is live). */
export function hasDriverLlm(): boolean {
    return typeof registered === 'function';
}
