import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { assertSafeMutationAllowed } from '../../shared/capabilities';
import { deleteOutput, listOutputVideos, readOutputFile } from './output-store';
import { errorResponse, textResponse } from './responses';

export function registerOutputTools(server: McpServer) {
    server.registerTool(
        'list_output_videos',
        {
            title: 'List Output Videos',
            description: 'List all completed videos in the output directory',
            inputSchema: z.object({}) as any,
        },
        async () => {
            const videos = await listOutputVideos();
            return textResponse(videos.length > 0 ? videos.join('\n') : 'No videos found.');
        },
    );

    server.registerTool(
        'read_output_file',
        {
            title: 'Read Output File',
            description: 'Read a specific file from a video output directory',
            inputSchema: z.object({ videoId: z.string(), filename: z.string().optional() }) as any,
        },
        async ({ videoId, filename }: any) => {
            try {
                const data = await readOutputFile(videoId, filename);
                return textResponse(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
            } catch (error: any) {
                return errorResponse(error.message);
            }
        },
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
                assertSafeMutationAllowed('mcp', 'delete output directories');
                await deleteOutput(videoId);
                return textResponse(`Deleted output directory for "${videoId}".`);
            } catch (error: any) {
                return errorResponse(error.message);
            }
        },
    );
}
