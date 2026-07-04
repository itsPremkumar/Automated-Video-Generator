import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { freeVideoAppService } from '../../application/free-video-app.service';
import { textResponse } from './responses';

export function registerFreeVideoTools(server: McpServer) {
    server.registerTool(
        'search_free_video',
        {
            title: 'Search Free Video',
            description: 'Search for free CC-licensed videos from Wikimedia Commons and Internet Archive. No API key needed.',
            inputSchema: z.object({
                keyword: z.string().describe('Search keyword or phrase'),
                count: z.number().optional().describe('Maximum results (default: 5)'),
                source: z.enum(['all', 'wikimedia', 'archive']).optional().describe('Source to search (default: all)'),
                maxDuration: z.number().optional().describe('Maximum video duration in seconds'),
                minResolution: z.number().optional().describe('Minimum vertical resolution (e.g. 720)'),
                sortBy: z.enum(['relevance', 'newest', 'resolution']).optional().describe('Sort order'),
            }) as any,
        },
        async (args: any) => {
            const { keyword, count, source, maxDuration, minResolution, sortBy } = args;
            const results = await freeVideoAppService.search(keyword, { source, count, maxDuration, minResolution, sortBy });

            if (results.length === 0) {
                return textResponse('No free videos found for the given keyword.');
            }

            let output = `Found videos for "${keyword}":\n\n`;
            for (const sourceGroup of results) {
                output += `--- ${sourceGroup.source.toUpperCase()} (${sourceGroup.results.length} results) ---\n`;
                for (const r of sourceGroup.results) {
                    output += `\n  Title: ${r.title}`;
                    output += `\n  Creator: ${r.creator}`;
                    output += `\n  License: ${r.license}`;
                    output += `\n  Duration: ${r.durationSeconds ? r.durationSeconds + 's' : 'Unknown'}`;
                    output += `\n  Resolution: ${r.resolution || 'Unknown'}`;
                    output += `\n  Format: ${r.format}`;
                    output += `\n  URL: ${r.downloadUrl}`;
                    output += `\n  Source: ${r.sourcePageUrl}`;
                    output += `\n  Thumbnail: ${r.thumbnailUrl || 'N/A'}`;
                    output += '\n';
                }
            }
            output += '\nTo download a video, use the download_free_video tool with its URL.';

            return textResponse(output);
        },
    );

    server.registerTool(
        'download_free_video',
        {
            title: 'Download Free Video',
            description: 'Download a free CC-licensed video by URL to the project workspace for use in video generation.',
            inputSchema: z.object({
                url: z.string().describe('The download URL of the video'),
                title: z.string().describe('Title for the downloaded file'),
                creator: z.string().optional().describe('Creator name for attribution'),
                license: z.string().optional().describe('License type'),
                format: z.string().optional().describe('File format (mp4, webm, ogg)'),
            }) as any,
        },
        async (args: any) => {
            const { url, title, creator, license, format } = args;
            const result = await freeVideoAppService.download(url, title, creator || 'Unknown', license || 'CC', format || 'mp4');

            return textResponse(
                `Downloaded successfully!\n\n` +
                `Title: ${result.title}\n` +
                `Creator: ${result.creator}\n` +
                `License: ${result.license}\n` +
                `File: ${result.filename}\n` +
                `Size: ${(result.fileSizeBytes / 1024 / 1024).toFixed(2)} MB\n` +
                `Local Path: ${result.localPath}\n` +
                `Public URL: /${result.publicPath}\n\n` +
                `You can reference this video in your scene configuration.`
            );
        },
    );
}
