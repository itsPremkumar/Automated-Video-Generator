import * as fs from 'fs';
import * as path from 'path';
import { resolveRuntimePublicPath } from './shared/runtime/paths';

export interface PipelineWorkspace {
  outputId: string;
  publicRoot: string;
  publicNamespace: string;
  workspaceDir: string;
  videosDir: string;
  audioDir: string;
  visualsDir: string;
}

export function sanitizeOutputId(value: string | undefined): string {
  const sanitized = (value || 'video')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

  return sanitized || 'video';
}

function normalizePreferredId(value: string | undefined, fallbackOutputDir: string): string {
  if (!value) {
    return path.basename(path.resolve(fallbackOutputDir));
  }

  const normalized = value.trim().replace(/\\/g, '/');
  const namespaceMatch = /^jobs\/([a-zA-Z0-9_-]+)$/.exec(normalized);
  if (namespaceMatch) {
    return namespaceMatch[1];
  }

  return normalized;
}

export function createPipelineWorkspace(outputDir: string, preferredId?: string): PipelineWorkspace {
  const derivedId = normalizePreferredId(preferredId, outputDir);
  const outputId = sanitizeOutputId(derivedId);
  const publicRoot = resolveRuntimePublicPath();
  const publicNamespace = `jobs/${outputId}`;
  const workspaceDir = resolveRuntimePublicPath('jobs', outputId);

  return {
    outputId,
    publicRoot,
    publicNamespace,
    workspaceDir,
    videosDir: path.join(workspaceDir, 'videos'),
    audioDir: path.join(workspaceDir, 'audio'),
    visualsDir: path.join(workspaceDir, 'visuals'),
  };
}

export function ensurePipelineWorkspace(workspace: PipelineWorkspace): void {
  for (const dir of [workspace.videosDir, workspace.audioDir, workspace.visualsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function resolveAssetWorkspaceDir(assetNamespace: string): string {
  const normalized = assetNamespace.trim().replace(/\\/g, '/');
  const match = /^jobs\/([a-zA-Z0-9_-]+)$/.exec(normalized);

  if (!match) {
    throw new Error(`Invalid asset namespace: ${assetNamespace}`);
  }

  return resolveRuntimePublicPath('jobs', match[1]);
}

export function toPublicRelativePath(absolutePath: string): string {
  const publicRoot = resolveRuntimePublicPath();
  const relativePath = path.relative(publicRoot, absolutePath);

  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Path is outside the public directory: ${absolutePath}`);
  }

  return relativePath.replace(/\\/g, '/');
}
