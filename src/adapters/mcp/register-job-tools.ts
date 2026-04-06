import * as fs from 'fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { pipelineAppService } from '../../application/pipeline-app.service';
import { assertSafeMutationAllowed } from '../../shared/capabilities';
import { runPipelineCommand } from './pipeline-commands';
import { pipelineJobRequestSchema } from '../../shared/contracts/job.contract';
import { errorResponse, textResponse } from './responses';

export function registerJobTools(server: McpServer) {
    server.registerTool(
        'generate_video',
        {
            title: 'Generate Video',
            description: 'Starts a background job to generate a professional video.',
            inputSchema: pipelineJobRequestSchema.partial({ language: true }).extend({
                id: z.string().optional().describe('Optional stable output ID / folder name to use inside output/.'),
                publicId: z.string().optional(),
                skipReview: z.boolean().default(true),
            }) as any,
        },
        async (args: any) => {
            const accepted = await pipelineAppService.createJob({
                ...args,
                publicId: args.publicId || args.id,
                skipReview: args.skipReview !== false,
            });

            return textResponse([
                'Video generation job started.',
                '',
                `Job ID: ${accepted.jobId}`,
                `Output ID: ${accepted.publicId}`,
                'Status: Processing in background',
                '',
                `Use get_video_status(jobId: "${accepted.jobId}") to check progress.`,
            ].join('\n'));
        },
    );

    server.registerTool(
        'get_video_status',
        {
            title: 'Get Video Status',
            description: 'Check the current progress and status of a video generation job.',
            inputSchema: z.object({ jobId: z.string() }) as any,
        },
        async ({ jobId }: any) => {
            const job = pipelineAppService.getJob(jobId);
            if (!job) {
                return errorResponse(`Job "${jobId}" not found.`);
            }

            const lines = [
                `Status: ${job.status.toUpperCase()}`,
                `Progress: ${job.progress}%`,
                `Message: ${job.message}`,
            ];

            if (job.publicId) {
                lines.push(`Output ID: ${job.publicId}`);
            }
            if (job.outputPath) {
                lines.push(`Output Path: ${job.outputPath}`);
                if (fs.existsSync(job.outputPath)) {
                    const fileSize = (fs.statSync(job.outputPath).size / (1024 * 1024)).toFixed(2);
                    lines.push(`File Size: ${fileSize} MB`);
                }
            }
            if (job.error) {
                lines.push(`Error: ${job.error}`);
            }

            return textResponse(lines.join('\n'));
        },
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
                assertSafeMutationAllowed('mcp', 'run pipeline commands');
                const result = await runPipelineCommand(command, args);
                return textResponse(`Command execution started. Job ID: ${result.jobId}\nCommand: ${result.command}`);
            } catch (error: any) {
                return errorResponse(error.message);
            }
        },
    );

    server.tool(
        'list_jobs',
        'List all recent video generation jobs and their current status.',
        async () => {
            const jobs = pipelineAppService.listJobs().sort((a, b) => b.startTime - a.startTime);
            if (jobs.length === 0) {
                return textResponse('No jobs found.');
            }

            const tableRows = jobs.map((job) => `| ${job.id} | ${job.status} | ${job.progress}% | ${new Date(job.startTime).toLocaleTimeString()} |`);
            return textResponse(`| Job ID | Status | Progress | Started |\n| :--- | :--- | :--- | :--- |\n${tableRows.join('\n')}`);
        },
    );
}
