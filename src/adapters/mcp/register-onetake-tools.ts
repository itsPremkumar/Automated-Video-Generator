/**
 * register-onetake-tools.ts
 *
 * Exposes the onetake pipeline to any MCP client as `onetake_run`.
 * This is the "one command does everything" surface: research → script
 * → style → plan → acquire → render → critique → self-fix → publish.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runOnetake } from '../../agentic/onetake/pipeline.js';
import { duckDuckGoProvider } from '../../agentic/onetake/research.js';
import { getDriverLlm } from './driver-llm.js';
import { textResponse, errorResponse } from './responses.js';

export function registerOnetakeTools(server: McpServer) {
    server.registerTool(
        'onetake_run',
        {
            title: 'Onetake Run (one topic → one video, fully autonomous)',
            description:
                'One-shot autonomous video generation: research the topic online, write an SEO script with cited facts, pick a coherent director style, acquire media, render, run QA gates (black/freeze/audio/crop), self-fix up to N times, and optionally publish. Returns the MP4 path + structured metadata + publish manifest.',
            inputSchema: z.object({
                topic: z.string().min(5).describe('The video topic — e.g. "How volcanoes shape the Earth"'),
                title: z.string().optional().describe('Override the auto-generated title'),
                orientation: z.enum(['portrait', 'landscape', 'square']).default('portrait'),
                voice: z.string().optional().describe('Edge-TTS voice ID (default: en-US-AriaNeural)'),
                musicQuery: z.string().optional().describe('Background music query (default: "ambient lofi")'),
                backend: z.enum(['agent', 'vision']).default('agent'),
                selfFixAttempts: z.number().min(0).max(5).default(3).describe('Max self-fix retries after failed QA'),
                reviewGate: z.boolean().default(false).describe('If true, pause before publish for human approval'),
                maxResearchResults: z.number().min(1).max(10).default(5).describe('Max web-search facts to gather'),
                forceGrade: z.string().optional().describe('Force a specific grade (cinematic/vivid/warm/cool/neutral/sunset/cyberpunk/noir)'),
                autoPublish: z.boolean().default(true).describe('Auto-publish if upload-post is configured'),
            }) as any,
        },
        async (args: any) => {
            try {
                const result = await runOnetake(
                    {
                        topic: args.topic,
                        title: args.title,
                        orientation: args.orientation,
                        voice: args.voice,
                        musicQuery: args.musicQuery,
                        backend: args.backend,
                        selfFixAttempts: args.selfFixAttempts,
                        reviewGate: args.reviewGate,
                        maxResearchResults: args.maxResearchResults,
                        forceGrade: args.forceGrade,
                        autoPublish: args.autoPublish,
                        driverLLM: getDriverLlm(),
                    },
                    undefined, // no progress callback (MCP is request-response)
                    duckDuckGoProvider(),
                );

                const publishStatus = result.publish.attempted
                    ? (result.publish.success ? 'SUCCESS' : `FAILED — ${result.publish.error ?? 'unknown'}`)
                    : 'skipped (not configured)';
                const lines = [
                    `DONE — onetake complete`,
                    `Job: ${result.jobId}`,
                    `MP4: ${result.mp4}`,
                    `Title: ${result.title}`,
                    `Orientation: ${result.orientation}`,
                    `Research: ${result.research.facts.length} facts ${result.research.offline ? '(offline)' : '(web)'}`,
                    `Style: ${result.style.grade} / ${result.style.transition} / ${result.style.kinetic ? 'kinetic' : 'static'} — ${result.style.rationale}`,
                    `Critique: ${result.critique.passed ? 'PASS' : 'NEEDS WORK'} (${result.critique.attempts} attempt(s))`,
                    `Publish: ${publishStatus}`,
                    `Log: ${result.logPath}`,
                    '',
                    'METADATA:',
                    `Title: ${result.metadata.title}`,
                    `Description: ${result.metadata.description}`,
                    `Hashtags: ${result.metadata.hashtags.join(' ')}`,
                ];

                return textResponse(lines.join('\n'));
            } catch (e: any) {
                return errorResponse(`Onetake failed: ${e?.message ?? e}`);
            }
        },
    );
}