import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as fs from 'fs';
import * as path from 'path';
import { projectRoot, resolveProjectPath } from './runtime';
import { readInputScripts } from './mcp-tools-input';
import { listOutputVideos, readOutputFile } from './mcp-tools-output';
import { readEnvConfig } from './mcp-tools-env';

function buildTree(dir: string): Record<string, unknown> {
  if (!fs.existsSync(dir)) {
    return {};
  }

  const result: Record<string, unknown> = {};
  const entries = fs.readdirSync(dir).sort((left, right) => left.localeCompare(right));

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      result[entry] = buildTree(fullPath);
    } else {
      result[entry] = {
        sizeBytes: stats.size,
      };
    }
  }

  return result;
}

function listInputAssets(): Array<{ name: string; sizeBytes: number }> {
  const assetsDir = resolveProjectPath('input', 'input-assests');
  if (!fs.existsSync(assetsDir)) {
    return [];
  }

  return fs.readdirSync(assetsDir)
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const stats = fs.statSync(path.join(assetsDir, name));
      return {
        name,
        sizeBytes: stats.size,
      };
    });
}

export function registerResources(server: McpServer) {
  server.registerResource(
    'project-overview',
    'project://overview',
    {
      title: 'Project Overview',
      description: 'Absolute paths for the project root and the key input/output/public workflow folders.',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        text: JSON.stringify({
          projectRoot,
          inputDir: resolveProjectPath('input'),
          inputScriptsFile: resolveProjectPath('input', 'input-scripts.json'),
          inputAssetsDir: resolveProjectPath('input', 'input-assests'),
          outputDir: resolveProjectPath('output'),
          publicDir: resolveProjectPath('public'),
          publicJobsDir: resolveProjectPath('public', 'jobs'),
        }, null, 2),
        mimeType: 'application/json',
      } as any],
    } as any),
  );

  server.registerResource(
    'input-scripts',
    'input://scripts',
    {
      title: 'Current Input Scripts',
      description: 'Current contents of input/input-scripts.json.',
    },
    async (uri) => {
      const scripts = await readInputScripts();
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(scripts, null, 2),
          mimeType: 'application/json',
        } as any],
      } as any;
    },
  );

  server.registerResource(
    'input-assets',
    'input://assets',
    {
      title: 'Input Assets',
      description: 'Files available in input/input-assests/.',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        text: JSON.stringify(listInputAssets(), null, 2),
        mimeType: 'application/json',
      } as any],
    } as any),
  );

  server.registerResource(
    'input-format',
    'input://format',
    {
      title: 'Input Format Documentation',
      description: 'How to format video scripts for the generator.',
    },
    async (uri) => {
      const formatPath = resolveProjectPath('input', 'INPUT_FORMAT.md');
      const content = fs.existsSync(formatPath)
        ? fs.readFileSync(formatPath, 'utf-8')
        : 'Format documentation not found.';

      return {
        contents: [{
          uri: uri.href,
          text: content,
          mimeType: 'text/markdown',
        } as any],
      } as any;
    },
  );

  server.registerResource(
    'output-videos',
    'output://videos',
    {
      title: 'Generated Videos List',
      description: 'Current output folders under output/.',
    },
    async (uri) => {
      const videos = await listOutputVideos();
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(videos, null, 2),
          mimeType: 'application/json',
        } as any],
      } as any;
    },
  );

  server.registerResource(
    'output-video-detail',
    new ResourceTemplate('output://video/{id}', {
      list: async () => {
        const videos = await listOutputVideos();
        return {
          resources: videos.map((id) => ({
            uri: `output://video/${id}`,
            name: id,
            title: `Output ${id}`,
          })),
        };
      },
    }),
    {
      title: 'Video Detail',
      description: 'Scene data and file listing for a specific output folder.',
    },
    async (uri, { id }: any) => {
      try {
        const sceneData = await readOutputFile(id, 'scene-data.json');
        const files = await readOutputFile(id);
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({
              id,
              files,
              sceneData: JSON.parse(sceneData as string),
            }, null, 2),
            mimeType: 'application/json',
          } as any],
        } as any;
      } catch (error: any) {
        return {
          contents: [{
            uri: uri.href,
            text: JSON.stringify({ id, error: error.message }, null, 2),
            mimeType: 'application/json',
          } as any],
        } as any;
      }
    },
  );

  server.registerResource(
    'public-tree',
    'public://tree',
    {
      title: 'Public Tree',
      description: 'Recursive view of the public directory used by Remotion rendering.',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        text: JSON.stringify(buildTree(resolveProjectPath('public')), null, 2),
        mimeType: 'application/json',
      } as any],
    } as any),
  );

  server.registerResource(
    'config-env',
    'config://env',
    {
      title: 'Environment Configuration',
      description: 'Current environment variables with secrets masked.',
    },
    async (uri) => {
      const config = await readEnvConfig(false);
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(config, null, 2),
          mimeType: 'application/json',
        } as any],
      } as any;
    },
  );

  server.registerResource(
    'config-pipeline',
    'config://pipeline',
    {
      title: 'Pipeline Configuration',
      description: 'Derived pipeline settings from the environment.',
    },
    async (uri) => {
      const env = await readEnvConfig(true);
      const config = {
        orientation: env.VIDEO_ORIENTATION || 'portrait',
        voice: env.VIDEO_VOICE || 'en-US-JennyNeural',
        pexelsEnabled: !!env.PEXELS_API_KEY,
        pixabayEnabled: !!env.PIXABAY_API_KEY,
      };

      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(config, null, 2),
          mimeType: 'application/json',
        } as any],
      } as any;
    },
  );
}

