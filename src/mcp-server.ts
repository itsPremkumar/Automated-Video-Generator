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
import { ensureProjectRootCwd, projectRoot, resolveProjectPath, jobStore } from './runtime';

process.env.AUTOMATED_VIDEO_GENERATOR_MCP = '1';
ensureProjectRootCwd();
dotenv.config({ path: resolveProjectPath('.env') });

type VideoPipeline = {
    generateVideo: typeof import('./video-generator').generateVideo;
    renderVideo: typeof import('./render').renderVideo;
};

let videoPipelinePromise: Promise<VideoPipeline> | null = null;

async function loadVideoPipeline(): Promise<VideoPipeline> {
    if (!videoPipelinePromise) {
        videoPipelinePromise = Promise.all([
            import('./video-generator.js'),
            import('./render.js'),
        ]).then(([videoGeneratorModule, renderModule]) => ({
            generateVideo: videoGeneratorModule.generateVideo,
            renderVideo: renderModule.renderVideo,
        }));
    }

    return videoPipelinePromise;
}

// ══════════════════════════════════════════════════════════════════
// MCP SERVER INITIALIZATION
// ══════════════════════════════════════════════════════════════════

const server = new McpServer({
    name: 'automated-video-generator',
    version: '1.0.0',
});

// ══════════════════════════════════════════════════════════════════
// TOOL: generate_video (ASYNC)
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
    description: 'Starts a background job to generate a professional video.',
    inputSchema: generateVideoInputSchema as any,
  },
  async (args: any) => {
    const { title, script, orientation, voice, showText, defaultVideo } = args;

    // Create a unique Job ID
    const jobId = `job_${Date.now()}_${title.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10)}`;

    // Initialize job state
    jobStore.set(jobId, {
      status: 'pending',
      progress: 0,
      message: 'Queued for processing...',
    });

    // Launch background task (DO NOT AWAIT)
    (async () => {
      try {
        const { generateVideo, renderVideo } = await loadVideoPipeline();

        // Create a sanitized output directory name
        const sanitizedTitle = title
          .replace(/[^a-zA-Z0-9\s-_]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 50);
        const outputDir = resolveProjectPath('output', sanitizedTitle);

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        jobStore.set(jobId, { status: 'processing', progress: 5, message: 'Generating assets (Audio/Visuals)...' });

        // ── Phase 1: Generate scene data, fetch visuals, create voiceovers ──
        const result = await generateVideo(script, outputDir, {
          orientation,
          voice,
          title,
          showText,
          defaultVideo,
          onProgress: (step: string, percent: number, message: string) => {
            // Map 0-100% of generation to 5-40% of overall job
            const totalProgress = 5 + Math.round((percent / 100) * 35);
            jobStore.set(jobId, { progress: totalProgress, message: `${step}: ${message}` });
          },
        });

        if (!result.success) {
          jobStore.set(jobId, { status: 'failed', error: result.error || 'Generation failed' });
          return;
        }

        jobStore.set(jobId, { status: 'processing', progress: 41, message: 'Rendering final video (Remotion)...' });

        // ── Phase 2: Render the final video using Remotion ──
        await renderVideo(outputDir);

        // Find the final output video
        const outputFiles = fs.readdirSync(outputDir).filter((f: string) => f.endsWith('.mp4') && !f.startsWith('segment'));
        const finalVideo = outputFiles.length > 0
          ? path.join(outputDir, outputFiles[0])
          : path.join(outputDir, `${title}.mp4`);

        jobStore.set(jobId, {
          status: 'completed',
          progress: 100,
          message: 'Video rendering complete!',
          outputPath: finalVideo,
          endTime: Date.now(),
        });

      } catch (error: any) {
        jobStore.set(jobId, {
          status: 'failed',
          error: error.message,
          message: 'A fatal error occurred during processing.',
        });
      }
    })();

    return {
      content: [
        {
          type: 'text' as const,
          text: [
            `✅ Video generation job started!`,
            ``,
            `🆔 **Job ID:** \`${jobId}\``,
            `⏳ **Status:** Processing in background`,
            ``,
            `Please wait about 30 seconds and then use \`get_video_status(jobId: "${jobId}")\` to check progress. Video rendering can take several minutes.`,
          ].join('\n'),
        },
      ],
    };
  }
);

// ══════════════════════════════════════════════════════════════════
// TOOL: get_video_status
// ══════════════════════════════════════════════════════════════════

const getVideoStatusSchema = z.object({
  jobId: z.string().describe('The ID of the video generation job to check.'),
});

server.registerTool(
  'get_video_status',
  {
    title: 'Get Video Status',
    description: 'Check the current progress and status of a video generation job.',
    inputSchema: getVideoStatusSchema as any,
  },
  async (args: any) => {
    const { jobId } = args;
    const job = jobStore.get(jobId);

    if (!job) {
      return {
        content: [{ type: 'text' as const, text: `❌ Job \`${jobId}\` not found.` }],
        isError: true,
      };
    }

    let statusEmoji = '⏳';
    if (job.status === 'completed') statusEmoji = '✅';
    if (job.status === 'failed') statusEmoji = '❌';
    if (job.status === 'processing') statusEmoji = '⚙️';

    const lines = [
      `${statusEmoji} **Job Status:** ${job.status.toUpperCase()}`,
      `📊 **Progress:** ${job.progress}%`,
      `💬 **Message:** ${job.message}`,
    ];

    if (job.outputPath) {
      lines.push(``, `📁 **Output Path:** \`${job.outputPath}\``);

      if (fs.existsSync(job.outputPath)) {
        const fileSize = (fs.statSync(job.outputPath).size / (1024 * 1024)).toFixed(2);
        lines.push(`🎬 **File Size:** ${fileSize} MB`);
      }
    }

    if (job.error) {
      lines.push(``, `❌ **Error:** ${job.error}`);
    }

    return {
      content: [{ type: 'text' as const, text: lines.join('\n') }],
    };
  }
);

// ══════════════════════════════════════════════════════════════════
// TOOL: list_jobs
// ══════════════════════════════════════════════════════════════════

server.tool(
  'list_jobs',
  'List all recent video generation jobs and their current status.',
  async () => {
    const jobs = jobStore.all().sort((a, b) => b.startTime - a.startTime);

    if (jobs.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No jobs found.' }] };
    }

    const tableRows = jobs.map(j => {
      const status = j.status === 'completed' ? '✅' : j.status === 'failed' ? '❌' : '⏳';
      return `| ${j.id} | ${status} ${j.status} | ${j.progress}% | ${new Date(j.startTime).toLocaleTimeString()} |`;
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: `## 📋 Recent Video Jobs\n\n| Job ID | Status | Progress | Started |\n| :--- | :--- | :--- | :--- |\n${tableRows.join('\n')}`,
        },
      ],
    };
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
        const assetsDir = resolveProjectPath('input', 'input-assests');
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
    process.stderr.write(`🎬 [MCP] Automated Video Generator server is running from ${projectRoot}.\n`);
}

main().catch((error) => {
    process.stderr.write(`❌ [MCP] Fatal error: ${error.message}\n`);
    process.exit(1);
});
