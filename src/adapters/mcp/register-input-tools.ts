import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { deleteInputScript, readInputScripts, validateScriptFormat, videoScriptSchema, writeInputScript } from './input-store';
import { assertSafeMutationAllowed } from '../../shared/capabilities';
import { resolveProjectPath } from '../../shared/runtime/paths';
import { errorResponse, textResponse } from './responses';

export function registerInputTools(server: McpServer) {
    server.registerTool(
        'write_input_script',
        {
            title: 'Write Input Script',
            description: 'Write or update a script in input/input-scripts.json',
            inputSchema: videoScriptSchema as any,
        },
        async (args: any) => {
            assertSafeMutationAllowed('mcp', 'write input scripts');
            const scripts = await writeInputScript(args);
            return textResponse(`Script "${args.id}" saved. Total scripts: ${scripts.length}`);
        },
    );

    server.registerTool(
        'read_input_script',
        {
            title: 'Read Input Scripts',
            description: 'Read all scripts from input/input-scripts.json',
            inputSchema: z.object({}) as any,
        },
        async () => textResponse(JSON.stringify(await readInputScripts(), null, 2)),
    );

    server.registerTool(
        'delete_input_script',
        {
            title: 'Delete Input Script',
            description: 'Delete a script from input/input-scripts.json by its ID',
            inputSchema: z.object({ id: z.string() }) as any,
        },
        async ({ id }: any) => {
            assertSafeMutationAllowed('mcp', 'delete input scripts');
            await deleteInputScript(id);
            return textResponse(`Script "${id}" deleted.`);
        },
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
            return result.success
                ? textResponse('Valid script format.')
                : errorResponse(`Invalid format: ${JSON.stringify(result.error)}`);
        },
    );

    server.registerTool(
        'upload_asset',
        {
            title: 'Upload Asset',
            description: 'Upload a base64 encoded file to input/input-assests/',
            inputSchema: z.object({ filename: z.string(), base64Data: z.string() }) as any,
        },
        async ({ filename, base64Data }: any) => {
            assertSafeMutationAllowed('mcp', 'upload local assets');
            const assetsDir = resolveProjectPath('input', 'input-assests');
            if (!fs.existsSync(assetsDir)) {
                fs.mkdirSync(assetsDir, { recursive: true });
            }

            const buffer = Buffer.from(base64Data, 'base64');
            if (buffer.length > 50 * 1024 * 1024) {
                return errorResponse('File size exceeds 50MB limit.');
            }

            fs.writeFileSync(path.join(assetsDir, filename), buffer);
            return textResponse(`Asset "${filename}" uploaded successfully (${(buffer.length / 1024 / 1024).toFixed(2)} MB).`);
        },
    );

    server.registerTool(
        'delete_asset',
        {
            title: 'Delete Asset',
            description: 'Delete a file from input/input-assests/',
            inputSchema: z.object({ filename: z.string() }) as any,
        },
        async ({ filename }: any) => {
            assertSafeMutationAllowed('mcp', 'delete local assets');
            const assetPath = resolveProjectPath('input', 'input-assests', filename);
            if (!fs.existsSync(assetPath)) {
                return errorResponse(`Asset "${filename}" not found.`);
            }

            fs.unlinkSync(assetPath);
            return textResponse(`Asset "${filename}" deleted.`);
        },
    );
}
