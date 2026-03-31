#!/usr/bin/env node
/**
 * MCP Server for Automated Video Generator (Advanced Refactor)
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
import { sanitizeOutputId } from './pipeline-workspace';

// Import tool modules
import { readInputScripts, writeInputScript, deleteInputScript, validateScriptFormat, videoScriptSchema } from './mcp-tools-input';
import { listOutputVideos, readOutputFile, deleteOutput } from './mcp-tools-output';
import { readEnvConfig, updateEnvConfig, getSystemInfo, healthCheck } from './mcp-tools-env';
import { runPipelineCommand } from './mcp-tools-pipeline';

// Import resource and prompt registration
import { registerResources } from './mcp-resources';
import { registerPrompts } from './mcp-prompts';

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
    version: '1.1.0',
});

// Register Resources and Prompts
registerResources(server);
registerPrompts(server);

// ══════════════════════════════════════════════════════════════════
// TOOLS: INPUT DIRECTORY (Direct R/W)
// ══════════════════════════════════════════════════════════════════

server.registerTool(
  'write_input_script',
  {
    title: 'Write Input Script',
    description: 'Write or update a script in input/input-scripts.json',
    inputSchema: videoScriptSchema as any,
  },
  async (args: any) => {
    const scripts = await writeInputScript(args);
    return {
      content: [{ type: 'text' as const, text: `✅ Script "${args.id}" saved. Total scripts: ${scripts.length}` }],
    };
  }
);

server.registerTool(
  'read_input_script',
  {
    title: 'Read Input Scripts',
    description: 'Read all scripts from input/input-scripts.json',
    inputSchema: z.object({}) as any,
  },
  async () => {
    const scripts = await readInputScripts();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(scripts, null, 2) }],
    };
  }
);

server.registerTool(
  'delete_input_script',
  {
    title: 'Delete Input Script',
    description: 'Delete a script from input/input-scripts.json by its ID',
    inputSchema: z.object({ id: z.string() }) as any,
  },
  async ({ id }: any) => {
    await deleteInputScript(id);
    return {
      content: [{ type: 'text' as const, text: `✅ Script "${id}" deleted.` }],
    };
  }
);

server.registerTool(
  'validate_input_script',
  {
    title: 'Validate Script Format',
    description: 'Validate a script format before saving',
    inputSchema: videoScriptSchema as any,
  },
  async (args: any) => {
    const result = validateScriptFormat(args);
    return {
      content: [{ type: 'text' as const, text: result.success ? '✅ Valid script format.' : `❌ Invalid format: ${JSON.stringify(result.error)}` }],
    };
  }
);

// ══════════════════════════════════════════════════════════════════
// TOOLS: OUTPUT DIRECTORY (Read/Delete)
// ══════════════════════════════════════════════════════════════════

server.registerTool(
  'list_output_videos',
  {
    title: 'List Output Videos',
    description: 'List all completed videos in the output directory',
    inputSchema: z.object({}) as any,
  },
  async () => {
    const videos = await listOutputVideos();
    return {
      content: [{ type: 'text' as const, text: videos.length > 0 ? videos.join('\n') : 'No videos found.' }],
    };
  }
);

server.registerTool(
  'read_output_file',
  {
    title: 'Read Output File',
    description: 'Read a specific file from a video output directory (e.g., scene-data.json)',
    inputSchema: z.object({ videoId: z.string(), filename: z.string().optional() }) as any,
  },
  async ({ videoId, filename }: any) => {
    try {
      const data = await readOutputFile(videoId, filename);
      return {
        content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
      };
    } catch (e: any) {
      return { content: [{ type: 'text' as const, text: `❌ Error: ${e.message}` }], isError: true };
    }
  }
);

server.registerTool(
  'delete_output',
  {
    title: 'Delete Output',
    description: 'Delete an entire video output directory',
    inputSchema: z.object({ videoId: z.string() }) as any,
  },
  async ({ videoId }: any) => {
    try {
      await deleteOutput(videoId);
      return { content: [{ type: 'text' as const, text: `✅ Deleted output directory for "${videoId}".` }] };
    } catch (e: any) {
      return { content: [{ type: 'text' as const, text: `❌ Error: ${e.message}` }], isError: true };
    }
  }
);

// ══════════════════════════════════════════════════════════════════
// TOOLS: ASSETS (Public/Input Assets)
// ══════════════════════════════════════════════════════════════════

server.registerTool(
  'upload_asset',
  {
    title: 'Upload Asset',
    description: 'Upload a base64 encoded file to input/input-assests/',
    inputSchema: z.object({ filename: z.string(), base64Data: z.string() }) as any,
  },
  async ({ filename, base64Data }: any) => {
    const assetsDir = resolveProjectPath('input', 'input-assests');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    
    const filePath = path.join(assetsDir, filename);
    const buffer = Buffer.from(base64Data, 'base64');
    
    if (buffer.length > 50 * 1024 * 1024) {
      return { content: [{ type: 'text' as const, text: '❌ Error: File size exceeds 50MB limit.' }], isError: true };
    }
    
    fs.writeFileSync(filePath, buffer);
    return { content: [{ type: 'text' as const, text: `✅ Asset "${filename}" uploaded successfully (${(buffer.length/1024/1024).toFixed(2)} MB).` }] };
  }
);

server.registerTool(
  'delete_asset',
  {
    title: 'Delete Asset',
    description: 'Delete a file from input/input-assests/',
    inputSchema: z.object({ filename: z.string() }) as any,
  },
  async ({ filename }: any) => {
    const assetPath = resolveProjectPath('input', 'input-assests', filename);
    if (!fs.existsSync(assetPath)) {
      return { content: [{ type: 'text' as const, text: `❌ Error: Asset "${filename}" not found.` }], isError: true };
    }
    fs.unlinkSync(assetPath);
    return { content: [{ type: 'text' as const, text: `✅ Asset "${filename}" deleted.` }] };
  }
);

// ══════════════════════════════════════════════════════════════════
// TOOLS: PIPELINE (Existing + Command Exec)
// ══════════════════════════════════════════════════════════════════

const generateVideoInputSchema = z.object({
  id: z.string().optional().describe('Optional stable output ID / folder name to use inside output/.'),
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
    const { id, title, script, orientation, voice, showText, defaultVideo } = args;

    // Create a unique Job ID
    const jobId = `job_${Date.now()}_${title.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10)}`;
    const sanitizedTitle = sanitizeOutputId(
      title
        .replace(/\s+/g, '_')
        .substring(0, 50)
    );
    const outputId = sanitizeOutputId(id || sanitizedTitle);

    // Initialize job state
    jobStore.set(jobId, {
      title,
      publicId: outputId,
      status: 'pending',
      progress: 0,
      message: 'Queued for processing...',
    });

    // Launch background task (DO NOT AWAIT)
    (async () => {
      try {
        const { generateVideo, renderVideo } = await loadVideoPipeline();
        const outputDir = resolveProjectPath('output', outputId);

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
          publicId: outputId,
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
            `📦 **Output ID:** \`${outputId}\``,
            `⏳ **Status:** Processing in background`,
            ``,
            `Please wait about 30 seconds and then use \`get_video_status(jobId: "${jobId}")\` to check progress. Video rendering can take several minutes.`,
          ].join('\n'),
        },
      ],
    };
  }
);

server.registerTool(
  'get_video_status',
  {
    title: 'Get Video Status',
    description: 'Check the current progress and status of a video generation job.',
    inputSchema: z.object({ jobId: z.string() }) as any,
  },
  async ({ jobId }: any) => {
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

    if (job.publicId) {
      lines.push(`📦 **Output ID:** \`${job.publicId}\``);
    }

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

server.registerTool(
  'run_pipeline_command',
  {
    title: 'Run Pipeline Command',
    description: 'Execute whitelisted npm scripts (generate, resume, segment, etc.)',
    inputSchema: z.object({ command: z.string(), args: z.array(z.string()).optional() }) as any,
  },
  async ({ command, args }: any) => {
    try {
      const result = await runPipelineCommand(command, args);
      return {
        content: [{ type: 'text' as const, text: `✅ Command execution started. Job ID: ${result.jobId}\nCommand: ${result.command}` }],
      };
    } catch (e: any) {
      return { content: [{ type: 'text' as const, text: `❌ Error: ${e.message}` }], isError: true };
    }
  }
);

// ══════════════════════════════════════════════════════════════════
// TOOLS: SYSTEM & ENVIRONMENT
// ══════════════════════════════════════════════════════════════════

server.registerTool(
  'read_env_config',
  {
    title: 'Read Env Config',
    description: 'Read the current .env configuration (masked by default)',
    inputSchema: z.object({ showSecrets: z.boolean().default(false) }) as any,
  },
  async ({ showSecrets }: any) => {
    const config = await readEnvConfig(showSecrets);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(config, null, 2) }],
    };
  }
);

server.registerTool(
  'update_env_config',
  {
    title: 'Update Env Config',
    description: 'Update a specific variable in the .env file',
    inputSchema: z.object({ key: z.string(), value: z.string() }) as any,
  },
  async ({ key, value }: any) => {
    await updateEnvConfig(key, value);
    return {
      content: [{ type: 'text' as const, text: `✅ Updated ${key} in .env file.` }],
    };
  }
);

server.registerTool(
  'get_system_info',
  {
    title: 'Get System Info',
    description: 'Get project system information (Node, npm, ffmpeg, platform)',
    inputSchema: z.object({}) as any,
  },
  async () => {
    const info = await getSystemInfo();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(info, null, 2) }],
    };
  }
);

server.registerTool(
  'health_check',
  {
    title: 'Health Check',
    description: 'Verify system dependencies and directory state',
    inputSchema: z.object({}) as any,
  },
  async () => {
    const checks = await healthCheck();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(checks, null, 2) }],
    };
  }
);

server.registerTool(
  'get_workspace_paths',
  {
    title: 'Get Workspace Paths',
    description: 'Return the absolute project paths Claude should use for input, output, public, and local asset folders.',
    inputSchema: z.object({}) as any,
  },
  async () => {
    const paths = {
      projectRoot,
      inputDir: resolveProjectPath('input'),
      inputScriptsFile: resolveProjectPath('input', 'input-scripts.json'),
      inputAssetsDir: resolveProjectPath('input', 'input-assests'),
      outputDir: resolveProjectPath('output'),
      publicDir: resolveProjectPath('public'),
      publicJobsDir: resolveProjectPath('public', 'jobs'),
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(paths, null, 2) }],
    };
  }
);

server.registerTool(
  'list_public_files',
  {
    title: 'List Public Files',
    description: 'List files under the public directory or a public subdirectory such as jobs, videos, audio, or visuals.',
    inputSchema: z.object({ subdir: z.string().optional() }) as any,
  },
  async ({ subdir }: any) => {
    const normalizedSubdir = typeof subdir === 'string' ? subdir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
    if (normalizedSubdir.includes('..')) {
      return {
        content: [{ type: 'text' as const, text: '❌ Error: subdir cannot contain "..".' }],
        isError: true,
      };
    }

    const targetDir = normalizedSubdir
      ? resolveProjectPath('public', ...normalizedSubdir.split('/'))
      : resolveProjectPath('public');

    if (!fs.existsSync(targetDir)) {
      return {
        content: [{ type: 'text' as const, text: `❌ Error: Directory not found: ${targetDir}` }],
        isError: true,
      };
    }

    const scanDir = (dir: string, relativeDir = ''): Record<string, unknown> => {
      const entries = fs.readdirSync(dir).sort((left, right) => left.localeCompare(right));
      const result: Record<string, unknown> = {};

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stats = fs.statSync(fullPath);
        const relativePath = relativeDir ? `${relativeDir}/${entry}` : entry;

        if (stats.isDirectory()) {
          result[entry] = scanDir(fullPath, relativePath);
        } else {
          result[entry] = {
            relativePath,
            sizeBytes: stats.size,
          };
        }
      }

      return result;
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(scanDir(targetDir), null, 2) }],
    };
  }
);

// ══════════════════════════════════════════════════════════════════
// TOOLS: MISC
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

server.tool(
    'list_local_assets',
    'List all local media files available in the input/input-assests/ directory.',
    async () => {
        const assetsDir = resolveProjectPath('input', 'input-assests');
        if (!fs.existsSync(assetsDir)) {
            return { content: [{ type: 'text' as const, text: `📁 Assets directory not found.` }] };
        }

        const files = fs.readdirSync(assetsDir).filter((f: string) => {
            const ext = path.extname(f).toLowerCase();
            return ['.mp4', '.mov', '.webm', '.m4v', '.jpg', '.jpeg', '.png', '.webp'].includes(ext);
        });

        if (files.length === 0) {
            return { content: [{ type: 'text' as const, text: `📁 No media files found.` }] };
        }

        const fileList = files.map((f: string) => {
            const stats = fs.statSync(path.join(assetsDir, f));
            const size = (stats.size / (1024 * 1024)).toFixed(2);
            return `| ${f} | ${size} MB |`;
        }).join('\n');

        return {
            content: [{ type: 'text' as const, text: `## 📁 Local Assets\n\n| Filename | Size |\n| :--- | :--- |\n${fileList}` }],
        };
    }
);

// ══════════════════════════════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════════════════════════════
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`🎬 [MCP] Automated Video Generator server (v1.1.0) is running from ${projectRoot}.\n`);
}

main().catch((error) => {
    process.stderr.write(`❌ [MCP] Fatal error: ${error.message}\n`);
    process.exit(1);
});
