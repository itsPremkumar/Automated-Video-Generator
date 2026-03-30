import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath } from './runtime';
import { readInputScripts } from './mcp-tools-input';
import { listOutputVideos, readOutputFile } from './mcp-tools-output';
import { readEnvConfig } from './mcp-tools-env';

export function registerResources(server: McpServer) {
  // input://scripts
  server.registerResource(
    "input-scripts",
    new ResourceTemplate("input://scripts", { list: undefined }),
    {
      title: "Current Input Scripts",
      description: "List of all scripts in input/input-scripts.json",
    },
    async (uri) => {
      const scripts = await readInputScripts();
      return {
        contents: [{ uri: uri.href, text: JSON.stringify(scripts, null, 2), mimeType: "application/json" } as any],
      } as any;
    }
  );

  // input://format
  server.registerResource(
    "input-format",
    new ResourceTemplate("input://format", { list: undefined }),
    {
      title: "Input Format Documentation",
      description: "How to format video scripts for the generator",
    },
    async (uri) => {
      const formatPath = resolveProjectPath('input', 'INPUT_FORMAT.md');
      const content = fs.existsSync(formatPath) ? fs.readFileSync(formatPath, 'utf-8') : "Format documentation not found.";
      return {
        contents: [{ uri: uri.href, text: content, mimeType: "text/markdown" } as any],
      } as any;
    }
  );

  // output://videos
  server.registerResource(
    "output-videos",
    new ResourceTemplate("output://videos", { list: undefined }),
    {
      title: "Generated Videos List",
      description: "List of all completed video IDs",
    },
    async (uri) => {
      const videos = await listOutputVideos();
      return {
        contents: [{ uri: uri.href, text: JSON.stringify(videos, null, 2), mimeType: "application/json" } as any],
      } as any;
    }
  );

  // output://video/{id}
  server.registerResource(
    "output-video-detail",
    new ResourceTemplate("output://video/{id}", { list: undefined }),
    {
      title: "Video Detail",
      description: "Detailed scene data and metadata for a specific video ID",
    },
    async (uri, { id }: any) => {
      try {
        const sceneData = await readOutputFile(id, 'scene-data.json');
        return {
          contents: [{ uri: uri.href, text: sceneData as string, mimeType: "application/json" } as any],
        } as any;
      } catch (e: any) {
        return {
          contents: [{ uri: uri.href, text: JSON.stringify({ error: e.message }), mimeType: "application/json" }],
        };
      }
    }
  );

  // public://assets
  server.registerResource(
    "public-assets",
    new ResourceTemplate("public://assets", { list: undefined }),
    {
      title: "Public Assets List",
      description: "List of files in the public directory used for rendering",
    },
    async (uri) => {
      const publicDir = resolveProjectPath('public');
      const scanDir = (dir: string): any => {
        if (!fs.existsSync(dir)) return [];
        const result: any = {};
        const items = fs.readdirSync(dir);
        results: for (const item of items) {
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) {
                result[item] = scanDir(fullPath);
            } else {
                result[item] = "file";
            }
        }
        return result;
      };
      const assets = scanDir(publicDir);
      return {
        contents: [{ uri: uri.href, text: JSON.stringify(assets, null, 2), mimeType: "application/json" } as any],
      } as any;
    }
  );

  // config://env
  server.registerResource(
    "config-env",
    new ResourceTemplate("config://env", { list: undefined }),
    {
      title: "Environment Configuration",
      description: "Current environment variables (masked)",
    },
    async (uri) => {
      const config = await readEnvConfig(false);
      return {
        contents: [{ uri: uri.href, text: JSON.stringify(config, null, 2), mimeType: "application/json" } as any],
      } as any;
    }
  );

  // config://pipeline
  server.registerResource(
    "config-pipeline",
    new ResourceTemplate("config://pipeline", { list: undefined }),
    {
      title: "Pipeline Configuration",
      description: "Default pipeline settings and orientation",
    },
    async (uri) => {
      const env = await readEnvConfig(true);
      const config = {
        orientation: env.VIDEO_ORIENTATION || "portrait",
        voice: env.VIDEO_VOICE || "en-US-JennyNeural",
        pexelsEnabled: !!env.PEXELS_API_KEY,
        pixabayEnabled: !!env.PIXABAY_API_KEY,
      };
      return {
        contents: [{ uri: uri.href, text: JSON.stringify(config, null, 2), mimeType: "application/json" } as any],
      } as any;
    }
  );
}
