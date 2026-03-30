#!/usr/bin/env node
/**
 * MCP Server for Automated Video Generator
 * 
 * This server exposes the video generation pipeline as a tool
 * that Claude Desktop, Claude Code, and other MCP clients can call.
 * 
 * Protocol: Model Context Protocol (MCP) via stdio transport
 * Docs: https://modelcontextprotocol.io
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import the core generation pipeline
import { generateVideo } from './video-generator';
import { renderVideo } from './render';

// ══════════════════════════════════════════════════════════════════
// MCP SERVER INITIALIZATION
// ══════════════════════════════════════════════════════════════════

const server = new McpServer({
    name: 'automated-video-generator',
    version: '1.0.0',
});

// ══════════════════════════════════════════════════════════════════
// TOOL: generate_video
// ══════════════════════════════════════════════════════════════════

const generateVideoInputSchema = z.object({
    title: z.string().describe('The title of the video. Used for the output filename and on-screen branding.'),
    script: z.string().describe('The narrative script content. Use [Visual: search query] tags to direct specific visuals for each scene.'),
    orientation: z.enum(['portrait', 'landscape']).default('portrait').describe('Video orientation. portrait=9:16, landscape=16:9.'),
    voice: z.string().default('en-US-JennyNeural').describe('Edge-TTS voice ID.'),
    showText: z.boolean().default(true).describe('Show on-screen subtitles/captions.'),
    defaultVideo: z.string().default('default.mp4').describe('Fallback video filename in input/input-assests/.'),
});

server.registerTool(
    'generate_video',
    {
        title: 'Generate Video',
        description: 'Generate a professional video from a text script. The script can include [Visual: ...] tags for directing stock footage or local assets. Returns the path to the final rendered .mp4 file.',
        inputSchema: generateVideoInputSchema as any,
    },
    async (args: z.infer<typeof generateVideoInputSchema>) => {
        const { title, script, orientation, voice, showText, defaultVideo } = args;
        try {
            // Create a sanitized output directory name
            const sanitizedTitle = title
                .replace(/[^a-zA-Z0-9\s-_]/g, '')
                .replace(/\s+/g, '_')
                .substring(0, 50);
            const outputDir = path.join(process.cwd(), 'output', sanitizedTitle);

            // Ensure output directory exists
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // ── Phase 1: Generate scene data, fetch visuals, create voiceovers ──
            const result = await generateVideo(script, outputDir, {
                orientation,
                voice,
                title,
                showText,
                defaultVideo,
                onProgress: (step: string, percent: number, message: string) => {
                    process.stderr.write(`[MCP] ${step}: ${percent}% - ${message}\n`);
                },
            });

            if (!result.success) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `❌ Video generation failed: ${result.error || 'Unknown error'}`,
                        },
                    ],
                };
            }

            // ── Phase 2: Render the final video using Remotion ──
            await renderVideo(outputDir);

            // Find the final output video
            const outputFiles = fs.readdirSync(outputDir).filter((f: string) => f.endsWith('.mp4') && !f.startsWith('segment'));
            const finalVideo = outputFiles.length > 0
                ? path.join(outputDir, outputFiles[0])
                : path.join(outputDir, `${title}.mp4`);

            const fileExists = fs.existsSync(finalVideo);
            const fileSize = fileExists ? (fs.statSync(finalVideo).size / (1024 * 1024)).toFixed(2) : '0';

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: [
                            `✅ Video generated successfully!`,
                            ``,
                            `📁 **Output Path:** \`${finalVideo}\``,
                            `📊 **File Size:** ${fileSize} MB`,
                            `🎬 **Scenes:** ${result.metadata?.scenes || 'N/A'}`,
                            `⏱️ **Duration:** ${result.metadata?.duration || 'N/A'}s`,
                            `🖼️ **Visuals Found:** ${result.metadata?.visualsFound || 'N/A'}`,
                            `📐 **Orientation:** ${orientation}`,
                            `🗣️ **Voice:** ${voice}`,
                            `📝 **Subtitles:** ${showText ? 'Enabled' : 'Disabled'}`,
                        ].join('\n'),
                    },
                ],
            };
        } catch (error: any) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `❌ Error during video generation: ${error.message}\n\nStack: ${error.stack}`,
                    },
                ],
            };
        }
    }
);

// ══════════════════════════════════════════════════════════════════
// TOOL: list_voices
// ══════════════════════════════════════════════════════════════════
server.tool(
    'list_voices',
    'List all available AI voice options for the video generator TTS engine.',
    async () => {
        const voices = [
            { id: 'en-US-JennyNeural', gender: 'Female', style: 'Warm, Professional', region: 'US' },
            { id: 'en-US-AriaNeural', gender: 'Female', style: 'Friendly, Helpful', region: 'US' },
            { id: 'en-US-SaraNeural', gender: 'Female', style: 'Cheerful, Bright', region: 'US' },
            { id: 'en-GB-SoniaNeural', gender: 'Female', style: 'British Accent', region: 'UK' },
            { id: 'en-US-GuyNeural', gender: 'Male', style: 'Deep, Authoritative', region: 'US' },
            { id: 'en-US-ChristopherNeural', gender: 'Male', style: 'Calm, Steady', region: 'US' },
            { id: 'en-GB-RyanNeural', gender: 'Male', style: 'British Accent', region: 'UK' },
            { id: 'en-IN-PrabhatNeural', gender: 'Male', style: 'Indian Accent', region: 'IN' },
        ];

        const table = voices.map(v => `| ${v.id} | ${v.gender} | ${v.style} | ${v.region} |`).join('\n');
        return {
            content: [
                {
                    type: 'text' as const,
                    text: `## 🗣️ Available AI Voices\n\n| Voice ID | Gender | Style | Region |\n| :--- | :--- | :--- | :--- |\n${table}`,
                },
            ],
        };
    }
);

// ══════════════════════════════════════════════════════════════════
// TOOL: list_local_assets
// ══════════════════════════════════════════════════════════════════
server.tool(
    'list_local_assets',
    'List all local media files available in the input/input-assests/ directory that can be referenced in scripts using [Visual: filename] tags.',
    async () => {
        const assetsDir = path.join(process.cwd(), 'input', 'input-assests');
        if (!fs.existsSync(assetsDir)) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `📁 Assets directory not found at: ${assetsDir}\n\nCreate the directory and add your media files to use local assets.`,
                    },
                ],
            };
        }

        const files = fs.readdirSync(assetsDir).filter((f: string) => {
            const ext = path.extname(f).toLowerCase();
            return ['.mp4', '.mov', '.webm', '.m4v', '.jpg', '.jpeg', '.png', '.webp'].includes(ext);
        });

        if (files.length === 0) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `📁 No media files found in: ${assetsDir}\n\nSupported formats: .mp4, .mov, .webm, .m4v, .jpg, .jpeg, .png, .webp`,
                    },
                ],
            };
        }

        const fileList = files.map((f: string) => {
            const stats = fs.statSync(path.join(assetsDir, f));
            const size = (stats.size / (1024 * 1024)).toFixed(2);
            const ext = path.extname(f).toLowerCase();
            const type = ['.mp4', '.mov', '.webm', '.m4v'].includes(ext) ? '🎥 Video' : '🖼️ Image';
            return `| ${f} | ${type} | ${size} MB |`;
        }).join('\n');

        return {
            content: [
                {
                    type: 'text' as const,
                    text: `## 📁 Local Assets (${files.length} files)\n\nUse these filenames inside \`[Visual: filename]\` tags in your script.\n\n| Filename | Type | Size |\n| :--- | :--- | :--- |\n${fileList}`,
                },
            ],
        };
    }
);

// ══════════════════════════════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════════════════════════════
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write('🎬 [MCP] Automated Video Generator server is running.\n');
}

main().catch((error) => {
    process.stderr.write(`❌ [MCP] Fatal error: ${error.message}\n`);
    process.exit(1);
});
