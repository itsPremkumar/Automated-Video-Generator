import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { pipelineAppService } from '../../application/pipeline-app.service';
import { assertSafeMutationAllowed } from '../../shared/capabilities';
import { getSystemInfo, readEnvConfig, updateEnvConfig } from './env-tools';
import { projectRoot, resolveProjectPath } from '../../shared/runtime/paths';
import { errorResponse, textResponse } from './responses';

export function registerAdminTools(server: McpServer) {
    server.registerTool(
        'read_env_config',
        {
            title: 'Read Env Config',
            description: 'Read the current .env configuration (masked by default)',
            inputSchema: z.object({ showSecrets: z.boolean().default(false) }) as any,
        },
        async ({ showSecrets }: any) => textResponse(JSON.stringify(await readEnvConfig(showSecrets), null, 2)),
    );

    server.registerTool(
        'update_env_config',
        {
            title: 'Update Env Config',
            description: 'Update a specific variable in the .env file',
            inputSchema: z.object({ key: z.string(), value: z.string() }) as any,
        },
        async ({ key, value }: any) => {
            assertSafeMutationAllowed('mcp', 'update environment configuration');
            await updateEnvConfig(key, value);
            return textResponse(`Updated ${key} in .env file.`);
        },
    );

    server.registerTool(
        'get_system_info',
        {
            title: 'Get System Info',
            description: 'Get project system information',
            inputSchema: z.object({}) as any,
        },
        async () => textResponse(JSON.stringify(await getSystemInfo(), null, 2)),
    );

    server.registerTool(
        'health_check',
        {
            title: 'Health Check',
            description: 'Verify system dependencies and directory state',
            inputSchema: z.object({}) as any,
        },
        async () => textResponse(JSON.stringify(pipelineAppService.getDiagnostics(), null, 2)),
    );

    server.registerTool(
        'get_workspace_paths',
        {
            title: 'Get Workspace Paths',
            description: 'Return the absolute project paths Claude should use.',
            inputSchema: z.object({}) as any,
        },
        async () => textResponse(JSON.stringify({
            projectRoot,
            inputDir: resolveProjectPath('input'),
            inputScriptsFile: resolveProjectPath('input', 'input-scripts.json'),
            inputAssetsDir: resolveProjectPath('input', 'input-assests'),
            outputDir: resolveProjectPath('output'),
            publicDir: resolveProjectPath('public'),
            publicJobsDir: resolveProjectPath('public', 'jobs'),
        }, null, 2)),
    );

    server.registerTool(
        'list_public_files',
        {
            title: 'List Public Files',
            description: 'List files under the public directory or a public subdirectory.',
            inputSchema: z.object({ subdir: z.string().optional() }) as any,
        },
        async ({ subdir }: any) => {
            const normalizedSubdir = typeof subdir === 'string' ? subdir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
            if (normalizedSubdir.includes('..')) {
                return errorResponse('subdir cannot contain "..".');
            }

            const targetDir = normalizedSubdir
                ? resolveProjectPath('public', ...normalizedSubdir.split('/'))
                : resolveProjectPath('public');

            if (!fs.existsSync(targetDir)) {
                return errorResponse(`Directory not found: ${targetDir}`);
            }

            const scanDir = (dir: string, relativeDir = ''): Record<string, unknown> => {
                const entries = fs.readdirSync(dir).sort((left, right) => left.localeCompare(right));
                const result: Record<string, unknown> = {};

                for (const entry of entries) {
                    const fullPath = path.join(dir, entry);
                    const stats = fs.statSync(fullPath);
                    const relativePath = relativeDir ? `${relativeDir}/${entry}` : entry;

                    result[entry] = stats.isDirectory()
                        ? scanDir(fullPath, relativePath)
                        : { relativePath, sizeBytes: stats.size };
                }

                return result;
            };

            return textResponse(JSON.stringify(scanDir(targetDir), null, 2));
        },
    );

    server.tool(
        'list_voices',
        'List all available AI voice options for the video generator TTS engine.',
        async () => textResponse(JSON.stringify([
            { id: 'en-US-JennyNeural', gender: 'Female', style: 'Warm, Professional', region: 'US' },
            { id: 'en-US-AriaNeural', gender: 'Female', style: 'Friendly, Helpful', region: 'US' },
            { id: 'en-US-SaraNeural', gender: 'Female', style: 'Cheerful, Bright', region: 'US' },
            { id: 'en-GB-SoniaNeural', gender: 'Female', style: 'British Accent', region: 'UK' },
            { id: 'en-US-GuyNeural', gender: 'Male', style: 'Deep, Authoritative', region: 'US' },
            { id: 'en-US-ChristopherNeural', gender: 'Male', style: 'Calm, Steady', region: 'US' },
            { id: 'en-GB-RyanNeural', gender: 'Male', style: 'British Accent', region: 'UK' },
            { id: 'en-IN-PrabhatNeural', gender: 'Male', style: 'Indian Accent', region: 'IN' },
        ], null, 2)),
    );

    server.tool(
        'list_local_assets',
        'List all local media files available in the input/input-assests/ directory.',
        async () => {
            const assetsDir = resolveProjectPath('input', 'input-assests');
            if (!fs.existsSync(assetsDir)) {
                return textResponse('Assets directory not found.');
            }

            const files = fs.readdirSync(assetsDir).filter((file) => {
                const ext = path.extname(file).toLowerCase();
                return ['.mp4', '.mov', '.webm', '.m4v', '.jpg', '.jpeg', '.png', '.webp'].includes(ext);
            });

            return textResponse(files.length > 0 ? files.join('\n') : 'No media files found.');
        },
    );
}
